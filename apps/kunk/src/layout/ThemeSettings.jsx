import React from 'react';
import IconButton from '@mui/joy/IconButton';
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded';
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded';
import { useKunkConfig } from '../config/KunkConfigProvider.jsx';

/**
 * Toggle claro/escuro — sol no claro, lua no escuro.
 */
export default function ThemeSettings() {
  const { themeMode, setThemeMode } = useKunkConfig();
  const isLight = themeMode === 'light';

  function toggleTheme() {
    setThemeMode(isLight ? 'dark' : 'light');
  }

  return (
    <IconButton
      variant="soft"
      onClick={toggleTheme}
      title={isLight ? 'Tema claro — clicar para escuro' : 'Tema escuro — clicar para claro'}
      aria-label={isLight ? 'Ativar tema escuro' : 'Ativar tema claro'}
      sx={{
        minWidth: 36,
        minHeight: 36,
        borderRadius: 'md',
        color: isLight ? 'var(--kunk-accent)' : '#fff',
        bgcolor: isLight
          ? 'color-mix(in srgb, var(--kunk-accent) 12%, transparent)'
          : 'color-mix(in srgb, var(--kunk-accent) 55%, transparent)',
        '&:hover': {
          bgcolor: isLight
            ? 'color-mix(in srgb, var(--kunk-accent) 22%, transparent)'
            : 'var(--kunk-accent-hover)',
        },
      }}
    >
      {isLight ? (
        <LightModeRoundedIcon sx={{ fontSize: 20 }} />
      ) : (
        <DarkModeRoundedIcon sx={{ fontSize: 20 }} />
      )}
    </IconButton>
  );
}
