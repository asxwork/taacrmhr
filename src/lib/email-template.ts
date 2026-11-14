// The look of every email AMS sends: navy header with the gold logo, a white card, links as gold buttons, a short footer.
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function brandedEmail(subject: string, body: string, opts: { company?: string; appUrl?: string } = {}) {
  const base = (opts.appUrl ?? process.env.APP_URL ?? "").replace(/\/+$/, "");
  const company = opts.company ?? "The Advisor Associates";
  // Lines like "Open: https://…" or a bare link become buttons; the rest are paragraphs.
  const blocks = body.split(/\n{2,}/).map((para) => {
    const lines = para.split("\n");
    const btn = lines.length === 1 && lines[0]!.match(/^(?:(.{1,40}?):\s*)?(https?:\/\/\S+)$/);
    if (btn) {
      const label = btn[1] && !/^(open|link|here)$/i.test(btn[1]) ? btn[1] : /set-password/.test(btn[2]!) ? "Set your password" : "Open in AMS";
      return `<tr><td style="padding:8px 0 16px"><a href="${esc(btn[2]!)}" style="display:inline-block;background:#d4a94a;color:#06111d;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:8px">${esc(label)} &rarr;</a></td></tr>`;
    }
    const html = lines.map((l) => esc(l).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#0a223c">$1</a>').replace(/^[•\-] /, "&bull;&nbsp;")).join("<br>");
    return `<tr><td style="padding:0 0 14px;font-size:15px;line-height:1.6;color:#1f2a37">${html}</td></tr>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb">
<tr><td style="background:#06111d;padding:22px 28px;border-bottom:3px solid #d4a94a">${base ? `<img src="${base}/brand/logo-email.png" alt="${esc(company)}" height="44" style="height:44px;display:block">` : `<span style="color:#e2c47a;font-size:18px;font-weight:600">${esc(company)}</span>`}</td></tr>
<tr><td style="padding:28px 28px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:0 0 18px;font-size:21px;font-weight:600;color:#06111d;line-height:1.3">${esc(subject)}</td></tr>
${blocks}
</table></td></tr>
<tr><td style="padding:16px 28px 22px;border-top:1px solid #f0f1f3;font-size:12px;color:#6b7280;line-height:1.5">${esc(company)} &middot; Advisor Management System${base ? ` &middot; <a href="${base}" style="color:#6b7280">${base.replace(/^https?:\/\//, "")}</a>` : ""}<br>You get this email because of your account in AMS.</td></tr>
</table></td></tr></table></body></html>`;
}
