import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.joinsomnia.app"),
  title: {
    default: "Somnia | Dreams with accountable deadlines",
    template: "%s | Somnia"
  },
  description:
    "Somnia is a Web3 publishing layer for meaningful goals, transparent placements, and community signals.",
  openGraph: {
    title: "Somnia | Dreams with accountable deadlines",
    description:
      "Publish a dream, stake a deadline, and let progress earn the spotlight.",
    url: "https://www.joinsomnia.app",
    siteName: "Somnia",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Somnia | Dreams with accountable deadlines",
    description:
      "Publish a dream, stake a deadline, and let progress earn the spotlight."
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
