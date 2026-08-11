/**
 * `zcowl1…` payment addresses: encoding, decoding, validation.
 *
 * **Why this is not in `features/keys`.** A payment address is the one part of a
 * shielded account that is meant to be published. It carries `mpk` and the
 * public half of the view key, and holding someone's address does not let you
 * find their notes: detection needs the ECDH shared secret `ephPub · viewPriv`,
 * and only `viewPub` is in the string. Decoding one is what a *payer* does, and
 * `features/pay` is deliberately not on the list of features allowed to import
 * key material. Filing this under `keys` would put a public-data helper behind
 * the strictest boundary in the app, and the first person who needed it would
 * widen `KEY_CONSUMERS` to get at it. That would quietly undo the rule the whole
 * product rests on, to reach a function that holds no secret.
 *
 * Ported from `app/lib/shielded/keys.ts`. The two must agree byte for byte or a
 * user's address differs between clients and money goes to keys nobody holds.
 * `scripts/keycheck.mts` pins it.
 */
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { bech32m } from "@scure/base";
import { fieldToHex, hexToField } from "./field";

export type PaymentAddress = {
  /** Master public key. The note owner id that goes into a commitment. */
  mpk: bigint;
  /** Compressed secp256k1 point, 33 bytes, no 0x prefix. */
  viewPubHex: string;
};

/**
 * bech32m over `<mpk:32B><viewPub:33B compressed>` with the prefix "zcowl".
 *
 * The checksum is the point: a mistyped character fails to decode instead of
 * paying an `mpk` nobody holds, and a note addressed to a key nobody holds can
 * never be recovered by anyone. The result runs past bech32's 90 character
 * ceiling, the same way Zcash unified addresses do, so every encode and decode
 * passes an explicit no-limit.
 */
export function encodePaymentAddress(mpk: bigint, viewPubHex: string): string {
  const bytes = hexToBytes(fieldToHex(mpk).slice(2) + viewPubHex.replace(/^0x/, ""));
  return bech32m.encode("zcowl", bech32m.toWords(bytes), false);
}

export function decodePaymentAddress(addr: string): PaymentAddress {
  const s = addr.trim();
  // The pre-checksum zcowl:0x… form still decodes. Nothing emits it anymore,
  // but addresses were handed out in it and they still have to be payable.
  const legacy = s.match(/^zcowl:0x([0-9a-fA-F]{64})([0-9a-fA-F]{66})$/);
  if (legacy) return { mpk: hexToField("0x" + legacy[1]!), viewPubHex: legacy[2]! };

  let bytes: Uint8Array;
  try {
    // bech32 forbids mixed case. All-caps is one case, which is what a QR in
    // alphanumeric mode produces, so it has to be accepted.
    const oneCase = s === s.toUpperCase() ? s.toLowerCase() : s;
    const dec = bech32m.decode(oneCase as `${string}1${string}`, false);
    if (dec.prefix !== "zcowl") throw new Error("wrong prefix");
    bytes = bech32m.fromWords(dec.words);
  } catch {
    throw new Error("Invalid zcowl payment address.");
  }
  if (bytes.length !== 65) throw new Error("Invalid zcowl payment address.");
  const hex = bytesToHex(bytes);
  return { mpk: hexToField("0x" + hex.slice(0, 64)), viewPubHex: hex.slice(64) };
}

export function isPaymentAddress(s: string): boolean {
  try {
    decodePaymentAddress(s);
    return true;
  } catch {
    return false;
  }
}
