"use client";

import { useState } from "react";
import { DEFAULT_NETWORK, NETWORKS, PREVIEW } from "@/config";
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
  const network = NETWORKS[DEFAULT_NETWORK];

  const tabs = <ReceiveTabs active={tab} onSelect={setTab} />;

  return (
    <>
      {tab === "cowl" ? (
        <ReceivePanel
          address={CURRENT}
          retiredCount={RETIRED.length}
          justReceived={PREVIEW === "paid" ? SAMPLE_RECEIPT : undefined}
          onRequest={() => setDialog("request")}
          onOpenAddresses={() => setDialog("addresses")}
          tabs={tabs}
          sample={IS_PLACEHOLDER}
        />
      ) : (
        <FunnelPanel
          funnel={FUNNEL}
          networkLabel={network.label}
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
          chainId={network.chainId}
          networkLabel={network.label}
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
