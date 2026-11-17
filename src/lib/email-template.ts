// The look of every email AMS sends: navy header with the gold logo, a white card, links as gold buttons, a short footer.
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function brandedEmail(subject: string, body: string, opts: { company?: string; appUrl?: string } = {}) {
  const base = (opts.appUrl ?? process.env.APP_URL ?? "").replace(/\/+$/, "");
  const company = opts.company ?? "The Advisor Associates";
  // A link on its own line ("Open: https://…", or a line of text ending in ":" followed by the link) becomes a button,
  // with the plain link under it for mail apps that block buttons. The rest are paragraphs.
  const blocks = body.split(/\n{2,}/).map((para) => {
    const lines = para.split("\n");
    const last = lines.at(-1)!.trim();
    const one = lines.length === 1 && last.match(/^(?:(.{1,60}?):\s*)?(https?:\/\/\S+)$/);
    const two = lines.length >= 2 && /^https?:\/\/\S+$/.test(last) && lines.at(-2)!.trim();
    if (one || two) {
      const url = one ? one[2]! : last;
      const lead = one ? one[1] : String(two).replace(/:\s*$/, "");
      const label = lead && lead.length <= 40 && !/^(open|link|here)$/i.test(lead) ? lead.replace(/\s+here$/i, "") : /set-password/.test(url) ? "Set your password" : /verify-email/.test(url) ? "Verify my email" : /\/i\//.test(url) ? "View invoice" : "Open in AMS";
      const before = two ? lines.slice(0, -1) : [];
      const intro = before.length && (!lead || lead.length > 40) ? `<tr><td style="padding:0 0 10px;font-size:15px;line-height:1.6;color:#1f2a37">${before.map((l) => esc(l)).join("<br>")}</td></tr>` : "";
      return `${intro}${emailButton(url, label)}`;
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

/**
 * A button that works in every mail app (table-based, so Outlook shows it too), with the full link written out under
 * it in case the button is blocked.
 */
export function emailButton(url: string, label: string, color = "#d4a94a", text = "#06111d") {
  return `<tr><td style="padding:6px 0 18px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${color}" style="border-radius:8px">
<a href="${esc(url)}" target="_blank" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:${text};text-decoration:none;border-radius:8px">${esc(label)} &rarr;</a>
</td></tr></table>
<p style="margin:10px 0 0;font-size:12px;line-height:1.5;color:#6b7280">Button not working? Copy this link into your browser:<br><a href="${esc(url)}" style="color:#0a223c;word-break:break-all">${esc(url)}</a></p>
</td></tr>`;
}
