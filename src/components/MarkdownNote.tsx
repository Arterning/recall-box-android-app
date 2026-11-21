import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Annotation, Card } from '../lib/api';

type SourceRange = {
  start: number;
  end: number;
  kind: 'card' | 'annotation';
  annotationId?: number;
  comment?: string;
};

type MarkdownNode = {
  type?: string;
  value?: string;
  children?: MarkdownNode[];
  position?: { start?: { offset?: number }; end?: { offset?: number } };
  data?: { hName?: string; hProperties?: Record<string, unknown> };
};

export type MarkdownHeading = {
  level: number;
  title: string;
  id: string;
};

export type PreviewSelection = {
  start: number;
  end: number;
  excerpt: string;
  sourceText: string;
  x: number;
  y: number;
  right?: number;
  bottom?: number;
};

export function markdownOutline(content: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  let fence = '';
  for (const line of content.split(/\r?\n/)) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1][0];
      else if (fenceMatch[1][0] === fence) fence = '';
      continue;
    }
    if (fence) continue;
    const match = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!match) continue;
    const title = match[2].replace(/\s+#+\s*$/, '').trim();
    if (title) {
      headings.push({
        level: match[1].length,
        title,
        id: `markdown-heading-${headings.length}`,
      });
    }
  }
  return headings;
}

export function MarkdownNote({
  content,
  cards,
  annotations,
  onSelect,
  onAnnotationClick,
  hideAnnotations = false,
}: {
  content: string;
  cards: Card[];
  annotations: Annotation[];
  onSelect: (selection: PreviewSelection | null) => void;
  onAnnotationClick?: (annotationId: number, rect: DOMRect) => void;
  hideAnnotations?: boolean;
}) {
  const ranges: SourceRange[] = [
    ...cards
      .filter((item) => item.anchorValid)
      .map((item) => ({
        start: item.startOffset,
        end: item.endOffset,
        kind: 'card' as const,
      })),
    ...annotations
      .filter((item) => item.anchorValid)
      .map((item) => ({
        start: item.startOffset,
        end: item.endOffset,
        kind: 'annotation' as const,
        annotationId: item.id,
        comment: item.comment,
      })),
  ];

  const captureSelection = () => {
    const current = window.getSelection();
    if (!current || current.isCollapsed || !current.toString().trim() || current.rangeCount === 0) {
      return;
    }
    const range = current.getRangeAt(0);
    const start = locateSourceOffset(range.startContainer, range.startOffset);
    const end = locateSourceOffset(range.endContainer, range.endOffset);
    if (start == null || end == null || end <= start || end > content.length) {
      return;
    }
    const rect = range.getBoundingClientRect();
    onSelect({
      start,
      end,
      excerpt: current.toString(),
      sourceText: content.slice(start, end),
      x: Math.max(16, Math.min(window.innerWidth - 260, rect.left + rect.width / 2 - 110)),
      y: Math.max(12, rect.top - 48),
      right: rect.right,
      bottom: rect.bottom,
    });
  };

  return (
    <div
      className="markdown-preview min-h-full text-[15px] leading-7 text-[#34382d] dark:text-[#d8dcd2]"
      onMouseUp={captureSelection}
      onTouchEnd={() => window.setTimeout(captureSelection, 40)}
      onKeyUp={captureSelection}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, sourceMarkPlugin(ranges) as never]}
        skipHtml
        components={{
          span: ({ node, ...props }) => (
            <span
              {...props}
              data-source-start={sourceProperty(node, 'dataSourceStart')}
              data-source-end={sourceProperty(node, 'dataSourceEnd')}
            />
          ),
          mark: ({ node, ...props }) => {
            const isAnnotation = sourceProperty(node, 'dataMarkKind') === 'annotation';
            const annotationId = sourceProperty(node, 'dataAnnotationId');
            const title = sourceProperty(node, 'title');
            const clickable = isAnnotation && typeof annotationId === 'number' && onAnnotationClick;
            return (
              <mark
                {...props}
                title={clickable ? undefined : typeof title === 'string' ? title : undefined}
                className={
                  isAnnotation
                    ? `annotation-mark${clickable ? ' annotation-clickable' : ''}${hideAnnotations ? ' annotation-hidden' : ''}`
                    : 'card-mark'
                }
                data-source-start={sourceProperty(node, 'dataSourceStart')}
                data-source-end={sourceProperty(node, 'dataSourceEnd')}
                onClick={(event) => {
                  if (clickable && typeof annotationId === 'number') {
                    event.stopPropagation();
                    onAnnotationClick?.(annotationId, event.currentTarget.getBoundingClientRect());
                  }
                }}
              />
            );
          },
        }}
      >
        {content || '*还没有内容，点击「编辑」开始书写。*'}
      </ReactMarkdown>
    </div>
  );
}

function sourceMarkPlugin(ranges: SourceRange[]) {
  return () => (root: MarkdownNode) => {
    assignHeadingIDs(root);
    visit(root, ranges);
  };
}

function assignHeadingIDs(node: MarkdownNode) {
  let index = 0;
  const walk = (current: MarkdownNode) => {
    if (current.type === 'heading') {
      current.data ??= {};
      current.data.hProperties ??= {};
      current.data.hProperties.id = `markdown-heading-${index++}`;
    }
    current.children?.forEach(walk);
  };
  walk(node);
}

function visit(node: MarkdownNode, ranges: SourceRange[]) {
  if (!node.children) return;
  const next: MarkdownNode[] = [];
  for (const child of node.children) {
    const start = child.position?.start?.offset;
    const end = child.position?.end?.offset;
    if (child.type === 'text' && child.value != null && start != null && end != null) {
      next.push(...splitTextNode(child, start, end, ranges));
    } else {
      visit(child, ranges);
      next.push(child);
    }
  }
  node.children = next;
}

function splitTextNode(
  node: MarkdownNode,
  start: number,
  end: number,
  ranges: SourceRange[],
): MarkdownNode[] {
  const text = node.value ?? '';
  const sourceEnd = Math.min(end, start + text.length);
  const points = new Set<number>([start, sourceEnd]);
  for (const range of ranges) {
    if (range.end > start && range.start < sourceEnd) {
      points.add(Math.max(start, range.start));
      points.add(Math.min(sourceEnd, range.end));
    }
  }
  const sorted = [...points].sort((a, b) => a - b);
  const output: MarkdownNode[] = [];
  for (let index = 0; index < sorted.length - 1; index++) {
    const partStart = sorted[index];
    const partEnd = sorted[index + 1];
    if (partEnd <= partStart) continue;
    const mark = ranges.find((range) => partStart >= range.start && partEnd <= range.end);
    const part = text.slice(partStart - start, partEnd - start);
    const data: NonNullable<MarkdownNode['data']> = {
      hName: mark ? 'mark' : 'span',
      hProperties: {
        dataSourceStart: partStart,
        dataSourceEnd: partEnd,
        ...(mark
          ? {
              dataMarkKind: mark.kind,
              ...(mark.annotationId ? { dataAnnotationId: mark.annotationId } : {}),
              ...(mark.comment ? { title: mark.comment } : {}),
            }
          : {}),
      },
    };
    output.push({
      type: 'text',
      value: part,
      position: { start: { offset: partStart }, end: { offset: partEnd } },
      data,
    });
  }
  return output.length ? output : [node];
}

function sourceProperty(node: unknown, key: string): string | number | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const properties = (node as { properties?: Record<string, unknown> }).properties;
  const value = properties?.[key];
  return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}

function locateSourceOffset(container: Node, offset: number): number | null {
  const element =
    container.nodeType === Node.ELEMENT_NODE ? (container as Element) : container.parentElement;
  const sourceElement = element?.closest<HTMLElement>('[data-source-start]');
  const start = Number(sourceElement?.dataset.sourceStart);
  if (!sourceElement || !Number.isFinite(start)) return null;
  if (container.nodeType === Node.TEXT_NODE) return start + offset;
  const range = document.createRange();
  range.selectNodeContents(sourceElement);
  try {
    range.setEnd(container, offset);
    return start + range.toString().length;
  } catch {
    return start;
  }
}
