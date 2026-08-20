/**
 * Monta texto legível para o modal de erro a partir de ApiError / Error.
 */
export function formatApiErrorMessage(err, fallback = 'Ocorreu um erro inesperado') {
  if (err == null) return fallback;
  if (typeof err === 'string') return err.trim() || fallback;

  const lines = [];
  const main = err.message || err.errors?.[0]?.message || '';
  if (main) lines.push(String(main).trim());

  const details = err.details ?? err.errors?.[0]?.details;
  if (details != null) {
    if (typeof details === 'string' && details.trim() && details.trim() !== main) {
      lines.push(details.trim());
    } else if (Array.isArray(details?.field_violations) && details.field_violations.length) {
      for (const v of details.field_violations) {
        const s = String(v).trim();
        if (s && !lines.includes(s) && !String(main).includes(s)) lines.push(`• ${s}`);
      }
    } else if (Array.isArray(details?.messages)) {
      for (const m of details.messages) {
        const s = String(m).trim();
        if (s && s !== main && !lines.includes(s)) lines.push(s);
      }
    } else if (Array.isArray(details?.errors)) {
      for (const e of details.errors) {
        if (typeof e === 'string') {
          if (e !== main) lines.push(e);
        } else if (e?.message && e.message !== main) {
          lines.push(String(e.message));
        } else if (typeof e === 'object') {
          const entries = Object.entries(e)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
            .join('; ');
          if (entries) lines.push(entries);
        }
      }
    } else if (details?.body && typeof details.body === 'string' && details.body.trim()) {
      const body = details.body.trim();
      // Evita dump de JSON cru (ex.: erro Google Calendar) no modal.
      const looksJson = body.startsWith('{') || body.startsWith('[');
      if (!looksJson && body !== main && body.length < 400) lines.push(body);
    } else if (details?.google_reason && typeof details.google_reason === 'string') {
      /* reason técnico — não exibir; a message da API já é amigável */
    }
  }

  // Lista de errors do envelope da API
  if (Array.isArray(err.errors) && err.errors.length > 1) {
    for (const e of err.errors.slice(1)) {
      if (e?.message && e.message !== main) lines.push(String(e.message));
    }
  }

  const text = lines.filter(Boolean).join('\n').trim();
  return text || fallback;
}
