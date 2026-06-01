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
/*  Isometric (assembled, open-top tray)                              */
/* ------------------------------------------------------------------ */

/**
 * Assembled isometric view of the drawer (open top), color-coded by part.
 */
export function renderIsometric(doc, d, _fmt) {
  const angle = Math.PI / 6; // 30 degrees
  const cos30 = Math.cos(angle);
  const sin30 = Math.sin(angle);
  const s = 2.4;
  const originX = 70;
  const originY = 40;

  // x = width, y = depth, z = height
  function iso(x, y, z) {
    return {
      px: originX + (x - y) * cos30 * s,
      py: originY + (x + y) * sin30 * s - z * s
    };
  }

  function face(pts, fill, stroke, opacity) {
    const projected = pts.map(([x, y, z]) => iso(x, y, z));
    const attrs = {
      points: projected.map(p => `${p.px},${p.py}`).join(' '),
      fill, stroke, 'stroke-width': 0.5
    };
    if (opacity !== undefined) attrs.opacity = opacity;
    return svgEl(doc, 'polygon', attrs);
  }

  // Draw an axis-aligned box (footprint w x dp at x0,y0, rising h from z0).
  function box(g, x0, y0, z0, bw, bd, bh, fill, dark) {
    // top
    g.appendChild(face([
      [x0, y0, z0 + bh], [x0 + bw, y0, z0 + bh],
      [x0 + bw, y0 + bd, z0 + bh], [x0, y0 + bd, z0 + bh]
    ], fill, dark));
    // front-right face (toward +x)
    g.appendChild(face([
      [x0 + bw, y0, z0 + bh], [x0 + bw, y0 + bd, z0 + bh],
      [x0 + bw, y0 + bd, z0], [x0 + bw, y0, z0]
    ], fill, dark, 0.82));
    // front-left face (toward +y)
    g.appendChild(face([
      [x0, y0 + bd, z0 + bh], [x0 + bw, y0 + bd, z0 + bh],
      [x0 + bw, y0 + bd, z0], [x0, y0 + bd, z0]
    ], fill, dark, 0.68));
  }

  const W = d.width;
  const D = d.depth;
  const H = d.height;
  const ft = d.frontThickness;
  const bt = d.backThickness;
  const st = d.sideThickness;
  const bz = d.grooveFromBottom; // bottom panel height off the drawer base

  const vbW = (W + D) * cos30 * s + 90;
  const vbH = (W + D) * sin30 * s + H * s + 70;

  const svg = svgEl(doc, 'svg', {
    viewBox: `0 0 ${vbW} ${vbH}`,
    xmlns: SVG_NS,
    'data-testid': 'drawer-iso'
  });
  svg.appendChild(rect(doc, 0, 0, vbW, vbH, COLORS.bg, 'none', 0));

  // Painter's order: back wall, left & right sides, bottom panel, then front.
  box(svg, 0, D - bt, 0, W, bt, H, COLORS.secondary, COLORS.secondaryDark);   // back
  box(svg, 0, 0, 0, st, D, H, COLORS.secondary, COLORS.secondaryDark);        // left side
  box(svg, W - st, 0, 0, st, D, H, COLORS.secondary, COLORS.secondaryDark);   // right side
  box(svg, st, ft, bz, W - 2 * st, D - ft - bt, d.bottomThickness,
    COLORS.bottom, COLORS.bottomDark);                                        // bottom panel
  box(svg, 0, 0, 0, W, ft, H, COLORS.front, COLORS.frontDark);               // front

  // Part legend
  const legend = [
    ['Front', COLORS.front],
    ['Sides / Back', COLORS.secondary],
    ['Bottom', COLORS.bottom]
  ];
  legend.forEach(([label, color], i) => {
    const ly = vbH - 26 + i * 8;
    svg.appendChild(rect(doc, 8, ly - 4, 5, 5, color, COLORS.groove, 0.4));
    const t = svgEl(doc, 'text', {
      x: 16, y: ly, fill: COLORS.dimension, 'font-size': 5, 'font-family': 'sans-serif'
    });
    t.textContent = label;
    svg.appendChild(t);
  });

  return svg;
}
