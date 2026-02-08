import { parseAbi, keccak256, encodeAbiParameters } from "viem";
import { base, baseSepolia } from "viem/chains";

const ZERO = "0x0000000000000000000000000000000000000000" as const;

export const DYNAMIC_FEE_FLAG = 0x800000;
export const POOL_FEE = DYNAMIC_FEE_FLAG;

export const BASE_FEE = 3000;
export const PANIC_FEE = 50000;

type Addrs = {
  poolManager: `0x${string}`;
  hook: `0x${string}`;
  token0: `0x${string}`;
  token1: `0x${string}`;
  swapRouter: `0x${string}`;
  stateView: `0x${string}`;
};

const ADDRS_BY_CHAIN: Record<number, Addrs> = {
  [baseSepolia.id]: {
    poolManager: (process.env.NEXT_PUBLIC_POOL_MANAGER_SEPOLIA_BASE_ADDR ??
      process.env.NEXT_PUBLIC_POOL_MANAGER_ADDR ??
      ZERO) as `0x${string}`,
    hook: (process.env.NEXT_PUBLIC_HOOK_SEPOLIA_BASE_ADDR ??
      ZERO) as `0x${string}`,
    token0: (process.env.NEXT_PUBLIC_TOKEN0_SEPOLIA_BASE_ADDR ??
      process.env.NEXT_PUBLIC_TOKEN0_ADDR ??
      ZERO) as `0x${string}`,
    token1: (process.env.NEXT_PUBLIC_TOKEN1_SEPOLIA_BASE_ADDR ??
      process.env.NEXT_PUBLIC_TOKEN1_ADDR ??
      ZERO) as `0x${string}`,
    swapRouter: (process.env.NEXT_PUBLIC_SWAP_ROUTER_SEPOLIA_BASE_ADDR ??
      ZERO) as `0x${string}`,
    stateView: (process.env.NEXT_PUBLIC_STATE_VIEW_SEPOLIA_BASE_ADDR ??
      ZERO) as `0x${string}`,
  },

  [base.id]: {
    poolManager: (process.env.NEXT_PUBLIC_POOL_MANAGER_BASE_ADDR ??
      process.env.NEXT_PUBLIC_POOL_MANAGER_ADDR ??
      ZERO) as `0x${string}`,
    hook: (process.env.NEXT_PUBLIC_HOOK_BASE_ADDR ?? ZERO) as `0x${string}`,
    token0: (process.env.NEXT_PUBLIC_TOKEN0_BASE_ADDR ??
      process.env.NEXT_PUBLIC_TOKEN0_ADDR ??
      ZERO) as `0x${string}`,
    token1: (process.env.NEXT_PUBLIC_TOKEN1_BASE_ADDR ??
      process.env.NEXT_PUBLIC_TOKEN1_ADDR ??
      ZERO) as `0x${string}`,
    swapRouter: (process.env.NEXT_PUBLIC_SWAP_ROUTER_BASE_ADDR ??
      ZERO) as `0x${string}`,
    stateView: (process.env.NEXT_PUBLIC_STATE_VIEW_BASE_ADDR ??
      ZERO) as `0x${string}`,
  },
};

export function getAddrs(chainId: number): Addrs {
  return ADDRS_BY_CHAIN[chainId] ?? ADDRS_BY_CHAIN[baseSepolia.id];
}

export function getPoolKey(chainId: number) {
  const a = getAddrs(chainId);
  return {
    currency0: a.token0,
    currency1: a.token1,
    fee: POOL_FEE,
    tickSpacing: 60,
    hooks: a.hook,
  } as const;
}

export function getPoolId(chainId: number) {
  const key = getPoolKey(chainId);
  return keccak256(
    encodeAbiParameters(
      [
        {
          type: "tuple",
          components: [
            { name: "currency0", type: "address" },
            { name: "currency1", type: "address" },
            { name: "fee", type: "uint24" },
            { name: "tickSpacing", type: "int24" },
            { name: "hooks", type: "address" },
          ],
        },
      ],
      [key],
    ),
  );
}

export const SWAP_ROUTER_ABI = parseAbi([
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, bool zeroForOne, (address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bytes hookData, address receiver, uint256 deadline) external payable returns (uint256 amountOut)",
]);

export const HOOK_ABI = parseAbi([
  "function snapshots(bytes32) view returns (uint256 lastBlock, int24 startTick)",
  "function RETAIL_THRESHOLD() view returns (uint256)",
  "function DIVERGENCE_LIMIT() view returns (int24)",
  "function BASE_FEE() view returns (uint24)",
]);

export const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
]);

export const STATE_VIEW_ABI = parseAbi([
  "function getSlot0(bytes32 poolId) external view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) external view returns (uint128 liquidity)",
]);
