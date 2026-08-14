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
 * same login whenever that lands, and an old funnel keeps receiving forever,
 * which is why nothing is lost by starting with one.
 *
 * **Derived by the provider, inside its TEE, from the same seed.** Nothing about
 * it is stored here. It is asked for once per session because the answer cannot
 * change: the same index on the same keyring is the same address.
 */
import { useEffect, useState } from "react";
import { useAccountRecord } from "./account-context";
import { FIRST_FUNNEL_INDEX, type ShieldedSigner } from "./signer";

export type Funnel =
  /** No session, so no keyring to derive from. */
  | { state: "locked" }
  | { state: "issuing" }
  | { state: "ready"; index: number; address: `0x${string}` }
  /** The provider refused or did not answer. The address simply does not exist yet. */
  | { state: "unavailable"; reason: string };

/**
 * Session lifetime, in memory, keyed by the anchor address.
 *
 * Two panels can ask at once and a tab switch remounts them; issuing an account
 * is a write to the keyring, and while a provider answers a repeat with the same
 * address, three round trips to learn one unchanging fact is three too many.
 *
 * **Keyed by the anchor rather than by a session id**, because the anchor is
 * what the answer actually depends on. Two sessions for the same user derive the
 * same funnel, and a different user is a different anchor.
 */
const issued = new Map<string, Promise<`0x${string}`>>();

export function useFunnel(): Funnel {
  const account = useAccountRecord();
  const anchor = account?.address;
  const [done, setDone] = useState<{ anchor: string; funnel: Funnel } | null>(null);

  useEffect(() => {
    if (!account || !anchor) return;
    let live = true;

    const pending =
      issued.get(anchor) ??
      derive(account.signer).catch((e: unknown) => {
        /* Not cached, so the next mount asks again. A refused derivation is
           usually a session that expired while the tab was open. */
        issued.delete(anchor);
        throw e;
      });
    issued.set(anchor, pending);

    pending
      .then((address) => {
        if (live) {
          setDone({ anchor, funnel: { state: "ready", index: FIRST_FUNNEL_INDEX, address } });
        }
      })
      .catch((e: unknown) => {
        if (!live) return;
        setDone({
          anchor,
          funnel: {
            state: "unavailable",
            reason: e instanceof Error ? e.message : String(e),
          },
        });
      });

    return () => {
      live = false;
    };
  }, [account, anchor]);

  if (!account || !anchor) return { state: "locked" };
  return done?.anchor === anchor ? done.funnel : { state: "issuing" };
}

function derive(signer: ShieldedSigner): Promise<`0x${string}`> {
  return signer.addressAt(FIRST_FUNNEL_INDEX);
}
