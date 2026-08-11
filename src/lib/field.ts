/**
 * BN254 scalar field (Fr) arithmetic.
 *
 * Every value that flows through a commitment, a nullifier, or a Merkle node
 * lives in this field, so this file has to compute the exact same numbers the
 * Noir circuit proves over. It is a port of `app/lib/shielded/field.ts`, which
 * is itself a port of `cli/src/shielded/field.ts`, and the three are expected to
 * agree rather than merely resemble each other. `scripts/keycheck.mts` pins that.
 *
 * It sits in `lib/` rather than inside a feature on purpose: this is arithmetic
 * over a published curve with no knowledge of notes, keys or the wallet. The
 * feature that holds secrets is `features/keys`, and it is thin because this is
 * separate.
 */
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, randomBytes } from "@noble/hashes/utils";
import { poseidon2Hash } from "@zkpassport/poseidon2";

/** BN254 scalar field modulus. */
export const FR =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/**
 * Domain tags for the two two-field hashes, mpk derivation and nullification,
 * which would otherwise share the shape of a Merkle node and could be confused
 * for one. ASCII "cowl:mpk" and "cowl:nul", mirrored in
 * `cli/circuits/notes/src/lib.nr`.
 */
export const DOMAIN_MPK = 0x636f776c3a6d706bn;
export const DOMAIN_NULLIFIER = 0x636f776c3a6e756cn;

export function mod(x: bigint): bigint {
  const r = x % FR;
  return r < 0n ? r + FR : r;
}

/** Reduce arbitrary bytes to a field element. */
export function bytesToField(b: Uint8Array): bigint {
  return mod(BigInt("0x" + bytesToHex(b)));
}

/** Keccak of the concatenated parts into the field. Deterministic. */
export function hashToField(...parts: Uint8Array[]): bigint {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const buf = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    buf.set(p, o);
    o += p.length;
  }
  return bytesToField(keccak_256(buf));
}

/**
 * A uniform random field element, 32 bytes reduced mod Fr.
 *
 * noble's `randomBytes` is backed by the platform CSPRNG. This is the one place
 * the browser port departs from the CLI, which reads `node:crypto`, and the
 * distribution is the same.
 */
export function randomField(): bigint {
  return bytesToField(randomBytes(32));
}

/** Poseidon2 over 1 to 4 field inputs. Variable-length sponge, matches Noir. */
export function poseidon(inputs: bigint[]): bigint {
  if (inputs.length < 1 || inputs.length > 4) {
    throw new Error(`poseidon arity ${inputs.length} unsupported`);
  }
  return poseidon2Hash(inputs);
}

/** 0x-prefixed, zero-padded 32-byte hex of a field element. */
export function fieldToHex(x: bigint): string {
  return "0x" + x.toString(16).padStart(64, "0");
}

export function hexToField(hex: string): bigint {
  return mod(BigInt(hex.startsWith("0x") ? hex : "0x" + hex));
}
