// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseScript} from "./base/BaseScript.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IV4Router} from "@uniswap/v4-periphery/src/interfaces/IV4Router.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";

contract SimulateLVR is BaseScript {
    function run() external {
        deployRouter();

        uint256 whaleKey = vm.envUint("WHALE_PRIVATE_KEY");
        uint256 botKey = vm.envUint("BOT_PRIVATE_KEY");

        // 1. Whale Move (Moves the Price)
        vm.startBroadcast(whaleKey);
        activeNetworkConfig.token0.approve(address(swapRouter), type(uint256).max);

        // Exact Input Swap (100 tokens)
        swapRouter.swapExactTokensForTokens({
            amountIn: 100 ether,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: getPoolKey(), // Helper to rebuild your PoolKey
            hookData: "",
            receiver: vm.addr(whaleKey),
            deadline: block.timestamp
        });
        vm.stopBroadcast();

        // 2. Arb Bot (The Trap)
        vm.startBroadcast(botKey);
        activeNetworkConfig.token0.approve(address(swapRouter), type(uint256).max);

        swapRouter.swapExactTokensForTokens({
            amountIn: 25 ether,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: getPoolKey(),
            hookData: "",
            receiver: vm.addr(botKey),
            deadline: block.timestamp
        });
        vm.stopBroadcast();
    }

    function getPoolKey() internal view returns (PoolKey memory) {
        return PoolKey({
            currency0: Currency.wrap(address(activeNetworkConfig.token0)),
            currency1: Currency.wrap(address(activeNetworkConfig.token1)),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(activeNetworkConfig.hookAddress)
        });
    }
}
