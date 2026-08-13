"use client";

import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { ACTIVE_NETWORK, PREVIEW } from "@/config";
import { ReceiveCard } from "@/features/request";
import { SendOverlay, SwapOverlay, useShieldedBook } from "@/features/shielded";
import { toAssets } from "../lib/holdings";
import { ACTIVITY, ARRIVING, ASSETS, STATUS, TRACE } from "../lib/placeholder";
import { ActivityPanel } from "./activity-panel";
import { ArrivalStrip } from "./arrival-strip";
import { AssetTable } from "./asset-table";
import { BalancePanel } from "./balance-panel";
import type { Verb } from "./quick-actions";
import { StatusStrip } from "./status-strip";

/**
 * The signed in home screen. **Layout only, wired to nothing.**
 *
 * Two columns, and the split is the argument. Balance and assets take the wide
 * side because that is what somebody opens this app to look at. Receive takes
 * the narrow side and sits at the top of it, above the fold on a laptop, because
 * it is the one action this product is built around and burying it under the
 * numbers would have made it a feature rather than the point.
 *
 * **The verb row opens things from here.** Send, Pay and Swap are dialogs from
 * `features/shielded`, imported through its public surface — the spend flows
 * live where spending will be wired. Receive is not a dialog: the card is
 * already on this screen, so the verb scrolls it into view and flashes it once.
 * Two copies of the receive surface, one in a panel and one in a modal, would
 * drift the moment one of them was edited.
 *
 * **Receive takes no props.** It owns an address sequence that rotates, the
 * request builder and the address list, and none of that is a portfolio's
 * business. Handing it an address would mean editing this file every time that
 * sequence changed shape.
 *
 * **Panels stretch to their row, and each one decides where the slack goes.** A
 * grid row is as tall as its tallest cell whether or not that was the plan, so
 * the choice is never between stretching and not stretching, only between
 * placing the extra space and letting it pool wherever the content happened to
 * end. Balance gives it to the chart, Receive and Activity push their last
 * control to the bottom edge. The first version of this screen used
 * `items-start` and left a void the height of a QR code under the balance.
 *
 * **Hide lives here rather than in the balance panel** because it has to reach
 * the asset rows as well. Blanking the total and leaving four amounts underneath
 * that add straight back up to it would be theatre. It is component state and
 * nothing else: writing it down would mean browser storage, which this app does
 * not use for anything, and a preference is not worth being the exception that
 * opens that door.
 */

type Dialog = null | "send" | "pay" | "swap";

export function HomeScreen() {
  const [hidden, setHidden] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [receiveFlash, setReceiveFlash] = useState(false);
  const receiveRef = useRef<HTMLDivElement>(null);
  const flashTimer = useRef<number | undefined>(undefined);
  const book = useShieldedBook();

  /*
    Three sources, and the middle one is the point.

    A signed in session renders what the chain says it holds. `locked` is the
    layout case, `SKIP_LOGIN` with no account behind it, and it keeps the
    placeholder so a screen can still be worked on. **Everything else renders
    nothing**, deliberately: while a scan is in flight or after it failed, the
    placeholder would be four invented balances sitting exactly where four real
    ones go, and nobody looking at them could tell.
  */
  const assets =
    book.state === "ready" ? toAssets(book.holdings) : book.state === "locked" ? ASSETS : [];

  function onAction(verb: Verb) {
    if (verb === "Send") setDialog("send");
    else if (verb === "Pay") setDialog("pay");
    else if (verb === "Swap") setDialog("swap");
    else {
      /*
        The card is the surface; the verb is a pointer to it. On a laptop it is
        already beside the balance and the scroll is a no-op; on a phone it is
        below the fold and this is the whole feature. The flash is one pulse so
        the eye lands on the right panel, not a state the card stays in.
      */
      receiveRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      window.clearTimeout(flashTimer.current);
      setReceiveFlash(true);
      flashTimer.current = window.setTimeout(() => setReceiveFlash(false), 1000);
    }
  }

  return (
    /*
      The bottom padding is small because the frame now draws the bottom edge.
      Before it did, this had to invent an ending for the page; with a housing
      around everything, fifty six pixels of it just pushed a page that fitted
      into one that scrolled by seventeen.
    */
    <div className="mx-auto w-full max-w-[1180px] px-5 pb-6 md:px-7">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        {/*
          The automatic move, above everything, for the seconds it exists. It
          spans the row rather than living inside a panel because it is about
          the balance and the receive card at once, and parking it in either
          would read as belonging to that panel's own content.
        */}
        {PREVIEW === "arriving" && (
          <div className="lg:col-span-12">
            <ArrivalStrip {...ARRIVING} />
          </div>
        )}

        {/*
          A scan that failed, said out loud and at the top.

          The alternative is a screen that reads as an empty account, and the
          two are worth distinguishing in the strongest terms available: one
          means nothing has arrived yet, the other means this client could not
          find out. Only the second one is worth a person's attention, and it is
          the one that would otherwise look calm.
        */}
        {book.state === "failed" && (
          <div className="lg:col-span-12">
            <Alert>
              Your balance could not be read from the chain, so nothing on this
              screen is a complete picture. Reload to try again · {book.reason}
            </Alert>
          </div>
        )}

        <div className="lg:col-span-8">
          <BalancePanel
            points={TRACE}
            hidden={hidden}
            onToggleHidden={() => setHidden((v) => !v)}
            onAction={onAction}
          />
        </div>

        <div
          ref={receiveRef}
          className={receiveFlash ? "animate-pulse lg:col-span-4" : "lg:col-span-4"}
        >
          <ReceiveCard />
        </div>

        <div className="lg:col-span-8">
          <AssetTable assets={assets} hidden={hidden} reading={book.state === "scanning"} />
        </div>

        <div className="lg:col-span-4">
          <ActivityPanel items={ACTIVITY} />
        </div>

        <div className="lg:col-span-12">
          <StatusStrip status={STATUS} />
        </div>
      </div>

      {dialog === "send" && (
        <SendOverlay mode="send" chainId={ACTIVE_NETWORK.chainId} onClose={() => setDialog(null)} />
      )}
      {dialog === "pay" && (
        <SendOverlay mode="pay" chainId={ACTIVE_NETWORK.chainId} onClose={() => setDialog(null)} />
      )}
      {dialog === "swap" && <SwapOverlay onClose={() => setDialog(null)} />}
    </div>
  );
}
