import { parseAbi, keccak256, encodeAbiParameters } from "viem";

export const POOL_MANAGER_ADDRESS = (process.env
  .NEXT_PUBLIC_POOL_MANAGER_ADDR ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;
export const HOOK_ADDRESS = (process.env.NEXT_PUBLIC_HOOK_ADDR ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;
export const TOKEN0_ADDRESS = (process.env.NEXT_PUBLIC_TOKEN0_ADDR ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;
export const TOKEN1_ADDRESS = (process.env.NEXT_PUBLIC_TOKEN1_ADDR ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;
export const SWAP_ROUTER_ADDRESS = (process.env.NEXT_PUBLIC_SWAP_ROUTER_ADDR ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const LIQUIDITY_RISK_THRESHOLD = BigInt("100000000000000000000");
export const TRADE_RISK_AMOUNT_THRESHOLD = BigInt("1000000000000000000000");

export const DYNAMIC_FEE_FLAG = 0x800000; // 8388608

export const BASE_FEE = 3000; // 0.30% (pentru UI + simRisk)
export const PANIC_FEE = 50000; // 5.00%  (pentru UI + simRisk)

export const POOL_FEE = DYNAMIC_FEE_FLAG;

export const POOL_KEY = {
  currency0: TOKEN0_ADDRESS,
  currency1: TOKEN1_ADDRESS,
  fee: POOL_FEE,
  tickSpacing: 60,
  hooks: HOOK_ADDRESS,
} as const;

export const POOL_ID = keccak256(
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
    [POOL_KEY],
  ),
);

export const SWAP_ROUTER_ABI = parseAbi([
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, bool zeroForOne, (address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bytes hookData, address receiver, uint256 deadline) external payable returns (uint256 amountOut)",
]);

export const HOOK_ABI = parseAbi([
  "error LvrBlocked(uint32 dt, int24 tickDiff, uint24 fee)",
  "function observations(bytes32) view returns (uint32 timestamp, int24 lastTick)",
  "function highFeeUntil(bytes32) view returns (uint32)",
  "function RETAIL_THRESHOLD() view returns (uint256)",
  "function BOT_AMOUNT_THRESHOLD() view returns (uint256)",
  "function BASE_FEE() view returns (uint24)",
]);

export const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
]);

export const STATE_VIEW_ADDRESS = (process.env.NEXT_PUBLIC_STATE_VIEW_ADDR ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const STATE_VIEW_ABI = parseAbi([
  "function getSlot0(bytes32 poolId) external view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) external view returns (uint128 liquidity)",
]);
