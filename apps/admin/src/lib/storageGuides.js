/**
 * Guias de armazenamento (S3 / GCS) compartilhados com a página Armazenamento.
 * Passos em Markdown. `steps` pode ser array ou função ({ bucket, keyPrefix }).
 */

function sanitizeBucketName(bucket) {
  const name = String(bucket || '').trim();
  // Só caracteres típicos de nome de bucket S3; evita quebrar o JSON/markdown
  if (!name || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/i.test(name)) {
    return null;
  }
  return name;
}

function buildS3Steps({ bucket } = {}) {
  const bucketName = sanitizeBucketName(bucket) || 'SEU_BUCKET';
  const bucketFromForm = Boolean(sanitizeBucketName(bucket));

  const policyIntro = bucketFromForm
    ? `Em IAM → usuário → **Permissions** → **Add permissions** → **Create inline policy** → aba JSON. A policy abaixo já usa o bucket **\`${bucketName}\`** informado no formulário:`
    : `Em IAM → usuário → **Permissions** → **Add permissions** → **Create inline policy** → aba JSON. Preencha o campo **Bucket** no formulário para personalizar a policy (ou substitua \`SEU_BUCKET\` pelo nome real):`;

  return [
    'No [Console AWS → S3](https://console.aws.amazon.com/s3/), crie um bucket **exclusivo para o Kunk** (só este sistema deve usá-lo). Deixe-o **privado** (Block Public Access ativado). Anote o nome e a região (ex.: `sa-east-1`).',
    `No [IAM](https://console.aws.amazon.com/iam/), crie um **usuário dedicado só para a API do Kunk** (não use a conta root). Como o bucket é exclusivo do sistema, conceda **acesso total a esse bucket**.

${policyIntro}

\`\`\`json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "KunkBucketFullAccess",
      "Effect": "Allow",
      "Action": ["s3:*"],
      "Resource": [
        "arn:aws:s3:::${bucketName}",
        "arn:aws:s3:::${bucketName}/*"
      ]
    }
  ]
}
\`\`\``,
    'Em IAM → usuário → **Security credentials** → **Create access key** (caso de uso: *Application running outside AWS*). Guarde o **Access Key ID** e o **Secret Access Key** — o secret só aparece uma vez.',
    'Nesta página, selecione **Amazon S3**, preencha bucket, região, Access Key e Secret. Clique em **Testar e ativar**: a API valida o bucket, salva as credenciais, cria a pasta `backups/` e liga o módulo de backup.',
  ];
}

export const STORAGE_SETUP_GUIDES = {
  s3: {
    title: 'Como obter as credenciais (Amazon S3)',
    steps: buildS3Steps,
    docs: [
      {
        label: 'AWS S3',
        href: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/GetStartedWithS3.html',
      },
      {
        label: 'IAM Access Keys',
        href: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html',
      },
    ],
  },
  gcs: {
    title: 'Como obter as credenciais (Google Cloud Storage)',
    steps: [
      'No [Console GCP → Cloud Storage](https://console.cloud.google.com/storage), crie um bucket **exclusivo para o Kunk** e **privado** (Uniform access; Public access prevention enforced). Não use o mesmo bucket para outros sistemas.',
      'Em [IAM → Contas de serviço](https://console.cloud.google.com/iam-admin/serviceaccounts), crie uma service account (ex.: `kunk-files`). No bucket → **Permissões**, conceda a essa conta os papéis **Administrador de objetos do Storage** e **Administrador do Storage** (acesso completo ao bucket exclusivo; o segundo é necessário para o teste de conexão).',
      'Na service account → **Keys** → **Add key** → **JSON**. Baixe o arquivo (contém `client_email`, `private_key` e `project_id`).',
      'Nesta página, selecione **Google Cloud Storage**, informe o nome do bucket e clique em **Enviar arquivo JSON**. O Admin extrai as credenciais, testa e, se OK, ativa o bucket e o módulo de backup.',
    ],
    docs: [
      {
        label: 'Cloud Storage',
        href: 'https://cloud.google.com/storage/docs/creating-buckets',
      },
      {
        label: 'Service accounts',
        href: 'https://cloud.google.com/iam/docs/service-account-overview',
      },
    ],
  },
};
