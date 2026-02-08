import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { getChains } from "@/lib/chains";

export const chains = getChains();

export const wagmiConfig = createConfig({
  chains,
  connectors: [injected({ shimDisconnect: true })],
  transports: Object.fromEntries(
    chains.map((c) => [c.id, http(c.rpcUrls.default.http[0])]),
  ),
  ssr: true,
});
