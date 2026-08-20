/** Limite da API: 5 register-email / IP / 15 min — reservamos 4 para margem. */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_REGISTERS = 4;

const timestamps = [];

function prune(now = Date.now()) {
  while (timestamps.length && now - timestamps[0] >= WINDOW_MS) {
    timestamps.shift();
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Aguarda slot antes de POST /auth/associate/register-email (fallback sem PG_URL).
 */
export async function acquireRegisterSlot() {
  for (;;) {
    const now = Date.now();
    prune(now);
    if (timestamps.length < MAX_REGISTERS) {
      timestamps.push(now);
      return;
    }
    const waitMs = timestamps[0] + WINDOW_MS - now + 1000;
    await sleep(Math.max(waitMs, 5000));
  }
}
