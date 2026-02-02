import * as React from "react";
import { ConnectButton } from "@/components/connect-button";
import { ThemeSwitch } from "@/components/theme-switch";

export function AppShell({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-dvh">
            <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
                <div className="flex h-14 items-center justify-between px-4">
                    <div className="text-sm font-semibold">Risk Hook Demo</div>

                    <div className="flex items-center gap-4">
                        <ThemeSwitch />
                        <ConnectButton />
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
        </div>
    );
}
