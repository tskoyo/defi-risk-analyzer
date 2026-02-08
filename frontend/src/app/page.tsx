"use client";

import { useMemo, useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { usePoolState } from "@/hooks/usePoolState";
import {
  BASE_FEE,
  SWAP_ROUTER_ABI,
  HOOK_ABI,
  ERC20_ABI,
  getAddrs,
  getPoolKey,
  getPoolId,
} from "@/config/contracts";
import { formatEther, parseEther, maxUint256 } from "viem";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
  usePublicClient,
  useChainId,
} from "wagmi";

type Direction = "0to1" | "1to0";

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

  const chainId = useChainId();
  const addrs = getAddrs(chainId);
  const POOL_KEY = getPoolKey(chainId);
  const POOL_ID = getPoolId(chainId);

  const hookEnabled =
    addrs.hook !== "0x0000000000000000000000000000000000000000";

  const tokenIn = direction === "0to1" ? addrs.token0 : addrs.token1;

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: tokenIn,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, addrs.swapRouter] : undefined,
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

  // --- Hook reads (NEW hook model) ---

  const { data: snapshot, isLoading: isSnapLoading } = useReadContract({
    address: addrs.hook,
    abi: HOOK_ABI,
    functionName: "snapshots",
    args: [POOL_ID],
    query: { enabled: hookEnabled, refetchInterval: 2000 },
  });

  const snapLastBlock = toBigIntish((snapshot as any)?.[0]);
  const snapStartTick = toNumberish((snapshot as any)?.[1]);

  const { data: divLimitRaw } = useReadContract({
    address: addrs.hook,
    abi: HOOK_ABI,
    functionName: "DIVERGENCE_LIMIT",
    query: { enabled: hookEnabled, refetchInterval: 5000 },
  });

  const divergenceLimit = toNumberish(divLimitRaw) ?? 60;

  const { data: retailThresholdRaw } = useReadContract({
    address: addrs.hook,
    abi: HOOK_ABI,
    functionName: "RETAIL_THRESHOLD",
    query: { enabled: hookEnabled, refetchInterval: 5000 },
  });

  const retailThreshold =
    toBigIntish(retailThresholdRaw) ?? BigInt(1) * BigInt(10) ** BigInt(18); // fallback 1 ether

  // --- UI state for fee preview ---
  const [simRisk, setSimRisk] = useState<{ isPanic: boolean; fee: number }>({
    isPanic: false, // folosit ca "high fee" badge
    fee: BASE_FEE,
  });

  useEffect(() => {
    if (isConfirmed) {
      toast.success("Swap Executed Successfully!", {
        description: `Hash: ${hash?.slice(0, 10)}...`,
      });
      setAmount("");
    }
  }, [isConfirmed, hash]);

  useEffect(() => {
    if (!isApproveConfirming && approveHash) {
      toast.success("Token Approved!", {
        description: "Now you can proceed with the swap.",
      });
      refetchAllowance();
    }
  }, [isApproveConfirming, approveHash, refetchAllowance]);

  useEffect(() => {
    if (!writeError) return;

    console.error("Full error:", writeError);

    if ((writeError as any)?.message?.includes("User rejected")) {
      toast.info("Transaction cancelled");
      return;
    }

    toast.error("Transaction Failed", { description: "Check console details." });
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

    let amountIn: bigint;
    try {
      amountIn = parseEther(amount);
    } catch {
      toast.error("Invalid amount format");
      return;
    }

    // --- Fee preview (mirror hook) ---
    const isRetail = amountIn < retailThreshold;

    const currentTickNum = tick ?? 0;
    const referenceTick = snapStartTick ?? currentTickNum; // best-effort
    const divergence = Math.abs(currentTickNum - referenceTick);

    let fee = BASE_FEE;
    let isHighFee = false;

    if (!isRetail && divergence > divergenceLimit) {
      fee = divergence * 500; // same as hook: divergence * 500
      if (fee > 500000) fee = 500000;
      if (fee < BASE_FEE) fee = BASE_FEE;
      isHighFee = true;
    }

    setSimRisk({ isPanic: isHighFee, fee });

    // Toast
    if (isRetail) {
      toast.success("Base Fee Preview", { description: "Retail-sized swap." });
    } else if (isHighFee) {
      toast.warning("High Fee Preview", {
        description: `Divergence=${divergence} > ${divergenceLimit} ticks.`,
      });
    } else {
      toast.success("Base Fee Preview", { description: "Normal conditions." });
    }

    // --- On-chain quote (optional) ---
    if (needsApprove) {
      toast.info(
        "Approve token first to get an on-chain quote (router will revert without allowance).",
      );
      return;
    }

    try {
      setIsQuoting(true);

      const zeroForOne = direction === "0to1";
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
      const hookData: `0x${string}` = "0x";

      const sim = await publicClient.simulateContract({
        account: address,
        address: addrs.swapRouter,
        abi: SWAP_ROUTER_ABI,
        functionName: "swapExactTokensForTokens",
        args: [
          amountIn,
          BigInt(0),
          zeroForOne,
          POOL_KEY,
          hookData,
          address,
          deadline,
        ],
      });

      setQuoteOut(sim.result as bigint);

      toast.success("On-chain quote ready", {
        description: `Estimated out: ${formatEther(sim.result as bigint)}`,
      });
    } catch (e: any) {
      const msg = e?.shortMessage || e?.message || "Quote failed";
      setQuoteErr(msg);
      toast.error("On-chain quote failed", { description: msg });
    } finally {
      setIsQuoting(false);
    }
  };

  const onApprove = () => {
    writeApprove({
      address: tokenIn,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [addrs.swapRouter, maxUint256],
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
    const hookData: `0x${string}` = "0x";

    writeContract({
      address: addrs.swapRouter,
      abi: SWAP_ROUTER_ABI,
      functionName: "swapExactTokensForTokens",
      args: [amountIn, BigInt(0), zeroForOne, POOL_KEY, hookData, address, deadline],
    });
  };

  const setDemoSafe = () => setAmount("0.1");
  const setDemoRisk = () => setAmount("5"); // pentru hook-ul tău, demo “risk” e prin divergence, nu amount uriaș

  const snapshotLabel = !hookEnabled
    ? "HOOK_ADDR=0x0"
    : isSnapLoading
      ? "Loading..."
      : snapLastBlock && snapLastBlock > BigInt(0)
        ? `block=${snapLastBlock.toString()} | startTick=${snapStartTick ?? "?"}`
        : "NOT INITIALIZED";

  const currentDivergence =
    tick === null || snapStartTick === null ? null : Math.abs(tick - snapStartTick);

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
            <CardDescription>Uniswap v4 Dynamic Fee Hook (divergence)</CardDescription>
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
                <span className="text-muted-foreground">Hook snapshot</span>
                <span className="font-mono">{snapshotLabel}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Retail threshold</span>
                <span className="font-mono">{formatEther(retailThreshold)} tokens</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Divergence limit</span>
                <span className="font-mono">{divergenceLimit} ticks</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Current Tick</span>
                <span className="font-mono">{tick !== null ? tick.toLocaleString() : "—"}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Current divergence</span>
                <span className="font-mono">
                  {currentDivergence === null ? "—" : currentDivergence}
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
                  {isQuoting
                    ? "Quoting..."
                    : quoteOut !== null
                      ? `${Number(formatEther(quoteOut)).toFixed(6)} out`
                      : "—"}
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
                  <Badge variant="destructive">HIGH FEE</Badge>
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
                    ? "Fee scales with within-block tick divergence (LVR risk)."
                    : "Hook keeps the base fee."}
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
