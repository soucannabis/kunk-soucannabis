import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CepInput, CpfCnpjInput, PhoneInput, UF_OPTIONS } from '@kunk/forms';
import {
  getStoreFreightGaps,
  loadStoreFreightConfig,
  saveStoreFreightConfig,
} from '../lib/storeFreightConfig.js';
import { ExternalServiceStatusBanner, ExtActionFeedback } from '../components/ExternalServiceStatus.jsx';
import { AdminLoader } from '../components/AdminLoader.jsx';

function Field({ label, children, required, className = '' }) {
  return (
    <label className={`field${className ? ` ${className}` : ''}`}>
      <span>
        {label}
        {required ? ' *' : ''}
      </span>
      {children}
    </label>
  );
}

const SHIP_FIELDS = [
  {
    key: 'name',
    label: 'Nome / razão social',
    required: true,
    placeholder: 'Ex.: Associação Sou Cannabis',
  },
  {
    key: 'document',
    label: 'CPF / CNPJ',
    required: true,
  },
  { key: 'street', label: 'Rua', required: true, placeholder: 'Ex.: Rua das Flores' },
  { key: 'number', label: 'Número', required: true, placeholder: 'Ex.: 100' },
  { key: 'neighborhood', label: 'Bairro', required: true, placeholder: 'Ex.: Centro' },
  { key: 'complement', label: 'Complemento', required: false, placeholder: 'Apto, sala, bloco…' },
  { key: 'city', label: 'Cidade', required: true, placeholder: 'Ex.: Goiânia' },
  { key: 'state', label: 'UF', required: true },
  { key: 'cep', label: 'CEP', required: true },
  { key: 'phone', label: 'Telefone', required: true },
];

const PACKAGE_FIELDS = [
  { key: 'weight_g', label: 'Peso (g)', placeholder: 'Ex.: 500' },
  { key: 'length_cm', label: 'Comprimento (cm)', placeholder: 'Ex.: 20' },
  { key: 'width_cm', label: 'Largura (cm)', placeholder: 'Ex.: 15' },
  { key: 'height_cm', label: 'Altura (cm)', placeholder: 'Ex.: 10' },
];

/**
 * Remetente, caixa e declaração — exigidos para ativar Loggi / Melhor Envio.
 */
export function ExternalServicesShippingPage({ api }) {
  const [values, setValues] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [itemsByKey, setItemsByKey] = useState({});
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [feedbackAt, setFeedbackAt] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await loadStoreFreightConfig(api);
        if (cancelled) return;
        setValues(res.values);
        setBaseline(structuredClone(res.values));
        setItemsByKey(res.itemsByKey);
      } catch (err) {
        if (!cancelled) {
          setFeedbackAt('load');
          setError(err.message || 'Falha ao carregar');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  function patch(path, value) {
    setValues((prev) => {
      const next = structuredClone(prev);
      const parts = path.split('.');
      let cur = next;
      for (let i = 0; i < parts.length - 1; i += 1) cur = cur[parts[i]];
      cur[parts[parts.length - 1]] = value;
      return next;
    });
  }

  async function onSave(e) {
    e.preventDefault();
    if (!values) return;
    const gaps = getStoreFreightGaps(values);
    if (gaps.incomplete) {
      setFeedbackAt('save');
      setError(`Preencha: ${gaps.missing.join(', ')}.`);
      setMsg('');
      return;
    }
    setSaving(true);
    setFeedbackAt('save');
    setError('');
    setMsg('');
    try {
      const updated = await saveStoreFreightConfig(api, values, baseline, itemsByKey);
      setItemsByKey(updated);
      setBaseline(structuredClone(values));
      setMsg('Dados de envio salvos. Agora você pode ativar o Melhor Envio.');
      window.dispatchEvent(new CustomEvent('kunk:external-services-changed'));
    } catch (err) {
      setError(err.message || 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  }

  if (!values) {
    if (error) {
      return (
        <div className="ext-page">
          <div className="admin-top">
            <div>
              <h1 style={{ margin: 0 }}>Dados de envio</h1>
            </div>
          </div>
          <p className="alert alert-error">{error}</p>
        </div>
      );
    }
    return <AdminLoader />;
  }

  const gaps = getStoreFreightGaps(values);
  const incomplete = gaps.incomplete;
  const ship = values.shipFrom || {};
  const pkg = values.package || {};
  const decl = values.contentDeclaration || {};
  const bannerStatus = incomplete
    ? { kind: 'warning', label: 'Incompleto', detail: `Faltando: ${gaps.missing.join(', ')}.` }
    : { kind: 'ok', label: 'Completo', detail: 'Remetente, caixa e declaração preenchidos.' };
  const stateValue = String(ship.state || '').toUpperCase();
  const stateKnown = !stateValue || UF_OPTIONS.includes(stateValue);

  return (
    <div className="ext-page ext-page-wide">
      <div className="admin-top">
        <div>
          <h1 style={{ margin: 0 }}>Dados de envio</h1>
          <p className="muted" style={{ margin: '0.25rem 0 0' }}>
            Remetente, caixa e declaração — obrigatórios para cotar frete e ativar Loggi / Melhor Envio
          </p>
        </div>
      </div>

      <form onSubmit={onSave} className="card ext-card">
        <ExternalServiceStatusBanner status={bannerStatus} />

        {!incomplete ? (
          <p className="muted" style={{ margin: 0 }}>
            <Link to="/servicos-externos/melhorenvio">Ir para Melhor Envio</Link> para autenticar e
            ativar cotação/etiqueta.
          </p>
        ) : null}

        <section className="ext-section">
          <h2 className="ext-section-title">Remetente (origem) *</h2>
          <div className="ext-form-grid">
            {SHIP_FIELDS.map(({ key, label, required, placeholder }) => (
              <Field key={key} label={label} required={required}>
                {key === 'phone' ? (
                  <PhoneInput
                    value={ship[key] || ''}
                    onChange={(v) => patch(`shipFrom.${key}`, v)}
                    inputClass="input admin-phone-control"
                    placeholder="(62) 99999-9999"
                    inputProps={{
                      name: 'shipFrom.phone',
                      'data-testid': 'envio-ship-phone',
                      autoComplete: 'tel',
                      required: true,
                      placeholder: '(62) 99999-9999',
                    }}
                  />
                ) : key === 'state' ? (
                  <select
                    className="input"
                    data-testid="envio-ship-state"
                    value={stateValue}
                    onChange={(e) => patch('shipFrom.state', e.target.value)}
                    required={required}
                  >
                    <option value="">Selecione a UF</option>
                    {!stateKnown && stateValue ? (
                      <option value={stateValue}>{stateValue} (atual)</option>
                    ) : null}
                    {UF_OPTIONS.map((uf) => (
                      <option key={uf} value={uf}>
                        {uf}
                      </option>
                    ))}
                  </select>
                ) : key === 'cep' ? (
                  <CepInput
                    className="input"
                    data-testid="envio-ship-cep"
                    value={ship[key] || ''}
                    onChange={(v) => patch(`shipFrom.${key}`, v)}
                    required={required}
                    placeholder="00000-000"
                  />
                ) : key === 'document' ? (
                  <CpfCnpjInput
                    className="input"
                    data-testid="envio-ship-document"
                    value={ship[key] || ''}
                    onChange={(v) => patch(`shipFrom.${key}`, v)}
                    required={required}
                  />
                ) : (
                  <input
                    className="input"
                    data-testid={`envio-ship-${key}`}
                    value={ship[key] || ''}
                    onChange={(e) => patch(`shipFrom.${key}`, e.target.value)}
                    required={required}
                    placeholder={placeholder || `Informe ${label.toLowerCase()}`}
                  />
                )}
              </Field>
            ))}
          </div>
        </section>

        <section className="ext-section">
          <h2 className="ext-section-title">Caixa (cotação) *</h2>
          <div className="ext-form-grid">
            {PACKAGE_FIELDS.map(({ key, label, placeholder }) => (
              <Field key={key} label={label} required>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="any"
                  data-testid={`envio-package-${key}`}
                  value={pkg[key] ?? ''}
                  onChange={(e) =>
                    patch(`package.${key}`, e.target.value === '' ? '' : Number(e.target.value))
                  }
                  required
                  placeholder={placeholder}
                />
              </Field>
            ))}
          </div>
        </section>

        <section className="ext-section">
          <h2 className="ext-section-title">Declaração de conteúdo *</h2>
          <div className="ext-form-grid">
            <Field label="Descrição" required>
              <input
                className="input"
                data-testid="envio-content-description"
                value={decl.description || ''}
                onChange={(e) => patch('contentDeclaration.description', e.target.value)}
                required
                placeholder="Ex.: Produtos fitoterápicos"
              />
            </Field>
            <Field label="Valor declarado (R$)" required>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                data-testid="envio-content-total-value"
                value={decl.total_value ?? ''}
                onChange={(e) =>
                  patch(
                    'contentDeclaration.total_value',
                    e.target.value === '' ? '' : Number(e.target.value)
                  )
                }
                required
                placeholder="Ex.: 100.00"
              />
            </Field>
          </div>
        </section>

        <div className="ext-action-row">
          <button type="submit" className="btn btn-primary" data-testid="envio-save" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar dados de envio'}
          </button>
        </div>
        <ExtActionFeedback at="save" feedbackAt={feedbackAt} error={error} msg={msg} />
      </form>
    </div>
  );
}
