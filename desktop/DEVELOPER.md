# EcomLens — Developer Documentation

Internal architecture reference for developers working on this codebase. For the product pitch, see [README.md](README.md).

## Tech stack

- **Electron** (main process in Node, renderer in Chromium) — `main.js` is the entry point.
- **better-sqlite3** — synchronous, native-module SQLite driver. No ORM.
- **Tailwind CSS v4** (CSS-first `@theme`, CLI-compiled — not JIT/live) for styling.
- **No frontend framework.** Renderer pages are plain HTML + vanilla JS ES modules. There is no build step for JS (no bundler/transpiler) — what you write in `src/renderer/*.js` is what runs.
- **electron-builder** for packaging (Windows NSIS installer).

## Process architecture

Standard Electron split, with `contextIsolation: true` and `nodeIntegration: false` (see `main.js`'s `createWindow()`):

- **Main process** (`main.js` + everything under `src/ipc/`, `src/models/`, `src/utils/coreUtils/`): owns the SQLite connection, the filesystem, and native dialogs. Runs in Node, has no DOM.
- **Renderer process** (everything under `src/pages/`, `src/renderer/`, `src/utils/*.utils.js`): the UI. Has no direct Node/filesystem/`fs` access — everything it needs from the main process goes through `preload.js`'s `contextBridge`.
- **`preload.js`** is the *entire* IPC surface exposed to the renderer, as `window.ipc.*`. If a channel isn't listed there, the renderer cannot call it, full stop — this is the first file to check when adding a new main↔renderer capability.

`src/utils/` vs `src/utils/coreUtils/` is a process split, not just a topic split: files directly in `src/utils/` (`auth.utils.js`, `navigation.utils.js`, `notification.utils.js`, `services.utils.js`) are renderer-side and use `document`/`window`. Everything in `src/utils/coreUtils/` is main-process-side and uses `fs`/`path`/`electron.app`. Don't `require()` a `coreUtils` file from renderer code or vice versa — they run in different processes and it will fail (or silently no-op) at runtime, not at edit time.

## Page model: 2 full pages + 4 tabs

There are two *real* pages, loaded via full navigation (`win.loadFile()` / `pageNavigate()` in `navigation.utils.js`, which does a literal `<a href>` click):

- `src/pages/index.html` — login/signup, own `<head>`/scripts.
- `src/pages/dashboard.html` — the app shell: header, sidebar, and an empty `#view` container. Its renderer (`dashboard.renderer.js`) wires up the sidebar buttons and loads `record-scan` into `#view` by default.

Everything else — `record-scan`, `recordings-lib`, `tutorials`, `settings` — is an HTML **fragment** (no `<head>`, no `<html>`) that gets fetched and swapped into `dashboard.html`'s `#view` via `tabNavigate()` in `navigation.utils.js`. These are "tabs," not pages.

### The tab init/destroy pattern (read this before touching any tab renderer)

This is the single most non-obvious thing in the codebase, and getting it wrong reintroduces a real bug that shipped and had to be fixed (stale DOM references / dead event listeners on tab revisit, see git history around the v1.5.0 fixes).

The mechanism: `tabNavigate(page)` fetches `${page}.html`, does `view.innerHTML = html`, and lazily injects `<script type="module" src="../renderer/${page}.renderer.js">` **the first time** that tab is visited (tracked via a `<script id="${page}-renderer-js">` marker so it's never injected twice). On every visit — first or subsequent — it calls `invokeRendererFunctionByName('init', page)`, and before switching away, `invokeRendererFunctionByName('destroy', <the tab you're leaving>)` (both in `services.utils.js`, dispatching through `window[fnName]` via the binding maps in `src/utils/tabBindings.js`).

The consequence: **a tab's `<script type="module">` only ever executes once per app session**, but its HTML is torn down and rebuilt from scratch on every single visit. Any DOM reference or `addEventListener` call made at module top level only applies to the *first* copy of that HTML — by the second visit, `#view`'s children are entirely new elements, and the old listeners are attached to detached nodes doing nothing.

**The pattern every tab renderer (`record-scan`, `recordings-lib`, `settings`, `tutorials`) follows:**

```js
// Module-scope: ONLY state that must survive across tab switches
// (e.g. an open MediaStream, a MediaRecorder instance, confirmed-flags)
let someDomRef; // declared here, assigned inside initX()

function initX() {
    // Re-query every DOM element used by this tab. The elements from
    // the previous visit no longer exist.
    someDomRef = document.getElementById("...")
    // Re-attach every listener. Old listeners are on dead nodes.
    someDomRef.addEventListener("click", handleClick)
    // Any one-time-per-app-load work (e.g. `hasGreeted` flags) should
    // be guarded so it doesn't repeat on every revisit.
}

function destroyX() {
    // Tear down anything that shouldn't keep running once the user
    // navigates away (e.g. record-scan auto-stops an active recording here).
}

initX()                      // covers the very first load (see note below)
window.initX = initX         // covers every subsequent tabNavigate() call
window.destroyX = destroyX
```

The direct `initX()` call at the bottom is required because `tabNavigate()`'s `invokeRendererFunctionByName('init', page)` call fires **before** the just-injected `<script type="module">` has finished executing (module scripts are deferred/async by spec) — so on first visit, `window.initX` doesn't exist yet when the dispatch tries to call it. `services.utils.js` calls it via `window[fnName]?.()` (optional chaining) specifically so that race is a silent no-op instead of a crash, and the direct call at module-bottom is what actually initializes the first visit.

`dashboard` and `index` are **not** part of this system — they're full pages (loaded via `pageNavigate`, never `tabNavigate`), so `src/utils/tabBindings.js`'s binding maps intentionally don't include them.

## IPC surface

Every channel below is defined in `main.js` (`ipcMain.handle`), bridged in `preload.js` (`window.ipc.*`), and (except the two inline `main.js` handlers) implemented in a `src/ipc/*.ipc.js` file backed by `src/models/db.js` or `src/utils/coreUtils/`.

| `window.ipc.*` | Channel | Implementation |
|---|---|---|
| `loginIPC(username, password)` | `login` | `src/ipc/auth.ipc.js` → `dbAPI.auth.login` |
| `signupIPC(username, password, firstName)` | `signup` | `src/ipc/auth.ipc.js` → `dbAPI.auth.signup` — no longer secret-gated, see Licensing below |
| `activateLicenseIPC(key)` | `activate-license` | `src/ipc/license.ipc.js` → calls `ecomlens-api`'s `/api/license/activate`, persists activation state locally on success |
| `getActivationStatusIPC()` | `get-activation-status` | `src/ipc/license.ipc.js` → reads local activation state from `appConfig.coreutils.js` |
| `saveVideoFileIPC(arrayBuffer, filename, barcode, recording_date, user_id)` | `save-video-file` | `src/ipc/saveVideo.ipc.js` → writes the file, then `dbAPI.record.insert` |
| `getAllDataIPC(user_id, limit)` | `get-all-data` | `src/ipc/dbQuery.ipc.js` → `dbAPI.record.getAllDataByUserID` |
| `getTotalCountIPC(user_id, date)` | `get-total-count` | `src/ipc/dbQuery.ipc.js` → `dbAPI.record.getTotalCount(user_id, date)` — `date` is an optional `"YYYY-MM-DD"` prefix filter; used for the Dashboard's live "Today" count |
| `openFileInExplorerIPC(filePath, action)` | `open-file-in-explorer` | `src/ipc/fileIO.ipc.js` — `action` is `'play-video'`, `'open-in-folder'`, or `'open-directory'` |
| `getVideoDirIPC()` | `get-video-dir` | `src/ipc/settings.ipc.js` → `appConfig.coreutils.js` |
| `selectVideoDirIPC()` | `select-video-dir` | `src/ipc/settings.ipc.js` — opens a native folder picker, validates, persists |
| `resetVideoDirIPC()` | `reset-video-dir` | `src/ipc/settings.ipc.js` |
| `getAppVersionIPC()` | `get-app-version` | inline in `main.js` → `app.getVersion()` |
| `quitAppIPC()` | `quit-app` | inline in `main.js` |
| `openExternalIPC(url)` | `open-external` | inline in `main.js` → `shell.openExternal` (used for the support mailto link) |

**Two response envelope conventions coexist** — know which one you're calling before writing `if (response.success)` vs `if (response.status)`:
- `{status, data, msg}` — auth, `getAllDataIPC`, `getTotalCountIPC`.
- `{success, data/path, msg/err}` — file IO, save-video, video-dir handlers.

Left as two conventions deliberately rather than force-unified in one pass: every renderer call site currently depends on knowing which shape it's calling, and a blanket rename risks silently breaking a call site that gets missed. If you're adding a new IPC handler, pick whichever convention matches the domain it's closest to (auth/db-query → `{status,...}`, file/video operations → `{success,...}`) rather than introducing a third shape.

## Licensing / activation

Replaces the old hardcoded admin-secret signup gate. On launch, `index.html` checks `getActivationStatusIPC()` and shows an Activation panel instead of login/signup if the installation hasn't been activated yet. Activation:

1. Customer buys a license via `ecomlens-api`'s Razorpay Invoice flow (see [`../api`](../api)) and receives a `PROMAX-XXXX-XXXX-XXXX-XXXX` key.
2. They enter it in the Activation panel, which calls `activateLicenseIPC(key)` → `src/ipc/license.ipc.js` → `POST {apiBaseUrl}/api/license/activate`.
3. On success, activation state (`activated`, `licenseKey`, `activatedAt`, `lastValidatedAt`) is persisted via `appConfig.coreutils.js` into the same local `config.json` used for the video directory setting.
4. Once activated, local signup/login for individual staff on that machine works freely - no secret needed per-signup anymore, since the gate is now at the installation level.
5. On every app start, `revalidateLicenseIfStale()` (in `license.ipc.js`, called from `main.js`'s `initialiseApp()`) silently re-checks with the server **only if more than 7 days have passed** since the last check, and **only revokes local activation on an explicit rejection from the server** - a network failure/offline machine just skips that cycle. This is deliberate: the app should stay fully usable offline day-to-day after the one-time online activation.

## Database

SQLite via `better-sqlite3`, single file at `getVideoDir()`'s sibling `database/database.db` (see `constants.coreutils.js`). Schema (`src/models/db.js`, created/migrated on every app start in `INITIALIZEDBTABLES`):

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,   -- "salt:hash", see hashPassword()/verifyPassword() (crypto.scryptSync)
    first_name TEXT           -- added via a migration; older DBs get ALTER TABLE'd on startup
)

CREATE TABLE record (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    barcode TEXT NOT NULL,
    filename TEXT NOT NULL,
    path TEXT NOT NULL,
    recording_date TEXT NOT NULL,  -- format "YYYY-MM-DD_HH-MM", chosen so it string-sorts/string-compares correctly
    size TEXT NOT NULL,            -- MB, as a string
    user_id INT REFERENCES users(id)
)
-- indexes on barcode and recording_date
```

`recording_date`'s string format is load-bearing: Recordings Library's date-range search does `recording_date.slice(0, 10) >= dateFrom` string comparisons rather than parsing dates, which only works because the format is zero-padded and lexicographically ordered.

Access goes through three generic wrappers (`INSERTDATA`/`GETDATA`/`GETALLDATA` in `db.js`) that every domain function (`recordAPI.*`, `authAPI.*`) calls into — there's no query builder or ORM, just parameterized SQL strings.

## Directory guide

```
main.js, preload.js          entry points
src/ipc/          main-process IPC handler bodies, one file per domain
src/models/db.js  all SQL, schema, and migrations
src/utils/coreUtils/         main-process utils (paths, config, validation) - NOT renderer-safe
src/utils/*.utils.js         renderer-side utils (nav, auth, notifications, dispatch) - NOT main-process-safe
src/utils/tabBindings.js     renderer init/destroy binding maps for the tab system
src/pages/        HTML: 2 real pages (index, dashboard) + 4 tab fragments
src/renderer/     one JS file per page/tab, paired 1:1 with src/pages/
src/styles/       style.css (Tailwind source + @font-face) → compiled to tailwind.css via `npm run build:css`; styles.css is hand-written extras (e.g. the recording blink animation)
src/assets/       images, self-hosted font woff2s, tutorial videos, the on-screen test-barcode PNG
```

## Build / run / package

```bash
npm install          # postinstall auto-rebuilds better-sqlite3 for Electron's ABI - required, see Known Quirks
npm start             # runs the app via `electron .`
npm run build:css     # recompiles src/styles/tailwind.css - NOT live/JIT, must be re-run after any class changes
npm run build          # packages a Windows NSIS installer via electron-builder (electron-builder.yml)
```

There is no watch-mode dev loop wired up for the renderer beyond `build:css --watch`; a class change needs a CSS rebuild, and a renderer JS change just needs an app restart (no HMR).

## Known quirks worth knowing before you touch things

- **`CONSTANTS.apiBaseUrl` in `constants.coreutils.js` still points at `http://localhost:4000`.** Update this once `ecomlens-api` (see [`../api`](../api)) is actually deployed - the activation flow (and periodic re-validation) will silently fail against localhost otherwise.
- **`better-sqlite3` is a native module.** Every Electron version bump requires `electron-rebuild --only better-sqlite3` (wired as `postinstall`, but if you ever hand-run `npm install` in a way that skips scripts, or bump Electron without reinstalling, you will get a DB-connection crash — this has happened once already in this project's history).
- **Camera init has a concurrency guard.** `navigator.mediaDevices.ondevicechange` firing while `getUserMedia()` is already in flight can hang indefinitely on Windows rather than error. `record-scan.renderer.js` guards this with a `cameraInitInProgress` boolean — don't remove it without understanding why it's there.
- **`recording_date` is a string, not a real timestamp column.** See Database section above — date filtering relies on its exact zero-padded format.
- **macOS is untested.** Two cross-platform-specific fixes exist (native menu bar kept on macOS for Cmd+C/V/Q, the `postinstall` rebuild step) but have only been verified on Windows so far.

## Maintenance cadence

This is not a build-once-runs-forever app — Electron ships an embedded Chromium on a fast release cycle with a short per-version security-support window, so the app will accumulate known Chromium CVEs over time if the Electron dependency is never bumped. The practical risk is lower than a general-purpose browser though, since the app never loads untrusted web content (everything is local `file://` HTML; the only outbound web action is `shell.openExternal` for the support mailto link, which opens the OS's own browser, not Chromium).

You don't need urgent/frequent updates, but plan on bumping Electron roughly once or twice a year as hygiene (plus rebuilding `better-sqlite3` each time — see Known Quirks above), and add auto-update (e.g. `electron-updater`) once there's more than a few machines to keep in sync — there is currently no auto-update mechanism, so every fix means manually rebuilding and redistributing the installer.
