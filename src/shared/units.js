/** MUNCHIVO — shared unit & money helpers (used by both API handlers and the
 * frontend). All money is in poisha (1 BDT = 100 poisha); all quantities are
 * in the ingredient's base unit (grams for mass, millilitres for volume,
 * whole units for count/other).
 */

export const DISPLAY_UNITS = [
  'kg',
  'g',
  'L',
  'ml',
  'pcs',
  'Packet',
  'Bottle',
  'Box',
]

const UNIT_TYPE_MAP = {
  kg: 'mass',
  g: 'mass',
  gram: 'mass',
  grams: 'mass',
  kilogram: 'mass',
  kilograms: 'mass',
  lb: 'mass',
  lbs: 'mass',
  ounce: 'mass',
  ounces: 'mass',
  l: 'volume',
  L: 'volume',
  ml: 'volume',
  millilitre: 'volume',
  millilitres: 'volume',
  milliliter: 'volume',
  milliliters: 'volume',
  litre: 'volume',
  litres: 'volume',
  liter: 'volume',
  liters: 'volume',
  cup: 'volume',
  cups: 'volume',
  tbsp: 'volume',
  tsp: 'volume',
  gal: 'volume',
  galon: 'volume',
  galons: 'volume',
  pcs: 'count',
  piece: 'count',
  pieces: 'count',
  slice: 'count',
  slices: 'count',
  unit: 'count',
  units: 'count',
  each: 'count',
  box: 'count',
  boxes: 'count',
  packet: 'count',
  packets: 'count',
  bottle: 'count',
  bottles: 'count',
}

export function unitTypeFor(displayUnit) {
  if (!displayUnit) return 'other'
  return UNIT_TYPE_MAP[displayUnit] || UNIT_TYPE_MAP[displayUnit.toLowerCase().trim()] || 'other'
}

export function baseUnitFor(unitType) {
  switch (unitType) {
    case 'mass':
      return 'g'
    case 'volume':
      return 'ml'
    case 'count':
      return 'pcs'
    default:
      return 'unit'
  }
}

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
  ['slice', 1],
  ['slices', 1],
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
  if (!displayUnit || qty === 0 || !isFinite(qty)) return 0
  const factor = UNIT_TO_BASE.get(displayUnit.toLowerCase().trim()) ?? 1
  return Math.round(qty * factor)
}

/**
 * Convert a base-unit quantity back to a display unit number (e.g. 1500 g -> 1.5 kg).
 */
export function fromBase(value, displayUnit) {
  const v = Number(value)
  if (!displayUnit || v <= 0 || !isFinite(v)) return 0
  const factor = UNIT_TO_BASE.get(displayUnit.toLowerCase().trim()) ?? 1
  return v / factor
}

/**
 * Human-readable quantity label: "10 kg", "1.5 kg", or "5 pcs".
 */
export function formatQty(quantityBase, displayUnit) {
  const value = fromBase(quantityBase, displayUnit)
  const isDecimalUnit = ['kg', 'l', 'litre', 'litres', 'liter', 'liters'].includes(
    displayUnit?.toLowerCase().trim(),
  )
  const decimals = isDecimalUnit ? 3 : 2
  const trimmed = Number(value.toFixed(decimals))
  if (displayUnit) return `${trimmed.toLocaleString('en-US', { maximumFractionDigits: 3 })} ${displayUnit}`
  return `${quantityBase} base`
}

/**
 * Money formatting: poisha → BDT string with group separators, e.g. "৳1,050.50" or "৳1,050".
 */
export function formatMoney(poisha) {
  if (!Number.isFinite(poisha)) return '৳0'
  const taka = poisha / 100
  const hasPoisha = Math.round(taka * 100) % 100 !== 0
  return `৳${taka.toLocaleString('en-US', {
    minimumFractionDigits: hasPoisha ? 2 : 0,
    maximumFractionDigits: 2,
  })}`
}

/** BDT (taka) number/string → poisha integer. */
export function takaToPoisha(taka) {
  return Math.round(Number(taka || 0) * 100)
}

export { UNIT_TO_BASE }

/** poisha integer → taka decimal number. */
export function poishaToTaka(poisha) {
  return (Number(poisha) || 0) / 100
}

