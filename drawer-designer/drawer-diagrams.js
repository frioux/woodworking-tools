/**
 * SVG diagram generation for dovetailed drawer views.
 * Works in both browser (document) and Node (with happy-dom).
 *
 * Coordinate convention for the orthographic views: SVG y increases
 * downward, so the drawer "bottom" is at the largest y.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

const COLORS = {
  front: '#8B6914',       // primary stock (drawer front)
  frontDark: '#6B4F12',
  frontHi: '#A77D1C',
  secondary: '#A0845E',   // secondary stock (sides & back)
  secondaryDark: '#7A6444',
  bottom: '#C9B07A',      // bottom panel (plywood / resawn)
  bottomDark: '#A88E58',
  groove: '#5C3D2E',      // groove / hidden lines
  dimension: '#444444',
  dimLine: '#727272',
  bg: '#fffdfb'
};

const SCALE = 4; // SVG units per inch

/* ------------------------------------------------------------------ */
/*  SVG helpers                                                        */
/* ------------------------------------------------------------------ */

function svgEl(doc, tag, attrs = {}) {
  const el = doc.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  return el;
}

function rect(doc, x, y, w, h, fill, stroke, sw = 0.5, dash) {
  const attrs = { x, y, width: w, height: h, fill, stroke, 'stroke-width': sw };
  if (dash) {
    attrs['stroke-dasharray'] = dash;
  }
  return svgEl(doc, 'rect', attrs);
}

function line(doc, x1, y1, x2, y2, stroke, sw = 0.4, dash) {
  const attrs = { x1, y1, x2, y2, stroke, 'stroke-width': sw, 'stroke-linecap': 'round' };
  if (dash) {
    attrs['stroke-dasharray'] = dash;
  }
  return svgEl(doc, 'line', attrs);
}

/** Darken (or lighten) a #rrggbb hex color by a multiplicative factor. */
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/** Horizontal dimension line with a centered label. */
function hDimension(doc, x1, x2, y, label, above = true) {
  const g = svgEl(doc, 'g', { class: 'dim' });
  const offset = above ? -8 : 8;
  const tickDir = above ? 1 : -1;
  const lineY = y + offset;
  const arrowLen = 2.5;
  const arrowHalf = 1.25;

  g.appendChild(line(doc, x1, lineY, x2, lineY, COLORS.dimLine, 0.45));
  g.appendChild(svgEl(doc, 'polygon', {
    points: `${x1},${lineY} ${x1 + arrowLen},${lineY - arrowHalf} ${x1 + arrowLen},${lineY + arrowHalf}`,
    fill: COLORS.dimLine
  }));
  g.appendChild(svgEl(doc, 'polygon', {
    points: `${x2},${lineY} ${x2 - arrowLen},${lineY - arrowHalf} ${x2 - arrowLen},${lineY + arrowHalf}`,
    fill: COLORS.dimLine
  }));
  g.appendChild(line(doc, x1, y, x1, y + offset - tickDir * 3, COLORS.dimLine, 0.35));
  g.appendChild(line(doc, x2, y, x2, y + offset - tickDir * 3, COLORS.dimLine, 0.35));

  const text = svgEl(doc, 'text', {
    x: (x1 + x2) / 2, y: y + offset + (above ? -3 : 7),
    'text-anchor': 'middle', fill: COLORS.dimension,
    'font-size': 4, 'font-family': 'sans-serif'
  });
  text.textContent = label;
  g.appendChild(text);
  return g;
}

/** Vertical dimension line with a centered (rotated) label. */
function vDimension(doc, y1, y2, x, label, left = true) {
  const g = svgEl(doc, 'g', { class: 'dim' });
  const offset = left ? -8 : 8;
  const tickDir = left ? 1 : -1;
  const lineX = x + offset;
  const arrowLen = 2.5;
  const arrowHalf = 1.25;

  g.appendChild(line(doc, lineX, y1, lineX, y2, COLORS.dimLine, 0.45));
  g.appendChild(svgEl(doc, 'polygon', {
    points: `${lineX},${y1} ${lineX - arrowHalf},${y1 + arrowLen} ${lineX + arrowHalf},${y1 + arrowLen}`,
    fill: COLORS.dimLine
  }));
  g.appendChild(svgEl(doc, 'polygon', {
    points: `${lineX},${y2} ${lineX - arrowHalf},${y2 - arrowLen} ${lineX + arrowHalf},${y2 - arrowLen}`,
    fill: COLORS.dimLine
  }));
  g.appendChild(line(doc, x, y1, x + offset - tickDir * 3, y1, COLORS.dimLine, 0.35));
  g.appendChild(line(doc, x, y2, x + offset - tickDir * 3, y2, COLORS.dimLine, 0.35));

  const labelX = x + offset + (left ? -3 : 3);
  const labelY = (y1 + y2) / 2;
  const text = svgEl(doc, 'text', {
    x: labelX, y: labelY,
    'text-anchor': 'middle', fill: COLORS.dimension,
    'font-size': 4, 'font-family': 'sans-serif',
    transform: `rotate(-90, ${labelX}, ${labelY})`
  });
  text.textContent = label;
  g.appendChild(text);
  return g;
}

function svgRoot(doc, vbX, vbY, vbW, vbH, testid) {
  const svg = svgEl(doc, 'svg', {
    viewBox: `${vbX} ${vbY} ${vbW} ${vbH}`,
    xmlns: SVG_NS,
    'data-testid': testid
  });
  svg.appendChild(rect(doc, vbX, vbY, vbW, vbH, COLORS.bg, 'none', 0));
  return svg;
}

/* ------------------------------------------------------------------ */
/*  Dovetail joint strip                                              */
/* ------------------------------------------------------------------ */

/**
 * Draw a dovetail joint as a vertical strip of `n` tails (with a half-pin at
 * top and bottom). The strip represents the end grain visible at a corner:
 * pins (the mating board) alternate with tails (this board).
 *
 * @param {object}  doc
 * @param {number}  x0        left edge of the strip (SVG units)
 * @param {number}  yTop      top of the joint (SVG units)
 * @param {number}  stripW    strip width (SVG units)
 * @param {number}  totalH    joint height (SVG units)
 * @param {number}  n         number of tails
 * @param {string}  pinColor  fill for the pins (mating board end grain)
 * @param {boolean} hidden    draw dashed (half-blind / hidden joint)
 * @returns {SVGGElement}
 */
function jointStrip(doc, x0, yTop, stripW, totalH, n, pinColor, hidden) {
  const g = svgEl(doc, 'g', { 'data-testid': 'dovetail-joint' });
  const segments = 2 * n + 1; // pin, tail, pin, ... , pin
  const seg = totalH / segments;
  const dash = hidden ? '1.4 1.1' : undefined;
  const sw = hidden ? 0.35 : 0.5;

  for (let i = 0; i < segments; i++) {
    const y = yTop + i * seg;
    const isPin = i % 2 === 0; // even segments are pins (mating board)
    if (isPin) {
      g.appendChild(rect(doc, x0, y, stripW, seg, pinColor,
        hidden ? COLORS.groove : COLORS.secondaryDark, sw, dash));
    } else {
      // tail socket boundary line only (tail belongs to this board)
      g.appendChild(line(doc, x0, y, x0 + stripW, y, COLORS.groove, sw * 0.7, dash));
      g.appendChild(line(doc, x0, y + seg, x0 + stripW, y + seg, COLORS.groove, sw * 0.7, dash));
    }
  }
  // outer boundary of the strip
  g.appendChild(rect(doc, x0, yTop, stripW, totalH, 'none',
    hidden ? COLORS.groove : COLORS.secondaryDark, sw, dash));
  return g;
}

/* ------------------------------------------------------------------ */
/*  Front view                                                        */
/* ------------------------------------------------------------------ */

/**
 * Front elevation — looking straight at the drawer front.
 */
export function renderFrontView(doc, d, fmt) {
  const pad = 26;
  const s = SCALE;
  const w = d.width * s;
  const h = d.height * s;
  const st = d.sideThickness * s;

  const svg = svgRoot(doc, -pad, -pad, w + 2 * pad, h + 2 * pad, 'drawer-front');

  // Drawer front face
  svg.appendChild(rect(doc, 0, 0, w, h, COLORS.front, COLORS.frontDark, 0.5));
  svg.appendChild(rect(doc, 0.5, 0.5, w - 1, h - 1, 'none', COLORS.frontHi, 0.4));

  // Corner joints to the sides at each vertical edge.
  if (d.halfBlindFront) {
    // Half-blind: front face is clean. Show the hidden side location dashed.
    svg.appendChild(line(doc, st, 0, st, h, COLORS.groove, 0.35, '1.4 1.1'));
    svg.appendChild(line(doc, w - st, 0, w - st, h, COLORS.groove, 0.35, '1.4 1.1'));
  } else {
    // Through dovetails: the side end grain shows as tails along each edge.
    svg.appendChild(jointStrip(doc, 0, 0, st, h, d.tailCount, COLORS.secondary, false));
    svg.appendChild(jointStrip(doc, w - st, 0, st, h, d.tailCount, COLORS.secondary, false));
  }

  // Bottom groove (hidden) — a dashed band near the bottom.
  const gTop = h - (d.grooveFromBottom + d.grooveWidth) * s;
  const gBot = h - d.grooveFromBottom * s;
  svg.appendChild(line(doc, st, gTop, w - st, gTop, COLORS.groove, 0.35, '1.4 1.1'));
  svg.appendChild(line(doc, st, gBot, w - st, gBot, COLORS.groove, 0.35, '1.4 1.1'));

  // Dimensions
  svg.appendChild(hDimension(doc, 0, w, 0, fmt(d.width), true));
  svg.appendChild(vDimension(doc, 0, h, 0, fmt(d.height), true));

  return svg;
}

/* ------------------------------------------------------------------ */
/*  Side view                                                         */
/* ------------------------------------------------------------------ */

/**
 * Side elevation — looking at a drawer side from outside.
 * Front is at the left, back is at the right.
 */
export function renderSideView(doc, d, fmt) {
  const pad = 26;
  const s = SCALE;
  const w = d.depth * s;
  const h = d.height * s;
  const ft = d.frontThickness * s;
  const bt = d.backThickness * s;
  const lap = d.frontLap * s;

  const svg = svgRoot(doc, -pad, -pad, w + 2 * pad, h + 2 * pad, 'drawer-side');

  // The side board face
  svg.appendChild(rect(doc, 0, 0, w, h, COLORS.secondary, COLORS.secondaryDark, 0.5));

  // Front joint (left edge).
  if (d.halfBlindFront) {
    // Half-blind: solid front lap covers the joint; sockets are hidden.
    svg.appendChild(rect(doc, 0, 0, lap, h, COLORS.front, COLORS.frontDark, 0.5));
    svg.appendChild(jointStrip(doc, lap, 0, ft - lap, h, d.tailCount, COLORS.front, true));
  } else {
    // Through dovetails at the front: front board pins show as end grain.
    svg.appendChild(jointStrip(doc, 0, 0, ft, h, d.tailCount, COLORS.front, false));
  }

  // Back joint (right edge) — always through dovetails.
  svg.appendChild(jointStrip(doc, w - bt, 0, bt, h, d.tailCount, COLORS.secondary, false));

  // Bottom groove (hidden) running the inner length of the side.
  const gTop = h - (d.grooveFromBottom + d.grooveWidth) * s;
  const gBot = h - d.grooveFromBottom * s;
  const gx1 = d.halfBlindFront ? lap : ft;
  const gx2 = w - bt;
  svg.appendChild(rect(doc, gx1, gTop, gx2 - gx1, gBot - gTop, 'none', COLORS.groove, 0.35, '1.4 1.1'));

  // Labels for front / back orientation
  const fLabel = svgEl(doc, 'text', {
    x: 2, y: -3, fill: COLORS.dimension, 'font-size': 3.5, 'font-family': 'sans-serif'
  });
  fLabel.textContent = 'front';
  svg.appendChild(fLabel);
  const bLabel = svgEl(doc, 'text', {
    x: w - 8, y: -3, fill: COLORS.dimension, 'font-size': 3.5, 'font-family': 'sans-serif'
  });
  bLabel.textContent = 'back';
  svg.appendChild(bLabel);

  // Dimensions
  svg.appendChild(hDimension(doc, 0, w, h, fmt(d.depth), false));
  svg.appendChild(vDimension(doc, 0, h, 0, fmt(d.height), true));

  return svg;
}

/* ------------------------------------------------------------------ */
/*  Top view (plan)                                                   */
/* ------------------------------------------------------------------ */

/**
 * Top plan — looking straight down into the (open) drawer.
 * Front wall at the top, back wall at the bottom.
 */
export function renderTopView(doc, d, fmt) {
  const pad = 26;
  const s = SCALE;
  const w = d.width * s;
  const dep = d.depth * s;
  const ft = d.frontThickness * s;
  const bt = d.backThickness * s;
  const st = d.sideThickness * s;
  const gd = d.grooveDepth * s;

  const svg = svgRoot(doc, -pad, -pad, w + 2 * pad, dep + 2 * pad, 'drawer-top');

  // Bottom panel sits in the grooves — extends one groove depth into each wall.
  svg.appendChild(rect(doc, st - gd, ft - gd, w - 2 * (st - gd), dep - (ft - gd) - (bt - gd),
    COLORS.bottom, COLORS.bottomDark, 0.4, '1.4 1.1'));

  // Walls (drawn over the panel edges).
  svg.appendChild(rect(doc, 0, 0, w, ft, COLORS.front, COLORS.frontDark, 0.5));          // front
  svg.appendChild(rect(doc, 0, dep - bt, w, bt, COLORS.secondary, COLORS.secondaryDark, 0.5)); // back
  svg.appendChild(rect(doc, 0, 0, st, dep, COLORS.secondary, COLORS.secondaryDark, 0.5));      // left
  svg.appendChild(rect(doc, w - st, 0, st, dep, COLORS.secondary, COLORS.secondaryDark, 0.5)); // right

  // Corner joint indication (diagonal pins) at the four corners.
  const corners = [
    [st, ft], [w - st, ft], [st, dep - bt], [w - st, dep - bt]
  ];
  for (const [cx, cy] of corners) {
    svg.appendChild(line(doc, cx - st, cy, cx, cy - Math.min(ft, bt), COLORS.groove, 0.3));
  }

  // Inner-opening outline
  svg.appendChild(rect(doc, st, ft, w - 2 * st, dep - ft - bt, 'none', COLORS.groove, 0.3, '0.8 0.8'));

  // Dimensions
  svg.appendChild(hDimension(doc, 0, w, 0, fmt(d.width), true));
  svg.appendChild(vDimension(doc, 0, dep, 0, fmt(d.depth), true));
  svg.appendChild(hDimension(doc, 0, st, dep, fmt(d.sideThickness), false));
  svg.appendChild(vDimension(doc, 0, ft, w, fmt(d.frontThickness), false));

  return svg;
}

/* ------------------------------------------------------------------ */
/*  Isometric (exploded)                                             */
/* ------------------------------------------------------------------ */

/**
 * Exploded isometric view — the five parts pulled apart and drawn fully
 * opaque, with simple per-face shading (top lightest, sides darker) instead
 * of transparency. Color-coded by part.
 */
export function renderIsometric(doc, d, _fmt) {
  const angle = Math.PI / 6; // 30°
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const s = 2.6;

  const W = d.width;
  const D = d.depth;
  const H = d.height;
  const ft = d.frontThickness;
  const bt = d.backThickness;
  const st = d.sideThickness;
  const btm = d.bottomThickness;
  const bz = d.grooveFromBottom;

  // Project model space (x = width, y = depth, z = height) to the screen.
  // y is flipped (b = D - y) so the drawer front sits nearest the viewer.
  function iso(x, y, z) {
    const b = D - y;
    return [(x - b) * cos * s, (x + b) * sin * s - z * s];
  }

  // Explosion offsets pull each part away from the assembled position.
  const ex = Math.max(W * 0.4, 4);
  const ey = Math.max(D * 0.4, 4);
  const ez = Math.max(H * 1.6, 6);

  // Each part: assembled box [x0, y0, z0, w, d, h], explode offset, color.
  // Drawn far-to-near so nearer parts cleanly overdraw farther ones.
  const pieces = [
    { b: [0, D - bt, 0, W, bt, H], o: [0, ey, 0], c: COLORS.secondary },                 // back
    { b: [0, 0, 0, st, D, H], o: [-ex, 0, 0], c: COLORS.secondary },                     // left side
    { b: [W - st, 0, 0, st, D, H], o: [ex, 0, 0], c: COLORS.secondary },                 // right side
    { b: [0, 0, 0, W, ft, H], o: [0, -ey, 0], c: COLORS.front },                         // front
    { b: [st, ft, bz, W - 2 * st, D - ft - bt, btm], o: [0, 0, -ez], c: COLORS.bottom }  // bottom
  ];

  // Resolve absolute corners and track the projected bounds for the viewBox.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const resolved = pieces.map(({ b, o, c }) => {
    const [x0, y0, z0, w, dp, h] = b;
    const X0 = x0 + o[0], Y0 = y0 + o[1], Z0 = z0 + o[2];
    const X1 = X0 + w, Y1 = Y0 + dp, Z1 = Z0 + h;
    for (const X of [X0, X1]) {
      for (const Y of [Y0, Y1]) {
        for (const Z of [Z0, Z1]) {
          const [px, py] = iso(X, Y, Z);
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
        }
      }
    }
    return { X0, Y0, Z0, X1, Y1, Z1, c };
  });

  const pad = 12;
  const legendH = 32;
  const vbX = minX - pad;
  const vbY = minY - pad;
  const vbW = (maxX - minX) + 2 * pad;
  const vbH = (maxY - minY) + 2 * pad + legendH;

  const svg = svgEl(doc, 'svg', {
    viewBox: `${vbX} ${vbY} ${vbW} ${vbH}`,
    xmlns: SVG_NS,
    'data-testid': 'drawer-iso'
  });
  svg.appendChild(rect(doc, vbX, vbY, vbW, vbH, COLORS.bg, 'none', 0));

  const poly = (pts, fill) => svgEl(doc, 'polygon', {
    points: pts.map(([px, py]) => `${px},${py}`).join(' '),
    fill, stroke: COLORS.groove, 'stroke-width': 0.5
  });

  for (const p of resolved) {
    const c = (x, y, z) => iso(x, y, z);
    const topFill = p.c;                // top — lightest
    const xFill = shade(p.c, 0.86);     // +x face
    const yFill = shade(p.c, 0.72);     // front (-y) face — darkest
    // Top face
    svg.appendChild(poly([
      c(p.X0, p.Y0, p.Z1), c(p.X1, p.Y0, p.Z1), c(p.X1, p.Y1, p.Z1), c(p.X0, p.Y1, p.Z1)
    ], topFill));
    // Max-x face (right)
    svg.appendChild(poly([
      c(p.X1, p.Y0, p.Z1), c(p.X1, p.Y1, p.Z1), c(p.X1, p.Y1, p.Z0), c(p.X1, p.Y0, p.Z0)
    ], xFill));
    // Min-y face (front, nearest the viewer)
    svg.appendChild(poly([
      c(p.X0, p.Y0, p.Z1), c(p.X1, p.Y0, p.Z1), c(p.X1, p.Y0, p.Z0), c(p.X0, p.Y0, p.Z0)
    ], yFill));
  }

  // Part legend
  const legend = [
    ['Front', COLORS.front],
    ['Sides / Back', COLORS.secondary],
    ['Bottom', COLORS.bottom]
  ];
  legend.forEach(([label, color], i) => {
    const ly = vbY + vbH - legendH + 9 + i * 9;
    svg.appendChild(rect(doc, vbX + 6, ly - 5, 6, 6, color, COLORS.groove, 0.4));
    const t = svgEl(doc, 'text', {
      x: vbX + 15, y: ly, fill: COLORS.dimension, 'font-size': 5.5, 'font-family': 'sans-serif'
    });
    t.textContent = label;
    svg.appendChild(t);
  });

  return svg;
}
