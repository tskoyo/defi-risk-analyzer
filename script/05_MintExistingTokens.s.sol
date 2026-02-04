// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {MockToken} from "../src/MockToken.sol";
import {Script, console2} from "forge-std/Script.sol";

contract MintExistingTokens is Script {
    function run() external {
        // Retrieve the private key from your environment or interactive prompt
        vm.startBroadcast();

        // // Wrap the existing addresses in the MockToken interface
        address token0Addr = vm.envAddress("TOKEN0");
        address token1Addr = vm.envAddress("TOKEN1");
        address walletAddress = vm.envAddress("WALLET");

        MockToken token0 = MockToken(token0Addr);
        MockToken token1 = MockToken(token1Addr);

        // // Mint 1000 tokens to your wallet address
        token0.mint(walletAddress, 1000e18);
        token1.mint(walletAddress, 1000e18);

        vm.stopBroadcast();

        console2.log("Minted TK0 to:", walletAddress);
        console2.log("Minted TK1 to:", walletAddress);
    }
}
