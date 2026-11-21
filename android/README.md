# Recall Box Android (Kotlin + Jetpack Compose + SQLite)

Native Android implementation of `Arterning/recall-box` with 100% SQLite (`recall-box.db`) schema & FSRS-6 state compatibility.

## Features
- **Notes (`NotesScreen`)**: Local Markdown notes, tags, search, text-selection highlight / annotation / cloze card creation, hide-highlights self-test toggle, UTF-16 anchor re-anchoring on edit.
- **Today's Review (`ReviewScreen`)**: Due cards queue, optional typed recall response, reveal reference answer, FSRS-6 scheduler (`go-fsrs/v4` JSON compatible) with 4 ratings (Again / Hard / Good / Easy) and next-interval previews.
- **Cards Library (`CardsScreen`)**: Searchable/sortable cards list, standalone card creation, soft-delete.
- **Learning Diary (`DiaryScreen`)**: Monthly calendar with entry dots, daily Markdown journal (`YYYY-MM-DD`).
- **Statistics & Sync (`StatsSettingsScreen`)**: 30-day review chart, `desiredRetention` slider (70%–97%), and Storage Access Framework (SAF) import/export of `recall-box.db`.

## Build & Sync Data
1. Open this directory in **Android Studio Ladybug (or newer)** with JDK 17+.
2. Build & run on an Android 8.0+ (API 26+) device or emulator.
3. In **统计与同步 → 导入 .db**, pick a `recall-box.db` exported from the desktop `Arterning/recall-box` app or this web studio; or tap **导出 .db** to move your Android data back to desktop.
