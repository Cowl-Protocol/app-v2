"use client";

import { useSyncExternalStore } from "react";
import { decodeRequest } from "@/lib/request-link";
import { IS_PLACEHOLDER, SAMPLE_REQUEST } from "../lib/placeholder";
import { resolveRequest } from "../lib/resolve";
import { PayRefused, PayScreen } from "./pay-screen";

/**
 * Reads the request out of the URL and renders one of three things.
 *
 * **The fragment is the input.** A payment link is `/pay#<payload>`, and a
 * fragment is never sent in an HTTP request, so nothing on the serving side ever
 * sees the payment address, the amount, or that a request exists. It also means
 * this decision cannot happen anywhere but the browser: a server could not read
 * the part of the URL that carries the request even if there were one.
 *
 * **`useSyncExternalStore` rather than reading `window` during render.** A static
 * export prerenders one HTML file for every visitor, so the server has no
 * fragment and the client does, and reading it in a render would make the two
 * disagree and React would reject the hydration. The server snapshot is the
 * empty string, which is also the honest answer: before hydration, this page
 * genuinely does not know which request it is.
 *
 * **No payload is not a refusal.** Somebody who typed the address by hand has
 * not done anything wrong, so while the placeholder exists they get a sample,
 * labelled as one. Wired, that arm becomes a short "this page needs a payment
 * link" and the sample goes with the module it came from.
 */

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

const readHash = () => window.location.hash;

/** No fragment exists during prerender, and pretending otherwise breaks hydration. */
const noHash = () => "";

export function PayRoute() {
  const hash = useSyncExternalStore(subscribe, readHash, noHash);

  const decoded = decodeRequest(hash);
  const sample = !decoded && IS_PLACEHOLDER;
  const payload = decoded ?? SAMPLE_REQUEST;

  /*
    Resolution is separate from decoding, and both have to pass before an amount
    and a Pay button appear together. A screen showing those two things has
    already told the payer the request is good, and the checks that matter most
    · that the chain is one this build knows, and that the destination is a real
    payment address · are questions about this deployment rather than about the
    string.
  */
  const resolved = resolveRequest(payload);
  if (typeof resolved === "string") return <PayRefused reason={resolved} />;

  return <PayScreen request={resolved} sample={sample} />;
}
