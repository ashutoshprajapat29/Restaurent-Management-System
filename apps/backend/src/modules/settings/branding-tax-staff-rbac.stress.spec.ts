import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import {
  DEFAULT_ROLE_PERMISSIONS,
  restaurantSettingsSchema,
  STAFF_ROLES,
  TAX_REGIME_PRESETS,
  type StaffRole,
} from '@nodedr-restaurant/types';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../../auth/auth.service';
import { TwoFactorService } from '../../auth/two-factor.service';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { computeOrderTotals, priceLine, toEffectiveInclusiveUnitPrice } from '../orders/pricing';
import { buildReceiptHtml } from '../orders/receipt.html';
import { SubscriptionService } from '../subscription/subscription.service';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { UsersService } from '../users/users.service';

describe('Milestone 4 Challenger Empirical Stress Harness: Branding, Tax, Staff PIN & RBAC', () => {
  // =========================================================================
  // 1. FEATURE 19: DEEP CUSTOMISATION & MULTI-TENANT BRANDING
  // =========================================================================
  describe('Feature 19: Multi-Tenant Branding & Customization', () => {
    let settingsService: SettingsService;
    let subscriptionService: SubscriptionService;
    let prisma: any;

    beforeEach(async () => {
      prisma = {
        restaurant: {
          findUnique: jest.fn(),
          update: jest.fn(),
        },
        branch: {
          findFirst: jest.fn(),
          findUnique: jest.fn(),
          update: jest.fn(),
        },
      };

      const audit = {
        record: jest.fn().mockResolvedValue(undefined),
      };

      const mockSubService = {
        checkCustomBrandingAccess: jest.fn(),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SettingsService,
          { provide: PrismaService, useValue: prisma },
          { provide: AuditService, useValue: audit },
          { provide: SubscriptionService, useValue: mockSubService },
        ],
      }).compile();

      settingsService = module.get<SettingsService>(SettingsService);
      subscriptionService = module.get<SubscriptionService>(SubscriptionService);
    });

    it('Gating: Attempting to update primaryColor without custom branding entitlement throws ForbiddenException', async () => {
      jest
        .spyOn(subscriptionService, 'checkCustomBrandingAccess')
        .mockRejectedValueOnce(
          new ForbiddenException('Custom branding is not included in your plan'),
        );

      await expect(
        settingsService.updateRestaurant('rest-free', 'user-1', {
          primaryColor: '#9F1239',
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(subscriptionService.checkCustomBrandingAccess).toHaveBeenCalledWith('rest-free');
      expect(prisma.restaurant.update).not.toHaveBeenCalled();
    });

    it('Gating: Attempting to update accentColor without custom branding entitlement throws ForbiddenException', async () => {
      jest
        .spyOn(subscriptionService, 'checkCustomBrandingAccess')
        .mockRejectedValueOnce(
          new ForbiddenException('Custom branding is not included in your plan'),
        );

      await expect(
        settingsService.updateRestaurant('rest-free', 'user-1', {
          accentColor: '#FDF2F4',
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(subscriptionService.checkCustomBrandingAccess).toHaveBeenCalledWith('rest-free');
      expect(prisma.restaurant.update).not.toHaveBeenCalled();
    });

    it('Gating: Attempting to update logoUrl without custom branding entitlement throws ForbiddenException', async () => {
      jest
        .spyOn(subscriptionService, 'checkCustomBrandingAccess')
        .mockRejectedValueOnce(
          new ForbiddenException('Custom branding is not included in your plan'),
        );

      await expect(
        settingsService.updateRestaurant('rest-free', 'user-1', {
          logoUrl: 'https://cdn.example.com/logo.png',
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(subscriptionService.checkCustomBrandingAccess).toHaveBeenCalledWith('rest-free');
      expect(prisma.restaurant.update).not.toHaveBeenCalled();
    });

    it('Entitlement Granted: Updating primaryColor and accentColor succeeds when branding access is permitted', async () => {
      jest
        .spyOn(subscriptionService, 'checkCustomBrandingAccess')
        .mockResolvedValueOnce(undefined);

      prisma.restaurant.update.mockResolvedValueOnce({
        id: 'rest-pro',
        name: 'Gourmet Bistro',
        primaryColor: '#9F1239',
        accentColor: '#FDF2F4',
      });

      const updated = await settingsService.updateRestaurant('rest-pro', 'user-1', {
        primaryColor: '#9F1239',
        accentColor: '#FDF2F4',
      });

      expect(subscriptionService.checkCustomBrandingAccess).toHaveBeenCalledWith('rest-pro');
      expect(prisma.restaurant.update).toHaveBeenCalledWith({
        where: { id: 'rest-pro' },
        data: { primaryColor: '#9F1239', accentColor: '#FDF2F4' },
      });
      expect(updated.primaryColor).toBe('#9F1239');
      expect(updated.accentColor).toBe('#FDF2F4');
    });

    it('Non-branding update (name only) bypasses checkCustomBrandingAccess', async () => {
      prisma.restaurant.update.mockResolvedValueOnce({
        id: 'rest-free',
        name: 'New Restaurant Name',
      });

      await settingsService.updateRestaurant('rest-free', 'user-1', {
        name: 'New Restaurant Name',
      });

      expect(subscriptionService.checkCustomBrandingAccess).not.toHaveBeenCalled();
      expect(prisma.restaurant.update).toHaveBeenCalled();
    });

    it('Schema Hex Validation: accepts valid 6-digit and 3-digit hex colors, rejects non-hex', () => {
      // Valid hex strings
      const validCases = ['#9F1239', '#FDF2F4', '#000000', '#ffffff', '#123', '#ABC'];
      for (const hex of validCases) {
        const parsed = restaurantSettingsSchema.parse({
          primaryColor: hex,
          accentColor: hex,
        });
        expect(parsed.primaryColor).toBe(hex);
        expect(parsed.accentColor).toBe(hex);
      }

      // Nullable / Optional
      expect(restaurantSettingsSchema.parse({ primaryColor: null }).primaryColor).toBeNull();
      expect(restaurantSettingsSchema.parse({}).primaryColor).toBeUndefined();

      // Invalid hex strings
      const invalidCases = [
        'red',
        '#GGGGGG',
        '9F1239', // missing #
        '#12345',  // 5 chars
        '#1234567', // 7 chars
        'rgb(0,0,0)',
        '#12',
      ];
      for (const invalid of invalidCases) {
        expect(() =>
          restaurantSettingsSchema.parse({ primaryColor: invalid }),
        ).toThrow();
        expect(() =>
          restaurantSettingsSchema.parse({ accentColor: invalid }),
        ).toThrow();
      }
    });

    it('Receipt HTML Logo Rendering: includes styled image tag when logoUrl provided, cleanly omits when absent', () => {
      const baseReceiptParams = {
        restaurantName: 'Gourmet Kitchen',
        currency: 'INR',
        branch: {
          name: 'Main Branch',
          address: '123 MG Road',
          phone: '+91 9876543210',
          gstNumber: '29ABCDE1234F1Z5',
          taxRegime: 'INDIA_GST' as const,
          taxMode: 'INCLUSIVE' as const,
          taxLabel: 'GST',
          taxId: '29ABCDE1234F1Z5',
        },
        order: {
          orderNumber: 'ORD-101',
          type: 'DINE_IN',
          createdAt: new Date('2026-10-29T10:00:00Z'),
          table: { label: 'T1' },
          customer: null,
          subtotal: 500,
          discountAmount: 0,
          taxAmount: 23.81,
          tipAmount: 0,
          loyaltyPointsRedeemed: 0,
          loyaltyDiscountAmount: 0,
          totalAmount: 500,
          items: [
            {
              nameSnapshot: 'Paneer Tikka',
              quantity: 2,
              unitPriceSnapshot: 250,
              lineTotal: 500,
              taxRateSnapshot: 5,
              modifiers: [],
            },
          ],
          payments: [{ method: 'UPI', amount: 500 }],
        },
      };

      // With Logo
      const htmlWithLogo = buildReceiptHtml({
        ...baseReceiptParams,
        logoUrl: 'https://cdn.restaurant.com/brand/logo.png',
      });
      expect(htmlWithLogo).toContain('<img src="https://cdn.restaurant.com/brand/logo.png"');
      expect(htmlWithLogo).toContain('class="logo"');
      expect(htmlWithLogo).toContain('max-height:48px;max-width:140px;');

      // Without Logo
      const htmlWithoutLogo = buildReceiptHtml({
        ...baseReceiptParams,
        logoUrl: null,
      });
      expect(htmlWithoutLogo).not.toContain('<img src=');
      expect(htmlWithoutLogo).not.toContain('class="logo"');
    });
  });

  // =========================================================================
  // 2. FEATURE 20: CONFIGURABLE MULTI-REGIME TAX SETTINGS & PRICING MATH
  // =========================================================================
  describe('Feature 20: Configurable Multi-Regime Tax Settings & Math', () => {
    let settingsService: SettingsService;
    let prisma: any;

    beforeEach(async () => {
      prisma = {
        branch: {
          update: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)),
        },
      };

      const audit = { record: jest.fn().mockResolvedValue(undefined) };
      const sub = { checkCustomBrandingAccess: jest.fn() };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SettingsService,
          { provide: PrismaService, useValue: prisma },
          { provide: AuditService, useValue: audit },
          { provide: SubscriptionService, useValue: sub },
        ],
      }).compile();

      settingsService = module.get<SettingsService>(SettingsService);
    });

    it('Branch Tax Regime Switch automatically applies regime defaultMode when taxMode is omitted', async () => {
      // Switching to US_SALES_TAX without specifying taxMode should default to EXCLUSIVE
      await settingsService.updateBranch('b-1', 'u-1', {
        taxRegime: 'US_SALES_TAX',
      });
      expect(prisma.branch.update).toHaveBeenCalledWith({
        where: { id: 'b-1' },
        data: expect.objectContaining({
          taxRegime: 'US_SALES_TAX',
          taxMode: 'EXCLUSIVE',
        }),
      });

      // Switching to INDIA_GST without specifying taxMode should default to INCLUSIVE
      await settingsService.updateBranch('b-1', 'u-1', {
        taxRegime: 'INDIA_GST',
      });
      expect(prisma.branch.update).toHaveBeenCalledWith({
        where: { id: 'b-1' },
        data: expect.objectContaining({
          taxRegime: 'INDIA_GST',
          taxMode: 'INCLUSIVE',
        }),
      });
    });

    it('Branch Tax Regime Switch preserves explicitly provided taxMode override', async () => {
      await settingsService.updateBranch('b-1', 'u-1', {
        taxRegime: 'INDIA_GST',
        taxMode: 'EXCLUSIVE', // explicit override
      });
      expect(prisma.branch.update).toHaveBeenCalledWith({
        where: { id: 'b-1' },
        data: expect.objectContaining({
          taxRegime: 'INDIA_GST',
          taxMode: 'EXCLUSIVE',
        }),
      });
    });

    it('Pricing Math: toEffectiveInclusiveUnitPrice accurately handles INCLUSIVE vs EXCLUSIVE modes', () => {
      // INCLUSIVE: entered menu price includes tax, passes through untouched
      const incUnitPrice = toEffectiveInclusiveUnitPrice(100, 18, 'INCLUSIVE');
      expect(incUnitPrice).toBe(100);

      // EXCLUSIVE: entered menu price is pre-tax, grosses up by tax rate
      const excUnitPrice = toEffectiveInclusiveUnitPrice(100, 10, 'EXCLUSIVE');
      expect(excUnitPrice).toBe(110);

      // Zero tax rate in EXCLUSIVE passes through
      expect(toEffectiveInclusiveUnitPrice(100, 0, 'EXCLUSIVE')).toBe(100);
    });

    it('Pricing Math: priceLine backs out tax for INCLUSIVE prices and rounds accurately', () => {
      // 18% GST backing out from 118 MRP: 118 - (118 / 1.18) = 18.00
      const line1 = priceLine({
        quantity: 1,
        unitPriceInclusive: 118,
        taxRatePercent: 18,
      });
      expect(line1.lineTotal).toBe(118);
      expect(line1.taxAmount).toBe(18);

      // 5% GST backing out from 100 MRP: 100 - (100 / 1.05) = 4.76
      const line2 = priceLine({
        quantity: 1,
        unitPriceInclusive: 100,
        taxRatePercent: 5,
      });
      expect(line2.lineTotal).toBe(100);
      expect(line2.taxAmount).toBe(4.76);
    });

    it('Pricing Math: computeOrderTotals computes net totals, tax aggregates, and discounts', () => {
      const lines = [
        priceLine({ quantity: 2, unitPriceInclusive: 100, taxRatePercent: 5 }), // total 200, tax 9.52
        priceLine({ quantity: 1, unitPriceInclusive: 118, taxRatePercent: 18 }), // total 118, tax 18.00
      ];

      // No discount
      const totalsNoDiscount = computeOrderTotals(lines, 0, 0);
      expect(totalsNoDiscount.subtotal).toBe(318);
      expect(totalsNoDiscount.taxAmount).toBe(27.52);
      expect(totalsNoDiscount.discountAmount).toBe(0);
      expect(totalsNoDiscount.totalAmount).toBe(318);

      // 10% discount on inclusive subtotal (318 * 0.1 = 31.8)
      const totalsWithPercent = computeOrderTotals(lines, 10, 0);
      expect(totalsWithPercent.discountAmount).toBe(31.8);
      expect(totalsWithPercent.totalAmount).toBe(286.2);
    });
  });

  // =========================================================================
  // 3. FEATURE 21: STAFF ACCOUNT & ROLE MANAGEMENT (BCRYPT 12 SALT ROUNDS)
  // =========================================================================
  describe('Feature 21: Staff Account & Role Management (Security & Hashing)', () => {
    let usersService: UsersService;
    let prisma: any;
    let audit: any;
    let sub: any;

    beforeEach(async () => {
      prisma = {
        user: {
          findFirst: jest.fn(),
          findMany: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
        },
        role: {
          findFirst: jest.fn().mockResolvedValue({ id: 'role-waiter', name: 'WAITER' }),
        },
        branch: {
          findMany: jest.fn().mockResolvedValue([{ id: 'branch-1' }]),
          count: jest.fn().mockResolvedValue(1),
        },
      };

      audit = { record: jest.fn().mockResolvedValue(undefined) };
      sub = { checkStaffQuota: jest.fn().mockResolvedValue(undefined) };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UsersService,
          { provide: PrismaService, useValue: prisma },
          { provide: AuditService, useValue: audit },
          { provide: SubscriptionService, useValue: sub },
        ],
      }).compile();

      usersService = module.get<UsersService>(UsersService);
    });

    it('PIN Hashing: generates bcrypt hash with exactly 12 salt rounds ($2b$12$ or $2a$12$)', async () => {
      prisma.user.findFirst.mockResolvedValue(null); // No existing email conflict
      prisma.user.create.mockImplementation(({ data }: any) => {
        return Promise.resolve({
          id: 'new-staff-1',
          name: data.name,
          email: data.email,
          roleId: data.roleId,
          isActive: true,
          // Notice: in real DB pinHash is stored, but select excludes it
          _internalPinHash: data.pinHash,
        });
      });

      const plainPin = '4321';
      await usersService.create('rest-1', 'admin-1', {
        name: 'Waiter Ramesh',
        email: 'ramesh@restaurant.com',
        password: 'SecurePassword123!',
        roleId: 'role-waiter',
        branchIds: ['branch-1'],
        pin: plainPin,
      });

      // Verify prisma create call data
      expect(prisma.user.create).toHaveBeenCalled();
      const createData = prisma.user.create.mock.calls[0][0].data;

      // Plaintext PIN must NEVER be saved directly
      expect(createData.pin).toBeUndefined();
      expect(createData.pinHash).toBeDefined();
      expect(createData.pinHash).not.toBe(plainPin);

      // Verify bcrypt salt rounds is 12 (starts with $2b$12$ or $2a$12$)
      expect(createData.pinHash).toMatch(/^\$2[ab]\$12\$/);

      // Verify bcrypt compare validates plaintext PIN against the stored hash
      const isPinValid = await bcrypt.compare(plainPin, createData.pinHash);
      expect(isPinValid).toBe(true);

      const isWrongPinValid = await bcrypt.compare('9999', createData.pinHash);
      expect(isWrongPinValid).toBe(false);
    });

    it('Staff Update: updating PIN re-hashes with 12 salt rounds; omitting leaves existing untouched', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'staff-1',
        restaurantId: 'rest-1',
        role: { name: 'WAITER' },
        pinHash: '$2b$12$oldhashplaceholder',
      });
      prisma.user.update.mockResolvedValue({ id: 'staff-1', name: 'Updated Staff' });

      // Case A: Update PIN
      await usersService.update('rest-1', 'admin-1', 'staff-1', {
        pin: '8877',
      });

      const updateDataWithPin = prisma.user.update.mock.calls[0][0].data;
      expect(updateDataWithPin.pinHash).toBeDefined();
      expect(updateDataWithPin.pinHash).toMatch(/^\$2[ab]\$12\$/);
      expect(await bcrypt.compare('8877', updateDataWithPin.pinHash)).toBe(true);

      // Case B: Update name without PIN
      prisma.user.update.mockClear();
      await usersService.update('rest-1', 'admin-1', 'staff-1', {
        name: 'New Name Only',
      });
      const updateDataWithoutPin = prisma.user.update.mock.calls[0][0].data;
      expect(updateDataWithoutPin.pinHash).toBeUndefined();
    });
  });

  // =========================================================================
  // 4. FEATURE 22: 4-DIGIT PIN AUTHENTICATION & FAST TERMINAL SWITCH
  // =========================================================================
  describe('Feature 22: 4-Digit PIN Authentication & Fast Switch (AuthService)', () => {
    let authService: AuthService;
    let prisma: any;
    let jwt: any;

    beforeEach(async () => {
      prisma = {
        user: {
          findUnique: jest.fn(),
          findMany: jest.fn(),
        },
      };

      jwt = {
        signAsync: jest.fn().mockResolvedValue('mocked-jwt-token-xyz'),
      };

      const audit = { record: jest.fn().mockResolvedValue(undefined) };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: PrismaService, useValue: prisma },
          { provide: JwtService, useValue: jwt },
          { provide: TwoFactorService, useValue: { isEnabled: jest.fn() } },
          { provide: AuditService, useValue: audit },
        ],
      }).compile();

      authService = module.get<AuthService>(AuthService);
    });

    it('Fast Switch (userId omitted): matches active branch candidate by PIN and issues valid JWT session', async () => {
      const pinCandidate1 = '1234';
      const pinCandidate2 = '5678';
      const hash1 = await bcrypt.hash(pinCandidate1, 12);
      const hash2 = await bcrypt.hash(pinCandidate2, 12);

      const mockCandidates = [
        {
          id: 'staff-bob',
          name: 'Bob Cashier',
          email: 'bob@pos.local',
          isActive: true,
          pinHash: hash1,
          twoFactorEnabled: false,
          role: {
            id: 'role-c',
            name: 'CASHIER',
            permissions: [
              { permission: { key: 'orders.create' } },
              { permission: { key: 'bills.print' } },
            ],
          },
          branches: [{ branchId: 'branch-1' }],
        },
        {
          id: 'staff-alice',
          name: 'Alice Waiter',
          email: 'alice@pos.local',
          isActive: true,
          pinHash: hash2,
          twoFactorEnabled: false,
          role: {
            id: 'role-w',
            name: 'WAITER',
            permissions: [{ permission: { key: 'tables.view' } }],
          },
          branches: [{ branchId: 'branch-1' }],
        },
      ];

      prisma.user.findMany.mockResolvedValue(mockCandidates);

      // Fast switch with Bob's PIN
      const sessionBob = await authService.pinLogin({
        pin: pinCandidate1,
        branchId: 'branch-1',
      });

      expect(sessionBob.token).toBe('mocked-jwt-token-xyz');
      expect(sessionBob.user.id).toBe('staff-bob');
      expect(sessionBob.user.name).toBe('Bob Cashier');
      expect(sessionBob.user.permissions).toContain('orders.create');

      // Fast switch with Alice's PIN
      const sessionAlice = await authService.pinLogin({
        pin: pinCandidate2,
        branchId: 'branch-1',
      });

      expect(sessionAlice.user.id).toBe('staff-alice');
      expect(sessionAlice.user.name).toBe('Alice Waiter');
      expect(sessionAlice.user.permissions).toContain('tables.view');
    });

    it('Fast Switch: non-matching PIN returns 401 UnauthorizedException', async () => {
      const validHash = await bcrypt.hash('1234', 12);
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'staff-bob',
          name: 'Bob Cashier',
          isActive: true,
          pinHash: validHash,
          twoFactorEnabled: false,
          role: { id: 'r1', name: 'CASHIER', permissions: [] },
          branches: [{ branchId: 'branch-1' }],
        },
      ]);

      await expect(
        authService.pinLogin({
          pin: '9999', // Unknown PIN
          branchId: 'branch-1',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('Explicit userId PIN login: validates PIN for specific user and rejects incorrect PIN with 401', async () => {
      const validPin = '7777';
      const validHash = await bcrypt.hash(validPin, 12);

      prisma.user.findUnique.mockResolvedValue({
        id: 'user-specific',
        name: 'Specific Staff',
        isActive: true,
        pinHash: validHash,
        twoFactorEnabled: false,
        role: { id: 'r1', name: 'WAITER', permissions: [] },
        branches: [{ branchId: 'branch-1' }],
      });

      // Correct PIN succeeds
      const session = await authService.pinLogin({
        userId: 'user-specific',
        pin: validPin,
        branchId: 'branch-1',
      });
      expect(session.user.id).toBe('user-specific');

      // Incorrect PIN fails with 401 UnauthorizedException
      await expect(
        authService.pinLogin({
          userId: 'user-specific',
          pin: '0000',
          branchId: 'branch-1',
        }),
      ).rejects.toThrow(new UnauthorizedException('Incorrect PIN'));
    });

    it('Security: PIN login is disallowed for accounts with two-factor authentication enabled', async () => {
      const hash = await bcrypt.hash('1234', 12);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-2fa',
        name: 'Admin with 2FA',
        isActive: true,
        pinHash: hash,
        twoFactorEnabled: true, // 2FA active
        role: { id: 'r1', name: 'OWNER', permissions: [] },
        branches: [{ branchId: 'branch-1' }],
      });

      await expect(
        authService.pinLogin({
          userId: 'user-2fa',
          pin: '1234',
        }),
      ).rejects.toThrow(
        new UnauthorizedException(
          'PIN login is off for accounts with two-factor authentication — sign in with your password',
        ),
      );
    });

    it('Security: PIN login rejects inactive staff accounts', async () => {
      const hash = await bcrypt.hash('1234', 12);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-deactivated',
        name: 'Former Staff',
        isActive: false, // inactive
        pinHash: hash,
        twoFactorEnabled: false,
        role: { id: 'r1', name: 'WAITER', permissions: [] },
        branches: [{ branchId: 'branch-1' }],
      });

      await expect(
        authService.pinLogin({
          userId: 'user-deactivated',
          pin: '1234',
        }),
      ).rejects.toThrow(
        new UnauthorizedException('PIN login not available for this user'),
      );
    });
  });

  // =========================================================================
  // 5. FEATURE 23: ROLE-BASED ACCESS CONTROL (RBAC) ENFORCEMENT
  // =========================================================================
  describe('Feature 23: RBAC Controller & Route Guards Enforcement', () => {
    const guard = new PermissionsGuard(new Reflector());

    function checkAccess(
      role: StaffRole,
      controller: any,
      handlerName: string,
    ): boolean {
      const permissions = DEFAULT_ROLE_PERMISSIONS[role];
      const handler = controller.prototype[handlerName];
      if (!handler) {
        throw new Error(`Handler ${handlerName} not found on ${controller.name}`);
      }
      const ctx = {
        getHandler: () => handler,
        getClass: () => controller,
        switchToHttp: () => ({ getRequest: () => ({ user: { permissions } }) }),
      } as unknown as ExecutionContext;

      try {
        return guard.canActivate(ctx);
      } catch (e) {
        if (e instanceof ForbiddenException) return false;
        throw e;
      }
    }

    it('SettingsController: updateRestaurant (settings.manage) is restricted to Owner/Admin', () => {
      // Allowed
      expect(checkAccess('OWNER', SettingsController, 'updateRestaurant')).toBe(true);
      expect(checkAccess('ADMINISTRATOR', SettingsController, 'updateRestaurant')).toBe(true);

      // Denied for Waiter, Cashier, Kitchen Staff, Chef, Bartender, etc.
      expect(checkAccess('WAITER', SettingsController, 'updateRestaurant')).toBe(false);
      expect(checkAccess('CASHIER', SettingsController, 'updateRestaurant')).toBe(false);
      expect(checkAccess('KITCHEN_STAFF', SettingsController, 'updateRestaurant')).toBe(false);
      expect(checkAccess('CHEF', SettingsController, 'updateRestaurant')).toBe(false);
      expect(checkAccess('DELIVERY_STAFF', SettingsController, 'updateRestaurant')).toBe(false);
    });

    it('SettingsController: updateBranch (settings.manage) is restricted to Owner/Admin', () => {
      expect(checkAccess('OWNER', SettingsController, 'updateBranch')).toBe(true);
      expect(checkAccess('ADMINISTRATOR', SettingsController, 'updateBranch')).toBe(true);
      expect(checkAccess('WAITER', SettingsController, 'updateBranch')).toBe(false);
      expect(checkAccess('CASHIER', SettingsController, 'updateBranch')).toBe(false);
      expect(checkAccess('KITCHEN_STAFF', SettingsController, 'updateBranch')).toBe(false);
    });

    it('All standard roles conform strictly to the required permission matrix', () => {
      // Owner and Admin have all permissions
      expect(DEFAULT_ROLE_PERMISSIONS.OWNER.length).toBeGreaterThan(30);
      expect(DEFAULT_ROLE_PERMISSIONS.ADMINISTRATOR.length).toBeGreaterThan(30);

      // Waiters can create orders, view tables/menu, print bills, but NO settings or financial reports
      const waiterPerms = DEFAULT_ROLE_PERMISSIONS.WAITER;
      expect(waiterPerms).toContain('orders.create');
      expect(waiterPerms).toContain('tables.view');
      expect(waiterPerms).toContain('bills.print');
      expect(waiterPerms).not.toContain('settings.manage');
      expect(waiterPerms).not.toContain('reports.financial.view');
      expect(waiterPerms).not.toContain('dashboard.sales.view');

      // Cashiers can create orders, process discounts, view sales & dashboard, but cannot manage settings
      const cashierPerms = DEFAULT_ROLE_PERMISSIONS.CASHIER;
      expect(cashierPerms).toContain('orders.create');
      expect(cashierPerms).toContain('discounts.apply');
      expect(cashierPerms).toContain('dashboard.sales.view');
      expect(cashierPerms).not.toContain('settings.manage');

      // Kitchen staff only access KDS and accept orders
      const kitchenPerms = DEFAULT_ROLE_PERMISSIONS.KITCHEN_STAFF;
      expect(kitchenPerms).toContain('kds.manage');
      expect(kitchenPerms).not.toContain('orders.create');
      expect(kitchenPerms).not.toContain('sales.view');
    });
  });
});
