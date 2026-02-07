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

contract LiquidityDepthRiskHook is BaseHook {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    // --- Configuration ---
    uint24 public constant BASE_FEE = 3000; // 0.30%
    int24 public constant TICK_DIVERGENCE_LIMIT = 10; // ~0.1% before scaling kicks in

    // threshold: Swaps smaller than 10 tokens (adj. decimals) are "Retail"
    uint256 public constant RETAIL_THRESHOLD = 10 ether;

    struct Observation {
        uint32 timestamp;
        int24 lastTick;
    }

    mapping(PoolId => Observation) public observations;

    constructor(IPoolManager _poolManager) BaseHook(_poolManager) {}

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: true,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: true,
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
        observations[key.toId()] = Observation({timestamp: uint32(block.timestamp), lastTick: tick});
        return BaseHook.afterInitialize.selector;
    }

    function _beforeSwap(address, PoolKey calldata key, SwapParams calldata params, bytes calldata)
        internal
        view
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        // 1. Check if retail
        // amountSpecified is negative for exact-input (selling to pool)
        uint256 absAmount =
            params.amountSpecified < 0 ? uint256(-params.amountSpecified) : uint256(params.amountSpecified);
        if (absAmount < RETAIL_THRESHOLD) {
            return (
                BaseHook.beforeSwap.selector,
                BeforeSwapDeltaLibrary.ZERO_DELTA,
                BASE_FEE | LPFeeLibrary.OVERRIDE_FEE_FLAG
            );
        }

        PoolId poolId = key.toId();
        Observation memory last = observations[poolId];
        (, int24 currentTick,,) = poolManager.getSlot0(poolId);

        int24 divergence = currentTick > last.lastTick ? currentTick - last.lastTick : last.lastTick - currentTick;

        uint24 feeToCharge = BASE_FEE;
        if (divergence > TICK_DIVERGENCE_LIMIT) {
            // SCALE THE FEE: 1 tick is roughly 1 basis point (0.01%)
            // If price moves 15% (1500 ticks), we want a ~15% fee to stop arb profit.
            feeToCharge = uint24(divergence * 10); // 1 tick = 10 pips (0.10%)

            // Cap the fee at 90% to avoid total pool lockout
            if (feeToCharge > 900000) feeToCharge = 900000;
        }

        return
            (
                BaseHook.beforeSwap.selector,
                BeforeSwapDeltaLibrary.ZERO_DELTA,
                feeToCharge | LPFeeLibrary.OVERRIDE_FEE_FLAG
            );
    }

    function _afterSwap(address, PoolKey calldata key, SwapParams calldata, BalanceDelta, bytes calldata)
        internal
        override
        returns (bytes4, int128)
    {
        PoolId poolId = key.toId();
        (, int24 tick,,) = poolManager.getSlot0(poolId);
        observations[poolId] = Observation({timestamp: uint32(block.timestamp), lastTick: tick});
        return (BaseHook.afterSwap.selector, 0);
    }
}
