# Gig Timer Rewrite Report (Small Diff)

This rewrite follows the issues documented in `architecture-review.md` and keeps changes intentionally narrow: no new framework, no new abstraction layers, and only targeted reliability/architecture fixes.

## What I changed

## 1) Background message routing made explicit
**File:** `background.js`

### Change
- Added an early guard for missing `msg.action`.
- Restricted export execution to only:
  - `action === "export-project-data"`
  - `source === "popup.js"`

### Why
In the original flow, any non-matching message could fall through to export behavior. Explicit action-based handling makes the service worker a predictable message router and prevents accidental side effects.

---

## 2) Popup now uses the correct ID normalizer contract
**File:** `content/popup.js`

### Change
- Replaced `module.normalizeId(...)` with the actual exported function `module.buildProjectIdFromTitleAndEpisode(...)`.
- Guarded export action with optional chaining (`selectedProject?.id`) to avoid null access.
- Removed one dead helper (`roundTo`) and one broken debug line.

### Why
This resolves a core contract mismatch between popup and normalization module, which previously made some save paths unreliable. It also eliminates a crash-prone path when no project is selected.

---

## 3) Stopwatch state model rewritten for single-purpose variables
**File:** `content/stopwatch.js`

### Change
- Reworked state handling so each variable has one meaning:
  - `lastActionAt` (timestamp)
  - `idleSeconds` (seconds accumulated since last user action)
  - `lastStartCallAt` (start throttle timestamp)
- Idle detection now derives from `Date.now() - lastActionAt` and subtracts only active streak (`idleSeconds`) before pause.
- Preserved existing user-facing behavior (resume on activity, autosave every 30s, background message protocol unchanged).

### Why
The previous implementation mixed timestamp and counter semantics in one variable, which is architecturally fragile. This rewrite keeps the same feature set while making the logic deterministic and easier to maintain.

---

## 4) Options form naming aligned to canonical project schema
**File:** `content/options.js`

### Change
- Fixed existing-project lookup to use `workplace_url` (not `workplaceUrl`).
- Fixed assigned-date fallback to use `date_assigned` (not `dateAssigned`).
- Removed unused local project template and simplified object construction.

### Why
The stored project schema is snake_case everywhere else. Aligning to that schema avoids silent mismatches and improves data integrity across background/popup/options flows.

## Resulting architectural improvements
- **Clearer message boundary** in service worker.
- **Consistent cross-module contract** for project IDs.
- **Deterministic stopwatch lifecycle state.**
- **Unified storage schema usage** across extension surfaces.

No new abstractions were introduced; this is a targeted, low-risk rewrite focused on correctness and maintainability.
