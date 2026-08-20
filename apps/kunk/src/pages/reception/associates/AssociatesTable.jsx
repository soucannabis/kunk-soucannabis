import React from 'react';
import {
  Avatar,
  Box,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import AssociateStatusChip from './AssociateStatusChip.jsx';
import { displayName, formatCreated, formatPhoneBr } from './associatesStatus.js';

const GREEN = '#496b4c';

const HEADERS = ['Associado', 'Contato', 'Telefone', 'Cidade', 'Estado', 'Cadastro', 'Status'];

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase() || '?';
}

export default function AssociatesTable({
  rows,
  onOpen,
  patientNames,
}) {
  const hasRows = Boolean(rows?.length);

  return (
    <TableContainer
      component={Paper}
      elevation={0}
      sx={{
        borderRadius: 3,
        border: '1px solid rgba(49, 67, 51, 0.1)',
        boxShadow: '0 8px 30px rgba(34, 53, 36, 0.07)',
        overflow: 'hidden',
        overflowX: { xs: 'auto', md: 'hidden' },
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
      }}
    >
      <Table
        size="small"
        sx={{
          width: '100%',
          tableLayout: { md: 'fixed' },
          minWidth: { xs: 860, md: 'unset' },
        }}
      >
        <TableHead>
          <TableRow sx={{ bgcolor: '#f4f7f4' }}>
            {HEADERS.map((h) => (
              <TableCell
                key={h}
                sx={{
                  color: '#627064',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  borderBottomColor: 'rgba(49, 67, 51, 0.1)',
                  py: 1.5,
                  whiteSpace: 'nowrap',
                  ...(h === 'Associado'
                    ? { width: { md: '22%' }, maxWidth: { md: 220 } }
                    : null),
                  ...(h === 'Status' ? { width: { md: 120 } } : null),
                }}
              >
                {h}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {!hasRows ? (
            <TableRow>
              <TableCell colSpan={HEADERS.length} sx={{ py: 8, borderBottom: 0 }}>
                <Stack alignItems="center" spacing={1.25}>
                  <Box
                    sx={{
                      width: 52,
                      height: 52,
                      display: 'grid',
                      placeItems: 'center',
                      borderRadius: '50%',
                      bgcolor: 'rgba(73, 107, 76, 0.1)',
                      color: GREEN,
                    }}
                  >
                    <GroupOutlinedIcon />
                  </Box>
                  <Typography fontWeight={700} color="#334235">
                    Nenhum associado encontrado
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Ajuste os filtros ou faça um novo cadastro.
                  </Typography>
                </Stack>
              </TableCell>
            </TableRow>
          ) : (
            (rows || []).map((u) => {
              const patientSub = patientNames?.[u.user_code] || patientNames?.[String(u.id)];
              const name = displayName(u);
              return (
                <TableRow
                  key={u.id}
                  hover
                  sx={{
                    '& td': { borderBottomColor: 'rgba(49, 67, 51, 0.08)', py: 1.55 },
                    '&:last-of-type td': { borderBottom: 0 },
                    '&:hover': { bgcolor: 'rgba(73, 107, 76, 0.035)' },
                  }}
                >
                  <TableCell sx={{ maxWidth: { md: 220 }, width: { md: '22%' }, overflow: 'hidden' }}>
                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
                      <Avatar
                        src={u.avatar_url || undefined}
                        tabIndex={0}
                        role="button"
                        aria-label={`Abrir ${name}`}
                        onClick={() => onOpen(u)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onOpen(u);
                          }
                        }}
                        sx={{
                          width: 42,
                          height: 42,
                          flex: '0 0 auto',
                          bgcolor: GREEN,
                          color: '#fff',
                          fontSize: '0.82rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          boxShadow: '0 4px 12px rgba(73, 107, 76, 0.2)',
                          '&:focus-visible': { outline: `2px solid ${GREEN}`, outlineOffset: 2 },
                        }}
                      >
                        {initials(name)}
                      </Avatar>
                      <Box sx={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                        <Typography
                          variant="body2"
                          title={name}
                          sx={{
                            fontWeight: 750,
                            color: '#2f3d31',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {name}
                        </Typography>
                        {patientSub ? (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            title={`Paciente: ${patientSub}`}
                            sx={{
                              display: 'block',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Paciente: {patientSub}
                          </Typography>
                        ) : null}
                      </Box>
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ overflow: 'hidden' }}>
                    <Typography
                      variant="body2"
                      color="#536056"
                      title={u.email_account || undefined}
                      sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {u.email_account || '—'}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ color: '#536056', whiteSpace: 'nowrap' }}>
                    {formatPhoneBr(u.mobile_number)}
                  </TableCell>
                  <TableCell
                    sx={{
                      color: '#536056',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={u.city || undefined}
                  >
                    {u.city || '—'}
                  </TableCell>
                  <TableCell sx={{ color: '#536056', whiteSpace: 'nowrap' }}>
                    {u.state ? String(u.state).toUpperCase() : '—'}
                  </TableCell>
                  <TableCell sx={{ color: '#667168', whiteSpace: 'nowrap' }}>
                    {formatCreated(u)}
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', width: { md: 120 } }}>
                    <AssociateStatusChip user={u} />
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
