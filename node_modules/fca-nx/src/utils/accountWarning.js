"use strict";

// Recognize Facebook's checkpoint response, not arbitrary chat text. This
// stops automation and leaves acknowledgement/verification to the account owner.
function assertNoWarning(response) {
  const destination = response?.request?.res?.responseUrl || response?.request?.responseURL;
  let checkpoint = false;
  if (destination) {
    try {
      const url = new URL(destination);
      checkpoint = (url.hostname === 'facebook.com' || url.hostname.endsWith('.facebook.com')) && /^\/checkpoint(?:\/|$)/i.test(url.pathname);
    } catch (_) {}
  }
  const body = typeof response?.data === 'string' ? response.data : '';
  const automation = /XCheckpointFBScrapingWarningController|checkpoint(?:\\?\/)+601051028565049/.test(body);
  if (checkpoint || automation) {
    const err = new Error('Facebook account verification required; automation stopped. Review the warning in Facebook.');
    err.code = 'CHECKPOINT_REQUIRED';
    err.error = 'login_blocked';
    throw err;
  }
  return response;
}
module.exports = { assertNoWarning };
