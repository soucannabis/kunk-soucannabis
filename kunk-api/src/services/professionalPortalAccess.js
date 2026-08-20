'use strict';

const { v4: uuidv4 } = require('uuid');
const { query } = require('../db/pool');
const { AppError } = require('../utils/response');
const professionalsService = require('./professionalsService');
const systemUsersService = require('./systemUsersService');
const systemInviteService = require('./systemInviteService');
const { isCollaboratorTrue } = require('../utils/professionalFlags');

async function findPortalUserByCode(professionalCode) {
  const result = await query(
    `SELECT * FROM system_users
     WHERE internal_code::text = $1
     ORDER BY id DESC
     LIMIT 20`,
    [String(professionalCode)]
  );
  return (
    result.rows.find((row) => {
      const perms = String(row.permissions || '');
      return perms.includes('Profissional');
    }) || null
  );
}

async function ensurePortalUser(professional) {
  if (!isCollaboratorTrue(professional.is_collaborator)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Só colaboradores podem ter acesso ao relatório');
  }
  const email = String(professional.email || '').trim().toLowerCase();
  if (!email) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Profissional precisa de e-mail para criar conta');
  }

  let user = await findPortalUserByCode(professional.professional_code);
  if (user) return user;

  const existingEmail = await query(
    `SELECT id FROM system_users WHERE LOWER(TRIM(email)) = $1 LIMIT 1`,
    [email]
  );
  if (existingEmail.rows[0]) {
    throw new AppError(409, 'EMAIL_IN_USE', 'Já existe um usuário do sistema com este e-mail');
  }

  user = await systemUsersService.createSystemUser({
    name: professional.name,
    last_name: professional.last_name || null,
    email,
    permissions: JSON.stringify(['Profissional']),
    internal_code: String(professional.professional_code),
    status: 'pending',
    user_code: uuidv4(),
    date_created: new Date().toISOString(),
  });
  return user;
}

async function createPortalAccess(professionalId) {
  const professional = await professionalsService.getById(professionalId);
  const user = await ensurePortalUser(professional);
  return systemInviteService.buildInvite(user, {
    permissions: ['Profissional'],
    professional_code: professional.professional_code,
    sendEmail: true,
  });
}

async function resendPortalAccess(professionalId) {
  const professional = await professionalsService.getById(professionalId);
  const user = await findPortalUserByCode(professional.professional_code);
  if (!user) {
    return createPortalAccess(professionalId);
  }
  return systemInviteService.buildInvite(user, {
    permissions: ['Profissional'],
    professional_code: professional.professional_code,
    sendEmail: true,
  });
}

module.exports = {
  createPortalAccess,
  resendPortalAccess,
  previewInvite: systemInviteService.previewInvite,
  acceptInvite: systemInviteService.acceptInvite,
  verifyToken: systemInviteService.verifyToken,
  INVITE_TTL_MS: systemInviteService.INVITE_TTL_MS,
};
