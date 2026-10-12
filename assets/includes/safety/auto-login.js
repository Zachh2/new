/**
 * Safe auto-login handler
 * Prevents bot crash when auto-login module is missing.
 */

function createAutoLogin(options = {}) {
  let paused = false;
  let healthyState = false;

  return {
    async run(reason = 'unknown') {
      if (paused) return { status: 'paused' };

      try {
        if (typeof options.enabled === 'function' && !options.enabled()) {
          return { status: 'disabled' };
        }

        if (typeof options.credentials !== 'function') {
          return { status: 'retry_later', retryAt: Date.now() + 300000 };
        }

        const creds = await options.credentials();
        if (!creds) {
          return { status: 'retry_later', retryAt: Date.now() + 300000 };
        }

        if (typeof options.authenticate === 'function') {
          const cookies = await options.authenticate(creds);
          if (cookies && typeof options.acceptSession === 'function') {
            await options.acceptSession(cookies);
          }
          return { status: 'success' };
        }
      } catch (e) {
        console.warn('[auto-login] recovery failed:', e.message);
      }

      return { status: 'retry_later', retryAt: Date.now() + 300000 };
    },

    pause() {
      paused = true;
    },

    healthy() {
      healthyState = true;
      return healthyState;
    }
  };
}

module.exports = {
  createAutoLogin
};
