const STORAGE_PROMPT_KEY = 'kunk.admin.storage.prompt.dismissed';

export function isStoragePromptDismissed() {
  try {
    return localStorage.getItem(STORAGE_PROMPT_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissStoragePrompt() {
  try {
    localStorage.setItem(STORAGE_PROMPT_KEY, '1');
  } catch {
    /* ignore */
  }
}

export const DRIVER_LABELS = {
  local: 'Disco local',
  s3: 'Amazon S3',
  gcs: 'Google Cloud Storage',
};

/**
 * URL do console do provedor apontando para a pasta do backup no bucket.
 * Retorna null se faltar bucket/prefix ou se o driver não for cloud.
 */
export function backupBucketConsoleUrl({ driver, status, backup }) {
  const prefix = String(backup?.prefix || '').trim();
  if (!prefix) return null;

  if (driver === 's3') {
    const bucket = String(status?.s3?.bucket || '').trim();
    const region = String(status?.s3?.region || 'us-east-1').trim() || 'us-east-1';
    if (!bucket) return null;
    const qs = new URLSearchParams({
      prefix,
      region,
    });
    return `https://s3.console.aws.amazon.com/s3/buckets/${encodeURIComponent(bucket)}?${qs}`;
  }

  if (driver === 'gcs') {
    const bucket = String(status?.gcs?.bucket || '').trim();
    if (!bucket) return null;
    const path = prefix.replace(/^\/+/, '').replace(/\/+$/, '');
    const segments = [bucket, ...path.split('/').filter(Boolean)].map(encodeURIComponent);
    let url = `https://console.cloud.google.com/storage/browser/${segments.join('/')}`;
    const project = String(status?.gcs?.project_id || '').trim();
    if (project) {
      url += `?project=${encodeURIComponent(project)}`;
    }
    return url;
  }

  return null;
}

/**
 * Regiões AWS com S3 (AWS General Reference — endpoints S3).
 * value = region code; label = nome + código.
 */
export const AWS_S3_REGIONS = [
  { value: 'us-east-1', label: 'US East (N. Virginia) — us-east-1' },
  { value: 'us-east-2', label: 'US East (Ohio) — us-east-2' },
  { value: 'us-west-1', label: 'US West (N. California) — us-west-1' },
  { value: 'us-west-2', label: 'US West (Oregon) — us-west-2' },
  { value: 'af-south-1', label: 'Africa (Cape Town) — af-south-1' },
  { value: 'ap-east-1', label: 'Asia Pacific (Hong Kong) — ap-east-1' },
  { value: 'ap-east-2', label: 'Asia Pacific (Taipei) — ap-east-2' },
  { value: 'ap-south-1', label: 'Asia Pacific (Mumbai) — ap-south-1' },
  { value: 'ap-south-2', label: 'Asia Pacific (Hyderabad) — ap-south-2' },
  { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo) — ap-northeast-1' },
  { value: 'ap-northeast-2', label: 'Asia Pacific (Seoul) — ap-northeast-2' },
  { value: 'ap-northeast-3', label: 'Asia Pacific (Osaka) — ap-northeast-3' },
  { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore) — ap-southeast-1' },
  { value: 'ap-southeast-2', label: 'Asia Pacific (Sydney) — ap-southeast-2' },
  { value: 'ap-southeast-3', label: 'Asia Pacific (Jakarta) — ap-southeast-3' },
  { value: 'ap-southeast-4', label: 'Asia Pacific (Melbourne) — ap-southeast-4' },
  { value: 'ap-southeast-5', label: 'Asia Pacific (Malaysia) — ap-southeast-5' },
  { value: 'ap-southeast-6', label: 'Asia Pacific (New Zealand) — ap-southeast-6' },
  { value: 'ap-southeast-7', label: 'Asia Pacific (Thailand) — ap-southeast-7' },
  { value: 'ca-central-1', label: 'Canada (Central) — ca-central-1' },
  { value: 'ca-west-1', label: 'Canada West (Calgary) — ca-west-1' },
  { value: 'eu-central-1', label: 'Europe (Frankfurt) — eu-central-1' },
  { value: 'eu-central-2', label: 'Europe (Zurich) — eu-central-2' },
  { value: 'eu-west-1', label: 'Europe (Ireland) — eu-west-1' },
  { value: 'eu-west-2', label: 'Europe (London) — eu-west-2' },
  { value: 'eu-west-3', label: 'Europe (Paris) — eu-west-3' },
  { value: 'eu-south-1', label: 'Europe (Milan) — eu-south-1' },
  { value: 'eu-south-2', label: 'Europe (Spain) — eu-south-2' },
  { value: 'eu-north-1', label: 'Europe (Stockholm) — eu-north-1' },
  { value: 'il-central-1', label: 'Israel (Tel Aviv) — il-central-1' },
  { value: 'mx-central-1', label: 'Mexico (Central) — mx-central-1' },
  { value: 'me-south-1', label: 'Middle East (Bahrain) — me-south-1' },
  { value: 'me-central-1', label: 'Middle East (UAE) — me-central-1' },
  { value: 'sa-east-1', label: 'South America (São Paulo) — sa-east-1' },
  { value: 'us-gov-east-1', label: 'AWS GovCloud (US-East) — us-gov-east-1' },
  { value: 'us-gov-west-1', label: 'AWS GovCloud (US-West) — us-gov-west-1' },
];
