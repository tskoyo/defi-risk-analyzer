// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseTest} from "./utils/BaseTest.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";
import {LiquidityDepthRiskHook} from "../src/LiquidityDepthRiskHook.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {EasyPosm} from "./utils/libraries/EasyPosm.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";
import {console} from "forge-std/console.sol";

contract LiquidityDepthRiskHookTest is BaseTest {
    using EasyPosm for IPositionManager;

    LiquidityDepthRiskHook hook;
    PoolKey poolKey;
    Currency currency0;
    Currency currency1;
    uint256 tokenId;

    function setUp() public {
        deployArtifactsAndLabel();
        (currency0, currency1) = deployCurrencyPair();

        uint160 flags = uint160(Hooks.AFTER_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG);
        address hookAddress = address(flags ^ (0x4444 << 144));
        deployCodeTo("LiquidityDepthRiskHook.sol:LiquidityDepthRiskHook", abi.encode(poolManager), hookAddress);
        hook = LiquidityDepthRiskHook(hookAddress);

        poolKey = PoolKey({
            currency0: currency0, currency1: currency1, fee: LPFeeLibrary.DYNAMIC_FEE_FLAG, tickSpacing: 60, hooks: hook
        });

        poolManager.initialize(poolKey, Constants.SQRT_PRICE_1_1);

        int24 tickLower = TickMath.minUsableTick(60);
        int24 tickUpper = TickMath.maxUsableTick(60);
        uint128 liquidityAmount = 1000 ether;

        (uint256 amount0Expected, uint256 amount1Expected) = LiquidityAmounts.getAmountsForLiquidity(
            Constants.SQRT_PRICE_1_1,
            TickMath.getSqrtPriceAtTick(tickLower),
            TickMath.getSqrtPriceAtTick(tickUpper),
            liquidityAmount
        );

        (tokenId,) = positionManager.mint(
            poolKey,
            tickLower,
            tickUpper,
            liquidityAmount,
            amount0Expected + 1,
            amount1Expected + 1,
            address(this),
            block.timestamp,
            ""
        );
    }

    function test_panicFee_DetectsToxicFlow() public {
        // 1. Retail Swap (Small)
        // Should pay BASE_FEE (3000)
        uint256 amountInRetail = 0.1 ether;
        vm.label(address(this), "Retail Trader");
        swapRouter.swapExactTokensForTokens({
            amountIn: amountInRetail,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            hookData: "",
            receiver: address(this),
            deadline: block.timestamp
        });

        uint256 currency1BalanceAfter = currency1.balanceOf(address(this));

        // require(retailFee == 3000, "Retail swap should pay base fee");

        // 2. Whale Swap (Moves the Price) - SAME BLOCK
        // This simulates a large market move.
        // It pays BASE_FEE because it is the *first* large move in the block.
        address whaleUser = makeAddr("whaleAccount");
        vm.label(whaleUser, "Whale account");

        deal(Currency.unwrap(currency0), whaleUser, 1000 ether);
        deal(Currency.unwrap(currency1), whaleUser, 1000 ether);

        vm.startPrank(whaleUser);

        MockERC20(Currency.unwrap(currency0)).approve(address(swapRouter), type(uint256).max);
        MockERC20(Currency.unwrap(currency1)).approve(address(swapRouter), type(uint256).max);

        swapRouter.swapExactTokensForTokens({
            amountIn: 100 ether, // Big swap to move ticks
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            hookData: "",
            receiver: whaleUser,
            deadline: block.timestamp
        });

        vm.stopPrank();

        // 3. Arbitrageur / Follow-up Swap - SAME BLOCK
        // The price is now far from 'startTick'. Divergence is high.
        // This user should get hit with a massive fee.
        address arbBot = makeAddr("arbBot");
        vm.label(arbBot, "Arb bot");

        deal(Currency.unwrap(currency0), arbBot, 1000 ether);
        deal(Currency.unwrap(currency1), arbBot, 1000 ether);

        vm.startPrank(arbBot);

        MockERC20(Currency.unwrap(currency0)).approve(address(swapRouter), type(uint256).max);
        MockERC20(Currency.unwrap(currency1)).approve(address(swapRouter), type(uint256).max);

        uint256 balBefore = currency0.balanceOf(address(poolManager));

        swapRouter.swapExactTokensForTokens({
            amountIn: 25 ether,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            hookData: "",
            receiver: arbBot,
            deadline: block.timestamp
        });
    }
}
