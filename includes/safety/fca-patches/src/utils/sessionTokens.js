"use strict";
function decode(value) {
  return String(value).replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&').replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, n) => {
      const code = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    });
}
function extractTokens(html) {
  if (typeof html !== 'string') return {};
  let fb_dtsg, jazoest;
  // Only token-bearing modules/inputs; never an arbitrary JSON "token" field.
  const module = html.match(/"DTSG(?:Init|Initial)Data"\s*,\s*\[\s*\]\s*,\s*\{\s*"token"\s*:\s*("(?:\\.|[^"\\])*")/);
  if (module) { try { fb_dtsg = JSON.parse(module[1]); } catch (_) {} }
  for (const input of html.match(/<input\b[^>]*>/gi) || []) {
    const attrs = {};
    for (const match of input.matchAll(/\b(name|value)\s*=\s*(["'])(.*?)\2/gi)) attrs[match[1].toLowerCase()] = decode(match[3]);
    if (attrs.name === 'fb_dtsg' && !fb_dtsg) fb_dtsg = attrs.value;
    if (attrs.name === 'jazoest') jazoest = attrs.value;
  }
  if (!jazoest) jazoest = html.match(/"jazoest"\s*:\s*"?([0-9]+)/)?.[1] || html.match(/[?&]jazoest=([0-9]+)/)?.[1];
  if (typeof fb_dtsg !== 'string' || !fb_dtsg || /[\x00-\x20\x7f]/.test(fb_dtsg)) fb_dtsg = undefined;
  if (!/^[0-9]+$/.test(jazoest || '')) jazoest = undefined;
  return { fb_dtsg, jazoest };
}
function applyTokens(ctx, tokens) {
  if (!tokens.fb_dtsg || !tokens.jazoest) {
    const e = new Error('Refresh response has incomplete tokens; previous tokens preserved.');
    e.code = 'SESSION_TOKENS_UNAVAILABLE'; throw e;
  }
  ctx.fb_dtsg = tokens.fb_dtsg;
  ctx.jazoest = tokens.jazoest;
  ctx.ttstamp = '2';
  for (let i = 0; i < ctx.fb_dtsg.length; i++) ctx.ttstamp += ctx.fb_dtsg.charCodeAt(i);
}
module.exports = { extractTokens, applyTokens };
