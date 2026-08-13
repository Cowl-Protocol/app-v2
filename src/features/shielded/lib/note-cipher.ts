/**
 * Reading the note ciphertexts the pool emits. **Decrypt only.**
 *
 * Ported from `app/lib/shielded/crypto.ts`, minus everything that writes. This
 * app cannot send a note yet, and `encryptNote` sitting here would be an
 * invitation to a path nobody has designed: the same reasoning that keeps
 * `shield` out of `pool-abi.ts`. It arrives with the module that spends.
 *
 * AES-256-GCM is deterministic in (key, iv, plaintext), so the CLI, the dapp and
 * this client produce and read byte-identical ciphertexts. That is not a
 * convenience, it is the reason one shielded account works from three clients.
 */
import { gcm } from "@noble/ciphers/aes";
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, concatBytes, hexToBytes } from "@noble/hashes/utils";

const Point = secp256k1.ProjectivePoint;

export type NoteCipher = {
  /** Ephemeral compressed pubkey, no 0x. */
  eph: string;
  tag: string;
  iv: string;
  ct: string;
  /** One byte, for rejecting a stranger's note without running AES on it. */
  vt: string;
};

/** Every field packs to 32 bytes, so a note's magnitude never leaks through a length. */
const FIELD_BYTES = 32;
const PAYLOAD_BYTES = 3 * FIELD_BYTES;

/** The pool emits a fixed 158 bytes: eph(33) iv(12) ct(96) tag(16) viewTag(1). */
export const NOTE_CIPHER_BYTES = 158;

function unpackField(b: Uint8Array): bigint {
  return BigInt("0x" + bytesToHex(b));
}

function sharedKey(point: InstanceType<typeof Point>): { key: Uint8Array; viewTag: string } {
  const h = keccak_256(point.toRawBytes(true));
  return { key: h, viewTag: bytesToHex(h.slice(0, 1)) };
}

export function unpackCipher(hex: string): NoteCipher {
  const b = hexToBytes(hex.replace(/^0x/, ""));
  if (b.length !== NOTE_CIPHER_BYTES) {
    throw new Error(`On-chain note cipher is ${b.length} bytes, expected ${NOTE_CIPHER_BYTES}.`);
  }
  return {
    eph: bytesToHex(b.subarray(0, 33)),
    iv: bytesToHex(b.subarray(33, 45)),
    ct: bytesToHex(b.subarray(45, 141)),
    tag: bytesToHex(b.subarray(141, 157)),
    vt: bytesToHex(b.subarray(157, 158)),
  };
}

/**
 * Try to open a cipher with our viewing key. Null means it was not ours.
 *
 * **The view tag saves AES and not the scalar multiplication**, because the ECDH
 * runs before the tag can be compared. That is the whole cost of a scan and it
 * is why this app rescans everything every session: there is nothing cached to
 * make the second pass cheaper.
 */
export function tryDecryptNote(
  c: NoteCipher,
  viewPriv: bigint,
): { value: bigint; token: bigint; blinding: bigint } | null {
  let key: Uint8Array;
  let viewTag: string;

  try {
    const ephPub = Point.fromHex(c.eph);
    ({ key, viewTag } = sharedKey(ephPub.multiply(viewPriv)));
  } catch {
    /* A malformed ephemeral key is somebody else's problem note, not ours, and
       one bad leaf must never stop a scan: the notes after it are the balance. */
    return null;
  }

  if (viewTag !== c.vt) return null;

  try {
    const sealed = concatBytes(hexToBytes(c.ct), hexToBytes(c.tag));
    const plain = gcm(key, hexToBytes(c.iv)).decrypt(sealed);
    if (plain.length !== PAYLOAD_BYTES) return null;
    return {
      value: unpackField(plain.subarray(0, FIELD_BYTES)),
      token: unpackField(plain.subarray(FIELD_BYTES, 2 * FIELD_BYTES)),
      blinding: unpackField(plain.subarray(2 * FIELD_BYTES, PAYLOAD_BYTES)),
    };
  } catch {
    return null;
  }
}
