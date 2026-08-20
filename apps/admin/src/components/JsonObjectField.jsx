import React, { useMemo } from 'react';
import { fieldLabel } from '../lib/fieldLabels.js';
import {
  emptyJsonObject,
  jsonObjectKeys,
  parseJsonObject,
} from '../lib/jsonFieldSchemas.js';
import { isBooleanField, toBooleanValue } from '../lib/fieldWidgets.js';

/**
 * Editor agrupado de objeto JSON — inputs por chave, sem JSON bruto.
 */
export function JsonObjectField({ id, name, value, onChange }) {
  const obj = useMemo(() => {
    const parsed = parseJsonObject(value);
    if (Object.keys(parsed).length) return parsed;
    return emptyJsonObject(name);
  }, [value, name]);

  const keys = useMemo(() => jsonObjectKeys(name, obj), [name, obj]);

  function patchKey(key, nextVal) {
    onChange({ ...obj, [key]: nextVal === '' ? '' : nextVal });
  }

  return (
    <div className="json-object-field" id={id}>
      <div className="json-object-grid">
        {keys.map((key) => {
          const v = obj[key];
          const inputId = `${id}-${key}`;
          if (isBooleanField(key, v) || typeof v === 'boolean') {
            const boolVal = toBooleanValue(v);
            return (
              <div className="field" key={key}>
                <span className="json-object-label">{fieldLabel(key)}</span>
                <div className="radio-group" role="radiogroup">
                  <label className="radio-option">
                    <input
                      type="radio"
                      name={inputId}
                      checked={boolVal === true}
                      onChange={() => patchKey(key, true)}
                    />
                    Sim
                  </label>
                  <label className="radio-option">
                    <input
                      type="radio"
                      name={inputId}
                      checked={boolVal === false}
                      onChange={() => patchKey(key, false)}
                    />
                    Não
                  </label>
                </div>
              </div>
            );
          }
          // Número de rua / CEP / etc. ficam como texto; só valores numéricos "puros" (parcelas, preço).
          const forceText = /^(number|cep|zip|street|city|state|complement|neighborhood|country)$/i.test(key);
          if (
            !forceText &&
            (typeof v === 'number' ||
              (v !== '' &&
                v != null &&
                !Number.isNaN(Number(v)) &&
                /^-?\d+(\.\d+)?$/.test(String(v).trim())))
          ) {
            return (
              <div className="field" key={key}>
                <label htmlFor={inputId}>{fieldLabel(key)}</label>
                <input
                  id={inputId}
                  type="number"
                  value={v == null || v === '' ? '' : v}
                  onChange={(e) =>
                    patchKey(key, e.target.value === '' ? '' : Number(e.target.value))
                  }
                />
              </div>
            );
          }
          return (
            <div className="field" key={key}>
              <label htmlFor={inputId}>{fieldLabel(key)}</label>
              <input
                id={inputId}
                value={v == null ? '' : String(v)}
                onChange={(e) => patchKey(key, e.target.value)}
              />
            </div>
          );
        })}
      </div>
      {!keys.length ? (
        <p className="muted" style={{ margin: 0 }}>Objeto vazio — sem chaves definidas.</p>
      ) : null}
    </div>
  );
}

/** Exibe arrays/JSON complexo só para leitura (sem editar JSON). */
export function JsonReadonlyField({ value }) {
  if (value == null || value === '') {
    return <p className="muted" style={{ margin: 0 }}>Vazio</p>;
  }
  let text;
  try {
    text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  return <pre className="json-readonly mono">{text}</pre>;
}
