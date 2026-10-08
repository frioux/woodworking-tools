/**
 * Galbert's Rocker Model — SVG rendering
 *
 * Draws a side-view profile of a rocking chair that animates rocking.
 * DOM-agnostic: accepts a `doc` parameter (browser `document` or happy-dom).
 */

import { rockerGeometry, localToWorld, runnerExtent, backrestLength, sitterPose } from "./rocker-math.js";

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
/*  Stick figure renderer                                             */
/* ------------------------------------------------------------------ */

/**
 * Render a stick figure person sitting in the chair.
 *
 * The figure's joints come from sitterPose() in rocker-math.js — the
 * same skeleton the physics weighs to find the centre of gravity — so
 * what is drawn is what is balanced.  The torso is a triangle whose
 * orientation depends on gender:
 *   – Male:   inverted triangle (▽) — wider at shoulders (weight up top)
 *   – Female: upright triangle  (△) — wider at hips (weight lower)
 *
 * The pose is in seat-relative coordinates; it is moved into the
 * chair's local frame and then rotated into the world frame by θ,
 * just like the rest of the chair.
 *
 * Normally the figure is drawn in the chair's frame (`theta`, `geom`).
 * When the sitter has been thrown out of the chair, `frame` gives the
 * figure its own frame instead: the same local coordinates placed by a
 * different origin and rotation, so the pose is kept while the body
 * tumbles as one piece.
 *
 * @param {object} doc
 * @param {object} model  – from buildRockerModel()
 * @param {number} theta  – current tilt angle (rad)
 * @param {object} geom   – from rockerGeometry()
 * @param {object} [frame] – {theta, arcCenterX, arcCenterY, lift, say}
 *   lift: raise the whole figure so nothing pokes through the floor
 *   say:  a short word drawn beside the head
 * @returns {SVGGElement}
 */
function renderStickFigure(doc, model, chairTheta, geom, frame = null) {
  const { radius, seatHeight, contactOffset = 0 } = model;
  const pose = model.pose || sitterPose(model);
  const theta = frame ? frame.theta : chairTheta;
  const arcCenterX = frame ? frame.arcCenterX : geom.arcCenterX;
  const arcCenterY = frame ? frame.arcCenterY : geom.arcCenterY;
  const s = SCALE;
  const g = svgEl(doc, "g", { "data-testid": "sitter" });
  // Every world point drawn, so the figure can be lifted clear of the floor
  const drawn = [];
  // Seat-relative pose coordinates → chair local frame → world
  const seatCX = -contactOffset;
  const seatLY = seatHeight - radius;
  const toWorld = ([x, y]) => {
    const w = localToWorld(x + seatCX, y + seatLY, arcCenterX, arcCenterY, theta);
    drawn.push(w);
    return w;
  };
  const stroke = (a, b, testid) => {
    const [ax, ay] = toWorld(a);
    const [bx, by] = toWorld(b);
    const ln = line(doc, ax * s, -ay * s, bx * s, -by * s, COLOR_PERSON, 2);
    if (testid) {
      ln.setAttribute("data-testid", testid);
    }
    g.appendChild(ln);
    return ln;
  };

  const { hip, knee, foot, shoulder, neckBase, head, elbow, hand } = pose.joints;

  // --- Torso triangle ---
  let triPath = "";
  pose.torso.forEach((pt, i) => {
    const [wx, wy] = toWorld(pt);
    triPath += (i === 0 ? "M" : "L") + `${wx * s},${-wy * s}`;
  });
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
  const [headWX, headWY] = toWorld(head);
  g.appendChild(svgEl(doc, "circle", {
    cx: headWX * s,
    cy: -headWY * s,
    r: pose.headR * s,
    fill: "none",
    stroke: COLOR_PERSON,
    "stroke-width": 2,
    "data-testid": "stick-head",
  }));

  // --- Neck (shoulder to head base) ---
  stroke(shoulder, neckBase);

  // --- Upper legs (hips to knees) ---
  stroke(hip, knee, "stick-upper-leg");

  // --- Lower legs (knee to foot) ---
  // The pose puts the feet on (or above) the floor with the chair level.
  // While the chair rocks the feet swing with it; rather than let them
  // pass through the floor, shorten the drawn shin to where it meets
  // the floor line.
  const [kneeWX, kneeWY] = toWorld(knee);
  let [footWX, footWY] = toWorld(foot);
  if (footWY < 0 && !frame?.lift) {
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

  // --- Arms ---
  stroke(shoulder, elbow, "stick-upper-arm");
  stroke(elbow, hand, "stick-forearm");

  // --- Thrown clear: keep the heap on top of the floor, and complain ---
  if (frame?.lift) {
    // Lowest drawn point, allowing for the head's radius
    const lowest = Math.min(...drawn.map(([, wy]) => wy), headWY - pose.headR);
    if (lowest < 0) {
      g.setAttribute("transform", `translate(0, ${lowest * s})`);
    }
  }
  if (frame?.say) {
    const say = svgEl(doc, "text", {
      x: headWX * s + pose.headR * s + 4,
      y: -headWY * s - pose.headR * s,
      "font-size": 12,
      "font-weight": "bold",
      fill: COLOR_PERSON,
      "font-family": "sans-serif",
      "data-testid": "sitter-say",
    });
    say.textContent = frame.say;
    g.appendChild(say);
  }

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
 * @param {object}  [options.geom] – chair geometry to draw instead of the
 *   rolling geometry for `theta` (used while the chair is falling over,
 *   see buildFall())
 * @param {object}  [options.sitter] – draw the sitter in their own frame
 *   instead of in the chair (see renderStickFigure())
 * @returns {SVGGElement}
 */
export function renderChairProfile(doc, model, theta, options = {}) {
  const { showDetails = false, sitter = null } = options;
  const { radius, seatHeight, seatDepth, backrestAngle, cogAboveSeat,
          contactOffset = 0, sitterHeight = 68 } = model;
  const cogLocalX = model.cogLocalX ?? ((model.cogOffsetX || 0) - contactOffset);
  const g = svgEl(doc, "g");

  const geom = options.geom
    || rockerGeometry(radius, seatHeight, seatDepth, cogAboveSeat, theta, cogLocalX, contactOffset);
  const { contactX, cogX, cogY, arcCenterX, arcCenterY } = geom;

  const s = SCALE;
  // Seat centre in the chair's local frame: the level contact point is
  // `contactOffset` ahead of it (see legLengths() in rocker-math.js)
  const seatCX = -contactOffset;

  // --- Rocker arc (the curved runner) ---
  // The runner is a real length of wood: it runs from the rear overhang
  // to the front overhang (see runnerExtent()).  In the world frame the
  // body bottom sits at angle −θ from vertical (CW rotation), so a point
  // at local angle `a` along the runner is drawn at a − θ.
  const runnerRear = model.runnerRearAngle ?? runnerExtent(radius, seatDepth, contactOffset).rearAngle;
  const runnerFront = model.runnerFrontAngle ?? runnerExtent(radius, seatDepth, contactOffset).frontAngle;
  const arcGroup = svgEl(doc, "g");

  const steps = 40;
  let pathD = "";
  for (let i = 0; i <= steps; i++) {
    const a = -theta - runnerRear + ((runnerRear + runnerFront) * i) / steps;
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
  if (showDetails) {
    // Dashed radius line down to the contact point
    const radiusLine = line(doc, arcCenterX * s, -arcCenterY * s, contactX * s, 0,
      COLOR_ROCKER, 1, "6 4");
    radiusLine.setAttribute("data-testid", "radius-line");
    rc.appendChild(radiusLine);
  }
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
  // By default only the marker and a "tap for details" hint are shown.
  // With details on, add the name and radius value as two short lines
  // (so the label stays inside the fixed frame while rocking) above
  // the hint.
  const rcTextAttrs = {
    x: arcCenterX * s + 10,
    "font-size": 10,
    fill: COLOR_ROCKER,
    "font-family": "sans-serif",
  };
  let rcLabel = null;
  let rcValue = null;
  if (showDetails) {
    rcLabel = svgEl(doc, "text", { ...rcTextAttrs, y: -arcCenterY * s - 8 });
    rcLabel.textContent = "Rocker radius center";
    rc.appendChild(rcLabel);
    rcValue = svgEl(doc, "text", { ...rcTextAttrs, y: -arcCenterY * s + 4 });
    rcValue.textContent = `R = ${radius} in`;
    rc.appendChild(rcValue);
  }
  const rcHint = svgEl(doc, "text", {
    ...rcTextAttrs,
    y: -arcCenterY * s + (showDetails ? 15 : 4),
    "font-size": 8,
    opacity: 0.65,
    "data-testid": "radius-center-hint",
  });
  rcHint.textContent = showDetails ? "tap to hide details" : "tap for details";
  rc.appendChild(rcHint);
  // The centre often lands on the sitter's body; a pale halo keeps the
  // text legible and the group is added to the drawing after the sitter.
  for (const t of rc.querySelectorAll("text")) {
    t.setAttribute("stroke", "#fffdfb");
    t.setAttribute("stroke-width", 3);
    t.setAttribute("stroke-linejoin", "round");
    t.setAttribute("paint-order", "stroke");
  }

  // --- Legs ---
  // Two legs from the rocker arc up to the seat.  In the local (chair)
  // frame the legs stand seatDepth/2 either side of the seat centre and
  // are cut off wherever they cross the circle (see legLengths()).
  const legTopLocalY = seatHeight - radius;                // seat level in local frame
  const legs = [
    { lx: seatCX + seatDepth * 0.5, length: model.legLengths?.front, id: "leg-front" },
    { lx: seatCX - seatDepth * 0.5, length: model.legLengths?.rear, id: "leg-rear" },
  ];
  for (const { lx, length, id } of legs) {
    // Bottom of leg: on the arc surface (relative to arc centre)
    const legAngle = Math.asin(Math.max(-1, Math.min(1, lx / radius)));
    const localBotX = radius * Math.sin(legAngle);
    const localBotY = -radius * Math.cos(legAngle);

    // Rotate into world frame (clockwise by θ)
    const [botX, botY] = localToWorld(localBotX, localBotY, arcCenterX, arcCenterY, theta);
    const [topX, topY] = localToWorld(lx, legTopLocalY, arcCenterX, arcCenterY, theta);

    const leg = svgEl(doc, "g", { "data-testid": id });
    leg.appendChild(line(doc, botX * s, -botY * s, topX * s, -topY * s, COLOR_LEGS, 3));
    if (showDetails && length !== undefined) {
      // Cut length, beside the leg at mid height, outside the chair
      const [mx, my] = localToWorld(lx, (localBotY + legTopLocalY) / 2, arcCenterX, arcCenterY, theta);
      const outside = lx > seatCX;
      const label = svgEl(doc, "text", {
        x: mx * s + (outside ? 5 : -5),
        y: -my * s + 4,
        "font-size": 9,
        fill: COLOR_LEGS,
        "font-family": "sans-serif",
        "text-anchor": outside ? "start" : "end",
        "data-testid": `${id}-length`,
      });
      label.textContent = `${length.toFixed(1)} in`;
      leg.appendChild(label);
    }
    g.appendChild(leg);
  }

  // --- Seat ---
  // A horizontal line in the chair's local frame, from front to back
  const seatHalfLen = seatDepth / 2; // seat spans its full depth

  const seatEnds = [
    [seatCX - seatHalfLen, legTopLocalY],
    [seatCX + seatHalfLen, legTopLocalY],
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
  // the seat.  It rotates with the chair.  With the contact point under
  // the seat centre it coincides with the plumb radius line when the
  // chair is level, and diverges from it as the chair rocks; shifting
  // the contact point fore or aft moves it off the plumb line.
  const clLocalBotY = -radius * Math.cos(Math.asin(Math.max(-1, Math.min(1, seatCX / radius))));
  const clLocalTopY = legTopLocalY; // seat
  const [clBotX, clBotY] = localToWorld(seatCX, clLocalBotY, arcCenterX, arcCenterY, theta);
  const [clTopX, clTopY] = localToWorld(seatCX, clLocalTopY, arcCenterX, arcCenterY, theta);
  const cl = svgEl(doc, "g", { "data-testid": "centerline" });
  const clLine = line(doc, clBotX * s, -clBotY * s, clTopX * s, -clTopY * s,
    COLOR_LEGS, 1, "1.5 3");
  clLine.setAttribute("stroke-linecap", "round");
  cl.appendChild(clLine);
  // Label beside the line, midway up, in the clear space between the legs
  const [clMidX, clMidY] = localToWorld(seatCX, (clLocalBotY + clLocalTopY) / 2,
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
  // Long enough that the backrest reaches past the top of the sitter's
  // head (see backrestLength()).
  const backH = backrestLength(sitterHeight, backrestAngle);
  const localBaseX = seatCX - seatHalfLen;
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
  g.appendChild(renderStickFigure(doc, model, theta, geom, sitter));

  // Radius centre marker on top of the sitter, so it can always be tapped
  g.appendChild(rc);

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
 * Bounding box of everything drawn in a profile group, in SVG units.
 * Text width is estimated from its length and font size.  Only the
 * `translate(x, y)` transforms this module emits are understood.
 *
 * @param {Element} el
 * @returns {{minX: number, maxX: number, minY: number, maxY: number}}
 */
export function profileExtent(el) {
  const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  const add = (x, y, dx, dy) => {
    box.minX = Math.min(box.minX, x + dx);
    box.maxX = Math.max(box.maxX, x + dx);
    box.minY = Math.min(box.minY, y + dy);
    box.maxY = Math.max(box.maxY, y + dy);
  };
  const num = (node, name) => parseFloat(node.getAttribute(name)) || 0;
  const walk = (node, dx, dy) => {
    const t = node.getAttribute?.("transform");
    const m = t && /translate\(\s*([-\d.e]+)[\s,]+([-\d.e]+)\s*\)/.exec(t);
    if (m) {
      dx += parseFloat(m[1]);
      dy += parseFloat(m[2]);
    }
    const tag = node.tagName?.toLowerCase();
    if (tag === "line") {
      add(num(node, "x1"), num(node, "y1"), dx, dy);
      add(num(node, "x2"), num(node, "y2"), dx, dy);
    } else if (tag === "circle") {
      const r = num(node, "r");
      add(num(node, "cx") - r, num(node, "cy") - r, dx, dy);
      add(num(node, "cx") + r, num(node, "cy") + r, dx, dy);
    } else if (tag === "path") {
      const nums = (node.getAttribute("d") || "").match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
      for (let i = 0; i + 1 < nums.length; i += 2) {
        add(parseFloat(nums[i]), parseFloat(nums[i + 1]), dx, dy);
      }
    } else if (tag === "text") {
      const size = num(node, "font-size") || 10;
      const width = 0.55 * size * (node.textContent || "").length;
      add(num(node, "x"), num(node, "y") - size, dx, dy);
      add(num(node, "x") + width, num(node, "y"), dx, dy);
    }
    for (const child of Array.from(node.children || [])) {
      walk(child, dx, dy);
    }
  };
  walk(el, 0, 0);
  return box;
}

/**
 * Render the complete scene SVG at a given tilt angle.
 *
 * @param {object} doc
 * @param {object} model   – from buildRockerModel()
 * @param {number} theta   – tilt angle (rad)
 * @param {object} [options] – see renderChairProfile(), plus:
 * @param {object[]} [options.fit] – extra poses ({theta, geom, sitter})
 *   that must also fit in the picture, e.g. the end of a fall, so the
 *   view does not change while the chair is going over
 * @returns {SVGSVGElement}
 */
export function renderScene(doc, model, theta, options = {}) {
  const { radius, seatHeight } = model;
  const s = SCALE;

  // Top of the sitter's head when sitting upright, plus a margin.
  const sittingHt = (model.sitterHeight || 68) * 0.52;
  const personTop = seatHeight + sittingHt + 4;
  // Keep the rocker's radius centre in view for large radii.
  let top = Math.max(VIEW_TOP, personTop, radius + 6);
  let halfWidth = VIEW_HALF_WIDTH;
  for (const pose of options.fit || []) {
    const g = renderChairProfile(doc, model, pose.theta,
      { showDetails: options.showDetails, geom: pose.geom, sitter: pose.sitter });
    const box = profileExtent(g);
    const margin = 6;
    halfWidth = Math.max(halfWidth, Math.abs(box.minX) / s + margin, Math.abs(box.maxX) / s + margin);
    top = Math.max(top, -box.minY / s + margin);
  }

  const vbX = -halfWidth * s;
  const vbY = -top * s;
  const vbW = 2 * halfWidth * s;
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

  const falls = model.fallDirection || 0;
  const fallWord = falls > 0 ? "forward" : "backward";
  let stability = "Stable";
  if (!model.stable) {
    stability = `Unstable — CoG above rocker centre, tips over ${fallWord}`;
  } else if (falls) {
    stability = `Tips over ${fallWord} — CoG past the end of the runners`;
  }
  const upright = model.stable && !falls;

  const contact = model.contactOffset || 0;
  const contactWord = contact > 0.001 ? " ahead of seat centre"
                    : contact < -0.001 ? " behind seat centre" : " (under seat centre)";
  const legs = model.legLengths;

  const items = [
    ["Natural tilt", falls ? `Tips over (${falls > 0 ? "fwd" : "back"})` : `${thetaEqDeg}°${tiltDir}`],
    ["Contact point", `${Math.abs(contact).toFixed(1)} in${contactWord}`],
    ...(legs ? [
      ["Front leg length", `${legs.front.toFixed(1)} in`],
      ["Rear leg length", `${legs.rear.toFixed(1)} in`],
    ] : []),
    ["Effective pendulum length", `${model.lEff.toFixed(1)} in`],
    ["Natural period", upright ? `${model.period.toFixed(2)} s` : (model.stable ? "—" : "Unstable")],
    ["Rocks per minute", upright ? `${(60 / model.period).toFixed(1)}` : "—"],
    ["Seat swing", upright
      ? `± ${(model.seatHeight * model.initialAmplitude).toFixed(1)} in`
      : "—"],
    ["System CoG above floor", `${model.cogHeight.toFixed(1)} in`],
    ["CoG fore/aft offset", `${(model.cogOffsetX || 0).toFixed(1)} in`],
    ...(model.footLoad !== undefined ? [
      ["Feet carry", `${model.footLoad.toFixed(0)} lb (${Math.round(100 * model.footLoad / (model.sitterWeight || 1))}%)`],
    ] : []),
    ["Gap (R − CoG)", `${(model.radius - model.cogHeight).toFixed(1)} in`],
    ["Damping ratio", model.damping.toFixed(3)],
    ["Stability", stability],
  ];

  for (const [label, value] of items) {
    const dt = doc.createElement("dt");
    dt.textContent = label;
    dl.appendChild(dt);
    const dd = doc.createElement("dd");
    dd.textContent = value;
    if (!upright && label === "Stability") {
      dd.style.color = "#cc3333";
      dd.style.fontWeight = "bold";
    }
    dl.appendChild(dd);
  }

  return dl;
}
