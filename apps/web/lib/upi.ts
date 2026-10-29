// UPI deep link per the NPCI linking spec. Scanning the QR (or tapping the
// link on a phone) opens any UPI app with the payee and exact amount filled.
export function buildUpiUri(opts: {
  vpa: string;
  name?: string | null;
  amount: number;
  note?: string;
  ref?: string;
}): string {
  if (!opts.vpa || !opts.vpa.includes("@")) throw new Error("Invalid UPI VPA");
  if (opts.amount < 0) throw new Error("Invalid amount");
  const q = new URLSearchParams();
  q.set("pa", opts.vpa);
  if (opts.name) q.set("pn", opts.name.slice(0, 60));
  if (opts.amount > 0) q.set("am", opts.amount.toFixed(2));
  q.set("cu", "INR");
  if (opts.note) q.set("tn", opts.note.slice(0, 60));
  if (opts.ref) q.set("tr", opts.ref.slice(0, 35));
  // URLSearchParams encodes spaces as "+"; UPI apps expect %20.
  return `upi://pay?${q.toString().replace(/\+/g, "%20")}`;
}
