/** MUNCHIVO — shared unit & money helpers (used by both API handlers and the
 * frontend). All money is in poisha (1 BDT = 100 poisha); all quantities are
 * in the ingredient's base unit (grams for mass, millilitres for volume,
 * whole units for count/other).
 */

const UNIT_TO_BASE = new Map([
  /** mass */
  ['g', 1],
  ['gram', 1],
  ['grams', 1],
  ['kg', 1000],
  ['kilogram', 1000],
  ['kilograms', 1000],
  ['lb', 453.592],
  ['lbs', 453.592],
  ['ounce', 28.3495],
  ['ounces', 28.3495],
  /** volume */
  ['ml', 1],
  ['millilitre', 1],
  ['millilitres', 1],
  ['milliliter', 1],
  ['milliliters', 1],
  ['l', 1000],
  ['L', 1000],
  ['litre', 1000],
  ['litres', 1000],
  ['liter', 1000],
  ['liters', 1000],
  ['cup', 250],
  ['cups', 250],
  ['tbsp', 15],
  ['tsp', 5],
  ['gal', 3785.41],
  ['galon', 3785.41],
  ['galons', 3785.41],
  /** count / pieces */
  ['pcs', 1],
  ['piece', 1],
  ['pieces', 1],
  ['unit', 1],
  ['units', 1],
  ['each', 1],
  ['box', 1],
  ['boxes', 1],
  ['packet', 1],
  ['packets', 1],
  ['bottle', 1],
  ['bottles', 1],
])

/**
 * Convert a display-unit quantity to the ingredient's base unit (grams/ml/units).
 * Round to whole base units (no float arithmetic anywhere in the system).
 */
export function toBase(quantity, displayUnit) {
  const qty = Number(quantity)
  if (!displayUnit || qty <= 0 || !isFinite(qty)) return 0
  const factor = UNIT_TO_BASE.get(displayUnit.toLowerCase().trim()) ?? 1
  return Math.round(qty * factor)
}

/**
 * Convert a base-unit quantity back to a display unit string suitable for
 * user-facing labels (e.g. "10 kg", "2 L").
 */
export function fromBase(value, displayUnit) {
  const v = Number(value)
  if (!displayUnit || v <= 0 || !isFinite(v)) return 0
  const factor = UNIT_TO_BASE.get(displayUnit.toLowerCase().trim()) ?? 1
  const shown = Math.round(v / factor)
  return shown
}

/**
 * Human-readable quantity label: "10 kg" or "5 pcs".
 */
export function formatQty(quantityBase, displayUnit) {
  const q = fromBase(quantityBase, displayUnit)
  if (displayUnit) return `${q} ${displayUnit}`
  return `${quantityBase} base`
}

/**
 * Money formatting: poisha → BDT string with group separators.
 */
export function formatMoney(poisha) {
  if (!Number.isFinite(poisha)) return '৳0'
  const taka = Math.round(poisha / 100)
  const formatted = taka.toLocaleString('en-BD')
  return `৳${formatted}`
}

/** BDT (taka) string → poisha integer. */
export function takaToPoisha(taka) {
  if (!Number.isFinite(taka)) return 0
  const p = Math.round(taka * 100)
  return p
}

export { UNIT_TO_BASE }

/** poisha → taka string (2 decimals, e.g. "৳45.00") */
export function poishaToTaka(poisha) {
  const v = Number(poisha)
  if (!isFinite(v)) return '0.00'
  const taka = v / 100
  return taka.toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
