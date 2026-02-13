import { describe, it, expect } from 'vitest';
import { calculateFrame, formatInches } from '../frame-designer/frame-math.js';

const defaults = {
  canvasWidth: 16,
  canvasHeight: 20,
  imageWidth: 10,
  topMargin: 3,
  bottomMargin: 4,
  frameWidth: 1.5,
  frameDepth: 0.75,
  glassDepth: 0.125,
  backerDepth: 0.125
};

describe('calculateFrame', () => {
  it('calculates left/right margins from canvas and image width', () => {
    const result = calculateFrame(defaults);
    expect(result.leftMargin).toBe(3);
    expect(result.rightMargin).toBe(3);
  });

  it('calculates image height from canvas height minus margins', () => {
    const result = calculateFrame(defaults);
    expect(result.imageHeight).toBe(13); // 20 - 3 - 4
  });

  it('calculates rabbet depth = glass + backer + 1/16"', () => {
    const result = calculateFrame(defaults);
    expect(result.rabbetDepth).toBeCloseTo(0.3125); // 0.125 + 0.125 + 0.0625
  });

  it('calculates outer dimensions = image dims + 2 * frame width', () => {
    const result = calculateFrame(defaults);
    expect(result.outerWidth).toBe(13);  // 10 + 2*1.5
    expect(result.outerHeight).toBe(16); // 13 + 2*1.5
  });

  it('calculates miter-cut long point lengths', () => {
    const result = calculateFrame(defaults);
    expect(result.miterLengthHorizontal).toBe(13); // same as outer width
    expect(result.miterLengthVertical).toBe(16);   // same as outer height
  });

  it('calculates miter-cut short point lengths', () => {
    const result = calculateFrame(defaults);
    expect(result.miterShortHorizontal).toBe(10); // outer - 2*frame = image width
    expect(result.miterShortVertical).toBe(13);   // outer - 2*frame = image height
  });

  it('handles zero margins', () => {
    const result = calculateFrame({
      ...defaults,
      topMargin: 0,
      bottomMargin: 0,
      imageWidth: 16 // full canvas width
    });
    expect(result.leftMargin).toBe(0);
    expect(result.rightMargin).toBe(0);
    expect(result.imageHeight).toBe(20);
  });

  it('handles very small dimensions', () => {
    const result = calculateFrame({
      canvasWidth: 2,
      canvasHeight: 2,
      imageWidth: 1,
      topMargin: 0.25,
      bottomMargin: 0.25,
      frameWidth: 0.5,
      frameDepth: 0.25,
      glassDepth: 0.0625,
      backerDepth: 0.0625
    });
    expect(result.leftMargin).toBe(0.5);
    expect(result.imageHeight).toBe(1.5);
    expect(result.outerWidth).toBe(2);    // 1 + 2*0.5
    expect(result.outerHeight).toBe(2.5); // 1.5 + 2*0.5
  });

  it('handles asymmetric margins', () => {
    const result = calculateFrame({
      ...defaults,
      topMargin: 2,
      bottomMargin: 5
    });
    expect(result.imageHeight).toBe(13); // 20 - 2 - 5
    expect(result.topMargin).toBe(2);
    expect(result.bottomMargin).toBe(5);
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
