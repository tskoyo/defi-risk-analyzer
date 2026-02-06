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

contract LiquidityDepthRiskHook is BaseHook {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    uint256 public constant LIQUIDITY_RISK_THRESHOLD = 1000e18;

    // LVR Protection Constants
    int24 public constant TICK_DIVERGENCE_THRESHOLD = 50; // ~0.5% divergence triggers protection
    uint24 public constant BASE_FEE = 3000; // 0.30%
    uint24 public constant PANIC_FEE = 50000; // 5.00% (Capture the Arb)

    struct Observation {
        uint32 timestamp;
        int56 tickCumulative;
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
        observations[key.toId()] = Observation({timestamp: uint32(block.timestamp), tickCumulative: 0});
        return BaseHook.afterInitialize.selector;
    }

    function _beforeSwap(address, PoolKey calldata key, SwapParams calldata, bytes calldata)
        internal
        view
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        // Now this works because we are using StateLibrary
        PoolId poolId = key.toId();
        (, int24 currentTick,,) = poolManager.getSlot0(poolId);
        Observation memory last = observations[poolId];

        uint24 feeToCharge = BASE_FEE;
        uint32 timeDelta = uint32(block.timestamp) - last.timestamp;

        if (timeDelta > 0) {
            int24 historicalTick = int24(last.tickCumulative / int56(int32(timeDelta)));
            int24 divergence =
                currentTick > historicalTick ? currentTick - historicalTick : historicalTick - currentTick;

            if (divergence > TICK_DIVERGENCE_THRESHOLD) {
                feeToCharge = PANIC_FEE;
            }
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
        Observation storage last = observations[poolId];
        uint32 now32 = uint32(block.timestamp);

        if (now32 > last.timestamp) {
            last.tickCumulative += int56(tick) * int32(now32 - last.timestamp);
            last.timestamp = now32;
        }

        return (BaseHook.afterSwap.selector, 0);
    }
}
