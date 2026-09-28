/**
 * SVG diagram generation for the cam clamp.
 * Works in both browser (document) and Node (with happy-dom).
 *
 * Coordinate convention: side views have the bar vertical and the jaws
 * pointing right. SVG y increases downward. Each part is drawn with its
 * origin at the back (bar) end, top edge.
 */

import { leverProfile, leverToJaw } from './cam-clamp-math.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const COLORS = {
  jaw: '#C9A36B',        // hardwood jaws
  jawDark: '#8B6914',
  lever: '#E3C98E',      // lever (lighter wood)
  leverDark: '#A88E58',
  bar: '#C3C8CF',        // aluminum
  barDark: '#8A9099',
  cork: '#B5835A',
  corkDark: '#7A5535',
  pin: '#5a5a5a',
  hidden: '#5C3D2E',
  dimension: '#444444',
  dimLine: '#727272',
  motion: '#5B9BD5',     // "this moves" arrows, as in the plan
  bg: '#fffdfb'
};

const SCALE = 16; // SVG units per inch
const HIDDEN_DASH = '1.4 1.1';

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

function circle(doc, cx, cy, r, fill, stroke, sw = 0.4) {
  return svgEl(doc, 'circle', { cx, cy, r, fill, stroke, 'stroke-width': sw });
}

function polygon(doc, pts, fill, stroke, sw = 0.5) {
  return svgEl(doc, 'polygon', {
    points: pts.map(([x, y]) => `${x},${y}`).join(' '),
    fill, stroke, 'stroke-width': sw, 'stroke-linejoin': 'round'
  });
}

function label(doc, x, y, text, anchor = 'start', size = 3.5) {
  const t = svgEl(doc, 'text', {
    x, y, 'text-anchor': anchor, fill: COLORS.dimension,
    'font-size': size, 'font-family': 'sans-serif', 'font-style': 'italic'
  });
  t.textContent = text;
  return t;
}

/** Horizontal dimension line with a centered label. */
function hDimension(doc, x1, x2, y, text, above = true, offsetMag = 8) {
  const g = svgEl(doc, 'g', { class: 'dim' });
  const offset = above ? -offsetMag : offsetMag;
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

  const t = svgEl(doc, 'text', {
    x: (x1 + x2) / 2, y: y + offset + (above ? -1.5 : 4.5),
    'text-anchor': 'middle', fill: COLORS.dimension,
    'font-size': 4, 'font-family': 'sans-serif'
  });
  t.textContent = text;
  g.appendChild(t);
  return g;
}

/** Vertical dimension line with a centered (rotated) label. */
function vDimension(doc, y1, y2, x, text, left = true, offsetMag = 8) {
  const g = svgEl(doc, 'g', { class: 'dim' });
  const offset = left ? -offsetMag : offsetMag;
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

  const labelX = x + offset + (left ? -1.5 : 4);
  const labelY = (y1 + y2) / 2;
  const t = svgEl(doc, 'text', {
    x: labelX, y: labelY,
    'text-anchor': 'middle', fill: COLORS.dimension,
    'font-size': 4, 'font-family': 'sans-serif',
    transform: `rotate(-90, ${labelX}, ${labelY})`
  });
  t.textContent = text;
  g.appendChild(t);
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
/*  Part drawings (side view), in SVG units, origin at part top-left   */
/* ------------------------------------------------------------------ */

function drawPins(doc, g, pins, s, r) {
  for (const p of pins) {
    g.appendChild(circle(doc, p.x * s, p.y * s, r * s, COLORS.pin, COLORS.pin, 0.2));
  }
}

/** Fixed jaw side view. Pad hangs below the jaw's bottom edge. */
function fixedJawSide(doc, d, { showBar = true } = {}) {
  const s = SCALE;
  const g = svgEl(doc, 'g', { 'data-testid': 'fixed-jaw' });
  const J = d.jawLength * s;
  const H = d.fixedHeight * s;
  const nd = d.notchDepth * s;
  const ns = d.notchStart * s;
  const ps = d.padStart * s;

  g.appendChild(polygon(doc, [
    [0, 0], [J, 0], [J, H], [ps, H], [ps, H - nd], [ns, H - nd], [ns, H], [0, H]
  ], COLORS.jaw, COLORS.jawDark));

  // Cork pad
  g.appendChild(rect(doc, ps, H, J - ps, d.padThickness * s, COLORS.cork, COLORS.corkDark, 0.4));

  // Bar mortise (hidden)
  if (showBar) {
    const mx = d.fixedMortiseStart * s;
    const mw = d.fixedMortiseLength * s;
    g.appendChild(line(doc, mx, 0, mx, H, COLORS.hidden, 0.35, HIDDEN_DASH));
    g.appendChild(line(doc, mx + mw, 0, mx + mw, H, COLORS.hidden, 0.35, HIDDEN_DASH));
  }

  drawPins(doc, g, d.fixedPins, s, d.pinDiameter / 2);
  return g;
}

/**
 * Lever outline — round cam head, tangent edges, round handle end — in the
 * lever's axis frame (origin at the head center, x toward the nose), SVG units.
 */
function leverShape(doc, d, { opacity = 0.85, dash } = {}) {
  const s = SCALE;
  const p = leverProfile(d);
  const P = ([x, y]) => `${x * s} ${y * s}`;
  const rh = p.head.r * s;
  const rt = p.tail.r * s;
  const attrs = {
    d: `M ${P(p.headUpper)} A ${rh} ${rh} 0 1 1 ${P(p.headLower)} ` +
       `L ${P(p.tailLower)} A ${rt} ${rt} 0 0 1 ${P(p.tailUpper)} Z`,
    fill: COLORS.lever, stroke: COLORS.leverDark, 'stroke-width': 0.5,
    'stroke-linejoin': 'round', 'fill-opacity': opacity
  };
  if (dash) {
    attrs['stroke-dasharray'] = dash;
  }
  return svgEl(doc, 'path', attrs);
}

/**
 * The lever placed in jaw coordinates, swung `deg` degrees down from its rest
 * position about the pivot. Swinging the handle down rolls the head up.
 */
function leverInJaw(doc, d, deg, opts = {}) {
  const s = SCALE;
  const c = d.headCenterRest;
  const g = svgEl(doc, 'g', {
    'data-testid': opts.testid || 'lever',
    transform: `translate(${d.pivotX * s}, ${d.pivotY * s}) rotate(${-deg}) ` +
               `translate(${c.x * s}, ${c.y * s}) rotate(${-d.restTiltDeg})`
  });
  g.appendChild(leverShape(doc, d, opts));
  return g;
}

/** Small filled arrowhead pointing along `angleDeg` (SVG degrees, 0 = +x). */
function arrowHead(doc, x, y, angleDeg, color, len = 3) {
  return svgEl(doc, 'polygon', {
    points: `0,0 ${-len},${-len * 0.5} ${-len},${len * 0.5}`,
    fill: color, transform: `translate(${x}, ${y}) rotate(${angleDeg})`
  });
}

/** Curved motion arrow about (cx, cy) from a1 to a2 degrees (SVG angles). */
function swingArrow(doc, cx, cy, r, a1, a2, color) {
  const rad = a => a * Math.PI / 180;
  const x1 = cx + r * Math.cos(rad(a1));
  const y1 = cy + r * Math.sin(rad(a1));
  const x2 = cx + r * Math.cos(rad(a2));
  const y2 = cy + r * Math.sin(rad(a2));
  const sweep = a2 > a1 ? 1 : 0;
  const g = svgEl(doc, 'g', { class: 'motion' });
  g.appendChild(svgEl(doc, 'path', {
    d: `M ${x1} ${y1} A ${r} ${r} 0 0 ${sweep} ${x2} ${y2}`,
    fill: 'none', stroke: color, 'stroke-width': 1.2, 'stroke-linecap': 'round'
  }));
  // Tangent direction at the end of the arc
  g.appendChild(arrowHead(doc, x2, y2, a2 + (sweep ? 90 : -90), color, 3.5));
  return g;
}

/**
 * Extent of the lever (at rest and swung to the clamped stop) in jaw
 * coordinates, inches from the sliding jaw's top-left corner.
 */
function leverExtent(d) {
  let bottom = 0;
  let right = 0;
  for (const deg of [0, d.camSwing]) {
    for (const [cx, r] of [[0, d.headRadius], [-d.centerDistance, d.tailRadius]]) {
      const [x, y] = leverToJaw(d, [cx, 0], deg);
      bottom = Math.max(bottom, d.pivotY + y + r);
      right = Math.max(right, d.pivotX + x + r);
    }
  }
  return { bottom, right };
}

/**
 * Sliding jaw side view, with the lever at rest in its slot. Pad sits above
 * y=0. With showSwing, a ghosted lever is drawn swung down to the clamped
 * position with motion arrows, as in the plan.
 */
function slidingJawSide(doc, d, { showLever = true, showBar = true, showSwing = false } = {}) {
  const s = SCALE;
  const g = svgEl(doc, 'g', { 'data-testid': 'sliding-jaw' });
  const J = d.jawLength * s;
  const H = d.slidingHeight * s;
  const nd = d.notchDepth * s;
  const ns = d.notchStart * s;
  const ps = d.padStart * s;

  g.appendChild(polygon(doc, [
    [0, 0], [ns, 0], [ns, nd], [ps, nd], [ps, 0], [J, 0], [J, H], [0, H]
  ], COLORS.jaw, COLORS.jawDark));

  // Cork pad on the raised seat
  g.appendChild(rect(doc, ps, -d.padThickness * s, J - ps, d.padThickness * s,
    COLORS.cork, COLORS.corkDark, 0.4));

  // Kerf from the relief hole out through the tip
  const kx = d.reliefX * s;
  g.appendChild(rect(doc, kx, d.kerfTop * s, J - kx + 0.3, d.kerf * s, COLORS.bg, 'none', 0));
  g.appendChild(line(doc, kx, d.kerfTop * s, J, d.kerfTop * s, COLORS.jawDark, 0.35));
  g.appendChild(line(doc, kx, d.kerfBottom * s, J, d.kerfBottom * s, COLORS.jawDark, 0.35));
  g.appendChild(svgEl(doc, 'circle', {
    'data-testid': 'relief-hole',
    cx: kx, cy: d.reliefY * s, r: d.reliefDiameter / 2 * s,
    fill: COLORS.bg, stroke: COLORS.jawDark, 'stroke-width': 0.4
  }));

  // Lever slot (hidden), open to the bottom and the tip
  const sx = d.leverSlotStart * s;
  g.appendChild(line(doc, sx, d.kerfBottom * s, sx, H, COLORS.hidden, 0.35, HIDDEN_DASH));

  // Bar mortise (hidden)
  if (showBar) {
    const mx = d.slidingMortiseStart * s;
    const mw = d.slidingMortiseLength * s;
    g.appendChild(line(doc, mx, 0, mx, H, COLORS.hidden, 0.35, HIDDEN_DASH));
    g.appendChild(line(doc, mx + mw, 0, mx + mw, H, COLORS.hidden, 0.35, HIDDEN_DASH));
  }

  drawPins(doc, g, d.slidingPins, s, d.pinDiameter / 2);

  if (showLever && showSwing) {
    // Clamped: handle swung down, nose rotated up into the tongue.
    g.appendChild(leverInJaw(doc, d, d.camSwing, {
      testid: 'lever-swung', opacity: 0.4, dash: '1.6 1.2'
    }));
  }
  if (showLever) {
    g.appendChild(leverInJaw(doc, d, 0));
  }

  // Pivot pin
  g.appendChild(circle(doc, d.pivotX * s, d.pivotY * s, d.pinDiameter / 2 * s,
    COLORS.pin, COLORS.pin, 0.2));

  if (showLever && showSwing) {
    // Handle swings down (arc about the pivot); tongue is pushed up.
    const px = d.pivotX * s;
    const py = d.pivotY * s;
    const swingR = (d.centerDistance * 0.6) * s;
    const handleAt = 180 - d.restTiltDeg;   // SVG angle of the handle at rest
    g.appendChild(swingArrow(doc, px, py, swingR, handleAt - 12, handleAt - d.camSwing + 15,
      COLORS.motion));
    const ax = (d.padStart + d.padLength * 0.3) * s;
    const ay = -d.padThickness * s - 3;
    g.appendChild(line(doc, ax, ay, ax, ay - 7, COLORS.motion, 1.2));
    g.appendChild(arrowHead(doc, ax, ay - 8, -90, COLORS.motion, 3.5));
  }
  return g;
}

/** Plan view of a jaw (looking at the top or bottom edge). */
function jawPlan(doc, d, { mortiseStart, mortiseLength, slot }) {
  const s = SCALE;
  const g = svgEl(doc, 'g');
  const J = d.jawLength * s;
  const T = d.jawThickness * s;
  g.appendChild(rect(doc, 0, 0, J, T, COLORS.jaw, COLORS.jawDark));

  const mw = d.mortiseWidth * s;
  g.appendChild(svgEl(doc, 'rect', {
    'data-testid': 'mortise',
    x: mortiseStart * s, y: (T - mw) / 2, width: mortiseLength * s, height: mw,
    fill: COLORS.hidden, stroke: COLORS.hidden, 'stroke-width': 0.3
  }));

  if (slot) {
    const sw = d.leverSlotWidth * s;
    g.appendChild(svgEl(doc, 'rect', {
      'data-testid': 'lever-slot',
      x: d.leverSlotStart * s, y: (T - sw) / 2, width: (d.jawLength - d.leverSlotStart) * s, height: sw,
      fill: COLORS.lever, stroke: COLORS.leverDark, 'stroke-width': 0.3
    }));
  }
  return g;
}

/* ------------------------------------------------------------------ */
/*  Assembly                                                          */
/* ------------------------------------------------------------------ */

/**
 * Assembled clamp, opened to full capacity (sliding jaw at the end of the bar).
 */
export function renderAssembly(doc, d, fmt) {
  const s = SCALE;
  const J = d.jawLength * s;
  const L = d.barLength * s;
  const padL = 26;
  const padR = Math.max(26, (d.slidingOffset + leverExtent(d).right - d.jawLength) * SCALE + 6);
  const padT = 18;
  // Leave room for the ghosted lever hanging below the sliding jaw.
  const slideTop = (d.barLength - d.slidingHeight) * s;
  const padB = Math.max(10, slideTop + leverExtent(d).bottom * s + 8 - L);
  const svg = svgRoot(doc, -padL, -padT, J + padL + padR, L + padT + padB, 'clamp-assembly');

  // Bar
  svg.appendChild(svgEl(doc, 'rect', {
    'data-testid': 'bar',
    x: d.barInset * s, y: 0, width: d.barWidth * s, height: L,
    fill: COLORS.bar, stroke: COLORS.barDark, 'stroke-width': 0.5
  }));

  svg.appendChild(fixedJawSide(doc, d, { showBar: false }));

  const slide = slidingJawSide(doc, d, { showBar: false, showSwing: true });
  slide.setAttribute('transform', `translate(${d.slidingOffset * s}, ${slideTop})`);
  svg.appendChild(slide);

  // Bar hidden behind the jaws is drawn dashed so it reads as passing through.
  const bx1 = d.barInset * s;
  const bx2 = (d.barInset + d.barWidth) * s;
  for (const x of [bx1, bx2]) {
    svg.appendChild(line(doc, x, 0, x, d.fixedHeight * s, COLORS.barDark, 0.35, HIDDEN_DASH));
    svg.appendChild(line(doc, x, L - d.slidingHeight * s, x, L, COLORS.barDark, 0.35, HIDDEN_DASH));
  }

  // Dimensions
  svg.appendChild(hDimension(doc, d.barFront * s, J, 0, `reach ${fmt(d.jawReach)}`, true));
  svg.appendChild(vDimension(doc, 0, L, 0, `bar ${fmt(d.barLength)}`, true, 12));
  const capTop = d.fixedPadFace * s;
  const capBot = (d.barLength - d.slidingHeight - d.padThickness) * s;
  if (capBot > capTop) {
    svg.appendChild(vDimension(doc, capTop, capBot, J, `opens ${fmt(d.capacity)}`, false));
  }

  return svg;
}

/* ------------------------------------------------------------------ */
/*  Fixed jaw detail                                                  */
/* ------------------------------------------------------------------ */

/**
 * Fixed jaw: side view with its top (plan) view below.
 */
export function renderFixedJaw(doc, d, fmt) {
  const s = SCALE;
  const J = d.jawLength * s;
  const H = d.fixedHeight * s;
  const T = d.jawThickness * s;
  const padL = 22;
  const padR = 14;
  const padT = 18;
  const gap = 34;              // between side view and plan view
  const planY = H + d.padThickness * s + gap;
  const total = planY + T + 28;

  const svg = svgRoot(doc, -padL, -padT, J + padL + padR, total + padT, 'clamp-fixed-jaw');

  // --- Side view ---
  svg.appendChild(fixedJawSide(doc, d));
  svg.appendChild(hDimension(doc, 0, J, 0, fmt(d.jawLength), true));
  svg.appendChild(vDimension(doc, 0, H, 0, fmt(d.fixedHeight), true));
  const below = H + d.padThickness * s;
  svg.appendChild(hDimension(doc, d.notchStart * s, d.padStart * s, below,
    `notch ${fmt(d.notchLength)} × ${fmt(d.notchDepth)}`, false, 7));
  svg.appendChild(hDimension(doc, d.padStart * s, J, below, fmt(d.padLength), false, 7));
  svg.appendChild(hDimension(doc, 0, d.notchStart * s, below, fmt(d.notchStart), false, 7));

  // --- Top (plan) view ---
  const plan = jawPlan(doc, d, {
    mortiseStart: d.fixedMortiseStart, mortiseLength: d.fixedMortiseLength, slot: false
  });
  plan.setAttribute('transform', `translate(0, ${planY})`);
  svg.appendChild(plan);
  svg.appendChild(label(doc, J / 2, planY - 3, 'top', 'middle'));
  svg.appendChild(vDimension(doc, planY, planY + T, 0, fmt(d.jawThickness), true));
  svg.appendChild(hDimension(doc, d.fixedMortiseStart * s,
    (d.fixedMortiseStart + d.fixedMortiseLength) * s, planY + T,
    `${fmt(d.fixedMortiseLength)} × ${fmt(d.mortiseWidth)}`, false, 7));
  svg.appendChild(hDimension(doc, 0, d.fixedMortiseStart * s, planY + T,
    fmt(d.fixedMortiseStart), false, 16));

  return svg;
}

/* ------------------------------------------------------------------ */
/*  Sliding jaw detail                                                */
/* ------------------------------------------------------------------ */

/**
 * Sliding jaw: side view (lever at rest) with its bottom view below.
 */
export function renderSlidingJaw(doc, d, fmt) {
  const s = SCALE;
  const J = d.jawLength * s;
  const H = d.slidingHeight * s;
  const T = d.jawThickness * s;
  const padL = 22;
  const padT = 28 + d.padThickness * s;
  const gap = 30;
  // The ghosted, swung lever hangs below the jaw; put the plan view under it.
  const swung = leverExtent(d);
  const padR = Math.max(24, (swung.right - d.jawLength) * s + 6);
  // Note about the clamped lever sits under the dimensions and the handle.
  const noteY = Math.max(H + 22, swung.bottom * s + 7);
  const planY = Math.max(H + gap, swung.bottom * s + 22, noteY + 14);
  const total = planY + T + 20;

  const svg = svgRoot(doc, -padL, -padT, J + padL + padR, total + padT, 'clamp-sliding-jaw');

  // --- Side view ---
  svg.appendChild(slidingJawSide(doc, d, { showSwing: true }));
  const topY = -d.padThickness * s;
  svg.appendChild(hDimension(doc, 0, J, topY, fmt(d.jawLength), true, 18));
  svg.appendChild(vDimension(doc, 0, H, 0, fmt(d.slidingHeight), true));
  svg.appendChild(vDimension(doc, d.tongueTop * s, d.kerfTop * s, J,
    fmt(d.tongueThickness), false, 5));
  svg.appendChild(vDimension(doc, d.kerfBottom * s, d.pivotY * s, J,
    fmt(d.pivotBelowKerf), false, 14));
  svg.appendChild(hDimension(doc, d.reliefX * s, J, H, `tongue ${fmt(d.tongueLength)}`, false, 7));
  svg.appendChild(hDimension(doc, 0, d.reliefX * s, H, fmt(d.reliefX), false, 7));
  svg.appendChild(hDimension(doc, d.pivotX * s, J, topY, fmt(d.pivotFromTip), true, 6));
  // Lever position labels
  svg.appendChild(label(doc, 0, noteY,
    `clamped (dashed): handle down ${d.camSwing}°, cam lifts tongue ${fmt(d.tongueFlex)}`, 'start'));

  // --- Bottom (plan) view ---
  const plan = jawPlan(doc, d, {
    mortiseStart: d.slidingMortiseStart, mortiseLength: d.slidingMortiseLength, slot: true
  });
  plan.setAttribute('transform', `translate(0, ${planY})`);
  svg.appendChild(plan);
  svg.appendChild(label(doc, J / 2, planY - 3, 'bottom', 'middle'));
  svg.appendChild(vDimension(doc, planY, planY + T, 0, fmt(d.jawThickness), true));
  svg.appendChild(hDimension(doc, d.slidingMortiseStart * s,
    (d.slidingMortiseStart + d.slidingMortiseLength) * s, planY + T,
    `${fmt(d.slidingMortiseLength)} × ${fmt(d.mortiseWidth)}`, false, 7));
  svg.appendChild(hDimension(doc, d.leverSlotStart * s, J, planY + T,
    `slot ${fmt(d.leverSlotLength)} × ${fmt(d.leverSlotWidth)}`, false, 7));

  return svg;
}

/* ------------------------------------------------------------------ */
/*  Lever detail                                                      */
/* ------------------------------------------------------------------ */

/**
 * Cam lever layout: a round head and round handle end joined by tangent
 * lines, with both construction circles, the off-center pivot hole and the
 * layout dimensions. Drawn with the centerline horizontal.
 */
export function renderLever(doc, d, fmt) {
  const s = SCALE;
  const L = d.leverLength * s;
  const W = d.leverWidth * s;
  const Rh = d.headRadius * s;
  const Rt = d.tailRadius * s;
  const D = d.centerDistance * s;
  const padL = 26;
  const padT = 22;
  const padB = 44;
  // Match the jaw drawings' width so text renders at the same size.
  const vbW = Math.max(L + padL + 34, d.jawLength * s + 40);
  const svg = svgRoot(doc, -padL, -padT, vbW, W + padT + padB, 'clamp-lever');

  // Head center, in the drawing's coordinates (blank's back-top corner = 0,0)
  const hx = L - Rh;
  const hy = Rh;
  const tx = hx - D;
  const px = hx + d.leverPivot.x * s;
  const py = hy + d.leverPivot.y * s;

  // Blank outline (dashed) so the shape reads as cut from a rectangle.
  svg.appendChild(rect(doc, 0, 0, L, W, 'none', COLORS.dimLine, 0.3, '1.2 1.2'));

  const g = svgEl(doc, 'g', { 'data-testid': 'lever' });
  const shape = svgEl(doc, 'g', { transform: `translate(${hx}, ${hy})` });
  shape.appendChild(leverShape(doc, d, { opacity: 1 }));
  g.appendChild(shape);

  // Construction: both circles, their centers and the centerline.
  const construction = (cx, r, testid) => {
    g.appendChild(svgEl(doc, 'circle', {
      'data-testid': testid, cx, cy: hy, r,
      fill: 'none', stroke: COLORS.leverDark, 'stroke-width': 0.3, 'stroke-dasharray': '1.2 1.2'
    }));
    g.appendChild(line(doc, cx - 2, hy, cx + 2, hy, COLORS.leverDark, 0.4));
    g.appendChild(line(doc, cx, hy - 2, cx, hy + 2, COLORS.leverDark, 0.4));
  };
  construction(hx, Rh, 'cam-circle');
  construction(tx, Rt, 'tail-circle');
  g.appendChild(line(doc, tx, hy, hx, hy, COLORS.leverDark, 0.25, '3 1 0.6 1'));

  // Pivot hole with centerlines.
  g.appendChild(svgEl(doc, 'circle', {
    'data-testid': 'pivot-hole', cx: px, cy: py, r: d.pinDiameter / 2 * s,
    fill: COLORS.bg, stroke: COLORS.leverDark, 'stroke-width': 0.4
  }));
  g.appendChild(line(doc, px - 3, py, px + 3, py, COLORS.leverDark, 0.3));
  g.appendChild(line(doc, px, py - 3, px, py + 3, COLORS.leverDark, 0.3));
  svg.appendChild(g);

  // Radius callouts
  const callout = (cx, r, angleDeg, text, lx, ly) => {
    const a = angleDeg * Math.PI / 180;
    const ex = cx + r * Math.cos(a);
    const ey = hy + r * Math.sin(a);
    svg.appendChild(line(doc, cx, hy, ex, ey, COLORS.dimLine, 0.35));
    svg.appendChild(line(doc, ex, ey, lx, ly, COLORS.dimLine, 0.35));
    const t = label(doc, lx + (lx > ex ? 1 : -1), ly + 1.2, text, lx > ex ? 'start' : 'end', 3.4);
    t.setAttribute('font-style', 'normal');
    svg.appendChild(t);
  };
  callout(hx, Rh, 40, `R ${fmt(d.headRadius)}`, L + 4, hy + Rh + 4);
  callout(tx, Rt, 220, `R ${fmt(d.tailRadius)}`, tx - Rt - 4, hy - Rt - 6);

  // Layout dimensions
  svg.appendChild(hDimension(doc, 0, L, W, fmt(d.leverLength), false));
  svg.appendChild(hDimension(doc, tx, hx, W, `centers ${fmt(d.centerDistance)}`, false, 17));
  svg.appendChild(vDimension(doc, 0, W, 0, fmt(d.leverWidth), true, 16));
  svg.appendChild(vDimension(doc, hy - Rt, hy + Rt, 0, fmt(d.handleEndWidth), true, 7));
  // Pivot hole leader (its small offsets from the head center are in the note)
  svg.appendChild(line(doc, px, py, px - 8, -8, COLORS.dimLine, 0.35));
  const ph = label(doc, px - 9, -9, `${fmt(d.pinDiameter)} pivot hole`, 'end', 3.4);
  ph.setAttribute('font-style', 'normal');
  svg.appendChild(ph);

  const noteX = vbW / 2 - padL;
  svg.appendChild(label(doc, noteX, W + 30,
    `pivot ${fmt(-d.leverPivot.x)} behind and ${fmt(-d.leverPivot.y)} above the head's center makes the head a cam`,
    'middle'));
  svg.appendChild(label(doc, noteX, W + 36,
    `rise ${fmt(d.camRise)}; handle down ${d.camSwing}° (just past dead center) ` +
    `flexes the tongue ${fmt(d.tongueFlex)} and locks`, 'middle'));

  return svg;
}
