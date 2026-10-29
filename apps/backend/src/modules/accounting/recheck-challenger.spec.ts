import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { pinLoginSchema } from '@nodedr-restaurant/types';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../../auth/auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TwoFactorService } from '../../auth/two-factor.service';
import { AuditService } from '../../audit/audit.service';
import { AccountingService } from './accounting.service';
import { expectedCash, round2 } from './accounting.calc';
import { settlePayments, computeBill } from '../orders/settlement';

describe('Milestone 4 Remediation Re-check: PIN Auth, Settlement Precision & Cash Drawer Z-Report', () => {
  // =========================================================================
  // 1. CROSS-TENANT PIN SWITCH PREVENTION & TERMINAL SCOPING
  // =========================================================================
  describe('Pillar 1: Cross-Tenant PIN Switch Prevention (Feature 22)', () => {
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
        signAsync: jest.fn().mockResolvedValue('test-session-jwt-token'),
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

    it('Zod Schema Level: rejects terminal PIN switch payload when both userId and branchId are missing', () => {
      const parsed = pinLoginSchema.safeParse({ pin: '1234' });
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues[0].message).toBe(
          'branchId is required for terminal switch when userId is omitted',
        );
      }
    });

    it('Zod Schema Level: rejects empty branchId string when userId is omitted', () => {
      const parsed = pinLoginSchema.safeParse({ pin: '1234', branchId: '' });
      expect(parsed.success).toBe(false);
    });

    it('Zod Schema Level: strictly enforces exactly 4-digit PIN format', () => {
      expect(pinLoginSchema.safeParse({ pin: '123', branchId: 'b-1' }).success).toBe(false);
      expect(pinLoginSchema.safeParse({ pin: '12345', branchId: 'b-1' }).success).toBe(false);
      expect(pinLoginSchema.safeParse({ pin: 'abcd', branchId: 'b-1' }).success).toBe(false);
      expect(pinLoginSchema.safeParse({ pin: '12a4', branchId: 'b-1' }).success).toBe(false);
      expect(pinLoginSchema.safeParse({ pin: '0000', branchId: 'b-1' }).success).toBe(true);
      expect(pinLoginSchema.safeParse({ pin: '9876', branchId: 'b-1' }).success).toBe(true);
    });

    it('Service Level: throws BadRequestException when branchId is omitted and userId is missing', async () => {
      await expect(
        authService.pinLogin({ pin: '1234' } as any),
      ).rejects.toThrow(BadRequestException);
      await expect(
        authService.pinLogin({ pin: '1234' } as any),
      ).rejects.toThrow(
        'branchId is required for terminal switch when userId is omitted',
      );
    });

    it('Service Level: throws BadRequestException when branchId is empty string and userId is missing', async () => {
      await expect(
        authService.pinLogin({ pin: '1234', branchId: '' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('Cross-Tenant Staff Disambiguation: Same PIN on different tenants logs into the requesting branch only', async () => {
      const sharedPin = '9999';
      const sharedHash = await bcrypt.hash(sharedPin, 10);

      // Branch 1 has Tenant 1 Waiter
      const tenant1Waiter = {
        id: 'u-tenant-1-waiter',
        name: 'Tenant 1 Waiter',
        isActive: true,
        pinHash: sharedHash,
        twoFactorEnabled: false,
        role: { id: 'r-w1', name: 'WAITER', permissions: [{ permission: { key: 'tables.view' } }] },
        branches: [{ branchId: 'branch-tenant-1' }],
      };

      // Branch 2 has Tenant 2 Cashier with IDENTICAL PIN
      const tenant2Cashier = {
        id: 'u-tenant-2-cashier',
        name: 'Tenant 2 Cashier',
        isActive: true,
        pinHash: sharedHash,
        twoFactorEnabled: false,
        role: { id: 'r-c2', name: 'CASHIER', permissions: [{ permission: { key: 'orders.create' } }] },
        branches: [{ branchId: 'branch-tenant-2' }],
      };

      prisma.user.findMany.mockImplementation(({ where }: any) => {
        const reqBranch = where.branches?.some?.branchId;
        if (reqBranch === 'branch-tenant-1') return Promise.resolve([tenant1Waiter]);
        if (reqBranch === 'branch-tenant-2') return Promise.resolve([tenant2Cashier]);
        return Promise.resolve([]);
      });

      // Terminal on Tenant 1 authenticates Tenant 1 Waiter
      const s1 = await authService.pinLogin({ pin: sharedPin, branchId: 'branch-tenant-1' });
      expect(s1.user.id).toBe('u-tenant-1-waiter');
      expect(s1.user.roleName).toBe('WAITER');

      // Terminal on Tenant 2 authenticates Tenant 2 Cashier
      const s2 = await authService.pinLogin({ pin: sharedPin, branchId: 'branch-tenant-2' });
      expect(s2.user.id).toBe('u-tenant-2-cashier');
      expect(s2.user.roleName).toBe('CASHIER');

      // Terminal on unknown branch rejects
      await expect(
        authService.pinLogin({ pin: sharedPin, branchId: 'branch-nonexistent' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('Branch Mismatch: User ID provided for staff of Branch A rejected when terminal passes Branch B', async () => {
      const pin = '5555';
      const hash = await bcrypt.hash(pin, 10);

      prisma.user.findUnique.mockResolvedValue({
        id: 'user-branch-A',
        name: 'Staff A',
        isActive: true,
        pinHash: hash,
        twoFactorEnabled: false,
        role: { id: 'r1', name: 'WAITER', permissions: [] },
        branches: [{ branchId: 'branch-A' }],
      });

      await expect(
        authService.pinLogin({
          userId: 'user-branch-A',
          pin,
          branchId: 'branch-B',
        }),
      ).rejects.toThrow('Staff member is not assigned to this branch');
    });

    it('Inactive staff and 2FA accounts cannot use terminal PIN switch', async () => {
      // Inactive staff via userId
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u-inactive',
        isActive: false,
        pinHash: '$2b$10$xyz',
        twoFactorEnabled: false,
        branches: [{ branchId: 'b-1' }],
      });
      await expect(
        authService.pinLogin({ userId: 'u-inactive', pin: '1234', branchId: 'b-1' }),
      ).rejects.toThrow('PIN login not available for this user');

      // 2FA enabled staff via userId
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'u-2fa',
        isActive: true,
        pinHash: '$2b$10$xyz',
        twoFactorEnabled: true,
        branches: [{ branchId: 'b-1' }],
      });
      await expect(
        authService.pinLogin({ userId: 'u-2fa', pin: '1234', branchId: 'b-1' }),
      ).rejects.toThrow('PIN login is off for accounts with two-factor authentication — sign in with your password');

      // Terminal fast switch (userId omitted) when database has only inactive or 2FA users
      prisma.user.findMany.mockResolvedValueOnce([]); // prisma.where filtered them out
      await expect(
        authService.pinLogin({ pin: '1234', branchId: 'b-1' }),
      ).rejects.toThrow('Invalid PIN or inactive staff account');
    });
  });

  // =========================================================================
  // 2. FINANCIAL PRECISION & SPLIT TENDERS
  // =========================================================================
  describe('Pillar 2: Financial Precision, Split Tenders & Change Math', () => {
    it('Floating-point drift: sums 0.10 + 0.20 accurately without 0.30000000000000004 drift', () => {
      const res = settlePayments({
        balance: 0.3,
        payments: [
          { method: 'CASH', amount: 0.1 },
          { method: 'UPI', amount: 0.2 },
        ],
      });
      expect(res.fullyPaid).toBe(true);
      expect(res.paidNow).toBe(0.3);
      expect(res.balanceAfter).toBe(0);
      expect(res.changeDue).toBe(0);
    });

    it('Split tender across CASH, UPI, and CARD with exact change calculation', () => {
      const res = settlePayments({
        balance: 1478.65,
        payments: [
          { method: 'UPI', amount: 500.0 },
          { method: 'CARD', amount: 478.65 },
          { method: 'CASH', amount: 500.0, tendered: 600.0 },
        ],
      });

      expect(res.fullyPaid).toBe(true);
      expect(res.paidNow).toBe(1478.65);
      expect(res.changeDue).toBe(100.0);
      expect(res.balanceAfter).toBe(0);
      expect(res.payments[2].tendered).toBe(600.0);
      expect(res.payments[2].changeGiven).toBe(100.0);
    });

    it('Rejects non-cash tender amounts greater than payment line', () => {
      expect(() =>
        settlePayments({
          balance: 200,
          payments: [{ method: 'CARD', amount: 200, tendered: 250 }],
        }),
      ).toThrow('Only a cash payment can have an amount received');

      expect(() =>
        settlePayments({
          balance: 200,
          payments: [{ method: 'UPI', amount: 200, tendered: 250 }],
        }),
      ).toThrow('Only a cash payment can have an amount received');
    });

    it('Rejects overpayment when non-cash tender exceeds balance', () => {
      expect(() =>
        settlePayments({
          balance: 150,
          payments: [{ method: 'CARD', amount: 200 }],
        }),
      ).toThrow(/only cash can be over-tendered/);
    });

    it('Rejects partial payment by default and allows it when allowPartial is true', () => {
      expect(() =>
        settlePayments({
          balance: 1000,
          payments: [{ method: 'CASH', amount: 600 }],
        }),
      ).toThrow('Payments (600) do not cover the total due (1000)');

      const partialRes = settlePayments({
        balance: 1000,
        payments: [{ method: 'CASH', amount: 600 }],
        allowPartial: true,
      });
      expect(partialRes.fullyPaid).toBe(false);
      expect(partialRes.paidNow).toBe(600);
      expect(partialRes.balanceAfter).toBe(400);
    });

    it('Survives 200 randomized split tender transactions with zero precision drift', () => {
      for (let i = 0; i < 200; i++) {
        const p1 = round2(10 + Math.random() * 50);
        const p2 = round2(20 + Math.random() * 50);
        const p3 = round2(30 + Math.random() * 50);
        const total = round2(p1 + p2 + p3);
        const cashTender = round2(p1 + 20);

        const res = settlePayments({
          balance: total,
          payments: [
            { method: 'CASH', amount: p1, tendered: cashTender },
            { method: 'UPI', amount: p2 },
            { method: 'CARD', amount: p3 },
          ],
        });

        expect(res.fullyPaid).toBe(true);
        expect(res.paidNow).toBe(total);
        expect(res.balanceAfter).toBe(0);
        expect(res.changeDue).toBe(20);
      }
    });
  });

  // =========================================================================
  // 3. CASH DRAWER & Z-REPORT DAILY CLOSING RECONCILIATION
  // =========================================================================
  describe('Pillar 3: Cash Drawer Operations & Z-Report Daily Closing', () => {
    function setupAccountingService() {
      const prisma = {
        payment: {
          aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
          groupBy: jest.fn().mockResolvedValue([]),
        },
        refund: {
          aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
        },
        expense: {
          findFirst: jest.fn().mockResolvedValue(null),
          aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
          create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'exp-' + Math.random(), ...data })),
          delete: jest.fn().mockResolvedValue({ id: 'exp-1' }),
        },
        cashClosing: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'close-' + Math.random(), ...data })),
          findMany: jest.fn().mockResolvedValue([]),
        },
      };
      const time = { tzForBranch: jest.fn().mockResolvedValue('Asia/Kolkata') };
      const svc = new AccountingService(prisma as never, time as never);
      return { svc, prisma };
    }

    it('Expected cash formula matches: openingFloat + cashSales - cashRefunds - cashExpenses', () => {
      const exp = expectedCash(2500, 4850.75, 320.25, 650.5);
      // 2500 + 4850.75 - 320.25 - 650.50 = 6380.00
      expect(exp).toBe(6380.0);
    });

    it('Z-report reconciliation preview accurately aggregates all tenderTotals and net cash', async () => {
      const { svc, prisma } = setupAccountingService();
      prisma.payment.aggregate.mockResolvedValueOnce({ _sum: { amount: 2400.5 } });
      prisma.refund.aggregate.mockResolvedValueOnce({ _sum: { amount: 150.0 } });
      prisma.expense.aggregate.mockResolvedValueOnce({ _sum: { amount: 300.5 } });
      prisma.payment.groupBy.mockResolvedValueOnce([
        { method: 'CASH', _sum: { amount: 2400.5 } },
        { method: 'UPI', _sum: { amount: 1850.25 } },
        { method: 'CARD', _sum: { amount: 3200.0 } },
      ]);

      const preview = await svc.closingPreview('branch-1', '2026-10-29', 1500);

      expect(preview.openingFloat).toBe(1500);
      expect(preview.cashSales).toBe(2250.5); // 2400.50 - 150.00
      expect(preview.cashExpenses).toBe(300.5);
      // Expected cash = 1500 + 2250.50 - 300.50 = 3450.00
      expect(preview.expectedCash).toBe(3450.0);
      expect(preview.tenderTotals).toEqual({
        CASH: 2250.5,
        UPI: 1850.25,
        CARD: 3200.0,
      });
      // totalSales = 2250.50 + 1850.25 + 3200.00 = 7300.75
      expect(preview.totalSales).toBe(7300.75);
    });

    it('closeDay: records exact zero variance when till matches expected cash', async () => {
      const { svc, prisma } = setupAccountingService();
      prisma.cashClosing.findUnique.mockResolvedValueOnce(null);
      prisma.payment.aggregate.mockResolvedValueOnce({ _sum: { amount: 1000 } });
      prisma.refund.aggregate.mockResolvedValueOnce({ _sum: { amount: 0 } });
      prisma.expense.aggregate.mockResolvedValueOnce({ _sum: { amount: 100 } });
      prisma.payment.groupBy.mockResolvedValueOnce([{ method: 'CASH', _sum: { amount: 1000 } }]);

      // Expected = 500 (float) + 1000 (sales) - 100 (exp) = 1400
      await svc.closeDay('b-1', 'u-owner', {
        businessDate: '2026-10-29',
        openingFloat: 500,
        countedCash: 1400,
        note: 'Balanced till',
      });

      expect(prisma.cashClosing.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          expectedCash: 1400,
          countedCash: 1400,
          variance: 0,
        }),
      });
    });

    it('closeDay: records shortage discrepancy (negative variance) and overage discrepancy (positive variance)', async () => {
      const { svc, prisma } = setupAccountingService();
      prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: 1000 } });
      prisma.refund.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
      prisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
      prisma.payment.groupBy.mockResolvedValue([{ method: 'CASH', _sum: { amount: 1000 } }]);

      // Expected = 500 + 1000 = 1500
      // Test Shortage (counted 1420 -> variance -80)
      prisma.cashClosing.findUnique.mockResolvedValueOnce(null);
      await svc.closeDay('b-1', 'u-owner', {
        businessDate: '2026-10-29',
        openingFloat: 500,
        countedCash: 1420,
      });
      expect(prisma.cashClosing.create).toHaveBeenLastCalledWith({
        data: expect.objectContaining({
          variance: -80,
        }),
      });

      // Test Overage (counted 1550 -> variance +50)
      prisma.cashClosing.findUnique.mockResolvedValueOnce(null);
      await svc.closeDay('b-1', 'u-owner', {
        businessDate: '2026-10-29',
        openingFloat: 500,
        countedCash: 1550,
      });
      expect(prisma.cashClosing.create).toHaveBeenLastCalledWith({
        data: expect.objectContaining({
          variance: 50,
        }),
      });
    });

    it('Closed Day Guard: Prevents expense creation or deletion on a closed business date', async () => {
      const { svc, prisma } = setupAccountingService();
      prisma.cashClosing.findUnique.mockResolvedValue({
        id: 'closed-day-id',
        branchId: 'b-1',
        businessDate: new Date('2026-10-28T00:00:00Z'),
      });

      // Cash expense creation blocked
      await expect(
        svc.createExpense('b-1', 'u-cashier', {
          spentOn: '2026-10-28',
          category: 'KITCHEN_SUPPLIES',
          amount: 50,
          paidFromCash: true,
        }),
      ).rejects.toThrow('That day is already closed — cannot record cash expenses against a closed till');

      // Cash expense deletion blocked
      prisma.expense.findFirst.mockResolvedValueOnce({
        id: 'exp-1',
        branchId: 'b-1',
        spentOn: new Date('2026-10-28T00:00:00Z'),
        paidFromCash: true,
        amount: 50,
      });
      await expect(
        svc.deleteExpense('b-1', 'exp-1'),
      ).rejects.toThrow('That day is already closed — the cash count includes this expense');

      // Re-closing already closed day blocked
      await expect(
        svc.closeDay('b-1', 'u-owner', {
          businessDate: '2026-10-28',
          openingFloat: 500,
          countedCash: 1000,
        }),
      ).rejects.toThrow('This day is already closed');
    });
  });
});
