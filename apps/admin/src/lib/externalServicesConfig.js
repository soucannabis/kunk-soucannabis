export async function loadExternalServices(api) {
  const res = await api.listExternalServices();
  return res.data || { services: [] };
}

export async function loadExternalService(api, service) {
  const res = await api.getExternalService(service);
  return res.data;
}

export async function saveExternalServiceFlags(api, service, flags) {
  const res = await api.patchExternalService(service, flags);
  return res.data;
}

export async function saveExternalCredentials(api, service, fields, runTest = true) {
  const res = await api.putExternalCredentials(service, { fields, run_test: runTest });
  return res.data;
}

export async function testExternalService(api, service) {
  const res = await api.testExternalService(service);
  return res.data;
}

export async function sendExternalTestEmail(api, to) {
  const res = await api.sendExternalTestEmail(to);
  return res.data;
}

export async function startMelhorEnvioOAuth(api) {
  const res = await api.melhorEnvioOAuthAuthorize();
  const url = res.data?.url;
  if (!url) throw new Error('URL OAuth Melhor Envio ausente');
  return url;
}

export async function getMelhorEnvioOAuthStatus(api) {
  const res = await api.melhorEnvioOAuthStatus();
  return res.data;
}

export async function activateMelhorEnvioProduction(api) {
  const res = await api.activateMelhorEnvioProduction();
  return res.data;
}

export async function activateMelhorEnvioSandbox(api) {
  const res = await api.activateMelhorEnvioSandbox();
  return res.data;
}

export async function startGoogleCalendarOAuth(api) {
  const res = await api.googleCalendarOAuthAuthorizeUrl();
  const url = res.data?.url;
  if (!url) throw new Error('URL OAuth Google Calendar ausente');
  return url;
}

export async function getGoogleCalendarOAuthStatus(api) {
  const res = await api.googleCalendarOAuthStatus();
  return res.data;
}
