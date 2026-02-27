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
/*  Sitter centre-of-gravity estimation                               */
/* ------------------------------------------------------------------ */

/**
 * Estimate sitter centre-of-gravity height above the seat surface.
 *
 * Uses a simple biomechanical model:
 *   – Seated CoG height ≈ 0.30 × sitting-height for males,
 *     ≈ 0.29 × sitting-height for females (slightly lower torso ratio).
 *   – Sitting height ≈ 0.52 × stature.
 *
 * @param {number} heightIn  – sitter standing height (inches)
 * @param {"male"|"female"} gender
 * @returns {number} CoG height above the seat surface (inches)
 */
export function sitterCogAboveSeat(heightIn, gender) {
  const sittingHeight = heightIn * 0.52;
  const ratio = gender === "female" ? 0.29 : 0.30;
  return sittingHeight * ratio;
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
/*  Chair geometry helpers                                            */
/* ------------------------------------------------------------------ */

/**
 * Compute the contact-point geometry of the rocker at a given tilt angle.
 *
 * When the rocker (radius R) tilts by angle θ the contact point shifts
 * along the floor by R·θ, and the centre of the arc rises/lowers.
 *
 * @param {number} radius       – rocker curve radius (in)
 * @param {number} seatHeight   – seat height when level (in)
 * @param {number} seatDepth    – seat depth to backrest (in)
 * @param {number} cogAboveSeat – sitter CoG above seat (in)
 * @param {number} theta        – tilt angle (rad, positive = backward)
 * @returns {{contactX: number, seatX: number, seatY: number,
 *            cogX: number, cogY: number, arcCenterX: number,
 *            arcCenterY: number}}
 */
export function rockerGeometry(radius, seatHeight, seatDepth, cogAboveSeat, theta) {
  // For a circle of radius R rolling without slipping on a flat floor:
  //   - contact point shifts by R·θ along floor
  //   - arc centre is always at height R, directly above the contact point
  //   - the chair body rotates clockwise by θ (positive θ = lean back)

  const contactX = radius * theta;                       // floor contact
  const arcCenterX = contactX;                           // directly above contact
  const arcCenterY = radius;                             // always at height R

  // In the local (chair) frame, seat midpoint = (0, seatHeight - R) relative
  // to the arc centre.  seatHeight < R typically, so the seat is *below*
  // the arc centre.  The backrest / CoG offset along the seat is at
  // local-x = -seatDepth/2  (backward from seat midpoint).

  // Rotate local frame by θ clockwise (positive θ = lean back):
  const localSeatX = 0;
  const localSeatY = seatHeight - radius;
  const seatX = arcCenterX + localSeatX * Math.cos(theta) + localSeatY * Math.sin(theta);
  const seatY = arcCenterY - localSeatX * Math.sin(theta) + localSeatY * Math.cos(theta);

  // CoG is above the seat midpoint, shifted backward by seatDepth/2
  const localCogX = -seatDepth / 2;
  const localCogY = seatHeight - radius + cogAboveSeat;
  const cogX = arcCenterX + localCogX * Math.cos(theta) + localCogY * Math.sin(theta);
  const cogY = arcCenterY - localCogX * Math.sin(theta) + localCogY * Math.cos(theta);

  return { contactX, seatX, seatY, cogX, cogY, arcCenterX, arcCenterY };
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
 * @param {number} params.sitterWeight – pounds
 * @param {number} params.sitterHeight – inches
 * @param {"male"|"female"} params.sitterGender
 * @param {number} [params.chairWeight=0] – chair weight (lb); 0 ignores it
 * @returns {object} model with derived quantities and a `angleAt(t)` function
 */
export function buildRockerModel(params) {
  const { radius, seatHeight, seatDepth,
          sitterWeight, sitterHeight, sitterGender,
          chairWeight = 0 } = params;

  // Sitter CoG
  const sitterCogAbove = sitterCogAboveSeat(sitterHeight, sitterGender);
  const sitterCogH = seatHeight + sitterCogAbove;

  // Chair CoG (estimated from geometry)
  const chairCogH = estimateChairCogHeight(seatHeight);

  // Combined system CoG — used for the rolling-body physics
  const cogHeight = systemCogHeight(sitterWeight, sitterCogH, chairWeight, chairCogH);
  const cogAboveSeat = cogHeight - seatHeight;

  const lEff = effectivePendulumLength(radius, cogHeight);
  const period = rockingPeriod(lEff);
  const damping = estimateDamping(sitterWeight);
  const stable = lEff > 0;
  // Constant-energy push: a given kick tilts a tight-radius rocker much
  // further than a flat one.  Calibrated so R ≈ 42″ with a typical sitter
  // gives ~15°.  Capped at 30° to stay in the small-angle regime.
  const baseAmplitude = Math.PI / 12;
  const referenceGap = 16; // inches — typical gap at R = 42″
  const initialAmplitude = stable
    ? Math.min(Math.PI / 6, baseAmplitude * Math.sqrt(referenceGap / (radius - cogHeight)))
    : 0;

  return {
    radius,
    seatHeight,
    seatDepth,
    cogAboveSeat,
    cogHeight,
    chairWeight,
    lEff,
    period,
    damping,
    stable,
    initialAmplitude,

    /** Angular position at time t (seconds). */
    angleAt(t) {
      return rockingAngle(t, initialAmplitude, lEff, damping);
    },

    /** Full geometry snapshot at time t. */
    geometryAt(t) {
      const theta = this.angleAt(t);
      return {
        theta,
        ...rockerGeometry(radius, seatHeight, seatDepth, cogAboveSeat, theta),
      };
    },
  };
}
