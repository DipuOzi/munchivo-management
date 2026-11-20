/**
 * THE ONLY VERCEL FUNCTION
 *
 * Every /api request is rewritten here (see vercel.json) and dispatched
 * by api/_lib/router.js to the matching handler in api/_handlers/. Keeping a
 * single function keeps the deployment inside Vercel's Hobby limit of 12
 * functions per deployment while preserving the original route shapes.
 */
import { dispatch } from './_lib/router.js'

export default async function handler(req, res) {
  await dispatch(req, res)
}
