/**
 * A shielded note: a hidden amount of one token, owned by one master public key.
 *
 * Ported from `app/lib/shielded/note.ts`, itself a port of the CLI's. The three
 * formulas below are consensus with the circuits and the pool, so a change here
 * is not a refactor: a commitment computed differently is a note the chain does
 * not recognise, and a nullifier computed differently either fails to spend or,
 * worse, fails to notice that a note was already spent.
 */
import { DOMAIN_NULLIFIER, poseidon } from "@/lib/field";

export type Note = {
  /** Base units. wei, or the token's smallest unit. */
  value: bigint;
  /** 0 is the native coin. Anything else is an ERC-20 address as a field element. */
  token: bigint;
  /** The owner. `Poseidon2(DOMAIN_MPK, sk, nk)`, derived inside the spend circuit. */
  mpk: bigint;
  /** Per note randomness. Without it, equal notes would have equal commitments. */
  blinding: bigint;
};

/** commitment = Poseidon(mpk, token, value, blinding) */
export function commitment(n: Note): bigint {
  return poseidon([n.mpk, n.token, n.value, n.blinding]);
}

/**
 * nullifier = Poseidon(DOMAIN_NULLIFIER, nk, leafIndex)
 *
 * Unlinkable to the commitment, which is what lets a spend prove "this note is
 * mine and unspent" without saying which leaf it is. It is keyed on the leaf
 * index rather than the note's contents, so it can be computed for any leaf we
 * own without knowing whether it has been spent yet, which is exactly what a
 * scan needs.
 */
export function nullifier(nk: bigint, leafIndex: number | bigint): bigint {
  return poseidon([DOMAIN_NULLIFIER, nk, BigInt(leafIndex)]);
}

/** An EVM address as the field element the pool's token id uses. */
export function addressToField(address: `0x${string}`): bigint {
  return BigInt(address);
}

/** The other direction, for naming the token a note holds. */
export function fieldToAddress(token: bigint): `0x${string}` {
  return `0x${token.toString(16).padStart(40, "0")}`;
}
