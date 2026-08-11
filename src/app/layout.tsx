import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { HudFrame } from "@/components/layout/hud-frame";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Copy here follows the house rule the dapp already follows: no em or en dashes
 * in anything rendered. Use two sentences, a comma, or the house middot.
 */
export const metadata: Metadata = {
  title: "Cowl · Get paid without showing an address",
  description:
    "Receive tokenized stock and tokens into a shielded balance. The payer is the only side that appears on chain.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/*
        The outer inset is padding here and not a margin on the frame. The frame
        fills a `min-h-full` body, and a margin on something already that tall
        adds to it, which puts a scrollbar on a page whose content fits.
      */}
      <body className="flex min-h-full flex-col bg-ink p-2 text-bone md:p-3">
        {/*
          The frame wraps everything, so the preloader, the login card and the
          balance screen are the same instrument with different contents rather
          than three pages that happen to look alike.

          The preloader used to be here too, as a global overlay that hid itself
          on a timer. It belongs to the flow instead: something has to happen
          when it finishes, and a layout that renders every route cannot be the
          thing that decides what comes next.
        */}
        <HudFrame>{children}</HudFrame>
      </body>
    </html>
  );
}
