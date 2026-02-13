import { describe, it, expect } from 'vitest';
import { calculateFrame, formatInches } from '../frame-designer/frame-math.js';

const defaults = {
  canvasWidth: 16,
  canvasHeight: 20,
  frameWidth: 1.5,
  frameDepth: 0.75,
  glassDepth: 0.125,
  backerDepth: 0.125
};

describe('calculateFrame', () => {
  it('calculates rabbet depth = glass + backer + 1/16"', () => {
    const result = calculateFrame(defaults);
    expect(result.rabbetDepth).toBeCloseTo(0.3125); // 0.125 + 0.125 + 0.0625
  });

  it('calculates outer dimensions = canvas dims + 2 * frame width', () => {
    const result = calculateFrame(defaults);
    expect(result.outerWidth).toBe(19);  // 16 + 2*1.5
    expect(result.outerHeight).toBe(23); // 20 + 2*1.5
  });

  it('calculates miter-cut long point lengths', () => {
    const result = calculateFrame(defaults);
    expect(result.miterLengthHorizontal).toBe(19); // same as outer width
    expect(result.miterLengthVertical).toBe(23);   // same as outer height
  });

  it('calculates miter-cut short point lengths', () => {
    const result = calculateFrame(defaults);
    expect(result.miterShortHorizontal).toBe(16); // outer - 2*frame = canvas width
    expect(result.miterShortVertical).toBe(20);   // outer - 2*frame = canvas height
  });

  it('handles very small dimensions', () => {
    const result = calculateFrame({
      canvasWidth: 2,
      canvasHeight: 2,
      frameWidth: 0.5,
      frameDepth: 0.25,
      glassDepth: 0.0625,
      backerDepth: 0.0625
    });
    expect(result.outerWidth).toBe(3);   // 2 + 2*0.5
    expect(result.outerHeight).toBe(3);  // 2 + 2*0.5
  });
});

describe('formatInches', () => {
  it('formats whole numbers', () => {
    expect(formatInches(3)).toBe('3"');
    expect(formatInches(16)).toBe('16"');
  });

  it('formats halves', () => {
    expect(formatInches(1.5)).toBe('1-1/2"');
  });

  it('formats quarters', () => {
    expect(formatInches(2.25)).toBe('2-1/4"');
    expect(formatInches(0.75)).toBe('3/4"');
  });

  it('formats eighths', () => {
    expect(formatInches(3.125)).toBe('3-1/8"');
    expect(formatInches(0.125)).toBe('1/8"');
  });

  it('formats sixteenths', () => {
    expect(formatInches(1.0625)).toBe('1-1/16"');
  });

  it('formats zero', () => {
    expect(formatInches(0)).toBe('0"');
  });
});
