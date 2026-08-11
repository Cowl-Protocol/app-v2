/**
 * The second entry point of the auth feature, and the only way key material
 * leaves it.
 *
 * **Reachable only from `features/shielded`.** Not by convention: the
 * cross-feature zone in eslint.config.mjs blocks every import of a file inside
 * another feature except its `index.ts`, so this path is refused everywhere
 * until a feature is added to that zone's `except` list. `shielded` is there
 * because a ZK proof cannot be built without the spending key in process.
 * Nothing else is, and a reason that turns up later is a design conversation
 * rather than one more name on a list.
 *
 * Why a second file rather than one export from `index.ts`: the zones restrict
 * paths, and `index.ts` is open to every feature by design. A single public
 * surface carrying the view key would have made README rule 6 false while
 * reading as though it held, which is the failure mode that rule exists to
 * prevent. Splitting the surface puts the decision somewhere a linter can see.
 *
 * `npm run test:boundary` asserts both directions, so an allow that breaks fails
 * as loudly as a block that stops working.
 */
export { useShieldedKeys } from "./lib/account-context";
