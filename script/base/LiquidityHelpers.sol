// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {CurrencyLibrary, Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {BaseScript} from "./BaseScript.sol";

contract LiquidityHelpers is BaseScript {
    using CurrencyLibrary for Currency;

    function _mintLiquidityParams(
        PoolKey memory poolKey,
        int24 _tickLower,
        int24 _tickUpper,
        uint256 liquidity,
        uint256 amount0Max,
        uint256 amount1Max,
        address recipient,
        bytes memory hookData
    ) internal pure returns (bytes memory, bytes[] memory) {
        bytes memory actions = abi.encodePacked(
            uint8(Actions.MINT_POSITION), uint8(Actions.SETTLE_PAIR), uint8(Actions.SWEEP), uint8(Actions.SWEEP)
        );

        bytes[] memory params = new bytes[](4);
        params[0] = abi.encode(poolKey, _tickLower, _tickUpper, liquidity, amount0Max, amount1Max, recipient, hookData);
        params[1] = abi.encode(poolKey.currency0, poolKey.currency1);
        params[2] = abi.encode(poolKey.currency0, recipient);
        params[3] = abi.encode(poolKey.currency1, recipient);

        return (actions, params);
    }

    function tokenApprovals() public {
        if (!currency0.isAddressZero()) {
            activeNetworkConfig.token0.approve(address(permit2), type(uint256).max);
            permit2.approve(
                address(activeNetworkConfig.token0), address(positionManager), type(uint160).max, type(uint48).max
            );
        }

        if (!currency1.isAddressZero()) {
            activeNetworkConfig.token1.approve(address(permit2), type(uint256).max);
            permit2.approve(
                address(activeNetworkConfig.token1), address(positionManager), type(uint160).max, type(uint48).max
            );
        }
    }

    function truncateTickSpacing(int24 tick, int24 tickSpacing) internal pure returns (int24) {
        /// forge-lint: disable-next-line(divide-before-multiply)
        return ((tick / tickSpacing) * tickSpacing);
    }

    function _alignToSpacingFloor(int24 tick, int24 spacing) internal pure returns (int24) {
        int24 q = tick / spacing;
        int24 r = tick % spacing;
        // solidity: for negatives, / is toward zero; we want floor
        if (tick < 0 && r != 0) q -= 1;
        return q * spacing;
    }

    function _clampTick(int24 tick, int24 spacing) internal pure returns (int24) {
        int24 minTick = _alignToSpacingFloor(TickMath.MIN_TICK, spacing);
        int24 maxTick = _alignToSpacingFloor(TickMath.MAX_TICK, spacing);
        if (tick < minTick) return minTick;
        if (tick > maxTick) return maxTick;
        return _alignToSpacingFloor(tick, spacing);
    }

    function _clampRange(int24 lower, int24 upper, int24 spacing) internal pure returns (int24, int24) {
        lower = _clampTick(lower, spacing);
        upper = _clampTick(upper, spacing);
        require(lower < upper, "bad tick range");
        return (lower, upper);
    }
}
