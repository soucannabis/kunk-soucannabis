import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Badge from '@mui/joy/Badge';
import IconButton from '@mui/joy/IconButton';
import Modal from '@mui/joy/Modal';
import ModalDialog from '@mui/joy/ModalDialog';
import ModalClose from '@mui/joy/ModalClose';
import Typography from '@mui/joy/Typography';
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import List from '@mui/joy/List';
import ListItem from '@mui/joy/ListItem';
import ListItemButton from '@mui/joy/ListItemButton';
import ListItemContent from '@mui/joy/ListItemContent';
import CircularProgress from '@mui/joy/CircularProgress';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { createApiClient } from '@kunk/api-client';
import { getKunkPublicConfig } from '@kunk/config';
import { useOperatorAuth } from '@kunk/auth-session';
import { PATHS } from '../app/menuConfig.js';

function myCode(user) {
  if (!user) return null;
  return user.user_code || user.internal_code || (user.id != null ? String(user.id) : null);
}

function isUnread(row, code) {
  if (!code) return false;
  const readBy = Array.isArray(row.read_by) ? row.read_by : [];
  return !readBy.map(String).includes(String(code));
}

function formatWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function pathForActivity(row) {
  if (row.entity_type === 'reception' && row.entity_code) {
    return `${PATHS.triage}?t=${encodeURIComponent(row.entity_code)}`;
  }
  if (row.entity_type === 'reception') return PATHS.triage;
  return PATHS.systemHistory;
}

export default function ActivityNotifications() {
  const navigate = useNavigate();
  const { user } = useOperatorAuth();
  const code = useMemo(() => myCode(user), [user]);
  const api = useMemo(() => {
    const bootstrap = getKunkPublicConfig();
    return createApiClient({ baseUrl: bootstrap.apiUrl, app: 'kunk' });
  }, []);

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  const refreshCount = useCallback(async () => {
    try {
      const res = await api.myActivityUnreadCount();
      setUnread(res.data?.count || 0);
    } catch {
      /* ignore */
    }
  }, [api]);

  const refreshList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listMyActivity('limit=40');
      setItems(res.data || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    refreshCount();
    const id = setInterval(refreshCount, 30000);
    return () => clearInterval(id);
  }, [refreshCount]);

  async function openModal() {
    setOpen(true);
    await refreshList();
    await refreshCount();
  }

  async function onItemClick(row) {
    if (isUnread(row, code)) {
      try {
        await api.markActivityRead({ ids: [row.id] });
        setUnread((n) => Math.max(0, n - 1));
        setItems((prev) => prev.map((x) => (
          x.id === row.id
            ? { ...x, read_by: [...(Array.isArray(x.read_by) ? x.read_by : []), code] }
            : x
        )));
      } catch {
        /* ignore */
      }
    }
    setOpen(false);
    navigate(pathForActivity(row));
  }

  async function markAll() {
    try {
      await api.markActivityRead({ all: true });
      setUnread(0);
      await refreshList();
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <Badge badgeContent={unread} color="danger" size="sm">
        <IconButton
          variant="soft"
          color="neutral"
          onClick={openModal}
          aria-label="Notificações de ações"
          sx={{
            width: 36,
            height: 36,
            color: 'var(--kunk-accent)',
            bgcolor: 'background.level1',
          }}
        >
          <NotificationsIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </Badge>

      <Modal open={open} onClose={() => setOpen(false)}>
        <ModalDialog sx={{ minWidth: 360, maxWidth: 520, maxHeight: '80vh', p: 2 }}>
          <ModalClose />
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, pr: 3 }}>
            <Typography level="title-md">Ações relacionadas a você</Typography>
            {unread > 0 ? (
              <Button size="sm" variant="plain" onClick={markAll}>Marcar todas</Button>
            ) : null}
          </Box>
          <Typography level="body-sm" sx={{ opacity: 0.7, mb: 1 }}>
            Ações de outros usuários que envolvem você
          </Typography>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size="sm" />
            </Box>
          ) : null}

          {!loading && items.length === 0 ? (
            <Typography level="body-sm" sx={{ py: 2, opacity: 0.7 }}>
              Nenhuma notificação
            </Typography>
          ) : null}

          {!loading && items.length > 0 ? (
            <List sx={{ overflow: 'auto', maxHeight: '55vh', '--ListItem-paddingY': '0.55rem' }}>
              {items.map((row) => {
                const unreadItem = isUnread(row, code);
                return (
                  <ListItem key={row.id}>
                    <ListItemButton
                      onClick={() => onItemClick(row)}
                      sx={{
                        borderRadius: 'md',
                        bgcolor: unreadItem ? 'color-mix(in srgb, var(--kunk-accent) 12%, transparent)' : 'transparent',
                      }}
                    >
                      <ListItemContent>
                        <Typography level="body-sm" sx={{ fontWeight: unreadItem ? 700 : 500 }}>
                          {row.summary}
                        </Typography>
                        <Typography level="body-xs" sx={{ opacity: 0.7 }}>
                          {formatWhen(row.date_created)}
                          {row.actor_name ? ` · ${row.actor_name}` : ''}
                        </Typography>
                      </ListItemContent>
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>
          ) : null}

          <Button
            variant="outlined"
            color="neutral"
            size="sm"
            onClick={() => {
              setOpen(false);
              navigate(PATHS.systemHistory);
            }}
          >
            Ver histórico completo
          </Button>
        </ModalDialog>
      </Modal>
    </>
  );
}
