// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {MockToken} from "../src/MockToken.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";

import {Script, console2} from "forge-std/Script.sol";

contract DeployTokens is Script {
    function run() external {
        vm.startBroadcast();

        // Deploy Token 0
        MockToken token0 = new MockToken("TestToken0", "TK0");
        // Deploy Token 1
        MockToken token1 = new MockToken("TestToken1", "TK1");

        // Mint initial supply if needed for future pool use
        token0.mint(msg.sender, 1000e18);
        token1.mint(msg.sender, 1000e18);

        vm.stopBroadcast();

        console2.log("Token 0 Address:", address(token0));
        console2.log("Token 1 Address:", address(token1));
    }
}
