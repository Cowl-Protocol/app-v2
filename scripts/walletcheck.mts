/**
 * Which wallet the adapter picks, and everything it refuses to pick.
 *
 * **This suite exists because the function it covers had none.** `walletAt`
 * decides which key the entire shielded balance derives from, its own comment
 * says that getting it wrong "looks exactly like theft", and until now the only
 * thing asserting it was that comment. An earlier note claimed wallet selection
 * was covered by the architecture boundary cases · those assert which files may
 * import the vendor and have never called this function.
 *
 * Offline, no key, no network. `select.ts` imports nothing, which is what lets a
 * plain script reach the real code rather than a copy of it.
 */
import {
  describeKeyring,
  walletAt,
  type KeyringWallet,
} from "../src/features/auth/lib/providers/select";

const ANCHOR = 0;
const FUNNEL = 1;

/* Addresses are shaped like real ones so a leak into a log line would be
   visible as one. None of them belongs to anybody. */
const A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const C = "0xcccccccccccccccccccccccccccccccccccccccc";

function wallet(
  walletClientType: string,
  walletIndex: number | null | undefined,
  address: string,
): KeyringWallet {
  return { walletClientType, address, walletIndex };
}

let checks = 0;
let failures = 0;

function check(name: string, ok: boolean, detail?: string) {
  checks++;
  if (ok) {
    console.log(`  ok    ${name}`);
    return;
  }
  failures++;
  console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
}

console.log("\nWallet selection · what the adapter picks\n");

{
  const found = walletAt([wallet("privy", 0, A)], ANCHOR);
  check(
    "the embedded wallet at the anchor index is the one returned",
    found.found?.address === A,
  );
}

{
  const found = walletAt([wallet("privy-v2", 0, A)], ANCHOR);
  check("a privy-v2 wallet counts as embedded", found.found?.address === A);
}

{
  /* The funnel lives at index 1 and is derived from the same keyring, so the
     lookup has to answer for an index it was not built around. */
  const keyring = [wallet("privy", 0, A), wallet("privy", 1, B)];
  const anchor = walletAt(keyring, ANCHOR);
  const funnel = walletAt(keyring, FUNNEL);
  check(
    "each index answers with its own wallet, anchor and funnel alike",
    anchor.found?.address === A && funnel.found?.address === B,
  );
}

console.log("\nWhat it refuses, where a guess would cost the balance\n");

{
  /* The load-bearing one. `walletIndex` is optional on the provider's type, so a
     release that stopped populating it would hand every wallet an undefined
     index · and `undefined == 0` is the coercion that would quietly make the
     first wallet on the keyring the anchor. */
  const found = walletAt([wallet("privy", undefined, A)], ANCHOR);
  check(
    "a wallet reporting no index matches nothing, index 0 included",
    found.found === null && !("ambiguous" in found),
    "an unknown index was treated as zero, which is the guess this refuses",
  );
}

{
  const found = walletAt([wallet("privy", null, A)], ANCHOR);
  check(
    "a null index is refused the same way an absent one is",
    found.found === null && !("ambiguous" in found),
  );
}

{
  /* Every Ethereum keyring has an account at index 0. If an injected wallet
     could satisfy the anchor, the unlock signature would recover to its address,
     every check in unlock.ts would pass, and the shielded account derived would
     be one the next session cannot reach. */
  const found = walletAt([wallet("metamask", 0, A)], ANCHOR);
  check(
    "an injected wallet sitting at index 0 is never the anchor",
    found.found === null,
    "a wallet the provider does not hold was accepted as the anchor",
  );
}

{
  const keyring = [wallet("metamask", 0, A), wallet("privy", 0, B)];
  const found = walletAt(keyring, ANCHOR);
  check(
    "an injected wallet beside the real one does not make the answer ambiguous",
    found.found?.address === B,
  );
}

{
  const found = walletAt([wallet("privy", 0, A), wallet("privy", 0, B)], ANCHOR);
  check(
    "two embedded wallets at one index are refused rather than chosen between",
    found.found === null && "ambiguous" in found && found.ambiguous === 2,
    "one of two candidates was picked, which is a coin flip over somebody's balance",
  );
}

{
  const found = walletAt([wallet("privy", 1, A)], ANCHOR);
  check(
    "a keyring that only reaches index 1 has no anchor to offer",
    found.found === null && !("ambiguous" in found),
  );
}

{
  const found = walletAt([], ANCHOR);
  check("an empty keyring is absent, not ambiguous", found.found === null);
}

console.log("\nThe diagnostic, which is read by a person and never by code\n");

{
  const line = describeKeyring([wallet("privy", 0, A), wallet("privy", 1, B)]);
  check(
    "it names the client type and the index of every wallet",
    line.includes("privy@0") && line.includes("privy@1"),
    `got: ${line}`,
  );
}

{
  /* Index 0 is falsy, and the obvious way to write this line loses it. A
     diagnostic that reported the anchor as "no index" would send whoever reads
     it looking for a provider bug that is not there. */
  const line = describeKeyring([wallet("privy", 0, A)]);
  check(
    "index 0 survives, rather than being read as absent",
    line.includes("privy@0") && !line.includes("no index"),
    `got: ${line}`,
  );
}

{
  const line = describeKeyring([wallet("privy", undefined, A)]);
  check(
    "a missing index says so, which is the whole reason this line exists",
    line.includes("no index"),
    `got: ${line}`,
  );
}

{
  /* This is a privacy assertion, not a formatting one. The line goes to the
     console on a failed sign in, and an address in it would turn a diagnostic
     into a record of who was signing in. */
  const line = describeKeyring([
    wallet("privy", 0, A),
    wallet("metamask", null, B),
    wallet("privy", 2, C),
  ]);
  check(
    "no address reaches the log line, on any wallet or any index",
    !line.includes(A) && !line.includes(B) && !line.includes(C) && !line.includes("0x"),
    `got: ${line}`,
  );
}

{
  const line = describeKeyring([]);
  check(
    "an empty keyring reads as a sentence rather than as nothing at all",
    line.trim().length > 0 && !line.includes("@"),
    `got: ${line}`,
  );
}

console.log(
  failures === 0
    ? `\nAll ${checks} selection checks pass. The adapter picks by index or refuses.\n`
    : `\n${failures} of ${checks} selection checks FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
