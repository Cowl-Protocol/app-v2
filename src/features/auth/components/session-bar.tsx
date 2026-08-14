"use client";

import { AppBar } from "@/components/layout/app-bar";
import { useAccount } from "../lib/account-context";

/**
 * The top bar with the signed in account in it.
 *
 * **A feature-side wrapper, and the boundary is why it exists.** `AppBar` is a
 * layout primitive and rule 5 forbids it from knowing what an account is, while
 * the route above it is a server component that cannot call a hook at all. So
 * the one line that turns a session into a name lives here, in the feature that
 * owns sessions, and the bar goes on rendering strings it was handed.
 *
 * **The name is the local part of the email, and the email itself never
 * renders.** That is the ruling `types/index.ts` already carries: the address is
 * what the account *is*, the name is what the person is called, and printing the
 * first on a balance screen puts it in every screenshot and over every shoulder
 * for no benefit. `dev@cowlprotocol.com` becomes `dev`.
 *
 * No account means no account control, which is the `SKIP_LOGIN` case and only
 * that. An initials chip with nothing behind it would be a control that opens an
 * account that does not exist.
 */
export function SessionBar() {
  const account = useAccount();
  const name = account?.email.split("@")[0]?.trim();

  return <AppBar profile={name ? { name } : null} />;
}
