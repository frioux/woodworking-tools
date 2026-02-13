# Picture Frame Designer - Implementation Plan

## Architecture

**Constraint:** Fully static site — no bundler, no framework. Just HTML, CSS, and vanilla JS. Deployable directly to GitHub Pages. npm is used only for dev tooling (linting, testing) — none of it ships to the browser.

### File Structure

```
woodworking-tools/
├── index.html                    # Landing page / tool index
├── frame-designer/
│   ├── index.html                # Picture frame designer page
│   ├── style.css                 # Styles for the designer
│   ├── frame-math.js             # Pure functions: all geometry/dimension calculations
│   ├── frame-diagrams.js         # SVG rendering: orthographic + isometric projections
│   └── frame-ui.js               # Form handling, input validation, wiring UI to diagrams
├── tests/
│   ├── frame-math.test.js        # Unit tests for calculation functions
│   └── frame-diagrams.test.js    # Tests that SVG generation produces valid output
├── package.json                  # Dev dependencies only (eslint, vitest, etc.)
├── eslint.config.js              # ESLint flat config
└── .github/
    └── workflows/
        └── ci.yml                # Lint + test + merge to gh-pages
```

## Input Parameters

The form collects these values (all dimensions in inches, with sensible defaults):

| Parameter | Description | Default |
|-----------|-------------|---------|
| Canvas width | Full outer width of the artwork/canvas | 16 |
| Canvas height | Full outer height of the artwork/canvas | 20 |
| Frame width | Width of the frame molding profile | 1.5 |
| Frame depth | Depth (thickness) of the frame molding | 0.75 |
| Glass depth | Thickness of the glass/acrylic pane | 0.125 |
| Backer depth | Thickness of the backer board | 0.125 |

**Derived values** (calculated, displayed but not editable):
- Rabbet depth = glass depth + backer depth + 1/16" (extra clearance for framing nails)
- Overall outer width = canvas width + 2 × frame width
- Overall outer height = canvas height + 2 × frame width
- Miter-cut piece lengths (long edge, short edge — measured at the long point)

## Generated Diagrams (all SVG)

### 1. Front View (orthographic)
- Looking straight at the frame from the front
- Shows: outer frame rectangle, inner frame opening (rabbet), canvas area
- Dimension lines for: overall width, overall height, frame width, canvas dimensions

### 2. Top/Cross-Section View (orthographic)
- A horizontal cross-section through the middle of the frame
- Shows: frame molding profile (left and right), glass layer, canvas, backer board
- Dimension lines for: frame width, frame depth, glass depth, canvas thickness, backer depth, rabbet depth

### 3. Side/Cross-Section View (orthographic)
- A vertical cross-section through the middle of the frame
- Shows: frame molding profile (top and bottom), glass, canvas, backer
- Dimension lines for: same as top view but oriented vertically

### 4. Isometric (3D) Projection
- Exploded or assembled isometric view showing how the layers stack
- Layers from front to back: frame, glass, canvas, backer
- Uses standard isometric angles (30°) for the 3D projection
- Color-coded layers for clarity

## Rendering Approach

- All diagrams are SVG, generated via DOM manipulation (createElement/setAttribute)
- Each diagram lives in its own `<div>` container and scales responsively
- Use `viewBox` on each SVG so diagrams scale to fit the container
- Dimension lines rendered as SVG lines + text annotations
- Color palette: muted woodworking tones (warm browns for frame, light blue for glass, cream for canvas, gray for backer)

## UI / UX

- Single-page layout: form on top (or left on wide screens), diagrams below (or right)
- Inputs update diagrams in real-time on `input` event (no submit button needed)
- Mobile-friendly: stacked layout on narrow viewports, responsive SVG sizing
- A "cut list" summary section showing the computed piece lengths for the frame rails

## Testing & Linting

### Unit Tests (Vitest)

Vitest runs the tests in a Node environment. The source JS files use plain functions that work in both browser and Node (via ESM imports).

**`frame-math.test.js`** — exercises every calculation function:
- Rabbet depth = glass + backer + 1/16"
- Outer dimensions = canvas dims + 2 × frame width
- Miter-cut lengths (long point = outer dimension, short point = outer dimension - 2 × frame width)
- Edge cases: very small dimensions

**`frame-diagrams.test.js`** — verifies SVG output:
- Each diagram function returns valid SVG (well-formed XML via linkedom or happy-dom)
- SVGs contain expected structural elements (rects, lines, text labels)
- Dimension lines are present and labeled
- Changing input parameters changes the output SVG

### Linting (ESLint)

- ESLint with flat config (`eslint.config.js`)
- Targets the source JS under `frame-designer/` and `tests/`
- Standard modern JS rules — no unused vars, consistent style, etc.

### HTML Validation

- Use `html-validate` to check all `.html` files for structural correctness and accessibility basics

### CI Pipeline (GitHub Actions)

**`.github/workflows/ci.yml`:**

```
on: push

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - Checkout code
      - Setup Node 22
      - npm ci
      - npm run lint        (eslint + html-validate)
      - npm run test        (vitest)
      - If on main or a PR merges: deploy to gh-pages branch
```

The gh-pages deployment step copies only the site files (index.html, frame-designer/) to the gh-pages branch — no node_modules, no tests, no config files.

## Implementation Steps

1. **Scaffold the site** — Create `index.html` (landing page with link to frame designer), `frame-designer/index.html` with the form and diagram containers, `style.css`
2. **Implement `frame-math.js`** — Pure calculation functions: derive overall dimensions, miter lengths, layer stack depths
3. **Write `frame-math.test.js`** — Unit tests for all calculation functions
4. **Implement `frame-diagrams.js`** — SVG generation functions for each of the 4 views
5. **Write `frame-diagrams.test.js`** — Tests verifying valid SVG structure and correct elements
6. **Implement `frame-ui.js`** — Wire form inputs to recalculation + re-render, input validation
7. **Set up dev tooling** — `package.json`, `eslint.config.js`, html-validate config
8. **Set up CI** — `.github/workflows/ci.yml` with lint, test, and gh-pages deploy
9. **Polish** — Responsive layout, color scheme, dimension line readability, fix any lint/test failures
