"use client";

/**
 * The account's public deposit address, derived on demand.
 *
 * **This is the one address here meant to be given out in the clear.** A
 * `zcowl1…` can only be paid by another Cowl client; an exchange withdrawal
 * form, a friend's wallet and a bridge can all only send to a plain `0x`. So the
 * keyring carries receiving accounts beside the signing one, and this issues the
 * first of them.
 *
 * **Index 0 is never it.** That account signs the shielded unlock message, and
 * an anchor that also appears on chain ties a public transfer to the account the
 * balance derives from. Funnels start at 1.
 *
 * **One funnel, not yet a sequence.** The design is one per hand-out, so no
 * single public string collects a person's whole inflow. What exists today is
 * index 1, reused, because rotation needs somewhere to record which indices have
 * been issued and this app records nothing. Every index is recoverable from the
 * same Google login whenever that lands, and an old funnel keeps receiving
 * forever, which is why nothing is lost by starting with one.
 *
 * **Derived by Turnkey, inside the enclave, from the same seed.** Nothing about
 * it is stored here. The activity is only asked for once per session because the
 * answer cannot change: the same path on the same wallet is the same address.
 */
import { useEffect, useState } from "react";
import { createWalletAccount, funnelPath, type Session, type WalletAccount } from "./turnkey";
import { useAccountRecord } from "./account-context";

export type Funnel =
  /** No session, so no keyring to derive from. */
  | { state: "locked" }
  | { state: "issuing" }
  | { state: "ready"; index: number; address: `0x${string}` }
  /** Turnkey refused or did not answer. The address simply does not exist yet. */
  | { state: "unavailable"; reason: string };

/** The first funnel, and for now the only one. */
const FIRST = 1;

/**
 * Session lifetime, in memory, keyed by the sub-organization.
 *
 * Two panels can ask at once and a tab switch remounts them; issuing an account
 * is a write to the wallet, and while Turnkey answers a repeat with the same
 * address, three round trips to learn one unchanging fact is three too many.
 */
const issued = new Map<string, Promise<`0x${string}`>>();

function existing(accounts: WalletAccount[], index: number): WalletAccount | undefined {
  const path = funnelPath(index);
  return accounts.find((a) => a.path === path);
}

async function ensureFunnel(
  session: Session,
  walletId: string,
  accounts: WalletAccount[],
): Promise<`0x${string}`> {
  const already = existing(accounts, FIRST);
  if (already) return already.address as `0x${string}`;

  const address = await createWalletAccount({
    session,
    walletId,
    path: funnelPath(FIRST),
  });
  return address as `0x${string}`;
}

export function useFunnel(): Funnel {
  const account = useAccountRecord();
  const org = account?.session.organizationId;
  const [done, setDone] = useState<{ org: string; funnel: Funnel } | null>(null);

  useEffect(() => {
    if (!account || !org) return;
    let live = true;

    const pending =
      issued.get(org) ??
      ensureFunnel(account.session, account.wallet.id, account.wallet.accounts).catch(
        (e: unknown) => {
          /* Not cached, so the next mount asks again. A refused activity is
             usually a session that expired while the tab was open. */
          issued.delete(org);
          throw e;
        },
      );
    issued.set(org, pending);

    pending
      .then((address) => {
        if (live) setDone({ org, funnel: { state: "ready", index: FIRST, address } });
      })
      .catch((e: unknown) => {
        if (!live) return;
        setDone({
          org,
          funnel: {
            state: "unavailable",
            reason: e instanceof Error ? e.message : String(e),
          },
        });
      });

    return () => {
      live = false;
    };
  }, [account, org]);

  if (!account || !org) return { state: "locked" };
  return done?.org === org ? done.funnel : { state: "issuing" };
}
