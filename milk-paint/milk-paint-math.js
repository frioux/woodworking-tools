/**
 * Pure calculation functions for fresh milk paint and quark recipes.
 *
 * Base recipe (Nick Kroll, via Christopher Schwarz):
 *   8 oz (250 g) fat-free quark
 *   3 fl oz (90 ml) tap water — recipe gives 6 tbsp; 1 fl oz = 2 tbsp
 *   1 oz (30 g) hydrated lime
 *   1 oz (30 g) artist pigment
 *
 * Quark yield assumption: 1 quart skim milk produces 4 oz quark.
 * Vinegar: 1/3 cup per quart of skim milk.
 */

export const PAINT_RECIPE = {
  quarkOz: 8,
  quarkG: 250,
  waterOz: 3,
  waterMl: 90,
  limeOz: 1,
  limeG: 30,
  pigmentOz: 1,
  pigmentG: 30
};

export const QUARK_YIELD = {
  ozQuarkPerQuartMilk: 4,
  cupsVinegarPerQuartMilk: 1 / 3
};

/**
 * Scale the paint recipe by either quark amount or pigment amount.
 * @param {object} params
 * @param {'quark'|'pigment'} params.scaleBy
 * @param {number} params.value - Amount in ounces of the scaling ingredient
 * @returns {object} Scaled ingredient quantities and the scaling factor
 */
export function scalePaint({ scaleBy, value }) {
  let factor;
  if (scaleBy === 'quark') {
    factor = value / PAINT_RECIPE.quarkOz;
  } else if (scaleBy === 'pigment') {
    factor = value / PAINT_RECIPE.pigmentOz;
  } else {
    throw new Error(`Unknown scaleBy: ${scaleBy}`);
  }

  return {
    factor,
    quarkOz: PAINT_RECIPE.quarkOz * factor,
    quarkG: PAINT_RECIPE.quarkG * factor,
    waterOz: PAINT_RECIPE.waterOz * factor,
    waterMl: PAINT_RECIPE.waterMl * factor,
    limeOz: PAINT_RECIPE.limeOz * factor,
    limeG: PAINT_RECIPE.limeG * factor,
    pigmentOz: PAINT_RECIPE.pigmentOz * factor,
    pigmentG: PAINT_RECIPE.pigmentG * factor
  };
}

/**
 * Scale the quark recipe by either target quark output or input milk amount.
 * @param {object} params
 * @param {'quark'|'milk'} params.scaleBy
 * @param {number} params.value - Ounces of quark (if scaleBy='quark') or quarts of milk (if scaleBy='milk')
 * @returns {{quarkOz: number, milkQt: number, vinegarCup: number}}
 */
export function scaleQuark({ scaleBy, value }) {
  let quarkOz, milkQt;
  if (scaleBy === 'quark') {
    quarkOz = value;
    milkQt = quarkOz / QUARK_YIELD.ozQuarkPerQuartMilk;
  } else if (scaleBy === 'milk') {
    milkQt = value;
    quarkOz = milkQt * QUARK_YIELD.ozQuarkPerQuartMilk;
  } else {
    throw new Error(`Unknown scaleBy: ${scaleBy}`);
  }
  const vinegarCup = milkQt * QUARK_YIELD.cupsVinegarPerQuartMilk;
  return { quarkOz, milkQt, vinegarCup };
}

/**
 * Format a number with up to two decimals, trimming trailing zeros.
 * @param {number} value
 * @param {number} [decimals=2]
 * @returns {string}
 */
export function formatNumber(value, decimals = 2) {
  if (!isFinite(value)) return '—';
  const rounded = Math.round(value * 10 ** decimals) / 10 ** decimals;
  const str = rounded.toFixed(decimals);
  // Trim trailing zeros only in the fractional part (e.g. 1.50 -> "1.5", 100 stays "100")
  return str.includes('.') ? str.replace(/\.?0+$/, '') : str;
}

/**
 * Format a measurement with both customary and metric units.
 * @param {number} customary
 * @param {string} customaryUnit
 * @param {number} metric
 * @param {string} metricUnit
 * @returns {string}
 */
export function formatBoth(customary, customaryUnit, metric, metricUnit) {
  return `${formatNumber(customary)} ${customaryUnit} (${formatNumber(metric)} ${metricUnit})`;
}
