import { useReadContracts } from "wagmi";
import {
  POOL_MANAGER_ADDRESS,
  POOL_MANAGER_ABI,
  POOL_KEY,
} from "@/config/contracts";

export function usePoolState() {
  const result = useReadContracts({
    contracts: [
      {
        address: POOL_MANAGER_ADDRESS,
        abi: POOL_MANAGER_ABI,
        functionName: "getSlot0",
        args: [POOL_KEY],
      },
      {
        address: POOL_MANAGER_ADDRESS,
        abi: POOL_MANAGER_ABI,
        functionName: "getLiquidity",
        args: [POOL_KEY],
      },
    ],
    query: {
      refetchInterval: 3000,
    },
  });

  const slot0 = result.data?.[0].result as
    | [bigint, number, number, number]
    | undefined;

  const liquidity = result.data?.[1].result as bigint | undefined;

  return {
    isLoading: result.isLoading,
    isError: result.isError,
    tick: slot0 ? Number(slot0[1]) : null,
    sqrtPriceX96: slot0 ? slot0[0].toString() : null,
    liquidity: liquidity ? liquidity : null,
    refetch: result.refetch,
  };
}
