/**
 * Shielded key derivation. The only file in the app allowed to hold a secret.
 *
 * Two things make this folder special, and both are enforced in eslint.config.mjs
 * rather than left to memory:
 *
 *   1. Only `features/auth` and `features/shielded` may import from here. Auth
 *      derives once a signature comes back; shielded needs the secret in-process
 *      because a ZK proof cannot be built without it. No embedded wallet, Turnkey
 *      included, can protect this key: proving happens in the browser, so the
 *      secret is in the browser. The enclave protects the EOA key, not this one.
 *
 *   2. Nothing here is ever persisted. No localStorage, no sessionStorage, no
 *      IndexedDB, no cookie. Derive on demand, hold in memory, let it die with
 *      the tab. A stolen device with no live session then yields nothing, and a
 *      leaked view key cannot be rotated because it reads history backwards.
 *
 * The seed is a deterministic ECDSA signature. RFC 6979 means signing the same
 * message with the same key always returns the same bytes, so the same wallet
 * reproduces the same shielded account every session without the private key
 * ever leaving the wallet. Here that wallet is provisioned by Turnkey and the
 * signing happens inside an enclave, which changes who holds the EOA key and
 * changes nothing at all about the derivation below.
 *
 *   sk   spending key, a secret field element that authorizes spends
 *   nk   nullifying key, Poseidon2(sk), seeds unlinkable nullifiers
 *   mpk  master public key, Poseidon2(DOMAIN_MPK, sk, nk), the note owner id
 */
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, concatBytes, hexToBytes } from "@noble/hashes/utils";
import { DOMAIN_MPK, hashToField, poseidon } from "@/lib/field";
import { encodePaymentAddress } from "@/lib/payment-address";

const Point = secp256k1.ProjectivePoint;
const CURVE_N = secp256k1.CURVE.n;

const utf8 = (s: string) => new TextEncoder().encode(s);

/**
 * The message the wallet signs to unlock the shielded account.
 *
 * **Fixed forever. Changing one byte changes every derived key and strands every
 * note behind the old ones**, for everybody, with no recovery: a note belongs to
 * whoever holds the `sk` behind its `mpk`, and nothing on chain records who that
 * was or that it changed.
 *
 * It is byte-identical to `SHIELDED_SIGN_MESSAGE` in `app/lib/shielded/keys.ts`
 * and that is deliberate. It puts this app and the self custody dapp in **one
 * shielded account space**. Turnkey can export the EOA key, and an export that
 * hands someone a key whose shielded balance then does not appear in the dapp is
 * an export in name only. Same wallet, same signature, same notes, whichever
 * client is holding it.
 *
 * The cost is the last line and it is real: that line is an anti-phishing
 * control, and it names a domain this app is not served from. It cannot be
 * updated without splitting the account space in two. Recorded as an open
 * decision in README.md rather than quietly resolved here.
 */
export const SHIELDED_SIGN_MESSAGE =
  "Cowl Protocol shielded account v1\n\n" +
  "This signature derives the keys to your shielded balance. " +
  "Only sign it on app.cowlprotocol.com.";

/**
 * Reduce bytes into a secp256k1 scalar.
 *
 * Note this is the curve order, not Fr. The view key is an ECDH key on
 * secp256k1 rather than a field element, so reducing it mod Fr would put it
 * outside the scalar range the curve is defined over.
 */
function toCurveScalar(bytes: Uint8Array): bigint {
  const s = BigInt("0x" + bytesToHex(bytes)) % CURVE_N;
  return s === 0n ? 1n : s;
}

export type ShieldedKeys = {
  /** Spending key. Never leaves this module's callers. */
  sk: bigint;
  /** Nullifier key, Poseidon2(sk). */
  nk: bigint;
  /** Public owner identifier that goes into a note commitment. */
  mpk: bigint;
  /** Viewing key. Reads the whole history, which is why it is never stored. */
  viewPriv: bigint;
  viewPubHex: string;
  /** bech32m zcowl1… over <mpk:32B><viewPub:33B>. Safe to publish. */
  paymentAddress: string;
};

/**
 * Derive the shielded account from the unlock signature, 65 bytes as 0x-hex.
 *
 * The two derivation labels carry a `sig-v1` suffix, which marks this as its own
 * account space, distinct from the CLI's derivation straight from a raw private
 * key. The formulas are the same either way, so the circuits and the pool treat
 * the two spaces identically and neither can tell them apart.
 */
export function deriveFromSignature(signatureHex: string): ShieldedKeys {
  const sig = hexToBytes(signatureHex.replace(/^0x/, ""));
  if (sig.length < 64) {
    throw new Error("Unlock signature is too short to derive keys from.");
  }

  const sk = hashToField(sig, utf8("cowl:shielded:spend:sig-v1"));
  const nk = poseidon([sk]);
  const mpk = poseidon([DOMAIN_MPK, sk, nk]);

  const viewPriv = toCurveScalar(
    keccak_256(concatBytes(sig, utf8("cowl:shielded:view:sig-v1"))),
  );
  const viewPubHex = bytesToHex(Point.BASE.multiply(viewPriv).toRawBytes(true));

  return {
    sk,
    nk,
    mpk,
    viewPriv,
    viewPubHex,
    paymentAddress: encodePaymentAddress(mpk, viewPubHex),
  };
}
