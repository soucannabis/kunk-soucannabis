import React from 'react';
import { useCacheConfig } from '../lib/cache/CacheConfigProvider.jsx';

/**
 * Botão acessível que envolve o logo e limpa o cache ao clicar.
 */
export function CacheClearButton({ children, sx = {} }) {
  const { clearAllCache, isClearing } = useCacheConfig();

  return (
    <button
      type="button"
      title="Limpar cache"
      aria-label="Limpar cache"
      disabled={isClearing}
      onClick={() => {
        clearAllCache();
      }}
      style={{
        border: 'none',
        background: 'transparent',
        padding: 0,
        margin: 0,
        cursor: isClearing ? 'wait' : 'pointer',
        opacity: isClearing ? 0.6 : 1,
        display: 'block',
        width: '100%',
        ...sx,
      }}
    >
      {children}
    </button>
  );
}
