import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { Providers } from "@/lib/providers";
import { Shell } from "@/components/shell";
import "@/styles/globals.css";
export const metadata: Metadata = {
  title: { default: "LedgerRoot — Document review", template: "%s · LedgerRoot" },
  description:
    "Receipt and invoice review with source evidence, correction requests, and preserved document history. Human approval required.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={GeistSans.variable}>
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
