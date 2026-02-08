"use client";

import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { usePoolState } from "@/hooks/usePoolState";
import {
  BASE_FEE, PANIC_FEE, POOL_KEY, SWAP_ROUTER_ADDRESS, SWAP_ROUTER_ABI, HOOK_ABI,
  ERC20_ABI, TOKEN0_ADDRESS, TOKEN1_ADDRESS, HOOK_ADDRESS, POOL_ID,
} from "@/config/contracts";
import {
  formatEther, parseEther, maxUint256, BaseError,
  ContractFunctionRevertedError, decodeErrorResult, parseAbi,
} from "viem";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
  usePublicClient
} from "wagmi";

type Direction = "0to1" | "1to0";

// Optional: if you decide to add a revert custom error in the hook later
const HOOK_ERROR_ABI = parseAbi([
  "error LvrBlocked(uint32 dt, int24 tickDiff, uint24 fee)",
]);

function toBigIntish(v: unknown): bigint | null {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(v);
  if (typeof v === "string") {
    try {
      return BigInt(v);
    } catch {
      return null;
    }
  }
  return null;
}

function toNumberish(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}


export default function Page() {
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<Direction>("0to1");

  const { address } = useAccount();

  const publicClient = usePublicClient();

  const [quoteOut, setQuoteOut] = useState<bigint | null>(null);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);

  const tokenIn = direction === "0to1" ? TOKEN0_ADDRESS : TOKEN1_ADDRESS;

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: tokenIn,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, SWAP_ROUTER_ADDRESS] : undefined,
    query: { refetchInterval: 2000 },
  });

  const {
    data: approveHash,
    isPending: isApprovePending,
    writeContract: writeApprove,
  } = useWriteContract();

  const { isLoading: isApproveConfirming } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  const { tick, liquidity, isLoading: isPoolLoading } = usePoolState();

  const {
    data: hash,
    isPending,
    writeContract,
    error: writeError,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash });

  const isAmountValid = useMemo(() => {
    if (!amount.trim()) return false;
    const n = Number(amount);
    return Number.isFinite(n) && n > 0;
  }, [amount]);

  const amountBigInt = isAmountValid ? parseEther(amount) : BigInt(0);
  const currentAllowance = allowance ?? BigInt(0);
  const needsApprove = isAmountValid && currentAllowance < amountBigInt;

  const hookEnabled =
    HOOK_ADDRESS !== "0x0000000000000000000000000000000000000000";

  // Hook observation (timestamp, lastTick)
  const {
    data: observation,
    refetch: refetchObservation,
    isLoading: isObsLoading,
  } = useReadContract({
    address: HOOK_ADDRESS,
    abi: HOOK_ABI,
    functionName: "observations",
    args: [POOL_ID],
    query: { enabled: hookEnabled, refetchInterval: 2000 },
  });

  const obsTs = toBigIntish((observation as any)?.[0]);
  const obsLastTick = toNumberish((observation as any)?.[1]);

  // Panic window: highFeeUntil(poolId)
  // IMPORTANT: HOOK_ABI must include: "function highFeeUntil(bytes32) view returns (uint32)"
  const { data: highFeeUntilRaw } = useReadContract({
    address: HOOK_ADDRESS,
    abi: HOOK_ABI,
    functionName: "highFeeUntil",
    args: [POOL_ID],
    query: { enabled: hookEnabled, refetchInterval: 2000 },
  });

  const highFeeUntil = toBigIntish(highFeeUntilRaw);
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const isPanicWindow =
    highFeeUntil !== null && highFeeUntil > BigInt(0) && nowSec < highFeeUntil;

  // Read thresholds from hook for accuracy (optional but recommended)
  // IMPORTANT: HOOK_ABI must include these if you want them:
  // "function RETAIL_THRESHOLD() view returns (uint256)"
  // "function BOT_AMOUNT_THRESHOLD() view returns (uint256)"
  const { data: retailThresholdRaw } = useReadContract({
    address: HOOK_ADDRESS,
    abi: HOOK_ABI,
    functionName: "RETAIL_THRESHOLD",
    query: { enabled: hookEnabled, refetchInterval: 5000 },
  });

  const { data: botThresholdRaw } = useReadContract({
    address: HOOK_ADDRESS,
    abi: HOOK_ABI,
    functionName: "BOT_AMOUNT_THRESHOLD",
    query: { enabled: hookEnabled, refetchInterval: 5000 },
  });

  const retailThreshold = toBigIntish(retailThresholdRaw) ?? BigInt(10) * BigInt(10) ** BigInt(18);
  const botThreshold = toBigIntish(botThresholdRaw) ?? BigInt(1000) * BigInt(10) ** BigInt(18);

  const [simRisk, setSimRisk] = useState<{ isPanic: boolean; fee: number }>({
    isPanic: false,
    fee: BASE_FEE,
  });

  useEffect(() => {
    if (isConfirmed) {
      toast.success("Swap Executed Successfully!", {
        description: `Hash: ${hash?.slice(0, 10)}...`,
      });
      setAmount("");
      refetchObservation();
    }
  }, [isConfirmed, hash, refetchObservation]);

  useEffect(() => {
    if (!isApproveConfirming && approveHash) {
      toast.success("Token Approved!", {
        description: "Now you can proceed with the swap.",
      });
      refetchAllowance();
    }
  }, [isApproveConfirming, approveHash, refetchAllowance]);

  // Error handling: your current hook DOES NOT revert by default.
  // This keeps a decoder for a future "LvrBlocked" error if you decide to add it.
  useEffect(() => {
    if (!writeError) return;

    console.error("Full error:", writeError);

    let errorMsg = writeError.message;
    let decodedCustom = false;

    if (writeError instanceof BaseError) {
      const revertError = writeError.walk(
        (err) => err instanceof ContractFunctionRevertedError,
      );

      if (revertError instanceof ContractFunctionRevertedError) {
        const rawData =
          (revertError.data as any)?.originalError?.data || revertError.data;

        if (rawData) {
          try {
            const decoded = decodeErrorResult({
              abi: HOOK_ERROR_ABI,
              data: rawData as `0x${string}`,
            });

            if (decoded.errorName === "LvrBlocked") {
              const a = decoded.args as readonly [number | bigint, number | bigint, number | bigint];

              const dt = typeof a[0] === "bigint" ? a[0] : BigInt(a[0]);
              const tickDiff = typeof a[1] === "bigint" ? a[1] : BigInt(a[1]);
              const fee = typeof a[2] === "bigint" ? a[2] : BigInt(a[2]);

              errorMsg = `BLOCKED: dt=${dt}s tickDiff=${tickDiff} fee=${fee}`;
              decodedCustom = true;
            }
          } catch {
            // ignore decode fail
          }
        }
      }
    }

    if (writeError.message.includes("User rejected")) {
      toast.info("Transaction cancelled");
      return;
    }

    toast.error(decodedCustom ? "Hook Rejected Swap" : "Transaction Failed", {
      description: decodedCustom ? errorMsg : "Check console details.",
      duration: decodedCustom ? 8000 : 4000,
    });
  }, [writeError]);

  const runSimulation = async () => {
    setQuoteErr(null);
    setQuoteOut(null);

    if (!publicClient) {
      toast.error("Public client not ready");
      return;
    }

    if (!address) {
      toast.error("Connect wallet first");
      return;
    }
    if (!isAmountValid) {
      toast.error("Enter a valid amount");
      return;
    }
    if (needsApprove) {
      toast.info("Approve token first to get an on-chain quote (router will revert without allowance).");
    }

    let amountIn: bigint;
    try {
      amountIn = parseEther(amount);
    } catch {
      toast.error("Invalid amount format");
      return;
    }

    // 1) Fee mode preview (mirror hook logic)
    const isRetail = amountIn < retailThreshold;
    const isBigBot = amountIn >= botThreshold;
    const shouldPanic = !isRetail && (isPanicWindow || isBigBot);

    setSimRisk({ isPanic: shouldPanic, fee: shouldPanic ? PANIC_FEE : BASE_FEE });

    // 2) On-chain quote (simulate swap on router)
    // NOTE: simulate will likely revert if allowance/balance insufficient.
    if (!needsApprove) {
      try {
        setIsQuoting(true);

        const zeroForOne = direction === "0to1";
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
        const hookData: `0x${string}` = "0x";

        const sim = await publicClient.simulateContract({
          account: address,
          address: SWAP_ROUTER_ADDRESS,
          abi: SWAP_ROUTER_ABI,
          functionName: "swapExactTokensForTokens",
          args: [amountIn, BigInt(0), zeroForOne, POOL_KEY, hookData, address, deadline],
        });

        // swapExactTokensForTokens returns (uint256 amountOut)
        setQuoteOut(sim.result as bigint);

        toast.success("On-chain quote ready", {
          description: `Estimated out: ${formatEther(sim.result as bigint)}`,
        });
      } catch (e: any) {
        // best-effort error message
        const msg = e?.shortMessage || e?.message || "Quote failed";
        setQuoteErr(msg);
        toast.error("On-chain quote failed", { description: msg });
      } finally {
        setIsQuoting(false);
      }
    }

    // Toast for fee mode
    if (shouldPanic) {
      const why = [
        isPanicWindow ? "Panic window active." : null,
        isBigBot ? "Amount crosses BOT threshold." : null,
      ].filter(Boolean).join(" ");
      toast.warning("High Fee Preview", { description: why || "High fee." });
    } else {
      toast.success("Base Fee Preview", {
        description: isRetail ? "Retail-sized swap." : "Normal conditions.",
      });
    }
  };


  const onApprove = () => {
    writeApprove({
      address: tokenIn,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [SWAP_ROUTER_ADDRESS, maxUint256],
    });
  };

  const onSubmit = () => {
    if (!address || !amount) {
      toast.error("Connect wallet & enter amount");
      return;
    }

    const amountIn = parseEther(amount);
    const zeroForOne = direction === "0to1";
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

    // For now: no retail-pass signature
    const hookData: `0x${string}` = "0x";

    writeContract({
      address: SWAP_ROUTER_ADDRESS,
      abi: SWAP_ROUTER_ABI,
      functionName: "swapExactTokensForTokens",
      args: [amountIn, BigInt(0), zeroForOne, POOL_KEY, hookData, address, deadline],
    });
  };

  const setDemoSafe = () => setAmount("0.1");
  const setDemoRisk = () => setAmount("5000");

  const obsLabel =
    !hookEnabled
      ? "HOOK_ADDR=0x0"
      : isObsLoading
        ? "Loading..."
        : obsTs && obsTs > BigInt(0)
          ? `${new Date(Number(obsTs) * 1000).toLocaleTimeString()} | lastTick=${obsLastTick ?? "?"}`
          : "NOT INITIALIZED (ts=0)";

  const panicLabel =
    !hookEnabled
      ? "—"
      : highFeeUntil === null
        ? "Loading..."
        : highFeeUntil === BigInt(0)
          ? "OFF"
          : nowSec < highFeeUntil
            ? `ON until ${new Date(Number(highFeeUntil) * 1000).toLocaleTimeString()}`
            : "OFF";

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              Swap Controls
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="xs"
                  onClick={setDemoSafe}
                  className="h-6 text-xs cursor-pointer"
                >
                  Demo Safe
                </Button>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={setDemoRisk}
                  className="h-6 text-xs text-red-500 border-red-200 cursor-pointer"
                >
                  Demo Risk
                </Button>
              </div>
            </CardTitle>
            <CardDescription>Testnet LVR Fee Shield (Uniswap v4)</CardDescription>
          </CardHeader>

          <CardContent className="grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                placeholder="0.0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
              />
            </div>

            <div className="grid gap-2">
              <Label>Direction</Label>
              <RadioGroup
                value={direction}
                onValueChange={(v) => setDirection(v as Direction)}
                className="grid gap-2"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="d0" value="0to1" />
                  <Label htmlFor="d0">Token0 → Token1</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="d1" value="1to0" />
                  <Label htmlFor="d1">Token1 → Token0</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="cursor-pointer"
                onClick={runSimulation}
                disabled={!isAmountValid || isQuoting}
              >
                {isQuoting ? "Quoting..." : "Preview Fee"}
              </Button>

              {needsApprove ? (
                <Button
                  type="button"
                  onClick={onApprove}
                  disabled={isApprovePending || isApproveConfirming}
                  className="bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
                >
                  {isApprovePending
                    ? "Approving..."
                    : isApproveConfirming
                      ? "Verifying..."
                      : "Approve Token"}
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={onSubmit}
                  className="cursor-pointer"
                  disabled={!isAmountValid || isPending || isConfirming}
                >
                  {isPending
                    ? "Confirming..."
                    : isConfirming
                      ? "Processing..."
                      : "Submit Swap"}
                </Button>
              )}
            </div>

            {(hash || approveHash) && (
              <div className="text-xs text-muted-foreground break-all">
                Active Tx: {hash || approveHash}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex justify-between">
                Pool State
                {isPoolLoading && (
                  <Badge variant="outline" className="animate-pulse">
                    Loading...
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>Live from PoolManager / Hook</CardDescription>
            </CardHeader>

            <CardContent className="grid gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Hook observation</span>
                <span className="font-mono">{obsLabel}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Panic window</span>
                <span className="font-mono">{panicLabel}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Retail threshold</span>
                <span className="font-mono">{formatEther(retailThreshold)} tokens</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Bot threshold</span>
                <span className="font-mono">{formatEther(botThreshold)} tokens</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Current Tick</span>
                <span className="font-mono">
                  {tick !== null ? tick.toLocaleString() : "—"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Liquidity</span>
                <span className="font-mono">
                  {liquidity !== null ? `${formatEther(liquidity)} L` : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">On-chain quote out</span>
                <span className="font-mono">
                  {isQuoting ? "Quoting..." : quoteOut !== null ? `${Number(formatEther(quoteOut)).toFixed(6)} out` : "—"}
                </span>
              </div>

              {quoteErr && (
                <div className="text-xs text-red-400 break-all">
                  Quote error: {quoteErr}
                </div>
              )}
            </CardContent>
          </Card>

          <Card
            className={
              simRisk.isPanic
                ? "border-red-500 bg-red-50/10"
                : "border-green-500 bg-green-50/10"
            }
          >
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Fee Preview
                {simRisk.isPanic ? (
                  <Badge variant="destructive">PANIC FEE</Badge>
                ) : (
                  <Badge className="bg-green-600">BASE FEE</Badge>
                )}
              </CardTitle>
            </CardHeader>

            <CardContent className="grid gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">LP Fee</span>
                <span className="font-bold text-lg">
                  {(simRisk.fee / 10000).toFixed(2)}%
                </span>
              </div>

              <Alert variant={simRisk.isPanic ? "destructive" : "default"}>
                <AlertTitle>
                  {simRisk.isPanic ? "High-fee protection" : "Normal conditions"}
                </AlertTitle>
                <AlertDescription className="text-xs">
                  {simRisk.isPanic
                    ? "Hook will attempt to charge higher fee to capture arb-like flow."
                    : "Hook should keep the base fee."}
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
