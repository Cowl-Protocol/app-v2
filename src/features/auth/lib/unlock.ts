/**
 * Turning a Turnkey wallet into a shielded account.
 *
 * This is the one place in app-v2 where a third party's signature becomes a
 * secret this product cannot replace. It deserves the length.
 *
 * The shielded account is derived from the bytes of an ordinary Ethereum
 * `personal_sign` over a fixed message. Deterministic ECDSA means the same
 * wallet reproduces the same account every session with nothing written down.
 * The dapp already works this way with an injected wallet; the only thing that
 * changes here is who holds the signing key, which is now an enclave rather than
 * an extension.
 *
 * **Three assumptions come with that, and all three are checked below rather
 * than trusted.** Each one fails silently if it is wrong, each one strands money
 * in a way that looks exactly like theft, and none of them is something this
 * codebase controls.
 *
 *   1. **The signature is the same every time.** If Turnkey ever signed with a
 *      random nonce, every session would derive a different shielded account.
 *      The user's balance would read zero and their notes would sit in the pool
 *      addressed to keys nothing will derive again.
 *
 *   2. **It is the account we think it is.** A wrong recovery byte, a mangled
 *      field, or a signature from the wrong account on the keyring all produce a
 *      well formed 65 bytes that derive a perfectly valid, perfectly empty
 *      shielded account.
 *
 *   3. **`s` is on the low half of the curve.** Both halves are valid ECDSA and
 *      both recover the same address, so nothing above catches this. It matters
 *      because injected wallets always produce the low form: if Turnkey did not,
 *      then exporting this wallet into one of them would open a *different*
 *      shielded account, and the promise that these are one account space would
 *      be quietly false.
 *
 * The checks cost one extra call to Turnkey and a few milliseconds of curve
 * arithmetic, once per session. What they buy is that every one of those
 * failures stops at a sign in that refuses, instead of arriving as a balance of
 * zero that nobody can explain.
 */
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, concatBytes, hexToBytes } from "@noble/hashes/utils";
import { deriveFromSignature, SHIELDED_SIGN_MESSAGE, type ShieldedKeys } from "@/features/keys";
import { UnlockError } from "./errors";
import { signRawPayload, type Session } from "./turnkey";

/**
 * Derive the shielded account for the wallet account at `signWith`.
 *
 * The keys come back to the caller and are not held here. Nothing in this
 * module keeps a reference after it returns.
 */
export async function unlockShieldedAccount(params: {
  session: Session;
  signWith: string;
}): Promise<ShieldedKeys> {
  const message = eip191(SHIELDED_SIGN_MESSAGE);
  const payloadHex = "0x" + bytesToHex(message);

  // Signed twice, deliberately. See assumption 1 above. The second call is the
  // only evidence available that the first one is reproducible, because this app
  // stores nothing from one session to compare against.
  const first = await signRawPayload({ ...params, payloadHex });
  const second = await signRawPayload({ ...params, payloadHex });

  const a = assemble(first);
  const b = assemble(second);
  if (a !== b) {
    throw new UnlockError(
      "Your wallet returned a different signature for the same message, so your " +
        "balance cannot be opened safely. Nothing was changed. Please try again later.",
      "signature is not deterministic, so derivation would not be reproducible",
    );
  }

  verify(a, message, params.signWith);
  return deriveFromSignature(a);
}

/**
 * The bytes an Ethereum wallet actually signs.
 *
 * The prefix is what stops a signed message from ever being a valid transaction,
 * and the length is counted in **bytes rather than characters**, which is why
 * the message is encoded before it is measured. A message with any non-ascii
 * character would otherwise be prefixed with the wrong length and produce a
 * signature no wallet agrees with.
 *
 * Turnkey applies keccak to these bytes inside the enclave, which is the same
 * division of labour an injected wallet makes.
 */
function eip191(message: string): Uint8Array {
  const body = new TextEncoder().encode(message);
  const prefix = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${body.length}`);
  return concatBytes(prefix, body);
}

/**
 * Turnkey's `r`, `s` and `v` as the 65 byte string every Ethereum client uses.
 *
 * Turnkey returns the recovery value as 0 or 1. Ethereum has written it as 27 or
 * 28 since the beginning, and this app's derivation reads all 65 bytes, so the
 * difference is not cosmetic: adding 27 in the wrong place is a different
 * shielded account. Both forms are accepted and normalised to the Ethereum one,
 * so a change on Turnkey's side surfaces as an error here rather than as a
 * silently different key.
 */
function assemble(sig: { r: string; s: string; v: string }): string {
  const r = field(sig.r, "r");
  const s = field(sig.s, "s");

  const raw = Number.parseInt(sig.v.replace(/^0x/, ""), 16);
  const v = raw === 0 || raw === 1 ? raw + 27 : raw;
  if (v !== 27 && v !== 28) {
    throw new UnlockError(unlockFailed, `unexpected recovery value ${sig.v}`);
  }

  return "0x" + r + s + v.toString(16).padStart(2, "0");
}

function field(value: string, name: string): string {
  const hex = value.replace(/^0x/, "").toLowerCase();
  if (!/^[0-9a-f]+$/.test(hex) || hex.length > 64) {
    throw new UnlockError(unlockFailed, `signature field ${name} is not a 32 byte value`);
  }
  return hex.padStart(64, "0");
}

/**
 * Assumptions 2 and 3, checked against the signature we are about to derive
 * from.
 *
 * Recovery is the strong one: it reproduces the signing public key from the
 * signature itself, so it catches a wrong recovery byte, a corrupted field and a
 * signature from the wrong account on the keyring, none of which are otherwise
 * distinguishable from a good signature.
 */
function verify(signatureHex: string, message: Uint8Array, expectedAddress: string): void {
  const bytes = hexToBytes(signatureHex.slice(2));
  const digest = keccak_256(message);

  const signature = secp256k1.Signature.fromCompact(bytes.subarray(0, 64)).addRecoveryBit(
    bytes[64]! - 27,
  );

  // Both halves of the curve are valid ECDSA and both recover this address, so
  // the check has to be explicit or it is not made at all.
  if (signature.hasHighS()) {
    throw new UnlockError(
      unlockFailed,
      "signature has a high s, so it would not match the same key in another wallet",
    );
  }

  const recovered = address(signature.recoverPublicKey(digest).toRawBytes(false));
  if (recovered !== expectedAddress.toLowerCase()) {
    throw new UnlockError(
      unlockFailed,
      `signature recovered to ${recovered}, expected ${expectedAddress.toLowerCase()}`,
    );
  }
}

/** Last 20 bytes of the keccak of the uncompressed public key, minus its 0x04 tag. */
function address(uncompressed: Uint8Array): string {
  return "0x" + bytesToHex(keccak_256(uncompressed.subarray(1)).subarray(-20));
}

const unlockFailed =
  "Your balance could not be opened safely, so nothing was changed. Please try again.";

/** Exported for the verification script, which drives these against a real wallet. */
export const __unlock = { eip191, assemble, verify, address };
