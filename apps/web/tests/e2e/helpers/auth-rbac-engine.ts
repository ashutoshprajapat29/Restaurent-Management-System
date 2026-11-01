/**
 * Staff, PIN & RBAC Engine (Opaque-Box Helper)
 * Implements staff account management, 4-digit PIN authentication,
 * fast staff switching on shared terminals, and granular RBAC checks.
 */

import { DEFAULT_ROLE_PERMISSIONS, type PermissionKey, type StaffRole, permissionSatisfied } from "@nodedr-restaurant/types";
import { canOpen, firstAllowedHref, requiredPermissionFor } from "../../../lib/route-access.ts";

export interface StaffUser {
  id: string;
  name: string;
  email?: string;
  role: StaffRole;
  pin: string; // 4-digit PIN
  isActive: boolean;
  branchIds: string[];
  permissions: PermissionKey[];
}

export class AuthRbacEngine {
  private users = new Map<string, StaffUser>();
  private activeStaff: StaffUser | null = null;

  createStaff(params: {
    id: string;
    name: string;
    role: StaffRole;
    pin: string;
    email?: string;
    branchIds: string[];
    customPermissions?: PermissionKey[];
  }): StaffUser {
    if (!/^\d{4}$/.test(params.pin)) {
      throw new Error("PIN must be exactly 4 digits");
    }

    const permissions = params.customPermissions ?? DEFAULT_ROLE_PERMISSIONS[params.role] ?? [];

    const user: StaffUser = {
      id: params.id,
      name: params.name,
      role: params.role,
      pin: params.pin,
      email: params.email,
      isActive: true,
      branchIds: params.branchIds,
      permissions,
    };

    this.users.set(params.id, user);
    return user;
  }

  deactivateStaff(userId: string): StaffUser {
    const user = this.users.get(userId);
    if (!user) throw new Error(`Staff user ${userId} not found`);
    user.isActive = false;
    if (this.activeStaff?.id === userId) {
      this.activeStaff = null;
    }
    return user;
  }

  updateStaff(userId: string, updates: Partial<Pick<StaffUser, "name" | "role" | "pin" | "isActive">>): StaffUser {
    const user = this.users.get(userId);
    if (!user) throw new Error(`Staff user ${userId} not found`);
    if (updates.pin && !/^\d{4}$/.test(updates.pin)) {
      throw new Error("PIN must be exactly 4 digits");
    }
    if (updates.name) user.name = updates.name;
    if (updates.role) {
      user.role = updates.role;
      user.permissions = DEFAULT_ROLE_PERMISSIONS[updates.role] ?? [];
    }
    if (updates.pin) user.pin = updates.pin;
    if (updates.isActive !== undefined) user.isActive = updates.isActive;
    return user;
  }

  loginWithPin(pin: string, branchId?: string): { success: boolean; user: StaffUser } {
    const matched = Array.from(this.users.values()).find(
      (u) => u.pin === pin && u.isActive && (!branchId || u.branchIds.includes(branchId)),
    );

    if (!matched) {
      throw new Error("Invalid PIN or inactive staff account");
    }

    this.activeStaff = matched;
    return { success: true, user: matched };
  }

  switchStaffWithPin(pin: string, branchId?: string): StaffUser {
    const res = this.loginWithPin(pin, branchId);
    return res.user;
  }

  getActiveStaff(): StaffUser | null {
    return this.activeStaff;
  }

  hasPermission(permission: PermissionKey): boolean {
    if (!this.activeStaff) return false;
    return permissionSatisfied(this.activeStaff.permissions, permission);
  }

  canAccessRoute(path: string, routesConfig?: Array<{ href: string; permission?: string }>): boolean {
    if (!this.activeStaff) return false;
    const defaultRoutes = [
      { href: "/dashboard", permission: "dashboard.sales.view" },
      { href: "/pos", permission: "orders.create" },
      { href: "/tables", permission: "tables.view" },
      { href: "/menu", permission: "menu.view" },
      { href: "/kds", permission: "kds.manage" },
      { href: "/settings", permission: "settings.manage" },
    ];
    return canOpen(path, this.activeStaff.permissions, routesConfig ?? defaultRoutes);
  }

  getDefaultLandingRoute(routesConfig?: Array<{ href: string; permission?: string }>): string {
    if (!this.activeStaff) return "/login";
    const defaultRoutes = [
      { href: "/dashboard", permission: "dashboard.sales.view" },
      { href: "/pos", permission: "orders.create" },
      { href: "/tables", permission: "tables.view" },
      { href: "/menu", permission: "menu.view" },
      { href: "/kds", permission: "kds.manage" },
      { href: "/settings", permission: "settings.manage" },
    ];
    return firstAllowedHref(this.activeStaff.permissions, routesConfig ?? defaultRoutes) ?? "/login";
  }
}
