import { z } from "zod";

export const createStaffSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  password: z.string().min(8),
  roleId: z.string().min(1),
  branchIds: z.array(z.string()).min(1),
  pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits").optional(),
});
export type CreateStaffDto = z.infer<typeof createStaffSchema>;

export const updateStaffSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  roleId: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  branchIds: z.array(z.string()).optional(),
  password: z.string().min(8).optional(),
  pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits").optional(),
});
export type UpdateStaffDto = z.infer<typeof updateStaffSchema>;
