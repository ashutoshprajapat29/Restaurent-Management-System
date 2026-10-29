"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpdateFloor } from "@/hooks/use-tables";
import { ApiError } from "@/lib/api";

export function RenameFloorDialog({
  branchId,
  floorId,
  currentName,
}: {
  branchId: string | null;
  floorId: string;
  currentName: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const updateFloor = useUpdateFloor(branchId);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateFloor.mutate(
      { id: floorId, name },
      {
        onSuccess: () => {
          toast.success("Floor renamed");
          setOpen(false);
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not rename floor"),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setName(currentName);
      }}
    >
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon" className="min-h-11 min-w-11 h-11 w-11" aria-label="Rename floor">
            <Pencil className="h-4 w-4" />
          </Button>
        }
      />
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Rename floor</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-4">
            <Label htmlFor="rename-floor">Name</Label>
            <Input
              id="rename-floor"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={updateFloor.isPending}>
              {updateFloor.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
