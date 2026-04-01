# AGENTS.md

## Purpose
- This repository is a Wails desktop application named `post-mcp`.
- Backend code lives at the repo root in Go.
- Frontend code lives in `frontend/` and uses React + Vite + Fluent UI.
- Treat this file as the default operating guide for coding agents working in this repo.

## Repo Snapshot
- App bootstrap and window setup: `main.go`
- App lifecycle and store loading/saving: `app.go`
- HTTP debug flow: `http_debug.go`
- MCP discovery, execution, prompts, resources: `mcp_debug.go`
- Shared data models and defaults: `models.go`
- JSON file helpers and atomic persistence: `store.go`
- Main frontend shell: `frontend/src/App.jsx`
- Frontend helpers: `frontend/src/lib/*.js`

## Tooling Source Of Truth
- Go toolchain version is declared in `go.mod` as `go 1.25.0`.
- Wails config is in `wails.json`.
- Frontend package manager is `pnpm`.
- Frontend scripts are defined in `frontend/package.json`.

## Cursor / Copilot Rules
- No repo-level Cursor rules were found in `.cursor/rules/`.
- No `.cursorrules` file was found.
- No Copilot instructions were found in `.github/copilot-instructions.md`.
- Follow this `AGENTS.md` unless the user provides newer task-specific constraints.

## Core Commands
- Install frontend deps: `pnpm --dir frontend install`
- Run frontend dev server only: `pnpm --dir frontend dev`
- Build frontend only: `pnpm --dir frontend build`
- Preview frontend build: `pnpm --dir frontend preview`
- Run Wails in dev mode: `wails dev`
- Build the desktop app: `wails build`
- Run all backend tests: `go test ./...`

## Single-Test Commands
- Run a single backend test in the current package: `go test . -run TestName -count=1`
- Run a single backend test across packages: `go test ./... -run TestName -count=1`
- Run a single backend test with verbose output: `go test ./... -run TestName -v -count=1`
- Run a single subtest: `go test ./... -run 'TestName/Subcase' -count=1`
- There is currently no frontend test runner configured in `frontend/package.json`.
- If frontend tests are added later, document the exact single-test command here.

## Lint / Format Reality
- There is no dedicated lint script configured for Go or frontend code.
- There is no ESLint, Prettier, or frontend formatter config checked in.
- Use language-native formatting and existing file style instead of inventing new rules.
- Format edited Go files with `gofmt -w <files>`.
- Prefer `gofmt` for import cleanup; use `goimports` only if it is already available locally.
- Preserve the formatting style already used in touched frontend files.

## Required Validation
- After every code change, run `wails build` from the repo root.
- This is a repo-specific requirement and should be treated as mandatory.
- If the task only touches frontend code, you may also run `pnpm --dir frontend build`, but do not skip `wails build`.
- If `wails build` fails, report the failure clearly and include the relevant error summary.
- Exception: if the user explicitly asks to skip builds because they are running `wails dev` with hot reload, do not run `wails build`.
- In that exception mode, prefer quick iteration and report that validation was skipped by user request.

## Build Notes
- `wails build` already performs frontend install/build through `wails.json`.
- Wails config currently uses:
- `frontend:install = pnpm install`
- `frontend:build = pnpm build`
- `frontend:dev:watcher = pnpm dev`
- Windows build output is `build/bin/post-mcp.exe`.

## Architecture Notes
- App state is persisted as JSON files under the user config directory, not inside the repo.
- Data directory setup happens in `App.ensureDataDir()`.
- Bootstrap loading is centralized in `LoadBootstrapData()`.
- Backend methods often return frontend-shaped view models rather than thin transport wrappers.
- Frontend state is centralized in `frontend/src/App.jsx`.
- Wails bindings are accessed through `window.go.main.App`, wrapped by `frontend/src/lib/backend.js`.
- Collection, workspace, MCP server, history, and settings defaults must stay aligned across Go and frontend defaults.

## Go Style Guidelines
- Keep package name as `main`; this repo is a single desktop app, not a library.
- Use tabs and standard `gofmt` layout.
- Do not manually align code or imports.
- Group imports as standard library first, blank line, then third-party packages.
- Prefer small helper functions for parsing, normalization, persistence, and repeated branching.
- Prefer explicit structs over loose maps except for dynamic MCP JSON payloads.
- Use `any` only where schema-less or dynamic JSON truly requires it.
- Keep functions focused and near related logic when practical.

## Go Naming Conventions
- Exported identifiers use PascalCase.
- Unexported helpers use camelCase.
- Preserve existing acronym casing: `ID`, `URL`, `URI`, `JSON`, `HTTP`, `MCP`.
- Result structs should be operation-oriented, for example `MCPCallResult` or `MCPServerTestResult`.
- Boolean names should read like flags or predicates, for example `disabled`, `busy`, `loading`, `isError`.

## Go Error Handling
- Return wrapped errors with context via `fmt.Errorf("context: %w", err)`.
- Preserve low-level details instead of replacing them with vague messages.
- Use result objects with `Error` fields only when that pattern already exists for the operation.
- Follow existing soft-failure patterns in methods like `ExecuteHTTP`, `ExecuteMCPTool`, and `DiscoverMCPServer`.
- Do not panic for normal runtime failures.
- Ignore cleanup errors only where the codebase already treats them as best effort.

## Go Persistence Conventions
- Update `Version` and `UpdatedAt` before saving stores.
- Use `writeJSONAtomic` for persistence instead of direct writes.
- Use `read*Store` helpers so defaults remain intact when files are missing or partial.
- Keep JSON struct tags in lower camelCase to match the frontend contract.
- When adding shared fields, update both Go models and frontend default factories.

## Frontend Style Guidelines
- Use ES modules and React function components.
- Keep import order consistent: React first, UI library imports next, local CSS, then local modules.
- Keep one import block per module source.
- Use single quotes and avoid semicolons, matching the existing codebase.
- Prefer `const`; use `let` only when reassignment is required.
- Component names use PascalCase; helpers, handlers, and setters use camelCase.
- Reuse existing helpers such as `ensureTrailingBlankPair`, `parseJson`, and `prettyJson` before adding new utilities.

## Frontend State And UI Conventions
- `frontend/src/App.jsx` is intentionally large and state-heavy; avoid broad refactors unless requested.
- Prefer updating tab state through existing helpers like `patchActiveTab`, `updateNested`, `setWorkspace`, and `setCollections`.
- Follow Fluent UI primitives already in use instead of introducing another UI library.
- Preserve Chinese UI copy unless the task explicitly asks for language changes.
- Keep desktop-first layout behavior consistent with current Wails window sizing.
- When adding dialogs, context menus, or transient UI state, follow the existing modal/state patterns already used in `App.jsx`.

## Frontend Error Handling
- Surface backend bridge failures through UI state such as `statusMessage`, `loadError`, or a dialog.
- Prefer guarded async flows with `try/catch/finally` when toggling loading or busy state.
- Use `String(error?.message || error)` when matching the current frontend error-display pattern.
- Do not swallow errors silently unless the code already treats the call as best effort persistence.

## Editing Guidance
- Make the smallest coherent change that fits the existing architecture.
- Avoid broad refactors unless the user asks for them.
- Do not add new dependencies unless clearly necessary.
- Do not add comments unless a block is genuinely non-obvious.
- Preserve ASCII unless a touched file already uses non-ASCII content; Chinese UI strings are already present and should remain as-is.
- If you add new persisted fields, update normalization logic in the frontend and store/default logic in the backend.

## Before Finishing A Task
- Re-read touched files for consistency with surrounding code.
- Run `gofmt -w` on changed Go files.
- Run `wails build` from the repo root.
- Mention warnings, skipped validation, or missing test coverage in the final report.
- If the user has explicitly enabled the `wails dev` hot-reload workflow and asked to skip builds, do not run `wails build`; mention this in the final report.
