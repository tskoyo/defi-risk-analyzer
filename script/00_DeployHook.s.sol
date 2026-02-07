// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";

import {LiquidityDepthRiskHook} from "../src/LiquidityDepthRiskHook.sol";

import {BaseScript} from "./base/BaseScript.sol";

import {console} from "forge-std/console.sol";

contract DeployHookScript is BaseScript {
    function run() external {
        uint160 flags = uint160(Hooks.AFTER_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG);

        bytes memory constructorArgs = abi.encode(activeNetworkConfig.poolManager);

        (address hookAddress, bytes32 salt) = HookMiner.find(
            0x4e59b44847b379578588920cA78FbF26c0B4956C,
            flags,
            type(LiquidityDepthRiskHook).creationCode,
            constructorArgs
        );

        // 4. Deploy
        vm.startBroadcast();
        LiquidityDepthRiskHook hook =
            new LiquidityDepthRiskHook{salt: salt}(IPoolManager(activeNetworkConfig.poolManager));
        require(address(hook) == hookAddress, "Address mismatch");
        vm.stopBroadcast();

        console.log("Deployed Hook at:", address(hook));
    }
}
