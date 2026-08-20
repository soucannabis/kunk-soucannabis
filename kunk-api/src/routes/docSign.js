'use strict';

const { Router } = require('express');
const docSignService = require('../services/docSignService');
const filesRepository = require('../repositories/filesRepository');
const { applyFileDownloadHeaders } = require('../utils/fileType');
const { requestIp } = require('../utils/rateLimit');
const repo = require('../repositories/docSignRepository');
const { authenticate } = require('../middleware/authenticate');
const { authorizeAdmin } = require('../middleware/authorize');
const { requireAssociate } = require('../middleware/requireAssociate');
const { ok, AppError } = require('../utils/response');
const crypto = require('crypto');

const router = Router();

function requestMeta(req, body = {}) {
  const ip = requestIp(req);
  return {
    ip: ip && ip !== 'unknown' ? String(ip).trim() : null,
    userAgent: req.headers['user-agent'] || null,
    timezone: body.timezone || null,
  };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

const STAFF_ROLES = new Set(['Administrador', 'Acolhimento', 'Produção', 'Webmaster']);

function requireStaff(req, res, next) {
  try {
    const roles = req.user?.roles || req.user?.permissions || [];
    const list = Array.isArray(roles) ? roles : [];
    if (list.some((r) => STAFF_ROLES.has(r)) || list.includes('api')) {
      return next();
    }
    throw new AppError(403, 'FORBIDDEN', 'Operador sem permissão para termos');
  } catch (err) {
    next(err);
  }
}

router.get('/status', async (req, res, next) => {
  try {
    res.json(ok(await docSignService.status()));
  } catch (err) {
    next(err);
  }
});

router.get('/variables', authenticate, authorizeAdmin, async (req, res, next) => {
  try {
    res.json(
      ok(
        docSignService.CANONICAL_VARIABLES.map((name) => ({
          name,
          label: docSignService.VARIABLE_LABELS[name] || name,
        }))
      )
    );
  } catch (err) {
    next(err);
  }
});

router.get('/templates', authenticate, authorizeAdmin, async (req, res, next) => {
  try {
    res.json(ok(await docSignService.listTemplates()));
  } catch (err) {
    next(err);
  }
});

router.post('/templates', authenticate, authorizeAdmin, async (req, res, next) => {
  try {
    const created = await docSignService.createTemplate(req.body || {});
    res.status(201).json(ok(created));
  } catch (err) {
    next(err);
  }
});

router.get('/templates-logos', authenticate, authorizeAdmin, async (req, res, next) => {
  try {
    res.json(ok(await docSignService.listTemplateLogos()));
  } catch (err) {
    next(err);
  }
});

router.post('/templates/reset-defaults', authenticate, authorizeAdmin, async (req, res, next) => {
  try {
    res.json(ok(await docSignService.resetDefaultTemplates()));
  } catch (err) {
    next(err);
  }
});

router.post('/templates/:kind/reset', authenticate, authorizeAdmin, async (req, res, next) => {
  try {
    res.json(ok(await docSignService.resetTemplateKind(req.params.kind)));
  } catch (err) {
    next(err);
  }
});

router.delete('/templates/:kind', authenticate, authorizeAdmin, async (req, res, next) => {
  try {
    res.json(ok(await docSignService.deleteTemplate(req.params.kind)));
  } catch (err) {
    next(err);
  }
});

router.get('/templates/versions/:versionId', authenticate, authorizeAdmin, async (req, res, next) => {
  try {
    const version = await repo.getVersionById(req.params.versionId);
    if (!version) throw new AppError(404, 'NOT_FOUND', 'Versão não encontrada');
    res.json(ok(version));
  } catch (err) {
    next(err);
  }
});

router.get('/templates/:kind', authenticate, authorizeAdmin, async (req, res, next) => {
  try {
    res.json(ok(await docSignService.getTemplate(req.params.kind)));
  } catch (err) {
    next(err);
  }
});

router.put('/templates/:kind/draft', authenticate, authorizeAdmin, async (req, res, next) => {
  try {
    const data = await docSignService.saveDraft(req.params.kind, {
      content_json: req.body?.content_json,
      title: req.body?.title,
      logo_file_id: req.body?.logo_file_id,
    });
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/templates/:kind/publish', authenticate, authorizeAdmin, async (req, res, next) => {
  try {
    const data = await docSignService.publish(req.params.kind, {
      notes: req.body?.notes || null,
      createdBy: req.user?.user_code || null,
    });
    res.status(201).json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.get('/templates/:kind/sample-variables', authenticate, authorizeAdmin, async (req, res, next) => {
  try {
    res.json(ok(docSignService.getSampleVariables(req.params.kind)));
  } catch (err) {
    next(err);
  }
});

router.post('/templates/:kind/preview-pdf', authenticate, authorizeAdmin, async (req, res, next) => {
  try {
    const result = await docSignService.previewPdf(req.params.kind, {
      contentJson: req.body?.content_json || null,
      variables: req.body?.variables || {},
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Content-Sha256', result.sha256);
    res.send(result.buffer);
  } catch (err) {
    next(err);
  }
});

router.get('/templates/:kind/versions', authenticate, authorizeAdmin, async (req, res, next) => {
  try {
    const tpl = await docSignService.getTemplate(req.params.kind);
    res.json(ok(tpl.versions));
  } catch (err) {
    next(err);
  }
});

router.post('/contracts', async (req, res, next) => {
  try {
    const meta = requestMeta(req, req.body);
    // Associate "me"
    if (!req.body?.user_code) {
      await new Promise((resolve, reject) => {
        requireAssociate(req, res, (err) => (err ? reject(err) : resolve()));
      });
      const created = await docSignService.createContract({
        userCode: req.associate.user_code,
        sendEmail: req.body?.send_email !== false,
        regenerate: false,
        meta,
      });
      const { meta: m, ...data } = created;
      return res.status(201).json(ok(data, m));
    }

    await new Promise((resolve, reject) => {
      authenticate(req, res, (err) => (err ? reject(err) : resolve()));
    });
    await new Promise((resolve, reject) => {
      requireStaff(req, res, (err) => (err ? reject(err) : resolve()));
    });

    const created = await docSignService.createContract({
      userCode: req.body.user_code,
      sendEmail: req.body?.send_email !== false,
      regenerate: Boolean(req.body?.regenerate),
      replaceCompleted: Boolean(req.body?.replace_completed),
      kind: req.body?.kind || null,
      meta,
    });
    const { meta: m, ...data } = created;
    res.status(201).json(ok(data, m));
  } catch (err) {
    next(err);
  }
});

router.post('/contracts/:id/resend-email', authenticate, requireStaff, async (req, res, next) => {
  try {
    res.json(ok(await docSignService.resendContractEmail(req.params.id)));
  } catch (err) {
    next(err);
  }
});

router.get('/contracts/me', requireAssociate, async (req, res, next) => {
  try {
    res.json(ok(await docSignService.getMyContract(req.associate)));
  } catch (err) {
    next(err);
  }
});

router.get('/contracts', authenticate, requireStaff, async (req, res, next) => {
  try {
    const limit = req.query.limit;
    const offset = req.query.offset;
    const status = req.query.status || null;
    const q = req.query.q || null;
    const result = await docSignService.listContracts({ limit, offset, status, q });
    res.json(ok(result.items, { total: result.total, limit: result.limit, offset: result.offset }));
  } catch (err) {
    next(err);
  }
});

router.get('/contracts/by-user/:userCode', authenticate, requireStaff, async (req, res, next) => {
  try {
    res.json(ok(await docSignService.listByUser(req.params.userCode)));
  } catch (err) {
    next(err);
  }
});

router.get('/contracts/:id', async (req, res, next) => {
  try {
    const data = await docSignService.getContract(req.params.id);

    const { hasAnyOperatorCookie } = require('../constants/authCookies');
    if (req.cookies?.associate_session && !hasAnyOperatorCookie(req) && !req.headers.authorization) {
      await new Promise((resolve, reject) => {
        requireAssociate(req, res, (err) => (err ? reject(err) : resolve()));
      });
      if (data.user_code !== req.associate.user_code) {
        throw new AppError(403, 'FORBIDDEN', 'Contrato de outro associado');
      }
      return res.json(ok(data));
    }

    await new Promise((resolve, reject) => {
      authenticate(req, res, (err) => (err ? reject(err) : resolve()));
    });
    await new Promise((resolve, reject) => {
      requireStaff(req, res, (err) => (err ? reject(err) : resolve()));
    });
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

router.post('/contracts/:id/void', authenticate, requireStaff, async (req, res, next) => {
  try {
    res.json(ok(await docSignService.voidContract(req.params.id)));
  } catch (err) {
    next(err);
  }
});

router.delete('/contracts/:id', authenticate, requireStaff, async (req, res, next) => {
  try {
    res.json(ok(await docSignService.deleteContract(req.params.id)));
  } catch (err) {
    next(err);
  }
});

router.get('/contracts/:id/verify', authenticate, requireStaff, async (req, res, next) => {
  try {
    res.json(ok(await docSignService.verify(req.params.id)));
  } catch (err) {
    next(err);
  }
});

router.get('/contracts/:id/audit', authenticate, requireStaff, async (req, res, next) => {
  try {
    res.json(ok(await docSignService.getAudit(req.params.id)));
  } catch (err) {
    next(err);
  }
});

router.get('/sign/:token', async (req, res, next) => {
  try {
    res.json(ok(await docSignService.getSignPayload(req.params.token)));
  } catch (err) {
    next(err);
  }
});

router.get('/sign/:token/pdf', async (req, res, next) => {
  try {
    const row = await repo.getContractByTokenHash(hashToken(req.params.token), { status: 'pending' });
    if (!row) throw new AppError(404, 'TOKEN_INVALID', 'Link inválido');
    const file = await filesRepository.getFile(row.filled_pdf_file_id);
    const stream = await filesRepository.openFileStream(file);
    applyFileDownloadHeaders(res, file);
    stream.on('error', (err) => next(err));
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
});

router.post('/sign/:token/view', async (req, res, next) => {
  try {
    res.json(ok(await docSignService.recordView(req.params.token, requestMeta(req, req.body))));
  } catch (err) {
    next(err);
  }
});

router.post('/sign/:token/complete', async (req, res, next) => {
  try {
    const data = await docSignService.completeSign(req.params.token, req.body || {}, requestMeta(req, req.body));
    res.json(ok(data));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
