/**
 * The probes' wallet selection, run with `npm run test:wallet`. No network, no
 * credential; the Turnkey responses are handed in.
 *
 * **This exists because the rule it checks is one the probes had wrong.** Both
 * of them took the first wallet the API listed and, failing to find the expected
 * derivation path, the first account on it. That reads as a reasonable default
 * and is a coin toss: Turnkey does not document the order, so an organization
 * with two wallets gets a different signing key on some runs and not others.
 *
 * The cost of that lands on the one thing `probe:turnkey` is for. It watches for
 * a change in how the enclave derives a signature nonce, and it watches by
 * comparing `r` against a frozen value. A probe that changed wallet reports that
 * alarm from a healthy enclave, and once an alarm has cried wolf it stops being
 * evidence. The mirror case is worse and quieter: a real change hidden behind a
 * subject that never matched the frozen value anyway.
 *
 * So every case below is about refusing rather than picking, and the two that
 * matter most are the ones where a wrong answer would have looked completely
 * ordinary: an unnamed pick from a list of two, and an account fallback when the
 * wallet has no account at the expected path.
 */
import { findProbeAccount, SIGNING_PATH } from "./probe-wallet.mjs";

let failures = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) console.log(`  ok    ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`);
  }
}

/** A Turnkey that answers with whatever this test decided it holds. */
function fakePost(org: {
  wallets: { walletId: string; walletName: string }[];
  accounts: Record<string, { address: string; path: string }[]>;
}) {
  return async <T,>(path: string, body: unknown): Promise<T> => {
    if (path.endsWith("list_wallets")) return { wallets: org.wallets } as T;
    if (path.endsWith("list_wallet_accounts")) {
      const { walletId } = body as { walletId: string };
      return { accounts: org.accounts[walletId] ?? [] } as T;
    }
    throw new Error(`unexpected call to ${path}`);
  };
}

const ACCOUNT = { address: "0xaaaa", path: SIGNING_PATH };
const OTHER = { address: "0xbbbb", path: "m/44'/60'/0'/0/1" };

async function result(
  org: Parameters<typeof fakePost>[0],
  walletName?: string,
): Promise<{ ok: true; address: string; walletName: string } | { ok: false; message: string }> {
  try {
    const found = await findProbeAccount({
      post: fakePost(org),
      organizationId: "org",
      walletName,
    });
    return { ok: true, address: found.address, walletName: found.walletName };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

async function main() {
  console.log("\nWhich wallet a probe signs with");

  const one = {
    wallets: [{ walletId: "w1", walletName: "PROBE" }],
    accounts: { w1: [ACCOUNT] },
  };
  const two = {
    wallets: [
      { walletId: "w1", walletName: "PROBE" },
      { walletId: "w2", walletName: "Something Else" },
    ],
    accounts: { w1: [ACCOUNT], w2: [{ address: "0xcccc", path: SIGNING_PATH }] },
  };

  const lone = await result(one);
  check(
    "a lone wallet is used without being named",
    lone.ok && lone.address === "0xaaaa",
    lone.ok ? undefined : lone.message,
  );

  // The case the old code got wrong. Position is not an answer.
  const ambiguous = await result(two);
  check(
    "two wallets and no name is refused rather than guessed",
    !ambiguous.ok,
    ambiguous.ok ? `picked ${ambiguous.walletName} by position` : undefined,
  );
  check(
    "and the refusal says how to fix it",
    !ambiguous.ok && ambiguous.message.includes("TURNKEY_WALLET_NAME"),
    ambiguous.ok ? undefined : ambiguous.message,
  );

  const named = await result(two, "PROBE");
  check(
    "a named wallet is found among others",
    named.ok && named.address === "0xaaaa",
    named.ok ? undefined : named.message,
  );

  const wrongName = await result(two, "Nope");
  check(
    "a name matching nothing is refused, not fallen back from",
    !wrongName.ok,
    wrongName.ok ? `fell back to ${wrongName.walletName}` : undefined,
  );

  // Two wallets with one name is a dashboard mistake, and picking either of them
  // silently is how it stays a mistake.
  const duplicate = await result(
    {
      wallets: [
        { walletId: "w1", walletName: "PROBE" },
        { walletId: "w2", walletName: "PROBE" },
      ],
      accounts: { w1: [ACCOUNT], w2: [{ address: "0xcccc", path: SIGNING_PATH }] },
    },
    "PROBE",
  );
  check("two wallets sharing a name is refused", !duplicate.ok);

  // The second half of the old bug: `?? accounts[0]`. A neighbouring account
  // signs perfectly well, with the wrong key.
  const wrongPath = await result({
    wallets: [{ walletId: "w1", walletName: "PROBE" }],
    accounts: { w1: [OTHER] },
  });
  check(
    "a wallet with no account at the signing path is refused",
    !wrongPath.ok,
    wrongPath.ok ? `fell back to ${wrongPath.address}` : undefined,
  );
  check(
    "and the refusal names the path it wanted",
    !wrongPath.ok && wrongPath.message.includes(SIGNING_PATH),
    wrongPath.ok ? undefined : wrongPath.message,
  );

  // The account is chosen by path, not by position, so a wallet that lists the
  // right account second still works.
  const secondPlace = await result({
    wallets: [{ walletId: "w1", walletName: "PROBE" }],
    accounts: { w1: [OTHER, ACCOUNT] },
  });
  check(
    "the signing account is found wherever it sits in the list",
    secondPlace.ok && secondPlace.address === "0xaaaa",
    secondPlace.ok ? undefined : secondPlace.message,
  );

  const empty = await result({ wallets: [], accounts: {} });
  check("an organization with no wallet is refused", !empty.ok);

  console.log(
    failures === 0
      ? "\nAll 10 wallet selection checks pass. A probe cannot change subject quietly.\n"
      : `\n${failures} check(s) failed.\n`,
  );
  if (failures > 0) process.exit(1);
}

main();
