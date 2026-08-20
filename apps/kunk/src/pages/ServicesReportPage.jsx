import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  Autocomplete,
} from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import ClearIcon from '@mui/icons-material/Clear';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import LogoutIcon from '@mui/icons-material/Logout';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { createApiClient } from '@kunk/api-client';
import { getKunkPublicConfig } from '@kunk/config';
import { PATHS } from '../app/menuConfig.js';
import { useErrorModal } from '../components/errors/ErrorModalProvider.jsx';
import { formatMoney } from './reception/services/servicesUtils.js';

const muiTheme = createTheme({
  palette: {
    primary: { main: '#496b4c' },
    secondary: { main: '#705372' },
  },
  typography: { fontFamily: 'inherit' },
  shape: { borderRadius: 12 },
});
const GREEN = '#496b4c';
const PURPLE = '#705372';
const PURPLE_HOVER = '#5e4460';

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: 2.5,
    bgcolor: '#f8faf8',
    transition: 'background-color 160ms ease, box-shadow 160ms ease',
    '& fieldset': { borderColor: 'rgba(49, 67, 51, 0.14)' },
    '&:hover fieldset': { borderColor: 'rgba(73, 107, 76, 0.38)' },
    '&.Mui-focused': {
      bgcolor: '#fff',
      boxShadow: '0 0 0 3px rgba(73, 107, 76, 0.1)',
    },
  },
};

function formatMonthYear(dateStr) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime()) || date.getFullYear() < 1970) return null;
  return date.toLocaleString('pt-BR', { month: 'long', year: 'numeric' }).replace(' de ', ' ');
}

function getCurrentMonthYear() {
  const now = new Date();
  return now.toLocaleString('pt-BR', { month: 'long', year: 'numeric' }).replace(' de ', ' ');
}

function getMonthsOfCurrentYear() {
  const months = [];
  const now = new Date();
  for (let i = 0; i <= now.getMonth(); i += 1) {
    const d = new Date(now.getFullYear(), i, 1);
    months.push(d.toLocaleString('pt-BR', { month: 'long', year: 'numeric' }).replace(' de ', ' '));
  }
  return months;
}

function monthLabelToYearMonth(label) {
  if (!label) return null;
  const [monthName, year] = label.split(' ');
  const months = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ];
  const idx = months.findIndex((m) => m === String(monthName || '').toLowerCase());
  if (idx < 0 || !year) return null;
  return `${year}-${String(idx + 1).padStart(2, '0')}`;
}

function professionalDisplayName(p) {
  if (!p) return '—';
  return `${p.name || ''} ${p.last_name || ''}`.trim() || p.professional_name || '—';
}

/**
 * @param {{ mode?: 'staff' | 'portal', onLogout?: () => void }} props
 */
export default function ServicesReportPage({ mode = 'staff', onLogout }) {
  const isPortal = mode === 'portal';
  const navigate = useNavigate();
  const bootstrap = getKunkPublicConfig();
  const api = useMemo(() => createApiClient({ baseUrl: bootstrap.apiUrl, app: 'kunk' }), [bootstrap.apiUrl]);
  const { showError } = useErrorModal();

  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthYear());
  const [selectedProfessional, setSelectedProfessional] = useState(null);
  const [services, setServices] = useState([]);
  const [professionals, setProfessionals] = useState([]);
  const [totals, setTotals] = useState({ count: 0, payable_sum: 0, association_fee_sum: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [validateTarget, setValidateTarget] = useState(null);
  const [validateStep, setValidateStep] = useState('ask'); // ask | missing
  const [missingText, setMissingText] = useState('');
  const [validateBusy, setValidateBusy] = useState(false);
  const [contestView, setContestView] = useState(null); // { text, date, professional, index }

  const monthOptions = useMemo(() => getMonthsOfCurrentYear(), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      const ym = monthLabelToYearMonth(selectedMonth);
      if (ym) params.set('month', ym);
      if (!isPortal && selectedProfessional?.professional_code) {
        params.set('professional_id', selectedProfessional.professional_code);
      }
      const res = await api.getServicesReport(params.toString() ? `?${params}` : '');
      const data = res.data || {};
      setServices(Array.isArray(data.services) ? data.services : []);
      setProfessionals(Array.isArray(data.professionals) ? data.professionals : []);
      setTotals(data.totals || { count: 0, payable_sum: 0 });
      setSelectedIds([]);
    } catch (err) {
      showError(err);
      setServices([]);
      setProfessionals([]);
    } finally {
      setLoading(false);
    }
  }, [api, selectedMonth, selectedProfessional, isPortal, showError]);

  useEffect(() => {
    load();
  }, [load]);

  const professionalOptions = useMemo(() => {
    const map = new Map();
    for (const p of professionals) {
      const code = p.professional_code;
      if (code) map.set(String(code), p);
    }
    for (const s of services) {
      if (s.professional_id && !map.has(String(s.professional_id))) {
        map.set(String(s.professional_id), {
          professional_code: s.professional_id,
          name: s.professional_name,
          last_name: '',
        });
      }
    }
    return [...map.values()].sort((a, b) =>
      professionalDisplayName(a).localeCompare(professionalDisplayName(b), 'pt-BR')
    );
  }, [professionals, services]);

  const grouped = useMemo(() => {
    const tree = {};
    for (const service of services) {
      const monthYear = formatMonthYear(service.consultation_date);
      if (!monthYear) continue;
      const profName =
        service.professional_name ||
        professionalDisplayName(
          professionals.find((p) => String(p.professional_code) === String(service.professional_id))
        );
      if (!tree[monthYear]) tree[monthYear] = {};
      if (!tree[monthYear][profName]) tree[monthYear][profName] = [];
      tree[monthYear][profName].push(service);
    }
    return tree;
  }, [services, professionals]);

  const showTotals = Boolean(selectedProfessional) || isPortal;

  function toggleSelect(service, checked) {
    setSelectedIds((prev) => {
      if (checked) return prev.includes(service.id) ? prev : [...prev, service.id];
      return prev.filter((id) => id !== service.id);
    });
  }

  async function handleValidation(validationType) {
    try {
      await api.validateServicesReport({
        ids: selectedIds,
        commission_validation: validationType,
      });
      await load();
    } catch (err) {
      showError(err);
    }
  }

  async function resolveContest(professional, index, serviceId) {
    try {
      await api.deleteProfessionalContestReport(professional.id, index);
      const id = Number(serviceId);
      if (Number.isFinite(id) && id > 0) {
        await api.validateServicesReport({
          ids: [id],
          commission_validation: 'approved',
        });
      }
      setContestView(null);
      await load();
    } catch (err) {
      showError(err);
    }
  }

  function findContestForService(service) {
    if (!service?.id) return null;
    for (const p of professionals) {
      const reports = Array.isArray(p.contest_reports) ? p.contest_reports : [];
      const index = reports.findIndex((c) => String(c.service_id) === String(service.id));
      if (index >= 0) {
        return { professional: p, contest: reports[index], index };
      }
    }
    const associate = String(service.associate_name || '').trim().toLowerCase();
    if (!associate) return null;
    for (const p of professionals) {
      const reports = Array.isArray(p.contest_reports) ? p.contest_reports : [];
      const index = reports.findIndex((c) => {
        if (selectedMonth && c.month !== selectedMonth) return false;
        return String(c.text || '').toLowerCase().includes(associate);
      });
      if (index >= 0) {
        return { professional: p, contest: reports[index], index };
      }
    }
    return null;
  }

  function openContestView(service, event) {
    event?.stopPropagation?.();
    const found = findContestForService(service);
    if (!found) {
      setContestView({
        text: 'Nenhuma mensagem de contestação encontrada para este atendimento.',
        date: null,
        professional: null,
        index: -1,
        serviceId: service?.id ?? null,
      });
      return;
    }
    setContestView({
      text: found.contest.text || '—',
      date: found.contest.date || null,
      professional: found.professional,
      index: found.index,
      serviceId: found.contest.service_id || service?.id || null,
    });
  }

  function openValidateModal(service) {
    if (service.commission_validation === 'contested') {
      openContestView(service);
      return;
    }
    setValidateTarget(service);
    setValidateStep('ask');
    setMissingText('');
  }

  function closeValidateModal() {
    if (validateBusy) return;
    setValidateTarget(null);
    setValidateStep('ask');
    setMissingText('');
  }

  async function submitPortalValidation(validationType, text) {
    if (!validateTarget?.id) return;
    setValidateBusy(true);
    try {
      await api.validateServicesReport({
        ids: [validateTarget.id],
        commission_validation: validationType,
      });
      if (validationType === 'contested' && text) {
        const pro = professionals[0];
        if (pro?.id) {
          const associate = validateTarget.associate_name || 'associado';
          await api.addProfessionalContestReport(pro.id, {
            text: `${associate}: ${text}`,
            month: selectedMonth,
            service_id: validateTarget.id,
          });
        }
      }
      setValidateTarget(null);
      setValidateStep('ask');
      setMissingText('');
      await load();
    } catch (err) {
      showError(err);
    } finally {
      setValidateBusy(false);
    }
  }

  function openServiceOnAttendancesPage(service, event) {
    event?.stopPropagation?.();
    const params = new URLSearchParams();
    const search = String(service?.associate_name || service?.service_code || '').trim();
    if (search) params.set('s', search);
    const qs = params.toString();
    navigate(qs ? `${PATHS.services}?${qs}` : PATHS.services);
  }

  function validationIcon(service) {
    if (service.commission_validation === 'approved') {
      return (
        <Tooltip title="Validado">
          <CheckCircleIcon sx={{ color: '#2e7d32', fontSize: 22 }} />
        </Tooltip>
      );
    }
    if (service.commission_validation === 'contested') {
      return (
        <Tooltip title="Ver contestação">
          <IconButton
            size="small"
            aria-label="Ver contestação"
            onClick={(e) => openContestView(service, e)}
            sx={{ color: '#ed6c02', p: 0.25 }}
          >
            <WarningAmberIcon sx={{ fontSize: 22 }} />
          </IconButton>
        </Tooltip>
      );
    }
    return '—';
  }

  function exportPdf() {
    const doc = new jsPDF();
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text('Relatório de Serviços', 14, 12);
    let y = 18;
    if (showTotals) {
      doc.setFontSize(9);
      doc.text(`Total de registros: ${totals.count}`, 14, y);
      y += 5;
      doc.text(
        `Valor a receber: R$ ${Number(totals.payable_sum || 0).toFixed(2).replace('.', ',')}`,
        14,
        y
      );
      y += 8;
    }
    Object.entries(grouped).forEach(([monthYear, professionalsGroup]) => {
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      doc.text(monthYear, 14, y);
      y += 5;
      Object.entries(professionalsGroup).forEach(([profName, list]) => {
        doc.setFontSize(8);
        doc.text(`Profissional: ${profName}`, 14, y);
        y += 4;
        const rows = list.map((service) => [
          service.consultation_date
            ? new Date(service.consultation_date).toLocaleString('pt-BR')
            : '-',
          service.associate_name || '-',
          formatMoney(
            service.price_paid != null && service.price_paid !== ''
              ? service.price_paid
              : (Number(service.price) || 0) - (Number(service.donation) || 0)
          ),
          formatMoney(service.donation),
          formatMoney(service.price),
          formatMoney(service.payable),
        ]);
        autoTable(doc, {
          head: [['Data', 'Associado', 'Valor pago', 'Doação', 'Consulta', 'A receber']],
          body: rows,
          startY: y,
          styles: { fontSize: 8, textColor: [0, 0, 0] },
          headStyles: { fontSize: 8, textColor: [0, 0, 0], fillColor: [235, 235, 235] },
          bodyStyles: { textColor: [0, 0, 0] },
        });
        y = (doc.lastAutoTable?.finalY || y) + 8;
      });
    });
    const profLabel = selectedProfessional
      ? professionalDisplayName(selectedProfessional).replace(/[\\/:*?"<>|]/g, '')
      : isPortal
        ? 'Portal'
        : 'Todos';
    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    doc.save(`${stamp} - Relatorio-Servicos - ${profLabel}.pdf`);
  }

  function contestsForProfessional(profName) {
    const professional = professionals.find(
      (p) => professionalDisplayName(p) === profName || p.name === profName
    );
    if (!professional?.contest_reports) return { professional: null, contests: [] };
    const contests = (professional.contest_reports || []).filter((c) => {
      if (!selectedMonth) return true;
      return c.month === selectedMonth;
    });
    return { professional, contests };
  }

  return (
    <ThemeProvider theme={muiTheme}>
    <Box sx={{ width: '100%', maxWidth: 1600, mx: 'auto', pb: 2 }}>
      <Box
        sx={{
          position: 'relative',
          overflow: 'hidden',
          mb: 2,
          p: { xs: 2.5, md: 3.25 },
          color: '#fff',
          borderRadius: 3,
          background: 'linear-gradient(120deg, #314a34 0%, #496b4c 58%, #5d735e 100%)',
          boxShadow: '0 14px 36px rgba(27, 46, 30, 0.2)',
          '&::after': {
            content: '""',
            position: 'absolute',
            width: 230,
            height: 230,
            right: -55,
            top: -110,
            borderRadius: '50%',
            border: '42px solid rgba(255,255,255,0.06)',
          },
        }}
      >
        <Stack direction="row" spacing={2} alignItems="center" sx={{ position: 'relative', zIndex: 1 }}>
          <Box
            sx={{
              width: 52,
              height: 52,
              flex: '0 0 auto',
              display: 'grid',
              placeItems: 'center',
              borderRadius: 2.5,
              bgcolor: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.16)',
            }}
          >
            <AssessmentOutlinedIcon sx={{ fontSize: 28 }} />
          </Box>
          <Box>
            <Typography
              variant="overline"
              sx={{ color: 'rgba(255,255,255,0.68)', letterSpacing: '0.11em', fontWeight: 700 }}
            >
              Relatórios
            </Typography>
            <Typography variant="h5" component="h1" sx={{ fontWeight: 750, lineHeight: 1.15 }}>
              Relatório de atendimentos
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.65, color: 'rgba(255,255,255,0.76)' }}>
              Consulte valores por mês e profissional, exporte PDF e valide pagamentos.
            </Typography>
          </Box>
        </Stack>
      </Box>

      <Paper
        elevation={0}
        className="pageContainerOptions"
        sx={{
          bgcolor: '#fff',
          border: '1px solid rgba(49, 67, 51, 0.1)',
          borderRadius: 3,
          p: { xs: 2, md: 2.5 },
          mb: 2,
          boxShadow: '0 8px 30px rgba(34, 53, 36, 0.07)',
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          alignItems={{ xs: 'stretch', md: 'center' }}
          justifyContent="space-between"
        >
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.5}
            alignItems={{ xs: 'stretch', sm: 'center' }}
            sx={{ flex: 1 }}
          >
            <FormControl size="small" sx={{ minWidth: 180, ...fieldSx }}>
              <InputLabel>Mês/Ano</InputLabel>
              <Select
                value={selectedMonth}
                label="Mês/Ano"
                onChange={(e) => setSelectedMonth(e.target.value)}
                sx={{ borderRadius: 2.5, bgcolor: '#f8faf8' }}
              >
                {monthOptions.map((month) => (
                  <MenuItem key={month} value={month}>
                    {month.charAt(0).toUpperCase() + month.slice(1)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {!isPortal && (
              <Autocomplete
                size="small"
                options={professionalOptions}
                value={selectedProfessional}
                onChange={(_, v) => setSelectedProfessional(v)}
                getOptionLabel={(o) => professionalDisplayName(o)}
                isOptionEqualToValue={(a, b) =>
                  String(a?.professional_code) === String(b?.professional_code)
                }
                renderInput={(params) => (
                  <TextField {...params} label="Profissional" sx={fieldSx} />
                )}
                sx={{ minWidth: 240, flex: 1, maxWidth: 360 }}
              />
            )}
          </Stack>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button
              variant="outlined"
              startIcon={<PictureAsPdfOutlinedIcon />}
              onClick={exportPdf}
              disabled={loading}
              sx={{
                borderRadius: 2.5,
                textTransform: 'none',
                fontWeight: 700,
                color: PURPLE,
                borderColor: 'rgba(112, 83, 114, 0.3)',
                '&:hover': { borderColor: PURPLE, bgcolor: 'rgba(112, 83, 114, 0.06)' },
              }}
            >
              Exportar PDF
            </Button>
            <Button
              variant="contained"
              onClick={load}
              disabled={loading}
              startIcon={loading ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <RefreshIcon />}
              sx={{
                bgcolor: PURPLE,
                borderRadius: 2.5,
                textTransform: 'none',
                fontWeight: 700,
                boxShadow: '0 7px 18px rgba(112, 83, 114, 0.22)',
                '&:hover': { bgcolor: PURPLE_HOVER },
              }}
            >
              Atualizar
            </Button>
            {isPortal && onLogout && (
              <Button
                variant="contained"
                color="error"
                startIcon={<LogoutIcon />}
                onClick={onLogout}
                sx={{ borderRadius: 2.5, textTransform: 'none', fontWeight: 700 }}
              >
                Sair
              </Button>
            )}
          </Stack>
        </Stack>
      </Paper>

      <TableContainer
        className="pageContainerTable"
        component={Paper}
        elevation={0}
        sx={{
          minHeight: 400,
          borderRadius: 3,
          border: '1px solid rgba(49, 67, 51, 0.1)',
          boxShadow: '0 8px 30px rgba(34, 53, 36, 0.07)',
          overflow: 'hidden',
        }}
      >
        <Box sx={{ px: 2.5, pt: 2.5, pb: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 750, color: '#2f3d31' }}>
            Agrupado por mês e profissional
          </Typography>
          {showTotals && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="subtitle1" sx={{ color: '#465348' }}>
                Valor a receber: <b>{formatMoney(totals.payable_sum)}</b>
              </Typography>
              {Number(totals.association_fee_sum) > 0 && (
                <Typography variant="body2" color="text.secondary">
                  Já com desconto da taxa de associação ({formatMoney(totals.association_fee_sum)})
                </Typography>
              )}
            </Box>
          )}
        </Box>
        {loading ? (
          <Box sx={{ py: 8, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress sx={{ color: GREEN }} />
          </Box>
        ) : Object.keys(grouped).length === 0 ? (
          <Typography sx={{ m: 3 }} color="text.secondary">
            Nenhum serviço pago com data de consulta neste período.
          </Typography>
        ) : (
          Object.entries(grouped).map(([monthYear, professionalsGroup]) => (
            <Box key={monthYear} sx={{ mb: 4 }}>
              <Typography variant="subtitle1" sx={{ m: 2, fontWeight: 750, color: GREEN }}>
                {monthYear.charAt(0).toUpperCase() + monthYear.slice(1)}
              </Typography>
              {Object.entries(professionalsGroup).map(([profName, list]) => {
                const { professional, contests } = contestsForProfessional(profName);
                const groupPayable = list.reduce((a, s) => a + (Number(s.payable) || 0), 0);
                return (
                  <Box key={profName} sx={{ mb: 4, ml: 2, mr: 2 }}>
                    <Typography variant="subtitle2" sx={{ m: 1, color: '#2f3d31' }}>
                      Profissional: <b>{profName}</b>
                    </Typography>
                    <Typography variant="subtitle1" sx={{ m: 1, mt: 0, color: '#465348' }}>
                      Valor a receber: <b>{formatMoney(groupPayable)}</b>
                    </Typography>
                    {(() => {
                      const groupFee = list.reduce((a, s) => a + (Number(s.association_fee) || 0), 0);
                      if (groupFee <= 0) return null;
                      return (
                        <Typography variant="body2" color="text.secondary" sx={{ m: 1, mt: 0 }}>
                          Taxa de associação retida: {formatMoney(groupFee)}
                        </Typography>
                      );
                    })()}

                    {contests.length > 0 && (
                      <Box sx={{ ml: 2, mb: 2, maxWidth: 600 }}>
                        <Typography variant="subtitle2" color="error" sx={{ mb: 1 }}>
                          Estão faltando os seguintes dados:
                        </Typography>
                        {contests.map((contest) => {
                          const fullIndex = (professional.contest_reports || []).indexOf(contest);
                          return (
                          <Box
                            key={`${contest.date}-${fullIndex}`}
                            sx={{
                              mb: 1,
                              p: 1.25,
                              backgroundColor: 'rgba(244, 67, 54, 0.08)',
                              borderRadius: 2,
                            }}
                          >
                            <Typography variant="body2" color="text.secondary">
                              {String(contest.date || '').replace('T', ' ').replace(/\..*$/, '')}
                            </Typography>
                            <Typography variant="body2">{contest.text}</Typography>
                          </Box>
                          );
                        })}
                      </Box>
                    )}

                    {!isPortal && selectedIds.length > 0 && (
                      <Box sx={{ my: 2 }}>
                        <Button
                          variant="contained"
                          color="success"
                          sx={{ mr: 1, borderRadius: 2.5, textTransform: 'none', fontWeight: 700 }}
                          startIcon={<CheckCircleIcon />}
                          onClick={() => handleValidation('approved')}
                        >
                          Aprovar ({selectedIds.length})
                        </Button>
                        <Button
                          variant="contained"
                          color="error"
                          sx={{ mr: 1, borderRadius: 2.5, textTransform: 'none', fontWeight: 700 }}
                          startIcon={<CancelIcon />}
                          onClick={() => handleValidation('contested')}
                        >
                          Contestar ({selectedIds.length})
                        </Button>
                        <Button
                          variant="outlined"
                          startIcon={<ClearIcon />}
                          onClick={() => setSelectedIds([])}
                          sx={{
                            borderRadius: 2.5,
                            textTransform: 'none',
                            fontWeight: 700,
                            color: PURPLE,
                            borderColor: 'rgba(112, 83, 114, 0.3)',
                          }}
                        >
                          Limpar seleção
                        </Button>
                      </Box>
                    )}

                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ bgcolor: '#f4f7f4' }}>
                          {!isPortal && (
                            <TableCell
                              sx={{
                                color: '#627064',
                                fontSize: '0.72rem',
                                fontWeight: 800,
                                letterSpacing: '0.06em',
                                textTransform: 'uppercase',
                                width: 50,
                              }}
                            >
                              Sel
                            </TableCell>
                          )}
                          {['Data', 'Associado', 'Valor pago', 'Doação', 'Valor da consulta', 'Valor a receber', 'Validação'].map(
                            (h) => (
                              <TableCell
                                key={h}
                                sx={{
                                  color: '#627064',
                                  fontSize: '0.72rem',
                                  fontWeight: 800,
                                  letterSpacing: '0.06em',
                                  textTransform: 'uppercase',
                                  borderBottomColor: 'rgba(49, 67, 51, 0.1)',
                                }}
                              >
                                {h}
                              </TableCell>
                            )
                          )}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {list.map((service) => (
                          <TableRow
                            key={service.id}
                            onClick={isPortal ? () => openValidateModal(service) : undefined}
                            sx={{
                              '& td': { borderBottomColor: 'rgba(49, 67, 51, 0.08)' },
                              '&:hover': { bgcolor: 'rgba(73, 107, 76, 0.035)' },
                              ...(isPortal
                                ? { cursor: 'pointer', '&:hover': { bgcolor: 'rgba(73, 107, 76, 0.07)' } }
                                : null),
                            }}
                          >
                            {!isPortal && (
                              <TableCell>
                                <Checkbox
                                  checked={selectedIds.includes(service.id)}
                                  onChange={(e) => toggleSelect(service, e.target.checked)}
                                  sx={{ color: GREEN, '&.Mui-checked': { color: GREEN } }}
                                />
                              </TableCell>
                            )}
                            <TableCell>
                              {service.consultation_date
                                ? new Date(service.consultation_date).toLocaleString('pt-BR')
                                : '—'}
                            </TableCell>
                            <TableCell>
                              {!isPortal ? (
                                <Stack direction="row" spacing={0.5} alignItems="center">
                                  <Typography variant="body2" component="span">
                                    {service.associate_name || '—'}
                                  </Typography>
                                  <Tooltip title="Abrir atendimento">
                                    <IconButton
                                      size="small"
                                      aria-label="Abrir atendimento"
                                      onClick={(e) => openServiceOnAttendancesPage(service, e)}
                                      sx={{ color: PURPLE }}
                                    >
                                      <OpenInNewIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                </Stack>
                              ) : (
                                service.associate_name || '—'
                              )}
                            </TableCell>
                            <TableCell>
                              {formatMoney(
                                service.price_paid != null && service.price_paid !== ''
                                  ? service.price_paid
                                  : (Number(service.price) || 0) - (Number(service.donation) || 0)
                              )}
                            </TableCell>
                            <TableCell>{formatMoney(service.donation)}</TableCell>
                            <TableCell>{formatMoney(service.price)}</TableCell>
                            <TableCell>{formatMoney(service.payable)}</TableCell>
                            <TableCell>{validationIcon(service)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Box>
                );
              })}
            </Box>
          ))
        )}
      </TableContainer>

      <Dialog open={Boolean(contestView)} onClose={() => setContestView(null)} fullWidth maxWidth="xs">
        <DialogTitle>Contestação</DialogTitle>
        <DialogContent>
          {contestView?.date ? (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {String(contestView.date).replace('T', ' ').replace(/\..*$/, '')}
            </Typography>
          ) : null}
          <Typography sx={{ whiteSpace: 'pre-wrap' }}>{contestView?.text}</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setContestView(null)}>Fechar</Button>
          {!isPortal &&
            contestView?.professional?.id != null &&
            contestView.index >= 0 && (
              <Button
                variant="contained"
                color="success"
                onClick={() =>
                  resolveContest(
                    contestView.professional,
                    contestView.index,
                    contestView.serviceId
                  )
                }
                sx={{ textTransform: 'none', fontWeight: 700 }}
              >
                Resolver
              </Button>
            )}
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(validateTarget)} onClose={closeValidateModal} fullWidth maxWidth="xs">
        <DialogTitle>
          {validateStep === 'ask' ? 'Validação do atendimento' : 'Estão faltando dados'}
        </DialogTitle>
        <DialogContent>
          {validateStep === 'ask' ? (
            <Typography>Tudo certo com esse atendimento?</Typography>
          ) : (
            <TextField
              autoFocus
              fullWidth
              multiline
              rows={4}
              margin="dense"
              label="Descreva o que está faltando"
              value={missingText}
              onChange={(e) => setMissingText(e.target.value)}
              disabled={validateBusy}
            />
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          {validateStep === 'ask' ? (
            <>
              <Button onClick={closeValidateModal} disabled={validateBusy}>
                Cancelar
              </Button>
              <Button
                variant="outlined"
                color="warning"
                disabled={validateBusy}
                startIcon={<WarningAmberIcon />}
                onClick={() => setValidateStep('missing')}
                sx={{ textTransform: 'none', fontWeight: 700 }}
              >
                Estão faltando dados
              </Button>
              <Button
                variant="contained"
                color="success"
                disabled={validateBusy}
                startIcon={
                  validateBusy ? <CircularProgress size={16} color="inherit" /> : <CheckCircleIcon />
                }
                onClick={() => submitPortalValidation('approved')}
                sx={{ textTransform: 'none', fontWeight: 700 }}
              >
                Sim
              </Button>
            </>
          ) : (
            <>
              <Button
                onClick={() => {
                  setValidateStep('ask');
                  setMissingText('');
                }}
                disabled={validateBusy}
              >
                Voltar
              </Button>
              <Button
                variant="contained"
                color="warning"
                disabled={!missingText.trim() || validateBusy}
                startIcon={
                  validateBusy ? <CircularProgress size={16} color="inherit" /> : <WarningAmberIcon />
                }
                onClick={() => submitPortalValidation('contested', missingText.trim())}
                sx={{ textTransform: 'none', fontWeight: 700 }}
              >
                Enviar
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    </Box>
    </ThemeProvider>
  );
}
