'use strict';

/**
 * ViaCEP (Correios) + cruzamento com endereço do pedido.
 * OSS: consulta HTTP no servidor (legado fazia prefetch no browser).
 */

function normalizeDigits(str) {
  if (str == null || str === '') return '';
  return String(str).replace(/\D/g, '');
}

function normalizeText(str) {
  if (str == null || str === '') return '';
  return String(str)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function meaningfulTokens(s) {
  return normalizeText(s)
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

function crossCheckViaCep(address, viaData) {
  const cityOrder = normalizeText(address.city || '');
  const cityVia = normalizeText(viaData.localidade || '');
  const localidadeMatch =
    !cityOrder || !cityVia
      ? true
      : cityOrder === cityVia || cityOrder.includes(cityVia) || cityVia.includes(cityOrder);

  const ufOrder = String(address.state || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 2);
  const ufVia = String(viaData.uf || '')
    .trim()
    .toUpperCase()
    .slice(0, 2);
  const ufMatch = !ufOrder || !ufVia ? true : ufOrder === ufVia;

  const streetOrder = normalizeText(address.street || '');
  const streetVia = normalizeText(viaData.logradouro || '');
  let logradouroClass = 'sem_logradouro_na_base';

  if (!streetVia) {
    logradouroClass = 'sem_logradouro_na_base';
  } else if (!streetOrder) {
    logradouroClass = 'pedido_sem_logradouro';
  } else if (
    streetOrder === streetVia ||
    streetOrder.includes(streetVia) ||
    streetVia.includes(streetOrder)
  ) {
    logradouroClass = 'match';
  } else {
    const toksOrder = new Set(meaningfulTokens(address.street || ''));
    const toksVia = new Set(meaningfulTokens(viaData.logradouro || ''));
    let common = 0;
    for (const t of toksOrder) if (toksVia.has(t)) common += 1;
    if (common >= 2) logradouroClass = 'parcial';
    else if (common === 1) logradouroClass = 'parcial_fraca';
    else logradouroClass = 'divergente';
  }

  const enderecoConsistenteComCep =
    localidadeMatch &&
    ufMatch &&
    logradouroClass !== 'divergente' &&
    logradouroClass !== 'pedido_sem_logradouro';

  return {
    localidadeMatch,
    ufMatch,
    logradouroClass,
    enderecoConsistenteComCep,
  };
}

function finalizeViaCepSuccessBody(address, cepDigits, data) {
  if (data.erro) {
    return {
      skipped: false,
      fetchOk: true,
      cepConsultado: cepDigits,
      cepExisteNaBaseCorreios: false,
      error: 'cep_nao_encontrado_na_base_correios',
      data: null,
      cruzamento: null,
    };
  }

  return {
    skipped: false,
    fetchOk: true,
    cepConsultado: cepDigits,
    cepExisteNaBaseCorreios: true,
    error: null,
    data: {
      cep: data.cep,
      logradouro: data.logradouro || '',
      bairro: data.bairro || '',
      localidade: data.localidade || '',
      uf: data.uf || '',
    },
    cruzamento: crossCheckViaCep(address, data),
  };
}

function buildViaCepReportFromPrefetched(address, pre) {
  if (!address || typeof address !== 'object') {
    return { skipped: true, reason: 'sem_endereco_estruturado' };
  }
  const cepDigits = normalizeDigits(address.cep);
  if (!cepDigits || cepDigits.length !== 8) {
    return {
      skipped: true,
      reason: 'cep_invalido_ou_ausente',
      cepDigits: cepDigits || null,
    };
  }

  if (!pre || typeof pre !== 'object') {
    return {
      skipped: true,
      reason: 'viacep_prefetch_ausente',
      cepDigits,
    };
  }

  if (pre.networkError) {
    return {
      skipped: false,
      fetchOk: false,
      cepConsultado: cepDigits,
      error: String(pre.networkError),
      data: null,
      cruzamento: null,
    };
  }

  if (!pre.httpOk) {
    return {
      skipped: false,
      fetchOk: false,
      cepConsultado: cepDigits,
      error: `http_${pre.httpStatus || 0}`,
      data: null,
      cruzamento: null,
    };
  }

  const data = pre.data;
  if (data == null || typeof data !== 'object') {
    return {
      skipped: false,
      fetchOk: false,
      cepConsultado: cepDigits,
      error: 'resposta_invalida',
      data: null,
      cruzamento: null,
    };
  }

  const dataCep = normalizeDigits(data.cep);
  if (dataCep && dataCep !== cepDigits) {
    return {
      skipped: false,
      fetchOk: false,
      cepConsultado: cepDigits,
      error: 'cep_resposta_diverge_pedido',
      data: null,
      cruzamento: null,
    };
  }

  return finalizeViaCepSuccessBody(address, cepDigits, data);
}

/**
 * Consulta ViaCEP no servidor e monta o report de cruzamento.
 */
async function fetchViaCepReport(address) {
  if (!address || typeof address !== 'object') {
    return { skipped: true, reason: 'sem_endereco_estruturado' };
  }
  const cepDigits = normalizeDigits(address.cep);
  if (!cepDigits || cepDigits.length !== 8) {
    return {
      skipped: true,
      reason: 'cep_invalido_ou_ausente',
      cepDigits: cepDigits || null,
    };
  }

  try {
    const res = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`);
    if (!res.ok) {
      return buildViaCepReportFromPrefetched(address, {
        httpOk: false,
        httpStatus: res.status,
      });
    }
    const data = await res.json();
    return buildViaCepReportFromPrefetched(address, {
      httpOk: true,
      httpStatus: res.status,
      data,
    });
  } catch (err) {
    return buildViaCepReportFromPrefetched(address, {
      httpOk: false,
      networkError: err.message || 'network_error',
    });
  }
}

module.exports = {
  buildViaCepReportFromPrefetched,
  crossCheckViaCep,
  fetchViaCepReport,
};
