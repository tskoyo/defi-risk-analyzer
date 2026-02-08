// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

struct PoolKey {
    address currency0;
    address currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

interface ISwapRouter {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        bool zeroForOne,
        PoolKey calldata poolKey,
        bytes calldata hookData,
        address receiver,
        uint256 deadline
    ) external payable returns (uint256 amountOut);
}

contract DemoBatcher {
    ISwapRouter public immutable router;

    constructor(ISwapRouter _router) {
        router = _router;
    }

    function primeWhaleArb(
        uint256 primeIn,   // < RETAIL_THRESHOLD (ex: 0.1 ether)
        uint256 whaleIn,
        uint256 arbIn,     // >= RETAIL_THRESHOLD (ex: 2 ether)
        bool zeroForOne,
        PoolKey calldata poolKey,
        uint256 deadline
    ) external {
        address tokenIn = zeroForOne ? poolKey.currency0 : poolKey.currency1;
        uint256 total = primeIn + whaleIn + arbIn;

        IERC20(tokenIn).transferFrom(msg.sender, address(this), total);
        IERC20(tokenIn).approve(address(router), total);

        bytes memory hookData = "";

        router.swapExactTokensForTokens(primeIn, 0, zeroForOne, poolKey, hookData, msg.sender, deadline);
        router.swapExactTokensForTokens(whaleIn, 0, zeroForOne, poolKey, hookData, msg.sender, deadline);
        router.swapExactTokensForTokens(arbIn,   0, zeroForOne, poolKey, hookData, msg.sender, deadline);
    }
}
