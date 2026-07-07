import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.joinsomnia.app"),
  title: {
    default: "Somnia Points | Account system",
    template: "%s | Somnia"
  },
  description: "Somnia Points is an account and participation record system for the Somnia community.",
  openGraph: {
    title: "Somnia Points | Account system",
    description: "Create a wallet account, verify email, complete profile, check in, and track Somnia Points.",
    url: "https://www.joinsomnia.app",
    siteName: "Somnia",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Somnia Points | Account system",
    description: "Somnia Points account, check-in, referral, and ledger system."
  }
};

export default function RootLayout({
  children
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
