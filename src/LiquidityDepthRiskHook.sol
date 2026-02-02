// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseHook} from "@openzeppelin/uniswap-hooks/src/base/BaseHook.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager, SwapParams} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";

contract LiquidityDepthRiskHook is BaseHook {
    using PoolIdLibrary for PoolKey;
    using LPFeeLibrary for uint24;

    // --- Configuration --- //
    uint128 public constant CRITICAL_DEPTH_THRESHOLD = 500 ether; // Example: 500 ETH worth of liquidity

    // Fee Config (Pips: 10000 = 1%)
    uint24 public constant STANDARD_FEE = 3000; // 0.30%
    uint24 public constant RISK_FEE = 50000; // 5.00% "Surge Pricing"

    constructor(IPoolManager _poolManager) BaseHook(_poolManager) {}

    // Required Override: Set Permissions
    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true, // <--- CRITICAL: We need this to check depth and override fees
            afterSwap: false,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    // --- Core Risk Logic --- //
    function _beforeSwap(address, PoolKey calldata key, SwapParams calldata, bytes calldata)
        internal
        view
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        // 1. Get the current liquidity active in the tick
        uint128 currentLiquidity = poolManager.getLiquidity(key.toId());

        // 2. Assess Risk: Is the pool too shallow?
        uint24 feeToCharge;

        if (currentLiquidity < CRITICAL_DEPTH_THRESHOLD) {
            // RISK MODE: High fee to discourage toxic flow and compensate LPs
            feeToCharge = RISK_FEE;
        } else {
            // SAFE MODE: Standard fee
            feeToCharge = STANDARD_FEE;
        }

        // 3. Return the dynamic fee override
        // The 2nd return value (BeforeSwapDelta) is zero because we aren't modifying flow, just fees.
        // The 3rd return value is the fee override (in pips) with the OVERRIDE_FEE_FLAG bit set.
        return
            (
                BaseHook.beforeSwap.selector,
                BeforeSwapDeltaLibrary.ZERO_DELTA,
                feeToCharge | LPFeeLibrary.OVERRIDE_FEE_FLAG
            );
    }
}
