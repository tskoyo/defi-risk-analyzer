// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseTest} from "./utils/BaseTest.sol";
import {Test} from "forge-std/Test.sol";
import {Deployers} from "./utils/Deployers.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";
import {LiquidityDepthRiskHook} from "../src/LiquidityDepthRiskHook.sol";

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";

contract LiquidityDepthRiskHookTest is BaseTest {
    Currency currency0;
    Currency currency1;
    LiquidityDepthRiskHook hook;
    PoolKey poolKey;
    address hookAddress;

    function setUp() public {
        // 1. Initialize v4 protocol artifacts
        deployArtifactsAndLabel();
        (currency0, currency1) = deployCurrencyPair();

        // 2. Define the flags based on your hook's getHookPermissions()
        // Your hook uses: afterInitialize, beforeSwap, and afterSwap
        uint160 flags = uint160(Hooks.AFTER_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG);

        // 3. Deploy the hook code to that specific address
        // Note: The template usually namespaces the hook to avoid collisions
        address hookAddress = address(flags ^ (0x4444 << 144));
        deployCodeTo("LiquidityDepthRiskHook.sol:LiquidityDepthRiskHook", abi.encode(poolManager), hookAddress);
        hook = LiquidityDepthRiskHook(hookAddress);

        // 4. Initialize the pool
        poolKey = PoolKey({
            currency0: currency0, currency1: currency1, fee: LPFeeLibrary.DYNAMIC_FEE_FLAG, tickSpacing: 60, hooks: hook
        });

        poolManager.initialize(poolKey, Constants.SQRT_PRICE_1_1);
    }

    function test_retailSwapFlow() public {
        // Small swap should use BASE_FEE
        swapRouter.swapExactTokensForTokens({
            amountIn: 1 ether, // Under RETAIL_THRESHOLD
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            hookData: "",
            receiver: address(this),
            deadline: block.timestamp
        });
    }
}
