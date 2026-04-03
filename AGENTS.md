# AGENTS.md

## Purpose
- This is a Wails desktop app (`post-mcp`) with a Go backend and React frontend.
- This guide is for coding agents operating in this repository.
- Follow repository conventions first, then this document.

## Repository Layout
- Backend entry: `main.go`
- App lifecycle and bridge methods: `app.go`
- Workspace management and Git integration: `workspace_manager.go`, `workspace_git.go`
- HTTP execution flow: `http_debug.go`
- MCP execution/discovery flow: `mcp_debug.go`
- Data models/defaults: `models.go`
- Persistent store I/O helpers: `store.go`
- Frontend root: `frontend/src/App.jsx`
- Frontend utilities: `frontend/src/lib/*.js`

## Tooling Source Of Truth
- Go version: `go 1.25.0` (`go.mod`)
- Wails config: `wails.json`
- Frontend package manager: `pnpm`
- Frontend scripts: `frontend/package.json`

## Cursor / Copilot Rules
- Checked `.cursor/rules/`: no files found.
- Checked `.cursorrules`: not present.
- Checked `.github/copilot-instructions.md`: not present.
- If any of these are added later, treat them as higher-priority instructions than this file.

## Build / Run Commands
- Install frontend dependencies: `pnpm --dir frontend install`
- Run frontend dev server: `pnpm --dir frontend dev`
- Build frontend: `pnpm --dir frontend build`
- Preview frontend build: `pnpm --dir frontend preview`
- Run Wails desktop in dev mode: `wails dev`
- Build desktop application: `wails build`
- Run backend tests: `go test ./...`

## Test Commands (Including Single Test)
- Run all tests: `go test ./...`
- Run tests for current package only: `go test .`
- Run one named test in current package: `go test . -run TestName -count=1`
- Run one named test across all packages: `go test ./... -run TestName -count=1`
- Run one subtest: `go test ./... -run 'TestName/Subcase' -count=1`
- Run one test with verbose logs: `go test ./... -run TestName -v -count=1`
- Disable cache while iterating: keep `-count=1`
- Race detection (optional, slower): `go test ./... -race`
- Coverage snapshot (optional): `go test ./... -cover`
- Current repo status: no committed `*_test.go` files yet.

## Lint / Format Reality
- No dedicated lint script exists in root or frontend scripts.
- No repo ESLint/Prettier config is checked in.
- Required for Go edits: `gofmt -w <changed-go-files>`
- Optional if available: `goimports -w <changed-go-files>` (do not require it)
- Keep frontend formatting aligned with existing file style.

## Validation Policy
- Backend-only change: usually run `go test ./...`
- Frontend-only change: usually run `pnpm --dir frontend build`
- Cross-layer or release-sensitive change: run both, optionally `wails build`
- Do not run expensive full builds for tiny edits unless needed.
- If you skip validation, state what was skipped and why.

## Wails Build Notes
- `wails.json` drives frontend tasks during desktop build.
- `frontend:install = pnpm install`
- `frontend:build = pnpm build`
- `frontend:dev:watcher = pnpm dev`
- Windows artifact path: `build/bin/post-mcp.exe`

## Architecture Notes
- App data is persisted in user config directories (not in repo workspace).
- Multi-workspace runtime data is managed under `workspace-runtime`.
- Legacy `data` directory is treated as migration source; do not rely on it for new writes.
- Default workspace is intentionally read-only at management level.
- Backend bridge methods are exposed on `window.go.main.App`.
- Frontend calls backend via `frontend/src/lib/backend.js`.

## Go Style Rules
- Keep package as `main` (app binary project).
- Always use `gofmt` formatting.
- Import groups: standard library, blank line, third-party.
- Prefer small helpers for parsing/mapping/persistence branches.
- Prefer structs over `map[string]any` unless payload is truly schema-less.
- Keep JSON struct tags in `lowerCamelCase` for frontend compatibility.

## Go Naming Conventions
- Exported names: `PascalCase`
- Internal names: `camelCase`
- Acronyms: use `ID`, `URL`, `URI`, `JSON`, `HTTP`, `MCP`
- Operation result types should be intention-revealing (`WorkspacePushPreview`, `MCPCallResult`).
- Booleans should read naturally (`isError`, `readOnly`, `gitEnabled`).

## Go Error Handling Conventions
- Wrap errors with context: `fmt.Errorf("context: %w", err)`
- Return actionable messages for shell/Git failures.
- Avoid panics in normal flows.
- Respect existing “soft error in result object” patterns where already used.
- Cleanup errors may be ignored only when explicitly best-effort.

## Go Persistence Conventions
- Before saving stores, set `Version` and `UpdatedAt`.
- Use `writeJSONAtomic` for JSON persistence.
- Use `read*Store` helpers to preserve defaulting/backward compatibility.
- Keep backend defaults and frontend defaults synchronized when fields change.
- For workspace metadata changes, update both manager store and workspace `setting.json`.

## Frontend Style Rules
- Use function components and hooks.
- Match current style: single quotes, no semicolons.
- Prefer `const`; use `let` only for reassignment.
- Component names: `PascalCase`; handlers/helpers: `camelCase`.
- Reuse existing utility helpers before adding new ones.

## Frontend UI / State Conventions
- `frontend/src/App.jsx` is intentionally central/stateful; avoid broad rewrites.
- Follow existing patterns for dialogs, toasts, context menus, and optimistic state.
- Preserve existing Chinese product copy unless task asks to change language.
- Keep desktop constraints in mind (Wails window, dense layouts).
- For workspace UX, respect:
  - default workspace cannot be edited/deleted,
  - Git actions gated by Git integration toggle,
  - workspace switch should refresh backend-backed bootstrap data.

## Frontend Error Handling
- Backend calls should use `try/catch` with user-visible feedback.
- Use existing message style: `String(error?.message || error)`.
- Do not silently swallow failures unless explicitly non-critical.
- Keep loading/busy flags consistent in async flows.

## Editing Rules For Agents
- Make minimal, targeted changes.
- Do not refactor unrelated areas unless requested.
- Avoid adding dependencies unless necessary.
- Add comments only for non-obvious logic.
- Preserve ASCII by default unless file already uses Unicode text.

## Pre-Handoff Checklist
- Re-read changed files for consistency.
- Run `gofmt -w` on touched Go files.
- Run appropriate validation commands for the change scope.
- Summarize:
  - what changed,
  - what was validated,
  - what remains unvalidated or risky.
