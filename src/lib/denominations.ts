/**
 * The denomination ladder, for amounts that cross the pool's boundary in public.
 *
 * Ported from `cli/src/shielded/denominations.ts`, which stays the source of
 * record. Only the parts a request screen needs are here: the ladder itself and
 * the snap. Decomposition and the boundary-transaction cap belong to whatever
 * actually submits a shield, and copying them ahead of that would be inventing
 * a second opinion on a rule that must have exactly one.
 *
 * **Why a request cares at all.** A deposit's value is calldata. An unusual
 * figure makes a leaf distinctive even though its owner is unknown, and
 * subset-sum over public amounts is a proven deanonymization: ask for 137,428
 * and the payment that lands is the only one of its size on the whole tape.
 * Every 100,000 looks like every other 100,000, and each tier is an anonymity
 * set that grows as it gets used.
 *
 * **This is the one place the client overrules the person using it.** Elsewhere
 * the product warns and continues. A requested amount is different because the
 * cost is not paid by the person choosing it: the recipient types the number and
 * the *payer* writes it onto the chain, where it stays. Rounding a request costs
 * a few percent of one payment. Not rounding it costs the recipient the property
 * they came here for, permanently, and they would never see it happen.
 */

/**
 * Tier exponents relative to one whole token. Powers of ten around 1.0, six
 * orders above and three below.
 *
 * The reach upward is not decoration. "One whole token" means single digits of
 * ETH and millions of a million-supply token, and a ladder stopping at ten left
 * 3,100,000 COWL unable to cross in shared denominations at all. A thin
 * anonymity set is bad; no anonymity set is worse.
 */
const TIER_STEPS = [6, 5, 4, 3, 2, 1, 0, -1, -2, -3] as const;

/** The ladder for a token, largest first, in base units. */
export function tiersFor(decimals: number): bigint[] {
  return TIER_STEPS.map((step) => decimals + step)
    .filter((exp) => exp >= 0)
    .map((exp) => 10n ** BigInt(exp));
}

/** The smallest tier a token has. Anything under this is dust. */
export function dustFloor(decimals: number): bigint {
  const tiers = tiersFor(decimals);
  return tiers[tiers.length - 1] ?? 1n;
}

/**
 * The nearest amount on the ladder: a whole multiple of the largest tier that
 * fits inside the value.
 *
 * Multiples rather than tiers alone, because a ladder of bare powers of ten
 * cannot express 300,000 and a person asking for three hundred thousand is not
 * going to accept one hundred. The multiple keeps the figure round, which is the
 * property that matters, while leaving the ask recognisably theirs.
 *
 * **Ties round up.** A request is a number someone else has to pay, and rounding
 * an invoice down to the house's benefit is a decision nobody asked this screen
 * to make.
 */
export function snapToLadder(value: bigint, decimals: number): bigint {
  const floor = dustFloor(decimals);
  if (value <= floor) return floor;

  const tier = tiersFor(decimals).find((t) => t <= value) ?? floor;
  const below = (value / tier) * tier;
  const above = below + tier;

  // Exactly on a multiple already: leave it alone rather than walking it up.
  if (below === value) return value;
  return value - below < above - value ? below : above;
}

/** Whether an amount is already something the ladder can express. */
export function isOnLadder(value: bigint, decimals: number): boolean {
  return value > 0n && snapToLadder(value, decimals) === value;
}
