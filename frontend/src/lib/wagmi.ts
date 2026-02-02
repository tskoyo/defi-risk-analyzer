import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { getChains } from "@/lib/chains";

export const chains = getChains();
const url =
  process.env.NEXT_PUBLIC_RPC_URL ?? chains[0].rpcUrls.default.http[0];

export const wagmiConfig = createConfig({
  chains,
  connectors: [injected({ shimDisconnect: true })],
  transports: { [chains[0].id]: http(url) },
  ssr: true,
});
