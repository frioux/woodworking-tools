/**
 * Pure calculation functions for a shopmade wooden cam clamp
 * (after the Fine Woodworking "Shopmade Cam Clamp" plan).
 * All measurements in inches.
 *
 * Construction model (side view, bar vertical, jaws pointing right):
 *   - A flat metal bar (thickness × width × length) runs vertically.
 *   - The fixed jaw is pinned to the top of the bar, bar flush with its top.
 *     A closed mortise holds the bar; two roll pins lock it in place.
 *   - The sliding jaw rides the bar below it in an oversized mortise. Two roll
 *     pins straddle the bar; when the jaw racks a few degrees under load the
 *     pins bind on the bar and lock the jaw.
 *   - A 1/16" kerf, started from a 1/4" relief hole, splits a thin tongue off
 *     the top of the sliding jaw. A cam lever pivots in a slot in the lower
 *     body. At rest it droops in the slot with its handle pointing back toward
 *     the bar and hanging just below the jaw; swinging the handle down rolls
 *     its eccentric round head up against the underside of the tongue,
 *     flexing it against the work, and stops just past dead center.
 *   - Cork pads sit on raised seats at the tips of both jaws.
 *
 * "Jaw reach" is measured from the inside face of the bar to the jaw tip.
 * The original plan (1/4" x 1" bar, 8-1/2" long) has a reach of 4-3/4",
 * which gives 6-1/4" long jaws.
 */

// Fixed proportions from the original plan. These don't change with the bar
// or the reach.
export const PLAN = {
  barInset: 1 / 2,          // back end of jaw to back face of bar
  mortiseClearance: 1 / 16, // mortise width over bar thickness
  mortiseWall: 7 / 32,      // minimum wood each side of the mortise
  minJawThickness: 3 / 4,
  fixedHeight: 1.5,
  notchDepth: 1 / 4,        // relief between the bar section and the pad seat
  notchFromBar: 3 / 8,      // notch starts this far in front of the bar
  padLength: 1.5,
  padThickness: 3 / 16,     // cork
  tongueThickness: 7 / 16,
  kerf: 1 / 16,
  lowerBody: 1.25,          // sliding jaw below the kerf
  reliefDiameter: 1 / 4,
  reliefFromBar: 7 / 16,    // relief hole center in front of the bar
  pinDiameter: 1 / 8,
  pinGripClearance: 1 / 16, // sliding-jaw pin gap over the bar width
  leverThickness: 3 / 16,
  pivotFromTip: 5 / 8,
  pivotBelowKerf: 1 / 2,

  // Cam lever: a teardrop — a round head and a smaller round handle end
  // joined by straight lines tangent to both, so the outline has no corners.
  // The pivot hole is off the head's center, which makes the head an
  // eccentric cam. At rest the lever droops in its slot so the handle end
  // hangs below the jaw (something to grab) and the head just clears the
  // tongue; swinging the handle down rolls the head up into the tongue until
  // just past dead center, where the load holds it shut.
  headRadius: 9 / 16,
  tailRadius: 5 / 16,
  pivotBehindHead: 1 / 8,     // along the lever's centerline, toward the handle
  pivotAboveAxis: 1 / 16,     // off the centerline, toward the top edge
  handleDrop: 3 / 16,         // handle end hangs this far below the jaw at rest
  overCenter: 3,              // degrees past dead center at the clamped stop
  tongueModulus: 1.7e6        // psi, typical for beech / maple / birch
};

/**
 * Round up to the next 1/16".
 * @param {number} v
 * @returns {number}
 */
function ceil16(v) {
  return Math.ceil(v * 16 - 1e-9) / 16;
}

/**
 * Calculate all derived clamp dimensions from input parameters.
 *
 * @param {object} params
 * @param {number} params.barThickness - Bar thickness (e.g. 0.25)
 * @param {number} params.barWidth     - Bar width (e.g. 1)
 * @param {number} params.barLength    - Bar length (e.g. 8.5)
 * @param {number} params.jawReach     - Inside face of bar to jaw tip (e.g. 4.75)
 * @returns {object} All derived dimensions
 */
export function calculateClamp(params) {
  const { barThickness, barWidth, barLength, jawReach } = params;
  const P = PLAN;

  // --- Stock ---
  const mortiseWidth = barThickness + P.mortiseClearance;
  const jawThickness = Math.max(P.minJawThickness, ceil16(mortiseWidth + 2 * P.mortiseWall));
  const jawLength = P.barInset + barWidth + jawReach;
  const fixedHeight = P.fixedHeight;
  const slidingHeight = P.notchDepth + P.tongueThickness + P.kerf + P.lowerBody;

  // --- Common layout (x measured from the back end of each jaw) ---
  const barFront = P.barInset + barWidth;        // inside face of the bar
  const notchStart = barFront + P.notchFromBar;
  const padStart = jawLength - P.padLength;
  const notchLength = padStart - notchStart;

  // --- Fixed jaw ---
  // Closed mortise, snug to the bar; two pins through jaw and bar, one high
  // and one low so the jaw can't pivot.
  const fixedMortiseStart = P.barInset;
  const fixedMortiseLength = barWidth;
  const fixedPins = [
    { x: P.barInset + 3 / 16, y: 3 / 8 },
    { x: barFront - 3 / 8, y: fixedHeight - 3 / 8 }
  ];

  // --- Sliding jaw ---
  // Two pins straddle the bar: one high at the back face, one low at the
  // front face, with a little clearance so the jaw slides when square.
  const r = P.pinDiameter / 2;
  const slidePin1 = { x: 3 / 8, y: 3 / 8 };
  const slidePin2 = {
    x: slidePin1.x + barWidth + P.pinDiameter + P.pinGripClearance,
    y: slidingHeight - 5 / 16
  };
  const slidingPins = [slidePin1, slidePin2];
  // Where the bar sits in the sliding jaw (centered between the pins), and
  // how far to shift the sliding jaw so its bar lines up with the fixed jaw's.
  const slidingBarBack = slidePin1.x + r + P.pinGripClearance / 2;
  const slidingOffset = P.barInset - slidingBarBack;
  // Mortise is long enough to take the bar plus both pins.
  const slidingMortiseStart = slidePin1.x - r - 1 / 16;
  const slidingMortiseLength = (slidePin2.x + r + 1 / 16) - slidingMortiseStart;

  // Rack angle at which the pins grip the bar: the pins' separation measured
  // across the bar shrinks to exactly (bar width + pin diameter).
  //   a·cosθ − b·sinθ = c   →   θ = acos(c / R) − atan2(b, a)
  const a = slidePin2.x - slidePin1.x;
  const b = slidePin2.y - slidePin1.y;
  const c = barWidth + P.pinDiameter;
  const lockAngle = Math.acos(c / Math.hypot(a, b)) - Math.atan2(b, a);
  const lockAngleDeg = lockAngle * 180 / Math.PI;

  // Kerf / tongue
  const tongueTop = P.notchDepth;                       // top of tongue in the notch
  const kerfTop = P.notchDepth + P.tongueThickness;
  const kerfBottom = kerfTop + P.kerf;
  const reliefX = barFront + P.reliefFromBar;
  const reliefY = kerfTop + P.kerf / 2;
  const tongueLength = jawLength - reliefX;

  // Lever and its slot (slot is open at the bottom and the tip).
  // The lever blank is as long as the tongue. Lever coordinates ("axis
  // frame"): origin at the head center, x along the centerline toward the
  // nose, y down. Jaw coordinates below are relative to the pivot, y down.
  const pivotX = jawLength - P.pivotFromTip;
  const pivotY = kerfBottom + P.pivotBelowKerf;
  const leverLength = tongueLength;
  const Rh = P.headRadius;
  const Rt = P.tailRadius;
  const centerDistance = leverLength - Rh - Rt;
  const pa = P.pivotBehindHead;
  const pb = P.pivotAboveAxis;
  const leverPivot = { x: -pa, y: -pb };

  // Rest tilt β: droop the handle until its end hangs handleDrop below the
  // jaw. With the head center at rot(−β)(a, b), a/b = pivot behind/above the head center, from the pivot and the tail
  // center D further back along the centerline:
  //   (D − a)·sinβ + b·cosβ = (bottom below pivot) + drop − Rt
  const bottomBelowPivot = P.lowerBody - P.pivotBelowKerf;
  const K = bottomBelowPivot + P.handleDrop - Rt;
  const restTilt = Math.asin(K / Math.hypot(centerDistance - pa, pb)) -
    Math.atan2(pb, centerDistance - pa);
  const restTiltDeg = restTilt * 180 / Math.PI;
  const headCenterRest = {
    x: pa * Math.cos(restTilt) + pb * Math.sin(restTilt),
    y: -pa * Math.sin(restTilt) + pb * Math.cos(restTilt)
  };
  const tailCenterRest = {
    x: headCenterRest.x - centerDistance * Math.cos(restTilt),
    y: headCenterRest.y + centerDistance * Math.sin(restTilt)
  };

  // Cam action. Swinging the handle down θ rotates the head center up and
  // forward; the head's top is then Rh + Cx·sinθ − Cy·cosθ above the pivot.
  // Dead center (max lift) is where the head center is straight above the
  // pivot; the clamped stop is a few degrees past it so the load can't
  // push the lever back open.
  const eccentricity = Math.hypot(headCenterRest.x, headCenterRest.y);
  const deadCenter = 90 + Math.atan2(headCenterRest.y, headCenterRest.x) * 180 / Math.PI;
  const camSwing = Math.ceil((deadCenter + P.overCenter) / 5) * 5;
  const liftAt = deg => {
    const t = deg * Math.PI / 180;
    return Rh + headCenterRest.x * Math.sin(t) - headCenterRest.y * Math.cos(t);
  };
  const restLift = liftAt(0);
  const contactLift = P.pivotBelowKerf + P.kerf;   // underside of the tongue
  const camRise = Rh + eccentricity - restLift;
  const tongueFlex = liftAt(camSwing) - contactLift;
  const noseOverhang = headCenterRest.x + Rh - P.pivotFromTip;

  // Slot runs from just behind the handle end (rounded to a 1/16" layout
  // mark) out through the tip.
  const leverSlotStart = Math.floor((pivotX + tailCenterRest.x - Rt - 1 / 32) * 16) / 16;
  const leverSlotLength = jawLength - leverSlotStart;

  // Clamping force: the tongue is a cantilever from the relief hole, pushed
  // up tongueFlex by the cam directly above the pivot. P = 3EIδ / L³.
  const tongueSpan = pivotX - reliefX;
  const tongueI = jawThickness * P.tongueThickness ** 3 / 12;
  const clampForce = 3 * P.tongueModulus * tongueI * tongueFlex / tongueSpan ** 3;

  // --- Assembly ---
  // Bar top flush with the fixed jaw top. Maximum opening is with the sliding
  // jaw bottom flush with the end of the bar.
  const fixedPadFace = fixedHeight + P.padThickness;
  const capacity = barLength - slidingHeight - fixedHeight - 2 * P.padThickness;

  return {
    // Input echo
    barThickness, barWidth, barLength, jawReach,

    // Stock
    jawThickness, jawLength, fixedHeight, slidingHeight,
    padLength: P.padLength, padThickness: P.padThickness,
    pinDiameter: P.pinDiameter, pinLength: jawThickness,
    leverThickness: P.leverThickness, leverWidth: 2 * Rh, leverLength,

    // Shared layout
    barInset: P.barInset, barFront,
    notchStart, notchLength, notchDepth: P.notchDepth, padStart,
    mortiseWidth,

    // Fixed jaw
    fixedMortiseStart, fixedMortiseLength, fixedPins,

    // Sliding jaw
    slidingMortiseStart, slidingMortiseLength, slidingPins,
    slidingOffset, lockAngle, lockAngleDeg,
    tongueThickness: P.tongueThickness, tongueTop, tongueLength,
    kerf: P.kerf, kerfTop, kerfBottom,
    reliefDiameter: P.reliefDiameter, reliefX, reliefY,
    leverSlotWidth: P.leverThickness, leverSlotLength, leverSlotStart,
    pivotX, pivotY, pivotFromTip: P.pivotFromTip, pivotBelowKerf: P.pivotBelowKerf,

    // Cam lever (axis frame: origin at head center, x toward the nose)
    headRadius: Rh, tailRadius: Rt, centerDistance, leverPivot,
    handleEndWidth: 2 * Rt, handleDrop: P.handleDrop,
    // Placement in the jaw (relative to the pivot) at rest
    restTilt, restTiltDeg, headCenterRest, tailCenterRest,
    restLift, contactLift, eccentricity, deadCenter, camSwing,
    camRise, tongueFlex, noseOverhang,
    tongueSpan, clampForce,

    // Assembly
    fixedPadFace, capacity
  };
}

/**
 * Height of the top of the cam head above the pivot when the handle has been
 * swung `deg` degrees down from rest.
 * @param {object} d - result of calculateClamp
 * @param {number} deg - swing angle, 0 (released) .. camSwing (clamped)
 * @returns {number} inches above the pivot
 */
export function camLift(d, deg) {
  const t = deg * Math.PI / 180;
  const c = d.headCenterRest;
  return d.headRadius + c.x * Math.sin(t) - c.y * Math.cos(t);
}

/**
 * How far the cam has pushed the tongue up at a given swing angle
 * (0 until the head reaches the tongue).
 * @param {object} d - result of calculateClamp
 * @param {number} deg
 * @returns {number} inches
 */
export function tongueLift(d, deg) {
  return Math.max(0, camLift(d, deg) - d.contactLift);
}

/**
 * Map a point from the lever's axis frame into jaw coordinates relative to
 * the pivot, with the handle swung `deg` degrees down from rest.
 * @param {object} d - result of calculateClamp
 * @param {number[]} pt - [x, y] in the axis frame
 * @param {number} [deg=0]
 * @returns {number[]} [x, y] relative to the pivot, y down
 */
export function leverToJaw(d, [x, y], deg = 0) {
  const b = d.restTilt;
  // axis frame → rest pose (rotate by −β about the head center)
  const rx = d.headCenterRest.x + x * Math.cos(b) + y * Math.sin(b);
  const ry = d.headCenterRest.y - x * Math.sin(b) + y * Math.cos(b);
  // swing about the pivot
  const t = deg * Math.PI / 180;
  return [rx * Math.cos(t) + ry * Math.sin(t), -rx * Math.sin(t) + ry * Math.cos(t)];
}

/**
 * Outline of the cam lever in its axis frame (origin at the head center,
 * x toward the nose, y down): the head arc, a straight edge tangent to both
 * circles, the handle-end arc, and the other tangent edge.
 * @param {object} d - result of calculateClamp
 * @returns {object} tangent points and circle data
 */
export function leverProfile(d) {
  const Rh = d.headRadius;
  const Rt = d.tailRadius;
  const D = d.centerDistance;
  // Normals to the external tangents make angle γ with the head→tail line.
  const g = Math.acos((Rh - Rt) / D);
  const cg = Math.cos(g);
  const sg = Math.sin(g);
  return {
    head: { cx: 0, cy: 0, r: Rh },
    tail: { cx: -D, cy: 0, r: Rt },
    headUpper: [-Rh * cg, -Rh * sg],
    headLower: [-Rh * cg, Rh * sg],
    tailUpper: [-D - Rt * cg, -Rt * sg],
    tailLower: [-D - Rt * cg, Rt * sg]
  };
}

/**
 * Check inputs. Returns a map of field name → error message (empty if valid).
 * @param {object} p - same shape as calculateClamp params
 * @returns {Object<string, string>}
 */
export function validateClamp(p) {
  const errors = {};
  if (!(p.barThickness > 0)) errors.barThickness = 'Must be positive';
  else if (p.barThickness > 0.5) errors.barThickness = 'Max 1/2"';

  if (!(p.barWidth > 0)) errors.barWidth = 'Must be positive';
  else if (p.barWidth < 0.5) errors.barWidth = 'Min 1/2" (pins won\'t fit)';
  else if (p.barWidth > 2) errors.barWidth = 'Max 2"';

  if (!(p.jawReach > 0)) errors.jawReach = 'Must be positive';
  else if (p.jawReach < 3) errors.jawReach = 'Min 3" (no room for the cam)';
  else if (p.jawReach > 16) errors.jawReach = 'Max 16"';

  const P = PLAN;
  const fixedStack = P.fixedHeight +
    (P.notchDepth + P.tongueThickness + P.kerf + P.lowerBody) + 2 * P.padThickness;
  if (!(p.barLength > 0)) errors.barLength = 'Must be positive';
  else if (p.barLength < fixedStack + 0.5) {
    errors.barLength = `Too short — jaws alone take ${formatInches(fixedStack)}`;
  }
  return errors;
}

/**
 * Non-fatal design warnings for unusual proportions.
 * @param {object} d - result of calculateClamp
 * @returns {string[]}
 */
export function clampWarnings(d) {
  const w = [];
  if (d.jawReach > 7) {
    w.push('Long reach: the 1-1/2" and 2" jaw heights are sized for the original ' +
      '4-3/4" reach. Expect more flex, or rip the jaws from taller stock.');
  }
  // The plan's 1/4" x 1" aluminum bar is sized for an 8-1/2" clamp.
  const barArea = d.barThickness * d.barWidth;
  if (barArea < 0.25 || (d.barLength > 14 && barArea <= 0.25)) {
    w.push('Light bar for its length — it may bend under clamping pressure.');
  }
  if (d.clampForce < 25) {
    w.push(`Weak cam: with a ${formatInches(d.tongueSpan)} tongue span the cam's ` +
      `${formatInches(d.tongueFlex)} of flex only develops about ${Math.round(d.clampForce)} lb. ` +
      'Keep the reach short for real clamping pressure.');
  }
  if (d.jawThickness > PLAN.minJawThickness) {
    w.push(`Jaws thickened to ${formatInches(d.jawThickness)} to keep ` +
      `${formatInches(PLAN.mortiseWall)} walls beside the bar mortise.`);
  }
  return w;
}

/**
 * Format a decimal inch value as a fraction string for display.
 * Recognizes halves, quarters, eighths, sixteenths, and thirty-seconds.
 * @param {number} value
 * @returns {string}
 */
export function formatInches(value) {
  const whole = Math.floor(value);
  let frac = value - whole;

  // Round to nearest 1/32
  const thirtySeconds = Math.round(frac * 32);
  if (thirtySeconds === 0) return `${whole}"`;
  if (thirtySeconds === 32) return `${whole + 1}"`;

  frac = thirtySeconds;
  let denom = 32;

  // Simplify fraction
  while (frac % 2 === 0 && denom > 1) {
    frac /= 2;
    denom /= 2;
  }

  if (whole === 0) return `${frac}/${denom}"`;
  return `${whole}-${frac}/${denom}"`;
}
