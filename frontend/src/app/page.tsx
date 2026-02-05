"use client";

import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { usePoolState } from "@/hooks/usePoolState";
import {
  LIQUIDITY_RISK_THRESHOLD, BASE_FEE, PANIC_FEE,
  POOL_KEY, SWAP_ROUTER_ADDRESS, SWAP_ROUTER_ABI, HOOK_ABI,
  ERC20_ABI, TOKEN0_ADDRESS, TOKEN1_ADDRESS
} from "@/config/contracts";
import { formatEther, parseEther, maxUint256, decodeErrorResult, BaseError, ContractFunctionRevertedError } from "viem";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";

type Direction = "0to1" | "1to0";

export default function Page() {
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<Direction>("0to1");

  const { address } = useAccount();

  const tokenIn = direction === "0to1" ? TOKEN0_ADDRESS : TOKEN1_ADDRESS;

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: tokenIn,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, SWAP_ROUTER_ADDRESS] : undefined,
    query: { refetchInterval: 2000 }
  });

  const {
    data: approveHash,
    isPending: isApprovePending,
    writeContract: writeApprove
  } = useWriteContract();

  const { isLoading: isApproveConfirming } = useWaitForTransactionReceipt({
    hash: approveHash
  });

  const { tick, liquidity, isLoading: isPoolLoading } = usePoolState();

  const { data: hash, isPending, writeContract, error: writeError } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash });

  const [simRisk, setSimRisk] = useState<{ isPanic: boolean, fee: number }>({ isPanic: false, fee: BASE_FEE });

  const isAmountValid = useMemo(() => {
    if (!amount.trim()) return false;
    const n = Number(amount);
    return Number.isFinite(n) && n > 0;
  }, [amount]);

  const amountBigInt = amount ? parseEther(amount) : BigInt(0);
  const currentAllowance = allowance ?? BigInt(0);
  const needsApprove = isAmountValid && (currentAllowance < amountBigInt);

  useEffect(() => {
    if (isConfirmed) {
      toast.success("Swap Executed Successfully!", {
        description: `Hash: ${hash?.slice(0, 10)}...`
      });
      setAmount("");
    }
  }, [isConfirmed, hash]);

  useEffect(() => {
    if (!isApproveConfirming && approveHash) {
      toast.success("Token Approved!", {
        description: "Now you can proceed with the swap."
      });
      refetchAllowance();
    }
  }, [isApproveConfirming, approveHash, refetchAllowance]);


  useEffect(() => {
    if (writeError) {
      console.error("Full error:", writeError);

      let errorMsg = writeError.message;
      let isHookError = false;

      if (writeError instanceof BaseError) {
        const revertError = writeError.walk(err => err instanceof ContractFunctionRevertedError);

        if (revertError instanceof ContractFunctionRevertedError) {
          const rawData = (revertError.data as any)?.originalError?.data || revertError.data;

          if (rawData) {
            try {
              const decoded = decodeErrorResult({
                abi: HOOK_ABI,
                data: rawData as `0x${string}`
              });

              if (decoded.errorName === 'DepthExhausted') {
                const [ticksCrossed, limit] = decoded.args as [bigint, bigint];
                errorMsg = `RISK BLOCK: Crossed ${ticksCrossed} ticks (Limit: ${limit})`;
                isHookError = true;
              }
            } catch (e) {
              console.log("I couldn't decode the error with Hook ABI:", e);
            }
          }
        }
      }

      if (isHookError) {
        toast.error("Hook Rejected Swap!", { description: errorMsg, duration: 8000 });
      } else {
        if (writeError.message.includes("User rejected")) {
          toast.info("Transaction cancelled");
        } else {
          toast.error("Transaction Failed", { description: "Check console details." });
        }
      }
    }
  }, [writeError]);

  const runSimulation = () => {
    if (liquidity === null) return;
    const isRisky = liquidity < LIQUIDITY_RISK_THRESHOLD;
    setSimRisk({
      isPanic: isRisky,
      fee: isRisky ? PANIC_FEE : BASE_FEE
    });

    if (isRisky) toast.warning("High Risk Preview", { description: "Pool liquidity is critically low." });
    else toast.success("Safe Preview", { description: "Liquidity is sufficient." });
  };

  const onApprove = () => {
    writeApprove({
      address: tokenIn,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [SWAP_ROUTER_ADDRESS, maxUint256]
    });
  };

  const onSubmit = () => {
    if (!address || !amount) {
      toast.error("Connect wallet & enter amount");
      return;
    }

    const amountBigInt = parseEther(amount);
    const zeroForOne = direction === "0to1";
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

    writeContract({
      address: SWAP_ROUTER_ADDRESS,
      abi: SWAP_ROUTER_ABI,
      functionName: "swapExactTokensForTokens",
      args: [
        amountBigInt,
        BigInt(0),
        zeroForOne,
        POOL_KEY,
        "0x",
        address,
        deadline
      ],
    });
  };

  const setDemoSafe = () => { setAmount("0.1"); };
  const setDemoRisk = () => { setAmount("5000"); };

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              Swap Controls
              <div className="flex gap-2">
                <Button variant="outline" size="xs" onClick={setDemoSafe} className="h-6 text-xs cursor-pointer" >Demo Safe</Button>
                <Button variant="outline" size="xs" onClick={setDemoRisk} className="h-6 text-xs text-red-500 border-red-200 cursor-pointer">Demo Risk</Button>
              </div>
            </CardTitle>
            <CardDescription>Testnet Liquidity Depth Risk Pool</CardDescription>
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
              <RadioGroup value={direction} onValueChange={(v) => setDirection(v as Direction)} className="grid gap-2">
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
              <Button type="button" variant="secondary" className="cursor-pointer" onClick={runSimulation} disabled={!isAmountValid || isPoolLoading}>
                Preview Risk
              </Button>

              {needsApprove ? (
                <Button
                  type="button"
                  onClick={onApprove}
                  disabled={isApprovePending || isApproveConfirming}
                  className="bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
                >
                  {isApprovePending ? "Approving..." : isApproveConfirming ? "Verifying..." : "Approve Token"}
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={onSubmit}
                  className="cursor-pointer"
                  disabled={!isAmountValid || isPending || isConfirming}
                >
                  {isPending ? "Confirming..." : isConfirming ? "Processing..." : "Submit Swap"}
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
                {isPoolLoading && <Badge variant="outline" className="animate-pulse">Loading...</Badge>}
              </CardTitle>
              <CardDescription>Live from PoolManager</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Current Tick</span>
                <span className="font-mono">{tick !== null ? tick : "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Liquidity Depth</span>
                <span className="font-mono">
                  {liquidity !== null ? formatEther(liquidity) : "—"} L
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Threshold</span>
                <span className="font-mono text-muted-foreground">
                  {formatEther(LIQUIDITY_RISK_THRESHOLD)} L
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className={simRisk.isPanic ? "border-red-500 bg-red-50/10" : "border-green-500 bg-green-50/10"}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Risk Analysis
                {simRisk.isPanic
                  ? <Badge variant="destructive">PANIC MODE</Badge>
                  : <Badge className="bg-green-600">SAFE MODE</Badge>
                }
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Dynamic Fee</span>
                <span className="font-bold text-lg">{(simRisk.fee / 10000).toFixed(2)}%</span>
              </div>

              <Alert variant={simRisk.isPanic ? "destructive" : "default"}>
                <AlertTitle>
                  {simRisk.isPanic ? "Liquidity Crisis" : "Healthy Liquidity"}
                </AlertTitle>
                <AlertDescription className="text-xs">
                  {simRisk.isPanic
                    ? "Available liquidity is below the safety threshold."
                    : "Pool is operating within normal depth parameters."}
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}