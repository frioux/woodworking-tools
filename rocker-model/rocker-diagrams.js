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
const COLOR_PERSON   = "#555555";   // stick figure limbs
const COLOR_TORSO    = "#666666";   // stick figure torso fill

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
/*  Local-to-world coordinate transform                               */
/* ------------------------------------------------------------------ */

/**
 * Transform a point from local (chair) frame to world frame.
 * @returns {[number, number]} [worldX, worldY]
 */
function localToWorld(lx, ly, arcCenterX, arcCenterY, theta) {
  const wx = arcCenterX + lx * Math.cos(theta) + ly * Math.sin(theta);
  const wy = arcCenterY - lx * Math.sin(theta) + ly * Math.cos(theta);
  return [wx, wy];
}

/* ------------------------------------------------------------------ */
/*  Stick figure renderer                                             */
/* ------------------------------------------------------------------ */

/**
 * Render a stick figure person sitting in the chair.
 *
 * The torso is drawn as a triangle whose orientation depends on gender:
 *   – Male:   inverted triangle (▽) — wider at shoulders (weight up top)
 *   – Female: upright triangle  (△) — wider at hips (weight lower)
 *
 * All geometry is computed in the local (chair) frame and then rotated
 * into the world frame by θ, just like the rest of the chair.
 *
 * @param {object} doc
 * @param {object} model  – from buildRockerModel()
 * @param {number} theta  – current tilt angle (rad)
 * @param {object} geom   – from rockerGeometry()
 * @returns {SVGGElement}
 */
function renderStickFigure(doc, model, theta, geom) {
  const { radius, seatHeight, seatDepth, backrestAngle,
          sitterGender, sitterHeight } = model;
  const { arcCenterX, arcCenterY } = geom;
  const s = SCALE;
  const g = svgEl(doc, "g");

  // Seat surface in local frame (top of seat plank)
  const seatThickness = 1;
  const seatSurfaceY = seatHeight - radius + seatThickness;

  // Front/back edge of the seat in local frame (actual seat depth)
  const seatHalfLen = seatDepth / 2;

  // Sitting height and body proportions (all in inches, local frame)
  const sittingHt = sitterHeight * 0.52;
  const headR     = sittingHt * 0.07;
  const torsoLen  = sittingHt * 0.38;
  const torsoHalfW = sittingHt * 0.08;

  // Leg proportions — typical seated human ratios, gender-differentiated
  // Thigh (hip to knee, horizontal): ~23% male, ~22% female of standing height
  // Lower leg (knee to ankle): ~22.5% male, ~21.5% female of standing height
  const thighLen    = sitterHeight * (sitterGender === "female" ? 0.22 : 0.23);
  const lowerLegLen = sitterHeight * (sitterGender === "female" ? 0.215 : 0.225);

  // Lean angle: how far the torso tilts back from vertical.
  // We cap unsupported leaning at 45° and prevent the body from crossing
  // behind the backrest line. If the backrest is too far away (short sitter,
  // deep seat), the sitter can still lean back unsupported up to this cap.
  const maxLeanRad = Math.PI / 4;

  const backAngleRad = ((backrestAngle || 100)) * Math.PI / 180;
  const backBaseX = -seatHalfLen;
  const backBaseY = seatHeight - radius;

  // Hip position: start at the base of the backrest. If the sitter's
  // thighs are shorter than the seat depth, scoot forward so the knees
  // project past the front seat edge, but never allow hips behind the
  // backrest base.
  let hipLX = -seatHalfLen;
  const hipLY = seatSurfaceY;

  // Knee: thigh length forward from hip, at seat surface level
  let kneeLX = hipLX + thighLen;
  if (kneeLX < seatHalfLen) {
    hipLX = seatHalfLen - thighLen;
    kneeLX = seatHalfLen;
  }
  if (hipLX < backBaseX) {
    hipLX = backBaseX;
    kneeLX = hipLX + thighLen;
  }
  const kneeLY = seatSurfaceY;

  // Foot: lower leg hangs from knee with a slight natural forward lean (~6°)
  const legForwardAngle = 0.1; // radians
  const footLX = kneeLX + lowerLegLen * Math.sin(legForwardAngle);
  const footLY = kneeLY - lowerLegLen * Math.cos(legForwardAngle);

  const postureAtLean = (lean) => {
    const shoulderX = hipLX - torsoLen * Math.sin(lean);
    const shoulderY = hipLY + torsoLen * Math.cos(lean);
    const headX = shoulderX - (headR * 2) * Math.sin(lean);
    const headY = shoulderY + (headR * 2) * Math.cos(lean);
    // Back-of-head point (furthest aft point of the circle)
    const headBackX = headX - headR * Math.cos(lean);
    const headBackY = headY - headR * Math.sin(lean);
    return {
      shoulderX, shoulderY, headX, headY, headBackX, headBackY,
    };
  };

  // Positive means in front of / on backrest. Negative means behind it.
  // In local coordinates, "behind" means farther aft (more negative X)
  // than the backrest line at the same Y.
  const signedBackrestDistance = (x, y) => {
    const yRel = y - backBaseY;
    const xOnBackrest = backBaseX + yRel * (Math.cos(backAngleRad) / Math.sin(backAngleRad));
    return x - xOnBackrest;
  };

  const clearsBackrest = (lean) => {
    const p = postureAtLean(lean);
    const shoulderDist = signedBackrestDistance(p.shoulderX, p.shoulderY);
    const headDist = signedBackrestDistance(p.headX, p.headY);
    const headBackDist = signedBackrestDistance(p.headBackX, p.headBackY);
    return shoulderDist >= -1e-6 && headDist >= -1e-6 && headBackDist >= -1e-6;
  };

  // Start from upright and find the maximum lean that still stays in front
  // of the backrest, up to 45°.
  let leanRad = 0;
  if (clearsBackrest(maxLeanRad)) {
    leanRad = maxLeanRad;
  } else {
    let lo = 0;
    let hi = maxLeanRad;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) * 0.5;
      if (clearsBackrest(mid)) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    leanRad = lo;
  }

  // Final shoulder/head from resolved lean.
  const posture = postureAtLean(leanRad);
  const shoulderLX = posture.shoulderX;
  const shoulderLY = posture.shoulderY;
  const headLX = posture.headX;
  const headLY = posture.headY;

  // --- Torso triangle ---
  // Perpendicular to torso axis (for triangle width)
  const tDx = shoulderLX - hipLX;
  const tDy = shoulderLY - hipLY;
  const tLen = Math.sqrt(tDx * tDx + tDy * tDy);
  const perpX = -tDy / tLen;
  const perpY = tDx / tLen;

  let triLocal;
  if (sitterGender === "female") {
    // △ — wider at hips, narrow at shoulders
    triLocal = [
      [shoulderLX, shoulderLY],
      [hipLX + perpX * torsoHalfW, hipLY + perpY * torsoHalfW],
      [hipLX - perpX * torsoHalfW, hipLY - perpY * torsoHalfW],
    ];
  } else {
    // ▽ — wider at shoulders, narrow at hips (default / male)
    triLocal = [
      [shoulderLX + perpX * torsoHalfW, shoulderLY + perpY * torsoHalfW],
      [shoulderLX - perpX * torsoHalfW, shoulderLY - perpY * torsoHalfW],
      [hipLX, hipLY],
    ];
  }

  let triPath = "";
  for (let i = 0; i < triLocal.length; i++) {
    const [wx, wy] = localToWorld(triLocal[i][0], triLocal[i][1],
                                   arcCenterX, arcCenterY, theta);
    triPath += (i === 0 ? "M" : "L") + `${wx * s},${-wy * s}`;
  }
  triPath += "Z";
  g.appendChild(svgEl(doc, "path", {
    d: triPath,
    fill: COLOR_TORSO,
    stroke: COLOR_PERSON,
    "stroke-width": 1.5,
    opacity: 0.7,
    "data-testid": "stick-torso",
  }));

  // --- Head ---
  const [headWX, headWY] = localToWorld(headLX, headLY,
                                         arcCenterX, arcCenterY, theta);
  g.appendChild(svgEl(doc, "circle", {
    cx: headWX * s,
    cy: -headWY * s,
    r: headR * s,
    fill: "none",
    stroke: COLOR_PERSON,
    "stroke-width": 2,
    "data-testid": "stick-head",
  }));

  // --- Neck (shoulder to head base) ---
  const [shoulderWX, shoulderWY] = localToWorld(shoulderLX, shoulderLY,
                                                 arcCenterX, arcCenterY, theta);
  const neckBaseLX = shoulderLX - headR * 0.3 * Math.sin(leanRad);
  const neckBaseLY = shoulderLY + headR * 0.3 * Math.cos(leanRad);
  const [neckWX, neckWY] = localToWorld(neckBaseLX, neckBaseLY,
                                         arcCenterX, arcCenterY, theta);
  g.appendChild(line(doc, shoulderWX * s, -shoulderWY * s,
                          neckWX * s, -neckWY * s, COLOR_PERSON, 2));

  // --- Upper legs (hips to knees, along the seat) ---
  const [hipWX, hipWY] = localToWorld(hipLX, hipLY,
                                       arcCenterX, arcCenterY, theta);
  const [kneeWX, kneeWY] = localToWorld(kneeLX, kneeLY,
                                         arcCenterX, arcCenterY, theta);
  const upperLegLine = line(doc, hipWX * s, -hipWY * s,
                              kneeWX * s, -kneeWY * s, COLOR_PERSON, 2);
  upperLegLine.setAttribute("data-testid", "stick-upper-leg");
  g.appendChild(upperLegLine);

  // --- Lower legs (knee to foot, length proportional to sitter height) ---
  let [footWX, footWY] = localToWorld(footLX, footLY,
                                       arcCenterX, arcCenterY, theta);
  // Clamp foot to the floor — tall sitters (or low seats) can put the foot
  // below world Y = 0.  Intersect the lower-leg segment with y = 0 so the
  // foot touches but never crosses the floor line.
  if (footWY < 0) {
    if (kneeWY > 0) {
      const t = kneeWY / (kneeWY - footWY);
      footWX = kneeWX + t * (footWX - kneeWX);
    }
    footWY = 0;
  }
  const lowerLegLine = line(doc, kneeWX * s, -kneeWY * s,
                                footWX * s, -footWY * s, COLOR_PERSON, 2);
  lowerLegLine.setAttribute("data-testid", "stick-lower-leg");
  g.appendChild(lowerLegLine);

  // --- Upper arm (shoulder forward/down toward lap) ---
  const elbowLX = hipLX + seatDepth * 0.15;
  const elbowLY = seatSurfaceY + torsoLen * 0.2;
  const [elbowWX, elbowWY] = localToWorld(elbowLX, elbowLY,
                                           arcCenterX, arcCenterY, theta);
  g.appendChild(line(doc, shoulderWX * s, -shoulderWY * s,
                          elbowWX * s, -elbowWY * s, COLOR_PERSON, 2));

  // --- Forearm (elbow to lap/knee area) ---
  const handLX = kneeLX * 0.5;
  const handLY = seatSurfaceY + 1;
  const [handWX, handWY] = localToWorld(handLX, handLY,
                                         arcCenterX, arcCenterY, theta);
  g.appendChild(line(doc, elbowWX * s, -elbowWY * s,
                          handWX * s, -handWY * s, COLOR_PERSON, 2));

  return g;
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
  const { radius, seatHeight, seatDepth, backrestAngle, cogAboveSeat,
          cogOffsetX = 0, sitterHeight = 68 } = model;
  const g = svgEl(doc, "g");

  const geom = rockerGeometry(radius, seatHeight, seatDepth, cogAboveSeat, theta, cogOffsetX);
  const { contactX, cogX, cogY, arcCenterX, arcCenterY } = geom;

  const s = SCALE;

  // --- Rocker arc (the curved runner) ---
  // Draw a generous portion of the arc so rolling on the floor is visible.
  // The physical rocker spans ±arcAngle from the body bottom.  The body
  // bottom is at world-frame angle −θ from vertical (CW rotation).
  const arcAngle = Math.PI / 3.2;
  const arcGroup = svgEl(doc, "g");

  const steps = 40;
  let pathD = "";
  for (let i = 0; i <= steps; i++) {
    const a = -theta - arcAngle + (2 * arcAngle * i) / steps;
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

  // --- Floor contact indicator (small tick at contact point) ---
  const tickLen = 1.5 * s;
  g.appendChild(line(doc, contactX * s, 0, contactX * s, -tickLen, COLOR_FLOOR, 1.5));

  // --- Legs ---
  // Two legs from the rocker arc up to the seat.
  // In local (chair) frame: front leg at +seatDepth/2, back leg at -seatDepth/2
  // Both rise from the arc surface to seat height.

  const legOffsets = [seatDepth * 0.5, -seatDepth * 0.5]; // front, back in local-x
  const legTopLocalY = seatHeight - radius;                // seat level in local frame
  // Place leg bottoms on the arc at the angle corresponding to each leg offset
  for (const lx of legOffsets) {
    // Bottom of leg: on the arc surface (relative to arc centre)
    const legAngle = Math.asin(Math.max(-1, Math.min(1, lx / radius)));
    const localBotX = radius * Math.sin(legAngle);
    const localBotY = -radius * Math.cos(legAngle);

    // Top of leg: at seat level, same x
    const localTopX = lx;
    const localTopY = legTopLocalY;

    // Rotate into world frame (clockwise by θ)
    const botX = arcCenterX + localBotX * Math.cos(theta) + localBotY * Math.sin(theta);
    const botY = arcCenterY - localBotX * Math.sin(theta) + localBotY * Math.cos(theta);
    const topX = arcCenterX + localTopX * Math.cos(theta) + localTopY * Math.sin(theta);
    const topY = arcCenterY - localTopX * Math.sin(theta) + localTopY * Math.cos(theta);

    g.appendChild(line(doc, botX * s, -botY * s, topX * s, -topY * s, COLOR_LEGS, 3));
  }

  // --- Seat ---
  // A horizontal line in the chair's local frame, from front to back
  const seatHalfLen = seatDepth / 2; // seat spans its full depth

  const seatEnds = [
    [-seatHalfLen, legTopLocalY],
    [seatHalfLen, legTopLocalY],
  ];
  const seatWorld = seatEnds.map(([lx, ly]) => [
    arcCenterX + lx * Math.cos(theta) + ly * Math.sin(theta),
    arcCenterY - lx * Math.sin(theta) + ly * Math.cos(theta),
  ]);
  g.appendChild(line(doc,
    seatWorld[0][0] * s, -seatWorld[0][1] * s,
    seatWorld[1][0] * s, -seatWorld[1][1] * s,
    COLOR_SEAT, 3));

  // --- Backrest (straight line from rear seat edge) ---
  // Scale backrest height to the sitter's torso + head so the figure
  // doesn't project past the end of the backrest.
  // backrestAngle is degrees from the seat surface; 90 = vertical, >90 = lean back.
  // In the local frame the seat is horizontal, so the angle from the +x axis
  // (pointing forward) to the backrest direction equals the backrestAngle directly.
  const backAngleRad = ((backrestAngle || 100)) * Math.PI / 180;
  const sittingHtLocal = sitterHeight * 0.52;
  // The stick figure's hip sits on the seat surface (seatThickness above
  // the backrest base).  The head is a circle whose vertical top extends
  // headR above its centre.  Solve for the backH that makes the backrest
  // line's vertical extent reach at least the head-circle top.
  const seatThickness = 1;               // matches renderStickFigure
  const torsoLen = sittingHtLocal * 0.38;
  const headR    = sittingHtLocal * 0.07;
  const backH = torsoLen + 3 * headR
              + (seatThickness + headR) / Math.sin(backAngleRad);
  const localBaseX = -seatHalfLen;
  const localBaseY = legTopLocalY;
  const localTopX = localBaseX + backH * Math.cos(backAngleRad);
  const localTopY = localBaseY + backH * Math.sin(backAngleRad);

  // Rotate into world frame
  const backBaseWX = arcCenterX + localBaseX * Math.cos(theta) + localBaseY * Math.sin(theta);
  const backBaseWY = arcCenterY - localBaseX * Math.sin(theta) + localBaseY * Math.cos(theta);
  const backTopWX = arcCenterX + localTopX * Math.cos(theta) + localTopY * Math.sin(theta);
  const backTopWY = arcCenterY - localTopX * Math.sin(theta) + localTopY * Math.cos(theta);

  g.appendChild(line(doc, backBaseWX * s, -backBaseWY * s,
    backTopWX * s, -backTopWY * s, COLOR_BACK, 3));

  // --- Stick figure (sitter) ---
  g.appendChild(renderStickFigure(doc, model, theta, geom));

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

  // Viewport: generous padding around the chair.
  // Use the taller of (CoG + margin) or (person top + margin) so the
  // full stick figure is never clipped, even when a heavy chair pulls
  // the system CoG well below the sitter's head.
  const sittingHt = (model.sitterHeight || 68) * 0.52;
  const totalHeight = seatHeight + Math.max(cogAboveSeat + 10, sittingHt * 0.6 + 3);
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

  const thetaEqDeg = model.thetaEq !== undefined && model.thetaEq !== null
    ? (model.thetaEq * 180 / Math.PI).toFixed(1)
    : "0.0";
  const tiltDir = model.thetaEq > 0.001 ? " (back)"
                : model.thetaEq < -0.001 ? " (fwd)" : "";

  const items = [
    ["Natural tilt", `${thetaEqDeg}°${tiltDir}`],
    ["Effective pendulum length", `${model.lEff.toFixed(1)} in`],
    ["Natural period", model.stable ? `${model.period.toFixed(2)} s` : "Unstable"],
    ["Rocks per minute", model.stable ? `${(60 / model.period).toFixed(1)}` : "—"],
    ["Seat swing", model.stable
      ? `± ${(model.seatHeight * model.initialAmplitude).toFixed(1)} in`
      : "—"],
    ["System CoG above floor", `${model.cogHeight.toFixed(1)} in`],
    ["CoG fore/aft offset", `${(model.cogOffsetX || 0).toFixed(1)} in`],
    ["Gap (R − CoG)", `${(model.radius - model.cogHeight).toFixed(1)} in`],
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
