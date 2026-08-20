'use strict';

/**
 * Extrai código/status de erros AWS SDK v3 / HTTP-like.
 */
function extractAwsMeta(err) {
  if (!err || typeof err !== 'object') {
    return { code: '', status: null, message: String(err || '') };
  }
  const candidates = [err.Code, err.code, err.name]
    .filter((v) => v != null && String(v).trim() !== '')
    .map((v) => String(v).trim());
  const useful = candidates.find((c) => c !== 'UnknownError' && c !== 'Error');
  const code = useful || candidates[0] || '';
  const status = Number(err.$metadata?.httpStatusCode) || null;
  let message = String(err.message || '').trim();
  if (!message || message === 'UnknownError' || message === 'unknown') {
    message = '';
  }
  return { code, status, message };
}

/**
 * Mensagem clara para falhas S3 (teste, put, get, list).
 * @param {unknown} err
 * @param {{ bucket?: string, region?: string, op?: string }} [ctx]
 */
function formatS3Error(err, ctx = {}) {
  const bucket = ctx.bucket || '';
  const region = ctx.region || '';
  const op = ctx.op || 'operação';
  const { code, status, message } = extractAwsMeta(err);
  const codeLower = code.toLowerCase();
  const msgLower = message.toLowerCase();
  const bucketLabel = bucket ? `"${bucket}"` : 'informado';
  const regionHint = region ? ` (região configurada: ${region})` : '';

  if (
    code === 'NoSuchBucket' ||
    code === 'NotFound' ||
    status === 404 ||
    msgLower.includes('nosuchbucket')
  ) {
    return `Bucket S3 ${bucketLabel} não encontrado${regionHint}. Confira o nome e se a região está correta.`;
  }

  if (
    code === 'PermanentRedirect' ||
    code === 'AuthorizationHeaderMalformed' ||
    code === 'IllegalLocationConstraintException' ||
    msgLower.includes('permanent redirect') ||
    (msgLower.includes('endpoint') && msgLower.includes('region'))
  ) {
    return `Bucket S3 ${bucketLabel} existe em outra região${regionHint}. Ajuste o campo Região para a região real do bucket.`;
  }

  if (
    code === 'InvalidAccessKeyId' ||
    code === 'InvalidToken' ||
    code === 'UnrecognizedClientException' ||
    msgLower.includes('security token') ||
    msgLower.includes('access key')
  ) {
    return 'Access Key ID inválida ou inexistente. Gere uma nova access key no IAM e cole no formulário.';
  }

  if (
    code === 'SignatureDoesNotMatch' ||
    msgLower.includes('signature')
  ) {
    return 'Secret Access Key incorreta (assinatura não confere). Confira se copiou o secret completo, sem espaços.';
  }

  if (
    code === 'AccessDenied' ||
    code === 'AllAccessDisabled' ||
    code === 'AccessDeniedException' ||
    status === 403 ||
    msgLower.includes('access denied') ||
    msgLower.includes('not authorized')
  ) {
    if (op === 'head' || op === 'test-head') {
      return `Sem permissão para acessar o bucket ${bucketLabel} (HeadBucket). Confira a policy IAM: s3:HeadBucket / s3:ListBucket no ARN do bucket.`;
    }
    if (op === 'put' || op === 'test-put') {
      return `Sem permissão para gravar no bucket ${bucketLabel}. Inclua s3:PutObject em kunk/*, backups/* e _kunk_probe/* na policy IAM.`;
    }
    if (op === 'get' || op === 'test-get') {
      return `Sem permissão para ler objetos no bucket ${bucketLabel}. Inclua s3:GetObject nos prefixos da policy IAM.`;
    }
    if (op === 'delete' || op === 'test-delete') {
      return `Sem permissão para apagar objetos no bucket ${bucketLabel}. Inclua s3:DeleteObject (necessário também para o teste limpar _kunk_probe/*).`;
    }
    if (op === 'list') {
      return `Sem permissão para listar o bucket ${bucketLabel}. Inclua s3:ListBucket no ARN do bucket (com prefixos kunk/*, backups/*, _kunk_probe/*).`;
    }
    return `Acesso negado ao bucket S3 ${bucketLabel}. Revise a policy IAM do usuário da API (objetos + ListBucket/HeadBucket).`;
  }

  if (code === 'InvalidBucketName' || msgLower.includes('bucket name')) {
    return `Nome de bucket S3 inválido: ${bucketLabel}. Use só minúsculas, números e hífens (3–63 caracteres).`;
  }

  if (
    code === 'CredentialsProviderError' ||
    code === 'CredentialsError' ||
    msgLower.includes('could not load credentials')
  ) {
    return 'Credenciais S3 ausentes ou incompletas. Preencha Access Key ID e Secret Access Key.';
  }

  if (
    code === 'TimeoutError' ||
    code === 'NetworkingError' ||
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    msgLower.includes('timeout') ||
    msgLower.includes('network')
  ) {
    return `Falha de rede ao falar com o S3${regionHint}. Verifique conectividade da API e a região.`;
  }

  // UnknownError / mensagem vazia — usar status HTTP quando houver
  if (!message || code === 'UnknownError' || codeLower === 'unknownerror') {
    if (status === 301 || status === 307) {
      return `Bucket S3 ${bucketLabel} redirecionou a requisição${regionHint}. Provavelmente a região está errada.`;
    }
    if (status === 403) {
      return `Acesso negado ao bucket S3 ${bucketLabel} (HTTP 403). Confira chave IAM e permissões HeadBucket/PutObject/_kunk_probe.`;
    }
    if (status === 404) {
      return `Bucket S3 ${bucketLabel} não encontrado (HTTP 404)${regionHint}.`;
    }
    if (status === 400) {
      return `Requisição S3 rejeitada (HTTP 400) para o bucket ${bucketLabel}${regionHint}. Confira nome do bucket, região e credenciais.`;
    }
    return `Falha no S3 no bucket ${bucketLabel}${regionHint} (código: ${code || 'desconhecido'}${status ? `, HTTP ${status}` : ''}). Confira região, nome do bucket e policy IAM.`;
  }

  return `Falha S3 (${op}) no bucket ${bucketLabel}: ${message}${code && code !== message ? ` [${code}]` : ''}`;
}

/**
 * Mensagem clara para falhas GCS.
 * @param {unknown} err
 * @param {{ bucket?: string, op?: string }} [ctx]
 */
function formatGcsError(err, ctx = {}) {
  const bucket = ctx.bucket || '';
  const op = ctx.op || 'operação';
  const bucketLabel = bucket ? `"${bucket}"` : 'informado';
  const code = String(err?.code || err?.name || '');
  const message = String(err?.message || '').trim();
  const msgLower = message.toLowerCase();

  if (code === '404' || Number(code) === 404 || msgLower.includes('not found')) {
    return `Bucket GCS ${bucketLabel} não encontrado. Confira o nome e o project_id da service account.`;
  }

  if (code === '403' || Number(code) === 403 || msgLower.includes('permission') || msgLower.includes('denied')) {
    if (op === 'put' || op === 'test-put') {
      return `Sem permissão para gravar no bucket GCS ${bucketLabel}. Conceda papéis de Storage à service account (objetos + admin do bucket para o teste).`;
    }
    return `Acesso negado ao bucket GCS ${bucketLabel}. Verifique IAM da service account no bucket.`;
  }

  if (msgLower.includes('invalid_grant') || msgLower.includes('invalid_client') || msgLower.includes('private key')) {
    return 'Credenciais GCS inválidas. Reenvie o JSON da service account (client_email / private_key).';
  }

  if (!message || message === 'UnknownError') {
    return `Falha no GCS no bucket ${bucketLabel} (código: ${code || 'desconhecido'}). Confira nome do bucket e permissões da service account.`;
  }

  return `Falha GCS (${op}) no bucket ${bucketLabel}: ${message}${code ? ` [${code}]` : ''}`;
}

module.exports = {
  formatS3Error,
  formatGcsError,
  extractAwsMeta,
};
