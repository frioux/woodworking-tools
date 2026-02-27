import { describe, it, expect } from 'vitest';
import {
  sitterCogAboveSeat,
  sitterMass,
  rockerGeometry,
  effectivePendulumLength,
  rockingPeriod,
  rockingAngle,
  estimateDamping,
  estimateChairCogHeight,
  systemCogHeight,
  buildRockerModel,
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

  it('has an angleAt function that returns amplitude at t=0', () => {
    const m = buildRockerModel(defaults);
    expect(m.angleAt(0)).toBeCloseTo(m.initialAmplitude);
  });

  it('has a geometryAt function returning geometry', () => {
    const m = buildRockerModel(defaults);
    const g = m.geometryAt(0);
    expect(g.theta).toBeCloseTo(m.initialAmplitude);
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
});
