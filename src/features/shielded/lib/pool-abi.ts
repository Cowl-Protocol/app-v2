/**
 * The shielded pool's interface, read side only.
 *
 * **Deliberately incomplete.** `shield`, `spend` and the rest of the write
 * surface are absent because nothing in this app can send a transaction yet, and
 * an ABI entry is an invitation: the moment `shield` is here, calling it is one
 * autocomplete away from a code path nobody decided to build. They arrive with
 * the module that submits them.
 *
 * Copied from `app/lib/shielded/contract.ts`, which tracks the deployed pool.
 *
 * **The three events are the whole balance.** Commitments live in the log rather
 * than in contract storage, so a client's note set is `NoteCommitted` replayed
 * from the deploy block and trial-decrypted against `NoteCipher`, minus whatever
 * `Nullified` says has already been spent. Missing one leaf does not throw: it
 * silently under-reports somebody's money.
 */
export const POOL_ABI = [
  { type: "function", name: "root", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "nextLeafIndex", stateMutability: "view", inputs: [], outputs: [{ type: "uint32" }] },
  { type: "function", name: "knownRoot", stateMutability: "view", inputs: [{ name: "r", type: "bytes32" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "committed", stateMutability: "view", inputs: [{ name: "c", type: "bytes32" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "nullifierSpent", stateMutability: "view", inputs: [{ name: "n", type: "bytes32" }], outputs: [{ type: "bool" }] },
  {
    type: "event",
    name: "NoteCommitted",
    inputs: [
      { name: "commitment", type: "bytes32", indexed: true },
      { name: "leafIndex", type: "uint32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Nullified",
    inputs: [{ name: "nullifier", type: "bytes32", indexed: true }],
  },
  {
    type: "event",
    name: "NoteCipher",
    inputs: [
      { name: "leafIndex", type: "uint32", indexed: false },
      { name: "ciphertext", type: "bytes", indexed: false },
    ],
  },
] as const;
