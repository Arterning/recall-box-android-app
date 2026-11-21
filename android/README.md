# Recall Box Android (Kotlin + Jetpack Compose + SQLite)

Native Android implementation of `Arterning/recall-box` with 100% SQLite (`recall-box.db`) schema & FSRS-6 state compatibility.

## Features
- **Notes (`NotesScreen`)**: Local Markdown notes, tags, search, text-selection highlight / annotation / cloze card creation, hide-highlights self-test toggle, UTF-16 anchor re-anchoring on edit.
- **Today's Review (`ReviewScreen`)**: Due cards queue, optional typed recall response, reveal reference answer, FSRS-6 scheduler (`go-fsrs/v4` JSON compatible) with 4 ratings (Again / Hard / Good / Easy) and next-interval previews.
- **Cards Library (`CardsScreen`)**: Searchable/sortable cards list, standalone card creation, soft-delete.
- **Learning Diary (`DiaryScreen`)**: Monthly calendar with entry dots, daily Markdown journal (`YYYY-MM-DD`).
- **Statistics & Sync (`StatsSettingsScreen`)**: 30-day review chart, `desiredRetention` slider (70%–97%), and Storage Access Framework (SAF) import/export of `recall-box.db`.

## Build & Sync Data
### Build an APK with GitHub Actions (no local Android Studio required)
1. Push this repository to GitHub.
2. Open **Actions → Android APK** and run the workflow manually, or push a change under `android/`.
3. Open the completed workflow run and download the `recall-box-debug-apk` artifact.
4. Transfer `app-debug.apk` to an Android 8.0+ (API 26+) device and install it. You may need to allow installation from your file manager or browser.

The workflow builds a debug APK, which is signed automatically for device testing. The artifact is retained for 14 days. This repository does not include a Gradle Wrapper; the workflow installs Gradle 8.9 on GitHub's runner.

### Build locally (optional)
1. Open this directory in **Android Studio Ladybug (or newer)** with JDK 17+.
2. Build & run on an Android 8.0+ (API 26+) device or emulator.
3. In **统计与同步 → 导入 .db**, pick a `recall-box.db` exported from the desktop `Arterning/recall-box` app or this web studio; or tap **导出 .db** to move your Android data back to desktop.
