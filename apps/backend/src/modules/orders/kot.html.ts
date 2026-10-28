// Self-printing HTML kitchen ticket — same iframe+window.print() pattern as
// receipt.html.ts, deliberately a separate template rather than reusing
// buildReceiptHtml with a "hide prices" flag: a KOT is read by kitchen
// staff standing at a station under pressure, not a customer, so it needs
// large type, item names as the loudest thing on the page, and zero price/
// tax noise — different enough from a receipt that a shared template with
// conditionals would be harder to read than two small, honest ones.

function esc(value: string | number | null | undefined): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
}

interface KotOrder {
  orderNumber: string;
  type: string;
  createdAt: Date;
  table: { label: string } | null;
  customer: { name: string } | null;
  waiterName?: string | null;
  waiterId?: string | null;
  items: {
    nameSnapshot: string;
    quantity: number;
    kitchenNote: string | null;
    modifiers: { nameSnapshot: string }[];
  }[];
}

export function buildKotHtml({
  branchName,
  order,
  paperWidthMm = 80,
}: {
  branchName: string;
  order: KotOrder;
  paperWidthMm?: 58 | 80;
}): string {
  const dateStr = new Date(order.createdAt).toLocaleString();

  const itemRows = order.items
    .map((item) => {
      const modifierLines = item.modifiers
        .map((m) => `<div class="sub">+ ${esc(m.nameSnapshot)}</div>`)
        .join('');
      const noteLine = item.kitchenNote
        ? `<div class="note">Note: ${esc(item.kitchenNote)}</div>`
        : '';
      return `
        <tr>
          <td class="qty">${item.quantity}×</td>
          <td>${esc(item.nameSnapshot)}${modifierLines}${noteLine}</td>
        </tr>`;
    })
    .join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>KOT ${esc(order.orderNumber)}</title>
<style>
  * { box-sizing: border-box; }
  html { margin: 0; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 0; padding: 4mm; color: #111; width: ${paperWidthMm}mm; font-size: ${paperWidthMm === 58 ? '11px' : '13px'}; }
  p { margin: 0 0 3px; }
  .kot { width: 100%; margin: 0; }
  h1 { font-size: 16px; text-align: center; margin: 0 0 2px; text-transform: uppercase; letter-spacing: 0.5px; }
  .center { text-align: center; }
  .muted { color: #555; font-size: 12px; line-height: 1.4; }
  .rule { border: none; border-top: 1px dashed #999; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; font-size: ${paperWidthMm === 58 ? '13px' : '16px'}; }
  td { padding: 4px 0; vertical-align: top; word-break: break-word; }
  .qty { font-weight: 700; white-space: nowrap; padding-right: 8px; width: 1%; }
  .sub { font-size: 13px; color: #444; padding-left: 4px; }
  .note { font-size: 13px; font-weight: 600; color: #111; padding-left: 4px; }
  @page { size: ${paperWidthMm}mm auto; margin: 0; }
  @media print {
    html, body { width: ${paperWidthMm}mm; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
  <script>
    window.addEventListener('message', function (e) { if (e.data === 'print') window.print(); });
  </script>
  <div class="kot">
    <h1>Kitchen order</h1>
    <p class="center muted">${esc(branchName)}</p>
    <hr class="rule">
    <p class="muted">
      ${esc(dateStr)}<br>
      Order: #${esc(order.orderNumber)} · ${esc(order.type.replace('_', ' '))}
      ${order.table ? `<br><strong>Table: ${esc(order.table.label)}</strong>` : ''}
      ${order.customer ? `<br>Guest: ${esc(order.customer.name)}` : ''}
      ${order.waiterName ? `<br><strong>Waiter: ${esc(order.waiterName)}</strong>` : ''}
    </p>
    <hr class="rule">
    <table>
      <tbody>${itemRows}</tbody>
    </table>
    <hr class="rule">
    ${order.waiterName ? `<p class="center muted"><strong>Server: ${esc(order.waiterName)}${order.waiterId ? ` (ID: ${esc(order.waiterId)})` : ''}</strong></p>` : ''}
  </div>
</body>
</html>`;
}
