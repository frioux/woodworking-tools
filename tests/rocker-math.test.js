import { describe, it, expect } from 'vitest';
import {
  sitterPose,
  TORSO_POSTURES,
  LEG_POSTURES,
  SEAT_THICKNESS,
  sitterMass,
  rockerGeometry,
  equilibriumAngle,
  effectivePendulumLength,
  rockingPeriod,
  rockingAngle,
  estimateDamping,
  estimateChairCogHeight,
  systemCogHeight,
  estimateChairCogOffsetX,
  systemCogOffsetX,
  buildRockerModel,
  runnerExtent,
  fallDirection,
  tippedGeometry,
  backrestLength,
  localToWorld,
  buildFall,
  RUNNER_REAR_OVERHANG,
  RUNNER_FRONT_OVERHANG,
  legLengths,
} from '../rocker-model/rocker-math.js';

/* ------------------------------------------------------------------ */
/*  sitterPose                                                        */
/* ------------------------------------------------------------------ */
describe('sitterPose', () => {
  const base = { sitterHeight: 70, sitterGender: 'male', seatHeight: 17, seatDepth: 16, backrestAngle: 100 };
  const shinLength = (pose) => Math.hypot(pose.joints.foot[0] - pose.joints.knee[0],
                                          pose.joints.foot[1] - pose.joints.knee[1]);

  it('puts the centre of gravity about 10 in above the seat for a 70-inch male', () => {
    const { cog } = sitterPose(base);
    expect(cog.y).toBeGreaterThan(9);
    expect(cog.y).toBeLessThan(11.5);
  });

  it('is proportional to height', () => {
    expect(sitterPose({ ...base, sitterHeight: 76 }).cog.y)
      .toBeGreaterThan(sitterPose({ ...base, sitterHeight: 60 }).cog.y);
  });

  it('gives a female sitter a lower CoG than a male of the same height', () => {
    expect(sitterPose({ ...base, sitterGender: 'female' }).cog.y).toBeLessThan(sitterPose(base).cog.y);
  });

  it('sits upright with the thighs about level and the feet on the floor', () => {
    const pose = sitterPose(base);
    expect(Math.abs(pose.thighAngle)).toBeLessThan(0.1);
    expect(pose.feetOnFloor).toBe(true);
    expect(pose.joints.foot[1]).toBeCloseTo(-17);
    expect(pose.lean).toBeGreaterThan(0); // resting back against the 100° backrest
  });

  it('keeps the shin the same length whatever the seat height', () => {
    const lengths = [11, 14, 17, 20, 24].map((seatHeight) => shinLength(sitterPose({ ...base, seatHeight })));
    for (const l of lengths) {
      expect(l).toBeCloseTo(lengths[0]);
    }
    expect(lengths[0]).toBeCloseTo(70 * 0.285);
  });

  it('lifts the knees as the seat gets lower', () => {
    const high = sitterPose({ ...base, seatHeight: 17 });
    const low = sitterPose({ ...base, seatHeight: 12 });
    expect(low.thighAngle).toBeGreaterThan(high.thighAngle + 0.2);
    expect(low.joints.knee[1]).toBeGreaterThan(low.joints.hip[1]);
    expect(low.feetOnFloor).toBe(true);
  });

  it('puts more weight through the feet once the knees come up', () => {
    const high = sitterPose({ ...base, seatHeight: 17 });
    const low = sitterPose({ ...base, seatHeight: 12 });
    expect(high.footLoadFraction).toBeGreaterThan(0.08);
    expect(low.footLoadFraction).toBeGreaterThan(high.footLoadFraction + 0.05);
  });

  it('lets the feet dangle off a seat too tall to reach the floor from', () => {
    const pose = sitterPose({ ...base, seatHeight: 26 });
    expect(pose.feetOnFloor).toBe(false);
    expect(pose.footLoadFraction).toBe(0);
    expect(pose.joints.foot[1]).toBeGreaterThan(-26);
  });

  it('keeps the knees clear of the front edge of the seat', () => {
    for (const sitterHeight of [58, 64, 70, 78]) {
      for (const seatDepth of [14, 16, 20]) {
        const pose = sitterPose({ ...base, sitterHeight, seatDepth });
        expect(pose.joints.knee[0]).toBeGreaterThanOrEqual(seatDepth / 2 - 1e-9);
      }
    }
  });

  it('moves the weight forward when leaning forward', () => {
    const upright = sitterPose(base);
    const forward = sitterPose({ ...base, torsoPosture: 'leaningForward' });
    expect(forward.cog.x).toBeGreaterThan(upright.cog.x + 3);
    expect(forward.lean).toBeLessThan(0);
  });

  it('moves the weight back with the arms behind the head', () => {
    const upright = sitterPose(base);
    const arms = sitterPose({ ...base, torsoPosture: 'armsBack' });
    expect(arms.cog.x).toBeLessThan(upright.cog.x - 0.5);
    expect(arms.joints.hand[0]).toBeLessThan(arms.joints.shoulder[0]);
  });

  it('combines a torso posture with a leg posture', () => {
    const upright = sitterPose(base);
    const arms = sitterPose({ ...base, torsoPosture: 'armsBack' });
    const out = sitterPose({ ...base, legPosture: 'out' });
    const both = sitterPose({ ...base, torsoPosture: 'armsBack', legPosture: 'out' });
    // Arms where the arms-back pose puts them, feet where legs-out puts them
    expect(both.joints.hand).toEqual(arms.joints.hand);
    expect(both.joints.foot[0]).toBeCloseTo(out.joints.foot[0]);
    expect(out.joints.foot[0]).toBeGreaterThan(upright.joints.foot[0] + 6);
    // The CoG shifts are roughly additive
    const armsShift = arms.cog.x - upright.cog.x;
    const outShift = out.cog.x - upright.cog.x;
    expect(both.cog.x - upright.cog.x).toBeCloseTo(armsShift + outShift, 0);
  });

  it('slides the hips forward when slouched', () => {
    const upright = sitterPose(base);
    const slouched = sitterPose({ ...base, torsoPosture: 'slouched' });
    expect(slouched.joints.hip[0]).toBeCloseTo(upright.joints.hip[0] + TORSO_POSTURES.slouched.hipShift);
  });

  it('falls back to upright and feet flat for unknown postures', () => {
    expect(sitterPose({ ...base, torsoPosture: 'nope', legPosture: 'nope' }))
      .toEqual(sitterPose({ ...base, torsoPosture: 'upright', legPosture: 'flat' }));
  });

  it('has a label for every posture', () => {
    for (const presets of [TORSO_POSTURES, LEG_POSTURES]) {
      for (const [, preset] of Object.entries(presets)) {
        expect(typeof preset.label).toBe('string');
        expect(preset.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('sits on top of the seat plank', () => {
    expect(sitterPose(base).joints.hip[1]).toBeGreaterThan(SEAT_THICKNESS);
  });
});

/* ------------------------------------------------------------------ */
/*  sitterMass                                                        */
/* ------------------------------------------------------------------ */
describe('sitterMass', () => {
  it('returns weight / gravity', () => {
    const mass = sitterMass(386.09); // 1 slug-inch at g=386.09
    expect(mass).toBeCloseTo(1.0);
  });

  it('scales linearly with weight', () => {
    expect(sitterMass(200)).toBeCloseTo(sitterMass(100) * 2);
  });
});

/* ------------------------------------------------------------------ */
/*  rockerGeometry                                                    */
/* ------------------------------------------------------------------ */
describe('rockerGeometry', () => {
  it('places contact point at origin when theta=0', () => {
    const g = rockerGeometry(42, 17, 16, 10, 0);
    expect(g.contactX).toBeCloseTo(0);
  });

  it('places seat at seat height when theta=0', () => {
    const g = rockerGeometry(42, 17, 16, 10, 0);
    expect(g.seatY).toBeCloseTo(17);
  });

  it('shifts contact point when tilted', () => {
    const g = rockerGeometry(42, 17, 16, 10, 0.1);
    expect(g.contactX).toBeCloseTo(42 * 0.1);
  });

  it('places CoG above seat', () => {
    const g = rockerGeometry(42, 17, 16, 10, 0);
    expect(g.cogY).toBeGreaterThan(g.seatY);
  });

  it('arc centre is at height = radius when level', () => {
    const g = rockerGeometry(42, 17, 16, 10, 0);
    expect(g.arcCenterY).toBeCloseTo(42);
  });

  it('defaults cogOffsetX to 0 (CoG above seat centre)', () => {
    const g = rockerGeometry(42, 17, 16, 10, 0);
    // With cogOffsetX=0, CoG should be directly above seat midpoint
    expect(g.cogX).toBeCloseTo(0);
  });

  it('shifts CoG forward with positive cogOffsetX', () => {
    const g0 = rockerGeometry(42, 17, 16, 10, 0, 0);
    const gFwd = rockerGeometry(42, 17, 16, 10, 0, 3);
    expect(gFwd.cogX).toBeGreaterThan(g0.cogX);
  });

  it('shifts CoG backward with negative cogOffsetX', () => {
    const g0 = rockerGeometry(42, 17, 16, 10, 0, 0);
    const gBack = rockerGeometry(42, 17, 16, 10, 0, -3);
    expect(gBack.cogX).toBeLessThan(g0.cogX);
  });
});

/* ------------------------------------------------------------------ */
/*  equilibriumAngle                                                  */
/* ------------------------------------------------------------------ */
describe('equilibriumAngle', () => {
  it('returns 0 when cogOffsetX is 0', () => {
    expect(equilibriumAngle(42, 17, 10, 0)).toBeCloseTo(0);
  });

  it('returns positive (backward lean) for positive offset', () => {
    // Positive cogOffsetX = CoG forward → chair leans backward at rest
    const angle = equilibriumAngle(42, 17, 10, 3);
    expect(angle).toBeGreaterThan(0);
  });

  it('returns negative (forward lean) for negative offset', () => {
    // Negative cogOffsetX = CoG backward → chair leans forward at rest
    const angle = equilibriumAngle(42, 17, 10, -3);
    expect(angle).toBeLessThan(0);
  });

  it('returns 0 when CoG is at or above arc centre', () => {
    // seatHeight + cogAboveSeat >= radius → unstable
    expect(equilibriumAngle(20, 18, 5, 3)).toBeCloseTo(0);
  });

  it('larger offset gives larger equilibrium angle', () => {
    const small = Math.abs(equilibriumAngle(42, 17, 10, 1));
    const large = Math.abs(equilibriumAngle(42, 17, 10, 5));
    expect(large).toBeGreaterThan(small);
  });
});

/* ------------------------------------------------------------------ */
/*  effectivePendulumLength                                           */
/* ------------------------------------------------------------------ */
describe('effectivePendulumLength', () => {
  it('returns h²/(R - h) for stable configuration', () => {
    // R=42, h=27 → L_eff = 27²/(42-27) = 729/15 = 48.6
    expect(effectivePendulumLength(42, 27)).toBeCloseTo(48.6);
  });

  it('returns negative when CoG is above arc centre', () => {
    expect(effectivePendulumLength(20, 30)).toBeLessThan(0);
  });

  it('returns negative when CoG equals radius (unstable)', () => {
    expect(effectivePendulumLength(30, 30)).toBeLessThan(0);
  });
});

/* ------------------------------------------------------------------ */
/*  rockingPeriod                                                     */
/* ------------------------------------------------------------------ */
describe('rockingPeriod', () => {
  it('returns a finite period for positive lEff', () => {
    const T = rockingPeriod(15);
    expect(T).toBeGreaterThan(0);
    expect(isFinite(T)).toBe(true);
  });

  it('returns Infinity for non-positive lEff', () => {
    expect(rockingPeriod(0)).toBe(Infinity);
    expect(rockingPeriod(-5)).toBe(Infinity);
  });

  it('longer pendulum has longer period', () => {
    expect(rockingPeriod(20)).toBeGreaterThan(rockingPeriod(10));
  });

  it('matches expected value for given effective length', () => {
    // T = 2π √(L_eff / g) — formula unchanged; inputs are now larger
    const lEff = 48.6; // e.g. from effectivePendulumLength(42, 27)
    const expected = 2 * Math.PI * Math.sqrt(lEff / 386.09);
    expect(rockingPeriod(lEff)).toBeCloseTo(expected);
  });
});

/* ------------------------------------------------------------------ */
/*  rockingAngle                                                      */
/* ------------------------------------------------------------------ */
describe('rockingAngle', () => {
  it('returns initial amplitude at t=0', () => {
    const a = rockingAngle(0, 0.2, 15, 0.05);
    expect(a).toBeCloseTo(0.2);
  });

  it('decays over time', () => {
    const a0 = Math.abs(rockingAngle(0, 0.2, 15, 0.05));
    const a5 = Math.abs(rockingAngle(5, 0.2, 15, 0.05));
    expect(a5).toBeLessThan(a0);
  });

  it('returns 0 for non-positive lEff', () => {
    expect(rockingAngle(1, 0.2, -5, 0.05)).toBe(0);
  });

  it('higher damping decays faster', () => {
    const lowDamp = Math.abs(rockingAngle(3, 0.2, 15, 0.02));
    const highDamp = Math.abs(rockingAngle(3, 0.2, 15, 0.10));
    expect(highDamp).toBeLessThan(lowDamp);
  });
});

/* ------------------------------------------------------------------ */
/*  estimateDamping                                                   */
/* ------------------------------------------------------------------ */
describe('estimateDamping', () => {
  it('returns ~0.03 for 100 lb sitter', () => {
    expect(estimateDamping(100)).toBeCloseTo(0.03);
  });

  it('returns ~0.08 for 300 lb sitter', () => {
    expect(estimateDamping(300)).toBeCloseTo(0.08);
  });

  it('clamps below 100', () => {
    expect(estimateDamping(50)).toBeCloseTo(0.03);
  });

  it('clamps above 300', () => {
    expect(estimateDamping(400)).toBeCloseTo(0.08);
  });

  it('increases with weight', () => {
    expect(estimateDamping(200)).toBeGreaterThan(estimateDamping(150));
  });
});

/* ------------------------------------------------------------------ */
/*  estimateChairCogHeight                                            */
/* ------------------------------------------------------------------ */
describe('estimateChairCogHeight', () => {
  it('returns ⅔ of seat height', () => {
    expect(estimateChairCogHeight(18)).toBeCloseTo(12);
  });

  it('scales with seat height', () => {
    expect(estimateChairCogHeight(20)).toBeGreaterThan(estimateChairCogHeight(15));
  });
});

/* ------------------------------------------------------------------ */
/*  systemCogHeight                                                   */
/* ------------------------------------------------------------------ */
describe('systemCogHeight', () => {
  it('returns sitter CoG when chair weight is zero', () => {
    expect(systemCogHeight(170, 28, 0, 12)).toBeCloseTo(28);
  });

  it('returns weighted average of sitter and chair CoG', () => {
    // sitter 170 lb at 28", chair 30 lb at 12"
    // combined = (170*28 + 30*12) / 200 = (4760+360)/200 = 25.6
    expect(systemCogHeight(170, 28, 30, 12)).toBeCloseTo(25.6);
  });

  it('adding chair mass lowers the combined CoG', () => {
    const sitterOnly = systemCogHeight(170, 28, 0, 12);
    const withChair = systemCogHeight(170, 28, 25, 12);
    expect(withChair).toBeLessThan(sitterOnly);
  });
});


/* ------------------------------------------------------------------ */
/*  estimateChairCogOffsetX                                           */
/* ------------------------------------------------------------------ */
describe('estimateChairCogOffsetX', () => {
  it('returns a rear-biased default for typical rocker geometry', () => {
    expect(estimateChairCogOffsetX(16, 100)).toBeLessThan(0);
  });

  it('becomes more rear-biased with deeper seats', () => {
    expect(estimateChairCogOffsetX(20, 100)).toBeLessThan(estimateChairCogOffsetX(14, 100));
  });

  it('becomes more rear-biased with more reclined backrest', () => {
    expect(estimateChairCogOffsetX(16, 110)).toBeLessThan(estimateChairCogOffsetX(16, 95));
  });
});

/* ------------------------------------------------------------------ */
/*  systemCogOffsetX                                                  */
/* ------------------------------------------------------------------ */
describe('systemCogOffsetX', () => {
  it('returns sitter offset when chair weight is zero', () => {
    expect(systemCogOffsetX(170, 2.5, 0, -2)).toBeCloseTo(2.5);
  });

  it('returns weighted average of sitter and chair offsets', () => {
    // sitter 170 lb at +2", chair 30 lb at -2"
    // combined = (170*2 + 30*(-2)) / 200 = 1.4
    expect(systemCogOffsetX(170, 2, 30, -2)).toBeCloseTo(1.4);
  });

  it('chair rear bias pulls system offset backward', () => {
    const sitterOnly = systemCogOffsetX(170, 2, 0, -2);
    const withChair = systemCogOffsetX(170, 2, 25, -2);
    expect(withChair).toBeLessThan(sitterOnly);
  });
});

/* ------------------------------------------------------------------ */
/*  buildRockerModel                                                  */
/* ------------------------------------------------------------------ */
describe('buildRockerModel', () => {
  const defaults = {
    radius: 42,
    seatHeight: 17,
    seatDepth: 16,
    backrestAngle: 100,
    sitterWeight: 170,
    sitterHeight: 70,
    sitterGender: 'male',
  };

  it('returns a stable model for typical dimensions', () => {
    const m = buildRockerModel(defaults);
    expect(m.stable).toBe(true);
    expect(m.lEff).toBeGreaterThan(0);
  });

  it('returns an unstable model when seat is too high', () => {
    const m = buildRockerModel({ ...defaults, radius: 20, seatHeight: 19 });
    expect(m.stable).toBe(false);
    expect(m.period).toBe(Infinity);
  });

  it('has an angleAt function that returns equilibrium + amplitude at t=0', () => {
    const m = buildRockerModel(defaults);
    expect(m.angleAt(0)).toBeCloseTo(m.thetaEq + m.initialAmplitude);
  });

  it('has a geometryAt function returning geometry', () => {
    const m = buildRockerModel(defaults);
    const g = m.geometryAt(0);
    expect(g.theta).toBeCloseTo(m.thetaEq + m.initialAmplitude);
    expect(g.seatY).toBeDefined();
    expect(g.cogY).toBeDefined();
  });

  it('heavier sitter has higher damping', () => {
    const light = buildRockerModel({ ...defaults, sitterWeight: 120 });
    const heavy = buildRockerModel({ ...defaults, sitterWeight: 250 });
    expect(heavy.damping).toBeGreaterThan(light.damping);
  });

  it('taller sitter has higher CoG', () => {
    const short = buildRockerModel({ ...defaults, sitterHeight: 60 });
    const tall = buildRockerModel({ ...defaults, sitterHeight: 76 });
    expect(tall.cogHeight).toBeGreaterThan(short.cogHeight);
  });

  it('female sitter has lower CoG than male at same height', () => {
    const male = buildRockerModel({ ...defaults, sitterGender: 'male' });
    const female = buildRockerModel({ ...defaults, sitterGender: 'female' });
    expect(female.cogHeight).toBeLessThan(male.cogHeight);
  });

  it('including chair weight lowers the system CoG', () => {
    const noChair = buildRockerModel(defaults);
    const withChair = buildRockerModel({ ...defaults, chairWeight: 25 });
    expect(withChair.cogHeight).toBeLessThan(noChair.cogHeight);
  });

  it('including chair weight shortens the period', () => {
    const noChair = buildRockerModel(defaults);
    const withChair = buildRockerModel({ ...defaults, chairWeight: 25 });
    expect(withChair.period).toBeLessThan(noChair.period);
  });

  it('defaults to zero chair weight for backward compatibility', () => {
    const m = buildRockerModel(defaults);
    expect(m.chairWeight).toBe(0);
    // Without chair weight, cogHeight equals sitter-only CoG
    expect(m.cogHeight).toBeCloseTo(17 + m.pose.cog.y);
  });

  it('passes through sitterGender', () => {
    const m = buildRockerModel({ ...defaults, sitterGender: 'female' });
    expect(m.sitterGender).toBe('female');
  });

  it('passes through sitterHeight', () => {
    const m = buildRockerModel(defaults);
    expect(m.sitterHeight).toBe(70);
  });

  it('passes through backrestAngle', () => {
    const m = buildRockerModel({ ...defaults, backrestAngle: 110 });
    expect(m.backrestAngle).toBe(110);
  });

  it('defaults backrestAngle to 100 when omitted', () => {
    const m = buildRockerModel({
      radius: 42, seatHeight: 17, seatDepth: 16,
      sitterWeight: 170, sitterHeight: 70, sitterGender: 'male',
    });
    expect(m.backrestAngle).toBe(100);
  });

  it('takes the sitter CoG from the pose', () => {
    const m = buildRockerModel(defaults);
    expect(m.sitterCogOffsetX).toBe(m.pose.cog.x);
    expect(m.sitterCogAbove).toBe(m.pose.cog.y);
  });

  it('tracks both sitter and system CoG offsets', () => {
    const m = buildRockerModel({ ...defaults, torsoPosture: 'leaningForward', chairWeight: 25 });
    expect(m.sitterCogOffsetX).toBeGreaterThan(1);
    expect(m.cogOffsetX).toBeLessThan(m.sitterCogOffsetX);
    expect(m.chairCogOffsetX).toBeLessThan(0);
  });

  it('moves the load centre back when the feet carry weight', () => {
    const m = buildRockerModel({ ...defaults, chairWeight: 25 });
    expect(m.footLoad).toBeGreaterThan(10);
    expect(m.chairLoad).toBeCloseTo(170 + 25 - m.footLoad);
    const noFeet = systemCogOffsetX(170, m.sitterCogOffsetX, 25, m.chairCogOffsetX);
    expect(m.cogOffsetX).toBeLessThan(noFeet - 0.5);
    // …but the feet do not change how high the load rides
    expect(m.cogHeight).toBeCloseTo(systemCogHeight(170, 17 + m.pose.cog.y, 25, estimateChairCogHeight(17)));
  });

  it('a lower seat puts more on the feet and pitches the chair back', () => {
    const high = buildRockerModel({ ...defaults, chairWeight: 25, seatHeight: 17 });
    const low = buildRockerModel({ ...defaults, chairWeight: 25, seatHeight: 13 });
    expect(low.footLoad).toBeGreaterThan(high.footLoad + 10);
    expect(low.thetaEq).toBeLessThan(high.thetaEq - 0.05);
  });

  it('rests level when the contact point is under the load centre', () => {
    const probe = buildRockerModel(defaults);
    const m = buildRockerModel({ ...defaults, contactOffset: probe.cogOffsetX });
    expect(m.thetaEq).toBeCloseTo(0);
  });

  it('rests tilted when the contact point is away from the load centre', () => {
    const probe = buildRockerModel(defaults);
    const m = buildRockerModel({ ...defaults, contactOffset: probe.cogOffsetX - 3 });
    expect(m.thetaEq).toBeGreaterThan(0.1);
  });

  it('oscillates around thetaEq', () => {
    const m = buildRockerModel({ ...defaults, torsoPosture: 'leaningForward' });
    // At t=0, angle = thetaEq + initialAmplitude
    expect(m.angleAt(0)).toBeCloseTo(m.thetaEq + m.initialAmplitude);
    // After long time, angle should approach thetaEq (damped)
    const late = m.angleAt(100);
    expect(Math.abs(late - m.thetaEq)).toBeLessThan(0.01);
  });
});

describe('buildRockerModel postures', () => {
  const params = {
    radius: 42, seatHeight: 17, seatDepth: 16, backrestAngle: 100,
    sitterWeight: 170, sitterHeight: 70, sitterGender: 'male',
  };

  it('defaults to upright with the feet flat', () => {
    const m = buildRockerModel(params);
    expect(m.torsoPosture).toBe('upright');
    expect(m.legPosture).toBe('flat');
  });

  it('carries the posture keys through to the model', () => {
    const m = buildRockerModel({ ...params, torsoPosture: 'slouched', legPosture: 'out' });
    expect(m.torsoPosture).toBe('slouched');
    expect(m.legPosture).toBe('out');
  });

  it('lets the posture change where the chair rests', () => {
    const upright = buildRockerModel(params);
    const forward = buildRockerModel({ ...params, torsoPosture: 'leaningForward' });
    const armsBack = buildRockerModel({ ...params, torsoPosture: 'armsBack' });
    expect(forward.thetaEq).toBeGreaterThan(upright.thetaEq + 0.1);
    expect(armsBack.thetaEq).toBeLessThan(upright.thetaEq);
  });
});

/* ------------------------------------------------------------------ */
/*  runnerExtent                                                      */
/* ------------------------------------------------------------------ */
describe('runnerExtent', () => {
  it('reaches the overhang distance past each leg along the floor', () => {
    const { rearAngle, frontAngle } = runnerExtent(42, 16);
    expect(42 * Math.sin(rearAngle)).toBeCloseTo(8 + RUNNER_REAR_OVERHANG);
    expect(42 * Math.sin(frontAngle)).toBeCloseTo(8 + RUNNER_FRONT_OVERHANG);
  });

  it('has a longer tail than nose', () => {
    const { rearAngle, frontAngle } = runnerExtent(42, 16);
    expect(rearAngle).toBeGreaterThan(frontAngle);
  });

  it('wraps further round a tighter radius', () => {
    expect(runnerExtent(26, 16).rearAngle).toBeGreaterThan(runnerExtent(42, 16).rearAngle);
  });

  it('never wraps past 80° even for a tiny radius', () => {
    const { rearAngle, frontAngle } = runnerExtent(10, 16);
    expect(rearAngle).toBeCloseTo((80 * Math.PI) / 180);
    expect(frontAngle).toBeCloseTo((80 * Math.PI) / 180);
  });
});

/* ------------------------------------------------------------------ */
/*  fallDirection                                                     */
/* ------------------------------------------------------------------ */
describe('fallDirection', () => {
  const runner = { rearAngle: 0.5, frontAngle: 0.4 };

  it('stays up when the rest angle is within the runner', () => {
    expect(fallDirection(true, 0, 0, runner)).toBe(0);
    expect(fallDirection(true, 0.3, 0, runner)).toBe(0);
    expect(fallDirection(true, -0.4, 0, runner)).toBe(0);
  });

  it('falls forward when resting past the nose of the runner', () => {
    expect(fallDirection(true, 0.45, 0, runner)).toBe(1);
  });

  it('falls backward when resting past the tail of the runner', () => {
    expect(fallDirection(true, -0.55, 0, runner)).toBe(-1);
  });

  it('treats the last degree of runner as over the edge', () => {
    expect(fallDirection(true, 0.4 - 0.005, 0, runner)).toBe(1);
  });

  it('tips an unstable chair toward its centre of gravity', () => {
    expect(fallDirection(false, 0, 2, runner)).toBe(1);
    expect(fallDirection(false, 0, -2, runner)).toBe(-1);
    expect(fallDirection(false, 0, 0, runner)).toBe(-1);
  });
});

/* ------------------------------------------------------------------ */
/*  tippedGeometry                                                    */
/* ------------------------------------------------------------------ */
describe('tippedGeometry', () => {
  it('matches the rolling geometry before the chair starts to pivot', () => {
    const rolling = rockerGeometry(42, 17, 16, 10, 0.3, 1);
    const tipped = tippedGeometry(42, 17, 10, 1, 0.3, 0);
    for (const k of Object.keys(rolling)) {
      expect(tipped[k]).toBeCloseTo(rolling[k]);
    }
  });

  it('keeps the pivot fixed on the floor while the arc centre swings round it', () => {
    const g = tippedGeometry(42, 17, 10, 0, 0.3, 0.5);
    expect(g.contactX).toBeCloseTo(42 * 0.3);
    const dx = g.arcCenterX - g.contactX;
    const dy = g.arcCenterY;
    expect(Math.hypot(dx, dy)).toBeCloseTo(42);
    expect(g.arcCenterX).toBeGreaterThan(42 * 0.3); // swung forward
    expect(g.arcCenterY).toBeLessThan(42);           // and down
  });

  it('swings backward for a negative pivot angle', () => {
    const g = tippedGeometry(42, 17, 10, 0, -0.3, -0.5);
    expect(g.arcCenterX).toBeLessThan(-42 * 0.3);
  });
});

/* ------------------------------------------------------------------ */
/*  backrestLength / localToWorld                                     */
/* ------------------------------------------------------------------ */
describe('backrestLength', () => {
  it('grows with the sitter', () => {
    expect(backrestLength(76, 100)).toBeGreaterThan(backrestLength(60, 100));
  });

  it('is longer for a more reclined backrest', () => {
    expect(backrestLength(70, 120)).toBeGreaterThan(backrestLength(70, 90));
  });
});

describe('localToWorld', () => {
  it('is a pure translation at zero rotation', () => {
    expect(localToWorld(1, 2, 10, 20, 0)).toEqual([11, 22]);
  });

  it('rotates clockwise for positive theta', () => {
    // A point straight above the centre swings forward (+x) when tilted forward
    const [x, y] = localToWorld(0, 10, 0, 0, Math.PI / 2);
    expect(x).toBeCloseTo(10);
    expect(y).toBeCloseTo(0);
  });
});

/* ------------------------------------------------------------------ */
/*  buildRockerModel — runners and falling                            */
/* ------------------------------------------------------------------ */
describe('buildRockerModel runner limits', () => {
  const base = {
    radius: 42, seatHeight: 17, seatDepth: 16, backrestAngle: 100,
    chairWeight: 25, sitterWeight: 170, sitterHeight: 70, sitterGender: 'male',
  };

  it('stays upright at a sensible radius', () => {
    const m = buildRockerModel(base);
    expect(m.fallDirection).toBe(0);
    expect(m.runnerRearAngle).toBeGreaterThan(0);
    expect(m.runnerFrontAngle).toBeGreaterThan(0);
  });

  it('falls backward at the reported 26 in radius (rest angle past the runner tail)', () => {
    const m = buildRockerModel({ ...base, radius: 26 });
    expect(m.thetaEq).toBeLessThan(-m.runnerRearAngle);
    expect(m.fallDirection).toBe(-1);
    expect(m.initialAmplitude).toBe(0);
  });

  it('still rocks at 26 in once the contact point is moved back under the sitter', () => {
    const m = buildRockerModel({ ...base, radius: 26, contactOffset: -3 });
    expect(m.fallDirection).toBe(0);
    expect(m.initialAmplitude).toBeGreaterThan(0);
  });

  it('falls forward for the reported shallow seat / upright back case', () => {
    const m = buildRockerModel({ ...base, radius: 26, seatDepth: 6, backrestAngle: 70, sitterWeight: 190 });
    expect(m.fallDirection).toBe(1);
  });

  it('falls over when the CoG is above the rocker centre', () => {
    const m = buildRockerModel({ ...base, radius: 20, seatHeight: 19 });
    expect(m.stable).toBe(false);
    expect(m.fallDirection).not.toBe(0);
  });

  it('never swings past the ends of the runners', () => {
    for (const contactOffset of [-6, -4, -2, 0, 2]) {
      const m = buildRockerModel({ ...base, contactOffset });
      expect(m.fallDirection).toBe(0);
      expect(m.thetaEq + m.initialAmplitude).toBeLessThan(m.runnerFrontAngle);
      expect(m.thetaEq - m.initialAmplitude).toBeGreaterThan(-m.runnerRearAngle);
    }
  });

  it('exposes the sitter CoG height for the fall simulation', () => {
    const m = buildRockerModel(base);
    expect(m.sitterCogAbove).toBeCloseTo(m.pose.cog.y);
  });
});

/* ------------------------------------------------------------------ */
/*  buildFall                                                         */
/* ------------------------------------------------------------------ */
describe('buildFall', () => {
  const base = {
    radius: 26, seatHeight: 17, seatDepth: 16, backrestAngle: 100,
    chairWeight: 25, sitterWeight: 170, sitterHeight: 70, sitterGender: 'male',
  };

  it('returns null for a chair that stays up', () => {
    expect(buildFall(buildRockerModel({ ...base, radius: 42 }))).toBeNull();
  });

  it('rolls back to the runner tail and then goes over backward', () => {
    const m = buildRockerModel(base);
    const fall = buildFall(m);
    expect(fall.direction).toBe(-1);
    expect(fall.thetaEnd).toBeCloseTo(-m.runnerRearAngle);
    expect(fall.thetaFinal).toBeLessThan(fall.thetaEnd - 0.5);
    // Starts level, on its runners
    const p0 = fall.poseAt(0);
    expect(p0.theta).toBeCloseTo(0);
    expect(p0.geom.arcCenterY).toBeCloseTo(26);
    expect(p0.sitter).toBeNull();
    // Angle only ever decreases (rolls and tips the same way) until it lands
    let prev = 0;
    for (let t = 0.05; t < fall.duration; t += 0.05) {
      const theta = fall.poseAt(t).theta;
      expect(theta).toBeLessThanOrEqual(prev + 1e-9);
      prev = theta;
      if (theta <= fall.thetaFinal + 1e-9) {
        break;
      }
    }
  });

  it('pivots on the runner tip once past the end', () => {
    const fall = buildFall(buildRockerModel(base));
    // Find a moment well past the runner tail but before the floor
    const t = [...Array(200)].map((_, i) => i * 0.01)
      .find((t) => fall.poseAt(t).theta < fall.thetaEnd - 0.3);
    const { geom } = fall.poseAt(t);
    expect(geom.contactX).toBeCloseTo(26 * fall.thetaEnd);
    expect(geom.arcCenterY).toBeLessThan(26);
    expect(Math.hypot(geom.arcCenterX - geom.contactX, geom.arcCenterY)).toBeCloseTo(26);
  });

  it('throws the sitter out, who lands on the far side and complains', () => {
    const fall = buildFall(buildRockerModel(base));
    const end = fall.poseAt(fall.duration);
    expect(end.done).toBe(true);
    expect(end.sitter).toBeTruthy();
    expect(end.sitter.lift).toBe(true);
    // Sitter ended up behind the chair's pivot (backward fall)
    expect(end.sitter.arcCenterX).toBeLessThan(end.geom.contactX);
    // Said "oof!" at some point after landing, but not for ever
    const said = [...Array(400)].map((_, i) => fall.poseAt(i * 0.01).sitter?.say).filter(Boolean);
    expect(said).toContain('oof!');
    expect(end.sitter.say).toBeUndefined();
  });

  it('throws the sitter forward in a forward fall', () => {
    const m = buildRockerModel({ ...base, seatDepth: 6, backrestAngle: 70, sitterWeight: 190 });
    const fall = buildFall(m);
    expect(fall.direction).toBe(1);
    const end = fall.poseAt(fall.duration);
    expect(end.theta).toBeGreaterThan(m.runnerFrontAngle);
    expect(end.sitter.arcCenterX).toBeGreaterThan(end.geom.contactX);
  });

  it('can start from wherever the chair was', () => {
    const m = buildRockerModel(base);
    const fall = buildFall(m, -0.3);
    expect(fall.poseAt(0).theta).toBeCloseTo(-0.3);
    // A start beyond the runners is pulled back onto them
    expect(buildFall(m, -5).poseAt(0).theta).toBeCloseTo(-m.runnerRearAngle);
  });

  it('the final pose matches poseAt(duration)', () => {
    const fall = buildFall(buildRockerModel(base));
    expect(fall.finalPose).toEqual(fall.poseAt(fall.duration));
  });

  it('keeps the sitter above the floor until they come to rest', () => {
    const fall = buildFall(buildRockerModel(base));
    const m = buildRockerModel(base);
    for (let t = 0; t <= fall.duration; t += 0.02) {
      const { sitter } = fall.poseAt(t);
      if (!sitter) {
        continue;
      }
      const [, cogY] = localToWorld(m.sitterCogOffsetX, m.seatHeight - m.radius + m.sitterCogAbove,
        sitter.arcCenterX, sitter.arcCenterY, sitter.theta);
      expect(cogY).toBeGreaterThan(2.9);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Contact point fore/aft (chair slid along its circle)              */
/* ------------------------------------------------------------------ */
describe('legLengths', () => {
  it('cuts both legs equally when the contact point is under the seat centre', () => {
    const { front, rear } = legLengths(42, 17, 16, 0);
    expect(front).toBeCloseTo(rear);
    // Each leg is 8 in from the arc bottom: rise = R(1 − cos(asin(8/R)))
    expect(front).toBeCloseTo(17 - 42 * (1 - Math.cos(Math.asin(8 / 42))));
  });

  it('lengthens the rear leg and shortens the front one as the contact point moves back', () => {
    const level = legLengths(42, 17, 16, 0);
    const back = legLengths(42, 17, 16, -4);
    expect(back.rear).toBeGreaterThan(level.rear);
    expect(back.front).toBeLessThan(level.front);
  });

  it('puts a leg at full seat height when it stands on the contact point', () => {
    expect(legLengths(42, 17, 16, -8).rear).toBeCloseTo(17);
    expect(legLengths(42, 17, 16, 8).front).toBeCloseTo(17);
  });
});

describe('runnerExtent with a contact offset', () => {
  it('keeps the overhang past each leg', () => {
    const { rearAngle, frontAngle } = runnerExtent(42, 16, -4);
    expect(42 * Math.sin(rearAngle)).toBeCloseTo(8 - 4 + RUNNER_REAR_OVERHANG);
    expect(42 * Math.sin(frontAngle)).toBeCloseTo(8 + 4 + RUNNER_FRONT_OVERHANG);
  });
});

describe('buildRockerModel contact offset', () => {
  const base = {
    radius: 42, seatHeight: 17, seatDepth: 16, backrestAngle: 100,
    chairWeight: 25, sitterWeight: 170, sitterHeight: 70, sitterGender: 'male',
  };

  it('defaults to the contact point under the seat centre', () => {
    const m = buildRockerModel(base);
    expect(m.contactOffset).toBe(0);
    expect(m.cogLocalX).toBeCloseTo(m.cogOffsetX);
  });

  it('rolls forward to rest when the contact point is behind the sitter', () => {
    // Contact point 6 in behind the seat centre: the weight is ahead of
    // it, so the chair pitches forward until the CoG is plumb over it.
    const level = buildRockerModel(base);
    const back = buildRockerModel({ ...base, contactOffset: -6 });
    expect(back.thetaEq).toBeGreaterThan(level.thetaEq + 0.1);
    expect(back.fallDirection).toBe(0);
    // The CoG relative to the seat is unchanged — only the chair moved
    expect(back.cogOffsetX).toBeCloseTo(level.cogOffsetX);
    expect(back.cogLocalX).toBeCloseTo(level.cogLocalX + 6);
  });

  it('rolls back to rest when the contact point is ahead of the sitter', () => {
    const level = buildRockerModel(base);
    const fwd = buildRockerModel({ ...base, contactOffset: 4 });
    expect(fwd.thetaEq).toBeLessThan(level.thetaEq - 0.05);
  });

  it('reports the leg cut lengths', () => {
    const m = buildRockerModel({ ...base, contactOffset: -4 });
    expect(m.legLengths).toEqual(legLengths(42, 17, 16, -4));
    expect(m.legLengths.rear).toBeGreaterThan(m.legLengths.front);
  });

  it('rests with the CoG plumb over the contact point', () => {
    const m = buildRockerModel({ ...base, contactOffset: -5 });
    const g = m.geometryAt(1000); // long after the rocking has died away
    expect(g.cogX).toBeCloseTo(g.contactX, 3);
    // Level, the seat centre sits 5 in ahead of the contact point
    const level = rockerGeometry(42, 17, 16, m.cogAboveSeat, 0, m.cogLocalX, -5);
    expect(level.seatX).toBeCloseTo(5);
    expect(level.contactX).toBeCloseTo(0);
  });

  it('starts a fall from the shifted seat', () => {
    // Contact point 3 in ahead of the seat centre on a tight radius: the
    // load is well behind it and the chair goes over backward
    const m = buildRockerModel({ ...base, radius: 26, contactOffset: 3 });
    expect(m.fallDirection).toBe(-1);
    const fall = buildFall(m);
    const p = fall.poseAt(0);
    // Seat centre sits 3 in behind the level contact point
    expect(p.geom.seatX).toBeCloseTo(-3);
  });
});
