import { useMemo } from "react";
import { useReadContracts, useChainId } from "wagmi";
import { STATE_VIEW_ABI, getAddrs, getPoolId } from "@/config/contracts";

const ZERO = "0x0000000000000000000000000000000000000000" as const;

export function usePoolState() {
  const chainId = useChainId();
  const addrs = useMemo(() => getAddrs(chainId), [chainId]);
  const poolId = useMemo(() => getPoolId(chainId), [chainId]);

  const enabled = addrs.stateView !== ZERO;
  const result = useReadContracts({
    contracts: [
      {
        address: addrs.stateView,
        abi: STATE_VIEW_ABI,
        functionName: "getSlot0",
        args: [poolId],
      },
      {
        address: addrs.stateView,
        abi: STATE_VIEW_ABI,
        functionName: "getLiquidity",
        args: [poolId],
      },
    ],
    query: {
      enabled,
      refetchInterval: 3000,
    },
  });

  const slot0 = result.data?.[0]?.result as
    | readonly [bigint, bigint, bigint, bigint]
    | undefined;

  const protocolFee = slot0 ? Number(slot0[2]) : null;
  const lpFee = slot0 ? Number(slot0[3]) : null;

  const liquidity = result.data?.[1]?.result as bigint | undefined;

  return {
    isLoading: result.isLoading,
    isError: result.isError,
    tick: slot0 ? Number(slot0[1]) : null,
    sqrtPriceX96: slot0 ? slot0[0].toString() : null,
    protocolFee,
    lpFee,
    liquidity: liquidity ?? null,
    refetch: result.refetch,
  };
}
