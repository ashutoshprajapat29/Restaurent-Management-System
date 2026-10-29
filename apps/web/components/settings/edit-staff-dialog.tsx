"use client";

import { Pencil } from "lucide-react";
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
import { useStaffRoles, useUpdateStaff, type StaffMember } from "@/hooks/use-staff";
import { ApiError } from "@/lib/api";

export function EditStaffDialog({ member }: { member: StaffMember }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(member.name);
  const [email, setEmail] = useState(member.email ?? "");
  const [phone, setPhone] = useState(member.phone ?? "");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [roleId, setRoleId] = useState(member.roleId);
  const { branches } = useBranch();
  const [branchIds, setBranchIds] = useState<string[]>(
    member.branches.map((b) => b.branch.id),
  );

  const { data: roles } = useStaffRoles();
  const updateStaff = useUpdateStaff();

  const handleOpen = (nextOpen: boolean) => {
    if (nextOpen) {
      setName(member.name);
      setEmail(member.email ?? "");
      setPhone(member.phone ?? "");
      setPassword("");
      setPin("");
      setRoleId(member.roleId);
      setBranchIds(member.branches.map((b) => b.branch.id));
    }
    setOpen(nextOpen);
  };

  const toggleBranch = (id: string) => {
    setBranchIds((prev) =>
      prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id],
    );
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

    updateStaff.mutate(
      {
        id: member.id,
        dto: {
          name,
          email: email || undefined,
          phone: phone || undefined,
          roleId,
          branchIds,
          ...(password ? { password } : {}),
          ...(pin ? { pin } : {}),
        },
      },
      {
        onSuccess: () => {
          toast.success(`${name} updated`);
          setOpen(false);
        },
        onError: (err) =>
          toast.error(
            err instanceof ApiError ? err.message : "Could not update staff account",
          ),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 min-h-[44px] min-w-[44px] text-muted-foreground hover:text-foreground"
            title="Edit staff account"
            aria-label={`Edit ${member.name}`}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Edit staff account</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`edit-name-${member.id}`}>Name</Label>
            <Input
              id={`edit-name-${member.id}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`edit-email-${member.id}`}>Email</Label>
              <Input
                id={`edit-email-${member.id}`}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`edit-phone-${member.id}`}>Phone</Label>
              <Input
                id={`edit-phone-${member.id}`}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`edit-password-${member.id}`}>
              New Password (leave blank to keep current)
            </Label>
            <PasswordInput
              id={`edit-password-${member.id}`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`edit-pin-${member.id}`}>
              New 4-Digit Terminal PIN (leave blank to keep current)
            </Label>
            <Input
              id={`edit-pin-${member.id}`}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={pin}
              onChange={(e) =>
                setPin(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
              placeholder="e.g. 1234"
              className="tracking-widest"
            />
            <p className="text-xs text-muted-foreground">
              Used for quick staff switching on shared POS terminals.
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
            <Button
              type="submit"
              disabled={updateStaff.isPending}
              className="min-h-[44px]"
            >
              {updateStaff.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
