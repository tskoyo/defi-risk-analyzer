import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { AppToaster } from "@/app/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { Web3Provider } from "@/components/web3-provider";

export const metadata: Metadata = {
  title: "Liquidity Depth Risk Pool",
  description: "Frontend for swap preflight + risk preview",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <Web3Provider>
            <AppShell>
              {children}
              <AppToaster />
            </AppShell>
          </Web3Provider>
        </ThemeProvider>
      </body>
    </html>
  );
}
