/**
 * Public surface of the keys feature.
 *
 * Reachable only from `auth` and `shielded`, enforced in eslint.config.mjs. If
 * something else needs to read or write a payment address, it wants
 * `@/lib/payment-address`, which holds no secret and is open to everyone.
 */
export {
  deriveFromSignature,
  SHIELDED_SIGN_MESSAGE,
  type ShieldedKeys,
} from "./lib/derive";
