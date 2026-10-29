// Ported from nodedr-pos's frontend/lib/print.ts: loads the backend's
// self-printing receipt HTML into a hidden same-page iframe rather than a
// new tab, so there's no blank/finished tab left for the cashier to notice
// and close. The OS print dialog still opens exactly as it would for any
// other page (any printer, or "Save as PDF").
let printFrame: HTMLIFrameElement | null = null;

function getPrintFrame(): HTMLIFrameElement {
  if (printFrame) return printFrame;
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  // Positioned far off-screen rather than display:none/width:0 — a 0-width
  // frame forces the browser to lay out the receipt at 0px before printing,
  // clipping the right-aligned amount columns. A real box lets it lay out
  // normally; the huge negative offset keeps it invisible without affecting
  // page layout.
  frame.style.position = "fixed";
  frame.style.top = "-10000px";
  frame.style.left = "-10000px";
  frame.style.width = "380px";
  frame.style.height = "600px";
  frame.style.border = "none";
  document.body.appendChild(frame);
  printFrame = frame;
  return frame;
}

/** Bill figures the cashier has typed but not yet saved (see receipt route). */
export type BillQuery = Record<string, string | number | undefined>;

export function billQueryString(adj: BillQuery = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(adj)) {
    if (v !== undefined && v !== "" && v !== 0) q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `&${s}` : "";
}

/** Browser print of the bill (open order) or receipt (paid order). Read-only. */
export function openReceiptPrint(
  orderId: string,
  branchId: string,
  adj: BillQuery = {},
  paperWidthMm: 58 | 80 = 80,
) {
  const frame = getPrintFrame();
  frame.style.width = paperWidthMm === 58 ? "260px" : "380px";
  frame.onload = () => {
    const win = frame.contentWindow;
    if (!win) return;
    try {
      win.focus();
      win.print();
    } catch {
      win.postMessage("print", "*");
    }
  };
  // Force a reload even if printing the same order twice in a row.
  frame.src = `/api/v1/orders/${orderId}/receipt?branchId=${branchId}${billQueryString(adj)}&width=${paperWidthMm}&t=${Date.now()}`;
}

export function openKotPrint(
  orderId: string,
  branchId: string,
  paperWidthMm: 58 | 80 = 80,
) {
  const frame = getPrintFrame();
  frame.style.width = paperWidthMm === 58 ? "260px" : "380px";
  frame.onload = () => {
    const win = frame.contentWindow;
    if (!win) return;
    try {
      win.focus();
      win.print();
    } catch {
      win.postMessage("print", "*");
    }
  };
  frame.src = `/api/v1/orders/${orderId}/kot?branchId=${branchId}&width=${paperWidthMm}&t=${Date.now()}`;
}
