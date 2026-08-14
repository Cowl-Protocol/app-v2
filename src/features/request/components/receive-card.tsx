"use client";

import { useState } from "react";
import { tokensFor } from "@/config";
import { useAccount } from "@/features/auth";
import { useNetwork } from "@/lib/network";
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
 * Wiring lives in this file and the panels below it stay presentational, which
 * is what let the placeholder module be deleted without touching one of them.
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
 *
 * **Everything on it is the session's own, or it is absent.** The placeholder
 * module this file used to import is gone, along with the sample addresses it
 * built: they were real bech32m over a fixed phrase, which made them scannable,
 * and a scannable code is one a stranger can pay into a book whose spending key
 * exists in no wallet on earth. Nothing here can render an address the signed in
 * account does not hold.
 */

type Dialog = null | "request";

export function ReceiveCard() {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [tab, setTab] = useState<ReceiveTab>("cowl");
  const account = useAccount();
  const network = useNetwork();

  const tabs = <ReceiveTabs active={tab} onSelect={setTab} />;

  /*
    The session's own `zcowl1…`, derived in this tab, or nothing.

    **One address, not a sequence, and the panel now says so.** A session derives
    one account today: per-index derivation does not exist, so there is no next
    address to hand out and no previous ones to list. The rotation this product
    is designed around is a real thing that has not shipped, and a panel that
    printed "one time" over an address it reuses would be selling it before it
    is true.

    Null is the `SKIP_LOGIN` case and only that. It renders as a panel with no
    code on it rather than as a sample, because a sample that scans is a sample
    somebody can pay.
  */
  const live = account
    ? { index: 0, address: account.paymentAddress, issued: "Current", holdings: [] }
    : null;

  return (
    <>
      {tab === "cowl" ? (
        <ReceivePanel
          address={live}
          onRequest={() => setDialog("request")}
          tabs={tabs}
        />
      ) : (
        <FunnelPanel
          networkLabel={network.label}
          onRequest={live ? () => setDialog("request") : undefined}
          tabs={tabs}
        />
      )}

      {dialog === "request" && live && (
        <RequestPanel
          /*
            The address on the QR behind this dialog, because it is the only one
            this account has. When rotation ships this takes the next index off
            the sequence instead, and the reason it must is worth keeping here:
            an invoice and the standing code sharing a string put the same
            address in two strangers' hands.
          */
          address={live}
          tokens={[...tokensFor(network)]}
          chainId={network.chainId}
          networkLabel={network.label}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
