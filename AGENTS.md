# Repository Guidelines

## Project Overview

zk-viewer-vscode is a Visual Studio Code extension that provides a lightweight visual client for Apache ZooKeeper. It is licensed under Apache 2.0, and `main` is the stable branch.

## Project Structure & Module Organization

The extension follows the standard VS Code extension layout:

- `src/` — TypeScript source: activation entry point, command handlers, tree views, and the ZooKeeper client wrapper
- `media/` — webview assets (styles and scripts) for panel views
- `test/` — integration tests that run inside the Extension Development Host
- `docs/` — `REQUIREMENTS.md` (requirements) and `design.md` (architecture & design decisions)
- `package.json` — extension manifest: contributions, activation events, commands, and configuration
- `.vscode/` — shared launch and task configuration for debugging

Keep logic in small, single-purpose modules under `src/` (e.g., `src/tree/`, `src/commands/`); avoid large files.

## Build, Test, and Development Commands

- `npm install` — install dependencies
- `npm run compile` — type-check and compile TypeScript
- `npm test` — run integration tests in the Extension Development Host (via `@vscode/test-electron`)
- `npm run test:perf` — run lazy-loading performance assertions (500-child level under 500ms)
- `npm run test:unit:cov` — run unit tests with c8 coverage reporting
- `npm run lint` — run ESLint
- Press `F5` in VS Code — launch the Extension Development Host for manual testing
- `vsce package` — build the installable `.vsix` bundle

## Coding Style & Naming Conventions

- TypeScript with 2-space indentation, semicolons, and single quotes
- `camelCase` for variables and functions, `PascalCase` for classes and types, `kebab-case` for file names
- VS Code commands use the `zkViewer.` prefix, e.g., `zkViewer.refresh`
- Run ESLint and Prettier before committing

## Testing Guidelines

- Integration tests use Mocha through `@vscode/test-electron`
- Group by feature with `describe`, and name cases with `it` describing the expected behavior
- Cover command handlers and tree-view behavior; keep tests independent of live ZooKeeper clusters by mocking the client

## Commit & Pull Request Guidelines

- Use Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`
- One logical change per commit; reference issue numbers in the commit body
- Pull requests must link the related issue, summarize the change and its impact, include screenshots for UI changes, and pass `npm test` and `npm run lint`
