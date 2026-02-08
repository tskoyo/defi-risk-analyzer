import { base, baseSepolia } from "viem/chains";
import { defineChain, type Chain } from "viem";

export const anvil = defineChain({
  id: 31337,
  name: "Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["http://127.0.0.1:8545"] },
    public: { http: ["http://127.0.0.1:8545"] },
  },
});

function getSelectedChainId(): number {
  const raw = process.env.NEXT_PUBLIC_CHAIN_ID;
  const id = raw ? Number(raw) : baseSepolia.id;
  return Number.isFinite(id) ? id : baseSepolia.id;
}

function withEnvRpc(chain: Chain): Chain {
  const rpc =
    chain.id === baseSepolia.id
      ? process.env.NEXT_PUBLIC_RPC_SEPOLIA_BASE_URL
      : chain.id === base.id
        ? process.env.NEXT_PUBLIC_RPC_BASE_URL
        : undefined;

  if (!rpc) return chain;

  return {
    ...chain,
    rpcUrls: {
      default: { http: [rpc] },
      public: { http: [rpc] },
    },
  };
}

export function getChains() {
  const selected = getSelectedChainId();

  if (selected === anvil.id) return [anvil] as const;

  return [withEnvRpc(baseSepolia), withEnvRpc(base)] as const;
}
