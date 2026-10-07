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
 * How each posture preset is drawn.  The physics only sees the CoG
 * offset; these poses make the figure *look* like it is doing what the
 * preset says.
 *
 *   hipShift – inches the hips slide forward on the seat
 *   lean     – torso lean from vertical (rad, +back / −forward), or null
 *              to rest the torso against the backrest
 *   legAngle – lower-leg angle forward of vertical (rad)
 *   arms     – "lap" (hands in lap), "knees" (elbows on knees) or
 *              "behindHead" (hands clasped behind the head)
 */
const POSES = {
  neutral:        { hipShift: 0, lean: null,  legAngle: 0.1,  arms: "lap" },
  leaningForward: { hipShift: 1, lean: -0.35, legAngle: -0.1, arms: "knees" },
  legsForward:    { hipShift: 0, lean: null,  legAngle: 0.85, arms: "lap" },
  armsBack:       { hipShift: 0, lean: null,  legAngle: 0.1,  arms: "behindHead" },
  reclined:       { hipShift: 3, lean: null,  legAngle: 0.5,  arms: "lap" },
};

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
          sitterGender, sitterHeight, posture: postureKey } = model;
  const { arcCenterX, arcCenterY } = geom;
  const pose = POSES[postureKey] || POSES.neutral;
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

  // Hip position: the hip joint sits roughly mid-body, so place it half a
  // torso width forward of the backrest base — that puts the *back* of
  // the body at the backrest rather than the hip joint itself.  If the
  // sitter's thighs are shorter than the seat depth, scoot forward so the
  // knees always project past the front seat edge (prevents the lower leg
  // from visually intersecting the seat plank).
  let hipLX = -seatHalfLen + torsoHalfW;
  const hipLY = seatSurfaceY;

  // Knee: thigh length forward from hip, at seat surface level
  let kneeLX = hipLX + thighLen;
  if (kneeLX < seatHalfLen) {
    hipLX = seatHalfLen - thighLen;
    kneeLX = seatHalfLen;
  }
  // Posture: slide the hips (and so the knees) forward on the seat
  hipLX += pose.hipShift;
  kneeLX += pose.hipShift;
  const kneeLY = seatSurfaceY;

  // Foot: lower leg hangs from the knee at the pose's forward angle
  // (neutral is a slight natural lean of ~6°)
  const legForwardAngle = pose.legAngle; // radians
  const footLX = kneeLX + lowerLegLen * Math.sin(legForwardAngle);
  const footLY = kneeLY - lowerLegLen * Math.cos(legForwardAngle);

  const backAngleRad = ((backrestAngle || 100)) * Math.PI / 180;
  const backBaseX = -seatHalfLen;
  const backBaseY = seatHeight - radius;
  // Unit normal to the backrest line pointing toward the *front* of the
  // chair.  The backrest direction is (cos a, sin a) for a > 90° it runs
  // up-and-back, so the forward normal is (sin a, −cos a).
  const backNormX = Math.sin(backAngleRad);
  const backNormY = -Math.cos(backAngleRad);

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

  const torsoTriangleAtLean = (lean, shoulderX, shoulderY) => {
    // Perpendicular to torso axis (for triangle width)
    const tDx = shoulderX - hipLX;
    const tDy = shoulderY - hipLY;
    const tLen = Math.sqrt(tDx * tDx + tDy * tDy);
    const perpX = -tDy / tLen;
    const perpY = tDx / tLen;

    if (sitterGender === "female") {
      // △ — wider at hips, narrow at shoulders
      return [
        [shoulderX, shoulderY],
        [hipLX + perpX * torsoHalfW, hipLY + perpY * torsoHalfW],
        [hipLX - perpX * torsoHalfW, hipLY - perpY * torsoHalfW],
      ];
    }

    // ▽ — wider at shoulders, narrow at hips (default / male)
    return [
      [shoulderX + perpX * torsoHalfW, shoulderY + perpY * torsoHalfW],
      [shoulderX - perpX * torsoHalfW, shoulderY - perpY * torsoHalfW],
      [hipLX, hipLY],
    ];
  };

  // Positive means in front of / on backrest. Negative means behind it.
  const signedBackrestDistance = (x, y) =>
    (x - backBaseX) * backNormX + (y - backBaseY) * backNormY;

  const backrestClearanceAtLean = (lean) => {
    const p = postureAtLean(lean);
    const torsoTri = torsoTriangleAtLean(lean, p.shoulderX, p.shoulderY);
    const dists = [
      signedBackrestDistance(p.shoulderX, p.shoulderY),
      signedBackrestDistance(p.headX, p.headY),
      signedBackrestDistance(p.headBackX, p.headBackY),
      ...torsoTri.map(([x, y]) => signedBackrestDistance(x, y)),
    ];

    return {
      clear: dists.every((d) => d >= -1e-6),
      minDist: Math.min(...dists),
    };
  };

  // Resolve a natural lean that keeps the body from crossing the backrest.
  // Prefer a lean where the back/head are as close as possible to touching
  // the backrest; if the backrest is unreachable, this naturally settles at
  // either the best unsupported lean (up to 45°) or upright.
  let leanRad = 0;
  if (pose.lean !== null) {
    // Fixed lean (e.g. leaning forward, away from the backrest)
    leanRad = pose.lean;
  } else {
    let bestDist = Number.POSITIVE_INFINITY;
    const leanSteps = 180;
    for (let i = 0; i <= leanSteps; i++) {
      const lean = (maxLeanRad * i) / leanSteps;
      const { clear, minDist } = backrestClearanceAtLean(lean);
      if (!clear) {
        continue;
      }

      // Favor the smallest clearance (closest touch). For ties, prefer the
      // larger lean so an unsupported sitter uses available recline.
      const distGap = Math.abs(minDist - bestDist);
      if (minDist < bestDist - 1e-6 || (distGap <= 1e-6 && lean > leanRad)) {
        bestDist = minDist;
        leanRad = lean;
        if (bestDist <= 1e-4) {
          break;
        }
      }
    }
  }

  // Final shoulder/head from resolved lean.
  const posture = postureAtLean(leanRad);
  const shoulderLX = posture.shoulderX;
  const shoulderLY = posture.shoulderY;
  const headLX = posture.headX;
  const headLY = posture.headY;

  // --- Torso triangle ---
  const triLocal = torsoTriangleAtLean(leanRad, shoulderLX, shoulderLY);

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
  g.appendChild(line(doc, hipWX * s, -hipWY * s,
                          kneeWX * s, -kneeWY * s, COLOR_PERSON, 2));

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

  // --- Arms (elbow and hand positions depend on the pose) ---
  const upperArmLen = sitterHeight * 0.19;
  let elbowLX;
  let elbowLY;
  let handLX;
  let handLY;
  if (pose.arms === "knees") {
    // Leaning forward: elbows resting near the knees, hands hanging past them
    elbowLX = kneeLX - 2;
    elbowLY = seatSurfaceY + 3;
    handLX = kneeLX + 2;
    handLY = seatSurfaceY - 1;
  } else if (pose.arms === "behindHead") {
    // Arms back: elbows out behind the shoulders, hands at the back of the head
    elbowLX = shoulderLX - upperArmLen * 0.55;
    elbowLY = shoulderLY + upperArmLen * 0.45;
    handLX = posture.headBackX;
    handLY = posture.headBackY;
  } else {
    // Hands in lap: upper arm down toward the lap, forearm to the knees
    elbowLX = hipLX + seatDepth * 0.15;
    elbowLY = seatSurfaceY + torsoLen * 0.2;
    handLX = hipLX + (kneeLX - hipLX) * 0.75;
    handLY = seatSurfaceY + 1;
  }
  const [elbowWX, elbowWY] = localToWorld(elbowLX, elbowLY,
                                           arcCenterX, arcCenterY, theta);
  const upperArmLine = line(doc, shoulderWX * s, -shoulderWY * s,
                                 elbowWX * s, -elbowWY * s, COLOR_PERSON, 2);
  upperArmLine.setAttribute("data-testid", "stick-upper-arm");
  g.appendChild(upperArmLine);

  const [handWX, handWY] = localToWorld(handLX, handLY,
                                         arcCenterX, arcCenterY, theta);
  const forearmLine = line(doc, elbowWX * s, -elbowWY * s,
                                handWX * s, -handWY * s, COLOR_PERSON, 2);
  forearmLine.setAttribute("data-testid", "stick-forearm");
  g.appendChild(forearmLine);

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
 * @param {object}  [options]
 * @param {boolean} [options.showDetails=false] – also draw the centre of
 *   gravity and its plumb line (toggled by tapping the radius centre)
 * @returns {SVGGElement}
 */
export function renderChairProfile(doc, model, theta, options = {}) {
  const { showDetails = false } = options;
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

  // --- Rocker radius centre ---
  // The centre of the arc the rockers are cut to.  For a circle rolling
  // on a flat floor it always sits directly above the contact point at
  // height R, so the dashed radius line is the chair's current "plumb"
  // reference — an important part of drafting the curve against the seat.
  // Tapping the marker toggles the extra details (centre of gravity).
  const rc = svgEl(doc, "g", {
    "data-testid": "radius-center",
    role: "button",
    tabindex: 0,
    "aria-pressed": showDetails ? "true" : "false",
    "aria-label": showDetails ? "Hide centre of gravity" : "Show centre of gravity",
    style: "cursor: pointer",
  });
  const rcTitle = svgEl(doc, "title");
  rcTitle.textContent = showDetails ? "Tap to hide details" : "Tap to show details";
  rc.appendChild(rcTitle);
  // Generous invisible hit target around the marker for touch
  rc.appendChild(svgEl(doc, "circle", {
    cx: arcCenterX * s,
    cy: -arcCenterY * s,
    r: 16,
    fill: "transparent",
    "data-testid": "radius-center-hit",
  }));
  rc.appendChild(line(doc, arcCenterX * s, -arcCenterY * s, contactX * s, 0,
    COLOR_ROCKER, 1, "6 4"));
  const crossLen = 2 * s;
  rc.appendChild(line(doc, (arcCenterX * s) - crossLen, -arcCenterY * s,
    (arcCenterX * s) + crossLen, -arcCenterY * s, COLOR_ROCKER, 1.5));
  rc.appendChild(line(doc, arcCenterX * s, (-arcCenterY * s) - crossLen,
    arcCenterX * s, (-arcCenterY * s) + crossLen, COLOR_ROCKER, 1.5));
  rc.appendChild(svgEl(doc, "circle", {
    cx: arcCenterX * s,
    cy: -arcCenterY * s,
    r: 4,
    fill: "none",
    stroke: COLOR_ROCKER,
    "stroke-width": 1.5,
  }));
  // Two short lines plus a hint so the label stays inside the fixed
  // frame while the chair rocks fore and aft.
  const rcTextAttrs = {
    x: arcCenterX * s + 10,
    "font-size": 10,
    fill: COLOR_ROCKER,
    "font-family": "sans-serif",
  };
  const rcLabel = svgEl(doc, "text", { ...rcTextAttrs, y: -arcCenterY * s - 8 });
  rcLabel.textContent = "Rocker radius center";
  rc.appendChild(rcLabel);
  const rcValue = svgEl(doc, "text", { ...rcTextAttrs, y: -arcCenterY * s + 4 });
  rcValue.textContent = `R = ${radius} in`;
  rc.appendChild(rcValue);
  const rcHint = svgEl(doc, "text", {
    ...rcTextAttrs,
    y: -arcCenterY * s + 15,
    "font-size": 8,
    opacity: 0.65,
  });
  rcHint.textContent = showDetails ? "tap to hide details" : "tap for details";
  rc.appendChild(rcHint);
  g.appendChild(rc);

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

  // --- Chair centreline (℄) ---
  // Dotted line midway between the legs, from the rocker surface up to
  // the seat.  It rotates with the chair, so at rest it coincides with
  // the plumb radius line and diverges from it as the chair rocks.
  const clLocalBotY = -radius;      // rocker surface at local x = 0
  const clLocalTopY = legTopLocalY; // seat
  const [clBotX, clBotY] = localToWorld(0, clLocalBotY, arcCenterX, arcCenterY, theta);
  const [clTopX, clTopY] = localToWorld(0, clLocalTopY, arcCenterX, arcCenterY, theta);
  const cl = svgEl(doc, "g", { "data-testid": "centerline" });
  const clLine = line(doc, clBotX * s, -clBotY * s, clTopX * s, -clTopY * s,
    COLOR_LEGS, 1, "1.5 3");
  clLine.setAttribute("stroke-linecap", "round");
  cl.appendChild(clLine);
  // Label beside the line, midway up, in the clear space between the legs
  const [clMidX, clMidY] = localToWorld(0, (clLocalBotY + clLocalTopY) / 2,
                                        arcCenterX, arcCenterY, theta);
  const clLabel = svgEl(doc, "text", {
    x: clMidX * s + 5,
    y: -clMidY * s + 4,
    "font-size": 12,
    fill: COLOR_LEGS,
    "font-family": "sans-serif",
  });
  clLabel.textContent = "\u2104"; // ℄ centre line symbol
  cl.appendChild(clLabel);
  g.appendChild(cl);

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

  // --- Centre of gravity marker (details only) ---
  // Combined chair + sitter centre of gravity.  At rest it sits plumb
  // over the rocker contact point; while rocking the plumb line lands
  // fore or aft of the contact, which is what rolls the chair back.
  if (showDetails) {
    const cog = svgEl(doc, "g", { "data-testid": "cog" });
    cog.appendChild(line(doc, cogX * s, -cogY * s, cogX * s, 0, COLOR_COG, 1, "3 3"));
    cog.appendChild(svgEl(doc, "circle", {
      cx: cogX * s,
      cy: -cogY * s,
      r: 4,
      fill: COLOR_COG,
      opacity: 0.8,
    }));
    // Keep the CoG and radius-centre labels apart when the two points are
    // close together (small radius): whichever point is lower gets its
    // label below-right, the upper one above-right.
    const labelGap = Math.abs(cogY - arcCenterY);
    const cogLabelBelow = labelGap < 6 && cogY <= arcCenterY;
    const cogLabel = svgEl(doc, "text", {
      x: cogX * s + 8,
      y: cogLabelBelow ? -cogY * s + 14 : -cogY * s - 8,
      "font-size": 10,
      fill: COLOR_COG,
      "font-family": "sans-serif",
    });
    cogLabel.textContent = "Center of gravity";
    cog.appendChild(cogLabel);
    g.appendChild(cog);
    if (labelGap < 6 && cogY > arcCenterY) {
      // CoG label is just above the centre: push the centre's text down
      rcLabel.setAttribute("y", -arcCenterY * s + 14);
      rcValue.setAttribute("y", -arcCenterY * s + 26);
      rcHint.setAttribute("y", -arcCenterY * s + 37);
    }
  }

  // --- Contact point marker ---
  const contact = svgEl(doc, "g", { "data-testid": "contact-point" });
  contact.appendChild(svgEl(doc, "circle", {
    cx: contactX * s,
    cy: 0,
    r: 3,
    fill: COLOR_LEGS,
  }));
  const contactLabel = svgEl(doc, "text", {
    x: contactX * s,
    y: 14,
    "font-size": 10,
    fill: COLOR_LEGS,
    "font-family": "sans-serif",
    "text-anchor": "middle",
  });
  contactLabel.textContent = "Rocker contact point";
  contact.appendChild(contactLabel);
  g.appendChild(contact);

  return g;
}

/* ------------------------------------------------------------------ */
/*  Full scene (floor + chair + info)                                 */
/* ------------------------------------------------------------------ */

// Fixed viewport, in inches.  The drawing scale must not jump around as
// the radius (or anything else) is adjusted, otherwise the diagram's
// rendered height changes and the data table below it moves.  The view
// only grows beyond these bounds when something would otherwise be
// clipped (a very tall sitter or a radius whose centre would be off the
// top of the picture).
const VIEW_HALF_WIDTH = 48;   // either side of the level contact point
const VIEW_TOP = 64;          // above the floor
const VIEW_BELOW_FLOOR = 6;   // floor shown below the contact line

/**
 * Render the complete scene SVG at a given tilt angle.
 *
 * @param {object} doc
 * @param {object} model   – from buildRockerModel()
 * @param {number} theta   – tilt angle (rad)
 * @param {object} [options] – see renderChairProfile()
 * @returns {SVGSVGElement}
 */
export function renderScene(doc, model, theta, options = {}) {
  const { radius, seatHeight } = model;
  const s = SCALE;

  // Top of the sitter's head when sitting upright, plus a margin.
  const sittingHt = (model.sitterHeight || 68) * 0.52;
  const personTop = seatHeight + sittingHt * 0.6 + 4;
  // Keep the rocker's radius centre in view for large radii.
  const top = Math.max(VIEW_TOP, personTop, radius + 6);

  const vbX = -VIEW_HALF_WIDTH * s;
  const vbY = -top * s;
  const vbW = 2 * VIEW_HALF_WIDTH * s;
  const vbH = (top + VIEW_BELOW_FLOOR) * s;

  const svg = svgEl(doc, "svg", {
    viewBox: `${vbX} ${vbY} ${vbW} ${vbH}`,
    width: "100%",
    preserveAspectRatio: "xMidYMid meet",
    "data-testid": "rocker-scene",
  });

  // Floor
  svg.appendChild(line(doc, vbX, 0, vbX + vbW, 0, COLOR_FLOOR, 2));

  // Chair profile
  svg.appendChild(renderChairProfile(doc, model, theta, options));

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
    ? Math.abs(model.thetaEq * 180 / Math.PI).toFixed(1)
    : "0.0";
  // Positive θ rocks the chair forward (see rockerGeometry); show the
  // magnitude with a direction word rather than a signed angle.
  const tiltDir = model.thetaEq > 0.001 ? " (fwd)"
                : model.thetaEq < -0.001 ? " (back)" : "";

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
