"use client";

import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AddStaffDialog } from "@/components/settings/add-staff-dialog";
import { EditStaffDialog } from "@/components/settings/edit-staff-dialog";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCurrentUser } from "@/hooks/use-auth";
import { useDeleteStaff, useStaff, useUpdateStaff, type StaffMember } from "@/hooks/use-staff";
import { api, ApiError } from "@/lib/api";

export default function StaffPage() {
  const { data: staff, isLoading } = useStaff();
  const { data: currentUser } = useCurrentUser();
  const updateStaff = useUpdateStaff();
  const deleteStaff = useDeleteStaff();

  const onResetTwoFactor = (member: StaffMember) => {
    if (!confirm(`Turn off two-factor authentication for ${member.name}? They will sign in with just their password until they set it up again.`)) return;
    api.post(`/auth/2fa/reset/${member.id}`).then(
      () => toast.success(`Two-factor authentication reset for ${member.name}`),
      (err) => toast.error(err instanceof ApiError ? err.message : "Could not reset"),
    );
  };

  const onDelete = (member: StaffMember) => {
    if (!confirm(`Delete ${member.name}? This cannot be undone.`)) return;
    deleteStaff.mutate(member.id, {
      onSuccess: () => toast.success(`${member.name} deleted`),
      onError: (err) =>
        toast.error(err instanceof ApiError ? err.message : "Could not delete staff account"),
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[32px] font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Restaurant, branch, and staff configuration</p>
      </div>

      <SettingsTabs />

      <Card className="flex flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-medium text-foreground">Staff accounts</h2>
          <AddStaffDialog />
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : staff && staff.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Branches</TableHead>
                <TableHead className="text-right">Active</TableHead>
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium text-foreground">{member.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {member.email || member.phone || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal">
                      {member.role.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {member.branches.map((b) => b.branch.name).join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Switch
                      checked={member.isActive}
                      onCheckedChange={(checked) =>
                        updateStaff.mutate(
                          { id: member.id, dto: { isActive: checked } },
                          {
                            onSuccess: () =>
                              toast.success(`${member.name} ${checked ? "enabled" : "disabled"}`),
                            onError: (err) =>
                              toast.error(err instanceof ApiError ? err.message : "Could not update"),
                          },
                        )
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <EditStaffDialog member={member} />
                      {member.id !== currentUser?.user.id && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-9 px-2 text-xs min-h-[44px] text-muted-foreground"
                            title="Reset two-factor authentication (lost device)"
                            onClick={() => onResetTwoFactor(member)}
                          >
                            Reset 2FA
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 min-h-[44px] min-w-[44px] text-muted-foreground hover:text-destructive"
                            title="Delete staff account"
                            aria-label={`Delete ${member.name}`}
                            onClick={() => onDelete(member)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <p className="text-sm font-medium text-foreground">No staff accounts yet</p>
            <p className="text-sm text-muted-foreground">Add your first staff account above.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
