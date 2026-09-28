import { describe, it, expect } from 'vitest';
import {
  calculateClamp, validateClamp, clampWarnings, formatInches, PLAN,
  camLift, tongueLift, leverProfile, leverToJaw
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
    expect(d.leverWidth).toBe(1 + 1 / 8);
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
  const toJaw = (pt, deg = 0) => leverToJaw(d, pt, deg);

  it('the pivot hole maps onto the jaw pivot in every position', () => {
    for (const deg of [0, 45, d.camSwing]) {
      const [x, y] = toJaw([d.leverPivot.x, d.leverPivot.y], deg);
      expect(x).toBeCloseTo(0);
      expect(y).toBeCloseTo(0);
    }
    expect(d.leverPivot).toEqual({ x: -1 / 8, y: -1 / 16 });
  });

  it('the outline is smooth: straight edges tangent to both circles', () => {
    const p = leverProfile(d);
    for (const [ends, c1, c2] of [
      [[p.headUpper, p.tailUpper], p.head, p.tail],
      [[p.headLower, p.tailLower], p.head, p.tail]
    ]) {
      const [[x1, y1], [x2, y2]] = ends;
      // each end lies on its circle ...
      expect(Math.hypot(x1 - c1.cx, y1 - c1.cy)).toBeCloseTo(c1.r);
      expect(Math.hypot(x2 - c2.cx, y2 - c2.cy)).toBeCloseTo(c2.r);
      // ... and the edge is perpendicular to both radii (tangent, no corner)
      const ex = x2 - x1;
      const ey = y2 - y1;
      expect(ex * (x1 - c1.cx) + ey * (y1 - c1.cy)).toBeCloseTo(0);
      expect(ex * (x2 - c2.cx) + ey * (y2 - c2.cy)).toBeCloseTo(0);
    }
    expect(p.head.r).toBe(9 / 16);
    expect(p.tail.r).toBe(5 / 16);
    expect(d.handleEndWidth).toBe(5 / 8);
    expect(d.centerDistance + d.headRadius + d.tailRadius).toBeCloseTo(d.leverLength);
  });

  it('at rest the handle hangs below the jaw and the head pokes past the tip', () => {
    const [, ty] = toJaw([-d.centerDistance, 0]);
    const bottomBelowPivot = d.slidingHeight - d.pivotY;
    expect(ty + d.tailRadius - bottomBelowPivot).toBeCloseTo(3 / 16);
    expect(d.noseOverhang).toBeGreaterThan(0);
    expect(d.noseOverhang).toBeLessThan(1 / 8);
    expect(d.restTiltDeg).toBeGreaterThan(0);
  });

  it('at rest the head clears the tongue, and the upper edge stays in the slot', () => {
    expect(camLift(d, 0)).toBeCloseTo(d.restLift);
    expect(d.restLift).toBeLessThan(d.contactLift);
    expect(tongueLift(d, 0)).toBe(0);
    const p = leverProfile(d);
    const [, uy] = toJaw(p.tailUpper);
    expect(-uy).toBeLessThan(d.pivotBelowKerf);
  });

  it('lifts smoothly to dead center and clamps just past it', () => {
    let prev = -1;
    for (let a = 0; a <= Math.floor(d.deadCenter); a += 5) {
      expect(camLift(d, a)).toBeGreaterThan(prev);
      prev = camLift(d, a);
    }
    expect(camLift(d, d.deadCenter)).toBeCloseTo(d.headRadius + d.eccentricity);
    expect(d.camSwing).toBeGreaterThan(d.deadCenter);
    expect(d.camSwing - d.deadCenter).toBeLessThan(10);
    // Past dead center the lift falls a little, so the load holds the lever shut.
    expect(camLift(d, d.camSwing)).toBeLessThan(camLift(d, d.deadCenter));
    expect(d.tongueFlex).toBeCloseTo(tongueLift(d, d.camSwing));
    expect(d.tongueFlex).toBeGreaterThan(1 / 10);
    expect(d.tongueFlex).toBeLessThan(3 / 16);
    expect(d.camRise).toBeCloseTo(d.headRadius + d.eccentricity - d.restLift);
  });

  it('the head is the only part that rises into the tongue', () => {
    // Swinging down, every point on the handle edges stays below the slot top
    // except the head itself.
    const p = leverProfile(d);
    for (let deg = 0; deg <= d.camSwing; deg += 5) {
      for (const pt of [p.tailUpper, p.tailLower, [-d.centerDistance - d.tailRadius, 0]]) {
        const [, y] = toJaw(pt, deg);
        expect(-y).toBeLessThan(d.pivotBelowKerf);
      }
    }
  });

  it('the slot holds the resting lever', () => {
    const [tx] = toJaw([-d.centerDistance, 0]);
    expect(d.leverSlotStart).toBeLessThan(d.pivotX + tx - d.tailRadius);
    expect(d.leverSlotStart).toBeGreaterThan(d.slidingMortiseStart + d.slidingMortiseLength);
  });

  it('estimates a plausible clamping force for the original plan', () => {
    expect(d.tongueSpan).toBeCloseTo(d.tongueLength - d.pivotFromTip);
    expect(d.clampForce).toBeGreaterThan(40);
    expect(d.clampForce).toBeLessThan(120);
  });

  it('keeps the head fixed and grows the handle with reach', () => {
    for (const jawReach of [3, 8, 12]) {
      const b = calculateClamp({ ...original, jawReach });
      expect(b.headRadius).toBe(d.headRadius);
      expect(b.centerDistance - d.centerDistance).toBeCloseTo(jawReach - original.jawReach);
      expect(b.restLift).toBeLessThan(b.contactLift);
      expect(b.camSwing).toBeGreaterThan(b.deadCenter);
      const [, ty] = leverToJaw(b, [-b.centerDistance, 0]);
      expect(ty + b.tailRadius - (b.slidingHeight - b.pivotY)).toBeCloseTo(3 / 16);
    }
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
