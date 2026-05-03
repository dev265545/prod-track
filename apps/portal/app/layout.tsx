import type { Metadata } from "next";
import { Newsreader, Syne } from "next/font/google";

import "./globals.css";

const display = Syne({
  subsets: ["latin"],
  variable: "--font-head",
  display: "swap",
});

const body = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-body",
  display: "swap",
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "Access",
  description: "Download",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="grain font-sans">{children}</body>
    </html>
  );
}
