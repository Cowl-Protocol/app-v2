/**
 * Which wallet and which account the probes sign with.
 *
 * **Shared by `probe:turnkey` and `probe:export` because both of them compare
 * bytes against a frozen value, and a probe that quietly changed subject would
 * report on the wrong key.** Both scripts used to take the first wallet in the
 * list and, failing to find the expected derivation path, the first account on
 * it. Turnkey does not document the order `list_wallets` returns, so in an
 * organization with more than one wallet that is a coin toss made once per run.
 *
 * The failure it produces is worse than a crash. `probe:turnkey` exists to
 * notice if the enclave ever changes how it derives a signature nonce, and it
 * notices by comparing `r` against a value frozen on 2026-08-12. Picking a
 * different wallet produces a different `r` from a perfectly healthy enclave,
 * which reads as the alarm this repository most wants to be able to trust.
 * The same slip in the other direction hides a real change behind a subject
 * that never had the frozen value to begin with.
 *
 * So the rule here is the one `listAccounts` already follows in the app: match
 * by name, and refuse an ambiguous answer rather than picking from it. **There
 * is deliberately no fallback to an index anywhere below.** A probe that cannot
 * tell you which key it read is not evidence, and a probe that refuses is a
 * thirty second fix.
 */

/** The account the shielded unlock message is signed with, from the app. */
export { SIGNING_PATH } from "../src/features/auth/lib/turnkey";
import { SIGNING_PATH } from "../src/features/auth/lib/turnkey";

export type ProbeAccount = {
  walletName: string;
  address: string;
  path: string;
};

/**
 * Find the one wallet account both probes are talking about.
 *
 * `walletName` is `TURNKEY_WALLET_NAME` when it is set. Leaving it unset is fine
 * in an organization holding exactly one wallet, which is the case a throwaway
 * probe organization is normally in; the moment there is a second one, this
 * refuses and asks to be told rather than guessing between them.
 *
 * `post` is the caller's stamped fetch, so this module holds no credential and
 * makes no decision about how a request is signed.
 */
export async function findProbeAccount(params: {
  post: <T>(path: string, body: unknown) => Promise<T>;
  organizationId: string;
  walletName?: string;
}): Promise<ProbeAccount> {
  const { post, organizationId } = params;
  const wanted = params.walletName?.trim();

  const { wallets } = await post<{
    wallets: { walletId: string; walletName: string }[];
  }>("/public/v1/query/list_wallets", { organizationId });

  if (wallets.length === 0) {
    throw new Error(
      "This organization has no wallet. Create a throwaway one in the dashboard first.",
    );
  }

  // Named match when a name was given, every wallet when it was not. Either way
  // the count below is what decides, never the position.
  const candidates = wanted ? wallets.filter((w) => w.walletName === wanted) : wallets;

  if (candidates.length !== 1) {
    const names = wallets.map((w) => w.walletName).join(", ");
    throw new Error(
      wanted
        ? `Expected exactly one wallet named "${wanted}", found ${candidates.length}. ` +
          `This organization has: ${names}.`
        : `This organization has ${wallets.length} wallets and nothing says which one ` +
          `to probe: ${names}. Set TURNKEY_WALLET_NAME to the one you mean. ` +
          `Picking by position would compare the frozen signature against whichever ` +
          `wallet the API happened to list first.`,
    );
  }

  const wallet = candidates[0]!;

  const { accounts } = await post<{
    accounts: { address: string; path: string }[];
  }>("/public/v1/query/list_wallet_accounts", {
    organizationId,
    walletId: wallet.walletId,
  });

  // No `?? accounts[0]`. A wallet without this path is a wallet this probe has
  // nothing to say about, and signing with a neighbouring account would produce
  // a real signature from the wrong key.
  const account = accounts.find((a) => a.path === SIGNING_PATH);
  if (!account) {
    throw new Error(
      `Wallet "${wallet.walletName}" has no account at ${SIGNING_PATH}. ` +
        `It has: ${accounts.map((a) => a.path).join(", ") || "no accounts"}.`,
    );
  }

  return { walletName: wallet.walletName, address: account.address, path: account.path };
}
