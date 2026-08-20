import React, { useEffect, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SaveIcon from '@mui/icons-material/Save';
import AccessTimeFilledIcon from '@mui/icons-material/AccessTimeFilled';
import ShoppingCartRoundedIcon from '@mui/icons-material/ShoppingCartRounded';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import { normalizeCiapCodes, serializeCiapCodes } from '@kunk/forms';
import PhoneField from '../../../components/PhoneField.jsx';
import Ciap2Field from '../../../components/ciap2/Ciap2Field.jsx';
import { displayName, contentAreaDialogSx, contentAreaDialogProps, CONTENT_AREA_DIALOG_Z, contentAreaSelectProps, CONTENT_AREA_OVERLAY_Z } from './associatesStatus.js';
import { useCacheConfig } from '../../../lib/cache/CacheConfigProvider.jsx';
import { fetchPrescribers } from '../../../lib/cache/fetchers.js';
import { useToast } from '../../../components/toast/ToastProvider.jsx';
import { formatMoney } from '../services/servicesUtils.js';

const GREEN = '#5a7a5b';

function formatDateBr(value) {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('pt-BR');
  } catch {
    return String(value);
  }
}

function parseOrderItems(raw) {
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

function formatOrderItems(raw) {
  const items = parseOrderItems(raw);
  if (!items.length) return '—';
  return items
    .map((it) => {
      const qty = it.quantity || it.qty || 1;
      const name = it.name || it.code || it.sku || 'Item';
      return `${qty}x ${name}`;
    })
    .join(', ');
}

function orderCarrierLabel(order) {
  const carrier =
    order?.freight_carrier ||
    order?.freight_option?.provider ||
    order?.freight_option?.carrier ||
    '';
  const name = String(carrier || '').trim();
  if (!name) return '—';
  if (name === 'loggi') return 'Loggi';
  if (name === 'melhorenvio') return 'Melhor Envio';
  return name;
}

function professionalLabel(p) {
  if (!p) return '';
  return `${p.name || ''} ${p.last_name || ''}`.trim() || String(p.professional_code || p.id || '');
}

function professionalKey(p) {
  if (!p) return '';
  return String(p.professional_code || p.id || '');
}

const FULL_WIDTH_KEYS = new Set(['reason_treatment_text']);

/** Alinhado a @kunk/forms (cadastramento). */
const GENDER_OPTIONS = [
  { value: 'homem-cis', label: 'Homem cis' },
  { value: 'mulher-cis', label: 'Mulher cis' },
  { value: 'homem-trans', label: 'Homem trans' },
  { value: 'mulher-trans', label: 'Mulher trans' },
  { value: 'travesti', label: 'Travesti' },
  { value: 'nao-binario', label: 'Não-binário' },
  { value: 'outro', label: 'Outro' },
];

const MARITAL_OPTIONS = ['Solteiro(a)', 'Casado(a)', 'União-Estável', 'Viúvo(a)', 'Divorciado(a)'];

const UF_OPTIONS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

const PERSON_FIELDS = [
  ['associate_name', 'Nome'],
  ['associate_last_name', 'Sobrenome'],
  ['associate_cpf', 'CPF'],
  ['associate_rg', 'RG'],
  ['associate_rg_issuer', 'Órgão emissor'],
  ['associate_birth_date', 'Nascimento'],
  ['gender', 'Gênero'],
  ['nationality', 'Nacionalidade'],
  ['marital_status', 'Estado civil'],
  ['mobile_number', 'Telefone'],
  ['email_account', 'E-mail'],
  ['street', 'Rua'],
  ['street_number', 'Número'],
  ['complement', 'Complemento'],
  ['neighborhood', 'Bairro'],
  ['city', 'Cidade'],
  ['state', 'UF'],
  ['cep', 'CEP'],
  ['reason_treatment_text', 'Motivo do tratamento'],
];

const CONTACT_KEYS = new Set(['mobile_number', 'email_account']);
const ADDRESS_KEYS = new Set(['street', 'street_number', 'complement', 'neighborhood', 'city', 'state', 'cep']);
/** Campos obrigatórios do formulário (complemento é opcional). */
const REQUIRED_PERSON_KEYS = PERSON_FIELDS.map(([key]) => key).filter((key) => key !== 'complement');

const EMPTY_DELIVERY = {
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
  cep: '',
};

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function formatCpf(value) {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatCep(value) {
  const d = onlyDigits(value).slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function normalizeMarital(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase().replace(/-/g, ' ');
  const found = MARITAL_OPTIONS.find((o) => {
    const opt = o.toLowerCase().replace(/-/g, ' ');
    const base = opt.replace(/\(a\)$/i, '').trim();
    return opt === lower || base === lower || `${base}(a)` === lower;
  });
  return found || raw;
}

function emptyPersonForm() {
  return {
    ...Object.fromEntries(PERSON_FIELDS.map(([key]) => [key, ''])),
    ciap_codes: [],
    use_custom_contact: false,
    use_custom_address: false,
    use_delivery: false,
    delivery_address: { ...EMPTY_DELIVERY },
  };
}

function deliveryFromRecord(record) {
  const src = record?.delivery_address || record?.address_delivery;
  if (!src || typeof src !== 'object') return { ...EMPTY_DELIVERY };
  return {
    street: src.street || '',
    number: src.number || src.street_number || '',
    complement: src.complement || '',
    neighborhood: src.neighborhood || '',
    city: src.city || '',
    state: src.state || '',
    cep: src.cep || src.postal_code || '',
  };
}

function deliveryHasValues(delivery) {
  return Object.values(delivery || {}).some((v) => String(v || '').trim());
}

function contactHasValues(data) {
  if (!data) return false;
  return Boolean(String(data.mobile_number || '').trim() || String(data.email_account || '').trim());
}

function addressHasValues(data) {
  if (!data) return false;
  return ['street', 'street_number', 'neighborhood', 'city', 'state', 'cep'].some((k) =>
    String(data[k] || '').trim()
  );
}

function pickContact(source) {
  return {
    mobile_number: source?.mobile_number == null ? '' : onlyDigits(source.mobile_number),
    email_account: source?.email_account || '',
  };
}

function pickAddress(source) {
  return {
    street: source?.street || '',
    street_number: source?.street_number || source?.number || '',
    complement: source?.complement || '',
    neighborhood: source?.neighborhood || '',
    city: source?.city || '',
    state: source?.state || '',
    cep: source?.cep ? formatCep(source.cep) : '',
  };
}

function formatAddressLine(addr) {
  if (!addr) return '';
  return [
    addr.street,
    addr.street_number || addr.number,
    addr.neighborhood,
    addr.city,
    addr.state,
    addr.cep,
  ]
    .filter(Boolean)
    .join(', ');
}

function personFormFromRecord(record, { forPatient = false } = {}) {
  const form = emptyPersonForm();
  if (!record) return form;
  for (const [key] of PERSON_FIELDS) {
    const value = record[key];
    if (key === 'mobile_number' || key === 'associate_cpf') {
      form[key] = value == null ? '' : onlyDigits(value);
    } else {
      form[key] = value == null ? '' : String(value);
    }
  }
  // birth_date as YYYY-MM-DD for <input type="date">
  if (form.associate_birth_date) {
    form.associate_birth_date = form.associate_birth_date.slice(0, 10);
  }
  form.ciap_codes = normalizeCiapCodes(record.ciap_codes);
  const delivery = deliveryFromRecord(record);
  form.delivery_address = {
    ...delivery,
    cep: delivery.cep ? formatCep(delivery.cep) : '',
  };
  form.use_delivery = !forPatient && deliveryHasValues(delivery);
  form.use_custom_contact = forPatient ? contactHasValues(record) : true;
  form.use_custom_address = forPatient ? addressHasValues(record) : true;
  return form;
}

/** Only editable person columns — never spread full user (e.g. hydrated `patients`). */
function personPayload(form, {
  ciap2Enabled,
  forPatient = false,
  responsible = null,
  includeDelivery = false,
} = {}) {
  const useContact = forPatient ? form.use_custom_contact : true;
  const useAddress = forPatient ? form.use_custom_address : true;
  const contactSource = useContact ? form : pickContact(responsible);
  const addressSource = useAddress ? form : pickAddress(responsible);

  const out = {};
  for (const [key] of PERSON_FIELDS) {
    let raw = form[key];
    if (CONTACT_KEYS.has(key)) raw = contactSource[key];
    if (ADDRESS_KEYS.has(key)) raw = addressSource[key];

    if (raw === '' || raw == null) {
      out[key] = null;
      continue;
    }
    if (key === 'associate_cpf') {
      out[key] = onlyDigits(raw) || null;
    } else if (key === 'mobile_number') {
      out[key] = onlyDigits(raw) || null;
    } else if (key === 'cep') {
      out[key] = formatCep(raw) || null;
    } else {
      out[key] = raw;
    }
  }
  if (ciap2Enabled) {
    out.ciap_codes = serializeCiapCodes(form.ciap_codes) || null;
  }
  if (includeDelivery) {
    if (form.use_delivery) {
      const d = form.delivery_address || EMPTY_DELIVERY;
      out.delivery_address = {
        street: String(d.street || '').trim(),
        number: String(d.number || '').trim(),
        complement: String(d.complement || '').trim(),
        neighborhood: String(d.neighborhood || '').trim(),
        city: String(d.city || '').trim(),
        state: String(d.state || '').trim(),
        cep: onlyDigits(d.cep) || '',
      };
    } else {
      out.delivery_address = { ...EMPTY_DELIVERY };
    }
  }
  return out;
}

function isDeliveryComplete(delivery) {
  if (!delivery) return false;
  if (!String(delivery.street || '').trim()) return false;
  if (!String(delivery.number || '').trim()) return false;
  if (!String(delivery.neighborhood || '').trim()) return false;
  if (!String(delivery.city || '').trim()) return false;
  if (!String(delivery.state || '').trim()) return false;
  if (onlyDigits(delivery.cep).length !== 8) return false;
  return true;
}

function missingPersonFields(form, {
  forPatient = false,
  requireDelivery = false,
} = {}) {
  const labels = Object.fromEntries(PERSON_FIELDS);
  const skip = new Set();
  if (forPatient && !form.use_custom_contact) {
    CONTACT_KEYS.forEach((k) => skip.add(k));
  }
  if (forPatient && !form.use_custom_address) {
    ADDRESS_KEYS.forEach((k) => skip.add(k));
  }

  const missing = [];
  for (const key of REQUIRED_PERSON_KEYS) {
    if (skip.has(key)) continue;
    const raw = form[key];
    if (key === 'associate_cpf' && onlyDigits(raw).length !== 11) {
      missing.push(labels[key] || key);
      continue;
    }
    if (key === 'mobile_number' && onlyDigits(raw).length < 10) {
      missing.push(labels[key] || key);
      continue;
    }
    if (key === 'cep' && onlyDigits(raw).length !== 8) {
      missing.push(labels[key] || key);
      continue;
    }
    if (!String(raw || '').trim()) missing.push(labels[key] || key);
  }
  if (requireDelivery && form.use_delivery && !isDeliveryComplete(form.delivery_address)) {
    missing.push('Endereço de entrega');
  }
  return missing;
}

function isPersonFormComplete(form, opts = {}) {
  return missingPersonFields(form, opts).length === 0;
}

function PersonFieldsGrid({ form, onChange, omitKeys = null }) {
  const genderValue = String(form.gender || '');
  const genderKnownExact = GENDER_OPTIONS.some((o) => o.value === genderValue);
  const genderSelectValue = genderKnownExact ? genderValue : genderValue ? 'outro' : '';
  const showGenderOther = genderSelectValue === 'outro';
  const genderOtherText = genderKnownExact ? '' : genderValue;
  const maritalValue = normalizeMarital(form.marital_status);
  const maritalKnown = !maritalValue || MARITAL_OPTIONS.includes(maritalValue);
  const stateValue = String(form.state || '').toUpperCase();
  const stateKnown = !stateValue || UF_OPTIONS.includes(stateValue);
  const skip = omitKeys instanceof Set ? omitKeys : null;

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: 1.5,
      }}
    >
      {PERSON_FIELDS.map(([key, label]) => {
        if (skip?.has(key)) return null;
        const fullWidthSx = FULL_WIDTH_KEYS.has(key) ? { gridColumn: '1 / -1' } : undefined;

        if (key === 'mobile_number') {
          return (
            <Box key={key} sx={fullWidthSx}>
              <PhoneField
                name="mobile_number"
                value={form[key] || ''}
                onChange={(v) => onChange(key, v)}
              />
            </Box>
          );
        }

        if (key === 'associate_cpf') {
          return (
            <TextField
              key={key}
              label={label}
              size="small"
              fullWidth
              required
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={formatCpf(form[key])}
              onChange={(e) => onChange(key, onlyDigits(e.target.value).slice(0, 11))}
              sx={fullWidthSx}
            />
          );
        }

        if (key === 'cep') {
          return (
            <TextField
              key={key}
              label={label}
              size="small"
              fullWidth
              required
              inputMode="numeric"
              placeholder="00000-000"
              value={formatCep(form[key])}
              onChange={(e) => onChange(key, formatCep(e.target.value))}
              sx={fullWidthSx}
            />
          );
        }

        if (key === 'gender') {
          return (
            <React.Fragment key={key}>
              <TextField
                select
                label={label}
                size="small"
                fullWidth
                required
                value={genderSelectValue}
                onChange={(e) => {
                  const next = e.target.value;
                  if (next === 'outro') onChange('gender', genderOtherText || 'outro');
                  else onChange('gender', next);
                }}
                SelectProps={contentAreaSelectProps}
              >
                <MenuItem value="">Selecione</MenuItem>
                {GENDER_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </TextField>
              {showGenderOther ? (
                <TextField
                  label="Descreva o gênero"
                  size="small"
                  fullWidth
                  required
                  value={genderOtherText}
                  onChange={(e) => onChange('gender', e.target.value || 'outro')}
                  placeholder="Descreva"
                />
              ) : null}
            </React.Fragment>
          );
        }

        if (key === 'marital_status') {
          return (
            <TextField
              key={key}
              select
              label={label}
              size="small"
              fullWidth
              required
              value={maritalValue}
              onChange={(e) => onChange(key, e.target.value)}
              sx={fullWidthSx}
              SelectProps={contentAreaSelectProps}
            >
              <MenuItem value="">Selecione</MenuItem>
              {MARITAL_OPTIONS.map((o) => (
                <MenuItem key={o} value={o}>
                  {o}
                </MenuItem>
              ))}
              {!maritalKnown ? <MenuItem value={maritalValue}>{maritalValue}</MenuItem> : null}
            </TextField>
          );
        }

        if (key === 'state') {
          return (
            <TextField
              key={key}
              select
              label={label}
              size="small"
              fullWidth
              required
              value={stateValue}
              onChange={(e) => onChange(key, e.target.value)}
              sx={fullWidthSx}
              SelectProps={contentAreaSelectProps}
            >
              <MenuItem value="">UF</MenuItem>
              {UF_OPTIONS.map((uf) => (
                <MenuItem key={uf} value={uf}>
                  {uf}
                </MenuItem>
              ))}
              {!stateKnown ? <MenuItem value={stateValue}>{stateValue}</MenuItem> : null}
            </TextField>
          );
        }

        if (key === 'associate_birth_date') {
          return (
            <TextField
              key={key}
              label={label}
              type="date"
              size="small"
              fullWidth
              required
              InputLabelProps={{ shrink: true }}
              value={String(form[key] || '').slice(0, 10)}
              onChange={(e) => onChange(key, e.target.value)}
              sx={fullWidthSx}
            />
          );
        }

        return (
          <TextField
            key={key}
            label={label}
            size="small"
            fullWidth
            required={key !== 'complement'}
            value={form[key] ?? ''}
            onChange={(e) => onChange(key, e.target.value)}
            multiline={key === 'reason_treatment_text'}
            minRows={key === 'reason_treatment_text' ? 2 : 1}
            sx={fullWidthSx}
          />
        );
      })}
    </Box>
  );
}

function ContactInheritBlock({ form, setForm, responsible, busy }) {
  const contact = pickContact(responsible);
  const hint =
    [contact.mobile_number, contact.email_account].filter(Boolean).join(' · ') ||
    'Sem contato cadastrado no responsável';

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
        Contato
      </Typography>
      <RadioGroup
        value={form.use_custom_contact ? 'custom' : 'inherit'}
        onChange={(e) => {
          const custom = e.target.value === 'custom';
          setForm((prev) =>
            custom
              ? { ...prev, use_custom_contact: true }
              : { ...prev, use_custom_contact: false, ...pickContact({}) }
          );
        }}
      >
        <FormControlLabel
          value="inherit"
          control={<Radio size="small" disabled={busy} />}
          label="Usar contato do associado responsável"
        />
        {!form.use_custom_contact ? (
          <Typography variant="body2" color="text.secondary" sx={{ pl: 4, mb: 0.5 }}>
            {hint}
          </Typography>
        ) : null}
        <FormControlLabel
          value="custom"
          control={<Radio size="small" disabled={busy} />}
          label="Usar contato diferente"
        />
      </RadioGroup>
      {form.use_custom_contact ? (
        <Box sx={{ mt: 1.5 }}>
          <PersonFieldsGrid
            form={form}
            onChange={(key, value) => setForm((prev) => ({ ...prev, [key]: value }))}
            omitKeys={new Set(PERSON_FIELDS.map(([k]) => k).filter((k) => !CONTACT_KEYS.has(k)))}
          />
        </Box>
      ) : null}
    </Box>
  );
}

function AddressInheritBlock({ form, setForm, responsible, busy }) {
  const address = pickAddress(responsible);
  const hint = formatAddressLine(address) || 'Sem endereço cadastrado no responsável';

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
        Endereço
      </Typography>
      <RadioGroup
        value={form.use_custom_address ? 'custom' : 'inherit'}
        onChange={(e) => {
          const custom = e.target.value === 'custom';
          setForm((prev) =>
            custom
              ? { ...prev, use_custom_address: true }
              : { ...prev, use_custom_address: false, ...pickAddress({}) }
          );
        }}
      >
        <FormControlLabel
          value="inherit"
          control={<Radio size="small" disabled={busy} />}
          label="Usar endereço do associado responsável"
        />
        {!form.use_custom_address ? (
          <Typography variant="body2" color="text.secondary" sx={{ pl: 4, mb: 0.5 }}>
            {hint}
          </Typography>
        ) : null}
        <FormControlLabel
          value="custom"
          control={<Radio size="small" disabled={busy} />}
          label="Usar endereço diferente"
        />
      </RadioGroup>
      {form.use_custom_address ? (
        <Box sx={{ mt: 1.5 }}>
          <PersonFieldsGrid
            form={form}
            onChange={(key, value) => setForm((prev) => ({ ...prev, [key]: value }))}
            omitKeys={new Set(PERSON_FIELDS.map(([k]) => k).filter((k) => !ADDRESS_KEYS.has(k)))}
          />
        </Box>
      ) : null}
    </Box>
  );
}

function DeliveryAddressSection({ form, setForm, busy }) {
  const d = form.delivery_address || EMPTY_DELIVERY;
  const stateValue = String(d.state || '').toUpperCase();
  const stateKnown = !stateValue || UF_OPTIONS.includes(stateValue);

  function setDelivery(key, value) {
    setForm((prev) => ({
      ...prev,
      delivery_address: { ...(prev.delivery_address || EMPTY_DELIVERY), [key]: value },
    }));
  }

  return (
    <Box sx={{ mb: 2.5 }}>
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
        Endereço de entrega
      </Typography>
      <FormControlLabel
        control={
          <Switch
            checked={Boolean(form.use_delivery)}
            disabled={busy}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                use_delivery: e.target.checked,
                delivery_address: e.target.checked
                  ? prev.delivery_address || { ...EMPTY_DELIVERY }
                  : { ...EMPTY_DELIVERY },
              }))
            }
          />
        }
        label="Usar endereço de entrega diferente"
      />
      {form.use_delivery ? (
        <Box
          sx={{
            mt: 1.5,
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: 1.5,
          }}
        >
          <TextField
            label="Rua"
            size="small"
            fullWidth
            value={d.street}
            onChange={(e) => setDelivery('street', e.target.value)}
            sx={{ gridColumn: '1 / -1' }}
          />
          <TextField
            label="Número"
            size="small"
            fullWidth
            value={d.number}
            onChange={(e) => setDelivery('number', e.target.value)}
          />
          <TextField
            label="Complemento"
            size="small"
            fullWidth
            value={d.complement}
            onChange={(e) => setDelivery('complement', e.target.value)}
          />
          <TextField
            label="Bairro"
            size="small"
            fullWidth
            value={d.neighborhood}
            onChange={(e) => setDelivery('neighborhood', e.target.value)}
          />
          <TextField
            label="Cidade"
            size="small"
            fullWidth
            value={d.city}
            onChange={(e) => setDelivery('city', e.target.value)}
          />
          <TextField
            select
            label="UF"
            size="small"
            fullWidth
            value={stateValue}
            onChange={(e) => setDelivery('state', e.target.value)}
            SelectProps={contentAreaSelectProps}
          >
            <MenuItem value="">UF</MenuItem>
            {UF_OPTIONS.map((uf) => (
              <MenuItem key={uf} value={uf}>
                {uf}
              </MenuItem>
            ))}
            {!stateKnown ? <MenuItem value={stateValue}>{stateValue}</MenuItem> : null}
          </TextField>
          <TextField
            label="CEP"
            size="small"
            fullWidth
            inputMode="numeric"
            placeholder="00000-000"
            value={formatCep(d.cep)}
            onChange={(e) => setDelivery('cep', formatCep(e.target.value))}
          />
        </Box>
      ) : null}
    </Box>
  );
}

function PatientPersonForm({ form, setForm, responsible, busy, ciap2Enabled }) {
  const identityOmit = new Set([...CONTACT_KEYS, ...ADDRESS_KEYS]);
  return (
    <>
      <Box sx={{ mb: 2 }}>
        <PersonFieldsGrid
          form={form}
          onChange={(key, value) => setForm((prev) => ({ ...prev, [key]: value }))}
          omitKeys={identityOmit}
        />
      </Box>
      <ContactInheritBlock form={form} setForm={setForm} responsible={responsible} busy={busy} />
      <AddressInheritBlock form={form} setForm={setForm} responsible={responsible} busy={busy} />
      {ciap2Enabled ? (
        <Box sx={{ mb: 2 }}>
          <Ciap2Field
            value={form.ciap_codes}
            onChange={(codes) => setForm((prev) => ({ ...prev, ciap_codes: codes }))}
            disabled={busy}
          />
        </Box>
      ) : null}
    </>
  );
}

export function PersonalDataTab({
  user,
  onSave,
  onDelete,
  busy,
  ciap2Enabled = true,
  onSendTriage,
  onGoOrder,
  onGoService,
}) {
  const [form, setForm] = useState(() => emptyPersonForm());
  useEffect(() => {
    setForm(personFormFromRecord(user));
  }, [user]);

  const formMissing = missingPersonFields(form, {
    requireDelivery: true,
  });
  const formComplete = formMissing.length === 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, pt: 1 }}>
      <Box sx={{ flex: 1, overflow: 'auto', pr: 0.5, pb: 2 }}>
        <Box sx={{ mb: 2.5 }}>
          <PersonFieldsGrid
            form={form}
            onChange={(key, value) => setForm((prev) => ({ ...prev, [key]: value }))}
          />
        </Box>
        <DeliveryAddressSection form={form} setForm={setForm} busy={busy} />
        {ciap2Enabled ? (
          <Box sx={{ mb: 2.5 }}>
            <Ciap2Field
              value={form.ciap_codes}
              onChange={(codes) => setForm((prev) => ({ ...prev, ciap_codes: codes }))}
              disabled={busy}
            />
          </Box>
        ) : null}
        <Box sx={{ pt: 1, mt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
          <Button color="error" disabled={busy} onClick={onDelete}>
            Excluir associado
          </Button>
        </Box>
      </Box>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        spacing={1.5}
        sx={{
          pt: 1.5,
          borderTop: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          flexShrink: 0,
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Button
            variant="outlined"
            disabled={busy || !user?.user_code}
            onClick={onSendTriage}
            startIcon={<AccessTimeFilledIcon />}
          >
            Triagem
          </Button>
          <Button
            variant="outlined"
            disabled={busy || !user?.user_code}
            onClick={onGoOrder}
            startIcon={<ShoppingCartRoundedIcon />}
          >
            Pedidos
          </Button>
          <Button
            variant="outlined"
            disabled={busy || !user?.user_code}
            onClick={onGoService}
            startIcon={<CalendarMonthRoundedIcon />}
          >
            Atendimentos
          </Button>
        </Stack>
        <Stack direction="row" spacing={1.5} alignItems="center">
          {!formComplete ? (
            <Typography variant="caption" color="text.secondary">
              Preencha: {formMissing.join(', ')}.
            </Typography>
          ) : null}
          <Button
            variant="contained"
            disabled={busy || !formComplete}
            startIcon={<SaveIcon />}
            onClick={() => onSave(personPayload(form, { ciap2Enabled, includeDelivery: true }))}
            sx={{ bgcolor: GREEN, '&:hover': { bgcolor: '#303B30' } }}
          >
            Salvar
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}

export function PatientsTab({
  patients,
  responsible,
  onCreate,
  onSave,
  onDelete,
  busy,
  ciap2Enabled = true,
}) {
  const [draft, setDraft] = useState(() => emptyPersonForm());
  const [editing, setEditing] = useState({});
  const [showNewForm, setShowNewForm] = useState(false);

  useEffect(() => {
    setEditing({});
  }, [patients]);

  function closeNewForm() {
    setShowNewForm(false);
    setDraft(emptyPersonForm());
  }

  const draftMissing = missingPersonFields(draft, {
    forPatient: true,
  });
  const draftComplete = draftMissing.length === 0;

  return (
    <Box sx={{ pt: 2 }}>
      {showNewForm ? (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
            Novo paciente
          </Typography>
          <PatientPersonForm
            form={draft}
            setForm={setDraft}
            responsible={responsible}
            busy={busy}
            ciap2Enabled={ciap2Enabled}
          />
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button variant="outlined" disabled={busy} onClick={closeNewForm}>
              Cancelar
            </Button>
            <Button
              variant="contained"
              disabled={busy || !draftComplete}
              startIcon={<SaveIcon />}
              onClick={async () => {
                try {
                  await onCreate(
                    personPayload(draft, {
                      ciap2Enabled,
                      forPatient: true,
                      responsible,
                    })
                  );
                  closeNewForm();
                } catch {
                  /* parent sets msg */
                }
              }}
              sx={{ bgcolor: GREEN, '&:hover': { bgcolor: '#303B30' } }}
            >
              Adicionar paciente
            </Button>
          </Stack>
          {!draftComplete ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, textAlign: 'right' }}>
              Preencha: {draftMissing.join(', ')}.
            </Typography>
          ) : null}
        </Box>
      ) : (
        <Button
          variant="contained"
          onClick={() => setShowNewForm(true)}
          sx={{ mb: 3, bgcolor: GREEN, '&:hover': { bgcolor: '#303B30' } }}
        >
          Cadastrar novo paciente
        </Button>
      )}

      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
        Pacientes cadastrados
      </Typography>
      {(patients || []).length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Nenhum paciente vinculado.
        </Typography>
      ) : (
        (patients || []).map((p) => {
          const base = personFormFromRecord(p, { forPatient: true });
          const form = { ...base, ...(editing[p.id] || {}) };
          const setPatientForm = (updater) => {
            setEditing((prev) => {
              const current = prev[p.id] || base;
              const next = typeof updater === 'function' ? updater(current) : updater;
              return { ...prev, [p.id]: next };
            });
          };
          const patientMissing = missingPersonFields(form, {
            forPatient: true,
          });
          const patientComplete = patientMissing.length === 0;
          return (
            <Accordion
              key={p.id}
              disableGutters
              sx={{
                mb: 1,
                border: '1px solid #ddd',
                borderRadius: 1,
                '&:before': { display: 'none' },
              }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography fontWeight={600}>{displayName(p)}</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <PatientPersonForm
                  form={form}
                  setForm={setPatientForm}
                  responsible={responsible}
                  busy={busy}
                  ciap2Enabled={ciap2Enabled}
                />
                <Stack direction="row" justifyContent="flex-end" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
                  {!patientComplete ? (
                    <Typography variant="caption" color="text.secondary">
                      Preencha: {patientMissing.join(', ')}.
                    </Typography>
                  ) : null}
                  <Button
                    size="small"
                    variant="contained"
                    disabled={busy || !patientComplete}
                    startIcon={<SaveIcon />}
                    onClick={() =>
                      onSave(
                        p.id,
                        personPayload(form, {
                          ciap2Enabled,
                          forPatient: true,
                          responsible,
                        })
                      )
                    }
                    sx={{ bgcolor: GREEN, '&:hover': { bgcolor: '#303B30' } }}
                  >
                    Salvar
                  </Button>
                </Stack>
                <Box sx={{ pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
                  <Button size="small" color="error" onClick={() => onDelete(p.id)} disabled={busy}>
                    Excluir paciente
                  </Button>
                </Box>
              </AccordionDetails>
            </Accordion>
          );
        })
      )}
    </Box>
  );
}

export function PrescriberTab({ user, onSave, busy, FileUpload, api }) {
  const { enabled: cacheEnabled } = useCacheConfig();
  const toast = useToast();
  const [professionals, setProfessionals] = useState([]);
  const [selected, setSelected] = useState(null);
  const [datePrescription, setDatePrescription] = useState('');
  const [loadingPros, setLoadingPros] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingPros(true);
      try {
        const rows = await fetchPrescribers(api, cacheEnabled);
        if (!cancelled) setProfessionals(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setProfessionals([]);
      } finally {
        if (!cancelled) setLoadingPros(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, cacheEnabled]);

  useEffect(() => {
    setDatePrescription(user?.date_prescription ? String(user.date_prescription).slice(0, 10) : '');
    const code = user?.prescriber_code != null ? String(user.prescriber_code) : '';
    const fromList = code
      ? professionals.find((p) => professionalKey(p) === code) || null
      : null;
    if (fromList) {
      setSelected(fromList);
      return;
    }
    if (user?.prescriber) {
      setSelected({
        id: `legacy-${code || 'name'}`,
        professional_code: code || null,
        name: String(user.prescriber),
        last_name: '',
        __legacy: true,
      });
      return;
    }
    setSelected(null);
  }, [user, professionals]);

  function savePrescriber(value) {
    const clearing = value == null;
    onSave(
      {
        prescriber: value ? professionalLabel(value) : null,
        prescriber_code: value ? professionalKey(value) || null : null,
        date_prescription: datePrescription || null,
      },
      { success: clearing ? 'Prescritor removido' : 'Prescritor salvo' }
    );
  }

  const options =
    selected?.__legacy &&
    !professionals.some((p) => professionalKey(p) === professionalKey(selected))
      ? [selected, ...professionals]
      : professionals;

  return (
    <Box sx={{ pt: 3 }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          gap: 3,
          alignItems: 'start',
        }}
      >
        <Box
          sx={{
            border: '1px solid #e0e0e0',
            borderRadius: 2,
            p: 2,
          }}
        >
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
            Prescritor
          </Typography>
          <Stack spacing={1.5}>
            <Autocomplete
              options={options}
              loading={loadingPros}
              value={selected}
              onChange={(_e, value) => {
                setSelected(value);
                if (value == null) savePrescriber(null);
              }}
              getOptionLabel={(o) => professionalLabel(o)}
              isOptionEqualToValue={(a, b) => professionalKey(a) === professionalKey(b)}
              filterOptions={(opts, { inputValue }) => {
                const q = String(inputValue || '')
                  .trim()
                  .toLowerCase();
                if (!q) return opts;
                return opts.filter((p) => professionalLabel(p).toLowerCase().includes(q));
              }}
              slotProps={{
                popper: { sx: { zIndex: CONTENT_AREA_OVERLAY_Z } },
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Prescritor"
                  size="small"
                  placeholder="Pesquisar prescritor…"
                />
              )}
              noOptionsText={loadingPros ? 'Carregando…' : 'Nenhum prescritor encontrado'}
            />
            <Button
              variant="contained"
              disabled={busy}
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
              onClick={() => savePrescriber(selected)}
              sx={{ bgcolor: GREEN, alignSelf: 'flex-end', '&:hover': { bgcolor: '#303B30' } }}
            >
              {busy ? 'Salvando…' : 'Salvar prescritor'}
            </Button>
          </Stack>
        </Box>

        <Box
          sx={{
            border: '1px solid #e0e0e0',
            borderRadius: 2,
            p: 2,
          }}
        >
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
            Receita
          </Typography>
          <TextField
            label="Data da receita"
            type="date"
            size="small"
            fullWidth
            InputLabelProps={{ shrink: true }}
            value={datePrescription}
            onChange={(e) => setDatePrescription(e.target.value)}
            sx={{ mb: 2 }}
          />
          {FileUpload && user ? (
            <FileUpload
              api={api}
              user={user}
              kind="prescription"
              onUploaded={() => toast.success('Receita enviada')}
              onDeleted={() => toast.success('Receita removida')}
            />
          ) : null}
        </Box>
      </Box>
    </Box>
  );
}

export function AnnotationsTab({ annotations, onAdd, onRemove, busy, operatorName }) {
  const [text, setText] = useState('');
  return (
    <Box sx={{ pt: 1.5 }}>
      <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 2 }}>
        <TextField
          fullWidth
          size="small"
          label="Nova anotação"
          multiline
          minRows={3}
          maxRows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ mt: 1 }}
        />
        <Button
          variant="contained"
          disabled={busy || !text.trim()}
          onClick={() => {
            onAdd({
              id: `${Date.now()}`,
              text: text.trim(),
              date_created: new Date().toISOString(),
              userName: operatorName || 'Operador',
            });
            setText('');
          }}
          sx={{ bgcolor: GREEN, mt: 1, flexShrink: 0 }}
        >
          Adicionar
        </Button>
      </Stack>
      {(annotations || []).map((a) => (
        <Box key={a.id} sx={{ borderBottom: '1px solid #eee', py: 1 }}>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
            {a.text}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {a.userName} · {a.date_created ? new Date(a.date_created).toLocaleString('pt-BR') : ''}
          </Typography>
          <Button size="small" color="error" onClick={() => onRemove(a.id)} disabled={busy}>
            Excluir
          </Button>
        </Box>
      ))}
    </Box>
  );
}

export function HistoryTab({ history }) {
  const orders = history?.orders || [];
  const services = history?.services || [];

  const headSx = { bgcolor: GREEN, color: '#fff', fontWeight: 600, whiteSpace: 'nowrap' };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pb: 1 }}>
      <Box>
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
          Pedidos
        </Typography>
        {orders.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Nenhum pedido
          </Typography>
        ) : (
          <TableContainer sx={{ border: '1px solid #e0e0e0', borderRadius: 1, maxHeight: 280 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={headSx}>Data</TableCell>
                  <TableCell sx={headSx}>Status</TableCell>
                  <TableCell sx={headSx}>Itens</TableCell>
                  <TableCell sx={headSx} align="right">
                    Desconto
                  </TableCell>
                  <TableCell sx={headSx} align="right">
                    Doação
                  </TableCell>
                  <TableCell sx={headSx} align="right">
                    Total
                  </TableCell>
                  <TableCell sx={headSx}>Transportadora</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id || o.order_code} hover>
                    <TableCell>{formatDateBr(o.created_date || o.date_created)}</TableCell>
                    <TableCell>{o.status || '—'}</TableCell>
                    <TableCell sx={{ maxWidth: 280, whiteSpace: 'normal' }}>
                      {formatOrderItems(o.items)}
                    </TableCell>
                    <TableCell align="right">{formatMoney(o.discount)}</TableCell>
                    <TableCell align="right">{formatMoney(o.donation)}</TableCell>
                    <TableCell align="right">{formatMoney(o.total)}</TableCell>
                    <TableCell>{orderCarrierLabel(o)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>

      <Box>
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
          Atendimentos
        </Typography>
        {services.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Nenhum atendimento
          </Typography>
        ) : (
          <TableContainer sx={{ border: '1px solid #e0e0e0', borderRadius: 1, maxHeight: 280 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={headSx}>Data</TableCell>
                  <TableCell sx={headSx}>Status</TableCell>
                  <TableCell sx={headSx}>Profissional</TableCell>
                  <TableCell sx={headSx}>Paciente / Associado</TableCell>
                  <TableCell sx={headSx} align="right">
                    Valor
                  </TableCell>
                  <TableCell sx={headSx} align="right">
                    Doação
                  </TableCell>
                  <TableCell sx={headSx} align="right">
                    Pago
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {services.map((s) => (
                  <TableRow key={s.id || s.service_code} hover>
                    <TableCell>{formatDateBr(s.date || s.consultation_date)}</TableCell>
                    <TableCell>{s.status || '—'}</TableCell>
                    <TableCell>{s.professional_name || '—'}</TableCell>
                    <TableCell>{s.patient_name || s.associate_name || '—'}</TableCell>
                    <TableCell align="right">{formatMoney(s.price)}</TableCell>
                    <TableCell align="right">{formatMoney(s.donation)}</TableCell>
                    <TableCell align="right">{formatMoney(s.price_paid)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </Box>
  );
}

export function TermStubMenu({
  canCreate,
  canDownload,
  onNewTerm,
  onDownload,
}) {
  return (
    <>
      {canCreate ? <MenuItem onClick={onNewTerm}>Criar termo</MenuItem> : null}
      {canDownload ? <MenuItem onClick={onDownload}>Download do termo</MenuItem> : null}
    </>
  );
}

export function ConfirmDialog({ open, title, onClose, onConfirm, busy = false, error = '' }) {
  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      {...contentAreaDialogProps}
      sx={{
        ...contentAreaDialogSx,
        zIndex: CONTENT_AREA_DIALOG_Z + 10,
      }}
    >
      <DialogTitle>{title}</DialogTitle>
      {error ? (
        <Box px={3} pb={1}>
          <Typography color="error" variant="body2">
            {error}
          </Typography>
        </Box>
      ) : null}
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button color="error" variant="contained" onClick={onConfirm} disabled={busy}>
          {busy ? 'Excluindo…' : 'Confirmar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
