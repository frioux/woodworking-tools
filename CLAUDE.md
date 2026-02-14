# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A picture frame designer — a fully static web application (no bundler, no framework) using vanilla HTML, CSS, and JavaScript (ES modules). Deployed to GitHub Pages. npm is used only for dev tooling; nothing from node_modules ships to the browser.

## Commands

- `npm test` — run all tests (Vitest)
- `npm run test:watch` — run tests in watch mode
- `npx vitest run tests/frame-math.test.js` — run a single test file
- `npm run lint` — ESLint + html-validate on all source files
- `npm run lint:fix` — auto-fix ESLint issues

No build step — the site is served as-is. Open `index.html` or `frame-designer/index.html` directly in a browser.

## Architecture

Three-layer separation in `frame-designer/`:

- **frame-math.js** — Pure calculation functions. No DOM, no side effects. Takes 9 input parameters, returns an object with all derived dimensions (margins, outer dims, miter lengths, rabbet depth). Testable in Node without any DOM.
- **frame-diagrams.js** — SVG rendering functions. DOM-agnostic: accepts a `doc` parameter (browser `document` or happy-dom) so it works in both browser and Node tests. Generates front view, top/side cross-sections, and isometric exploded view.
- **frame-ui.js** — UI orchestration. Wires form inputs to validation → calculation → rendering. Manages URL deep linking (query string state sync) and browser history.

Data flows: `user input → validate (frame-ui) → calculateFrame (frame-math) → render* (frame-diagrams) → DOM + URL update`

## Testing

Tests live in `tests/`. Vitest with happy-dom for DOM simulation in Node.

- `frame-math.test.js` — unit tests for pure calculation functions
- `frame-diagrams.test.js` — integration tests verifying SVG structure and content using happy-dom

## Key Conventions

- All measurements are in inches with fractional formatting (e.g., `formatInches(1.5)` → `"1-1/2"`)
- SVG diagrams use a consistent color palette: frame=#8B6914, glass=#B8D4E3, canvas=#F5EED9, backer=#9E9E9E
- ESLint flat config targets ES2022 with strict equality and const-first rules
- CI runs lint + tests on every push; deploys to gh-pages on main
