import { PayRoute } from "@/features/pay";

/**
 * `/pay` · the payer's surface, and the only route in this app other than `/`.
 *
 * **A route of its own, not a state of the front door.** The payer is a stranger
 * settling something, not a person acquiring a shielded balance, and
 * `COWL-PAY.md` is explicit that dropping them into the dapp is a ritual built
 * for people who intend to hold funds. Separating it at the URL means the app
 * below is not merely unmounted, it is never referenced: nothing on this path
 * imports auth, the preloader, or a portfolio.
 *
 * **The request still travels in the fragment**, as `/pay#<payload>`. A fragment
 * is never sent in an HTTP request, so the host serving this page learns the
 * path and nothing else · not the payment address, not the amount, not that a
 * request exists. Putting the payload in the path or the query string would hand
 * every one of those to a web log, which is the whole point of the product given
 * away by the thing hosting it.
 *
 * **Deploy note, because a static export makes this a real question.** With the
 * default config this builds to `out/pay.html`, not `out/pay/index.html`. Local
 * `serve` and Vercel both resolve `/pay` to it; a plain web root does not, and
 * Caddy needs a `try_files {path} {path}.html` rule or this 404s in production
 * while working perfectly here. The alternative is `trailingSlash: true`, which
 * fixes it everywhere and moves the address to `/pay/`. **Nobody has decided**,
 * and it is not a decision worth making from inside a route file.
 */
export default function PayPage() {
  return <PayRoute />;
}
