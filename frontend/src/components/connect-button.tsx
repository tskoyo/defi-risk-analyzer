"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
    useConnection,
    useConnect,
    useDisconnect,
    useSwitchChain,
    useConnectors,
} from "wagmi";
import { chains } from "@/lib/wagmi";

function shortAddr(a?: string) {
    if (!a) return "";
    return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function ConnectButton() {
    const { address, status, chainId, isConnected, isDisconnected } = useConnection();

    const connectors = useConnectors();
    const connect = useConnect();
    const disconnect = useDisconnect();
    const switchChain = useSwitchChain();

    const preferredConnector = React.useMemo(() => {
        return (
            connectors.find((c) => c.id === "metaMask" || c.name.toLowerCase().includes("metamask")) ??
            connectors[0]
        );
    }, [connectors]);

    if (isDisconnected || status === "connecting" || status === "reconnecting") {
        const disabled = !preferredConnector || connect.isPending;

        return (
            <div className="flex items-center gap-2">
                <Button
                    size="sm"
                    variant="secondary"
                    className="cursor-pointer"
                    disabled={disabled}
                    onClick={() => connect.mutate({ connector: preferredConnector })}
                >
                    {connect.isPending ? "Connecting…" : "Connect Wallet"}
                </Button>

                {connect.error ? (
                    <span className="text-xs text-destructive">{connect.error.message}</span>
                ) : null}
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
                {chains.map((c) => (
                    <Button
                        key={c.id}
                        size="sm"
                        variant={chainId === c.id ? "secondary" : "outline"}
                        className="cursor-pointer"
                        disabled={switchChain.isPending || chainId === c.id}
                        onClick={() => switchChain.mutate({ chainId: c.id })}
                        title={c.name}
                    >
                        {c.name}
                    </Button>
                ))}
            </div>

            <Button size="sm" variant="secondary" disabled>
                {shortAddr(address)}
            </Button>

            <Button size="sm" variant="ghost" className="cursor-pointer" onClick={() => disconnect.mutate()}>
                Disconnect
            </Button>
        </div>
    );
}
