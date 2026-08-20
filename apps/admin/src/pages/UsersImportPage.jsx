import React, { useEffect, useMemo, useState } from 'react';
import { AdminLoader } from '../components/AdminLoader.jsx';

const STEPS = [
  { id: 'upload', label: 'Arquivo' },
  { id: 'map', label: 'Mapeamento' },
  { id: 'validate', label: 'Validação' },
  { id: 'import', label: 'Importação' },
];

function parseLocalHeaders(csvText) {
  const raw = String(csvText || '').replace(/^\uFEFF/, '');
  const first = raw.split(/\r?\n/).find((l) => l.trim() !== '');
  if (!first) return [];
  const commas = (first.match(/,/g) || []).length;
  const semis = (first.match(/;/g) || []).length;
  const delim = semis > commas ? ';' : ',';
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < first.length; i += 1) {
    const ch = first[i];
    if (inQuotes) {
      if (ch === '"' && first[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delim) {
      cells.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  cells.push(cur.trim());
  return cells.filter(Boolean);
}

export function UsersImportPage({ api }) {
  const [step, setStep] = useState(0);
  const [fields, setFields] = useState([]);
  const [loadingFields, setLoadingFields] = useState(true);
  const [fileName, setFileName] = useState('');
  const [csvText, setCsvText] = useState('');
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState(null);
  const [importResult, setImportResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingFields(true);
      try {
        const res = await api.listUsersImportFields();
        if (!cancelled) setFields(res.data?.fields || []);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Falha ao carregar campos de importação');
      } finally {
        if (!cancelled) setLoadingFields(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const fieldOptions = useMemo(
    () => [
      { value: '', label: '— Ignorar —' },
      ...fields.map((f) => ({
        value: f.key,
        label: f.requiredHint ? `${f.label} *` : f.label,
      })),
    ],
    [fields]
  );

  const requiredFields = useMemo(
    () => fields.filter((f) => f.requiredHint),
    [fields]
  );

  const mappedFieldKeys = useMemo(
    () => new Set(Object.values(mapping).filter(Boolean)),
    [mapping]
  );

  const missingRequired = useMemo(
    () => requiredFields.filter((f) => !mappedFieldKeys.has(f.key)),
    [requiredFields, mappedFieldKeys]
  );

  const canValidate = missingRequired.length === 0 && headers.length > 0;

  const validCount = report?.valid || 0;
  const invalidCount = report?.invalid || 0;

  function resetAll() {
    setStep(0);
    setFileName('');
    setCsvText('');
    setHeaders([]);
    setMapping({});
    setReport(null);
    setImportResult(null);
    setError('');
    setBusy(false);
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setReport(null);
    setImportResult(null);
    try {
      const text = await file.text();
      const hdrs = parseLocalHeaders(text);
      if (!hdrs.length) {
        setError('O arquivo CSV não possui cabeçalho válido.');
        return;
      }
      setFileName(file.name);
      setCsvText(text);
      setHeaders(hdrs);

      const nextMap = {};
      const used = new Set();
      try {
        const fieldsRes = await api.listUsersImportFields();
        const aliases = fieldsRes.data?.aliases || {};
        const fieldList = fieldsRes.data?.fields || fields;
        for (const h of hdrs) {
          const norm = String(h)
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ');
          let key = aliases[norm] || '';
          if (!key) {
            const byLabel = fieldList.find((f) => {
              const ln = String(f.label || '')
                .trim()
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/\s+/g, ' ');
              return ln === norm || String(f.key).toLowerCase() === norm;
            });
            key = byLabel?.key || '';
          }
          if (key && !used.has(key)) {
            nextMap[h] = key;
            used.add(key);
          } else {
            nextMap[h] = '';
          }
        }
      } catch {
        for (const h of hdrs) nextMap[h] = '';
      }
      setMapping(nextMap);
      setStep(1);
    } catch (err) {
      setError(err.message || 'Não foi possível ler o arquivo');
    }
  }

  function setMapField(header, fieldKey) {
    setMapping((prev) => {
      const next = { ...prev, [header]: fieldKey };
      if (fieldKey) {
        for (const [h, k] of Object.entries(next)) {
          if (h !== header && k === fieldKey) next[h] = '';
        }
      }
      return next;
    });
    setError('');
    setReport(null);
    setImportResult(null);
  }

  async function runValidate() {
    if (missingRequired.length) {
      setError(
        `Selecione o mapeamento dos campos obrigatórios: ${missingRequired
          .map((f) => f.label)
          .join(', ')}.`
      );
      return;
    }
    setBusy(true);
    setError('');
    setImportResult(null);
    try {
      const cleanMapping = {};
      for (const [h, k] of Object.entries(mapping)) {
        if (k) cleanMapping[h] = k;
      }
      const res = await api.validateUsersImport({ csv: csvText, mapping: cleanMapping });
      setReport(res.data);
      setStep(2);
    } catch (err) {
      setError(err.message || 'Falha na validação');
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    if (!report || validCount <= 0) return;
    setBusy(true);
    setError('');
    try {
      const cleanMapping = {};
      for (const [h, k] of Object.entries(mapping)) {
        if (k) cleanMapping[h] = k;
      }
      const res = await api.importUsers({ csv: csvText, mapping: cleanMapping });
      setImportResult(res.data);
      setStep(3);
    } catch (err) {
      setError(err.message || 'Falha na importação');
    } finally {
      setBusy(false);
    }
  }

  if (loadingFields) {
    return <AdminLoader label="Carregando assistente de importação…" />;
  }

  return (
    <div>
      <div className="admin-top">
        <div>
          <h1 style={{ margin: 0 }}>Importação de dados</h1>
          <p className="muted" style={{ margin: '0.25rem 0 0' }}>
            Importe associados a partir de um arquivo CSV, com mapeamento e validação antes de gravar.
          </p>
        </div>
      </div>

      <nav className="users-import-steps" aria-label="Etapas da importação">
        {STEPS.map((s, idx) => (
          <div
            key={s.id}
            className={`users-import-step${idx === step ? ' is-active' : ''}${idx < step ? ' is-done' : ''}`}
          >
            <span className="users-import-step-num">{idx + 1}</span>
            <span>{s.label}</span>
          </div>
        ))}
      </nav>

      {error ? <div className="alert alert-error">{error}</div> : null}

      {step === 0 ? (
        <div className="card users-import-card">
          <h2 style={{ marginTop: 0 }}>1. Enviar arquivo CSV</h2>
          <p className="muted">
            O arquivo deve ter uma linha de cabeçalho. Na próxima etapa você relaciona cada coluna
            aos campos do associado (nomes em português).
          </p>
          <div className="appearance-upload-row">
            <label className="btn btn-primary">
              Selecionar arquivo CSV
              <input hidden type="file" accept=".csv,text/csv" onChange={onFile} />
            </label>
            {fileName ? <span className="muted">{fileName}</span> : null}
          </div>
          <p className="muted" style={{ marginTop: '1rem' }}>
            Exemplo:{' '}
            <a href="/examples/associados-import-exemplo.csv" download>
              associados-import-exemplo.csv
            </a>
          </p>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="card users-import-card">
          <h2 style={{ marginTop: 0 }}>2. Mapear colunas</h2>
          <p className="muted">
            Relacione cada coluna do CSV a um campo da tabela de associados. Colunas sem
            correspondência podem ser ignoradas.
          </p>
          {fileName ? (
            <p>
              Arquivo: <strong>{fileName}</strong>
            </p>
          ) : null}

          {missingRequired.length ? (
            <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
              Mapeie os campos obrigatórios antes de validar:{' '}
              <strong>{missingRequired.map((f) => f.label).join(', ')}</strong>.
            </div>
          ) : null}

          <table className="users-import-map-table">
            <thead>
              <tr>
                <th>Coluna no CSV</th>
                <th>Campo do associado</th>
              </tr>
            </thead>
            <tbody>
              {headers.map((h) => (
                <tr key={h}>
                  <td>
                    <code>{h}</code>
                  </td>
                  <td>
                    <select
                      value={mapping[h] || ''}
                      onChange={(e) => setMapField(h, e.target.value)}
                      aria-label={`Mapear coluna ${h}`}
                    >
                      {fieldOptions.map((opt) => (
                        <option key={`${h}-${opt.value || 'ignore'}`} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="appearance-actions">
            <button type="button" className="btn" onClick={() => setStep(0)} disabled={busy}>
              Voltar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={runValidate}
              disabled={busy || !canValidate}
            >
              {busy ? 'Validando…' : 'Validar dados'}
            </button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="card users-import-card">
          <h2 style={{ marginTop: 0 }}>3. Validação</h2>
          <p>
            <strong>{validCount}</strong> linha(s) válida(s)
            {' · '}
            <strong>{invalidCount}</strong> linha(s) com erro (serão puladas)
          </p>

          {invalidCount > 0 ? (
            <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
              Linhas com erro serão puladas na importação. Corrija o CSV ou o mapeamento se
              necessário.
            </div>
          ) : (
            <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
              Todos os registros passaram na validação e formatação (CPF, CEP, telefone +55, etc.).
            </div>
          )}

          <div className="users-import-report">
            <table>
              <thead>
                <tr>
                  <th>Linha</th>
                  <th>Status</th>
                  <th>E-mail / Nome</th>
                  <th>Mensagens</th>
                </tr>
              </thead>
              <tbody>
                {(report?.rows || []).slice(0, 100).map((row) => (
                  <tr key={`v-${row.line}`} className={row.ok ? '' : 'is-error'}>
                    <td>{row.line}</td>
                    <td>{row.ok ? 'OK' : 'Erro'}</td>
                    <td>
                      {row.payload?.email_account ||
                        row.payload?.associate_name ||
                        '—'}
                    </td>
                    <td>
                      {(row.errors || []).length
                        ? row.errors.join('; ')
                        : row.ok
                          ? 'Pronto para importar'
                          : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(report?.rows || []).length > 100 ? (
              <p className="muted">Exibindo as primeiras 100 linhas do relatório.</p>
            ) : null}
          </div>

          <div className="appearance-actions">
            <button type="button" className="btn" onClick={() => setStep(1)} disabled={busy}>
              Voltar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={runImport}
              disabled={busy || validCount <= 0}
            >
              {busy
                ? 'Importando…'
                : `Importar ${validCount} registro(s)`}
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="card users-import-card">
          <h2 style={{ marginTop: 0 }}>4. Resultado da importação</h2>
          {importResult?.success ? (
            <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
              Importação concluída: {importResult.created} criado(s), {importResult.skipped}{' '}
              pulado(s).
            </div>
          ) : (
            <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
              Importação parcial ou com falhas: {importResult?.created || 0} criado(s),{' '}
              {importResult?.skipped || 0} pulado(s), {importResult?.failed || 0} falha(s) de
              gravação.
            </div>
          )}

          <div className="users-import-report">
            <table>
              <thead>
                <tr>
                  <th>Linha</th>
                  <th>Ação</th>
                  <th>E-mail</th>
                  <th>Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {(importResult?.rows || []).slice(0, 100).map((row, idx) => (
                  <tr key={`i-${row.line}-${idx}`} className={row.ok ? '' : 'is-error'}>
                    <td>{row.line}</td>
                    <td>{row.action === 'create' && row.ok ? 'Criado' : 'Pulado'}</td>
                    <td>{row.email || '—'}</td>
                    <td>
                      {row.errors?.length
                        ? row.errors.join('; ')
                        : row.error || (row.ok ? `ID ${row.id}` : '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="appearance-actions">
            <button type="button" className="btn btn-primary" onClick={resetAll}>
              Nova importação
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
