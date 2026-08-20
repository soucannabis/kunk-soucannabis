import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const AssociateAuthContext = createContext(null);
const OperatorAuthContext = createContext(null);

function parseRoles(permissions) {
  if (!permissions) return [];
  if (Array.isArray(permissions)) return permissions;
  try {
    const parsed = JSON.parse(permissions);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    /* ignore */
  }
  return String(permissions)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function computeHasRequiredRole(roles, requiredRole, allowedRoles) {
  if (Array.isArray(allowedRoles) && allowedRoles.length > 0) {
    return allowedRoles.some((role) => roles.includes(role));
  }
  if (requiredRole) {
    return roles.includes(requiredRole);
  }
  return true;
}

export function AssociateAuthProvider({ api, children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.meAssociate();
      setUser(res.data?.user || null);
      return res.data?.user || null;
    } catch {
      setUser(null);
      return null;
    }
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await refresh();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const value = {
    user,
    loading,
    refresh,
    setUser,
    async registerEmail(email, password) {
      const res = await api.registerEmail(email, password);
      setUser(res.data?.user || null);
      return res;
    },
    async login(email, password) {
      const res = await api.loginAssociate(email, password);
      setUser(res.data?.user || null);
      return res;
    },
    async logout() {
      try {
        await api.logoutAssociate();
      } finally {
        setUser(null);
      }
    },
  };

  return React.createElement(AssociateAuthContext.Provider, { value }, children);
}

export function useAssociateAuth() {
  const ctx = useContext(AssociateAuthContext);
  if (!ctx) throw new Error('useAssociateAuth must be used within AssociateAuthProvider');
  return ctx;
}

/**
 * Operator session (system_users + cookie namespaced por app, ex. kunk_oss_session_admin).
 * @param {{ api: object, requiredRole?: string|null, allowedRoles?: string[]|null, children: any }} props
 */
export function OperatorAuthProvider({
  api,
  requiredRole = null,
  allowedRoles = null,
  children,
}) {
  const [user, setUser] = useState(null);
  const [rolePages, setRolePages] = useState(null);
  const [loading, setLoading] = useState(true);

  const roles = useMemo(() => parseRoles(user?.permissions || user?.roles), [user]);
  const hasRequiredRole = useMemo(
    () => computeHasRequiredRole(roles, requiredRole, allowedRoles),
    [roles, requiredRole, allowedRoles]
  );

  const refresh = useCallback(async () => {
    try {
      const res = await api.me();
      setUser(res.data?.user || null);
      setRolePages(res.data?.role_pages || null);
      return res.data?.user || null;
    } catch {
      setUser(null);
      setRolePages(null);
      return null;
    }
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await refresh();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const value = {
    user,
    loading,
    roles,
    rolePages,
    hasRequiredRole,
    requiredRole,
    allowedRoles,
    refresh,
    setUser,
    async login(email, password) {
      const res = await api.login(email, password);
      setUser(res.data?.user || null);
      // role_pages filled on next refresh/me
      try {
        const me = await api.me();
        setRolePages(me.data?.role_pages || null);
      } catch {
        setRolePages(null);
      }
      return res;
    },
    async logout() {
      try {
        await api.logout();
      } finally {
        setUser(null);
        setRolePages(null);
      }
    },
  };

  return React.createElement(OperatorAuthContext.Provider, { value }, children);
}

export function useOperatorAuth() {
  const ctx = useContext(OperatorAuthContext);
  if (!ctx) throw new Error('useOperatorAuth must be used within OperatorAuthProvider');
  return ctx;
}

export { parseRoles, computeHasRequiredRole };
