/**
 * Galbert's Rocker Model — Physics calculations
 *
 * Models a rocking chair as a circular arc (the rocker) rolling on a flat
 * floor.  The sitter's centre of gravity, combined with the chair geometry,
 * determines rocking behaviour (period, amplitude decay, stability).
 *
 * All lengths are in inches; angles in radians; time in seconds.
 */

const GRAVITY = 386.09; // in/s² (standard gravity in inches)

/* ------------------------------------------------------------------ */
/*  Sitter: posture, skeleton and centre of gravity                   */
/* ------------------------------------------------------------------ */

/**
 * What the sitter does with their upper body.  Postures combine: any
 * torso posture goes with any leg posture (below), and the centre of
 * gravity falls out of the resulting figure rather than from a table of
 * offsets.
 *
 *   hipShift – inches the hips slide forward on the seat
 *   lean     – torso lean from vertical (rad, +back / −forward), or null
 *              to rest the torso against the backrest
 *   arms     – "lap" (hands in lap), "knees" (elbows on knees) or
 *              "behindHead" (hands clasped behind the head)
 */
export const TORSO_POSTURES = {
  upright:        { label: "Upright",           hipShift: 0, lean: null,  arms: "lap" },
  leaningForward: { label: "Leaning forward",   hipShift: 1, lean: -0.35, arms: "knees" },
  armsBack:       { label: "Arms behind head",  hipShift: 0, lean: null,  arms: "behindHead" },
  slouched:       { label: "Slouched",          hipShift: 3, lean: null,  arms: "lap" },
};

/**
 * What the sitter does with their legs: the angle the shin makes with
 * the vertical (rad, + feet ahead of the knees).  The feet go to the
 * floor if they can reach it; see sitterPose().
 */
export const LEG_POSTURES = {
  tucked: { label: "Feet tucked", shankAngle: -0.2 },
  flat:   { label: "Feet flat",   shankAngle: 0.1 },
  out:    { label: "Legs out",    shankAngle: 0.75 },
};

// Thickness of the seat plank: the sitter sits this far above the seat line.
export const SEAT_THICKNESS = 1;

/**
 * Skeleton proportions.  Limb lengths are fractions of standing height;
 * trunk, neck and head are fractions of sitting height (0.52 × stature).
 *   hipRise – hip joint above the seat surface (sitting on the flesh)
 *   trunk   – hip joint to shoulder
 *   neck    – shoulder to the centre of the head
 *   headR   – head radius
 *   halfW   – half the width of the drawn torso
 * The shank runs from the knee to the sole of the foot, so it includes
 * the ankle: with the thigh level it is the popliteal height.
 */
const BODY = {
  male:   { thigh: 0.245, shank: 0.285, upperArm: 0.186, forearm: 0.20,
            hipRise: 0.07, trunk: 0.64, neck: 0.18, headR: 0.10, halfW: 0.08 },
  female: { thigh: 0.240, shank: 0.275, upperArm: 0.180, forearm: 0.19,
            hipRise: 0.07, trunk: 0.64, neck: 0.18, headR: 0.10, halfW: 0.085 },
};

/**
 * Share of body weight in each segment (de Leva 1996).  Limb segments
 * are per side; the forearm includes the hand.
 */
const SEGMENT_MASS = {
  male:   { head: 0.0694, trunk: 0.4346, upperArm: 0.0271, forearm: 0.0223,
            thigh: 0.1416, shank: 0.0433, foot: 0.0137 },
  female: { head: 0.0668, trunk: 0.4257, upperArm: 0.0255, forearm: 0.0194,
            thigh: 0.1478, shank: 0.0481, foot: 0.0129 },
};

// Where along each segment (from its upper joint) its mass centres.
const SEGMENT_COM = { trunk: 0.5, upperArm: 0.577, forearm: 0.68, thigh: 0.433, shank: 0.433 };

// The knees can come up this far (low seat) or drop this far below the
// hips (legs stretched out past a tall seat) before the feet give up
// and slide or dangle instead.
const MAX_KNEE_UP = (60 * Math.PI) / 180;
const MAX_KNEE_DOWN = (25 * Math.PI) / 180;
// A thigh lifted more than this is no longer resting on the seat.
const THIGH_LIFT_ANGLE = (10 * Math.PI) / 180;
// An unsupported torso leans back at most this far.
const MAX_LEAN = Math.PI / 4;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Work out how the sitter sits: joint positions, where the centre of
 * gravity lands, and how much of their weight the feet take.
 *
 * Coordinates are seat-relative inches: origin at the seat centre on
 * the seat line, x forward, y up.  The floor is at y = −seatHeight.
 *
 * Legs: the shin keeps its length.  Starting from the thigh level on
 * the seat and the shin at its posture's angle, the knee rises (low
 * seat) or drops (tall seat, legs out) until the foot meets the floor.
 * A knee cannot rise past MAX_KNEE_UP — beyond that the feet slide
 * forward instead — nor drop past MAX_KNEE_DOWN, beyond which the feet
 * dangle.
 *
 * Feet on the floor carry the shins and feet, plus most of the thighs
 * once those lift off the seat, which pitches the chair back.
 *
 * @param {object} p
 * @param {number} p.sitterHeight    – standing height (in)
 * @param {"male"|"female"} p.sitterGender
 * @param {number} p.seatHeight      – seat line above the floor (in)
 * @param {number} p.seatDepth       – seat depth (in)
 * @param {number} [p.backrestAngle=100] – degrees from the seat
 * @param {string} [p.torsoPosture="upright"] – key of TORSO_POSTURES
 * @param {string} [p.legPosture="flat"]      – key of LEG_POSTURES
 * @returns {object} pose:
 *   joints  – {hip, knee, foot, shoulder, neckBase, head, headBack, elbow, hand}
 *             as [x, y]
 *   torso   – [[x, y] × 3] the drawn torso outline
 *   headR, lean, thighAngle, shankAngle, feetOnFloor
 *   cog     – {x, y} centre of gravity of the sitter
 *   footLoadFraction – share of body weight carried by the feet
 */
export function sitterPose(p) {
  const { sitterHeight, sitterGender, seatHeight, seatDepth, backrestAngle = 100,
          torsoPosture = "upright", legPosture = "flat" } = p;
  const sex = sitterGender === "female" ? "female" : "male";
  const body = BODY[sex];
  const mass = SEGMENT_MASS[sex];
  const torso = TORSO_POSTURES[torsoPosture] || TORSO_POSTURES.upright;
  const legs = LEG_POSTURES[legPosture] || LEG_POSTURES.flat;

  const H = sitterHeight;
  const S = H * 0.52;
  const thighLen = H * body.thigh;
  const shankLen = H * body.shank;
  const upperArmLen = H * body.upperArm;
  const hipRise = S * body.hipRise;
  const trunkLen = S * body.trunk;
  const neckLen = S * body.neck;
  const headR = S * body.headR;
  const halfW = S * body.halfW;

  const seatHalf = seatDepth / 2;
  const surfaceY = SEAT_THICKNESS;
  const floorY = -seatHeight;
  const hipY = surfaceY + hipRise;

  // --- Legs: shin length fixed, knee finds the floor ---
  let shankAngle = legs.shankAngle;
  const kneeAboveFloorLevel = hipY - floorY; // knee height with the thigh level
  let thighAngle = Math.asin(clamp((shankLen * Math.cos(shankAngle) - kneeAboveFloorLevel) / thighLen, -1, 1));
  let feetOnFloor = true;
  if (thighAngle > MAX_KNEE_UP) {
    // Knees as high as they go: the feet slide forward along the floor
    thighAngle = MAX_KNEE_UP;
    const kneeAboveFloor = kneeAboveFloorLevel + thighLen * Math.sin(thighAngle);
    shankAngle = Math.acos(clamp(kneeAboveFloor / shankLen, -1, 1));
  } else if (thighAngle < -MAX_KNEE_DOWN) {
    // Even with the knees dropped the feet cannot reach: they dangle
    thighAngle = -MAX_KNEE_DOWN;
    feetOnFloor = false;
  }

  // Hip: far enough ahead of the backrest base that the back of the
  // body (and the back of the head, above it) meets the backrest, slid
  // forward if need be so the knees clear the front edge of the seat
  // (otherwise the shins would pass through the plank), then slid
  // further by the posture.
  const thighReach = thighLen * Math.cos(thighAngle);
  const hipX = Math.max(-seatHalf + Math.max(halfW, headR), seatHalf - thighReach) + torso.hipShift;
  const kneeX = hipX + thighReach;
  const kneeY = hipY + thighLen * Math.sin(thighAngle);
  const footX = kneeX + shankLen * Math.sin(shankAngle);
  const footY = feetOnFloor ? floorY : kneeY - shankLen * Math.cos(shankAngle);

  // --- Torso: lean against the backrest, or as the posture says ---
  const backRad = (backrestAngle * Math.PI) / 180;
  const backBase = [-seatHalf, 0];
  // Unit normal to the backrest line pointing toward the front of the chair
  const backNorm = [Math.sin(backRad), -Math.cos(backRad)];
  const clearance = (x, y) => (x - backBase[0]) * backNorm[0] + (y - backBase[1]) * backNorm[1];

  const torsoAt = (lean) => {
    const sx = hipX - trunkLen * Math.sin(lean);
    const sy = hipY + trunkLen * Math.cos(lean);
    const hx = sx - neckLen * Math.sin(lean);
    const hy = sy + neckLen * Math.cos(lean);
    // Across the shoulders, perpendicular to the trunk
    const px = -Math.cos(lean);
    const py = -Math.sin(lean);
    const outline = sex === "female"
      ? [[sx, sy], [hipX + px * halfW, hipY + py * halfW], [hipX - px * halfW, hipY - py * halfW]]
      : [[sx + px * halfW, sy + py * halfW], [sx - px * halfW, sy - py * halfW], [hipX, hipY]];
    return {
      shoulder: [sx, sy],
      head: [hx, hy],
      headBack: [hx - headR * Math.cos(lean), hy - headR * Math.sin(lean)],
      outline,
    };
  };
  const minClearance = (lean) => {
    const t = torsoAt(lean);
    return Math.min(clearance(...t.shoulder), clearance(...t.head), clearance(...t.headBack),
                    ...t.outline.map(([x, y]) => clearance(x, y)));
  };

  let lean = 0;
  if (torso.lean !== null) {
    lean = torso.lean;
  } else {
    // Rest against the backrest: the lean that brings the body closest
    // to the backrest without crossing it.  If the backrest is out of
    // reach, lean back unsupported as far as MAX_LEAN.
    let best = Infinity;
    const steps = 180;
    for (let i = 0; i <= steps; i++) {
      const candidate = (MAX_LEAN * i) / steps;
      const d = minClearance(candidate);
      if (d < -1e-6) {
        continue;
      }
      if (d < best - 1e-6 || (Math.abs(d - best) <= 1e-6 && candidate > lean)) {
        best = d;
        lean = candidate;
        if (best <= 1e-4) {
          break;
        }
      }
    }
  }
  const { shoulder, head, headBack, outline } = torsoAt(lean);
  const neckBase = [shoulder[0] - headR * 0.3 * Math.sin(lean), shoulder[1] + headR * 0.3 * Math.cos(lean)];

  // --- Arms ---
  let elbow;
  let hand;
  if (torso.arms === "knees") {
    // Elbows resting near the knees, hands hanging past them
    elbow = [kneeX - 2, kneeY + 3];
    hand = [kneeX + 2, kneeY - 1];
  } else if (torso.arms === "behindHead") {
    // Elbows up and back beside the head, hands clasped behind it.  In
    // side view the elbows (which really splay sideways) are kept just
    // in front of the backrest rather than drawn through it.
    elbow = [shoulder[0] - upperArmLen * 0.4, shoulder[1] + upperArmLen * 0.55];
    const behind = clearance(...elbow);
    if (behind < 0) {
      elbow = [elbow[0] - behind * backNorm[0], elbow[1] - behind * backNorm[1]];
    }
    hand = headBack;
  } else {
    // Hands in lap: upper arm hanging a little forward of vertical,
    // forearm down to the thigh
    elbow = [shoulder[0] + upperArmLen * Math.sin(0.25), shoulder[1] - upperArmLen * Math.cos(0.25)];
    hand = [hipX + (kneeX - hipX) * 0.7, hipY + (kneeY - hipY) * 0.7 + 1];
  }

  // --- Centre of gravity from the segment masses ---
  const along = ([ax, ay], [bx, by], f) => [ax + (bx - ax) * f, ay + (by - ay) * f];
  const hip = [hipX, hipY];
  const knee = [kneeX, kneeY];
  const foot = [footX, footY];
  const parts = [
    [mass.head, head],
    [mass.trunk, along(hip, shoulder, SEGMENT_COM.trunk)],
    [2 * mass.upperArm, along(shoulder, elbow, SEGMENT_COM.upperArm)],
    [2 * mass.forearm, along(elbow, hand, SEGMENT_COM.forearm)],
    [2 * mass.thigh, along(hip, knee, SEGMENT_COM.thigh)],
    [2 * mass.shank, along(knee, foot, SEGMENT_COM.shank)],
    [2 * mass.foot, foot],
  ];
  let cogX = 0;
  let cogY = 0;
  let total = 0;
  for (const [m, [x, y]] of parts) {
    cogX += m * x;
    cogY += m * y;
    total += m;
  }
  cogX /= total;
  cogY /= total;

  // --- Weight through the feet ---
  // Shins and feet stand on the floor.  A thigh resting on the seat
  // (level, or draped over its front edge) puts its weight into the
  // seat; once the knees come up it lifts off and the knee end of it
  // goes down the shin to the floor.
  let footLoadFraction = 0;
  if (feetOnFloor) {
    const lift = clamp(thighAngle / THIGH_LIFT_ANGLE, 0, 1);
    footLoadFraction = 2 * (mass.shank + mass.foot + lift * SEGMENT_COM.thigh * mass.thigh);
  }

  return {
    joints: { hip, knee, foot, shoulder, neckBase, head, headBack, elbow, hand },
    torso: outline,
    headR,
    lean,
    thighAngle,
    shankAngle,
    feetOnFloor,
    cog: { x: cogX, y: cogY },
    footLoadFraction,
  };
}

/**
 * Estimate sitter mass (slugs, inch-based) from weight in pounds.
 * mass = weight / gravity
 *
 * @param {number} weightLb
 * @returns {number} mass in lb·s²/in (slugs-inch)
 */
export function sitterMass(weightLb) {
  return weightLb / GRAVITY;
}

/* ------------------------------------------------------------------ */
/*  Equilibrium (natural orientation)                                 */
/* ------------------------------------------------------------------ */

/**
 * Compute the equilibrium tilt angle — the angle at which the chair
 * naturally comes to rest with no external push.
 *
 * At equilibrium the sitter's CoG is directly above the floor contact
 * point.  Solving  localCogX·cos(θ) + localCogY·sin(θ) = 0  gives
 *
 *   θ_eq = atan(−localCogX / localCogY)
 *
 * where localCogY = seatHeight − radius + cogAboveSeat  (typically
 * negative, meaning the CoG is below the arc centre).
 *
 * Returns 0 when the system has no stable resting point (CoG at or
 * above the arc centre).
 *
 * @param {number} radius       – rocker curve radius (in)
 * @param {number} seatHeight   – seat height when level (in)
 * @param {number} cogAboveSeat – sitter CoG above seat surface (in)
 * @param {number} cogLocalX    – CoG fore/aft offset from the level contact point (in)
 * @returns {number} equilibrium tilt angle (rad, positive = tilted forward,
 *   i.e. the chair rolls toward a CoG that sits ahead of the contact point)
 */
export function equilibriumAngle(radius, seatHeight, cogAboveSeat, cogLocalX) {
  const localCogY = seatHeight - radius + cogAboveSeat;
  if (localCogY >= 0) {
    return 0; // CoG at or above arc centre — no stable equilibrium
  }
  return Math.atan(-cogLocalX / localCogY);
}

/* ------------------------------------------------------------------ */
/*  Runner extent                                                     */
/* ------------------------------------------------------------------ */

/**
 * How far the runners (rockers) extend past the legs, in inches
 * measured along the floor.  Real rockers carry a long tail behind the
 * back leg (so a reclining sitter cannot easily go over backwards) and
 * a shorter nose ahead of the front leg.
 */
export const RUNNER_REAR_OVERHANG = 12;
export const RUNNER_FRONT_OVERHANG = 8;

// A runner can never wrap more than this far round its own circle.
const MAX_RUNNER_ANGLE = (80 * Math.PI) / 180;

/**
 * Angular extent of the runner either side of the contact point.
 *
 * The legs stand at seatDepth/2 either side of the seat centre, which is
 * itself `contactOffset` behind the level contact point (see
 * legLengths()), and the runner continues past them by the overhangs
 * above.  Each end sits on the arc at the angle whose horizontal
 * distance from the arc bottom matches that length.
 *
 * @param {number} radius    – rocker curve radius (in)
 * @param {number} seatDepth – seat depth (in)
 * @param {number} [contactOffset=0] – level contact point ahead of seat centre (in)
 * @returns {{rearAngle: number, frontAngle: number}} both positive (rad)
 */
export function runnerExtent(radius, seatDepth, contactOffset = 0) {
  const maxSin = Math.sin(MAX_RUNNER_ANGLE);
  const rearX = seatDepth / 2 + contactOffset + RUNNER_REAR_OVERHANG;
  const frontX = seatDepth / 2 - contactOffset + RUNNER_FRONT_OVERHANG;
  return {
    rearAngle: Math.asin(Math.min(maxSin, Math.max(0, rearX) / radius)),
    frontAngle: Math.asin(Math.min(maxSin, Math.max(0, frontX) / radius)),
  };
}

/* ------------------------------------------------------------------ */
/*  Leg lengths                                                       */
/* ------------------------------------------------------------------ */

/**
 * Height of the rocker arc above its lowest point at a horizontal
 * distance `lx` from that point.
 */
function arcRise(radius, lx) {
  const a = Math.asin(Math.max(-1, Math.min(1, lx / radius)));
  return radius * (1 - Math.cos(a));
}

/**
 * How long the legs are cut, from the underside of the level seat down
 * to the rocker.
 *
 * Galbert lays a rocker out by sliding the chair, seat level, along a
 * large circle: wherever the legs cross the circle is where they are cut
 * off.  Sliding the chair forward on the circle puts the contact point
 * (the bottom of the circle) further back under the seat, so the rear
 * leg gets longer and the front leg shorter.
 *
 * @param {number} radius        – rocker curve radius (in)
 * @param {number} seatHeight    – seat height when level (in)
 * @param {number} seatDepth     – seat depth (in)
 * @param {number} contactOffset – level contact point ahead of seat centre (in)
 * @returns {{front: number, rear: number}} leg lengths (in)
 */
export function legLengths(radius, seatHeight, seatDepth, contactOffset = 0) {
  const frontX = seatDepth / 2 - contactOffset;
  const rearX = -seatDepth / 2 - contactOffset;
  return {
    front: seatHeight - arcRise(radius, frontX),
    rear: seatHeight - arcRise(radius, rearX),
  };
}

// A chair resting this close to the end of its runner is treated as over
// the edge.
const TIP_MARGIN = (1 * Math.PI) / 180;

/**
 * Decide whether the chair falls over, and which way.
 *
 * A rocker can only roll as far as the ends of its runners.  If the
 * resting tilt would put the contact point beyond an end, the centre of
 * gravity is still outside the runner tip when the chair gets there and
 * it keeps going: it tips over.  A chair whose centre of gravity sits
 * at or above the arc centre (unstable) tips toward whichever side the
 * centre of gravity is on.
 *
 * @param {boolean} stable      – from effectivePendulumLength(...) > 0
 * @param {number}  thetaEq     – resting tilt (rad, + forward)
 * @param {number}  cogOffsetX  – system CoG fore/aft offset (in)
 * @param {{rearAngle: number, frontAngle: number}} runner
 * @returns {number} +1 falls forward, −1 falls backward, 0 stays up
 */
export function fallDirection(stable, thetaEq, cogOffsetX, runner) {
  if (!stable) {
    return cogOffsetX > 0 ? 1 : -1;
  }
  if (thetaEq >= runner.frontAngle - TIP_MARGIN) {
    return 1;
  }
  if (thetaEq <= -(runner.rearAngle - TIP_MARGIN)) {
    return -1;
  }
  return 0;
}

/* ------------------------------------------------------------------ */
/*  Chair geometry helpers                                            */
/* ------------------------------------------------------------------ */

/**
 * Rotate a point from the chair's local frame into the world frame.
 * Positive θ is a clockwise rotation (the chair tilting forward).
 *
 * @returns {[number, number]} [worldX, worldY]
 */
export function localToWorld(lx, ly, arcCenterX, arcCenterY, theta) {
  const wx = arcCenterX + lx * Math.cos(theta) + ly * Math.sin(theta);
  const wy = arcCenterY - lx * Math.sin(theta) + ly * Math.cos(theta);
  return [wx, wy];
}

/**
 * Seat and centre-of-gravity positions for a chair body rotated by
 * θ with its arc centre at the given world position.  This is the
 * common core of rockerGeometry() (arc centre rolling along the floor)
 * and tippedGeometry() (chair pivoting on a runner tip).
 */
function bodyGeometry(radius, seatHeight, cogAboveSeat, cogLocalX, theta,
                      arcCenterX, arcCenterY, contactX, contactOffset) {
  const [seatX, seatY] = localToWorld(-contactOffset, seatHeight - radius,
                                      arcCenterX, arcCenterY, theta);
  const [cogX, cogY] = localToWorld(cogLocalX, seatHeight - radius + cogAboveSeat,
                                    arcCenterX, arcCenterY, theta);
  return { contactX, seatX, seatY, cogX, cogY, arcCenterX, arcCenterY };
}

/**
 * Compute the contact-point geometry of the rocker at a given tilt angle.
 *
 * When the rocker (radius R) tilts by angle θ the contact point shifts
 * along the floor by R·θ, and the centre of the arc rises/lowers.
 *
 * The chair's local frame has its origin at the arc centre, with the
 * level contact point straight below at (0, −R).  The seat centre sits
 * `contactOffset` behind that, at local x = −contactOffset.
 *
 * @param {number} radius       – rocker curve radius (in)
 * @param {number} seatHeight   – seat height when level (in)
 * @param {number} seatDepth    – seat depth to backrest (in)
 * @param {number} cogAboveSeat – CoG above seat (in)
 * @param {number} theta        – tilt angle (rad, positive = tilted forward)
 * @param {number} [cogLocalX=0] – CoG fore/aft offset from the level contact point (in)
 * @param {number} [contactOffset=0] – level contact point ahead of seat centre (in)
 * @returns {{contactX: number, seatX: number, seatY: number,
 *            cogX: number, cogY: number, arcCenterX: number,
 *            arcCenterY: number}}  seatX/seatY is the seat centre
 */
export function rockerGeometry(radius, seatHeight, seatDepth, cogAboveSeat, theta,
                               cogLocalX = 0, contactOffset = 0) {
  // For a circle of radius R rolling without slipping on a flat floor:
  //   - contact point shifts by R·θ along floor
  //   - arc centre is always at height R, directly above the contact point
  //   - the chair body rotates clockwise by θ (positive θ = tilted forward:
  //     the contact point rolls forward along the floor and the backrest
  //     stands up; negative θ rocks the chair back)
  const contactX = radius * theta;
  return bodyGeometry(radius, seatHeight, cogAboveSeat, cogLocalX, theta,
                      contactX, radius, contactX, contactOffset);
}

/**
 * Geometry of a chair that has rolled to the end of its runner (tilt
 * `thetaEnd`) and is now pivoting about that runner tip by a further
 * angle `phi` (same sign convention as θ).
 *
 * The tip is the last contact point, at (R·thetaEnd, 0).  The arc
 * centre, which sat directly above it, swings round the tip.
 *
 * @returns same shape as rockerGeometry(); `contactX` is the pivot.
 */
export function tippedGeometry(radius, seatHeight, cogAboveSeat, cogLocalX, thetaEnd, phi,
                               contactOffset = 0) {
  const pivotX = radius * thetaEnd;
  const arcCenterX = pivotX + radius * Math.sin(phi);
  const arcCenterY = radius * Math.cos(phi);
  return bodyGeometry(radius, seatHeight, cogAboveSeat, cogLocalX, thetaEnd + phi,
                      arcCenterX, arcCenterY, pivotX, contactOffset);
}

/**
 * Length of the backrest, from the rear seat edge to its top.
 *
 * Sized so the sitter's head never projects past the end: torso plus
 * head, with an allowance for the seat plank thickness and the slope of
 * the backrest.  Shared by the renderer and the fall simulation.
 *
 * @param {number} sitterHeight  – standing height (in)
 * @param {number} backrestAngle – degrees from the seat (90 = vertical)
 * @returns {number} backrest length (in)
 */
export function backrestLength(sitterHeight, backrestAngle) {
  const a = ((backrestAngle || 100) * Math.PI) / 180;
  const S = sitterHeight * 0.52;
  const body = BODY.male;
  const headTop = S * (body.hipRise + body.trunk + body.neck + body.headR);
  return headTop + (SEAT_THICKNESS + S * body.headR) / Math.sin(a);
}

/* ------------------------------------------------------------------ */
/*  Rocking dynamics                                                  */
/* ------------------------------------------------------------------ */

/**
 * Effective pendulum length for small oscillations.
 *
 * For a body whose CoG is at height h above the floor, resting on a
 * circular rocker of radius R, the equation of motion is:
 *
 *   θ̈ = −g(R − h) / h² · θ
 *
 * because the rolling contact point translates (KE = ½mh²θ̇²), unlike
 * a fixed-pivot pendulum.  Expressed as a simple-pendulum equivalent
 * (T = 2π√(L/g)), the effective length is  L_eff = h² / (R − h).
 *
 * When h ≥ R the system is unstable (CoG at or above the arc centre).
 *
 * @param {number} radius     – rocker radius (in)
 * @param {number} cogHeight  – CoG height above floor (in) = seatHeight + cogAboveSeat
 * @returns {number} effective pendulum length (in); negative ⇒ unstable
 */
export function effectivePendulumLength(radius, cogHeight) {
  const gap = radius - cogHeight;
  if (gap <= 0) {
    return -1;  // unstable
  }
  return (cogHeight * cogHeight) / gap;
}

/**
 * Natural period of small rocking oscillations (seconds).
 *
 * T = 2π √(L_eff / g)
 *
 * Returns Infinity if the system is unstable (L_eff ≤ 0).
 *
 * @param {number} lEff – effective pendulum length (in)
 * @returns {number} period in seconds
 */
export function rockingPeriod(lEff) {
  if (lEff <= 0) {
    return Infinity;
  }
  return 2 * Math.PI * Math.sqrt(lEff / GRAVITY);
}

/**
 * Compute the angular position θ(t) of a damped rocking oscillation.
 *
 * θ(t) = A · e^(−ζωt) · cos(ω_d · t)
 *
 * where ω = √(g / L_eff), ζ = damping ratio, ω_d = ω√(1−ζ²).
 *
 * Heavier sitters damp faster (more soft-tissue damping); this is a
 * simplified model.
 *
 * @param {number} t          – time (seconds)
 * @param {number} amplitude  – initial tilt amplitude (rad)
 * @param {number} lEff       – effective pendulum length (in)
 * @param {number} damping    – damping ratio ζ (dimensionless, 0–1)
 * @returns {number} angle θ at time t (rad)
 */
export function rockingAngle(t, amplitude, lEff, damping) {
  if (lEff <= 0) {
    return 0;
  }
  const omega = Math.sqrt(GRAVITY / lEff);
  const omegaD = omega * Math.sqrt(1 - damping * damping);
  return amplitude * Math.exp(-damping * omega * t) * Math.cos(omegaD * t);
}

/**
 * Estimate a damping ratio based on sitter weight.
 *
 * Heavier sitters have more soft-tissue damping.  This is a rough
 * heuristic: ζ ranges from ~0.03 (light) to ~0.08 (heavy).
 *
 * @param {number} weightLb – sitter weight in pounds
 * @returns {number} damping ratio (dimensionless)
 */
export function estimateDamping(weightLb) {
  // Linear interpolation: 100 lb → 0.03, 300 lb → 0.08
  const clamped = Math.max(100, Math.min(300, weightLb));
  return 0.03 + (clamped - 100) * (0.05 / 200);
}

/* ------------------------------------------------------------------ */
/*  System centre-of-gravity (chair + sitter)                         */
/* ------------------------------------------------------------------ */

/**
 * Estimate the chair's own centre-of-gravity height above the floor.
 *
 * Most mass lives in the runners and legs (below the seat), with some
 * in the seat and back.  A reasonable approximation is ≈ ⅔ of the
 * seat height.
 *
 * @param {number} seatHeight – seat height off floor (in)
 * @returns {number} estimated chair CoG height (in)
 */
export function estimateChairCogHeight(seatHeight) {
  return seatHeight * (2 / 3);
}

/**
 * Estimate the chair's own fore/aft centre-of-gravity offset.
 *
 * Wooden rockers carry extra mass behind seat centre (back posts,
 * backrest slats/crest rail, and longer rear runner material).  The
 * default is therefore slightly rear-biased, with more rear bias for
 * deeper seats and more reclined backs.
 *
 * Negative values mean the chair CoG sits behind the seat midpoint.
 *
 * @param {number} seatDepth     – seat depth to backrest (in)
 * @param {number} backrestAngle – backrest angle from seat (deg)
 * @returns {number} chair CoG fore/aft offset (in)
 */
export function estimateChairCogOffsetX(seatDepth, backrestAngle = 100) {
  const depthTerm = -0.12 * seatDepth;
  const reclineTerm = -0.04 * (backrestAngle - 90);
  return Math.max(-5, Math.min(0.5, depthTerm + reclineTerm));
}

/**
 * Compute the combined system CoG height (chair + sitter).
 *
 * @param {number} sitterWeight   – sitter weight (lb)
 * @param {number} sitterCogH     – sitter CoG height above floor (in)
 * @param {number} chairWeight    – chair weight (lb)
 * @param {number} chairCogH      – chair CoG height above floor (in)
 * @returns {number} combined CoG height above floor (in)
 */
export function systemCogHeight(sitterWeight, sitterCogH, chairWeight, chairCogH) {
  if (chairWeight <= 0) {
    return sitterCogH;
  }
  const totalWeight = sitterWeight + chairWeight;
  return (sitterWeight * sitterCogH + chairWeight * chairCogH) / totalWeight;
}

/**
 * Compute the combined system CoG fore/aft offset (chair + sitter).
 *
 * @param {number} sitterWeight   – sitter weight (lb)
 * @param {number} sitterOffsetX  – sitter CoG fore/aft offset (in)
 * @param {number} chairWeight    – chair weight (lb)
 * @param {number} chairOffsetX   – chair CoG fore/aft offset (in)
 * @returns {number} combined CoG fore/aft offset (in)
 */
export function systemCogOffsetX(sitterWeight, sitterOffsetX, chairWeight, chairOffsetX) {
  if (chairWeight <= 0) {
    return sitterOffsetX;
  }
  const totalWeight = sitterWeight + chairWeight;
  return (sitterWeight * sitterOffsetX + chairWeight * chairOffsetX) / totalWeight;
}

/* ------------------------------------------------------------------ */
/*  Top-level model builder                                           */
/* ------------------------------------------------------------------ */

/**
 * Build a complete rocker model from the chair parameters,
 * sitter parameters, and chair weight.
 *
 * The physics uses the combined centre-of-gravity of both the chair
 * structure and the sitter.  Ignoring chair mass (the old behaviour)
 * overestimates the system CoG and produces unrealistically long
 * periods, especially when the sitter CoG is close to the arc centre.
 *
 * @param {object} params
 * @param {number} params.radius       – rocker curve radius (in)
 * @param {number} params.seatHeight   – seat height off floor when level (in)
 * @param {number} params.seatDepth    – seat midpoint to backrest (in)
 * @param {number} params.backrestAngle – backrest angle from seat (degrees, 90 = vertical)
 * @param {number} params.sitterWeight – pounds
 * @param {number} params.sitterHeight – inches
 * @param {"male"|"female"} params.sitterGender
 * @param {number} [params.chairWeight=0] – chair weight (lb); 0 ignores it
 * @param {number} [params.contactOffset=0] – where the rocker touches the
 *   floor when the seat is level, ahead of the seat centre (in).  Negative
 *   puts the contact point behind the seat centre: the chair sits further
 *   forward on its circle, the rear legs grow and the front legs shrink
 *   (see legLengths()).
 * @param {string} [params.torsoPosture="upright"] – key of TORSO_POSTURES
 * @param {string} [params.legPosture="flat"]      – key of LEG_POSTURES
 * @returns {object} model with derived quantities and a `angleAt(t)` function
 */
export function buildRockerModel(params) {
  const { radius, seatHeight, seatDepth, backrestAngle = 100,
          sitterWeight, sitterHeight, sitterGender,
          chairWeight = 0, contactOffset = 0,
          torsoPosture = "upright", legPosture = "flat" } = params;

  // How the sitter sits, and where that puts their weight
  const pose = sitterPose({ sitterHeight, sitterGender, seatHeight, seatDepth,
                            backrestAngle, torsoPosture, legPosture });
  const sitterCogAbove = pose.cog.y;
  const sitterCogH = seatHeight + sitterCogAbove;

  // Chair CoG (estimated from geometry)
  const chairCogH = estimateChairCogHeight(seatHeight);
  const chairCogOffsetX = estimateChairCogOffsetX(seatDepth, backrestAngle);

  // Combined system CoG (chair + sitter)
  const systemH = systemCogHeight(sitterWeight, sitterCogH, chairWeight, chairCogH);
  const systemX = systemCogOffsetX(sitterWeight, pose.cog.x, chairWeight, chairCogOffsetX);

  // Feet on the floor carry part of the sitter: that weight never
  // reaches the chair.  What the rocker balances fore and aft is the
  // load that is left, centred where the whole system's weight minus
  // the feet's share would balance (worked out with the seat level).
  // The height of the load, which sets the rocking period and whether
  // the chair can stand at all, is left as the system's own: the feet
  // sit on the floor, they do not change how high the mass rides.
  const totalWeight = sitterWeight + chairWeight;
  const footLoad = pose.footLoadFraction * sitterWeight;
  const chairLoad = totalWeight - footLoad;
  const footX = pose.joints.foot[0];
  const cogOffsetSystemX = (totalWeight * systemX - footLoad * footX) / chairLoad;
  const cogHeight = systemH;
  const cogAboveSeat = cogHeight - seatHeight;
  // The physics only cares where the CoG sits relative to the contact
  // point, which is `contactOffset` ahead of the seat centre.
  const cogLocalX = cogOffsetSystemX - contactOffset;

  const lEff = effectivePendulumLength(radius, cogHeight);
  const period = rockingPeriod(lEff);
  const damping = estimateDamping(sitterWeight);
  const stable = lEff > 0;
  const thetaEq = stable
    ? equilibriumAngle(radius, seatHeight, cogAboveSeat, cogLocalX)
    : 0;

  // The runners only reach so far; past their ends the chair tips over.
  const runner = runnerExtent(radius, seatDepth, contactOffset);
  const falls = fallDirection(stable, thetaEq, cogLocalX, runner);

  // Constant-energy push: a given kick tilts a tight-radius rocker much
  // further than a flat one.  Calibrated so R ≈ 42″ with a typical sitter
  // gives ~15°.  Capped at 30° to stay in the small-angle regime, and
  // never allowed to swing past the ends of the runners.
  const baseAmplitude = Math.PI / 12;
  const referenceGap = 16; // inches — typical gap at R = 42″
  let initialAmplitude = 0;
  if (stable && !falls) {
    const pushAmplitude = baseAmplitude * Math.sqrt(referenceGap / (radius - cogHeight));
    const roomForward = runner.frontAngle - thetaEq - TIP_MARGIN;
    const roomBack = runner.rearAngle + thetaEq - TIP_MARGIN;
    initialAmplitude = Math.max(0, Math.min(Math.PI / 6, pushAmplitude, roomForward, roomBack));
  }

  return {
    radius,
    seatHeight,
    seatDepth,
    backrestAngle,
    sitterGender,
    sitterHeight,
    torsoPosture,
    legPosture,
    /** How the sitter sits (see sitterPose()). */
    pose,
    cogAboveSeat,
    cogHeight,
    chairWeight,
    sitterWeight,
    contactOffset,
    /** Where the legs are cut off by the circle, seat level (in). */
    legLengths: legLengths(radius, seatHeight, seatDepth, contactOffset),
    /** Weight carried by the sitter's feet on the floor (lb). */
    footLoad,
    /** Weight the rocker actually balances: chair + sitter − feet (lb). */
    chairLoad,
    /** Load centre ahead of the seat centre (in). */
    cogOffsetX: cogOffsetSystemX,
    /** Load centre ahead of the level contact point (in). */
    cogLocalX,
    /** The sitter's own CoG ahead of the seat centre (in). */
    sitterCogOffsetX: pose.cog.x,
    chairCogOffsetX,
    lEff,
    period,
    damping,
    stable,
    initialAmplitude,
    thetaEq,
    sitterCogAbove,
    runnerRearAngle: runner.rearAngle,
    runnerFrontAngle: runner.frontAngle,
    /** +1 tips forward, −1 tips backward, 0 stays on its runners. */
    fallDirection: falls,

    /** Angular position at time t (seconds), oscillating around equilibrium. */
    angleAt(t) {
      return thetaEq + rockingAngle(t, initialAmplitude, lEff, damping);
    },

    /** Full geometry snapshot at time t. */
    geometryAt(t) {
      const theta = this.angleAt(t);
      return {
        theta,
        ...rockerGeometry(radius, seatHeight, seatDepth, cogAboveSeat, theta,
                          cogLocalX, contactOffset),
      };
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Falling over                                                      */
/* ------------------------------------------------------------------ */

// How long the chair takes to roll to the runner tip and go over.
const FALL_DURATION = 1.8;
// Shape of the fall: an inverted pendulum pulls away from balance like
// cosh(t) − 1 — a slow teeter that turns into a rush.  Larger = more
// hang time at the start.
const FALL_SHARPNESS = 3;
// After hitting the floor the chair rebounds a few degrees and settles.
const BOUNCE_DURATION = 0.35;
const BOUNCE_ANGLE = (3 * Math.PI) / 180;
// The sitter lets go once the chair has pivoted this far past the tip,
// or once it has tilted this far from level, whichever comes first.
const EJECT_ANGLE = 0.2;
const EJECT_TILT = (55 * Math.PI) / 180;
// Cartoon gravity for the sitter: a little floatier than real life so
// the tumble reads at animation speed.
const SITTER_GRAVITY = GRAVITY * 0.6;
// The sitter keeps this share of the speed the chair was carrying them
// at, plus a hop on the way out and some extra spin while airborne.
const EJECT_CARRY = 0.6;
const EJECT_POP_X = 40;   // in/s, in the direction of the fall
const EJECT_POP_Y = 45;   // in/s, up
const EJECT_SPIN = 2.0;   // rad/s, in the direction of the fall
// Height of the sitter's centre of gravity when they come to rest in a
// heap.  The renderer lifts the figure so nothing pokes through the floor.
const SITTER_REST_HEIGHT = 3;
// How long the sitter complains after landing.
const OOF_DURATION = 1.5;

/**
 * Angle the chair pivots about a runner tip before part of it hits the
 * floor: the backrest top (falling backward) or the seat front (falling
 * forward).  Scanned numerically because the first point to land
 * depends on the geometry.
 *
 * @returns {number} pivot angle magnitude (rad)
 */
function floorHitAngle(model, thetaEnd, direction) {
  const { radius, seatHeight, seatDepth, backrestAngle, sitterHeight,
          contactOffset = 0 } = model;
  const backRad = ((backrestAngle || 100) * Math.PI) / 180;
  const backH = backrestLength(sitterHeight || 68, backrestAngle);
  const seatLocalY = seatHeight - radius;
  const seatCX = -contactOffset;
  const points = [
    [seatCX - seatDepth / 2 + backH * Math.cos(backRad), seatLocalY + backH * Math.sin(backRad)], // backrest top
    [seatCX - seatDepth / 2, seatLocalY],   // rear seat edge
    [seatCX + seatDepth / 2, seatLocalY],   // front seat edge
  ];
  const step = Math.PI / 360;
  for (let phi = step; phi < Math.PI; phi += step) {
    const g = tippedGeometry(radius, seatHeight, 0, 0, thetaEnd, direction * phi);
    const theta = thetaEnd + direction * phi;
    const landed = points.some(([lx, ly]) =>
      localToWorld(lx, ly, g.arcCenterX, g.arcCenterY, theta)[1] <= 0);
    if (landed) {
      return phi;
    }
  }
  return Math.PI / 2;
}

/**
 * Choreograph the chair falling over.
 *
 * The chair rolls from `theta0` to the end of its runner, pivots over
 * the tip until it hits the floor, bounces once and lies still.  Part
 * way over, the sitter parts company with the seat and tumbles through
 * the air until they land in a heap.
 *
 * Returns null when the model does not fall (see `model.fallDirection`).
 *
 * The returned `poseAt(t)` gives everything the renderer needs:
 *   theta  – chair body rotation (rad)
 *   geom   – chair geometry (as rockerGeometry(); arc centre may be off
 *            the rolling line once the chair is pivoting on a tip)
 *   sitter – null while seated, otherwise the sitter's own frame
 *            {theta, arcCenterX, arcCenterY, lift: true, say?}
 *   done   – true once everything has come to rest
 *
 * @param {object} model   – from buildRockerModel()
 * @param {number} [theta0=0] – tilt the chair starts from (rad)
 * @returns {{direction: number, duration: number, poseAt: function,
 *            finalPose: object} | null}
 */
export function buildFall(model, theta0 = 0) {
  const dir = model.fallDirection;
  if (!dir) {
    return null;
  }
  const { radius, seatHeight, seatDepth, cogAboveSeat, contactOffset = 0,
          cogLocalX = (model.cogOffsetX || 0) - contactOffset,
          sitterCogOffsetX = 0, sitterCogAbove = cogAboveSeat,
          runnerRearAngle, runnerFrontAngle } = model;

  const thetaEnd = dir > 0 ? runnerFrontAngle : -runnerRearAngle;
  const start = Math.max(-runnerRearAngle, Math.min(runnerFrontAngle, theta0 || 0));
  const phiFloor = floorHitAngle(model, thetaEnd, dir);
  const thetaFinal = thetaEnd + dir * phiFloor;
  const sweep = thetaFinal - start;

  const T = FALL_DURATION;
  const k = FALL_SHARPNESS;
  const norm = Math.cosh(k) - 1;
  const progress = (u) => (Math.cosh(k * u) - 1) / norm;             // 0 → 1
  const progressRate = (u) => (k * Math.sinh(k * u)) / norm;          // d/du
  const timeAtProgress = (p) => (Math.acosh(1 + p * norm) / k) * T;

  // Chair rotation over time: teeter, crash, small bounce, rest.
  const chairTheta = (t) => {
    if (t <= 0) {
      return start;
    }
    if (t < T) {
      return start + sweep * progress(t / T);
    }
    if (t < T + BOUNCE_DURATION) {
      return thetaFinal - dir * BOUNCE_ANGLE * Math.sin((Math.PI * (t - T)) / BOUNCE_DURATION);
    }
    return thetaFinal;
  };

  const chairGeom = (theta) => {
    const past = dir * (theta - thetaEnd);
    if (past <= 0) {
      return rockerGeometry(radius, seatHeight, seatDepth, cogAboveSeat, theta,
                            cogLocalX, contactOffset);
    }
    return tippedGeometry(radius, seatHeight, cogAboveSeat, cogLocalX, thetaEnd,
                          theta - thetaEnd, contactOffset);
  };

  // --- Sitter ejection ---
  const phiEject = Math.min(EJECT_ANGLE, phiFloor / 2);
  let thetaEject = dir * Math.min(dir * thetaEnd + phiEject, EJECT_TILT);
  if (dir * (thetaEject - start) < 0.01) {
    thetaEject = start + dir * 0.01; // already past it: let go straight away
  }
  const tEject = timeAtProgress((thetaEject - start) / sweep);
  const geomEject = chairGeom(thetaEject);
  // Sitter CoG in the chair frame and in the world at the moment of release
  const sitterLX = sitterCogOffsetX - contactOffset;
  const sitterLY = seatHeight - radius + sitterCogAbove;
  const [g0x, g0y] = localToWorld(sitterLX, sitterLY,
                                  geomEject.arcCenterX, geomEject.arcCenterY, thetaEject);
  // Velocity: carried round the current pivot (the floor contact) by the
  // chair's rotation, plus a hop
  const omegaChair = (progressRate(tEject / T) * sweep) / T;
  const pivotX = geomEject.contactX;
  const vx = EJECT_CARRY * omegaChair * g0y + dir * EJECT_POP_X;
  const vy = -EJECT_CARRY * omegaChair * (g0x - pivotX) + EJECT_POP_Y;
  const spin = omegaChair + dir * EJECT_SPIN;
  // Time in the air until the CoG reaches its resting height
  const drop = Math.max(0, g0y - SITTER_REST_HEIGHT);
  const tAir = (vy + Math.sqrt(vy * vy + 2 * SITTER_GRAVITY * drop)) / SITTER_GRAVITY;

  const sitterFrame = (t) => {
    if (t < tEject) {
      return null;
    }
    const tau = Math.min(t - tEject, tAir);
    const gx = g0x + vx * tau;
    const gy = g0y + vy * tau - 0.5 * SITTER_GRAVITY * tau * tau;
    const theta = thetaEject + spin * tau;
    // Place the frame origin so the sitter's CoG lands at (gx, gy)
    const [ox, oy] = localToWorld(sitterLX, sitterLY, 0, 0, theta);
    const frame = { theta, arcCenterX: gx - ox, arcCenterY: gy - oy, lift: true };
    const sinceLanding = t - tEject - tAir;
    if (sinceLanding >= 0 && sinceLanding < OOF_DURATION) {
      frame.say = "oof!";
    }
    return frame;
  };

  const duration = Math.max(T + BOUNCE_DURATION, tEject + tAir + OOF_DURATION);

  const poseAt = (t) => {
    const theta = chairTheta(t);
    return {
      theta,
      geom: chairGeom(theta),
      sitter: sitterFrame(t),
      done: t >= duration,
    };
  };

  return {
    direction: dir,
    thetaEnd,
    thetaFinal,
    duration,
    poseAt,
    finalPose: poseAt(duration),
  };
}
