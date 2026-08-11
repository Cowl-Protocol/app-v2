/**
 * **Placeholder data. Nothing here is read from a chain, a key, or a note.**
 *
 * The home screen is being laid out before it is wired, so every figure on it
 * comes from this file and this file only. That is the point: when the shielded
 * book arrives, wiring is deleting this module and satisfying the same types,
 * and anything still importing it fails the build rather than quietly shipping
 * an invented balance.
 *
 * **The numbers are deliberately not the live pool's.** Filling a mock with the
 * mainnet pool's actual holdings would produce a screenshot indistinguishable
 * from a real read, and the first person to quote one back at us would be
 * quoting a design file. These are a plausible consumer portfolio and nothing
 * more.
 */
import type { Profile } from "@/types";
import type { Activity, Asset, ClientStatus, TracePoint } from "../types";

/**
 * The signed in person, as the top bar needs them.
 *
 * A display name and nothing else. The email this stands in for,
 * `dev@cowlprotocol.com`, is what the account *is* and belongs in the account
 * menu beside signing out, not printed across the top of a balance screen where
 * it lands in every screenshot.
 */
export const PROFILE: Profile = { name: "Dev" };

/**
 * Held inside the pool. There is no public column on this screen, and that is a
 * product decision rather than an omission: this app provisions the wallet, so
 * its owner never chose to hold anything outside. The dapp is where two books
 * side by side makes sense.
 */
/**
 * `logoURI` points into `public/tokens`, copied from the dapp so both clients
 * draw the same four marks. **AAPL deliberately has none**, and that is the
 * realistic case rather than an oversight: tokenized stock is discovered from
 * the chain, nobody curated artwork for it, and in production it would arrive
 * carrying an explorer URL or nothing at all. Leaving it blank keeps the
 * fallback on screen where it can be looked at instead of found later.
 */
export const ASSETS: Asset[] = [
  {
    symbol: "ETH",
    name: "Ether",
    decimals: 18,
    balance: 1_482_000_000_000_000_000n,
    price: 3412.8,
    logoURI: "/tokens/eth.svg",
  },
  {
    symbol: "AAPL",
    name: "Apple",
    decimals: 18,
    balance: 12_500_000_000_000_000_000n,
    price: 232.15,
  },
  {
    symbol: "USDG",
    name: "Global Dollar",
    decimals: 6,
    balance: 1_240_500_000n,
    price: 1,
    logoURI: "/tokens/usdg.png",
  },
  {
    symbol: "COWL",
    name: "Cowl",
    decimals: 18,
    balance: 8_400_000_000_000_000_000_000_000n,
    price: 0.0000335,
    logoURI: "/tokens/cowl.png",
  },
];

/**
 * Seven daily readings, oldest first.
 *
 * Daily rather than hourly on purpose. A denser trace would look smoother and
 * would be a lie about how often this app has anything new to say: a shielded
 * balance moves when its owner moves it, and between those moments the only
 * thing changing is the price of what they already hold.
 */
export const TRACE: TracePoint[] = [
  { t: "6 days ago", usd: 9012.3 },
  { t: "5 days ago", usd: 8874.15 },
  { t: "4 days ago", usd: 9130.72 },
  { t: "3 days ago", usd: 9298.44 },
  { t: "2 days ago", usd: 9210.06 },
  { t: "Yesterday", usd: 9377.81 },
  { t: "Today", usd: 9481.54 },
];

export const ACTIVITY: Activity[] = [
  {
    id: "a1",
    kind: "receive",
    symbol: "USDG",
    amount: 250_000_000n,
    decimals: 6,
    when: "2h ago",
  },
  {
    id: "a2",
    kind: "swap",
    symbol: "ETH",
    intoSymbol: "AAPL",
    amount: 350_000_000_000_000_000n,
    decimals: 18,
    when: "Yesterday",
  },
  {
    id: "a3",
    kind: "send",
    symbol: "COWL",
    amount: 500_000_000_000_000_000_000_000n,
    decimals: 18,
    when: "2 days ago",
  },
  /*
    Inside the panel's four visible rows on purpose: it is the one kind whose
    on-screen label ("Added") differs from its protocol name, and a row that
    only exists below the fold is a label nobody has ever looked at.
  */
  {
    id: "a4",
    kind: "shield",
    symbol: "ETH",
    amount: 1_000_000_000_000_000_000n,
    decimals: 18,
    when: "4 days ago",
  },
  {
    id: "a5",
    kind: "receive",
    symbol: "AAPL",
    amount: 4_000_000_000_000_000_000n,
    decimals: 18,
    when: "6 days ago",
  },
];

export const STATUS: ClientStatus = {
  synced: "just now",
  readyToSend: true,
};

/**
 * The arrival the `"arriving"` preview renders: public funds mid move into the
 * balance. ETH on purpose, because ETH is the arrival that always carries its
 * own gas and therefore the one this state can show without also designing the
 * stuck case. See `arrival-strip.tsx` for why the stuck case waits for wiring.
 */
export const ARRIVING = {
  symbol: "ETH",
  amount: 200_000_000_000_000_000n,
  decimals: 18,
};
