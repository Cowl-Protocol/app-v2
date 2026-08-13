"use client";

import { useState } from "react";
import { ACTIVE_NETWORK, PREVIEW } from "@/config";
import { useAccount } from "@/features/auth";
import {
  CURRENT,
  FUNNEL,
  GATHER,
  IS_PLACEHOLDER,
  NEXT,
  REQUEST_TOKENS,
  RETIRED,
} from "../lib/placeholder";
import type { TokenAmount } from "../types";
import { AddressBook } from "./address-book";
import { FunnelPanel } from "./funnel-panel";
import { ReceivePanel } from "./receive-panel";
import { ReceiveTabs, type ReceiveTab } from "./receive-tabs";
import { RequestPanel } from "./request-panel";

/**
 * Receive, with the two dialogs that open from it.
 *
 * The container, so the home screen renders `<ReceiveCard />` and knows nothing
 * about addresses, rotation or gathering. **That direction is the point.** An
 * address sequence is this feature's business, and a portfolio screen that had
 * to be handed one would have to be edited every time the sequence changed shape.
 * Wiring stays inside this file and the panels below it stay presentational, so
 * when the shielded book arrives the work is deleting `lib/placeholder` and
 * satisfying the same props.
 *
 * **Two tabs, split by who is paying.** "From Cowl" hands out the one-time
 * `zcowl1…`; "From anywhere" holds the payment link and the plain `0x` funnel
 * for exchange withdrawals. The same request dialog opens from both tabs: a
 * request IS the payment link, whoever it is for, and two builders would drift
 * into two link formats.
 *
 * The open dialog and the active tab are component state and nothing else.
 * Writing either down would mean browser storage, which this app does not use
 * for anything, and neither is worth being the exception that opens that door.
 */

type Dialog = null | "request" | "addresses";

/**
 * Stands in for the payment that caused the current address to be current.
 *
 * There is no chain here, so nothing can actually arrive, and this is reachable
 * only through `PREVIEW`. It is a real state with a real design and a few
 * seconds of life, and a state nobody can put on screen is a state that gets
 * designed wrong.
 */
const SAMPLE_RECEIPT: TokenAmount = {
  symbol: "USDG",
  amount: 250_000_000n,
  decimals: 6,
};

export function ReceiveCard() {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [tab, setTab] = useState<ReceiveTab>("cowl");
  const account = useAccount();

  const tabs = <ReceiveTabs active={tab} onSelect={setTab} />;

  /*
    The first real thing on this screen.

    A signed in session derives its own `zcowl1…`, so the panel shows that one
    and the SAMPLE tag comes off, because the address is genuinely payable and
    the money genuinely arrives. Without a session, which is every `SKIP_LOGIN`
    render, it falls back to the placeholder that is built from a fixed phrase
    and stays labelled as a sample.

    **No retired addresses, and that is the truth rather than a stub.** One
    session derives one account today. The one-time sequence needs per-index
    derivation, which does not exist yet, and printing "4 previous addresses"
    beside a real address would be inventing a history this account has not got.
  */
  const live = account
    ? { index: 0, address: account.paymentAddress, issued: "Current", holdings: [] }
    : null;

  return (
    <>
      {tab === "cowl" ? (
        <ReceivePanel
          address={live ?? CURRENT}
          retiredCount={live ? 0 : RETIRED.length}
          justReceived={PREVIEW === "paid" ? SAMPLE_RECEIPT : undefined}
          onRequest={() => setDialog("request")}
          onOpenAddresses={() => setDialog("addresses")}
          tabs={tabs}
          sample={live ? false : IS_PLACEHOLDER}
        />
      ) : (
        <FunnelPanel
          funnel={FUNNEL}
          networkLabel={ACTIVE_NETWORK.label}
          onRequest={() => setDialog("request")}
          tabs={tabs}
          sample={IS_PLACEHOLDER}
        />
      )}

      {dialog === "request" && (
        <RequestPanel
          /*
            The next address off the sequence, never the one already on the QR
            behind this dialog. One sequence, and every hand-out takes the next
            index: an invoice and the standing code sharing a string would put
            the same address in two strangers' hands, which is the one thing
            rotation exists to stop.
          */
          address={NEXT}
          tokens={REQUEST_TOKENS}
          chainId={ACTIVE_NETWORK.chainId}
          networkLabel={ACTIVE_NETWORK.label}
          onClose={() => setDialog(null)}
          sample={IS_PLACEHOLDER}
        />
      )}

      {dialog === "addresses" && (
        <AddressBook
          addresses={RETIRED}
          gather={GATHER}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
