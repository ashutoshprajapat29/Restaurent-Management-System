import { BadRequestException } from '@nestjs/common';
import { AccountingService } from './accounting.service';

// Guards the bug where report windows were cut at UTC midnight instead of
// the restaurant's local midnight.
describe('AccountingService day windows', () => {
  function setup() {
    const prisma = {
      payment: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      refund: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      },
      expense: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'exp1', ...data })),
      },
      cashClosing: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const time = { tzForBranch: jest.fn().mockResolvedValue('Asia/Kolkata') };
    return {
      svc: new AccountingService(prisma as never, time as never),
      prisma,
    };
  }

  it('cuts the cash-close window at local (IST) midnight', async () => {
    const { svc, prisma } = setup();
    await svc.closingPreview('b1', '2026-10-04');
    const range = prisma.payment.aggregate.mock.calls[0][0].where.createdAt;
    expect(range.gte.toISOString()).toBe('2026-10-03T18:30:00.000Z');
    expect(range.lt.toISOString()).toBe('2026-10-04T18:30:00.000Z');
    expect(prisma.refund.aggregate.mock.calls[0][0].where.createdAt).toEqual(
      range,
    );
  });

  it('aggregates sales across tenders including CASH minus refunds', async () => {
    const { svc, prisma } = setup();
    prisma.payment.aggregate.mockResolvedValueOnce({ _sum: { amount: 500 } });
    prisma.refund.aggregate.mockResolvedValueOnce({ _sum: { amount: 50 } });
    prisma.expense.aggregate.mockResolvedValueOnce({ _sum: { amount: 100 } });
    prisma.payment.groupBy.mockResolvedValueOnce([
      { method: 'UPI', _sum: { amount: 300 } },
      { method: 'CARD', _sum: { amount: 200 } },
    ]);

    const res = await svc.closingPreview('b1', '2026-10-04', 1000);

    expect(res.businessDate).toBe('2026-10-04');
    expect(res.openingFloat).toBe(1000);
    expect(res.cashSales).toBe(450); // 500 - 50
    expect(res.cashExpenses).toBe(100);
    expect(res.expectedCash).toBe(1350); // 1000 + 450 - 100
    expect(res.tenderTotals).toEqual({
      UPI: 300,
      CARD: 200,
      CASH: 450,
    });
    expect(res.totalSales).toBe(950); // 300 + 200 + 450
  });

  describe('createExpense validations', () => {
    it('blocks cash expenses if day is already closed', async () => {
      const { svc, prisma } = setup();
      prisma.cashClosing.findUnique.mockResolvedValueOnce({
        id: 'closing-1',
        branchId: 'b1',
        businessDate: new Date('2026-10-04T00:00:00.000Z'),
      });

      await expect(
        svc.createExpense('b1', 'u1', {
          spentOn: '2026-10-04',
          category: 'SUPPLIES',
          amount: 50,
          paidFromCash: true,
          note: 'Milk purchase',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows cash expenses if day is open', async () => {
      const { svc, prisma } = setup();
      prisma.cashClosing.findUnique.mockResolvedValueOnce(null);

      const res = await svc.createExpense('b1', 'u1', {
        spentOn: '2026-10-04',
        category: 'SUPPLIES',
        amount: 50,
        paidFromCash: true,
        note: 'Milk purchase',
      });

      expect(res).toBeDefined();
      expect(prisma.expense.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            branchId: 'b1',
            createdById: 'u1',
            amount: 50,
            paidFromCash: true,
          }),
        }),
      );
    });

    it('allows non-cash expenses even if day is closed', async () => {
      const { svc, prisma } = setup();

      const res = await svc.createExpense('b1', 'u1', {
        spentOn: '2026-10-04',
        category: 'EQUIPMENT',
        amount: 500,
        paidFromCash: false,
        note: 'Bank transfer for fridge repair',
      });

      expect(res).toBeDefined();
      expect(prisma.cashClosing.findUnique).not.toHaveBeenCalled();
      expect(prisma.expense.create).toHaveBeenCalled();
    });
  });
});
