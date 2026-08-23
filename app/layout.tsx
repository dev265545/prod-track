import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { LanguageProvider } from "@/components/language-provider";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { FirstRunGuard } from "@/components/FirstRunGuard";
import { DatabaseConnectedGuard } from "@/components/DatabaseConnectedGuard";

import "./globals.css";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-body",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Factory",
  description: "Production tracking - offline first",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="bg-background text-foreground min-h-screen font-sans">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <LanguageProvider>
            <FirstRunGuard>
              <DatabaseConnectedGuard>
                <SidebarProvider className="no-print">
                  {children}
                  <Toaster />
                </SidebarProvider>
              </DatabaseConnectedGuard>
            </FirstRunGuard>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
