import { describe, it, expect } from 'vitest';
import { calculateDrawer, formatInches } from '../drawer-designer/drawer-math.js';

const defaults = {
  depth: 20,
  width: 24,
  height: 6,
  frontThickness: 0.75,
  sideThickness: 0.5
};

/* ------------------------------------------------------------------ */
/*  Piece lengths                                                     */
/* ------------------------------------------------------------------ */
describe('calculateDrawer — piece lengths', () => {
  it('front and back span the full width', () => {
    const d = calculateDrawer(defaults);
    expect(d.frontLength).toBe(24);
    expect(d.backLength).toBe(24);
  });

  it('sides span the full depth for through dovetails', () => {
    const d = calculateDrawer(defaults);
    expect(d.halfBlindFront).toBe(false);
    expect(d.frontLap).toBe(0);
    expect(d.sideLength).toBe(20);
  });

  it('all walls are full height', () => {
    const d = calculateDrawer(defaults);
    expect(d.pieceHeight).toBe(6);
    expect(d.backHeight).toBe(6);
  });

  it('back thickness equals secondary (side) thickness', () => {
    const d = calculateDrawer(defaults);
    expect(d.backThickness).toBe(0.5);
  });
});

/* ------------------------------------------------------------------ */
/*  Half-blind front                                                  */
/* ------------------------------------------------------------------ */
describe('calculateDrawer — half-blind front', () => {
  it('leaves a lap of a quarter of the front thickness', () => {
    const d = calculateDrawer({ ...defaults, halfBlindFront: true });
    expect(d.frontLap).toBeCloseTo(0.75 / 4);
    expect(d.frontSocketDepth).toBeCloseTo(0.75 - 0.75 / 4);
  });

  it('shortens the sides by the front lap', () => {
    const d = calculateDrawer({ ...defaults, halfBlindFront: true });
    expect(d.sideLength).toBeCloseTo(20 - 0.75 / 4);
  });

  it('does not change the front length', () => {
    const through = calculateDrawer(defaults);
    const halfBlind = calculateDrawer({ ...defaults, halfBlindFront: true });
    expect(halfBlind.frontLength).toBe(through.frontLength);
  });
});

/* ------------------------------------------------------------------ */
/*  Interior & bottom panel                                           */
/* ------------------------------------------------------------------ */
describe('calculateDrawer — interior & bottom', () => {
  it('computes interior width from the side walls', () => {
    const d = calculateDrawer(defaults);
    // 24 - 2*0.5 = 23
    expect(d.innerWidth).toBeCloseTo(23);
  });

  it('computes interior depth from front + back walls', () => {
    const d = calculateDrawer(defaults);
    // 20 - 0.75 - 0.5 = 18.75
    expect(d.innerDepth).toBeCloseTo(18.75);
  });

  it('bottom panel is the interior plus two groove depths, less the fit gap', () => {
    const d = calculateDrawer(defaults);
    // width: 23 + 2*0.25 - 1/16 = 23.4375
    expect(d.bottomWidth).toBeCloseTo(23 + 0.5 - 1 / 16);
    // depth: 18.75 + 2*0.25 - 1/16 = 19.1875
    expect(d.bottomDepth).toBeCloseTo(18.75 + 0.5 - 1 / 16);
  });

  it('groove width matches the bottom thickness', () => {
    const d = calculateDrawer({ ...defaults, bottomThickness: 0.25 });
    expect(d.grooveWidth).toBeCloseTo(0.25);
  });

  it('respects custom groove depth and bottom gap', () => {
    const d = calculateDrawer({ ...defaults, grooveDepth: 0.375, bottomGap: 0 });
    expect(d.bottomWidth).toBeCloseTo(23 + 2 * 0.375);
  });
});

/* ------------------------------------------------------------------ */
/*  Dovetail layout                                                   */
/* ------------------------------------------------------------------ */
describe('calculateDrawer — dovetail layout', () => {
  it('suggests at least two tails', () => {
    const d = calculateDrawer({ ...defaults, height: 2 });
    expect(d.tailCount).toBeGreaterThanOrEqual(2);
  });

  it('uses more tails for taller drawers', () => {
    const short = calculateDrawer({ ...defaults, height: 4 });
    const tall = calculateDrawer({ ...defaults, height: 12 });
    expect(tall.tailCount).toBeGreaterThan(short.tailCount);
  });
});

/* ------------------------------------------------------------------ */
/*  formatInches                                                      */
/* ------------------------------------------------------------------ */
describe('formatInches', () => {
  it('formats whole inches', () => {
    expect(formatInches(3)).toBe('3"');
  });

  it('formats simple fractions', () => {
    expect(formatInches(1.5)).toBe('1-1/2"');
    expect(formatInches(0.25)).toBe('1/4"');
  });

  it('simplifies to lowest terms', () => {
    expect(formatInches(0.5)).toBe('1/2"');
    expect(formatInches(19.1875)).toBe('19-3/16"');
  });
});
