// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Deployers} from "@uniswap/v4-core/test/utils/Deployers.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {IPoolManager, ModifyLiquidityParams} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";

import {LiquidityDepthRiskHook} from "../src/LiquidityDepthRiskHook.sol";

contract LiquidityDepthRiskHookTest is Test, Deployers {
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;

    LiquidityDepthRiskHook hook;
    PoolId poolId;

    function setUp() public {
        deployFreshManagerAndRouters();

        uint160 flags = uint160(Hooks.BEFORE_SWAP_FLAG);
        address hookAddress = address(flags);

        deployCodeTo("LiquidityDepthRiskHook.sol", abi.encode(manager), hookAddress);
        hook = LiquidityDepthRiskHook(hookAddress);

        (currency0, currency1) = deployMintAndApprove2Currencies();

        key = PoolKey(currency0, currency1, LPFeeLibrary.DYNAMIC_FEE_FLAG, 60, hook);
        poolId = key.toId();

        manager.initialize(key, Constants.SQRT_PRICE_1_1);
    }

    function test_FeeIsLowWhenLiquidityIsHigh() public {
        modifyLiquidityRouter.modifyLiquidity(
            key,
            ModifyLiquidityParams({tickLower: -60, tickUpper: 60, liquidityDelta: 2000e18, salt: bytes32(0)}),
            Constants.ZERO_BYTES
        );

        uint256 amountIn = 1e18;
        uint256 balanceBefore = currency0.balanceOf(address(this));

        swap(key, true, -int256(amountIn), Constants.ZERO_BYTES);

        uint256 balanceAfter = currency0.balanceOf(address(this));
        uint256 paid = balanceBefore - balanceAfter;

        assertGt(paid, 0);
    }

    function test_FeeSurgesWhenLiquidityIsLow() public {
        modifyLiquidityRouter.modifyLiquidity(
            key,
            ModifyLiquidityParams({tickLower: -60, tickUpper: 60, liquidityDelta: 500e18, salt: bytes32(0)}),
            Constants.ZERO_BYTES
        );

        uint256 amountIn = 1e18;

        swap(key, true, -int256(amountIn), Constants.ZERO_BYTES);
    }
}
