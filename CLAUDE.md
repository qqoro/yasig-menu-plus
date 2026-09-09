# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Yasig Menu Plus** is an Electron-based desktop application for managing and launching games distributed across multiple folders. Built with Vue 3, TypeScript, and SQLite to provide a unified game library.

## Tech Stack

- **Framework**: Electron 38, Vue 3
- **Language**: TypeScript (ESM)
- **Database**: SQLite (better-sqlite3 + Knex.js)
- **Styling**: Tailwind CSS v4
- **UI Components**: reka-ui, lucide-vue-next, vue-sonner
- **Router**: vue-router 4 (Hash mode)
- **State Management**: Pinia
- **Data Fetching**: @tanstack/vue-query (required)
- **Build Tools**: Vite, electron-builder
- **Package Manager**: pnpm (required)

## Development Environment

```bash
# Install dependencies (pnpm only)
pnpm install

# Run dev server
pnpm dev

# Build
pnpm build          # Windows installer
pnpm build:port     # Windows portable
pnpm build:win      # Windows installer (alias)
pnpm build:port:win # Windows portable (alias)

# Code quality
pnpm lint           # oxlint
pnpm format         # prettier
pnpm type-check     # tsc + vue-tsc

# Testing
pnpm test           # vitest (single run)
pnpm test:watch     # vitest (watch mode)
pnpm test src/main/lib/scan-logic.test.ts  # single test file

# Changelog
pnpm changelog         # git-cliff → CHANGELOG.md (full)
pnpm changelog:latest  # git-cliff → RELEASE_NOTES.md (latest tag only)
```

### Native Module (better-sqlite3)

**No rebuild step exists, and none should be reintroduced.** better-sqlite3 13 is built on the N-API, and ships prebuilt binaries for every platform inside the package itself (`node_modules/better-sqlite3/prebuilds/`). The same `win32-x64.node` loads under both the system Node and Electron, so switching ABIs is neither needed nor possible any more.

The old `scripts/rebuild-native.js` and its `predev` / `pretest` / `pretest:watch` hooks were removed when better-sqlite3 went to 13 — that release also dropped `prebuild-install`, so forcing a rebuild now falls through to a `node-gyp` source build and fails without Visual Studio build tools.

### CI/CD

- **GitHub Actions**: Tag push (`v*`) triggers automated build and release
- Two builds: installer (`yasig-menu-plus-setup-*.exe`) and portable (`yasig-menu-plus-portable-*.exe`)
- Release assets automatically uploaded to GitHub Releases
- Configuration: `.github/workflows/release.yml`

### Prettier Configuration

- `semi`: true
- `trailingComma`: all
- `tabWidth`: 2
- `singleQuote`: false (use double quotes)
- `endOfLine`: auto

### Dev Server Behavior

When running `pnpm dev`:

1. Vite dev server serves renderer process on port 8080
2. TypeScript compiler compiles `src/main` to `build/main`
3. `src/main/static` folder is copied to `build/main/static`
4. Electron runs `build/main/main.js`
5. Electron auto-restarts on `src/main` file changes

### Inspecting the Running App (CDP)

In development only (`NODE_ENV === "development"`), `main.ts` opens the Chrome DevTools Protocol on port 9222 via `app.commandLine.appendSwitch("remote-debugging-port", "9222")`. The switch must be applied **before `app.whenReady()`**, and the guard keeps the port closed in packaged builds.

`.mcp.json` registers a `chrome-devtools-mcp` server pointed at `--browserUrl=http://127.0.0.1:9222`, so the renderer can be inspected from an external tool. **The app must already be running (`pnpm dev`) before the MCP server starts** — there is nothing to attach to otherwise.

## Project Structure

```text
yasig-menu-plus/
├── src/
│   ├── main/              # Electron main process
│   │   ├── main.ts        # App entry point, window creation
│   │   ├── preload.ts     # Preload script (bundled as CJS at build time)
│   │   ├── events.ts      # IPC event type definitions
│   │   ├── store.ts       # electron-store schema & accessors
│   │   ├── constants.ts   # Shared main-process constants
│   │   ├── db/            # Database management
│   │   │   ├── db-manager.ts  # DB init, migrations
│   │   │   ├── db.ts          # Knex instance & types
│   │   │   └── migrations/    # Knex migrations
│   │   ├── handlers/      # IPC handlers
│   │   │   ├── home.ts            # Barrel re-export of home-*.ts modules
│   │   │   ├── home-scan.ts       # Library folder scanning
│   │   │   ├── home-search.ts     # Search/filtering
│   │   │   ├── home-library.ts    # Library path management
│   │   │   ├── home-playtime.ts   # Play time recording
│   │   │   ├── home-game-control.ts # Launch, hide, favorite toggles
│   │   │   ├── gameDetail.ts      # Game detail info
│   │   │   ├── gameUpdate.ts      # Game metadata updates
│   │   │   ├── gameImages.ts      # Game images (carousel) management
│   │   │   ├── collector.ts       # Collector execution
│   │   │   ├── thumbnail.ts       # Thumbnail download/delete
│   │   │   ├── translation.ts     # Title translation
│   │   │   ├── rename.ts          # Metadata-based bulk file rename
│   │   │   ├── duplicates.ts      # Duplicate game detection
│   │   │   ├── dashboard.ts       # Statistics dashboard
│   │   │   ├── cheat.ts           # RPG Maker cheat plugin injection
│   │   │   ├── autoUpdate.ts      # In-app update
│   │   │   ├── changelog.ts       # Release notes
│   │   │   ├── debugExport.ts     # Debug info export
│   │   │   ├── libraryPathOffline.ts / libraryPathVisibility.ts
│   │   │   ├── setting.ts         # Settings load/save
│   │   │   ├── dialog.ts          # Folder/file selection dialogs
│   │   │   └── windows.ts         # Window control
│   │   ├── collectors/    # Game info collection (registry + dlsite/steam/getchu/cien/google)
│   │   ├── services/      # Business logic services
│   │   ├── workers/       # Worker threads (scan-worker: folder scanning)
│   │   ├── cheat/         # Bundled RPG Maker MV/MZ cheat plugin assets
│   │   ├── lib/           # Utility modules
│   │   │   ├── fingerprint.ts     # SHA-256 hash for game identification
│   │   │   ├── scan-logic.ts      # Folder scan & executable detection
│   │   │   ├── search-prefix.ts   # Search filter parsing (tag:, circle:, etc.)
│   │   │   ├── rj-code.ts         # RJ/ST/GC/CE code extraction from folder names
│   │   │   ├── rename-template.ts # Rename template parsing ({title}, {externalId}, ...)
│   │   │   ├── scan-diff.ts       # Diffing scan results against the DB
│   │   │   └── normalize-path.ts  # Path normalization
│   │   ├── utils/         # Cross-cutting utils (logger, downloader, validator, ipc-wrapper, image-path)
│   │   └── static/        # Static files (icons)
│   └── renderer/          # Vue frontend
│       ├── main.ts        # Vue entry point
│       ├── App.vue        # Root component with custom titlebar
│       ├── queryKeys.ts   # Centralized Vue Query cache key definitions
│       ├── router/        # Vue Router configuration
│       ├── views/         # HomeView, SettingsView, DashboardView, DuplicatesView, RenameView, HelpView
│       ├── components/    # Reusable Vue components (shadcn-vue)
│       ├── composables/   # Vue composables (IPC wrappers, state management)
│       ├── stores/        # Pinia stores (uiStore: theme, sidebar, zoom)
│       ├── types/         # Type definitions (api.ts: IPC API types)
│       └── assets/        # Static resources
├── scripts/               # Build scripts (dev-server.js, build.js, license.js)
├── build/                 # Compilation output (gitignore)
├── dist/                  # Final build output (electron-builder)
├── vite.config.js         # Vite config
├── vitest.config.ts       # Vitest config (src/**/*.test.ts)
├── cliff.toml             # git-cliff changelog rules
└── electron-builder.json  # Packaging config
```

## Architecture Core Concepts

### 1. IPC Communication (Main ↔ Renderer)

Type-safe IPC is defined in `src/main/events.ts` with all events and payloads:

- **IpcRendererSend**: Renderer → Main (e.g., `LoadList`, `Play`, `UpdateSetting`)
- **IpcMainSend**: Main → Renderer (e.g., `LoadedList`, `Message`, `ThumbnailDone`)
- **IpcRendererEventMap / IpcMainEventMap**: Payload types for each event

All IPC handlers are in `src/main/handlers/`, dynamically imported in `main.ts`.

**Every `invoke` handler must be wrapped in `wrapIpcHandler(channel, fn)`** (`src/main/utils/ipc-wrapper.ts`) before being passed to `ipcMain.handle`. The wrapper logs the error with its stack trace and re-throws, and warns when a handler takes 3s or more. It deliberately does not log per-call: channels like `detectRpgMaker` fire once per visible game, which would drown the debug level. Domain-level logging belongs in the handler itself.

### 2. Frontend Routing (Vue Router)

- **Hash mode** (`createWebHashHistory`) for Electron compatibility
- Routes defined in `src/renderer/router/index.ts`
- Main routes:
  - `/` → HomeView (game list)
  - `/settings` → SettingsView
  - `/dashboard` → DashboardView (play statistics)
  - `/duplicates` → DuplicatesView (duplicate game detection)
  - `/rename` → RenameView (metadata-based bulk rename)
  - `/help` → HelpView
- Custom titlebar in `App.vue` with page-aware navigation

### 3. Database

- **Knex.js**: Query builder
- **better-sqlite3**: Synchronous SQLite driver
- **Dev env**: `./dev.sqlite3`
- **Production**: `app.getPath('userData')/database.db`
- **Migrations**: Located in `src/main/db/migrations/`, deployed to `build/main/migrations/` in production
- **Column naming**: DB uses snake_case, Knex auto-converts between camelCase (code) and snake_case (DB)

Major tables:

- `games`: Game info (path as PK, title, thumbnail, metadata, status flags)
- `user_game_data`: User-specific data (play time, rating, favorite, memo) — FK from games
- `tags`: Tags
- `gameTags`: Game-tag relation (M:N)
- `makers`: Makers/circles
- `categories`: Categories
- `gameMakers`, `gameCategories`: Game-relation tables (M:N)

**Migration naming**: `YYYYMMDDHHMMSS_description.ts` (e.g., `20250210000000_init.ts`)

**Important**: When using raw SQL methods like `orderByRaw()`, `wrapIdentifier` conversion is bypassed. Use snake_case column names directly in raw SQL strings:

```javascript
// Builder methods - camelCase works (auto-converted)
query.orderBy("createdAt", "desc")

// Raw SQL - must use snake_case
query.orderByRaw("created_at IS NULL, created_at DESC")
```

### 4. Game Info Collection (Collectors)

Collectors in `src/main/collectors/` fetch game info from external sites:

- **registry.ts**: Registers all collectors and runs by priority
- Each collector searches by game title → returns `CollectorResult` (thumbnailUrl, images, title, publishDate, makers, categories, tags, externalId, provider)
- Uses **puppeteer-core** + **chrome-launcher**
- **ID prefix recognition** (`src/main/lib/rj-code.ts`): folder names with `RJ`/`BJ`/`VJ` (DLSite), `ST` (Steam), `GC`/`GETCHU` (Getchu), `CE`/`CIEN` (Ci-en) codes are matched directly to the corresponding collector
- **2-stage fallback strategy**:
  1. Stage 1: Specific collectors run in parallel (DLSite, Steam, Getchu, Ci-en)
  2. Stage 2: If all fail, GoogleCollector runs as fallback (can be disabled via `enableGoogleCollector`)

### 5. Build Process

`pnpm build` runs `tsc --noEmit && node scripts/build.js && electron-builder --win`:

1. `tsc --noEmit`: Type check
2. `node scripts/build.js`:
   - Cleans `build/` directory
   - Vite builds renderer → `build/renderer/`
   - TypeScript compiles main → `build/main/`
   - **Preload is bundled separately as CJS via Vite** (`build/main/preload.js`) — ESM preload fails to load in packaged builds (especially portable)
   - License info generated via `scripts/license.js`
3. `electron-builder`:
   - Packages `build/` folder as ASAR
   - Copies `src/main/static` → app internal `static/`

### 6. Settings Store (electron-store)

- **File location**: `app.getPath('userData')/settings.json`
- **Type-safe**: Schema defined in `src/main/store.ts` (`StoreSchema`)
- **Access functions**: Individual getters/setters for each setting (e.g., `getLibraryPaths()`, `setTranslationSettings()`)
- **Deep merge**: `updateSettings()` performs deep merge for partial updates
- **Library scan history**: `libraryScanHistory` stores scan info per path (lastScannedAt, lastGameCount)
- **Key settings**: `excludedExecutables` (실행 제외 목록), `translationSettings`, `thumbnailSettings` (블러), `autoScanOnStartup`, `scanOnFocus`, `colorTheme`, `scanDepth` (기본 5), `disabledLibraryPaths`, `offlineLibraryPaths`, `enableNonGameContent`, `enableGoogleCollector`, `mediaPlayerSettings`, `lastRenameTemplate`

### 7. Thumbnail Management

- **Storage**: `app.getPath('userData')/thumbnails`
- **Filename**: MD5 hash of game path (e.g., `abc123.jpg`, `abc123_1.jpg` for additional images)
- **Handlers**:
  - `setThumbnailFromUrl`: Download and set thumbnail from URL
  - `setThumbnailFromFile`: Copy local file as thumbnail
  - `hideThumbnail`: Remove thumbnail (deletes file + sets DB to null)
  - `cleanUnusedThumbnails`: Delete thumbnails not referenced in DB
- **Hotlinking protection**: Download requests include Referer header for sites like Getchu

### 8. Vue Query Cache Keys

Centralized query key management in `src/renderer/queryKeys.ts`:

- `queryKeys.games.all` — root key for all game-related queries
- `queryKeys.games.search(...)` — search queries with conditional cache
- `queryKeys.gameDetail(path)` / `queryKeys.gameImages(path)` — game detail/images by path
- `queryKeys.libraryPaths.all` / `disabledLibraryPaths.all` / `offlineLibraryPaths.all` — library path lists
- `queryKeys.excludedExecutables.all` — excluded executables list
- `queryKeys.settings.all` — unified settings
- Always use these keys in composables to ensure consistent cache invalidation

### 9. Renderer IPC Type Safety

`src/renderer/types/api.ts` defines type-safe IPC API:

- `IpcInvokeReturn`: Maps each invoke channel to its return type
- `ElectronApi` interface: Typed preload API (invoke, on, once, removeListener)
- Accessed via `window.electronApi` in renderer process

### 10. Services Layer

`src/main/services/` contains business logic separated from IPC handlers:

- **ProcessMonitor**: Tracks game process lifecycle and records play time
- **AutoUpdater**: Wraps electron-updater for in-app updates
- **ChangelogService**: Fetches release notes from GitHub
- **translator / google-translator / translation-manager**: Title translation pipeline
- **user-game-data**: Maps user game data between DB and application layer
- **cheat-injector**: Injects/restores RPG Maker MV/MZ cheat plugin ([paramonos plugin](https://github.com/paramonos/RPG-Maker-MV-MZ-Cheat-UI-Plugin)) — backs up `main.js` then copies bundled assets from `src/main/cheat/mv|mz`

### 11. Folder Scanning (Worker Thread)

`home-scan.ts` does not walk the filesystem on the main thread — it calls `runScanWorker()` (`src/main/workers/run-scan-worker.ts`), which spawns `scan-worker.ts` in a worker thread so a large library does not block the UI. The worker cannot use the main-process logger (no Electron context), so it logs through `worker-logger.ts` instead. Scan results are then diffed against the DB by `lib/scan-diff.ts`.

### 12. Testing

Tests are colocated (`*.test.ts` next to the module) and run against a **real in-memory SQLite DB**, not a mocked Knex.

- `src/main/db/test-utils.ts` provides `createTestDb()` (better-sqlite3 with `:memory:`), `truncateAll(db)`, and `seedGame` / `seedUserGameData` / `seedMaker` / `seedCategory` / `seedTag` / `seedGame{Maker,Category,Tag}` / `seedGameImage`. It reuses the production `postProcessResponse`/`wrapIdentifier` pair, so the camelCase ↔ snake_case conversion behaves identically to the real DB — including the raw-SQL caveat above.
- `createTestDb()` runs the real migrations from `src/main/db/migrations/` through a custom `VitestMigrationSource`. Knex's default migration loader cannot `require` `.ts` files, so the source uses dynamic `import()` to route them through vitest's transform. **New migrations are automatically covered by every DB test** — a migration that breaks will surface as broad test failures, not one localized one.
- Handler tests mock `electron` with `vi.mock("electron", ...)` (`app.getPath`, `ipcMain.handle`, `shell`) and inject the test DB. Follow the existing pattern in `handlers/dashboard.test.ts`.
- **Tests and the dev server share one better-sqlite3 binary.** Since better-sqlite3 13 is N-API, `pnpm test` and `pnpm dev` can be run in any order without touching the native module. A `NODE_MODULE_VERSION` error should no longer be possible; if one appears, the cause is a stale `node_modules`, not an ABI mismatch — reinstall rather than adding a rebuild step back.
- `pnpm type-check` covers three projects, including `src/main/tsconfig.test.json`; test-only type errors are caught there and nowhere else.

## Coding Conventions

### Language & Comments

- Write all comments in **Korean**
- Commit messages: Korean, no Claude footer
- **Commit messages become changelog content**: Release notes are generated from commit messages via git-cliff, so write subjects in user-friendly terms that end users can understand — describe the visible change (e.g., "검색창에서 폴더 경로로도 검색 가능"), not internal implementation details (component names, refactoring jargon)
- **Changelog skip**: Commits with `changelog-skip` in the body are excluded from changelog generation (`cliff.toml`) — use for internal-only changes users don't need to see

### TypeScript

- **ESM modules**: Use `import/export`, import with `.js` extension
- **Type safety**: Minimize `any`, follow `events.ts` type definitions
- Separate tsconfigs: `src/main/tsconfig.json` (Module: Node16, `noImplicitAny: false`), `src/renderer/tsconfig.json` (Module: ESNext, `strict: true`)
- **Path aliases** (renderer only):
  - `@/*` → `src/renderer/*`
  - `@main/*` → `src/main/*`
  - `@/lib`, `@lib/*` → `src/renderer/lib`
- **Test files**: `src/**/*.test.ts`, `src/**/*.spec.ts` (vitest)

### Vue Components

- **Composition API** (`<script setup>`)
- Use **TypeScript**
- **Tailwind CSS**: Class-based styling
- **Data Fetching**: **Must** use `@tanstack/vue-query` for IPC communication and data fetching
- **Composables Pattern**: IPC communication should be wrapped in composables under `src/renderer/composables/`
  - Core: `useGames`, `useGameDetail`, `useSettings`, `useAllSettings`, `useWindow`, `useTheme`
  - Search: `useSearch`, `useAutocomplete`, `useRandomSelect`
  - Collector: `useCollector`, `useAllInOneRefresh`
  - Media: `useGameImages`, `useCleanThumbnails`, `useConvertImagesToWebp`, `useMigrateThumbnails`
  - Translation: `useTranslation`, `useTranslationSettings`
  - Features: `usePlayTime`, `useDashboard`, `useDuplicates`, `useRename`, `useCheat`, `useChangelog`, `useAutoUpdate`
  - Home UI: `useHomeActions`, `useHomeBatchActions`, `useHomeKeyboard`, `useMultiSelect`, `useGridLayout`
  - Config: `useExcludedExecutables`
  - Use `useQuery` for data fetching, `useMutation` for state-changing operations

### Styling Conventions

- **Layout**: Prefer `flex` + `gap` layout over `padding`/`margin` when possible
- **Rationale**: `gap` provides consistent spacing regardless of child count and prevents `padding`/`margin` collapsing issues
- **Exceptions**: Use `p-*`, `m-*` classes only when necessary (e.g., external component spacing, wrapper element margins)
- **Colors**: Use only shadcn-vue theme colors (`foreground`, `muted-foreground`, `background`, `card`, `primary`, `secondary`, `accent`, `destructive`, etc.)
- **Color Warning**: Do not use hardcoded colors like `text-black`, `bg-white`, `border-gray-500` (use theme variables for dark mode support)

### UI Components (shadcn-vue)

- **Button Component**: Automatic spacing applied when using SVG icons with other elements (`inline-flex` + `gap` CSS)
- **Caution**: Do not add margin classes like `mr-2`, `ml-2` to icons
- **Rationale**: shadcn-vue Button already handles spacing with CSS like `[>&_svg]:not(:last-child):mr-2`, adding margins causes duplicate spacing

### IPC Communication

When adding new events:

1. Define enum and types in `events.ts`
2. Implement handler in `src/main/handlers/`
3. Call from `src/renderer/`

### Work Verification

After completing code changes, verify type correctness:

```bash
pnpm type-check
```

## Important Notes

- **Use pnpm only**: Do not generate package-lock.json (enforced via `packageManager` field in package.json)
- **Type check before build**: Verify with `pnpm type-check`
- **Security**: `webSecurity: false` enabled (external resource loading possible)
- **Pre-commit hook**: Runs `lint-staged` (prettier + oxlint) on staged files via husky
- **Postinstall hook**: Runs `scripts/license.js` after `pnpm install`
- **pnpm settings live in `pnpm-workspace.yaml`**: pnpm 12 no longer reads the `pnpm` field in package.json. Build-script permissions are declared under `allowBuilds` (which replaced `onlyBuiltDependencies` / `ignoredBuiltDependencies`); `overrides` and `minimumReleaseAgeExclude` live there too. Removing this file silently disables native builds
- **Electron Best Practices**: For items not specified in this document, follow [Electron official best practices](https://www.electronjs.org/docs/latest/tutorial/security) and [security guidelines](https://www.electronjs.org/docs/latest/tutorial/security)
