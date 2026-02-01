"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";

type Direction = "0to1" | "1to0";

export default function Page() {
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<Direction>("0to1");

  const isAmountValid = useMemo(() => {
    if (!amount.trim()) return false;
    const n = Number(amount);
    return Number.isFinite(n) && n > 0;
  }, [amount]);

  const onPreview = () => {
    toast("Preview clicked", {
      description: `Amount: ${amount || "-"} · Direction: ${direction}`,
    });
  };

  const onSubmit = () => {
    toast("Submit clicked", {
      description: "Next: wagmi writeContract + tx status UI",
    });
  };

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Swap Controls</CardTitle>
            <CardDescription>Inputs pentru preview + submit</CardDescription>
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
              {!isAmountValid && amount.trim() ? (
                <div className="text-xs text-muted-foreground">Amount must be greater than 0</div>
              ) : null}
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
              <Button type="button" variant="secondary" onClick={onPreview} disabled={!isAmountValid}>
                Preview
              </Button>
              <Button type="button" onClick={onSubmit} disabled={!isAmountValid}>
                Submit
              </Button>
            </div>

            <div className="text-xs text-muted-foreground">
              Tx status: <span className="font-medium">idle</span> (pending/success/fail comes to the task with writeContract)
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Pool State</CardTitle>
              <CardDescription>Will be populated from RPC reads</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Price</span>
                <span>—</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Liquidity</span>
                <span>—</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Current tick</span>
                <span>—</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Risk Preview
                <Badge variant="secondary">unknown</Badge>
              </CardTitle>
              <CardDescription>Result simulate/preflight</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">ticksCrossed</span>
                <span>—</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">exhaustion</span>
                <span>—</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">impactBps</span>
                <span>—</span>
              </div>

              <Alert>
                <AlertTitle>Verdict</AlertTitle>
                <AlertDescription>
                  It will display the reason (safe / revert + decode metrics) after reading simulatedContract.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
