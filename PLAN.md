# Picture Frame Designer - Implementation Plan

## Architecture

**Constraint:** Fully static site — no build step, no bundler, no npm. Just HTML, CSS, and vanilla JS. Deployable directly to GitHub Pages by pointing at the repo root or `/docs`.

### File Structure

```
woodworking-tools/
├── index.html              # Landing page / tool index
├── frame-designer/
│   ├── index.html          # Picture frame designer page
│   ├── style.css           # Styles for the designer
│   ├── frame-math.js       # Pure functions: all geometry/dimension calculations
│   ├── frame-diagrams.js   # SVG rendering: orthographic + isometric projections
│   └── frame-ui.js         # Form handling, input validation, wiring UI to diagrams
```

## Input Parameters

The form collects these values (all dimensions in inches, with sensible defaults):

| Parameter | Description | Default |
|-----------|-------------|---------|
| Canvas width | Full outer width of the artwork/canvas | 16 |
| Canvas height | Full outer height of the artwork/canvas | 20 |
| Image width | Width of the visible image (excluding mat margins) | 10 |
| Top margin | Mat margin above the image | 3 |
| Bottom margin | Mat margin below the image (traditionally larger) | 4 |
| Frame width | Width of the frame molding profile | 1.5 |
| Frame depth | Depth (thickness) of the frame molding | 0.75 |
| Glass depth | Thickness of the glass/acrylic pane | 0.125 |
| Backer depth | Thickness of the backer board | 0.125 |

**Derived values** (calculated, displayed but not editable):
- Left/right margin = (canvas width - image width) / 2
- Rabbet depth = glass depth + canvas/mat depth + backer depth (to verify frame depth accommodates the stack)
- Overall outer dimensions (canvas + frame)
- Miter-cut piece lengths (long edge, short edge — measured at the long point)

## Generated Diagrams (all SVG)

### 1. Front View (orthographic)
- Looking straight at the frame from the front
- Shows: outer frame rectangle, inner frame opening (rabbet), mat opening, image area
- Dimension lines for: overall width, overall height, frame width, mat margins (top, bottom, left, right), image area

### 2. Top/Cross-Section View (orthographic)
- A horizontal cross-section through the middle of the frame
- Shows: frame molding profile (left and right), glass layer, mat/canvas, backer board
- Dimension lines for: frame width, frame depth, glass depth, canvas thickness, backer depth, rabbet depth

### 3. Side/Cross-Section View (orthographic)
- A vertical cross-section through the middle of the frame
- Shows: frame molding profile (top and bottom), glass, mat/canvas, backer
- Dimension lines for: same as top view but oriented vertically, plus top/bottom margin differences

### 4. Isometric (3D) Projection
- Exploded or assembled isometric view showing how the layers stack
- Layers from front to back: frame, glass, mat/canvas, backer
- Uses standard isometric angles (30°) for the 3D projection
- Color-coded layers for clarity

## Rendering Approach

- All diagrams are SVG, generated via DOM manipulation (createElement/setAttribute)
- Each diagram lives in its own `<div>` container and scales responsively
- Use `viewBox` on each SVG so diagrams scale to fit the container
- Dimension lines rendered as SVG lines + text annotations
- Color palette: muted woodworking tones (warm browns for frame, light blue for glass, cream for mat, gray for backer)

## UI / UX

- Single-page layout: form on top (or left on wide screens), diagrams below (or right)
- Inputs update diagrams in real-time on `input` event (no submit button needed)
- Mobile-friendly: stacked layout on narrow viewports, responsive SVG sizing
- A "cut list" summary section showing the computed piece lengths for the frame rails

## Implementation Steps

1. **Scaffold the site** — Create `index.html` (landing page with link to frame designer), `frame-designer/index.html` with the form and diagram containers, `style.css`
2. **Implement `frame-math.js`** — Pure calculation functions: derive margins, overall dimensions, miter lengths, layer stack depths
3. **Implement `frame-diagrams.js`** — SVG generation functions for each of the 4 views
4. **Implement `frame-ui.js`** — Wire form inputs to recalculation + re-render, input validation
5. **Polish** — Responsive layout, color scheme, dimension line readability, mobile testing
