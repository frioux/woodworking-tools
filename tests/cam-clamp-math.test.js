import { describe, it, expect } from 'vitest';
import {
  calculateClamp, validateClamp, clampWarnings, formatInches, PLAN,
  camLift, tongueLift, leverProfile
} from '../cam-clamp/cam-clamp-math.js';

// The original Fine Woodworking plan: 1/4" x 1" x 8-1/2" bar.
const original = { barThickness: 0.25, barWidth: 1, barLength: 8.5, jawReach: 4.75 };

describe('calculateClamp — original plan', () => {
  const d = calculateClamp(original);

  it('reproduces the plan\'s stock sizes', () => {
    expect(d.jawLength).toBe(6.25);
    expect(d.jawThickness).toBe(0.75);
    expect(d.fixedHeight).toBe(1.5);
    expect(d.leverLength).toBeCloseTo(4 + 5 / 16);
    expect(d.leverWidth).toBe(1.25);
    expect(d.leverThickness).toBe(3 / 16);
  });

  it('reproduces the plan\'s layout', () => {
    expect(d.mortiseWidth).toBe(5 / 16);
    expect(d.padStart).toBe(4.75);                 // 1-1/2" pad at the tip
    expect(d.notchLength).toBeCloseTo(2 + 7 / 8);  // 2-7/8" notch
    expect(d.leverSlotLength).toBe(4.25);
    expect(d.fixedPins[0].x).toBe(11 / 16);
    expect(d.fixedPins[1].x).toBe(1 + 1 / 8);
    expect(d.slidingPins[0].x).toBe(3 / 8);
  });

  it('sliding pins straddle the bar with a little clearance', () => {
    const [p1, p2] = d.slidingPins;
    const gap = (p2.x - p1.x) - d.pinDiameter;
    expect(gap).toBeGreaterThan(d.barWidth);
    expect(gap - d.barWidth).toBeCloseTo(PLAN.pinGripClearance);
  });

  it('the bar lines up between the jaws', () => {
    const barBackInSliding = d.slidingPins[0].x + d.pinDiameter / 2 + PLAN.pinGripClearance / 2;
    expect(barBackInSliding + d.slidingOffset).toBeCloseTo(d.barInset);
  });

  it('locks at a small rack angle', () => {
    expect(d.lockAngleDeg).toBeGreaterThan(1);
    expect(d.lockAngleDeg).toBeLessThan(5);
  });

  it('computes the opening from the bar length', () => {
    // 8-1/2 bar − 2 sliding − 1-1/2 fixed − two 3/16 pads
    expect(d.capacity).toBeCloseTo(4 + 5 / 8);
  });

  it('mortise and slot fit inside the jaw', () => {
    expect(d.slidingMortiseStart).toBeGreaterThan(0);
    expect(d.slidingMortiseStart + d.slidingMortiseLength)
      .toBeLessThan(d.reliefX - d.reliefDiameter / 2);
    expect(d.leverSlotStart).toBeGreaterThan(d.slidingMortiseStart + d.slidingMortiseLength);
    expect(d.pivotX).toBeGreaterThan(d.leverSlotStart);
  });
});

describe('cam lever geometry', () => {
  const d = calculateClamp(original);

  it('pivot location agrees between the jaw and the lever', () => {
    // Lever at rest: back end at the slot start, top edge on the kerf bottom.
    expect(d.leverSlotStart + d.leverPivot.x).toBeCloseTo(d.pivotX);
    expect(d.kerfBottom + d.leverPivot.y).toBeCloseTo(d.pivotY);
    expect(d.leverPivot.x).toBeCloseTo(3 + 5 / 8);
  });

  it('the nose is an eccentric arc that just overhangs the jaw tip at rest', () => {
    expect(d.camCenter.x - d.leverPivot.x).toBeCloseTo(PLAN.camEccentric);
    expect(d.camCenter.y).toBeCloseTo(d.leverPivot.y);
    expect(d.camMaxRadius).toBeCloseTo(11 / 16);
    expect(d.camNoseOverhang).toBeCloseTo(1 / 16);
    expect(d.leverSlotStart + d.leverLength - d.jawLength).toBeCloseTo(d.camNoseOverhang);
    // At rest the top of the arc is flush with the lever's top edge.
    expect(d.camCenter.y - d.camRadius).toBeCloseTo(0);
  });

  it('lifts 3/16 over 90°: the kerf closes first, then the tongue flexes 1/8', () => {
    expect(camLift(d, 0)).toBeCloseTo(d.pivotBelowKerf);
    expect(camLift(d, 90)).toBeCloseTo(d.pivotBelowKerf + d.camRise);
    expect(d.camRise).toBeCloseTo(3 / 16);
    expect(tongueLift(d, 0)).toBe(0);
    expect(tongueLift(d, 10)).toBe(0);              // still inside the kerf
    expect(tongueLift(d, 90)).toBeCloseTo(1 / 8);
    expect(d.tongueFlex).toBeCloseTo(1 / 8);
    // Monotonic up to dead center, and dead center is the maximum.
    let prev = -1;
    for (let a = 0; a <= 90; a += 5) {
      expect(camLift(d, a)).toBeGreaterThan(prev);
      prev = camLift(d, a);
    }
    expect(camLift(d, 100)).toBeLessThan(camLift(d, 90));
  });

  it('the nose never rises above the slot before the lever starts to swing', () => {
    // Every outline point must be within camRadius+eccentric of the pivot and
    // no point may sit above the top edge.
    const p = leverProfile(d);
    for (const seg of [p.top, p.heel, p.taper, p.back]) {
      for (const [x, y] of seg) {
        expect(y).toBeGreaterThanOrEqual(-1e-9);
        expect(y).toBeLessThanOrEqual(d.leverWidth + 1e-9);
        expect(Math.hypot(x - d.leverPivot.x, y - d.leverPivot.y))
          .toBeLessThanOrEqual(Math.hypot(d.leverPivot.x, d.leverWidth - d.leverPivot.y) + 1e-9);
      }
    }
  });

  it('the heel is tangent to the nose arc and lands 9/16 behind the nose', () => {
    expect(d.heelFoot.x).toBeCloseTo(d.leverLength - 9 / 16);
    expect(d.heelFoot.y).toBe(d.leverWidth);
    expect(Math.hypot(d.heelTop.x - d.camCenter.x, d.heelTop.y - d.camCenter.y)).toBeCloseTo(d.camRadius);
    // Tangent: radius ⟂ heel line
    const rx = d.heelTop.x - d.camCenter.x;
    const ry = d.heelTop.y - d.camCenter.y;
    const hx = d.heelFoot.x - d.heelTop.x;
    const hy = d.heelFoot.y - d.heelTop.y;
    expect(rx * hx + ry * hy).toBeCloseTo(0);
    expect(d.heelTop.x).toBeGreaterThan(d.camCenter.x);  // on the nose side
  });

  it('the handle tapers from the heel to a 5/8 end', () => {
    const p = leverProfile(d);
    expect(p.taper[0]).toEqual([d.heelFoot.x, d.heelFoot.y]);
    expect(p.taper[1]).toEqual([0, 5 / 8]);
    expect(d.handleTaperStart).toBeCloseTo(3.75);
  });

  it('estimates a plausible clamping force for the original plan', () => {
    expect(d.tongueSpan).toBeCloseTo(d.tongueLength - d.pivotFromTip);
    expect(d.clampForce).toBeGreaterThan(40);
    expect(d.clampForce).toBeLessThan(100);
  });

  it('keeps the cam geometry fixed and the handle growing with reach', () => {
    const b = calculateClamp({ ...original, jawReach: 8 });
    expect(b.camMaxRadius).toBe(d.camMaxRadius);
    expect(b.camRise).toBe(d.camRise);
    expect(b.handleLength - d.handleLength).toBeCloseTo(3.25);
    expect(b.leverSlotStart + b.leverPivot.x).toBeCloseTo(b.pivotX);
  });
});

describe('calculateClamp — parameters', () => {
  it('jaw reach lengthens the jaws, tongue and lever one-for-one', () => {
    const a = calculateClamp(original);
    const b = calculateClamp({ ...original, jawReach: 6.75 });
    expect(b.jawLength - a.jawLength).toBeCloseTo(2);
    expect(b.tongueLength - a.tongueLength).toBeCloseTo(2);
    expect(b.leverLength - a.leverLength).toBeCloseTo(2);
    expect(b.notchLength - a.notchLength).toBeCloseTo(2);
    expect(b.capacity).toBeCloseTo(a.capacity);
  });

  it('bar length only changes the opening', () => {
    const a = calculateClamp(original);
    const b = calculateClamp({ ...original, barLength: 12.5 });
    expect(b.capacity - a.capacity).toBeCloseTo(4);
    expect(b.jawLength).toBe(a.jawLength);
  });

  it('a wider bar lengthens the jaws and moves the pins', () => {
    const d = calculateClamp({ ...original, barWidth: 1.5 });
    expect(d.jawLength).toBe(6.75);
    expect(d.jawReach).toBe(4.75);
    expect(d.fixedMortiseLength).toBe(1.5);
    const [p1, p2] = d.slidingPins;
    expect((p2.x - p1.x) - d.pinDiameter - d.barWidth).toBeCloseTo(PLAN.pinGripClearance);
  });

  it('a thicker bar widens the mortise and thickens the jaws when needed', () => {
    const d = calculateClamp({ ...original, barThickness: 0.375 });
    expect(d.mortiseWidth).toBe(7 / 16);
    expect(d.jawThickness).toBe(7 / 8);
    expect((d.jawThickness - d.mortiseWidth) / 2).toBeGreaterThanOrEqual(PLAN.mortiseWall);
  });
});

describe('validateClamp', () => {
  it('accepts the original plan', () => {
    expect(validateClamp(original)).toEqual({});
  });

  it('rejects non-positive values', () => {
    const e = validateClamp({ barThickness: 0, barWidth: -1, barLength: 0, jawReach: 0 });
    expect(Object.keys(e).sort()).toEqual(['barLength', 'barThickness', 'barWidth', 'jawReach']);
  });

  it('rejects a reach too short for the cam', () => {
    expect(validateClamp({ ...original, jawReach: 2 }).jawReach).toBeTruthy();
  });

  it('rejects a bar too short to hold both jaws', () => {
    expect(validateClamp({ ...original, barLength: 4 }).barLength).toMatch(/Too short/);
  });

  it('rejects a bar too narrow for the pins', () => {
    expect(validateClamp({ ...original, barWidth: 0.25 }).barWidth).toBeTruthy();
  });
});

describe('clampWarnings', () => {
  it('no warnings for the original plan', () => {
    expect(clampWarnings(calculateClamp(original))).toEqual([]);
  });

  it('warns about long reach', () => {
    const w = clampWarnings(calculateClamp({ ...original, jawReach: 9 }));
    expect(w.some(s => /reach/i.test(s))).toBe(true);
  });

  it('warns about a light bar', () => {
    const w = clampWarnings(calculateClamp({ ...original, barThickness: 0.125 }));
    expect(w.some(s => /bar/i.test(s))).toBe(true);
  });

  it('warns when a long tongue makes the cam weak', () => {
    const w = clampWarnings(calculateClamp({ ...original, jawReach: 8 }));
    expect(w.some(s => /Weak cam/.test(s))).toBe(true);
    expect(clampWarnings(calculateClamp({ ...original, jawReach: 5 })).some(s => /Weak cam/.test(s))).toBe(false);
  });

  it('warns when jaws are thickened', () => {
    const w = clampWarnings(calculateClamp({ ...original, barThickness: 0.375 }));
    expect(w.some(s => /thickened/.test(s))).toBe(true);
  });
});

describe('formatInches', () => {
  it('formats fractions', () => {
    expect(formatInches(6.25)).toBe('6-1/4"');
    expect(formatInches(5 / 16)).toBe('5/16"');
    expect(formatInches(2)).toBe('2"');
  });
});
