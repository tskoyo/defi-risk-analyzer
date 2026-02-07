import { useReadContracts } from "wagmi";
import {
  STATE_VIEW_ADDRESS,
  STATE_VIEW_ABI,
  POOL_ID,
} from "@/config/contracts";

export function usePoolState() {
  const result = useReadContracts({
    contracts: [
      {
        address: STATE_VIEW_ADDRESS,
        abi: STATE_VIEW_ABI,
        functionName: "getSlot0",
        args: [POOL_ID],
      },
      {
        address: STATE_VIEW_ADDRESS,
        abi: STATE_VIEW_ABI,
        functionName: "getLiquidity",
        args: [POOL_ID],
      },
    ],
    query: {
      refetchInterval: 3000,
    },
  });

  const slot0 = result.data?.[0]?.result as
    | [bigint, number, number, number]
    | undefined;

  const liquidity = result.data?.[1]?.result as bigint | undefined;

  return {
    isLoading: result.isLoading,
    isError: result.isError,
    tick: slot0 ? Number(slot0[1]) : null,
    sqrtPriceX96: slot0 ? slot0[0].toString() : null,
    liquidity: liquidity ?? null,
    refetch: result.refetch,
  };
}
