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
import { LIQUIDITY_RISK_THRESHOLD, BASE_FEE, PANIC_FEE } from "@/config/contracts";
import { formatEther } from "viem";

type Direction = "0to1" | "1to0";

export default function Page() {
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<Direction>("0to1");

  const { tick, liquidity, isLoading } = usePoolState();

  const [simRisk, setSimRisk] = useState<{ isPanic: boolean, fee: number }>({ isPanic: false, fee: BASE_FEE });

  const isAmountValid = useMemo(() => {
    if (!amount.trim()) return false;
    const n = Number(amount);
    return Number.isFinite(n) && n > 0;
  }, [amount]);

  const runSimulation = () => {
    if (liquidity === null) return;

    const isRisky = liquidity < LIQUIDITY_RISK_THRESHOLD;

    setSimRisk({
      isPanic: isRisky,
      fee: isRisky ? PANIC_FEE : BASE_FEE
    });

    if (isRisky) {
      toast.warning("High Slippage Risk Detected", {
        description: `Liquidity is below 1000 tokens. Fee increased to ${(PANIC_FEE / 10000).toFixed(2)}%`
      });
    } else {
      toast.success("Low Risk", {
        description: "Deep liquidity available. Standard fee applies."
      });
    }
  };

  const onSubmit = () => {
    toast("Submit clicked", {
      description: "Triggering wallet transaction...",
    });
  };

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Swap Controls</CardTitle>
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
              <Button type="button" variant="secondary" onClick={runSimulation} disabled={!isAmountValid || isLoading}>
                Preview Risk
              </Button>
              <Button type="button" onClick={onSubmit} disabled={!isAmountValid}>
                Submit Swap
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex justify-between">
                Pool State
                {isLoading && <Badge variant="outline" className="animate-pulse">Loading...</Badge>}
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
                    ? "Available liquidity is below the safety threshold. Panic Fee activated to discourage toxic flow."
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