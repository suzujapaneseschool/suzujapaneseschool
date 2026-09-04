// Shared branded HTML email template — built with inline styles and
// <table> layout on purpose (not flexbox/grid), because that's what
// actually survives Gmail, Outlook and Apple Mail's very different CSS
// support without breaking. Matches the site's palette:
// ink #1f1a14, cream #fbf7ec, mango #f5b800, mango-deep #e89a00,
// amber #f08a1d, gold-soft #e3cd96.

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

const FONT_SERIF = "Georgia,'Times New Roman',serif";
const FONT_SANS = "'Segoe UI',Helvetica,Arial,sans-serif";

export function emailShell({ title, kicker, bodyHtml }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(title)}</title>
<style>
  @media screen and (max-width:600px) {
    .email-container { width:100% !important; }
    .email-pad { padding:30px 24px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f3ede0;">
<div style="background:#f3ede0;padding:32px 16px;">
  <table role="presentation" class="email-container" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;">
    <tr>
      <td style="background:#1f1a14;border-radius:20px 20px 0 0;padding:34px 30px;text-align:center;">
        <div style="font-family:${FONT_SERIF};font-size:38px;line-height:1;color:#f5b800;">鈴</div>
        <div style="font-family:${FONT_SANS};font-weight:700;letter-spacing:3px;text-transform:uppercase;font-size:12px;color:#fbf7ec;margin-top:10px;">Suzu Sensei</div>
        ${kicker ? `<div style="font-family:${FONT_SANS};font-weight:700;letter-spacing:2px;text-transform:uppercase;font-size:11px;color:#f5b800;margin-top:14px;">${escapeHtml(kicker)}</div>` : ''}
      </td>
    </tr>
    <tr>
      <td class="email-pad" style="background:#fbf7ec;padding:40px 36px;border-left:1px solid #e3cd96;border-right:1px solid #e3cd96;font-family:${FONT_SERIF};color:#1f1a14;">
        ${bodyHtml}
      </td>
    </tr>
    <tr>
      <td style="background:#fbf7ec;border-radius:0 0 20px 20px;border:1px solid #e3cd96;border-top:none;padding:24px 36px;text-align:center;">
        <div style="font-family:${FONT_SANS};font-size:12px;color:#8a8072;">Suzu Sensei &middot; Japanese Lessons for the World</div>
        <div style="font-family:${FONT_SERIF};font-size:13px;color:#e89a00;margin-top:6px;">どうぞよろしくお願いします。</div>
      </td>
    </tr>
  </table>
</div>
</body>
</html>`;
}

export function detailRow(label, value) {
  if (!value) return '';
  return `<tr>
    <td style="padding:11px 0;border-bottom:1px dashed #e3cd96;font-family:${FONT_SANS};font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#8a8072;width:120px;vertical-align:top;white-space:nowrap;">${label}</td>
    <td style="padding:11px 0 11px 16px;border-bottom:1px dashed #e3cd96;font-family:${FONT_SERIF};font-size:15px;color:#1f1a14;vertical-align:top;">${value}</td>
  </tr>`;
}

export function detailCard(rowsHtml) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background:#ffffff;border:1.5px solid #e3cd96;border-radius:14px;">
    <tr><td style="padding:4px 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>
    </td></tr>
  </table>`;
}

export function ctaButton(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 4px;">
    <tr><td style="border-radius:40px;background:#e89a00;">
      <a href="${href}" style="display:inline-block;padding:14px 30px;font-family:${FONT_SANS};font-weight:700;font-size:14px;color:#1f1a14;text-decoration:none;border-radius:40px;">${escapeHtml(label)}</a>
    </td></tr>
  </table>`;
}

export function paragraph(text) {
  return `<p style="font-family:${FONT_SERIF};font-size:16px;line-height:1.6;color:#1f1a14;margin:0 0 16px;">${text}</p>`;
}

export function heading(text) {
  return `<h1 style="font-family:${FONT_SERIF};font-size:24px;font-weight:700;color:#1f1a14;margin:0 0 16px;">${escapeHtml(text)}</h1>`;
}
