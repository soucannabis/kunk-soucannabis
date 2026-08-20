/**
 * Guias de credenciais das telas de Serviços externos.
 * Passos em Markdown (renderizar com react-markdown).
 */
export const CREDENTIAL_SETUP_GUIDES = {
  loggi: {
    title: 'Como obter as credenciais',
    steps: [
      'Acesse o portal [Loggi Empresas](https://www.loggi.com/empresas/) (ou o ambiente de homologação) com a conta da associação.',
      'Peça ao time Loggi (Sales Engineering / suporte API) ou abra a área de **API / integrações** e obtenha as credenciais OAuth do aplicativo: **Client ID**, **Client Secret** e o **Company ID**.',
      'Cole esses valores nos campos abaixo. A URL base padrão de produção é `https://api.loggi.com`. Auth oficial: OAuth 2.0 client credentials (`POST …/v2/oauth2/token`).',
      'Clique em **Autenticar**. Depois preencha **Dados de envio** (remetente) antes de ativar cotação/etiqueta.',
    ],
    docs: [
      {
        label: 'API Loggi',
        href: 'https://docs.api.loggi.com/reference/nossa-documenta%C3%A7%C3%A3o',
      },
      { label: 'Criar cotação', href: 'https://docs.api.loggi.com/reference/quote' },
    ],
  },
  melhorenvio: {
    title: 'Como obter as credenciais OAuth',
    steps: [
      'Acesse o [Melhor Envio](https://melhorenvio.com.br/) e entre na conta da loja / associação.',
      'Em **Integrações → API** (ou “Meus aplicativos”), crie um aplicativo OAuth e copie o **Client ID** e o **Client Secret**.',
      'Em URIs de redirecionamento, cole a **Redirect URI** exibida nesta página (campo abaixo / botão copiar).',
      'Cole Client ID e Client Secret nos campos e clique em **Autenticar**. O sistema abre o Melhor Envio para autorizar; ao voltar, o refresh token fica salvo. Preencha **Dados de envio** antes de ativar cotação/etiqueta.',
    ],
    docs: [
      {
        label: 'Introdução API',
        href: 'https://docs.melhorenvio.com.br/reference/introducao-api-melhor-envio',
      },
      { label: 'Autenticação', href: 'https://docs.melhorenvio.com.br/docs/autenticacao' },
    ],
  },
  geoapify: {
    title: 'Como obter as credenciais',
    steps: [
      'Crie uma conta em [geoapify.com](https://www.geoapify.com).',
      'No painel [myprojects.geoapify.com](https://myprojects.geoapify.com), abra **API Keys** e crie (ou copie) uma chave.',
      'Cole a **API Key** no campo abaixo e clique em **Autenticar**. O Kunk valida com um geocode leve (Brasil). ViaCEP (Correios) não exige credencial.',
      'Com o módulo ativo, marque **Usar na verificação de endereço** para o fluxo composto ViaCEP + Geoapify.',
    ],
    docs: [
      { label: 'Geocoding API', href: 'https://www.geoapify.com/geocoding-api/' },
      { label: 'API Docs', href: 'https://apidocs.geoapify.com/' },
      { label: 'ViaCEP', href: 'https://viacep.com.br/' },
    ],
  },
  google_calendar: {
    title: 'Como obter as credenciais OAuth',
    steps: [
      'Abra o [Google Cloud Console](https://console.cloud.google.com/) e selecione (ou crie) o projeto da associação.',
      'Em **APIs e serviços → Biblioteca**, ative a [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com).',
      'Em **APIs e serviços → Tela de consentimento OAuth**, configure o app (tipo Externo ou Interno).',
      'Em **Clientes → Criar clientes**, escolha tipo **Aplicativo da Web**.',
      'Em **URIs de redirecionamento autorizados**, cole a **Redirect URI** exibida abaixo nesta página (botão copiar).',
      'Copie o **Client ID** e o **Client Secret** para os campos abaixo.',
      'Clique em **Autenticar** — o sistema salva as credenciais, grava a Redirect URI automaticamente, testa e abre o Google para autorizar a conta da associação. Depois selecione o calendário principal.',
    ],
    docs: [
      {
        label: 'Calendar API',
        href: 'https://developers.google.com/calendar/api/guides/overview',
      },
      {
        label: 'OAuth 2.0',
        href: 'https://developers.google.com/identity/protocols/oauth2',
      },
    ],
  },
  email: {
    title: 'Como obter as credenciais SMTP',
    steps: [
      'Escolha o provedor SMTP da associação (Gmail, Outlook, Amazon SES, SendGrid, servidor próprio, etc.).',
      'No painel do provedor, ative SMTP e anote **host**, **porta** (ex.: 587 STARTTLS ou 465 TLS), **usuário** e **senha** (ou senha de app).',
      'Preencha os campos abaixo: Host, Porta, Usuário, Senha, From (e-mail remetente) e From name. Marque **TLS implícito (secure)** se a porta exigir TLS direto (ex.: 465).',
      'Clique em **Autenticar** para validar a conexão (VERIFY). Depois ative o módulo. Opcionalmente use “Enviar e-mail de teste”.',
    ],
    docs: [{ label: 'Nodemailer SMTP', href: 'https://nodemailer.com/smtp/' }],
  },
  pagarme: {
    title: 'Como obter as credenciais',
    steps: [
      'Acesse o [Dashboard Pagar.me](https://dashboard.pagar.me/) com a conta da associação (produção ou teste).',
      'Em **Configurações → Chaves de API**, copie a **Secret Key** (`sk_…`) e a **Public Key** (`pk_…`).',
      'Cole as chaves abaixo e clique em **Autenticar**. O Kunk testa a API e indica se a conta é **PSP** (necessária para split com Pedidos SouCannabis) ou **Gateway** (só Pagar.me standalone).',
      'No passo **Webhooks**, defina usuário e senha. No painel Pagar.me o webhook **precisa** de HTTP Basic com esses mesmos valores — sem autenticação a API responde 401 e o pagamento não é confirmado.',
    ],
    docs: [
      { label: 'Introdução', href: 'https://docs.pagar.me/reference/introdu%C3%A7%C3%A3o-1' },
      { label: 'Dashboard', href: 'https://dashboard.pagar.me/' },
    ],
  },
  soucannabis_orders: {
    title: 'Como obter as credenciais',
    steps: [
      'As credenciais da API de Pedidos SouCannabis são fornecidas pelo time SouCannabis (não há self-service público). Solicite acesso à integração Kunk ↔ SouCannabis.',
      'Você receberá: **API base URL** (`base_url`), **Client ID**, **Client Secret** e, se aplicável, **Token URL**.',
      'Cole os valores nos campos abaixo e clique em **Autenticar**. O Kunk obtém o token OAuth (client_credentials) e valida com `/me`.',
      'Para pedidos com valor > 0 e split, configure também o **Pagar.me** em conta **PSP** e complete recipients / percentual de pagamento.',
    ],
    docs: [],
  },
  utalk: {
    title: 'Como obter as credenciais',
    steps: [
      'Acesse o painel [Utalk / Umbler Talk](https://app.utalk.chat/) com a conta da organização.',
      'Em configurações da organização / API, copie o **Organization ID** e gere (ou copie) o **API Token** (Bearer de qualquer usuário Utalk da org).',
      'Cole Organization ID e API Token abaixo (e opcionalmente a API base URL) e clique em **Autenticar**. O Kunk valida com `GET /v1/members/me/`.',
      'Ative o módulo e cadastre o **utalk_id** de cada operador (mapeamento de atendentes). Opcionalmente configure a mensagem automática da triagem.',
    ],
    docs: [
      {
        label: 'Swagger Umbler',
        href: 'https://app-utalk.umbler.com/api/swagger/index.html',
      },
    ],
  },
};
