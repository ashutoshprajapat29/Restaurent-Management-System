import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  computeBill,
  discountPercentOf,
  manualDiscountEntry,
  settlePayments,
} from '../src/modules/orders/settlement';
import {
  computeOrderTotals,
  priceLine,
  round2,
  toEffectiveInclusiveUnitPrice,
} from '../src/modules/orders/pricing';
import { expectedCash, gstSummary } from '../src/modules/accounting/accounting.calc';
import { AccountingService } from '../src/modules/accounting/accounting.service';
import { AuthService } from '../src/auth/auth.service';
import { SubscriptionService } from '../src/modules/subscription/subscription.service';
import { TablesService } from '../src/modules/tables/tables.service';

describe('Tier 5 White-Box Adversarial Hardening Suite', () => {
  // =========================================================================
  // 1. ORDERS, SETTLEMENT & PRICING ARITHMETIC
  // =========================================================================
  describe('1. Orders & Settlement Engine Adversarial Hardening', () => {
    it('GAP-01: preserves over-tender cash line and calculates changeDue when non-cash covers balance', () => {
      // Scenario: Bill total = 100. Customer pays 100 via CARD, then hands over 50 CASH (e.g. tip or mistaken extra tender).
      // Excess is 50. Line 187: take = Math.min(50, 50) = 50.
      // Line 189: line.amount becomes 0, line.tendered = 50, line.changeGiven = 50.
      // Kept preserves lines where amount > 0 or tendered > 0 or changeGiven > 0.
      // Change due is accurately calculated as 50.
      const settlement = settlePayments({
        balance: 100,
        payments: [
          { method: 'CARD', amount: 100 },
          { method: 'CASH', amount: 50 },
        ],
      });

      expect(settlement.fullyPaid).toBe(true);
      expect(settlement.paidNow).toBe(100);
      expect(settlement.payments).toHaveLength(2);
      expect(settlement.payments[0].method).toBe('CARD');
      expect(settlement.payments[1].method).toBe('CASH');
      expect(settlement.payments[1].amount).toBe(0);
      expect(settlement.payments[1].tendered).toBe(50);
      expect(settlement.payments[1].changeGiven).toBe(50);
      expect(settlement.changeDue).toBe(50);
    });

    it('GAP-02: preserves cash tender line and changeDue on $0 balance bill with cash tender', () => {
      // Scenario: 100% discounted bill or comped meal ($0 due). Customer hands $20 cash.
      const settlement = settlePayments({
        balance: 0,
        payments: [{ method: 'CASH', amount: 20 }],
      });

      expect(settlement.fullyPaid).toBe(true);
      expect(settlement.paidNow).toBe(0);
      expect(settlement.payments).toHaveLength(1);
      expect(settlement.payments[0].method).toBe('CASH');
      expect(settlement.payments[0].amount).toBe(0);
      expect(settlement.payments[0].tendered).toBe(20);
      expect(settlement.payments[0].changeGiven).toBe(20);
      expect(settlement.changeDue).toBe(20);
    });

    it('GAP-03: sanitizes and clamps negative discountPercent preventing total and tax inflation', () => {
      const line = priceLine({
        quantity: 1,
        unitPriceInclusive: 118,
        taxRatePercent: 18,
      });
      // Hostile cashier / client sends discountPercent = -20
      const bill = computeBill({
        lines: [line],
        discountPercent: -20,
      });

      // Remediated: Clamped discountPercent to >= 0 prevents surcharge inflation
      expect(bill.discountAmount).toBe(0);
      expect(bill.totalDue).toBe(118);
      expect(bill.taxAmount).toBe(18);
    });

    it('GAP-04: sanitizes and clamps negative discountFlat preventing totalDue increase', () => {
      const line = priceLine({
        quantity: 1,
        unitPriceInclusive: 100,
        taxRatePercent: 0,
      });
      // Hostile flat discount = -50
      const bill = computeBill({
        lines: [line],
        discountFlat: -50,
      });

      // Remediated: Clamped discountFlat to >= 0 prevents totalDue increase
      expect(bill.discountAmount).toBe(0);
      expect(bill.totalDue).toBe(100);
    });

    it('GAP-05: clamps negative tip and delivery fee preventing unauthorized fee deductions', () => {
      const line = priceLine({
        quantity: 1,
        unitPriceInclusive: 100,
        taxRatePercent: 0,
      });
      // Hostile client sends negative tip and delivery fee
      const bill = computeBill({
        lines: [line],
        tip: -30,
        deliveryFee: -20,
      });

      // Remediated: Tip and delivery fee clamped to >= 0
      expect(bill.tipAmount).toBe(0);
      expect(bill.deliveryFee).toBe(0);
      expect(bill.totalDue).toBe(100);
    });

    it('defensive check: rejects zero or negative payment amounts in settlePayments', () => {
      expect(() =>
        settlePayments({
          balance: 100,
          payments: [{ method: 'CASH', amount: 0 }],
        }),
      ).toThrow(BadRequestException);

      expect(() =>
        settlePayments({
          balance: 100,
          payments: [{ method: 'CASH', amount: -25 }],
        }),
      ).toThrow(BadRequestException);
    });

    it('defensive check: rejects under-tender and non-cash tendered', () => {
      expect(() =>
        settlePayments({
          balance: 100,
          payments: [{ method: 'CASH', amount: 100, tendered: 80 }],
        }),
      ).toThrow(BadRequestException);

      expect(() =>
        settlePayments({
          balance: 100,
          payments: [{ method: 'UPI', amount: 100, tendered: 120 }],
        }),
      ).toThrow(BadRequestException);
    });

    it('precision stress: handles binary float cents and fractional quantities accurately', () => {
      const line = priceLine({
        quantity: 3,
        unitPriceInclusive: 33.33,
        taxRatePercent: 5,
      });
      const totals = computeOrderTotals([line], 10, 0);
      expect(totals.subtotal).toBe(99.99);
      expect(totals.discountAmount).toBe(10);
      expect(totals.totalAmount).toBe(89.99);

      const settlement = settlePayments({
        balance: 89.99,
        payments: [
          { method: 'CASH', amount: 44.99 },
          { method: 'CARD', amount: 45.0 },
        ],
      });
      expect(settlement.fullyPaid).toBe(true);
      expect(settlement.balanceAfter).toBe(0);
    });
  });

  // =========================================================================
  // 2. ACCOUNTING, CASH DRAWER & TAX DISCREPANCIES
  // =========================================================================
  describe('2. Accounting, Cash Drawer & Tax Reconciliation', () => {
    it('GAP-06: ensures tax calculation consistency between settlement vs gstReport when loyalty is redeemed', () => {
      // In settlement.ts: loyalty points are tender, so tax is NOT reduced by loyalty redemption.
      // In accounting.service.ts gstReport(): charged = subtotal - discount; factor = charged / subtotal.
      // This means gstReport reports the exact tax billed on the order!
      const subtotal = 118;
      const taxRate = 18;
      const loyaltyRedeemed = 59; // 50% paid via loyalty points

      // Settlement perspective:
      const bill = computeBill({
        lines: [
          priceLine({
            quantity: 1,
            unitPriceInclusive: subtotal,
            taxRatePercent: taxRate,
          }),
        ],
        loyaltyDiscountRequested: loyaltyRedeemed,
      });
      expect(bill.taxAmount).toBe(18); // Invoiced tax remains 18

      // Accounting GST report perspective:
      const charged = subtotal - bill.discountAmount; // loyalty does not reduce taxable base
      const factor = charged / subtotal; // 118 / 118 = 1.0
      const gst = gstSummary([
        {
          lineTotal: subtotal,
          taxRatePercent: taxRate,
          factor,
        },
      ]);

      // Remediated: GST report tax matches invoiced tax
      expect(gst.totalTax).toBe(18);
      expect(gst.totalTax).toBe(bill.taxAmount);
    });

    it('GAP-07: guards non-finite (-Infinity) corruption in gstSummary on extreme negative tax rate (-100%)', () => {
      // If a bad menu item or corrupt input has taxRatePercent = -100:
      // rate is clamped to >= 0 or guarded against division by zero
      const result = gstSummary([
        {
          lineTotal: 100,
          taxRatePercent: -100,
          factor: 1,
        },
      ]);

      // Remediated: tax evaluates to 0 (finite)!
      expect(Number.isFinite(result.totalTax)).toBe(true);
      expect(result.totalTax).toBe(0);
    });

    it('defensive check: createExpense blocks CASH expenses for closed business dates', async () => {
      const mockPrisma = {
        cashClosing: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'closing-1',
            branchId: 'b-1',
            businessDate: new Date('2026-10-28T00:00:00.000Z'),
          }),
        },
        expense: { create: jest.fn() },
      };
      const mockTime = { tzForBranch: jest.fn().mockResolvedValue('UTC') };
      const service = new AccountingService(mockPrisma as never, mockTime as never);

      await expect(
        service.createExpense('b-1', 'user-1', {
          spentOn: '2026-10-28',
          category: 'SUPPLIES',
          amount: 50,
          paidFromCash: true,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('defensive check: deleteExpense blocks deleting CASH expenses when day is closed', async () => {
      const mockPrisma = {
        expense: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'exp-1',
            branchId: 'b-1',
            spentOn: new Date('2026-10-28T00:00:00.000Z'),
            paidFromCash: true,
          }),
          delete: jest.fn(),
        },
        cashClosing: {
          findUnique: jest.fn().mockResolvedValue({ id: 'closing-1' }),
        },
      };
      const mockTime = { tzForBranch: jest.fn().mockResolvedValue('UTC') };
      const service = new AccountingService(mockPrisma as never, mockTime as never);

      await expect(service.deleteExpense('b-1', 'exp-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('defensive check: expectedCash formula accounts for float, sales, refunds, expenses', () => {
      const cash = expectedCash(200.5, 1000.75, 50.25, 120.0);
      // 200.50 + 1000.75 - 50.25 - 120.00 = 1031.00
      expect(cash).toBe(1031.0);
    });
  });

  // =========================================================================
  // 3. AUTH, PIN SWITCH & CROSS-TENANT ISOLATION
  // =========================================================================
  describe('3. Auth, PIN Switch & Tenant Isolation Adversarial Hardening', () => {
    it('GAP-08: rejects cross-tenant PIN switch vulnerability when branchId is omitted', async () => {
      // Scenario: Victim User B belongs to Restaurant B / Branch B.
      // Attacker on a shared terminal in Restaurant A knows or guesses User B's 4-digit PIN.
      // Attacker calls /pin-login with { userId: userB.id, pin: '1234' } WITHOUT branchId.
      // In auth.service.ts: branchId is strictly required if user has assigned branches!
      const pinHash = await bcrypt.hash('1234', 10);
      const victimUserB = {
        id: 'user-victim-b',
        restaurantId: 'rest-b',
        name: 'Victim Cashier',
        roleId: 'role-b',
        isActive: true,
        pinHash,
        twoFactorEnabled: false,
        role: {
          name: 'CASHIER',
          permissions: [{ permission: { key: 'orders.create' } }],
        },
        branches: [{ branchId: 'branch-b' }],
      };

      const mockPrisma = {
        user: {
          findUnique: jest.fn().mockResolvedValue(victimUserB),
        },
      };
      const mockJwt = {
        signAsync: jest.fn().mockResolvedValue('jwt-token-for-user-b'),
      };
      const mockTwoFactor = {};

      const authService = new AuthService(
        mockPrisma as never,
        mockJwt as never,
        mockTwoFactor as never,
      );

      // Call pinLogin WITHOUT branchId:
      // Remediated: rejects with UnauthorizedException because branchId is required!
      await expect(
        authService.pinLogin({
          userId: 'user-victim-b',
          pin: '1234',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('defensive check: rejects PIN login when branchId is specified and does not match', async () => {
      const pinHash = await bcrypt.hash('1234', 10);
      const user = {
        id: 'user-1',
        restaurantId: 'rest-1',
        isActive: true,
        pinHash,
        twoFactorEnabled: false,
        branches: [{ branchId: 'branch-1' }],
      };

      const mockPrisma = {
        user: { findUnique: jest.fn().mockResolvedValue(user) },
      };
      const authService = new AuthService(
        mockPrisma as never,
        {} as never,
        {} as never,
      );

      await expect(
        authService.pinLogin({
          userId: 'user-1',
          branchId: 'branch-foreign',
          pin: '1234',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('defensive check: rejects PIN login for accounts with 2FA enabled', async () => {
      const pinHash = await bcrypt.hash('1234', 10);
      const user = {
        id: 'user-admin',
        restaurantId: 'rest-1',
        isActive: true,
        pinHash,
        twoFactorEnabled: true,
        branches: [{ branchId: 'branch-1' }],
      };

      const mockPrisma = {
        user: { findUnique: jest.fn().mockResolvedValue(user) },
      };
      const authService = new AuthService(
        mockPrisma as never,
        {} as never,
        {} as never,
      );

      await expect(
        authService.pinLogin({
          userId: 'user-admin',
          branchId: 'branch-1',
          pin: '1234',
        }),
      ).rejects.toThrow(/two-factor/);
    });

    it('GAP-09: flags cross-tenant email collision vulnerability in login() findFirst query', async () => {
      // Prisma schema defines @@unique([restaurantId, email]) for User, meaning multiple tenants
      // can legitimately have staff users with the same email address.
      // But AuthService.login() queries: `this.prisma.user.findFirst({ where: { email: dto.email, isActive: true } })`
      // without tenant scoping. If Restaurant B creates a staff with Restaurant A owner's email,
      // findFirst arbitrarily returns one of them!
      const userTenantB = {
        id: 'user-b',
        restaurantId: 'tenant-b',
        email: 'alice@restaurant.com',
        isActive: true,
        passwordHash: await bcrypt.hash('pass-b', 10),
      };

      const mockPrisma = {
        user: {
          findFirst: jest.fn().mockResolvedValue(userTenantB),
        },
      };
      const authService = new AuthService(
        mockPrisma as never,
        {} as never,
        {} as never,
      );

      // If Alice from Tenant A tries to log in with her password 'pass-a':
      await expect(
        authService.login({
          email: 'alice@restaurant.com',
          password: 'pass-a',
        }),
      ).rejects.toThrow(UnauthorizedException);

      // EMPIRICALLY CONFIRMED GAP: findFirst queried across all tenants without tenant scoping!
      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: { email: 'alice@restaurant.com', isActive: true },
        include: expect.any(Object),
      });
    });
  });

  // =========================================================================
  // 4. SUBSCRIPTION QUOTAS & FLOOR SPATIAL MANAGEMENT
  // =========================================================================
  describe('4. Subscription Quotas & Floor Management Adversarial Hardening', () => {
    it('GAP-10: rejects perpetual trial when trialEndsAt is null on TRIALING status', async () => {
      const mockPrisma = {
        restaurant: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'rest-null-trial',
            subscriptionPlan: 'FREE',
            subscriptionStatus: 'TRIALING',
            maxTables: 10,
            maxStaff: 3,
            maxBranches: 1,
            trialEndsAt: null, // Null expiration date!
            kdsEnabled: false,
            customBrandingEnabled: false,
          }),
        },
        table: { count: jest.fn().mockResolvedValue(5) },
        user: { count: jest.fn().mockResolvedValue(2) },
        branch: { count: jest.fn().mockResolvedValue(1) },
      };
      const service = new SubscriptionService(
        mockPrisma as never,
        { record: jest.fn() } as never,
      );

      const sub = await service.getTenantSubscription('rest-null-trial');

      // Remediated: trial is inactive and subscription is invalid when trialEndsAt is null!
      expect(sub.isTrialActive).toBe(false);
      expect(sub.isSubscriptionValid).toBe(false);
    });

    it('defensive check: expired TRIALING subscription is blocked from creating tables', async () => {
      const mockPrisma = {
        restaurant: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'rest-expired',
            subscriptionPlan: 'FREE',
            subscriptionStatus: 'TRIALING',
            maxTables: 10,
            maxStaff: 3,
            maxBranches: 1,
            trialEndsAt: new Date(Date.now() - 1000 * 60 * 60 * 24), // Expired yesterday
            kdsEnabled: false,
            customBrandingEnabled: false,
          }),
        },
        table: { count: jest.fn().mockResolvedValue(5) },
        user: { count: jest.fn().mockResolvedValue(2) },
        branch: { count: jest.fn().mockResolvedValue(1) },
      };
      const service = new SubscriptionService(
        mockPrisma as never,
        { record: jest.fn() } as never,
      );

      await expect(service.checkTableQuota('rest-expired', 1)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('GAP-11: flags TOCTOU concurrency race condition in checkTableQuota', async () => {
      // In subscription.service.ts: checkTableQuota does table.count() from DB.
      // If maxTables = 10 and current count = 9:
      // Two concurrent createTable requests both execute checkTableQuota(restaurantId, 1) in parallel.
      // Both read 9, both check (9 + 1) <= 10 -> both pass!
      // Both create tables, ending up with 11 tables (exceeding limit of 10).
      const mockPrisma = {
        restaurant: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'rest-toctou',
            subscriptionPlan: 'FREE',
            subscriptionStatus: 'ACTIVE',
            maxTables: 10,
            maxStaff: 3,
            maxBranches: 1,
          }),
        },
        table: { count: jest.fn().mockResolvedValue(9) },
        user: { count: jest.fn().mockResolvedValue(2) },
        branch: { count: jest.fn().mockResolvedValue(1) },
      };
      const service = new SubscriptionService(
        mockPrisma as never,
        { record: jest.fn() } as never,
      );

      // Run two parallel quota checks:
      const [checkA, checkB] = await Promise.allSettled([
        service.checkTableQuota('rest-toctou', 1),
        service.checkTableQuota('rest-toctou', 1),
      ]);

      // EMPIRICALLY CONFIRMED GAP: Both pass without mutual exclusion or atomic reservation!
      expect(checkA.status).toBe('fulfilled');
      expect(checkB.status).toBe('fulfilled');
    });

    it('GAP-12: preserves table status BILLED on table transfer', async () => {
      // In tables.service.ts:
      // When an active order with status 'BILLED' is transferred, target table status is preserved as 'BILLED'
      const mockPrisma = {
        table: {
          findFirst: jest.fn().mockImplementation(({ where }) => {
            if (where.id === 'table-source') {
              return Promise.resolve({
                id: 'table-source',
                number: '10',
                status: 'BILLED',
                floor: { branchId: 'b-1' },
              });
            }
            if (where.id === 'table-target') {
              return Promise.resolve({
                id: 'table-target',
                number: '12',
                status: 'AVAILABLE',
                floor: { branchId: 'b-1' },
              });
            }
            return Promise.resolve(null);
          }),
          findUnique: jest.fn().mockResolvedValue({
            id: 'table-target',
            status: 'BILLED',
          }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          update: jest.fn().mockResolvedValue({}),
        },
        order: {
          findFirst: jest.fn().mockImplementation(({ where }) => {
            if (where.tableId === 'table-target') {
              return Promise.resolve(null); // Target table has no active order
            }
            if (where.tableId === 'table-source') {
              return Promise.resolve({
                id: 'order-billed-1',
                orderNumber: 'ORD-101',
                status: 'BILLED', // Billed order on source table
                tableId: 'table-source',
                items: [],
              });
            }
            return Promise.resolve(null);
          }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          count: jest.fn().mockResolvedValue(0),
        },
        $transaction: jest.fn(async (cb) => cb(mockPrisma)),
      };
      const mockRealtime = { emitToBranch: jest.fn() };
      const mockSub = { checkTableQuota: jest.fn() };

      const tablesService = new TablesService(
        mockPrisma as never,
        mockRealtime as never,
        mockSub as never,
      );

      await tablesService.transferOrder('b-1', {
        sourceTableId: 'table-source',
        targetTableId: 'table-target',
      });

      // Remediated: The target table preserves the 'BILLED' status of the transferring order!
      expect(mockPrisma.table.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'BILLED' }),
        }),
      );
    });

    it('defensive check: transferOrder rejects transfer to same table or non-available target', async () => {
      const tablesService = new TablesService(
        {} as never,
        {} as never,
        {} as never,
      );

      await expect(
        tablesService.transferOrder('b-1', {
          sourceTableId: 'table-1',
          targetTableId: 'table-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
