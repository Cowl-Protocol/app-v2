import { Panel } from "@/components/ui/panel";
import { TokenGlyph } from "@/components/ui/token-glyph";
import { formatAmount, formatUsd } from "@/lib/format";
import { share, usdValue } from "../lib/format";
import type { Asset } from "../types";

/**
 * What is held, biggest first.
 *
 * **The share bar is one colour for every row.** Four hues, one per token, is
 * the obvious version and it is wrong twice: it would paint the only accent this
 * brand has across four things that are not the accent, and colouring nominal
 * categories by size double encodes the length of the bar as its hue, spending
 * the one free channel on information the bar already carries. Identity comes
 * from the ticker at the start of the row, which is what a holder actually reads
 * anyway. The bar answers one question, how much of the total is this, and
 * answers it by length alone.
 *
 * Amounts are mono and tabular, which is the opposite of the headline figure
 * above them, and for the opposite reason: these stack, so the decimal points
 * have to line up down the column.
 */

export function AssetTable({
  assets,
  hidden,
  reading = false,
}: {
  assets: Asset[];
  hidden: boolean;
  /**
   * The chain is still being read.
   *
   * Its own state, and not a variation on empty. "Nothing here yet" is an
   * instruction to a new account and a lie to somebody whose money simply has
   * not been counted yet, and the second reading is the one that arrives at the
   * worst moment: a balance that renders as nothing before the scan lands is
   * indistinguishable from a balance that is gone.
   */
  reading?: boolean;
}) {
  const priced = assets.map((a) => ({ a, usd: usdValue(a.balance, a.decimals, a.price) }));
  const total = priced.reduce((n, r) => n + (r.usd ?? 0), 0);
  const rows = [...priced].sort((x, y) => (y.usd ?? 0) - (x.usd ?? 0));

  return (
    <Panel
      label="Assets"
      square
      bodyClassName="px-0 pb-0"
      aside={
        <span className="font-mono text-[11px] tabular-nums text-bone/45">
          {assets.length}
        </span>
      }
      className="h-full min-w-0"
    >
      {rows.length === 0 ? (
        reading ? <Reading /> : <Empty />
      ) : (
        <ul className="divide-y divide-white/[0.05] border-t border-white/[0.05]">
          {rows.map(({ a, usd }) => (
            <li
              key={a.symbol}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3.5 transition-colors hover:bg-white/[0.02] md:grid-cols-[minmax(0,1fr)_132px_auto]"
            >
              <div className="flex min-w-0 items-center gap-3">
                <TokenGlyph symbol={a.symbol} src={a.logoURI} />
                <div className="min-w-0">
                  <p className="font-mono text-[13px] tracking-[0.06em] text-bone">
                    {a.symbol}
                  </p>
                  <p className="truncate text-[12px] text-bone/40">{a.name}</p>
                </div>
              </div>

              {/* Hidden on small screens: at that width it would be shorter than
                  the label beside it and carry no readable difference. */}
              <div className="hidden items-center gap-3 md:flex">
                <ShareBar pct={share(usd, total)} />
                <span className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums text-bone/40">
                  {share(usd, total).toFixed(0)}%
                </span>
              </div>

              <div className="text-right">
                <p className="font-mono text-[13px] tabular-nums text-bone">
                  {hidden ? "••••" : formatUsd(usd)}
                </p>
                <p className="font-mono text-[11.5px] tabular-nums text-bone/40">
                  {hidden ? "••••" : `${formatAmount(a.balance, a.decimals)} ${a.symbol}`}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ShareBar({ pct }: { pct: number }) {
  return (
    <span aria-hidden className="block h-1 flex-1 bg-white/[0.07]">
      <span
        className="block h-full rounded-r-[1px] bg-mark/65"
        style={{ width: `${Math.max(pct, 1.5)}%` }}
      />
    </span>
  );
}

function Reading() {
  return (
    <div className="border-t border-white/[0.05] px-4 py-10 text-center">
      <p className="text-[13px] text-bone/55">Reading the chain.</p>
      <p className="mx-auto mt-1.5 max-w-[34ch] text-[12px] text-bone/35">
        Nothing about this account is stored between visits, so the whole book is
        rebuilt each time you sign in.
      </p>
    </div>
  );
}

/**
 * The first thing a new account sees, so it is written as an instruction rather
 * than as an apology. Being paid is the way in for this product, and the panel
 * that does it is on screen already.
 */
function Empty() {
  return (
    <div className="border-t border-white/[0.05] px-4 py-10 text-center">
      <p className="text-[13px] text-bone/55">Nothing here yet.</p>
      <p className="mx-auto mt-1.5 max-w-[34ch] text-[12px] text-bone/35">
        Share the payment address beside this panel and whatever arrives shows up
        here.
      </p>
    </div>
  );
}
