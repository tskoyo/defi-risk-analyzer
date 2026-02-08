// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {IPermit2} from "permit2/src/interfaces/IPermit2.sol";

import {IUniswapV4Router04} from "hookmate/interfaces/router/IUniswapV4Router04.sol";
import {AddressConstants} from "hookmate/constants/AddressConstants.sol";

import {Deployers} from "test/utils/Deployers.sol";

/// @notice Shared configuration between scripts
contract BaseScript is Script, Deployers {
    address immutable deployerAddress;
    uint24 public constant BASE_FEE = 3000; // 0.30%
    int24 public constant TICK_DIVERGENCE_LIMIT = 10; // ~0.1% before scaling kicks in

    struct NetworkConfig {
        address poolManager;
        IERC20 token0;
        IERC20 token1;
        IHooks hookAddress;
    }

    NetworkConfig public activeNetworkConfig;

    Currency immutable currency0;
    Currency immutable currency1;

    constructor() {
        // Make sure artifacts are available, either deploy or configure.
        deployArtifacts();

        if (block.chainid == 31337) {
            activeNetworkConfig = NetworkConfig({
                poolManager: address(poolManager),
                token0: activeNetworkConfig.token0,
                token1: activeNetworkConfig.token1,
                hookAddress: activeNetworkConfig.hookAddress
            });
        } else if (block.chainid == 84532) {
            activeNetworkConfig = getBaseSepoliaConfig();
        } else if (block.chainid == 8453) {
            activeNetworkConfig = getBaseMainnetConfig();
        } else {
            revert("Unsupported network");
        }

        deployerAddress = getDeployer();

        (currency0, currency1) = getCurrencies();

        vm.label(deployerAddress, "Deployer");
        vm.label(address(permit2), "Permit2");
        vm.label(address(activeNetworkConfig.poolManager), "V4PoolManager");
        vm.label(address(positionManager), "V4PositionManager");
        vm.label(address(swapRouter), "V4SwapRouter");

        vm.label(address(activeNetworkConfig.token0), "Currency0");
        vm.label(address(activeNetworkConfig.token1), "Currency1");

        vm.label(address(activeNetworkConfig.hookAddress), "HookContract");
    }

    function getBaseMainnetConfig() public view returns (NetworkConfig memory) {
        return NetworkConfig({
            poolManager: AddressConstants.getPoolManagerAddress(8453),
            token0: IERC20(0x6e50537f918fF132E4147a8d464ddb37FC7DAb5E),
            token1: IERC20(0x061C999459a6ABc44CF976a67C96ef126810Ad9D),
            hookAddress: IHooks(0xDE5D3d9f35EEA3B82838C54943fB451Ab10710c0)
        });
    }

    function getBaseSepoliaConfig() public view returns (NetworkConfig memory) {
        return NetworkConfig({
            poolManager: address(AddressConstants.getPoolManagerAddress(84532)),
            token0: IERC20(0xa635C785bEB9B40041a87A0650F9af52A07A595f),
            token1: IERC20(0xEa4aF23bE6Cba93aA3d1862c9Ffb172c1cddC66e),
            hookAddress: IHooks(0x78Cec2ED44f45249c996796753dE312B185050c0)
        });
    }

    function _etch(address target, bytes memory bytecode) internal override {
        if (block.chainid == 31337) {
            vm.rpc("anvil_setCode", string.concat('["', vm.toString(target), '",', '"', vm.toString(bytecode), '"]'));
        } else {
            revert("Unsupported etch on this network");
        }
    }

    function getCurrencies() internal view returns (Currency, Currency) {
        require(address(activeNetworkConfig.token0) != address(activeNetworkConfig.token1));

        if (activeNetworkConfig.token0 < activeNetworkConfig.token1) {
            return
                (Currency.wrap(address(activeNetworkConfig.token0)), Currency.wrap(address(activeNetworkConfig.token1)));
        } else {
            return
                (Currency.wrap(address(activeNetworkConfig.token1)), Currency.wrap(address(activeNetworkConfig.token0)));
        }
    }

    function getDeployer() internal returns (address) {
        address[] memory wallets = vm.getWallets();

        if (wallets.length > 0) {
            return wallets[0];
        } else {
            return msg.sender;
        }
    }
}
