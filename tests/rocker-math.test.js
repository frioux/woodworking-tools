import { describe, it, expect } from 'vitest';
import {
  sitterCogAboveSeat,
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
  POSTURE_PRESETS,
  runnerExtent,
  fallDirection,
  tippedGeometry,
  backrestLength,
  localToWorld,
  buildFall,
  RUNNER_REAR_OVERHANG,
  RUNNER_FRONT_OVERHANG,
} from '../rocker-model/rocker-math.js';

/* ------------------------------------------------------------------ */
/*  sitterCogAboveSeat                                                */
/* ------------------------------------------------------------------ */
describe('sitterCogAboveSeat', () => {
  it('returns a positive value for typical inputs', () => {
    const cog = sitterCogAboveSeat(70, 'male');
    expect(cog).toBeGreaterThan(0);
  });

  it('is proportional to height', () => {
    const short = sitterCogAboveSeat(60, 'male');
    const tall = sitterCogAboveSeat(76, 'male');
    expect(tall).toBeGreaterThan(short);
  });

  it('returns a lower CoG for female than male at same height', () => {
    const male = sitterCogAboveSeat(68, 'male');
    const female = sitterCogAboveSeat(68, 'female');
    expect(female).toBeLessThan(male);
  });

  it('computes expected value for 70-inch male', () => {
    // sitting height = 70 * 0.52 = 36.4; CoG = 36.4 * 0.30 = 10.92
    expect(sitterCogAboveSeat(70, 'male')).toBeCloseTo(10.92);
  });

  it('computes expected value for 64-inch female', () => {
    // sitting height = 64 * 0.52 = 33.28; CoG = 33.28 * 0.29 = 9.6512
    expect(sitterCogAboveSeat(64, 'female')).toBeCloseTo(9.6512);
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
/*  POSTURE_PRESETS                                                   */
/* ------------------------------------------------------------------ */
describe('POSTURE_PRESETS', () => {
  it('contains a neutral preset at offset 0', () => {
    expect(POSTURE_PRESETS.neutral).toBeDefined();
    expect(POSTURE_PRESETS.neutral.cogOffsetX).toBe(0);
  });

  it('has a label for each preset', () => {
    for (const [, preset] of Object.entries(POSTURE_PRESETS)) {
      expect(typeof preset.label).toBe('string');
      expect(preset.label.length).toBeGreaterThan(0);
    }
  });

  it('has a numeric cogOffsetX for each preset', () => {
    for (const [, preset] of Object.entries(POSTURE_PRESETS)) {
      expect(typeof preset.cogOffsetX).toBe('number');
    }
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
    const sitterCogH = 17 + 70 * 0.52 * 0.30; // seatHeight + cogAboveSeat
    expect(m.cogHeight).toBeCloseTo(sitterCogH);
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

  it('defaults sitterCogOffsetX to 0 when omitted', () => {
    const m = buildRockerModel(defaults);
    expect(m.sitterCogOffsetX).toBe(0);
  });

  it('tracks both sitter and system CoG offsets', () => {
    const m = buildRockerModel({ ...defaults, cogOffsetX: 3, chairWeight: 25 });
    expect(m.sitterCogOffsetX).toBe(3);
    expect(m.cogOffsetX).toBeLessThan(3);
    expect(m.chairCogOffsetX).toBeLessThan(0);
  });

  it('has thetaEq of 0 with cogOffsetX=0', () => {
    const m = buildRockerModel(defaults);
    expect(m.thetaEq).toBeCloseTo(0);
  });

  it('has non-zero thetaEq with non-zero cogOffsetX', () => {
    const m = buildRockerModel({ ...defaults, cogOffsetX: 3 });
    expect(m.thetaEq).not.toBeCloseTo(0);
  });

  it('oscillates around thetaEq', () => {
    const m = buildRockerModel({ ...defaults, cogOffsetX: 3 });
    // At t=0, angle = thetaEq + initialAmplitude
    expect(m.angleAt(0)).toBeCloseTo(m.thetaEq + m.initialAmplitude);
    // After long time, angle should approach thetaEq (damped)
    const late = m.angleAt(100);
    expect(Math.abs(late - m.thetaEq)).toBeLessThan(0.01);
  });
});

describe('buildRockerModel posture passthrough', () => {
  const params = {
    radius: 42, seatHeight: 17, seatDepth: 16, backrestAngle: 100,
    sitterWeight: 170, sitterHeight: 70, sitterGender: 'male',
  };

  it('defaults posture to neutral', () => {
    expect(buildRockerModel(params).posture).toBe('neutral');
  });

  it('carries the posture key through to the model', () => {
    expect(buildRockerModel({ ...params, posture: 'reclined' }).posture).toBe('reclined');
  });

  it('does not let posture alone change the physics', () => {
    const a = buildRockerModel({ ...params, posture: 'neutral' });
    const b = buildRockerModel({ ...params, posture: 'legsForward' });
    expect(b.thetaEq).toBe(a.thetaEq);
    expect(b.period).toBe(a.period);
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

  it('still rocks at 27 in, one inch away', () => {
    const m = buildRockerModel({ ...base, radius: 27 });
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
    for (const cogOffsetX of [-4, -2, 0, 2, 4]) {
      const m = buildRockerModel({ ...base, cogOffsetX });
      expect(m.fallDirection).toBe(0);
      expect(m.thetaEq + m.initialAmplitude).toBeLessThan(m.runnerFrontAngle);
      expect(m.thetaEq - m.initialAmplitude).toBeGreaterThan(-m.runnerRearAngle);
    }
  });

  it('exposes the sitter CoG height for the fall simulation', () => {
    const m = buildRockerModel(base);
    expect(m.sitterCogAbove).toBeCloseTo(sitterCogAboveSeat(70, 'male'));
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
