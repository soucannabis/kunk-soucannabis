import React from 'react';
import {
  Avatar,
  Box,
  Chip,
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
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import {
  contactEmail,
  contactPhone,
  displayName,
  documentLabel,
  formatCreated,
  statusLabel,
  typeLabel,
} from './institutionalStatus.js';

const GREEN = '#496b4c';
const PURPLE = '#705372';

const HEADERS = ['Cliente', 'Documento', 'E-mail', 'Telefone', 'Tipo', 'Status', 'Cadastro'];

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase() || '?';
}

export default function InstitutionalTable({ rows, onOpen }) {
  const hasRows = Boolean(rows?.length);

  return (
    <TableContainer
      component={Paper}
      elevation={0}
      sx={{
        borderRadius: 3,
        border: '1px solid rgba(49, 67, 51, 0.1)',
        boxShadow: '0 8px 30px rgba(34, 53, 36, 0.07)',
        overflowX: { xs: 'auto', md: 'visible' },
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
      }}
    >
      <Table
        size="small"
        sx={{
          width: '100%',
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
                    <BusinessOutlinedIcon />
                  </Box>
                  <Typography fontWeight={700} color="#334235">
                    Nenhum cliente institucional encontrado
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Ajuste os filtros ou cadastre um novo cliente.
                  </Typography>
                </Stack>
              </TableCell>
            </TableRow>
          ) : (
            (rows || []).map((c) => {
              const name = displayName(c);
              const type = typeLabel(c);
              const isCompany = type === 'Empresa';
              const status = statusLabel(c);
              return (
                <TableRow
                  key={c.id}
                  hover
                  sx={{
                    '& td': { borderBottomColor: 'rgba(49, 67, 51, 0.08)', py: 1.55 },
                    '&:last-of-type td': { borderBottom: 0 },
                    '&:hover': { bgcolor: 'rgba(73, 107, 76, 0.035)' },
                  }}
                >
                  <TableCell>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <Avatar
                        tabIndex={0}
                        role="button"
                        aria-label={`Abrir ${name}`}
                        onClick={() => onOpen(c)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onOpen(c);
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
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 750, color: '#2f3d31' }}>
                          {name}
                        </Typography>
                        {isCompany && c.representative_name ? (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{
                              display: 'block',
                              maxWidth: 280,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Rep.: {[c.representative_name, c.representative_last_name]
                              .filter(Boolean)
                              .join(' ')}
                          </Typography>
                        ) : null}
                      </Box>
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ color: '#536056', whiteSpace: 'nowrap' }}>
                    {documentLabel(c) || '—'}
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      color="#536056"
                      sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}
                    >
                      {contactEmail(c) || '—'}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ color: '#536056', whiteSpace: 'nowrap' }}>
                    {contactPhone(c) || '—'}
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={type}
                      sx={{
                        fontWeight: 600,
                        bgcolor: isCompany ? 'rgba(73, 107, 76, 0.12)' : 'rgba(112, 83, 114, 0.1)',
                        color: isCompany ? GREEN : PURPLE,
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={status}
                      sx={{
                        fontWeight: 600,
                        bgcolor: 'rgba(73, 107, 76, 0.08)',
                        color: '#465348',
                      }}
                    />
                  </TableCell>
                  <TableCell sx={{ color: '#667168', whiteSpace: 'nowrap' }}>
                    {formatCreated(c)}
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
