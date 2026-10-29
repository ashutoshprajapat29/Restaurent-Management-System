"use client";

import { Delete, KeyRound, UserCheck } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useBranch } from "@/hooks/use-branch";
import { useQuickSwitch } from "@/hooks/use-auth";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { canOpen, firstAllowedHref } from "@/lib/route-access";
import { ApiError } from "@/lib/api";

interface PinSwitchDialogProps {
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function PinSwitchDialog({
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: PinSwitchDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (val: boolean) => {
    if (isControlled) {
      controlledOnOpenChange?.(val);
    } else {
      setInternalOpen(val);
    }
  };

  const [pin, setPin] = useState("");
  const { branchId } = useBranch();
  const quickSwitch = useQuickSwitch();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!open) {
      setPin("");
    }
  }, [open]);

  // Physical keyboard support for POS terminals
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        setPin((prev) => (prev.length < 4 ? prev + e.key : prev));
      } else if (e.key === "Backspace") {
        e.preventDefault();
        setPin((prev) => prev.slice(0, -1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (pin.length === 4) {
          submitPin(pin);
        }
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, pin]);

  const handleDigit = (digit: string) => {
    if (pin.length < 4) {
      const next = pin + digit;
      setPin(next);
      if (next.length === 4) {
        submitPin(next);
      }
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setPin("");
  };

  const submitPin = (pinToSubmit: string) => {
    if (pinToSubmit.length !== 4) {
      toast.error("PIN must be exactly 4 digits");
      return;
    }
    quickSwitch.mutate(
      { pin: pinToSubmit, branchId: branchId || undefined },
      {
        onSuccess: (data) => {
          toast.success(`Switched active user to ${data.user.name}`);
          setOpen(false);
          setPin("");
          // Check route access
          if (pathname && !canOpen(pathname, data.user.permissions, NAV_ITEMS)) {
            const destination = firstAllowedHref(data.user.permissions, NAV_ITEMS);
            if (destination) {
              router.replace(destination);
            }
          }
        },
        onError: (err) => {
          setPin("");
          toast.error(
            err instanceof ApiError ? err.message : "Invalid PIN or inactive staff account",
          );
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger render={trigger} />
      ) : !isControlled ? (
        <DialogTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              data-testid="pin-switch-button"
              className="min-h-[44px] min-w-[44px] gap-2 px-3 text-sm font-medium"
              title="Quick Staff Switch (4-Digit PIN)"
            >
              <KeyRound className="h-4 w-4" />
              <span>Switch Staff</span>
            </Button>
          }
        />
      ) : null}
      <DialogContent
        data-testid="pin-switch-dialog"
        className="w-full max-w-xs p-6 sm:max-w-xs"
      >
        <DialogHeader className="text-center">
          <DialogTitle className="flex items-center justify-center gap-2 text-lg font-semibold">
            <UserCheck className="h-5 w-5 text-primary" />
            Staff Quick Switch
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Enter your 4-digit PIN to switch operator
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          {/* PIN Dots Display */}
          <div className="flex items-center justify-center gap-3 py-2">
            {[0, 1, 2, 3].map((idx) => (
              <div
                key={idx}
                className={`h-4 w-4 rounded-full border-2 transition-all ${
                  idx < pin.length
                    ? "border-primary bg-primary scale-110"
                    : "border-muted-foreground/30 bg-muted"
                }`}
              />
            ))}
          </div>

          {/* Hidden accessible input for testing and screen readers */}
          <input
            type="password"
            data-testid="pin-input"
            aria-label="4-digit PIN"
            value={pin}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "").slice(0, 4);
              setPin(val);
              if (val.length === 4) submitPin(val);
            }}
            maxLength={4}
            className="sr-only"
          />

          {/* Touch-Friendly Numpad Grid (All targets >= 44x44px) */}
          <div className="grid grid-cols-3 gap-2.5 w-full">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
              <Button
                key={num}
                type="button"
                variant="outline"
                className="h-14 min-h-[44px] min-w-[44px] text-xl font-bold rounded-xl active:scale-95 transition-transform"
                onClick={() => handleDigit(num)}
                disabled={quickSwitch.isPending}
              >
                {num}
              </Button>
            ))}
            <Button
              type="button"
              variant="ghost"
              className="h-14 min-h-[44px] min-w-[44px] text-xs font-medium text-muted-foreground rounded-xl active:scale-95"
              onClick={handleClear}
              disabled={quickSwitch.isPending || pin.length === 0}
            >
              Clear
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-14 min-h-[44px] min-w-[44px] text-xl font-bold rounded-xl active:scale-95 transition-transform"
              onClick={() => handleDigit("0")}
              disabled={quickSwitch.isPending}
            >
              0
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-14 min-h-[44px] min-w-[44px] text-muted-foreground rounded-xl active:scale-95"
              onClick={handleBackspace}
              disabled={quickSwitch.isPending || pin.length === 0}
              aria-label="Backspace"
            >
              <Delete className="h-5 w-5" />
            </Button>
          </div>

          <Button
            type="button"
            data-testid="pin-submit-button"
            className="w-full min-h-[44px] mt-2 font-medium"
            disabled={pin.length !== 4 || quickSwitch.isPending}
            onClick={() => submitPin(pin)}
          >
            {quickSwitch.isPending ? "Switching…" : "Enter PIN"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
