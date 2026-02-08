# The Liquidity Depth Risk Pool

The Liquidity Depth Risk Pool project is an advanced automated market maker (AMM) design built on Uniswap v4. It uses Hooks to create a "self-aware" pool that monitors its own health and adjusts fees in real-time to protect liquidity providers (LPs).

## Description

Standard liquidity pools are passive and often vulnerable to "toxic flow"—sophisticated traders who drain value from a pool when its liquidity is low or prices are volatile. This project introduces an Automated Risk Manager (the hook) that acts as a "surge pricing" algorithm. It calculates the "Risk Premium" of a trade based on the tick from the previous transaction and automatically increases swap fees to compensate LPs for the higher risk of being a counterparty to an informed trader.

## Features

<table>
    <thead>
        <th>Feature</th>
        <th>Description</th>
    </thead>
    <tbody>
        <tr>
            <td>Depth-Dependent Fees</td>
            <td>The pool automatically raises swap fees when liquidity (depth) falls below a safe threshold.</td>
        </tr>
        <tr>
            <td>LVR Mitigation</td>
            <td>Protects LPs from "Loss-Versus-Rebalancing" (LVR) by making it too expensive for arbitrageurs to exploit the pool during volatile moments.</td>
        </tr>
        <tr>
            <td>`beforeSwap` Logic</td>
            <td>The risk assessment runs before every trade, ensuring the fee is always current and relevant to the immediate state of the pool.</td>
        </tr>
        <tr>
            <td>Dynamic Fee Override</td>
            <td>Uses v4’s dynamic fee capability to bypass static tiers (like v3's 0.3%) in favor of a calculated risk-based rate.</td>
        </tr>
    </tbody>
</table>

## Commands

Here are the commands on how to interact with hook smart contract:

### 1. Deploy hook
```cli
forge script script/01_CreatePoolAndAddLiquidity.s.sol \
    --rpc-url [your-rpc-url] \
    --private-key [your-private-key] \
    --broadcast
```

### 2. Create pool and add liquidity
```cli
forge script script/02_AddLiquidity.s.sol \
--rpc-url [your-rpc-url] \
--private-key [private-key] \
--broadcast
```

### 3. Add liquidity
```cli
forge script script/03_Swap.s.sol \
  --rpc-url [your-rpc-url] \
  --private-key [private-key] \
  --broadcast \
```