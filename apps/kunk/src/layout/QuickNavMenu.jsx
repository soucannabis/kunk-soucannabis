import React from 'react';
import { Box, Button, ButtonGroup } from '@mui/joy';
import { useLocation, useNavigate } from 'react-router-dom';
import AccessTimeFilledIcon from '@mui/icons-material/AccessTimeFilled';
import ShoppingCartRoundedIcon from '@mui/icons-material/ShoppingCartRounded';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import { PATHS } from '../app/menuConfig.js';

const NAV_ITEMS = [
  {
    label: 'Triagem',
    path: PATHS.triage,
    match: 'acolhimento/triagem',
    icon: AccessTimeFilledIcon,
  },
  {
    label: 'Pedidos',
    path: PATHS.orders,
    match: 'loja/pedidos',
    icon: ShoppingCartRoundedIcon,
  },
  {
    label: 'Atendimentos',
    path: PATHS.services,
    match: 'acolhimento/servicos',
    icon: CalendarMonthRoundedIcon,
  },
];

export default function QuickNavMenu() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 0.75,
      }}
    >
      <ButtonGroup
        variant="soft"
        sx={{
          borderRadius: 'lg',
          boxShadow: 'sm',
          bgcolor: 'background.level1',
          p: 0.5,
          gap: 0.5,
          '--ButtonGroup-separatorSize': '0px',
          '& .MuiButton-root': {
            border: 'none',
            minHeight: 36,
            px: { xs: 1.25, sm: 2 },
            fontWeight: 600,
            fontSize: '0.875rem',
            borderRadius: 'md',
            transition: 'all 0.2s ease',
          },
        }}
      >
        {NAV_ITEMS.map(({ label, path, match, icon: Icon }) => {
          const isActive = location.pathname.includes(match);
          return (
            <Button
              key={path}
              onClick={() => navigate(path)}
              startDecorator={
                <Icon
                  sx={{
                    fontSize: 18,
                    color: isActive ? '#fff' : 'inherit',
                  }}
                />
              }
              sx={{
                color: isActive ? '#fff' : 'var(--kunk-accent)',
                bgcolor: isActive ? 'var(--kunk-accent)' : 'transparent',
                '& .MuiButton-startDecorator': {
                  color: isActive ? '#fff' : 'inherit',
                },
                '&:hover': {
                  bgcolor: isActive ? 'var(--kunk-accent-hover)' : 'color-mix(in srgb, var(--kunk-accent) 12%, transparent)',
                  color: isActive ? '#fff' : 'var(--kunk-accent)',
                  '& .MuiButton-startDecorator': {
                    color: isActive ? '#fff' : 'inherit',
                  },
                },
              }}
            >
              {label}
            </Button>
          );
        })}
      </ButtonGroup>
    </Box>
  );
}
