export const EMAIL_CONFIG_PATH = '/servicos-externos/email';

const EMAIL_PROMPT_KEY = 'kunk.admin.email.prompt.dismissed';

export function isEmailPromptDismissed() {
  try {
    return localStorage.getItem(EMAIL_PROMPT_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissEmailPrompt() {
  try {
    localStorage.setItem(EMAIL_PROMPT_KEY, '1');
  } catch {
    /* ignore */
  }
}

/** Módulo considerado ativo quando o flag Admin está ligado. */
export function isEmailModuleActive(servicePayload) {
  if (!servicePayload || servicePayload.service !== 'email') return null;
  return Boolean(servicePayload.enabled);
}
