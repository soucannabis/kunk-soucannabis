'use strict';

const { query } = require('../db/pool');
const { AppError } = require('../utils/response');
const { isStaffRoles, isProfessionalRole } = require('../schema/rbac');
const professionalTypesConfig = require('./professionalTypesConfig');
const professionalsService = require('./professionalsService');

const STATUS_PAID = 'Pagamento Concluído';

function monthRange(yearMonth) {
  // yearMonth: YYYY-MM
  const m = String(yearMonth || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  if (month < 0 || month > 11) return null;
  const start = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
  return { start: start.toISOString(), end: end.toISOString() };
}

function parseContestReports(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Taxa vem do tipo do profissional (catálogo admin), não de services.type (consulta/retorno).
 */
function enrichServicesWithPayable(serviceRows, professionalsByCode, types, reportSettings) {
  const typeMap = Object.fromEntries((types || []).map((t) => [t.id, t]));
  const services = (serviceRows || []).map((row) => {
    const pro = professionalsByCode[String(row.professional_id)] || null;
    const professionalType = professionalTypesConfig.normalizeProfessionalTypeId(pro?.type) || null;
    const typeCfg = (professionalType && typeMap[professionalType]) || { association_fee: 0 };
    const pay = professionalTypesConfig.resolvePayable(row, typeCfg, reportSettings);
    return {
      ...row,
      professional_type: professionalType,
      association_fee: pay.association_fee,
      deduct_donation: pay.deduct_donation,
      payable: pay.payable,
    };
  });
  const payableSum = services.reduce((acc, s) => acc + (Number(s.payable) || 0), 0);
  const feeSum = services.reduce((acc, s) => acc + (Number(s.association_fee) || 0), 0);
  return {
    services,
    totals: {
      count: services.length,
      payable_sum: payableSum,
      association_fee_sum: feeSum,
    },
  };
}

async function getReport(queryParams = {}, user) {
  const roles = user?.roles || user?.permissions || [];
  const staff = isStaffRoles(roles);
  const asProfessional = isProfessionalRole(roles);

  let professionalId = queryParams.professional_id || null;
  if (asProfessional && !staff) {
    professionalId = user.internal_code;
    if (!professionalId) {
      throw new AppError(403, 'FORBIDDEN', 'Profissional sem código interno');
    }
  }

  const params = [];
  const where = [
    `status = $${params.push(STATUS_PAID)}`,
    'consultation_date IS NOT NULL',
  ];

  if (professionalId) {
    where.push(`professional_id = $${params.push(String(professionalId))}`);
  }

  if (queryParams.month) {
    const range = monthRange(queryParams.month);
    if (!range) throw new AppError(400, 'VALIDATION_ERROR', 'month deve ser YYYY-MM');
    where.push(`consultation_date >= $${params.push(range.start)}`);
    where.push(`consultation_date <= $${params.push(range.end)}`);
  } else if (queryParams.year) {
    const year = Number(queryParams.year);
    if (!Number.isFinite(year)) throw new AppError(400, 'VALIDATION_ERROR', 'year inválido');
    where.push(`consultation_date >= $${params.push(`${year}-01-01T00:00:00.000Z`)}`);
    where.push(`consultation_date < $${params.push(`${year + 1}-01-01T00:00:00.000Z`)}`);
  }

  const result = await query(
    `SELECT * FROM services
     WHERE ${where.join(' AND ')}
     ORDER BY consultation_date ASC NULLS LAST, id ASC`,
    params
  );

  const [types, reportSettings] = await Promise.all([
    professionalTypesConfig.loadProfessionalTypes(),
    professionalTypesConfig.loadReportSettings(),
  ]);

  const proCodes = [
    ...new Set(
      [
        ...result.rows.map((s) => s.professional_id),
        professionalId,
      ].filter(Boolean).map(String)
    ),
  ];

  let professionals = [];
  if (proCodes.length) {
    const pros = await query(
      `SELECT * FROM professionals WHERE professional_code::text = ANY($1::text[])`,
      [proCodes]
    );
    professionals = pros.rows.map((p) => ({
      ...p,
      contest_reports: parseContestReports(p.contest_reports),
    }));
  }

  const professionalsByCode = Object.fromEntries(
    professionals.map((p) => [String(p.professional_code), p])
  );

  const { services, totals } = enrichServicesWithPayable(
    result.rows,
    professionalsByCode,
    types,
    reportSettings
  );

  return {
    services,
    professionals,
    types,
    report_settings: reportSettings,
    totals,
  };
}

async function validateBatch(body, user) {
  const roles = user?.roles || user?.permissions || [];
  const staff = isStaffRoles(roles);
  const asProfessional = isProfessionalRole(roles) && !staff;

  const ids = Array.isArray(body?.ids) ? body.ids.map(Number).filter(Number.isFinite) : [];
  const validation = body?.commission_validation;
  if (!ids.length) throw new AppError(400, 'VALIDATION_ERROR', 'ids obrigatório');
  if (!['approved', 'contested', null].includes(validation) && validation !== '') {
    throw new AppError(400, 'VALIDATION_ERROR', 'commission_validation inválido');
  }
  const value = validation === '' ? null : validation;

  if (asProfessional) {
    if (!user?.internal_code) {
      throw new AppError(403, 'FORBIDDEN', 'Profissional sem código interno');
    }
    if (value !== 'approved' && value !== 'contested') {
      throw new AppError(400, 'VALIDATION_ERROR', 'commission_validation inválido');
    }
    const result = await query(
      `UPDATE services
       SET commission_validation = $1
       WHERE id = ANY($2::int[])
         AND professional_id = $3
       RETURNING id, service_code, commission_validation`,
      [value, ids, String(user.internal_code)]
    );
    if (result.rows.length !== ids.length) {
      throw new AppError(403, 'FORBIDDEN', 'Só pode validar os próprios atendimentos');
    }
    return { updated: result.rows };
  }

  if (!staff) {
    throw new AppError(403, 'FORBIDDEN', 'Sem permissão para validar');
  }

  const result = await query(
    `UPDATE services
     SET commission_validation = $1
     WHERE id = ANY($2::int[])
     RETURNING id, service_code, commission_validation`,
    [value, ids]
  );
  return { updated: result.rows };
}

async function appendContestReport(professionalId, body, user) {
  const text = String(body?.text || '').trim();
  const month = String(body?.month || '').trim();
  if (!text) throw new AppError(400, 'VALIDATION_ERROR', 'text obrigatório');
  if (!month) throw new AppError(400, 'VALIDATION_ERROR', 'month obrigatório');

  const pro = await professionalsService.getById(professionalId);
  const roles = user?.roles || user?.permissions || [];
  if (isProfessionalRole(roles) && !isStaffRoles(roles)) {
    if (String(pro.professional_code) !== String(user.internal_code)) {
      throw new AppError(403, 'FORBIDDEN', 'Só pode contestar o próprio relatório');
    }
  }

  const current = parseContestReports(pro.contest_reports);
  const entry = {
    text,
    month,
    date: new Date().toISOString(),
  };
  const serviceId = Number(body?.service_id);
  if (Number.isFinite(serviceId) && serviceId > 0) {
    entry.service_id = serviceId;
  }
  const next = [...current, entry];
  const updated = await professionalsService.update(pro.id, { contest_reports: next });
  return {
    ...updated,
    contest_reports: parseContestReports(updated.contest_reports),
  };
}

async function deleteContestReport(professionalId, index, user) {
  const roles = user?.roles || user?.permissions || [];
  if (isProfessionalRole(roles) && !isStaffRoles(roles)) {
    throw new AppError(403, 'FORBIDDEN', 'Só staff resolve contestações');
  }
  const pro = await professionalsService.getById(professionalId);
  const current = parseContestReports(pro.contest_reports);
  const idx = Number(index);
  if (!Number.isFinite(idx) || idx < 0 || idx >= current.length) {
    throw new AppError(404, 'NOT_FOUND', 'Contestação não encontrada');
  }
  const removed = current[idx];
  const next = current.filter((_, i) => i !== idx);
  const updated = await professionalsService.update(pro.id, { contest_reports: next });

  const serviceId = Number(removed?.service_id);
  if (Number.isFinite(serviceId) && serviceId > 0) {
    await query(
      `UPDATE services
       SET commission_validation = 'approved'
       WHERE id = $1
         AND professional_id = $2`,
      [serviceId, String(pro.professional_code)]
    );
  }

  return {
    ...updated,
    contest_reports: parseContestReports(updated.contest_reports),
  };
}

module.exports = {
  STATUS_PAID,
  getReport,
  validateBatch,
  appendContestReport,
  deleteContestReport,
  monthRange,
  parseContestReports,
  enrichServicesWithPayable,
};
