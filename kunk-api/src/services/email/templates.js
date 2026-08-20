'use strict';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapHtml({ title, bodyHtml, associationName }) {
  const brand = escapeHtml(associationName || 'Kunk');
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #1a1a1a; max-width: 560px; margin: 0 auto; padding: 24px;">
  <p style="font-size: 0.85rem; color: #666; margin: 0 0 16px;">${brand}</p>
  <h1 style="font-size: 1.25rem; margin: 0 0 12px;">${escapeHtml(title)}</h1>
  ${bodyHtml}
  <p style="font-size: 0.8rem; color: #888; margin-top: 32px;">Este e-mail foi enviado automaticamente. Não responda.</p>
</body>
</html>`;
}

function buttonLink(href, label) {
  return `<p style="margin: 24px 0;"><a href="${escapeHtml(href)}" style="display:inline-block;background:#1b5e20;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;">${escapeHtml(label)}</a></p>
<p style="font-size:0.85rem;word-break:break-all;color:#555;">Ou copie o link:<br>${escapeHtml(href)}</p>`;
}

function passwordReset({ resetUrl, associationName }) {
  const title = 'Redefinição de senha';
  const html = wrapHtml({
    title,
    associationName,
    bodyHtml: `<p>Recebemos um pedido para redefinir sua senha. O link expira em 1 hora.</p>${buttonLink(resetUrl, 'Redefinir senha')}<p>Se você não solicitou, ignore este e-mail.</p>`,
  });
  const text = `${title}\n\nAcesse: ${resetUrl}\nO link expira em 1 hora.\nSe não solicitou, ignore este e-mail.`;
  return { subject: title, html, text };
}

function systemInvite({ inviteUrl, associationName, recipientName }) {
  const title = 'Convite para acessar o sistema';
  const greet = recipientName ? `Olá, ${escapeHtml(recipientName)}.` : 'Olá.';
  const html = wrapHtml({
    title,
    associationName,
    bodyHtml: `<p>${greet}</p><p>Você foi convidado(a) a criar sua senha e acessar o painel. O link expira em 1 hora.</p>${buttonLink(inviteUrl, 'Definir senha e acessar')}`,
  });
  const text = `${title}\n\n${recipientName ? `Olá, ${recipientName}.\n\n` : ''}Defina sua senha: ${inviteUrl}\nO link expira em 1 hora.`;
  return { subject: title, html, text };
}

function contractSigningLink({ signingUrl, associationName, signerName }) {
  const title = 'Termo para assinatura';
  const greet = signerName ? `Olá, ${escapeHtml(signerName)}.` : 'Olá.';
  const html = wrapHtml({
    title,
    associationName,
    bodyHtml: `<p>${greet}</p><p>Seu termo de adesão está pronto para assinatura. O link é válido por 14 dias.</p>${buttonLink(signingUrl, 'Assinar termo')}`,
  });
  const text = `${title}\n\nAssine em: ${signingUrl}\nVálido por 14 dias.`;
  return { subject: title, html, text };
}

function contractSignedConfirmation({ associationName, signerName }) {
  const title = 'Termo assinado com sucesso';
  const greet = signerName ? `Olá, ${escapeHtml(signerName)}.` : 'Olá.';
  const html = wrapHtml({
    title,
    associationName,
    bodyHtml: `<p>${greet}</p><p>Sua assinatura foi registrada. Em anexo você encontra o termo assinado e o relatório de auditoria (audit log) em PDF.</p>`,
  });
  const text = `${title}\n\nSua assinatura foi registrada. Os PDFs do termo e do audit log seguem em anexo.`;
  return { subject: title, html, text };
}

function smtpTest({ associationName }) {
  const title = 'E-mail de teste SMTP';
  const html = wrapHtml({
    title,
    associationName,
    bodyHtml: `<p>Se você recebeu esta mensagem, a configuração SMTP da instalação está funcionando.</p><p>Enviado em ${escapeHtml(new Date().toISOString())}.</p>`,
  });
  const text = `${title}\n\nConfiguração SMTP OK.\n${new Date().toISOString()}`;
  return { subject: title, html, text };
}

module.exports = {
  passwordReset,
  systemInvite,
  contractSigningLink,
  contractSignedConfirmation,
  smtpTest,
};
