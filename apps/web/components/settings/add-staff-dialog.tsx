"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBranch } from "@/hooks/use-branch";
import { useCreateStaff, useStaffRoles } from "@/hooks/use-staff";
import { ApiError } from "@/lib/api";

export function AddStaffDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [roleId, setRoleId] = useState("");
  const { branches } = useBranch();
  const [branchIds, setBranchIds] = useState<string[]>([]);

  const { data: roles } = useStaffRoles();
  const createStaff = useCreateStaff();

  const reset = () => {
    setName("");
    setEmail("");
    setPhone("");
    setPassword("");
    setPin("");
    setRoleId("");
    setBranchIds([]);
  };

  const toggleBranch = (id: string) => {
    setBranchIds((prev) => (prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]));
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleId) {
      toast.error("Choose a role");
      return;
    }
    if (branchIds.length === 0) {
      toast.error("Select at least one branch");
      return;
    }
    if (pin && !/^\d{4}$/.test(pin)) {
      toast.error("PIN must be exactly 4 digits");
      return;
    }
    createStaff.mutate(
      {
        name,
        email: email || undefined,
        phone: phone || undefined,
        password,
        roleId,
        branchIds,
        pin: pin || undefined,
      },
      {
        onSuccess: () => {
          toast.success(`${name} added`);
          setOpen(false);
          reset();
        },
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : "Could not add staff account"),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="min-h-[44px]">Add staff</Button>} />
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>New staff account</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="s-name">Name</Label>
            <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="s-email">Email</Label>
              <Input id="s-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="s-phone">Phone</Label>
              <Input id="s-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="s-password">Password</Label>
            <PasswordInput
              id="s-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="s-pin">4-Digit Terminal PIN (Optional)</Label>
            <Input
              id="s-pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="e.g. 1234"
              className="tracking-widest"
            />
            <p className="text-xs text-muted-foreground">
              Used for quick staff switching on shared POS terminals without signing out.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Role</Label>
            <Select value={roleId} onValueChange={(v) => setRoleId(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {roles?.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Branches</Label>
            <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
              {branches.map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={branchIds.includes(b.id)}
                    onCheckedChange={() => toggleBranch(b.id)}
                  />
                  {b.name}
                </label>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={createStaff.isPending} className="min-h-[44px]">
              {createStaff.isPending ? "Adding…" : "Add staff"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
