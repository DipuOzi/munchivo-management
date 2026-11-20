/**
 * Recipe costing rules (documented per spec §23):
 *
 * - Ingredient cost    = Σ (item quantity in base units × ingredient's
 *                        weighted-average cost per base unit)
 * - Batch total cost   = ingredient cost + packaging cost + other direct costs
 * - Cost per base unit = batch total cost ÷ base yield (poisha per g/ml/pc)
 * - Cost per serving   = cost per base unit × serving size
 * - Gross profit       = selling price − total product cost
 * - Gross margin       = gross profit ÷ selling price
 *
 * Costs are snapshots: completed sales must store the cost at the time
 * of sale (implemented with the sales module in Phase 5).
 */
import { poishaToTaka } from './units.js'

export function recipeCosting(recipe, items) {
  const ingredientCostPoisha = items.reduce(
    (sum, item) => sum + item.quantityBase * (item.ingredient?.avgCostPoisha || 0),
    0,
  )
  const totalPoisha =
    ingredientCostPoisha + (recipe.packagingCostPoisha || 0) + (recipe.otherDirectCostPoisha || 0)
  const costPerBasePoisha =
    recipe.baseYieldBase > 0 ? Math.round(totalPoisha / recipe.baseYieldBase) : 0

  return {
    ingredientCostPoisha,
    totalPoisha,
    costPerBasePoisha,
    ingredientCostTaka: poishaToTaka(ingredientCostPoisha),
    totalTaka: poishaToTaka(totalPoisha),
  }
}

export function productCosting(product, recipe, items) {
  if (!recipe || !items) return null
  const costing = recipeCosting(recipe, items)
  const servingBase =
    product.servingSizeBase && product.servingSizeBase > 0
      ? product.servingSizeBase
      : recipe.baseYieldBase
  const ingredientCostPerServing = Math.round(costing.costPerBasePoisha * servingBase)
  const totalCostPerServing = ingredientCostPerServing + (product.packagingCostPoisha || 0)
  const grossProfitPoisha = product.sellingPricePoisha - totalCostPerServing
  const marginPct =
    product.sellingPricePoisha > 0
      ? (grossProfitPoisha / product.sellingPricePoisha) * 100
      : 0

  return {
    ...costing,
    servingBase,
    ingredientCostPerServing,
    totalCostPerServing,
    grossProfitPoisha,
    marginPct: Math.round(marginPct * 10) / 10,
  }
}
