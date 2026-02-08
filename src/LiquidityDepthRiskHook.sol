// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseHook} from "@openzeppelin/uniswap-hooks/src/base/BaseHook.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager, SwapParams} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {console} from "forge-std/console.sol";

contract LiquidityDepthRiskHook is BaseHook {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    // --- Config ---
    uint24 public constant BASE_FEE = 3000; // 0.30%
    uint256 public constant RETAIL_THRESHOLD = 1 ether; // Trades below this are "Retail"
    int24 public constant DIVERGENCE_LIMIT = 60; // ~0.6% price move is "safe"

    struct Snapshot {
        uint256 lastBlock;
        int24 startTick; // The price at the START of the block
    }

    mapping(PoolId => Snapshot) public snapshots;

    constructor(IPoolManager _poolManager) BaseHook(_poolManager) {}

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: true,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true, // Calculate Fee
            afterSwap: true, // Update Oracle (Lazy)
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    function _afterInitialize(address, PoolKey calldata key, uint160, int24 tick) internal override returns (bytes4) {
        if (!LPFeeLibrary.isDynamicFee(key.fee)) revert("Pool must be dynamic fee");
        // Initialize snapshot
        snapshots[key.toId()] = Snapshot({lastBlock: block.number, startTick: tick});
        return BaseHook.afterInitialize.selector;
    }

    function _beforeSwap(address, PoolKey calldata key, SwapParams calldata params, bytes calldata)
        internal
        view
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        PoolId poolId = key.toId();
        Snapshot memory snap = snapshots[poolId];
        (, int24 currentTick,,) = poolManager.getSlot0(poolId);

        // 1. Identify the Reference Price
        // If this is the first swap of the block, the reference IS the current price.
        // If this is the 2nd+ swap, the reference is the price from the start of the block.
        int24 referenceTick = (block.number > snap.lastBlock) ? currentTick : snap.startTick;

        // 2. Check Retail Exemption
        uint256 absAmount =
            params.amountSpecified < 0 ? uint256(-params.amountSpecified) : uint256(params.amountSpecified);
        if (absAmount < RETAIL_THRESHOLD) {
            return (
                BaseHook.beforeSwap.selector,
                BeforeSwapDeltaLibrary.ZERO_DELTA,
                BASE_FEE | LPFeeLibrary.OVERRIDE_FEE_FLAG
            );
        }

        // 3. Calculate Divergence (Volatility)
        int24 divergence = currentTick > referenceTick ? currentTick - referenceTick : referenceTick - currentTick;

        // 4. Determine Fee
        uint24 fee = BASE_FEE;

        // If price has moved significantly within this block (LVR risk)
        if (divergence > DIVERGENCE_LIMIT) {
            // SCALAR FEE: 1 tick divergence adds 0.05% fee
            // 100 ticks -> 1% fee, 200 ticks -> 2% fee, etc.
            // Example: If divergence is 100 ticks, fee = 3000 + (100 * 50) = 3500 (0.35%)
            fee = uint24(BASE_FEE + uint24(divergence * 100)); // 100 represents 0.01% fee increase per tick of divergence

            console.log("Initial fee based on divergence: ", fee);

            // Safety Cap: 50%
            if (fee > 500000) fee = 500000;
            // Floor: Don't go below Base Fee
            if (fee < BASE_FEE) fee = BASE_FEE;

            console.log("Divergence Detected: ", int256(divergence));
            console.log("Fee is: ", fee);
        }

        console.log("Fee is: ", fee);
        console.log("Applying dynamic fee. Divergence: ", int256(divergence));
        console.log("Reference tick: ", referenceTick);
        console.log("Current tick: ", currentTick);

        return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, fee | LPFeeLibrary.OVERRIDE_FEE_FLAG);
    }

    function _afterSwap(address, PoolKey calldata key, SwapParams calldata, BalanceDelta, bytes calldata)
        internal
        override
        returns (bytes4, int128)
    {
        PoolId poolId = key.toId();
        Snapshot storage snap = snapshots[poolId];

        // LAZY UPDATE: We only update the 'startTick' when we see a NEW block.
        // This ensures that for the duration of a block, 'startTick' remains constant
        // acting as a stable anchor to detect volatility.
        if (block.number > snap.lastBlock) {
            (, int24 tick,,) = poolManager.getSlot0(poolId);
            snap.startTick = tick; // Reset anchor for the NEXT block
            snap.lastBlock = block.number;
        }

        return (BaseHook.afterSwap.selector, 0);
    }
}
