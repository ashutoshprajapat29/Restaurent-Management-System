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
import {
  computeOrderTotals,
  priceLine,
  toEffectiveInclusiveUnitPrice,
} from '../orders/pricing';
import { buildReceiptHtml } from '../orders/receipt.html';
import { SubscriptionService } from '../subscription/subscription.service';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { UsersService } from '../users/users.service';
import { PERMISSIONS_KEY } from '../../common/decorators/permissions.decorator';

describe('Challenger M4 Adversarial Empirical Stress Test Suite', () => {
  // =========================================================================
  // 1. BRANDING & MULTI-TENANT ENTITLEMENT (FEATURE 19)
  // =========================================================================
  describe('Branding & Multi-Tenant Entitlement (Feature 19)', () => {
    let settingsService: SettingsService;
    let subscriptionService: SubscriptionService;
    let prisma: any;

    beforeEach(async () => {
      prisma = {
        restaurant: {
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

    it('Adversarial: Attempting to sneak primaryColor or accentColor without entitlement must fail with ForbiddenException', async () => {
      jest
        .spyOn(subscriptionService, 'checkCustomBrandingAccess')
        .mockRejectedValue(new ForbiddenException('Subscription upgrade required for custom branding'));

      // Test 1: primaryColor only
      await expect(
        settingsService.updateRestaurant('rest-unpaid', 'user-attacker', {
          primaryColor: '#123456',
        }),
      ).rejects.toThrow(ForbiddenException);

      // Test 2: accentColor only
      await expect(
        settingsService.updateRestaurant('rest-unpaid', 'user-attacker', {
          accentColor: '#654321',
        }),
      ).rejects.toThrow(ForbiddenException);

      // Test 3: both colors together
      await expect(
        settingsService.updateRestaurant('rest-unpaid', 'user-attacker', {
          primaryColor: '#123456',
          accentColor: '#654321',
        }),
      ).rejects.toThrow(ForbiddenException);

      // Test 4: logoUrl only
      await expect(
        settingsService.updateRestaurant('rest-unpaid', 'user-attacker', {
          logoUrl: 'https://evil.corp/logo.png',
        }),
      ).rejects.toThrow(ForbiddenException);

      // Database update must NEVER have been called on forbidden attempts
      expect(prisma.restaurant.update).not.toHaveBeenCalled();
    });

    it('Entitlement granted: Persists colors and logs audit record', async () => {
      jest
        .spyOn(subscriptionService, 'checkCustomBrandingAccess')
        .mockResolvedValue(undefined);

      prisma.restaurant.update.mockResolvedValue({
        id: 'rest-pro',
        name: 'Fine Dining',
        primaryColor: '#0F172A',
        accentColor: '#38BDF8',
      });

      const result = await settingsService.updateRestaurant('rest-pro', 'admin-user', {
        primaryColor: '#0F172A',
        accentColor: '#38BDF8',
      });

      expect(subscriptionService.checkCustomBrandingAccess).toHaveBeenCalledWith('rest-pro');
      expect(result.primaryColor).toBe('#0F172A');
      expect(result.accentColor).toBe('#38BDF8');
    });

    it('Adversarial Hex Color Fuzzing: strictly accepts valid hex colors and rejects malicious/corrupt strings', () => {
      const validHex = [
        '#000000',
        '#FFFFFF',
        '#ffffff',
        '#9F1239',
        '#FDF2F4',
        '#1a2b3c',
        '#123',
        '#ABC',
        '#fff',
      ];

      for (const hex of validHex) {
        expect(() =>
          restaurantSettingsSchema.parse({ primaryColor: hex, accentColor: hex }),
        ).not.toThrow();
      }

      const maliciousOrInvalid = [
        '#12345',           // 5 chars
        '#1234567',         // 7 chars
        '123456',           // missing #
        '#GGGGGG',          // non-hex letters
        'red',              // css color name
        'rgb(255,0,0)',     // rgb format
        'rgba(0,0,0,0.5)',  // rgba format
        '#00 00',           // whitespace inside
        '<script>alert(1)</script>', // XSS payload
        'javascript:void(0)',
        '#',                // solitary hash
        '',                 // empty string
      ];

      for (const bad of maliciousOrInvalid) {
        expect(() =>
          restaurantSettingsSchema.parse({ primaryColor: bad }),
        ).toThrow();
        expect(() =>
          restaurantSettingsSchema.parse({ accentColor: bad }),
        ).toThrow();
      }
    });

    it('Receipt HTML Logo Rendering: verifies strict sanitization and dimension constraints', () => {
      const baseReceiptParams = {
        restaurantName: 'Gourmet Kitchen',
        currency: 'USD',
        branch: {
          name: 'Main Branch',
          address: '100 Main St',
          phone: '+1 555-0100',
          gstNumber: null,
          taxRegime: 'US_SALES_TAX' as const,
          taxMode: 'EXCLUSIVE' as const,
          taxLabel: 'Sales Tax',
          taxId: 'US-999',
        },
        order: {
          orderNumber: 'ORD-555',
          type: 'TAKEAWAY',
          createdAt: new Date('2026-10-29T12:00:00Z'),
          table: null,
          customer: null,
          subtotal: 40,
          discountAmount: 0,
          taxAmount: 4,
          tipAmount: 0,
          loyaltyPointsRedeemed: 0,
          loyaltyDiscountAmount: 0,
          totalAmount: 44,
          items: [
            {
              nameSnapshot: 'Burger',
              quantity: 2,
              unitPriceSnapshot: 20,
              lineTotal: 40,
              taxRateSnapshot: 10,
              modifiers: [],
            },
          ],
          payments: [{ method: 'CARD', amount: 44 }],
        },
      };

      // XSS attempt in logoUrl must be safely escaped by esc()
      const xssLogoUrl = 'https://example.com/logo.png" onload="alert(1)';
      const html = buildReceiptHtml({
        ...baseReceiptParams,
        logoUrl: xssLogoUrl,
      });

      expect(html).not.toContain('onload="alert(1)"');
      expect(html).toContain('max-height:48px;max-width:140px;');
      expect(html).toContain('class="logo"');

      // Null logoUrl
      const cleanHtml = buildReceiptHtml({
        ...baseReceiptParams,
        logoUrl: null,
      });
      expect(cleanHtml).not.toContain('class="logo"');
      expect(cleanHtml).not.toContain('<img');
    });
  });

  // =========================================================================
  // 2. CONFIGURABLE MULTI-REGIME TAX SETTINGS (FEATURE 20)
  // =========================================================================
  describe('Configurable Multi-Regime Tax Settings (Feature 20)', () => {
    it('All presets define legitimate tax regimes and default modes', () => {
      expect(TAX_REGIME_PRESETS.INDIA_GST.defaultMode).toBe('INCLUSIVE');
      expect(TAX_REGIME_PRESETS.US_SALES_TAX.defaultMode).toBe('EXCLUSIVE');
      expect(TAX_REGIME_PRESETS.EU_VAT.defaultMode).toBe('INCLUSIVE');
      expect(TAX_REGIME_PRESETS.ES_IVA.defaultMode).toBe('INCLUSIVE');
      expect(TAX_REGIME_PRESETS.CUSTOM.defaultMode).toBe('INCLUSIVE');
    });

    it('Precision tax calculations: handles rounding corner cases without fractional penny leakage', () => {
      // 1 item @ 33.33 inclusive of 18% GST
      // net = 33.33 / 1.18 = 28.24576... -> round(28.25) -> tax = 5.08
      const line = priceLine({
        quantity: 1,
        unitPriceInclusive: 33.33,
        taxRatePercent: 18,
      });
      expect(line.lineTotal).toBe(33.33);
      expect(line.taxAmount).toBe(5.08);

      // 3 items @ 33.33 = 99.99 total
      const order = computeOrderTotals([line, line, line], 0, 0);
      expect(order.subtotal).toBe(99.99);
      expect(order.taxAmount).toBe(15.24); // 5.08 * 3
      expect(order.totalAmount).toBe(99.99);
    });
  });

  // =========================================================================
  // 3. STAFF ACCOUNT & ROLE MANAGEMENT (FEATURE 21 - BCRYPT 12 ROUNDS)
  // =========================================================================
  describe('Staff Account & Role Management (Feature 21)', () => {
    let usersService: UsersService;
    let prisma: any;

    beforeEach(async () => {
      prisma = {
        user: {
          findFirst: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
        },
        role: {
          findFirst: jest.fn().mockResolvedValue({ id: 'r-cashier', name: 'CASHIER' }),
        },
        branch: {
          findMany: jest.fn().mockResolvedValue([{ id: 'b-1' }]),
          count: jest.fn().mockResolvedValue(1),
        },
      };

      const audit = { record: jest.fn().mockResolvedValue(undefined) };
      const sub = { checkStaffQuota: jest.fn().mockResolvedValue(undefined) };

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

    it('Adversarial: PIN with leading zeros (e.g. "0005") is preserved as 4-character string and hashed with 12 rounds', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockImplementation(({ data }: any) => {
        return Promise.resolve({
          id: 'u-lead-zero',
          name: data.name,
          email: data.email,
        });
      });

      const leadingZeroPin = '0005';
      await usersService.create('rest-1', 'admin-1', {
        name: 'Zero Cashier',
        email: 'zero@pos.local',
        password: 'Password123!',
        roleId: 'r-cashier',
        branchIds: ['b-1'],
        pin: leadingZeroPin,
      });

      const callData = prisma.user.create.mock.calls[0][0].data;
      expect(callData.pin).toBeUndefined(); // Plaintext PIN never saved
      expect(callData.pinHash).toMatch(/^\$2[ab]\$12\$/); // 12 rounds

      // Compare with original leading zero pin
      expect(await bcrypt.compare(leadingZeroPin, callData.pinHash)).toBe(true);
      // Ensure it doesn't match numeric equivalent '5'
      expect(await bcrypt.compare('5', callData.pinHash)).toBe(false);
      expect(await bcrypt.compare('005', callData.pinHash)).toBe(false);
    });
  });

  // =========================================================================
  // 4. 4-DIGIT PIN AUTHENTICATION & FAST TERMINAL SWITCH (FEATURE 22)
  // =========================================================================
  describe('4-Digit PIN Authentication & Fast Switch (Feature 22)', () => {
    let authService: AuthService;
    let prisma: any;
    let jwt: any;

    beforeEach(async () => {
      prisma = {
        user: {
          findMany: jest.fn(),
          findUnique: jest.fn(),
        },
      };

      jwt = {
        signAsync: jest.fn().mockResolvedValue('jwt-test-token-fast-switch'),
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

    it('Branch Scoping: Fast switch (userId omitted) rejects PIN of staff member belonging to a different branch', async () => {
      const pin = '4321';
      const hash = await bcrypt.hash(pin, 12);

      // Database returns candidates scoped to branch-A only
      prisma.user.findMany.mockImplementation(({ where }: any) => {
        if (where.branches?.some?.branchId === 'branch-B') {
          // Branch B has no staff with this PIN
          return Promise.resolve([]);
        }
        return Promise.resolve([
          {
            id: 'staff-branch-A',
            name: 'Branch A Cashier',
            isActive: true,
            pinHash: hash,
            twoFactorEnabled: false,
            role: { id: 'r1', name: 'CASHIER', permissions: [] },
            branches: [{ branchId: 'branch-A' }],
          },
        ]);
      });

      // Attempting to use Branch A staff's PIN on Branch B terminal must fail with 401
      await expect(
        authService.pinLogin({
          pin,
          branchId: 'branch-B',
        }),
      ).rejects.toThrow(UnauthorizedException);

      // Using on Branch A terminal succeeds
      const session = await authService.pinLogin({
        pin,
        branchId: 'branch-A',
      });
      expect(session.user.id).toBe('staff-branch-A');
    });

    it('Multi-Candidate Fast Switch: Correctly disambiguates between multiple active staff on the same branch', async () => {
      const pin1 = '1111';
      const pin2 = '2222';
      const hash1 = await bcrypt.hash(pin1, 12);
      const hash2 = await bcrypt.hash(pin2, 12);

      const candidates = [
        {
          id: 'user-1',
          name: 'Staff One',
          isActive: true,
          pinHash: hash1,
          twoFactorEnabled: false,
          role: { id: 'r1', name: 'WAITER', permissions: [{ permission: { key: 'tables.view' } }] },
          branches: [{ branchId: 'branch-1' }],
        },
        {
          id: 'user-2',
          name: 'Staff Two',
          isActive: true,
          pinHash: hash2,
          twoFactorEnabled: false,
          role: { id: 'r2', name: 'CASHIER', permissions: [{ permission: { key: 'orders.create' } }] },
          branches: [{ branchId: 'branch-1' }],
        },
      ];

      prisma.user.findMany.mockResolvedValue(candidates);

      // Switching with pin1 returns Staff One
      const s1 = await authService.pinLogin({ pin: pin1, branchId: 'branch-1' });
      expect(s1.user.id).toBe('user-1');
      expect(s1.user.permissions).toContain('tables.view');

      // Switching with pin2 returns Staff Two
      const s2 = await authService.pinLogin({ pin: pin2, branchId: 'branch-1' });
      expect(s2.user.id).toBe('user-2');
      expect(s2.user.permissions).toContain('orders.create');

      // Switching with unknown pin throws 401
      await expect(
        authService.pinLogin({ pin: '3333', branchId: 'branch-1' }),
      ).rejects.toThrow(new UnauthorizedException('Invalid PIN or inactive staff account'));
    });

    it('blocks cross-tenant terminal PIN switch when branchId is omitted', async () => {
      await expect(
        authService.pinLogin({ pin: '1234' } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // 5. ROLE-BASED ACCESS CONTROL (FEATURE 23)
  // =========================================================================
  describe('RBAC Controller & Route Guards (Feature 23)', () => {
    it('PermissionsGuard blocks forbidden endpoints and allows authorized endpoints', () => {
      const guard = new PermissionsGuard(new Reflector());

      const createMockContext = (userPermissions: string[], handlerPermission?: string) => {
        const handler = () => {};
        if (handlerPermission) {
          Reflect.defineMetadata(PERMISSIONS_KEY, [handlerPermission], handler);
        }
        return {
          getHandler: () => handler,
          getClass: () => ({}),
          switchToHttp: () => ({
            getRequest: () => ({ user: { permissions: userPermissions } }),
          }),
        } as unknown as ExecutionContext;
      };

      // Owner has settings.manage
      const ownerCtx = createMockContext(DEFAULT_ROLE_PERMISSIONS.OWNER, 'settings.manage');
      expect(guard.canActivate(ownerCtx)).toBe(true);

      // Cashier lacks settings.manage
      const cashierCtx = createMockContext(DEFAULT_ROLE_PERMISSIONS.CASHIER, 'settings.manage');
      expect(() => guard.canActivate(cashierCtx)).toThrow(ForbiddenException);

      // Waiter lacks dashboard.sales.view
      const waiterCtx = createMockContext(DEFAULT_ROLE_PERMISSIONS.WAITER, 'dashboard.sales.view');
      expect(() => guard.canActivate(waiterCtx)).toThrow(ForbiddenException);

      // Cashier has dashboard.sales.view
      const cashierDashCtx = createMockContext(DEFAULT_ROLE_PERMISSIONS.CASHIER, 'dashboard.sales.view');
      expect(guard.canActivate(cashierDashCtx)).toBe(true);

      // Kitchen Staff has kds.manage
      const kitchenCtx = createMockContext(DEFAULT_ROLE_PERMISSIONS.KITCHEN_STAFF, 'kds.manage');
      expect(guard.canActivate(kitchenCtx)).toBe(true);

      // Kitchen Staff lacks orders.create
      const kitchenOrdersCtx = createMockContext(DEFAULT_ROLE_PERMISSIONS.KITCHEN_STAFF, 'orders.create');
      expect(() => guard.canActivate(kitchenOrdersCtx)).toThrow(ForbiddenException);
    });
  });
});
