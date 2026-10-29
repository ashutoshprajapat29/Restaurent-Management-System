import { buildKotHtml } from './kot.html';

const baseKot = {
  branchName: 'Main Kitchen',
  order: {
    orderNumber: 'KOT-101',
    type: 'DINE_IN',
    createdAt: new Date('2026-10-28T18:00:00Z'),
    table: { label: 'T-12' },
    customer: { name: 'John Doe' },
    items: [
      {
        nameSnapshot: 'Paneer Butter Masala',
        quantity: 2,
        kitchenNote: 'Extra spicy, no cilantro',
        modifiers: [{ nameSnapshot: 'Extra Butter' }],
      },
    ],
  },
};

describe('buildKotHtml', () => {
  it('renders KOT with 80mm width by default', () => {
    const html = buildKotHtml(baseKot);
    expect(html).toContain('width: 80mm');
    expect(html).toContain('size: 80mm auto');
    expect(html).toContain('KOT-101');
    expect(html).toContain('Table: T-12');
    expect(html).toContain('Paneer Butter Masala');
    expect(html).toContain('Note: Extra spicy, no cilantro');
    expect(html).toContain('+ Extra Butter');

  });

  it('renders KOT with 58mm width when specified', () => {
    const html = buildKotHtml({ ...baseKot, paperWidthMm: 58 });
    expect(html).toContain('width: 58mm');
    expect(html).toContain('size: 58mm auto');
  });

  it('includes waiter attribution in header and footer when waiter details are provided', () => {
    const html = buildKotHtml({
      ...baseKot,
      order: {
        ...baseKot.order,
        waiterName: 'Sarah Connor',
        waiterId: 'waiter-777',
      },
    });
    expect(html).toContain('Waiter: Sarah Connor');
    expect(html).toContain('Server: Sarah Connor (ID: waiter-777)');
  });

  it('omits waiter attribution when waiter details are absent', () => {
    const html = buildKotHtml(baseKot);
    expect(html).not.toContain('Waiter:');
    expect(html).not.toContain('Server:');
  });
});
