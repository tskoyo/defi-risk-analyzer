// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseHook} from "@openzeppelin/uniswap-hooks/src/base/BaseHook.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager, SwapParams} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract LiquidityDepthRiskHook is BaseHook {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    // --- Configuration ---
    uint24 public constant BASE_FEE = 3000;     // 0.30%
    uint24 public constant PANIC_FEE = 50000;   // 5.00%
    uint24 public constant MAX_FEE   = 900000;  // 90% safety cap
    int24 public constant TICK_DIVERGENCE_LIMIT = 10; // ~0.1% before scaling kicks in

    // --- Retail heuristic ---
    uint256 public constant RETAIL_THRESHOLD = 10 ether; // < 10 tokens = retail proxy

    // --- Arb window heuristic ---
    uint32 public constant FAST_WINDOW = 20;          // sec
    int24  public constant FAST_DIVERGENCE = 200;     // ticks
    uint32 public constant COOLDOWN = 60;             // sec

    // optional: immediate "large swap" fee
    uint256 public constant BOT_AMOUNT_THRESHOLD = 1000 ether;

    // ---- Toggle behavior (set what you want for demo) ----
    // If true => revert with custom error in those cases; if false => just override fee.
    bool public constant REVERT_ON_BOT_SIZE     = false;
    bool public constant REVERT_ON_PANIC_WINDOW = false;

    // Custom error (frontend can decode it from revert data)
    error LvrBlocked(uint32 dt, int24 tickDiff, uint24 fee);

    struct Observation {
        uint32 timestamp;
        int24 lastTick;
    }

    mapping(PoolId => Observation) public observations;
    mapping(PoolId => uint32) public highFeeUntil;

    address public immutable retailSigner; // signer for retail pass

    constructor(IPoolManager _poolManager, address _retailSigner) BaseHook(_poolManager) {
        retailSigner = _retailSigner;
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: true,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    function _afterInitialize(address, PoolKey calldata key, uint160, int24 tick) internal override returns (bytes4) {
        if (!LPFeeLibrary.isDynamicFee(key.fee)) revert("Pool must be dynamic fee");
        observations[key.toId()] = Observation({timestamp: uint32(block.timestamp), lastTick: tick});
        return BaseHook.afterInitialize.selector;
    }

    // hookData format
    // abi.encode(address user, uint48 deadline, bytes signature)
    function _isValidRetailPass(PoolId poolId, bytes calldata hookData) internal view returns (bool) {
        if (retailSigner == address(0)) return false;

        if (hookData.length == 0) return false;

        (address user, uint48 deadline, bytes memory sig) = abi.decode(hookData, (address, uint48, bytes));
        if (block.timestamp > deadline) return false;

        // MVP binding: require EOA == tx.origin (demo-friendly)
        if (tx.origin != user) return false;

        bytes32 digest = keccak256(abi.encode(block.chainid, poolId, user, deadline));
        bytes32 ethHash = MessageHashUtils.toEthSignedMessageHash(digest);
        address recovered = ECDSA.recover(ethHash, sig);

        return recovered == retailSigner;
    }

    function _beforeSwap(address, PoolKey calldata key, SwapParams calldata params, bytes calldata hookData)
        internal
        view
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        // 1. Check if retail
        // amountSpecified is negative for exact-input (selling to pool)
        uint256 absAmount =
            params.amountSpecified < 0 ? uint256(-params.amountSpecified) : uint256(params.amountSpecified);
        
        PoolId poolId = key.toId();      

        // Retail exemption: small swaps OR signed retail pass
        if (absAmount < RETAIL_THRESHOLD || _isValidRetailPass(poolId, hookData)) {
            return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, BASE_FEE | LPFeeLibrary.OVERRIDE_FEE_FLAG);
        }

        // Compute dt / tickDiff for telemetry + potential revert payload
        Observation memory last = observations[poolId];
        (, int24 currentTick,,) = poolManager.getSlot0(poolId);

        uint32 dt = last.timestamp == 0 ? 0 : uint32(block.timestamp) - last.timestamp;
        int24 tickDiff = currentTick > last.lastTick ? currentTick - last.lastTick : last.lastTick - currentTick;

        bool panicWindowActive = block.timestamp < highFeeUntil[poolId];
        bool botSize = absAmount >= BOT_AMOUNT_THRESHOLD;

        // 1) Bot-size: either revert or charge panic fee
        if (botSize) {
            if (REVERT_ON_BOT_SIZE) revert LvrBlocked(dt, tickDiff, PANIC_FEE);

            return (
                BaseHook.beforeSwap.selector,
                BeforeSwapDeltaLibrary.ZERO_DELTA,
                PANIC_FEE | LPFeeLibrary.OVERRIDE_FEE_FLAG
            );
        }

        // 2) Panic window: either revert or charge panic fee
        if (panicWindowActive) {
            if (REVERT_ON_PANIC_WINDOW) revert LvrBlocked(dt, tickDiff, PANIC_FEE);

            return (
                BaseHook.beforeSwap.selector,
                BeforeSwapDeltaLibrary.ZERO_DELTA,
                PANIC_FEE | LPFeeLibrary.OVERRIDE_FEE_FLAG
            );
        }

        // Default
        return
            (
                BaseHook.beforeSwap.selector,
                BeforeSwapDeltaLibrary.ZERO_DELTA,
                BASE_FEE  | LPFeeLibrary.OVERRIDE_FEE_FLAG
            );
    }

    function _afterSwap(address, PoolKey calldata key, SwapParams calldata, BalanceDelta, bytes calldata)
        internal
        override
        returns (bytes4, int128)
    {
        PoolId poolId = key.toId();

        Observation memory last = observations[poolId];
        (, int24 tick,,) = poolManager.getSlot0(poolId);

        uint32 nowTs = uint32(block.timestamp);
        uint32 dt = last.timestamp == 0 ? 0 : nowTs - last.timestamp;

        int24 diff = tick > last.lastTick ? tick - last.lastTick : last.lastTick - tick;

        // If tick moved fast, open a panic fee window
        if (dt > 0 && dt <= FAST_WINDOW && diff >= FAST_DIVERGENCE) {
            highFeeUntil[poolId] = nowTs + COOLDOWN;
        }
        observations[poolId] = Observation({timestamp: nowTs, lastTick: tick});
        return (BaseHook.afterSwap.selector, 0);
    }
}
