/**
 * Pure calculation functions for picture frame dimensions.
 * All measurements in inches.
 */

/**
 * Calculate all derived frame dimensions from input parameters.
 * @param {object} params
 * @param {number} params.canvasWidth  - Full outer width of artwork/canvas
 * @param {number} params.canvasHeight - Full outer height of artwork/canvas
 * @param {number} params.frameWidth   - Frame molding profile width
 * @param {number} params.frameDepth   - Frame molding thickness
 * @param {number} params.glassDepth   - Glass/acrylic pane thickness
 * @param {number} params.backerDepth  - Backer board thickness
 * @returns {object} All derived dimensions
 */
export function calculateFrame(params) {
  const {
    canvasWidth, canvasHeight,
    frameWidth, frameDepth,
    glassDepth, backerDepth
  } = params;

  // Rabbet depth = glass + backer + 1/16" clearance
  const rabbetDepth = glassDepth + backerDepth + 1 / 16;

  // Outer frame dimensions based on canvas + frame molding
  const outerWidth = canvasWidth + 2 * frameWidth;
  const outerHeight = canvasHeight + 2 * frameWidth;

  // Miter-cut lengths measured at the long point
  const miterLengthHorizontal = outerWidth;
  const miterLengthVertical = outerHeight;

  // Short-point miter lengths
  const miterShortHorizontal = outerWidth - 2 * frameWidth;
  const miterShortVertical = outerHeight - 2 * frameWidth;

  return {
    // Input echo
    canvasWidth, canvasHeight,
    frameWidth, frameDepth,
    glassDepth, backerDepth,

    // Derived
    rabbetDepth,
    outerWidth,
    outerHeight,
    miterLengthHorizontal,
    miterLengthVertical,
    miterShortHorizontal,
    miterShortVertical
  };
}

/**
 * Format a decimal inch value as a fraction string for display.
 * Recognizes halves, quarters, eighths, and sixteenths.
 * @param {number} value
 * @returns {string}
 */
export function formatInches(value) {
  const whole = Math.floor(value);
  let frac = value - whole;

  // Round to nearest 1/16
  const sixteenths = Math.round(frac * 16);
  if (sixteenths === 0) return `${whole}"`;
  if (sixteenths === 16) return `${whole + 1}"`;

  frac = sixteenths;
  let denom = 16;

  // Simplify fraction
  while (frac % 2 === 0 && denom > 1) {
    frac /= 2;
    denom /= 2;
  }

  if (whole === 0) return `${frac}/${denom}"`;
  return `${whole}-${frac}/${denom}"`;
}
