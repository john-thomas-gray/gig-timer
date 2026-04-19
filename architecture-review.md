# Gig Timer Architecture Review

## 1) How the extension currently works

### Runtime model
- This is a Chrome extension (Manifest V3) with a background service worker (`background.js`), several content scripts, an options page, and a popup page.
- `manifest.json` injects content scripts into Pixelogic domains and exposes bridge/normalization scripts as web-accessible resources.

### Main data flow
1. **Navigation detection (background service worker)**
   - `chrome.webNavigation.onCompleted` debounces per tab.
   - If URL matches assignment page, background asks `content/assignments.js` for W2UI snapshot data.
   - If URL matches workplace page, background asks `content/workplace.js` for current workplace identifier.
2. **Project creation/update**
   - Background normalizes incoming project data and stores it in `chrome.storage.sync.projects`.
   - Project records are upserted by `id`.
3. **Stopwatch lifecycle**
   - On workplace load, background sends `init-stopwatch`.
   - `content/stopwatch.js` starts a 1-second loop, increments elapsed time, and periodically persists elapsed seconds via runtime messages.
4. **Popup editing/export**
   - `content/popup.js` requests all stored projects, renders fields dynamically, allows manual update, and triggers export.
5. **Options**
   - `content/options.js` stores assignment/workplace URL settings and Sheets settings in sync storage.

### Module responsibilities
- `background.js`: orchestration, storage read/write, assignment parsing, message routing, stopwatch triggering, exporting.
- `web-accessible-resources/normalization.js`: parsing IDs, date/duration/money normalization, derived field calculations.
- `content/*.js`: UI and DOM-specific behavior.
- `exporters/sheetsExporter.js`: export integration.

## 2) Naive architecture and design choices

1. **Message routing in background is overly permissive**
   - Current listener has several `if` branches then unconditional fallthrough to export, so unrelated messages can accidentally trigger export logic.

2. **Cross-module contract mismatch**
   - `popup.js` calls `module.normalizeId(...)`, but normalization module exports `buildProjectIdFromTitleAndEpisode(...)` instead. This can break updates for new/manual projects.

3. **Stopwatch state model mixes units and meanings**
   - In `stopwatch.js`, `timeSinceLastAction` is used both as elapsed seconds and as a timestamp comparison target in throttle logic. This is fragile and hard to reason about.

4. **Options data model inconsistencies**
   - `options.js` mixes `workplaceUrl` vs `workplace_url` and `dateAssigned` vs `date_assigned`. This can silently skip intended values.

5. **Dead/duplicated code and low cohesion**
   - Duplicate formatter logic exists in popup/util files.
   - Unused local `projectTemplate` in options and commented-out blocks increase maintenance burden.

6. **Minimal boundary validation**
   - Some parser/normalizer paths assume shape correctness (e.g., date parsing and id element existence), making runtime behavior brittle when source DOM/data changes.

## 3) Recommended direction (small-diff, no major abstractions)

- Make message handling explicit and action-based in `background.js`.
- Fix popup normalization API usage and guard export action.
- Rewrite stopwatch state variables to single-purpose fields while preserving behavior.
- Align options field naming with canonical storage keys (`snake_case`) and remove misleading unused structures.
- Keep existing file structure and avoid introducing new architecture layers for now.
