'use strict';

const { query } = require('../db/pool');
const itemsRepository = require('../repositories/itemsRepository');
const { stripSensitive } = require('../schema/collections');
const { parseInclude, hydrateIncludes } = require('./includeService');
const { parseFilterQuery } = require('../query/parseFilter');
const { v4: uuidv4 } = require('uuid');
const { AppError } = require('../utils/response');
const { env } = require('../config/env');
const professionalTypesConfig = require('./professionalTypesConfig');

function defaultPriceForType(_type) {
  return 0;
}

function resolveConsultationPrice(professional, explicitPrice, typeOrConfig) {
  return professionalTypesConfig.resolveConsultationPrice(professional, explicitPrice, typeOrConfig);
}

/** Busca painel: associado OU profissional (e paciente/nome do serviço). */
function buildServicesSearchFilter(rawSearch) {
  const term = String(rawSearch || '').trim();
  if (!term) return null;
  const parts = [
    { associate_name: { _icontains: term } },
    { professional_name: { _icontains: term } },
    { patient_name: { _icontains: term } },
    { name: { _icontains: term } },
  ];
  const words = term.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    parts.push({
      _and: words.map((w) => ({
        _or: [
          { associate_name: { _icontains: w } },
          { professional_name: { _icontains: w } },
          { patient_name: { _icontains: w } },
        ],
      })),
    });
  }
  return { _or: parts };
}

function mergeFilter(base, extra) {
  if (!base) return extra || null;
  if (!extra) return base;
  return { _and: [base, extra] };
}

async function list(queryParams = {}, { scopeFilter } = {}) {
  const includeKeys = parseInclude('services', queryParams.include);
  const qp = { ...queryParams };
  const searchTerm = qp.search != null ? String(qp.search).trim() : '';
  delete qp.search;

  if (searchTerm) {
    const searchFilter = buildServicesSearchFilter(searchTerm);
    const existing = parseFilterQuery(qp.filter);
    qp.filter = mergeFilter(existing, searchFilter);
  }

  const result = await itemsRepository.listItems('services', qp, { scopeFilter });
  if (includeKeys.length) {
    await hydrateIncludes('services', result.data, includeKeys);
  }
  return result;
}

async function createService(payload, actor) {
  return itemsRepository.createItem('services', {
    ...payload,
    service_code: payload.service_code || uuidv4(),
    date_created: new Date().toISOString(),
    created_by_user_code: payload.created_by_user_code || actor?.user_code || actor?.internal_code,
  });
}

async function loadProfessional(ref) {
  if (ref == null || ref === '') return null;
  const byCode = await query(`SELECT * FROM professionals WHERE professional_code = $1 LIMIT 1`, [
    String(ref),
  ]);
  if (byCode.rows[0]) return byCode.rows[0];
  if (/^\d+$/.test(String(ref))) {
    const byId = await query(`SELECT * FROM professionals WHERE id = $1 LIMIT 1`, [Number(ref)]);
    return byId.rows[0] || null;
  }
  return null;
}

async function maybeCreateCalendarEvent(serviceRow, professional, createFlag) {
  if (!createFlag || !serviceRow?.consultation_date) return serviceRow;
  const calendarId = professional?.calendar_id && String(professional.calendar_id).trim();
  if (!calendarId) {
    const proName =
      [professional?.name, professional?.last_name].filter(Boolean).join(' ').trim() ||
      'este profissional';
    throw new AppError(
      400,
      'CALENDAR_NOT_CONFIGURED',
      `${proName} não tem agenda do Google cadastrada. Em Profissionais, vincule um calendário secundário antes de criar o evento.`
    );
  }
  if (!(await require('./moduleFlags').isModuleEnabled('google_calendar'))) {
    throw new AppError(
      503,
      'MODULE_DISABLED',
      'Módulo Google Calendar desabilitado. Ative-o em Admin → Serviços externos.'
    );
  }
  const events = require('./google_calendar/events');
  const start = new Date(serviceRow.consultation_date).toISOString();
  const created = await events.createEvent({
    calendarId,
    summary: serviceRow.patient_name
      ? `${serviceRow.associate_name || 'Responsável'} / ${serviceRow.patient_name}`
      : serviceRow.associate_name || serviceRow.patient_name || 'Consulta',
    description: serviceRow.observations || '',
    start,
    service_id: serviceRow.id,
  });
  return {
    ...serviceRow,
    event_id: created.event_id,
    event_link: created.event_link,
  };
}

async function resolveBeneficiary(body) {
  let patientUserCode = body.patient_user_code || null;
  let patientName = body.patient_name || null;

  if (!patientUserCode) {
    return { patient_user_code: null, patient_name: patientName };
  }

  if (!body.associate_user_code) {
    throw new AppError(400, 'VALIDATION_ERROR', 'associate_user_code obrigatório com patient_user_code');
  }

  const patientRes = await query(`SELECT * FROM users WHERE user_code::text = $1 LIMIT 1`, [
    String(patientUserCode),
  ]);
  const patient = patientRes.rows[0];
  if (!patient) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Paciente não encontrado');
  }
  if (String(patient.responsible_code) !== String(body.associate_user_code)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Paciente não pertence ao associado responsável selecionado'
    );
  }
  if (!patientName) {
    patientName =
      [patient.associate_name, patient.associate_last_name].filter(Boolean).join(' ').trim() ||
      patient.fullname ||
      null;
  }
  return { patient_user_code: patient.user_code, patient_name: patientName };
}

/**
 * Batch create: { associate_*, patient_user_code?, booking_group_code?, observations, tags, items: [...] }
 * or single payload (legacy).
 */
async function createServices(payload, actor) {
  const body = payload || {};
  if (!Array.isArray(body.items)) {
    const beneficiary = body.patient_user_code
      ? await resolveBeneficiary(body)
      : { patient_user_code: null, patient_name: body.patient_name || null };
    const row = await createService(
      {
        ...body,
        ...beneficiary,
        status: body.status || 'Aguardando Pagamento',
        booking_group_code: body.booking_group_code || uuidv4(),
      },
      actor
    );
    return row;
  }

  if (!body.associate_user_code && !body.associate_name) {
    throw new AppError(400, 'VALIDATION_ERROR', 'associate_user_code ou associate_name obrigatório');
  }
  if (!body.items.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'items vazio');
  }

  const beneficiary = await resolveBeneficiary(body);
  const groupCode = body.booking_group_code || uuidv4();
  const created = [];

  for (const item of body.items) {
    const pro = await loadProfessional(item.professional_id || item.professional_code);
    if (!pro) {
      throw new AppError(400, 'VALIDATION_ERROR', `Profissional não encontrado: ${item.professional_id}`);
    }
    const type = item.type || pro.type;
    const price = await professionalTypesConfig.resolveConsultationPriceAsync(pro, item.price, type);

    let row = await createService(
      {
        status: 'Aguardando Pagamento',
        name: body.name || null,
        type,
        associate_user_code: body.associate_user_code,
        associate_name: body.associate_name,
        associate_email: body.associate_email || null,
        patient_user_code: beneficiary.patient_user_code,
        patient_name: beneficiary.patient_name,
        professional_id: pro.professional_code,
        professional_name: [pro.name, pro.last_name].filter(Boolean).join(' ').trim() || pro.name,
        professional_email: pro.email || null,
        consultation_date: item.consultation_date || null,
        price,
        donation: item.donation != null ? Number(item.donation) : 0,
        price_paid: item.price_paid != null ? Number(item.price_paid) : 0,
        observations: body.observations || item.observations || null,
        tags: body.tags || item.tags || null,
        payment_type: body.payment_type || null,
        booking_group_code: groupCode,
      },
      actor
    );

    if (item.create_calendar_event) {
      row = await maybeCreateCalendarEvent(row, pro, true);
    }
    created.push(stripSensitive('services', row));
  }

  return created;
}

async function updateService(id, payload = {}) {
  const existing = await itemsRepository.getItem('services', id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Serviço não encontrado');

  const body = { ...payload };
  const replaceEvent = body.replace_calendar_event === true;
  delete body.replace_calendar_event;

  const dateChanging =
    body.consultation_date !== undefined &&
    String(body.consultation_date || '') !== String(existing.consultation_date || '');

  if (dateChanging && existing.event_id && !replaceEvent) {
    throw new AppError(
      409,
      'EVENT_DATE_CONFIRMATION_REQUIRED',
      'Serviço já tem evento no calendário. Confirme replace_calendar_event para remarcar.'
    );
  }

  if (dateChanging && existing.event_id && replaceEvent && (await require('./moduleFlags').isModuleEnabled('google_calendar'))) {
    const pro = await loadProfessional(existing.professional_id);
    const calendarId = pro?.calendar_id && String(pro.calendar_id).trim();
    if (!calendarId) {
      throw new AppError(
        400,
        'CALENDAR_NOT_CONFIGURED',
        'Não é possível remarcar: o profissional não tem agenda do Google cadastrada.'
      );
    }
    const events = require('./google_calendar/events');
    try {
      await events.deleteEvent(existing.event_id, calendarId);
    } catch (err) {
      if (err?.code !== 'EVENT_NOT_FOUND' && err?.code !== 'CALENDAR_NOT_FOUND') throw err;
    }
    if (body.consultation_date) {
      const created = await events.createEvent({
        calendarId,
        summary: existing.associate_name || 'Consulta',
        description: body.observations != null ? body.observations : existing.observations || '',
        start: new Date(body.consultation_date).toISOString(),
      });
      body.event_id = created.event_id;
      body.event_link = created.event_link;
    } else {
      body.event_id = null;
      body.event_link = null;
    }
  }

  if (body.professional_id && String(body.professional_id) !== String(existing.professional_id)) {
    const pro = await loadProfessional(body.professional_id);
    if (pro) {
      body.professional_id = pro.professional_code;
      body.professional_name = [pro.name, pro.last_name].filter(Boolean).join(' ').trim() || pro.name;
      body.professional_email = pro.email || null;
      body.type = body.type || pro.type;
      if (existing.event_id && existing.consultation_date && (await require('./moduleFlags').isModuleEnabled('google_calendar'))) {
        const events = require('./google_calendar/events');
        const oldPro = await loadProfessional(existing.professional_id);
        if (oldPro?.calendar_id) {
          try {
            await events.deleteEvent(existing.event_id, oldPro.calendar_id);
          } catch {
            /* ignore */
          }
        }
        if (pro.calendar_id) {
          const created = await events.createEvent({
            calendarId: pro.calendar_id,
            summary: existing.associate_name || 'Consulta',
            description: existing.observations || '',
            start: new Date(body.consultation_date || existing.consultation_date).toISOString(),
          });
          body.event_id = created.event_id;
          body.event_link = created.event_link;
        }
      }
    }
  }

  return itemsRepository.updateItem('services', id, body);
}

async function deleteService(id) {
  const existing = await itemsRepository.getItem('services', id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Serviço não encontrado');
  if (existing.event_id && (await require('./moduleFlags').isModuleEnabled('google_calendar'))) {
    const pro = await loadProfessional(existing.professional_id);
    if (pro?.calendar_id) {
      const events = require('./google_calendar/events');
      try {
        await events.deleteEvent(existing.event_id, pro.calendar_id);
      } catch {
        /* ignore */
      }
    }
  }
  return itemsRepository.deleteItem('services', id);
}

async function byGroup(bookingGroupCode) {
  if (!bookingGroupCode) {
    throw new AppError(400, 'VALIDATION_ERROR', 'booking_group_code obrigatório');
  }
  const result = await query(
    `SELECT * FROM services WHERE booking_group_code = $1 ORDER BY id ASC`,
    [bookingGroupCode]
  );
  return result.rows.map((r) => stripSensitive('services', r));
}

async function byProfessional(professionalId, queryParams = {}) {
  const includeKeys = parseInclude('services', queryParams.include);
  const pro = await loadProfessional(professionalId);
  const code = pro?.professional_code || professionalId;
  const result = await query(
    `SELECT * FROM services WHERE professional_id = $1 ORDER BY id DESC LIMIT 200`,
    [code]
  );
  const rows = result.rows.map((r) => stripSensitive('services', r));
  if (includeKeys.length) {
    await hydrateIncludes('services', rows, includeKeys);
  }
  return rows;
}

async function exists(associateUserCode, professionalId) {
  const pro = await loadProfessional(professionalId);
  const code = pro?.professional_code || professionalId;
  const result = await query(
    `SELECT id FROM services
     WHERE associate_user_code = $1 AND professional_id = $2
     LIMIT 1`,
    [associateUserCode, code]
  );
  return { exists: Boolean(result.rows[0]), id: result.rows[0]?.id || null };
}

/** Após upload de comprovante: marca Pagamento Concluído no serviço e no grupo. */
async function markPaidFromReceipt(serviceId) {
  const existing = await itemsRepository.getItem('services', serviceId);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Serviço não encontrado');
  const groupCode = existing.booking_group_code;
  if (groupCode) {
    await query(
      `UPDATE services SET status = 'Pagamento Concluído'
       WHERE booking_group_code = $1`,
      [groupCode]
    );
    return byGroup(groupCode);
  }
  return [await itemsRepository.updateItem('services', serviceId, { status: 'Pagamento Concluído' })];
}

async function scheduleEvent(serviceId) {
  const existing = await itemsRepository.getItem('services', serviceId);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Serviço não encontrado');
  if (existing.event_id) {
    return existing;
  }
  if (!existing.consultation_date) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Serviço sem data de consulta');
  }
  const pro = await loadProfessional(existing.professional_id);
  const updated = await maybeCreateCalendarEvent(existing, pro, true);
  if (!updated?.event_id) return updated;
  // Releitura após createEvent (já persiste via service_id) para devolver estado canônico.
  const fresh = await itemsRepository.getItem('services', serviceId);
  return fresh || updated;
}

/** Remove o evento do Google Calendar e limpa event_id / event_link no serviço. */
async function cancelCalendarEvent(serviceId) {
  const existing = await itemsRepository.getItem('services', serviceId);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Serviço não encontrado');
  if (!existing.event_id) {
    return existing;
  }

  const pro = await loadProfessional(existing.professional_id);
  const calendarId = pro?.calendar_id && String(pro.calendar_id).trim();

  if ((await require('./moduleFlags').isModuleEnabled('google_calendar')) && calendarId) {
    const events = require('./google_calendar/events');
    try {
      await events.deleteEvent(existing.event_id, calendarId);
    } catch (err) {
      // Já excluído no Google (404/410/"Resource has been deleted") → só limpa o vínculo local.
      if (!isBenignMissingCalendarEvent(err)) {
        throw err;
      }
    }
  }

  return itemsRepository.updateItem('services', serviceId, {
    event_id: null,
    event_link: null,
  });
}

function isBenignMissingCalendarEvent(err) {
  if (!err) return false;
  if (err.code === 'EVENT_NOT_FOUND' || err.code === 'CALENDAR_NOT_FOUND') return true;
  const msg = String(err.message || '').toLowerCase();
  return (
    msg.includes('resource has been deleted') ||
    msg.includes('evento não encontrado') ||
    msg.includes('not found')
  );
}

module.exports = {
  list,
  createService,
  createServices,
  updateService,
  deleteService,
  byGroup,
  byProfessional,
  exists,
  markPaidFromReceipt,
  scheduleEvent,
  cancelCalendarEvent,
  defaultPriceForType,
  resolveConsultationPrice,
  resolvePayable: professionalTypesConfig.resolvePayable,
  loadProfessional,
};
