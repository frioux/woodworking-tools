/**
 * Pure calculation functions for a dovetailed drawer.
 * All measurements in inches.
 *
 * Construction model:
 *   - Four walls: one front, one back, two sides.
 *   - Front and back run side-to-side (length = drawer width).
 *   - Sides run front-to-back (length = drawer depth).
 *   - Dovetailed at all four corners. The back is always joined to the
 *     sides with through dovetails. The front is through-dovetailed by
 *     default, or half-blind (half-lap) when `halfBlindFront` is set.
 *   - The bottom panel is captured in a groove plowed into all four walls.
 */

/**
 * Calculate all derived drawer dimensions from input parameters.
 *
 * @param {object} params
 * @param {number}  params.depth          - Outer depth, front to back
 * @param {number}  params.width          - Outer width, side to side
 * @param {number}  params.height         - Outer height, top to bottom
 * @param {number}  params.frontThickness - Drawer front stock thickness
 * @param {number}  params.sideThickness  - Secondary stock thickness (sides & back)
 * @param {boolean} [params.halfBlindFront=false] - Half-blind dovetails at the front
 * @param {number}  [params.bottomThickness=0.25]  - Bottom panel thickness
 * @param {number}  [params.grooveDepth=0.25]       - Groove depth into each wall
 * @param {number}  [params.grooveFromBottom=0.375] - Groove lower edge above the drawer bottom
 * @param {number}  [params.bottomGap=0.0625]       - Total fit clearance subtracted from the panel
 * @returns {object} All derived dimensions
 */
export function calculateDrawer(params) {
  const {
    depth, width, height,
    frontThickness, sideThickness,
    halfBlindFront = false,
    bottomThickness = 0.25,
    grooveDepth = 0.25,
    grooveFromBottom = 0.375,
    bottomGap = 1 / 16
  } = params;

  const backThickness = sideThickness;

  // Half-blind front: the side tails are housed in the front and stop short
  // of the front face, leaving a visible lap of solid front material. The
  // lap is conventionally about a quarter of the front thickness.
  const frontLap = halfBlindFront ? frontThickness / 4 : 0;
  const frontSocketDepth = frontThickness - frontLap; // how deep the tails enter the front

  // Piece lengths.
  // Front and back span the full outer width.
  const frontLength = width;
  const backLength = width;
  // Sides span the full depth, less the half-blind lap at the front (through
  // dovetails at the back reach the full back face).
  const sideLength = depth - frontLap;
  const pieceHeight = height;     // all walls are full height
  const backHeight = height;

  // Interior clear dimensions (inside faces of the walls).
  const innerWidth = width - 2 * sideThickness;
  const innerDepth = depth - frontThickness - backThickness;

  // Bottom panel — trapped in grooves on all four walls. It extends one
  // groove depth into each wall, less a small clearance for an easy fit.
  const bottomWidth = innerWidth + 2 * grooveDepth - bottomGap;
  const bottomDepth = innerDepth + 2 * grooveDepth - bottomGap;

  // Groove that holds the bottom (cut to the bottom-panel thickness).
  const grooveWidth = bottomThickness;

  // Suggested dovetail layout: evenly spaced tails with a half-pin at the top
  // and bottom of each joint. Roughly one tail per 1-3/4" of height.
  const tailCount = Math.max(2, Math.round(height / 1.75));

  return {
    // Input echo
    depth, width, height,
    frontThickness, sideThickness, backThickness,
    halfBlindFront,
    bottomThickness, grooveDepth, grooveFromBottom, grooveWidth,

    // Joinery
    frontLap,
    frontSocketDepth,
    tailCount,

    // Piece dimensions
    frontLength,
    backLength,
    sideLength,
    pieceHeight,
    backHeight,

    // Interior & bottom
    innerWidth,
    innerDepth,
    bottomWidth,
    bottomDepth
  };
}

/**
 * Format a decimal inch value as a fraction string for display.
 * Recognizes halves, quarters, eighths, sixteenths, and thirty-seconds.
 * @param {number} value
 * @returns {string}
 */
export function formatInches(value) {
  const whole = Math.floor(value);
  let frac = value - whole;

  // Round to nearest 1/32
  const thirtySeconds = Math.round(frac * 32);
  if (thirtySeconds === 0) return `${whole}"`;
  if (thirtySeconds === 32) return `${whole + 1}"`;

  frac = thirtySeconds;
  let denom = 32;

  // Simplify fraction
  while (frac % 2 === 0 && denom > 1) {
    frac /= 2;
    denom /= 2;
  }

  if (whole === 0) return `${frac}/${denom}"`;
  return `${whole}-${frac}/${denom}"`;
}
