"use client";

/**
 * The signed in account, as context.
 *
 * The gate owns the state and the app reads it from here, which keeps the rule
 * README states: the signed in app arrives at the gate as `children`, so `auth`
 * never imports `portfolio`, and `portfolio` reaches back for the account rather
 * than being handed it through every component in between.
 *
 * **The context carries key material and the public surface does not.** That
 * split is not tidiness. `keys` holds `sk`, `nk` and the view key, and rule 6 in
 * README says key material is reachable only from `auth` and `shielded`, and
 * says it is enforced. Exporting one `useAccount()` that returned the whole
 * `Account` made that false: `eslint`'s zones restrict *paths*, and every
 * feature is allowed to import `@/features/auth`, so `pay`, `request` and
 * `portfolio` could each read the view key with a clean lint. Proved with a lint
 * probe, not assumed.
 *
 * So the keys leave this feature through `features/auth/keys.ts`, a second entry
 * point that `index.ts` does not re-export. The cross-feature zone already
 * blocks every deep import except a neighbour's `index.ts`, so that file is
 * unreachable from anywhere until a feature is named in the zone's `except`
 * list, which is where the decision belongs and where it is visible.
 *
 * Null means signed out, which is also every first render, because this app
 * starts from nothing every time by design.
 */
import { createContext, useContext } from "react";
import type { ShieldedKeys } from "@/features/keys";
import type { Account } from "./sign-in";

export const AccountContext = createContext<Account | null>(null);

/**
 * Signing out, provided by the gate.
 *
 * A separate context because the account context is null when signed out, and a
 * sign out control that disappeared along with the account it ends would be
 * unreachable from exactly the screens that need it. The default is a no-op so
 * that a screen rendered under `SKIP_LOGIN`, where there is no gate state to
 * clear, does not have to know that.
 */
export const SignOutContext = createContext<() => void>(() => {});

/**
 * End the session: the Turnkey key and the shielded keys together.
 *
 * The pair is the point. Dropping only the Turnkey session leaves `viewPriv`
 * live in memory, and the view key reads payment history backwards and cannot be
 * rotated, so a control that did half the job would be worse than none: the user
 * would believe they had signed out.
 */
export function useSignOut(): () => void {
  return useContext(SignOutContext);
}

/**
 * What a screen may know about the signed in user.
 *
 * Deliberately not a throwing variant. Screens behind the gate are also
 * reachable with `SKIP_LOGIN`, where there is genuinely no account, and a hook
 * that threw would make the layout switch useless exactly when it is being used.
 *
 * The wallet address is not here either. It is not a secret, but it is the one
 * address in this product that must never appear on chain, and a screen that can
 * read it is a screen that can render it.
 *
 * **The payment address is here, and it is the opposite case.** It is derived
 * from the keys, but it holds no secret and it exists to be published: it is the
 * string a user hands a stranger to get paid. Keeping it behind the key boundary
 * would put a public value under the strictest rule in the app, and the first
 * screen that needed it would widen `KEY_CONSUMERS` to reach it, undoing the rule
 * the product rests on for the sake of something already meant to be on a QR
 * code. Same reasoning that puts `@/lib/payment-address` outside `features/keys`.
 */
export function useAccount(): { email: string; paymentAddress: string } | null {
  const account = useContext(AccountContext);
  return account
    ? { email: account.email, paymentAddress: account.keys.paymentAddress }
    : null;
}

/**
 * The shielded keys, for the one feature that has to build a proof with them.
 *
 * Exported from `features/auth/keys.ts` rather than from `index.ts`. See the
 * note at the top of this file for why that is a boundary rather than a naming
 * preference.
 */
export function useShieldedKeys(): ShieldedKeys | null {
  return useContext(AccountContext)?.keys ?? null;
}
