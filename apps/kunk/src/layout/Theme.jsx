import React, { useEffect, useState } from 'react';
import { CssVarsProvider, extendTheme } from '@mui/joy/styles';
import CssBaseline from '@mui/joy/CssBaseline';
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import Typography from '@mui/joy/Typography';
import { Outlet, useLocation } from 'react-router-dom';
import { useOperatorAuth } from '@kunk/auth-session';
import { KUNK_FONT_SANS } from '@kunk/theme';
import Sidebar from './Sidebar.jsx';
import Header from './Header.jsx';
import QuickNavMenu from './QuickNavMenu.jsx';
import ThemeSettings from './ThemeSettings.jsx';
import ActivityNotifications from '../components/ActivityNotifications.jsx';
import GlobalAppSearch from '../components/search/GlobalAppSearch.jsx';
import { pageTitleFromPath } from '../auth/roleRedirect.js';
import '../styles/themeStyles.css';

const joyTheme = extendTheme({
  fontFamily: {
    body: KUNK_FONT_SANS,
    display: KUNK_FONT_SANS,
  },
});

export default function Theme() {
  const { roles } = useOperatorAuth();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const title = pageTitleFromPath(location.pathname);
  const sidebarOffset = sidebarCollapsed ? '60px' : '220px';

  // Dialogs portal to body — expose offset so modals center in the content area.
  useEffect(() => {
    document.documentElement.style.setProperty('--kunk-sidebar-offset', sidebarOffset);
    return () => {
      document.documentElement.style.removeProperty('--kunk-sidebar-offset');
    };
  }, [sidebarOffset]);

  return (
    <CssVarsProvider theme={joyTheme} disableTransitionOnChange>
      <CssBaseline />
      <Box
        sx={{
          display: 'flex',
          minHeight: '100dvh',
          bgcolor: 'var(--kunk-app-bg)',
          backgroundImage: 'var(--kunk-bg-image)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed',
        }}
      >
        <Header />
        <GlobalAppSearch />
        <Sidebar
          collapsed={sidebarCollapsed}
          setCollapsed={setSidebarCollapsed}
          isAdmin={roles.includes('Administrador')}
        />
        <Box
          component="main"
          className="MainContent"
          sx={{
            px: { xs: 2, md: 2 },
            bgcolor: 'transparent',
            pt: {
              xs: 'calc(12px + var(--Header-height))',
              sm: 'calc(12px + var(--Header-height))',
              md: 3,
            },
            pb: { xs: 2, sm: 2, md: 3 },
            flex: 1,
            display: 'flex',
            marginRight: '2%',
            flexDirection: 'column',
            minWidth: 0,
            height: '100dvh',
            gap: 1,
            marginLeft: sidebarOffset,
            transition: 'margin-left 0.3s',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              mb: 1,
              gap: 2,
              flexDirection: 'row',
              alignItems: 'center',
              flexWrap: 'wrap',
              width: '100%',
              textAlign: 'left',
              marginBottom: '30px',
            }}
            className="namePage"
          >
            <Button
              sx={{
                backgroundColor: 'var(--kunk-accent)',
                '&:hover': { backgroundColor: 'var(--kunk-accent-hover)' },
              }}
              variant="soft"
            >
              <Typography sx={{ color: '#fff' }} level="h4" component="h4">
                {title}
              </Typography>
            </Button>
            <QuickNavMenu />
            <ActivityNotifications />
            <ThemeSettings />
          </Box>
          <Outlet />
        </Box>
      </Box>
    </CssVarsProvider>
  );
}
