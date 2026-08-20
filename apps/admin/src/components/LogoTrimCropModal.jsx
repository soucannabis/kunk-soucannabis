import React, { useCallback, useEffect, useRef, useState } from 'react';

const STAGE_MAX_W = 480;
const STAGE_MAX_H = 360;
const MIN_CROP = 16;

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/**
 * Crop livre para aparar espaços em branco da logo (sem proporção forçada).
 */
export function LogoTrimCropModal({ src, title = 'Recortar logo', onConfirm, onCancel, busy = false }) {
  const imgRef = useRef(null);
  const dragRef = useRef(null);
  const cropRef = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const displayRef = useRef({ w: 0, h: 0, scale: 1 });
  const [ready, setReady] = useState(false);
  const [display, setDisplay] = useState({ w: 0, h: 0, scale: 1 });
  /** Crop in display pixels relative to the image box. */
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 0, h: 0 });

  useEffect(() => {
    cropRef.current = crop;
  }, [crop]);

  useEffect(() => {
    displayRef.current = display;
  }, [display]);

  useEffect(() => {
    setReady(false);
    const img = new Image();
    img.onload = () => {
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      const scale = Math.min(STAGE_MAX_W / nw, STAGE_MAX_H / nh, 1);
      const dw = Math.max(1, Math.round(nw * scale));
      const dh = Math.max(1, Math.round(nh * scale));
      const nextDisplay = { w: dw, h: dh, scale };
      const nextCrop = { x: 0, y: 0, w: dw, h: dh };
      setDisplay(nextDisplay);
      setCrop(nextCrop);
      displayRef.current = nextDisplay;
      cropRef.current = nextCrop;
      imgRef.current = img;
      setReady(true);
    };
    img.onerror = () => setReady(false);
    img.src = src;
  }, [src]);

  const clampCrop = useCallback((next, bounds) => {
    const w = clamp(next.w, MIN_CROP, bounds.w);
    const h = clamp(next.h, MIN_CROP, bounds.h);
    const x = clamp(next.x, 0, bounds.w - w);
    const y = clamp(next.y, 0, bounds.h - h);
    return { x, y, w, h };
  }, []);

  useEffect(() => {
    function onPointerMove(e) {
      const drag = dragRef.current;
      if (!drag) return;
      const bounds = displayRef.current;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      const o = drag.origin;
      let next = { ...o };

      if (drag.mode === 'move') {
        next = { x: o.x + dx, y: o.y + dy, w: o.w, h: o.h };
      } else if (drag.mode === 'n') {
        next = { x: o.x, y: o.y + dy, w: o.w, h: o.h - dy };
      } else if (drag.mode === 's') {
        next = { x: o.x, y: o.y, w: o.w, h: o.h + dy };
      } else if (drag.mode === 'w') {
        next = { x: o.x + dx, y: o.y, w: o.w - dx, h: o.h };
      } else if (drag.mode === 'e') {
        next = { x: o.x, y: o.y, w: o.w + dx, h: o.h };
      } else if (drag.mode === 'nw') {
        next = { x: o.x + dx, y: o.y + dy, w: o.w - dx, h: o.h - dy };
      } else if (drag.mode === 'ne') {
        next = { x: o.x, y: o.y + dy, w: o.w + dx, h: o.h - dy };
      } else if (drag.mode === 'sw') {
        next = { x: o.x + dx, y: o.y, w: o.w - dx, h: o.h + dy };
      } else if (drag.mode === 'se') {
        next = { x: o.x, y: o.y, w: o.w + dx, h: o.h + dy };
      }

      if (next.w < 0) {
        next.x += next.w;
        next.w = Math.abs(next.w);
      }
      if (next.h < 0) {
        next.y += next.h;
        next.h = Math.abs(next.h);
      }
      setCrop(clampCrop(next, bounds));
    }

    function onPointerUp() {
      dragRef.current = null;
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [clampCrop]);

  function onPointerDown(e, mode) {
    if (busy || !ready) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origin: { ...cropRef.current },
    };
  }

  async function handleConfirm() {
    const img = imgRef.current;
    if (!img || !ready) return;
    const scale = display.scale || 1;
    const sx = Math.round(crop.x / scale);
    const sy = Math.round(crop.y / scale);
    const sw = Math.max(1, Math.round(crop.w / scale));
    const sh = Math.max(1, Math.round(crop.h / scale));
    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, sw, sh);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Falha ao gerar imagem'))),
        'image/png',
      );
    });
    await onConfirm(blob);
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-card logo-trim-modal">
        <h2 style={{ marginTop: 0 }}>{title}</h2>
        <p className="muted">
          Arraste as bordas para aparar espaços em branco. A proporção é livre — só a área
          selecionada será salva.
        </p>

        <div
          className="logo-trim-stage"
          style={{ width: display.w || STAGE_MAX_W, height: display.h || STAGE_MAX_H }}
        >
          {ready ? (
            <>
              <img
                src={src}
                alt=""
                draggable={false}
                className="logo-trim-image"
                style={{ width: display.w, height: display.h }}
              />
              <div
                className="logo-trim-selection"
                style={{
                  left: crop.x,
                  top: crop.y,
                  width: crop.w,
                  height: crop.h,
                }}
                onPointerDown={(e) => onPointerDown(e, 'move')}
              >
                {['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'].map((handle) => (
                  <button
                    key={handle}
                    type="button"
                    className={`logo-trim-handle logo-trim-handle--${handle}`}
                    aria-label={`Ajustar ${handle}`}
                    disabled={busy}
                    onPointerDown={(e) => onPointerDown(e, handle)}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="muted" style={{ padding: '1rem' }}>Carregando imagem…</div>
          )}
        </div>

        <div className="appearance-actions" style={{ borderTop: 'none', paddingTop: '1rem' }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!ready || busy}
            onClick={handleConfirm}
          >
            {busy ? 'Enviando…' : 'Usar recorte'}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
