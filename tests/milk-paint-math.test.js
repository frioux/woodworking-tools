import { describe, it, expect } from 'vitest';
import {
  PAINT_RECIPE,
  QUARK_YIELD,
  scalePaint,
  scaleQuark,
  formatNumber
} from '../milk-paint/milk-paint-math.js';

describe('scalePaint', () => {
  it('returns the base recipe when scaling by 8 oz quark', () => {
    const r = scalePaint({ scaleBy: 'quark', value: 8 });
    expect(r.factor).toBe(1);
    expect(r.quarkOz).toBe(8);
    expect(r.quarkG).toBe(250);
    expect(r.waterOz).toBe(3);
    expect(r.waterMl).toBe(90);
    expect(r.limeOz).toBe(1);
    expect(r.limeG).toBe(30);
    expect(r.pigmentOz).toBe(1);
    expect(r.pigmentG).toBe(30);
  });

  it('returns the base recipe when scaling by 1 oz pigment', () => {
    const r = scalePaint({ scaleBy: 'pigment', value: 1 });
    expect(r.factor).toBe(1);
    expect(r.quarkOz).toBe(8);
    expect(r.pigmentOz).toBe(1);
  });

  it('halves the recipe when given 4 oz quark', () => {
    const r = scalePaint({ scaleBy: 'quark', value: 4 });
    expect(r.factor).toBe(0.5);
    expect(r.quarkOz).toBe(4);
    expect(r.waterOz).toBe(1.5);
    expect(r.limeOz).toBe(0.5);
    expect(r.pigmentOz).toBe(0.5);
  });

  it('doubles the recipe when given 2 oz pigment', () => {
    const r = scalePaint({ scaleBy: 'pigment', value: 2 });
    expect(r.factor).toBe(2);
    expect(r.quarkOz).toBe(16);
    expect(r.waterOz).toBe(6);
    expect(r.limeOz).toBe(2);
    expect(r.pigmentOz).toBe(2);
    expect(r.pigmentG).toBe(60);
  });

  it('scales metric quantities the same as customary', () => {
    const r = scalePaint({ scaleBy: 'quark', value: 4 });
    expect(r.quarkG).toBe(125);
    expect(r.waterMl).toBe(45);
    expect(r.limeG).toBe(15);
    expect(r.pigmentG).toBe(15);
  });

  it('matches the recipe author\'s 6 tbsp at the base ratio', () => {
    // 1 fl oz = 2 tbsp, so 3 fl oz = 6 tbsp
    const r = scalePaint({ scaleBy: 'quark', value: 8 });
    expect(r.waterOz * 2).toBe(6);
  });

  it('throws on unknown scaleBy', () => {
    expect(() => scalePaint({ scaleBy: 'lime', value: 1 })).toThrow();
  });

  it('produces tiny batches', () => {
    const r = scalePaint({ scaleBy: 'pigment', value: 0.25 });
    expect(r.factor).toBe(0.25);
    expect(r.quarkOz).toBe(2);
    expect(r.limeOz).toBe(0.25);
  });
});

describe('scaleQuark', () => {
  it('produces 4 oz quark from 1 quart skim milk', () => {
    const r = scaleQuark({ scaleBy: 'milk', value: 1 });
    expect(r.milkQt).toBe(1);
    expect(r.quarkOz).toBe(4);
    expect(r.vinegarCup).toBeCloseTo(1 / 3);
  });

  it('requires 2 quarts of milk for 8 oz of quark', () => {
    const r = scaleQuark({ scaleBy: 'quark', value: 8 });
    expect(r.quarkOz).toBe(8);
    expect(r.milkQt).toBe(2);
    expect(r.vinegarCup).toBeCloseTo(2 / 3);
  });

  it('scales vinegar at 1/3 cup per quart of milk', () => {
    const r = scaleQuark({ scaleBy: 'milk', value: 3 });
    expect(r.vinegarCup).toBeCloseTo(1);
  });

  it('throws on unknown scaleBy', () => {
    expect(() => scaleQuark({ scaleBy: 'vinegar', value: 1 })).toThrow();
  });
});

describe('PAINT_RECIPE constants', () => {
  it('matches Nick Kroll base recipe', () => {
    expect(PAINT_RECIPE.quarkOz).toBe(8);
    expect(PAINT_RECIPE.quarkG).toBe(250);
    expect(PAINT_RECIPE.waterOz).toBe(3);
    expect(PAINT_RECIPE.waterMl).toBe(90);
    expect(PAINT_RECIPE.limeOz).toBe(1);
    expect(PAINT_RECIPE.limeG).toBe(30);
    expect(PAINT_RECIPE.pigmentOz).toBe(1);
    expect(PAINT_RECIPE.pigmentG).toBe(30);
  });
});

describe('QUARK_YIELD constants', () => {
  it('yields 4 oz quark per quart of skim milk', () => {
    expect(QUARK_YIELD.ozQuarkPerQuartMilk).toBe(4);
  });

  it('uses 1/3 cup vinegar per quart of milk', () => {
    expect(QUARK_YIELD.cupsVinegarPerQuartMilk).toBeCloseTo(1 / 3);
  });
});

describe('formatNumber', () => {
  it('trims trailing zeros', () => {
    expect(formatNumber(1.5)).toBe('1.5');
    expect(formatNumber(2)).toBe('2');
    expect(formatNumber(2.0)).toBe('2');
  });

  it('rounds to two decimals by default', () => {
    expect(formatNumber(1.234)).toBe('1.23');
    expect(formatNumber(1.235)).toBe('1.24');
  });

  it('respects custom decimals', () => {
    expect(formatNumber(33.333, 0)).toBe('33');
    expect(formatNumber(0.6666, 1)).toBe('0.7');
  });

  it('preserves trailing zeros in the integer part', () => {
    expect(formatNumber(100, 0)).toBe('100');
    expect(formatNumber(100, 2)).toBe('100');
    expect(formatNumber(1000)).toBe('1000');
  });

  it('handles non-finite values', () => {
    expect(formatNumber(NaN)).toBe('—');
    expect(formatNumber(Infinity)).toBe('—');
  });
});
