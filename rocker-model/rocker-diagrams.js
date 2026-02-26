/**
 * Galbert's Rocker Model — SVG rendering
 *
 * Draws a side-view profile of a rocking chair that animates rocking.
 * DOM-agnostic: accepts a `doc` parameter (browser `document` or happy-dom).
 */

import { rockerGeometry } from "./rocker-math.js";

const SVG_NS = "http://www.w3.org/2000/svg";

// Colours
const COLOR_ROCKER   = "#8B6914";   // warm wood
const COLOR_SEAT     = "#A0845E";   // lighter wood
const COLOR_LEGS     = "#6B4226";   // dark wood
const COLOR_BACK     = "#7A5C4F";   // backrest
const COLOR_FLOOR    = "#C8B89A";   // floor line
const COLOR_COG      = "#CC3333";   // centre of gravity dot
const COLOR_ARC_HINT = "#D4C4B0";   // faint arc guide

// Drawing scale: 1 inch → this many SVG units
const SCALE = 4;

/* ------------------------------------------------------------------ */
/*  SVG helpers                                                       */
/* ------------------------------------------------------------------ */

function svgEl(doc, tag, attrs = {}) {
  const el = doc.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  return el;
}

function line(doc, x1, y1, x2, y2, stroke, width = 1, dash) {
  const attrs = { x1, y1, x2, y2, stroke, "stroke-width": width };
  if (dash) {
    attrs["stroke-dasharray"] = dash;
  }
  return svgEl(doc, "line", attrs);
}

/* ------------------------------------------------------------------ */
/*  Static chair profile renderer                                     */
/* ------------------------------------------------------------------ */

/**
 * Render the static (non-animated) side-profile of the chair at a given
 * tilt angle θ.  Returns an SVG <g> element.
 *
 * The coordinate system has Y increasing *upward* (we flip via transform
 * on the root SVG).  Origin is at the floor directly below the arc
 * centre when level.
 *
 * @param {object}  doc
 * @param {object}  model  – from buildRockerModel()
 * @param {number}  theta  – current tilt angle (rad)
 * @returns {SVGGElement}
 */
export function renderChairProfile(doc, model, theta) {
  const { radius, seatHeight, seatDepth, cogAboveSeat } = model;
  const g = svgEl(doc, "g");

  const geom = rockerGeometry(radius, seatHeight, seatDepth, cogAboveSeat, theta);
  const { contactX, cogX, cogY, arcCenterX, arcCenterY } = geom;

  const s = SCALE;

  // --- Rocker arc (the curved bottom) ---
  // Draw a portion of the arc ±30° around the contact point
  const arcAngle = Math.PI / 6;
  const arcGroup = svgEl(doc, "g");

  const steps = 40;
  let pathD = "";
  for (let i = 0; i <= steps; i++) {
    const a = theta - arcAngle + (2 * arcAngle * i) / steps;
    const px = (arcCenterX + radius * Math.sin(a)) * s;
    const py = (arcCenterY - radius * Math.cos(a)) * s;
    pathD += (i === 0 ? "M" : "L") + `${px},${-py}`;
  }
  const arcPath = svgEl(doc, "path", {
    d: pathD,
    fill: "none",
    stroke: COLOR_ROCKER,
    "stroke-width": 3,
    "stroke-linecap": "round",
  });
  arcGroup.appendChild(arcPath);
  g.appendChild(arcGroup);

  // --- Ghost arc (full circle hint, faint) ---
  const ghostCircle = svgEl(doc, "circle", {
    cx: arcCenterX * s,
    cy: -arcCenterY * s,
    r: radius * s,
    fill: "none",
    stroke: COLOR_ARC_HINT,
    "stroke-width": 0.5,
    "stroke-dasharray": "4,6",
    opacity: 0.5,
  });
  g.appendChild(ghostCircle);

  // --- Legs ---
  // Two legs from the rocker arc up to the seat.
  // In local (chair) frame: front leg at +seatDepth/2, back leg at -seatDepth/2
  // Both rise from the arc surface to seat height.

  const legOffsets = [seatDepth * 0.5, -seatDepth * 0.5]; // front, back in local-x
  const legTopLocalY = seatHeight - radius;                // seat level in local frame
  // Place leg bottoms on the arc at the angle corresponding to each leg offset
  for (const lx of legOffsets) {
    // Bottom of leg: on the arc surface
    const legAngle = Math.asin(Math.max(-1, Math.min(1, lx / radius)));
    const localBotX = radius * Math.sin(legAngle);
    const localBotY = -radius + radius * Math.cos(legAngle);

    // Top of leg: at seat level, same x
    const localTopX = lx;
    const localTopY = legTopLocalY;

    // Rotate into world frame
    const botX = arcCenterX + localBotX * Math.cos(theta) - localBotY * Math.sin(theta);
    const botY = arcCenterY + localBotX * Math.sin(theta) + localBotY * Math.cos(theta);
    const topX = arcCenterX + localTopX * Math.cos(theta) - localTopY * Math.sin(theta);
    const topY = arcCenterY + localTopX * Math.sin(theta) + localTopY * Math.cos(theta);

    g.appendChild(line(doc, botX * s, -botY * s, topX * s, -topY * s, COLOR_LEGS, 3));
  }

  // --- Seat ---
  // A horizontal plank in the chair's local frame, from front to back leg
  const seatHalfLen = seatDepth * 0.7; // seat extends a bit past the legs
  const seatThickness = 1; // 1 inch thick
  const seatCorners = [
    [-seatHalfLen, legTopLocalY],
    [seatHalfLen, legTopLocalY],
    [seatHalfLen, legTopLocalY + seatThickness],
    [-seatHalfLen, legTopLocalY + seatThickness],
  ];

  let seatPath = "";
  for (let i = 0; i < seatCorners.length; i++) {
    const [lx, ly] = seatCorners[i];
    const wx = arcCenterX + lx * Math.cos(theta) - ly * Math.sin(theta);
    const wy = arcCenterY + lx * Math.sin(theta) + ly * Math.cos(theta);
    seatPath += (i === 0 ? "M" : "L") + `${wx * s},${-wy * s}`;
  }
  seatPath += "Z";
  g.appendChild(svgEl(doc, "path", {
    d: seatPath,
    fill: COLOR_SEAT,
    stroke: COLOR_ROCKER,
    "stroke-width": 1.5,
  }));

  // --- Backrest ---
  const backW = 1;  // 1 inch thick
  const backH = seatDepth * 0.6; // backrest height proportional to seat depth
  const backCorners = [
    [-seatHalfLen, legTopLocalY + seatThickness],
    [-seatHalfLen + backW, legTopLocalY + seatThickness],
    [-seatHalfLen + backW + 2, legTopLocalY + seatThickness + backH], // slight lean back
    [-seatHalfLen, legTopLocalY + seatThickness + backH],
  ];

  let backPath = "";
  for (let i = 0; i < backCorners.length; i++) {
    const [lx, ly] = backCorners[i];
    const wx = arcCenterX + lx * Math.cos(theta) - ly * Math.sin(theta);
    const wy = arcCenterY + lx * Math.sin(theta) + ly * Math.cos(theta);
    backPath += (i === 0 ? "M" : "L") + `${wx * s},${-wy * s}`;
  }
  backPath += "Z";
  g.appendChild(svgEl(doc, "path", {
    d: backPath,
    fill: COLOR_BACK,
    stroke: COLOR_ROCKER,
    "stroke-width": 1,
  }));

  // --- Centre of gravity marker ---
  g.appendChild(svgEl(doc, "circle", {
    cx: cogX * s,
    cy: -cogY * s,
    r: 4,
    fill: COLOR_COG,
    opacity: 0.8,
  }));
  // Label
  const cogLabel = svgEl(doc, "text", {
    x: cogX * s + 8,
    y: -cogY * s - 8,
    "font-size": 10,
    fill: COLOR_COG,
    "font-family": "sans-serif",
  });
  cogLabel.textContent = "CoG";
  g.appendChild(cogLabel);

  // --- Contact point marker ---
  g.appendChild(svgEl(doc, "circle", {
    cx: contactX * s,
    cy: 0,
    r: 3,
    fill: COLOR_LEGS,
  }));

  return g;
}

/* ------------------------------------------------------------------ */
/*  Full scene (floor + chair + info)                                 */
/* ------------------------------------------------------------------ */

/**
 * Render the complete scene SVG at a given tilt angle.
 *
 * @param {object} doc
 * @param {object} model   – from buildRockerModel()
 * @param {number} theta   – tilt angle (rad)
 * @returns {SVGSVGElement}
 */
export function renderScene(doc, model, theta) {
  const { radius, seatHeight, cogAboveSeat } = model;
  const s = SCALE;

  // Viewport: generous padding around the chair
  const totalHeight = seatHeight + cogAboveSeat + 10;
  const halfWidth = radius * 0.7 + 10;
  const padTop = 10;
  const padBottom = 5;
  const vbX = -halfWidth * s;
  const vbY = -(totalHeight + padTop) * s;
  const vbW = 2 * halfWidth * s;
  const vbH = (totalHeight + padTop + padBottom) * s;

  const svg = svgEl(doc, "svg", {
    viewBox: `${vbX} ${vbY} ${vbW} ${vbH}`,
    width: "100%",
    preserveAspectRatio: "xMidYMid meet",
    "data-testid": "rocker-scene",
  });

  // Floor
  svg.appendChild(line(doc, vbX, 0, vbX + vbW, 0, COLOR_FLOOR, 2));

  // Chair profile
  svg.appendChild(renderChairProfile(doc, model, theta));

  return svg;
}

/* ------------------------------------------------------------------ */
/*  Info panel (static data readout)                                  */
/* ------------------------------------------------------------------ */

/**
 * Render an info panel showing computed model parameters.
 *
 * @param {object} doc
 * @param {object} model – from buildRockerModel()
 * @returns {HTMLElement} a <dl> definition list
 */
export function renderInfoPanel(doc, model) {
  const dl = doc.createElement("dl");
  dl.className = "rocker-info";

  const items = [
    ["Effective pendulum length", `${model.lEff.toFixed(1)} in`],
    ["Natural period", model.stable ? `${model.period.toFixed(2)} s` : "Unstable"],
    ["Rocks per minute", model.stable ? `${(60 / model.period).toFixed(1)}` : "—"],
    ["CoG above seat", `${model.cogAboveSeat.toFixed(1)} in`],
    ["CoG above floor", `${model.cogHeight.toFixed(1)} in`],
    ["Damping ratio", model.damping.toFixed(3)],
    ["Stability", model.stable ? "Stable" : "Unstable — CoG above rocker centre"],
  ];

  for (const [label, value] of items) {
    const dt = doc.createElement("dt");
    dt.textContent = label;
    dl.appendChild(dt);
    const dd = doc.createElement("dd");
    dd.textContent = value;
    if (!model.stable && label === "Stability") {
      dd.style.color = "#cc3333";
      dd.style.fontWeight = "bold";
    }
    dl.appendChild(dd);
  }

  return dl;
}
