// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import "forge-std/console2.sol";

import {DemoBatcher, ISwapRouter} from "../src/DemoBatcher.sol";

contract DeployBatcher is Script {
    function run() external returns (DemoBatcher batcher) {
        address routerAddr = vm.envAddress("NEXT_PUBLIC_SWAP_ROUTER_SEPOLIA_BASE_ADDR");

        vm.startBroadcast();
        batcher = new DemoBatcher(ISwapRouter(routerAddr));
        vm.stopBroadcast();

        console2.log("DemoBatcher deployed at:", address(batcher));
    }
}
