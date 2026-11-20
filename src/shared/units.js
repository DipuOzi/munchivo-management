/**
 * Shared unit + money helpers — used by both the API and the frontend.
 *
 * QUANTITIES are always stored/transferred in BASE units as integers:
 *   mass -> grams (kg x 1000), volume -> millilitres (L x 1000),
 *   count/other -> whole units.
 * MONEY is always stored/transferred in poisha (1 BDT = 100 poisha).
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
  L: 'volume',
  ml: 'volume',
  pcs: 'count',
  Packet: 'count',
  Bottle: 'count',
  Box: 'count',
}

export function unitTypeFor(displayUnit) {
  return UNIT_TYPE_MAP[displayUnit] || 'other'
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

/**
 * Convert a quantity in the display unit to base units (integer).
 * Throws when the unit is unknown.
 */
export function toBase(quantity, displayUnit) {
  const q = Number(quantity)
  if (!Number.isFinite(q)) return 0
  let value
  switch (displayUnit) {
    case 'kg':
      value = q * 1000
      break
    case 'g':
      value = q
      break
    case 'L':
      value = q * 1000
      break
    case 'ml':
      value = q
      break
    case 'pcs':
    case 'Packet':
    case 'Bottle':
    case 'Box':
      value = q
      break
    default:
      value = q
  }
  return Math.round(value)
}

/** Convert base units back to the display unit (decimal). */
export function fromBase(baseQuantity, displayUnit) {
  const q = Number(baseQuantity) || 0
  switch (displayUnit) {
    case 'kg':
      return q / 1000
    case 'g':
      return q
    case 'L':
      return q / 1000
    case 'ml':
      return q
    default:
      return q
  }
}

/** Human quantity, e.g. 19700 g in kg display -> "19.7 kg" */
export function formatQty(baseQuantity, displayUnit) {
  const value = fromBase(baseQuantity, displayUnit)
  const decimals = displayUnit === 'kg' || displayUnit === 'L' ? 3 : 0
  const trimmed = Number(value.toFixed(decimals))
  const unit = UNIT_TYPE_MAP[displayUnit] ? displayUnit : displayUnit || 'unit'
  return `${trimmed.toLocaleString('en-US', { maximumFractionDigits: 3 })} ${unit}`
}

/** Convert taka (decimal) to poisha (integer). */
export function takaToPoisha(taka) {
  return Math.round(Number(taka || 0) * 100)
}

/** Convert poisha (integer) to taka (decimal). */
export function poishaToTaka(poisha) {
  return (Number(poisha) || 0) / 100
}

/** Format poisha as BDT, e.g. 105050 -> "৳1,050.50" */
export function formatMoney(poisha) {
  const taka = poishaToTaka(poisha)
  const hasPoisha = Math.round(taka * 100) % 100 !== 0
  return `৳${taka.toLocaleString('en-US', {
    minimumFractionDigits: hasPoisha ? 2 : 0,
    maximumFractionDigits: 2,
  })}`
}
