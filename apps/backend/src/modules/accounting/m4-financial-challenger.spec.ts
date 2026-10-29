import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { expectedCash, round2 } from './accounting.calc';
import { settlePayments } from '../orders/settlement';

describe('Milestone 4 Financial Challenger: Settlement, Cash Drawer & Z-Report', () => {
  function setupAccounting(tz = 'Asia/Kolkata') {
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
    const time = { tzForBranch: jest.fn().mockResolvedValue(tz) };
    const svc = new AccountingService(prisma as never, time as never);
    return { svc, prisma, time };
  }

  // =========================================================================
  // 1. Feature 17: Petty Cash Outflow & Closed Business Date Guarding
  // =========================================================================
  describe('Feature 17: Petty Cash Outflow Closed Business Date Guard', () => {
    it('CRITICAL: throws BadRequestException when a CASH expense is created for a closed business date', async () => {
      const { svc, prisma } = setupAccounting();
      prisma.cashClosing.findUnique.mockResolvedValue({
        id: 'close-2026-10-28',
        branchId: 'b-main',
        businessDate: new Date('2026-10-28T00:00:00.000Z'),
        expectedCash: 1250,
        countedCash: 1250,
      });

      await expect(
        svc.createExpense('b-main', 'user-cashier', {
          spentOn: '2026-10-28',
          category: 'KITCHEN_SUPPLIES',
          amount: 85.5,
          paidFromCash: true,
          note: 'Emergency lemons & cilantro from local vendor',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        svc.createExpense('b-main', 'user-cashier', {
          spentOn: '2026-10-28',
          category: 'KITCHEN_SUPPLIES',
          amount: 85.5,
          paidFromCash: true,
          note: 'Emergency lemons & cilantro',
        }),
      ).rejects.toThrow(
        'That day is already closed — cannot record cash expenses against a closed till',
      );

      // Verify no expense was persisted in database
      expect(prisma.expense.create).not.toHaveBeenCalled();
    });

    it('CRITICAL: allows a NON-CASH expense to succeed even when the business date is closed', async () => {
      const { svc, prisma } = setupAccounting();
      // Even if cashClosing exists, non-cash expense (e.g. bank transfer / vendor credit) does NOT touch drawer till
      prisma.cashClosing.findUnique.mockResolvedValueOnce({
        id: 'close-2026-10-28',
        branchId: 'b-main',
        businessDate: new Date('2026-10-28T00:00:00.000Z'),
      });

      const res = await svc.createExpense('b-main', 'user-admin', {
        spentOn: '2026-10-28',
        category: 'EQUIPMENT_REPAIR',
        amount: 4500,
        paidFromCash: false,
        note: 'Compressor repair paid via NEFT bank transfer',
      });

      expect(res).toBeDefined();
      expect(res.paidFromCash).toBe(false);
      expect(res.amount).toBe(4500);
      expect(res.branchId).toBe('b-main');
      // cashClosing.findUnique was never queried because paidFromCash is false
      expect(prisma.cashClosing.findUnique).not.toHaveBeenCalled();
      expect(prisma.expense.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          branchId: 'b-main',
          amount: 4500,
          paidFromCash: false,
        }),
      });
    });

    it('allows a CASH expense when the business date is still OPEN', async () => {
      const { svc, prisma } = setupAccounting();
      prisma.cashClosing.findUnique.mockResolvedValueOnce(null);

      const res = await svc.createExpense('b-main', 'user-cashier', {
        spentOn: '2026-10-29',
        category: 'CLEANING',
        amount: 120,
        paidFromCash: true,
        note: 'Broom and detergent from neighborhood market',
      });

      expect(res).toBeDefined();
      expect(res.amount).toBe(120);
      expect(res.paidFromCash).toBe(true);
      expect(prisma.expense.create).toHaveBeenCalled();
    });

    it('deleteExpense: blocks deletion of cash expense if the date is closed', async () => {
      const { svc, prisma } = setupAccounting();
      const spentDate = new Date('2026-10-27T00:00:00.000Z');
      prisma.expense.findFirst.mockResolvedValueOnce({
        id: 'exp-old',
        branchId: 'b-main',
        spentOn: spentDate,
        paidFromCash: true,
        amount: 200,
      });
      prisma.cashClosing.findUnique.mockResolvedValueOnce({
        id: 'close-2026-10-27',
        branchId: 'b-main',
        businessDate: spentDate,
      });

      await expect(svc.deleteExpense('b-main', 'exp-old')).rejects.toThrow(
        'That day is already closed — the cash count includes this expense',
      );
      expect(prisma.expense.delete).not.toHaveBeenCalled();
    });

    it('deleteExpense: allows deletion of non-cash expense even if the date is closed', async () => {
      const { svc, prisma } = setupAccounting();
      const spentDate = new Date('2026-10-27T00:00:00.000Z');
      prisma.expense.findFirst.mockResolvedValueOnce({
        id: 'exp-bank',
        branchId: 'b-main',
        spentOn: spentDate,
        paidFromCash: false,
        amount: 1500,
      });
      prisma.cashClosing.findUnique.mockResolvedValueOnce({
        id: 'close-2026-10-27',
        branchId: 'b-main',
        businessDate: spentDate,
      });

      const res = await svc.deleteExpense('b-main', 'exp-bank');
      expect(res).toEqual({ ok: true });
      expect(prisma.expense.delete).toHaveBeenCalledWith({ where: { id: 'exp-bank' } });
    });
  });

  // =========================================================================
  // 2. Feature 18: End-of-Day Daily Z-Report & Reconciliation
  // =========================================================================
  describe('Feature 18: Daily Z-Report & Reconciliation (closingPreview & closeDay)', () => {
    it('CRITICAL: accurately groups ALL payment methods into tenderTotals and calculates totalSales', async () => {
      const { svc, prisma } = setupAccounting();
      // Cash sales: 1200, cash refunds: 150 -> net cash: 1050
      prisma.payment.aggregate.mockResolvedValueOnce({ _sum: { amount: 1200 } });
      prisma.refund.aggregate.mockResolvedValueOnce({ _sum: { amount: 150 } });
      prisma.expense.aggregate.mockResolvedValueOnce({ _sum: { amount: 250 } });
      prisma.payment.groupBy.mockResolvedValueOnce([
        { method: 'UPI', _sum: { amount: 850.75 } },
        { method: 'CARD', _sum: { amount: 1420.5 } },
        { method: 'OTHER', _sum: { amount: 300 } },
        { method: 'CASH', _sum: { amount: 1200 } },
      ]);

      const preview = await svc.closingPreview('b-main', '2026-10-29', 2000);

      expect(preview.businessDate).toBe('2026-10-29');
      expect(preview.openingFloat).toBe(2000);
      expect(preview.cashSales).toBe(1050); // 1200 - 150
      expect(preview.cashExpenses).toBe(250);

      // Verify tenderTotals groups every tender
      expect(preview.tenderTotals).toEqual({
        UPI: 850.75,
        CARD: 1420.5,
        OTHER: 300,
        CASH: 1050, // Net cash after refunds
      });

      // totalSales must equal the exact sum of all tender totals: 850.75 + 1420.5 + 300 + 1050 = 3621.25
      expect(preview.totalSales).toBe(3621.25);

      // expectedCash in till = openingFloat (2000) + cashSales (1200) - cashRefunds (150) - cashExpenses (250) = 2800
      expect(preview.expectedCash).toBe(2800);
    });

    it('handles zero sales day with opening float and petty cash expense', async () => {
      const { svc, prisma } = setupAccounting();
      prisma.payment.aggregate.mockResolvedValueOnce({ _sum: { amount: 0 } });
      prisma.refund.aggregate.mockResolvedValueOnce({ _sum: { amount: 0 } });
      prisma.expense.aggregate.mockResolvedValueOnce({ _sum: { amount: 180 } });
      prisma.payment.groupBy.mockResolvedValueOnce([]);

      const preview = await svc.closingPreview('b-main', '2026-10-29', 1500);

      expect(preview.openingFloat).toBe(1500);
      expect(preview.cashSales).toBe(0);
      expect(preview.cashExpenses).toBe(180);
      expect(preview.expectedCash).toBe(1320); // 1500 - 180
      expect(preview.tenderTotals).toEqual({ CASH: 0 });
      expect(preview.totalSales).toBe(0);
    });

    it('handles net negative cash sales when cash refunds exceed cash sales', async () => {
      const { svc, prisma } = setupAccounting();
      prisma.payment.aggregate.mockResolvedValueOnce({ _sum: { amount: 100 } });
      prisma.refund.aggregate.mockResolvedValueOnce({ _sum: { amount: 300 } });
      prisma.expense.aggregate.mockResolvedValueOnce({ _sum: { amount: 50 } });
      prisma.payment.groupBy.mockResolvedValueOnce([
        { method: 'UPI', _sum: { amount: 500 } },
      ]);

      const preview = await svc.closingPreview('b-main', '2026-10-29', 1000);

      expect(preview.cashSales).toBe(-200); // 100 - 300
      expect(preview.tenderTotals.CASH).toBe(-200);
      expect(preview.tenderTotals.UPI).toBe(500);
      expect(preview.totalSales).toBe(300); // -200 + 500
      expect(preview.expectedCash).toBe(750); // 1000 - 200 - 50
    });

    it('closeDay: records closing snapshot with zero variance when countedCash equals expectedCash', async () => {
      const { svc, prisma } = setupAccounting();
      prisma.cashClosing.findUnique.mockResolvedValueOnce(null); // not closed yet
      prisma.payment.aggregate.mockResolvedValueOnce({ _sum: { amount: 600 } });
      prisma.refund.aggregate.mockResolvedValueOnce({ _sum: { amount: 0 } });
      prisma.expense.aggregate.mockResolvedValueOnce({ _sum: { amount: 100 } });
      prisma.payment.groupBy.mockResolvedValueOnce([{ method: 'CASH', _sum: { amount: 600 } }]);

      // Expected cash = 1000 (opening) + 600 (sales) - 100 (expense) = 1500
      await svc.closeDay('b-main', 'u-owner', {
        businessDate: '2026-10-29',
        openingFloat: 1000,
        countedCash: 1500,
        note: 'Perfect till balance',
      });

      expect(prisma.cashClosing.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          openingFloat: 1000,
          cashSales: 600,
          cashExpenses: 100,
          expectedCash: 1500,
          countedCash: 1500,
          variance: 0,
          closedById: 'u-owner',
        }),
      });
    });

    it('closeDay: records negative variance (shortage discrepancy) when counted < expected', async () => {
      const { svc, prisma } = setupAccounting();
      prisma.cashClosing.findUnique.mockResolvedValueOnce(null);
      prisma.payment.aggregate.mockResolvedValueOnce({ _sum: { amount: 500 } });
      prisma.refund.aggregate.mockResolvedValueOnce({ _sum: { amount: 0 } });
      prisma.expense.aggregate.mockResolvedValueOnce({ _sum: { amount: 0 } });
      prisma.payment.groupBy.mockResolvedValueOnce([]);

      // Expected: 1000 + 500 = 1500. Counted: 1460 (40 shortage)
      await svc.closeDay('b-main', 'u-owner', {
        businessDate: '2026-10-29',
        openingFloat: 1000,
        countedCash: 1460,
        note: 'Till missing 40 rupees',
      });

      expect(prisma.cashClosing.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          expectedCash: 1500,
          countedCash: 1460,
          variance: -40,
        }),
      });
    });

    it('closeDay: records positive variance (overage discrepancy) when counted > expected', async () => {
      const { svc, prisma } = setupAccounting();
      prisma.cashClosing.findUnique.mockResolvedValueOnce(null);
      prisma.payment.aggregate.mockResolvedValueOnce({ _sum: { amount: 500 } });
      prisma.refund.aggregate.mockResolvedValueOnce({ _sum: { amount: 0 } });
      prisma.expense.aggregate.mockResolvedValueOnce({ _sum: { amount: 0 } });
      prisma.payment.groupBy.mockResolvedValueOnce([]);

      // Expected: 1000 + 500 = 1500. Counted: 1575 (75 overage)
      await svc.closeDay('b-main', 'u-owner', {
        businessDate: '2026-10-29',
        openingFloat: 1000,
        countedCash: 1575,
        note: 'Customer tipped extra cash into till',
      });

      expect(prisma.cashClosing.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          expectedCash: 1500,
          countedCash: 1575,
          variance: 75,
        }),
      });
    });

    it('closeDay: rejects closing if day is already closed', async () => {
      const { svc, prisma } = setupAccounting();
      prisma.cashClosing.findUnique.mockResolvedValueOnce({
        id: 'closed-day',
        branchId: 'b-main',
        businessDate: new Date('2026-10-29T00:00:00.000Z'),
      });

      await expect(
        svc.closeDay('b-main', 'u-owner', {
          businessDate: '2026-10-29',
          openingFloat: 1000,
          countedCash: 1500,
        }),
      ).rejects.toThrow('This day is already closed');
    });
  });

  // =========================================================================
  // 3. Feature 14 & 16: Instant Settlement & Multi-Tender Checkout Math
  // =========================================================================
  describe('Feature 14 & 16: Multi-Tender Checkout & Change Math (settlePayments)', () => {
    it('exact single cash payment calculates zero change and full settlement', () => {
      const res = settlePayments({
        balance: 450,
        payments: [{ method: 'CASH', amount: 450, tendered: 450 }],
      });
      expect(res.fullyPaid).toBe(true);
      expect(res.paidNow).toBe(450);
      expect(res.changeDue).toBe(0);
      expect(res.balanceAfter).toBe(0);
      expect(res.payments[0].changeGiven).toBe(0);
    });

    it('over-tendered cash payment calculates exact change and records tendered', () => {
      const res = settlePayments({
        balance: 180,
        payments: [{ method: 'CASH', amount: 180, tendered: 200 }],
      });
      expect(res.fullyPaid).toBe(true);
      expect(res.paidNow).toBe(180);
      expect(res.changeDue).toBe(20);
      expect(res.balanceAfter).toBe(0);
      expect(res.payments[0].tendered).toBe(200);
      expect(res.payments[0].changeGiven).toBe(20);
    });

    it('rejects tendered on non-cash payments (CARD, UPI, OTHER)', () => {
      expect(() =>
        settlePayments({
          balance: 300,
          payments: [{ method: 'UPI', amount: 300, tendered: 350 }],
        }),
      ).toThrow('Only a cash payment can have an amount received');

      expect(() =>
        settlePayments({
          balance: 300,
          payments: [{ method: 'CARD', amount: 300, tendered: 350 }],
        }),
      ).toThrow('Only a cash payment can have an amount received');
    });

    it('rejects cash payment where tendered is strictly less than applied amount', () => {
      expect(() =>
        settlePayments({
          balance: 500,
          payments: [{ method: 'CASH', amount: 500, tendered: 400 }],
        }),
      ).toThrow('The amount received cannot be less than the payment');
    });

    it('multi-tender split: 3-way split across CASH (with change), UPI, and CARD', () => {
      const res = settlePayments({
        balance: 1250,
        payments: [
          { method: 'UPI', amount: 500 },
          { method: 'CARD', amount: 400 },
          { method: 'CASH', amount: 350, tendered: 500 },
        ],
      });

      expect(res.fullyPaid).toBe(true);
      expect(res.paidNow).toBe(1250);
      expect(res.balanceAfter).toBe(0);
      expect(res.changeDue).toBe(150); // 500 tendered - 350 applied
      expect(res.payments).toHaveLength(3);
      expect(res.payments[2]).toMatchObject({
        method: 'CASH',
        amount: 350,
        tendered: 500,
        changeGiven: 150,
      });
    });

    it('multi-tender overpayment: absorbs excess cash when older client passes raw amount above balance', () => {
      const res = settlePayments({
        balance: 1000,
        payments: [
          { method: 'CARD', amount: 600 },
          { method: 'CASH', amount: 500 }, // Total entered 1100, excess 100
        ],
      });

      expect(res.fullyPaid).toBe(true);
      expect(res.paidNow).toBe(1000);
      expect(res.changeDue).toBe(100);
      expect(res.payments[1]).toMatchObject({
        method: 'CASH',
        amount: 400, // 500 - 100 excess absorbed
        tendered: 500,
        changeGiven: 100,
      });
    });

    it('rejects overpayment when non-cash tender alone exceeds balance', () => {
      expect(() =>
        settlePayments({
          balance: 100,
          payments: [{ method: 'CARD', amount: 150 }],
        }),
      ).toThrow(/only cash can be over-tendered/);
    });

    it('rejects partial payment when allowPartial is omitted or false', () => {
      expect(() =>
        settlePayments({
          balance: 800,
          payments: [{ method: 'CASH', amount: 400 }],
        }),
      ).toThrow('Payments (400) do not cover the total due (800)');
    });

    it('allows partial payment when allowPartial is true', () => {
      const res = settlePayments({
        balance: 800,
        payments: [{ method: 'CASH', amount: 400 }],
        allowPartial: true,
      });

      expect(res.fullyPaid).toBe(false);
      expect(res.paidNow).toBe(400);
      expect(res.balanceAfter).toBe(400);
      expect(res.changeDue).toBe(0);
    });

    it('survives floating point decimal arithmetic without drift', () => {
      const res = settlePayments({
        balance: 149.25,
        payments: [{ method: 'CASH', amount: 149.25, tendered: 200.0 }],
      });

      expect(res.fullyPaid).toBe(true);
      expect(res.changeDue).toBe(50.75);
      expect(res.payments[0].changeGiven).toBe(50.75);
    });

    it('rejects zero or negative payment lines', () => {
      expect(() =>
        settlePayments({
          balance: 100,
          payments: [{ method: 'CASH', amount: 0 }],
        }),
      ).toThrow('Each payment must be more than zero');

      expect(() =>
        settlePayments({
          balance: 100,
          payments: [{ method: 'CASH', amount: -20 }],
        }),
      ).toThrow('Each payment must be more than zero');
    });
  });
});
