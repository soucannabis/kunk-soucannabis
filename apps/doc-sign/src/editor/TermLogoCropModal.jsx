import React, { useCallback, useEffect, useRef, useState } from 'react';

/** Proporção sugerida da logo horizontal (300×100). */
export const TERM_LOGO_ASPECT = 3; // width / height
export const TERM_LOGO_STAGE_W = 360;
export const TERM_LOGO_STAGE_H = 120;
export const TERM_LOGO_EXPORT_W = 900;
export const TERM_LOGO_EXPORT_H = 300;

/**
 * Crop de logo horizontal (3:1), mesma ideia do LogoCropModal do admin.
 */
export function TermLogoCropModal({ src, onConfirm, onCancel, busy = false }) {
  const imgRef = useRef(null);
  const dragRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [minZoom, setMinZoom] = useState(1);
  const [maxZoom, setMaxZoom] = useState(4);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      setNatural({ w, h });
      const cover = Math.max(TERM_LOGO_STAGE_W / w, TERM_LOGO_STAGE_H / h);
      const contain = Math.min(TERM_LOGO_STAGE_W / w, TERM_LOGO_STAGE_H / h);
      // Permite afastar além do “contain” para deixar margem no quadro.
      const minZ = contain * 0.5;
      const maxZ = Math.max(cover * 4, minZ * 4);
      setMinZoom(minZ);
      setMaxZoom(maxZ);
      setZoom(contain);
      setOffset({
        x: (TERM_LOGO_STAGE_W - w * contain) / 2,
        y: (TERM_LOGO_STAGE_H - h * contain) / 2,
      });
      imgRef.current = img;
      setReady(true);
    };
    img.onerror = () => setReady(false);
    img.src = src;
  }, [src]);

  const clampOffset = useCallback((x, y, z, nw, nh) => {
    const iw = nw * z;
    const ih = nh * z;
    let nx = x;
    let ny = y;
    if (iw <= TERM_LOGO_STAGE_W) nx = (TERM_LOGO_STAGE_W - iw) / 2;
    else nx = Math.min(0, Math.max(TERM_LOGO_STAGE_W - iw, x));
    if (ih <= TERM_LOGO_STAGE_H) ny = (TERM_LOGO_STAGE_H - ih) / 2;
    else ny = Math.min(0, Math.max(TERM_LOGO_STAGE_H - ih, y));
    return { x: nx, y: ny };
  }, []);

  function onZoomChange(nextZoom) {
    const z = Math.max(minZoom, Math.min(maxZoom, Number(nextZoom)));
    const cx = TERM_LOGO_STAGE_W / 2;
    const cy = TERM_LOGO_STAGE_H / 2;
    const scale = z / zoom;
    const nx = cx - (cx - offset.x) * scale;
    const ny = cy - (cy - offset.y) * scale;
    setZoom(z);
    setOffset(clampOffset(nx, ny, z, natural.w, natural.h));
  }

  function onPointerDown(e) {
    if (busy) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  }

  function onPointerMove(e) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    setOffset(
      clampOffset(dragRef.current.ox + dx, dragRef.current.oy + dy, zoom, natural.w, natural.h)
    );
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  async function handleConfirm() {
    const img = imgRef.current;
    if (!img) return;
    const canvas = document.createElement('canvas');
    canvas.width = TERM_LOGO_EXPORT_W;
    canvas.height = TERM_LOGO_EXPORT_H;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scaleX = TERM_LOGO_EXPORT_W / TERM_LOGO_STAGE_W;
    const scaleY = TERM_LOGO_EXPORT_H / TERM_LOGO_STAGE_H;
    ctx.drawImage(
      img,
      offset.x * scaleX,
      offset.y * scaleY,
      natural.w * zoom * scaleX,
      natural.h * zoom * scaleY
    );
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar imagem'))), 'image/png');
    });
    await onConfirm(blob);
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Enquadrar logo">
      <div className="modal-panel" style={{ width: 'min(480px, 100%)' }}>
        <h2 style={{ marginTop: 0 }}>Enquadrar logo do termo</h2>
        <p className="muted">
          Arraste e use o zoom para caber na proporção horizontal 3:1 (caixa 300×100).
          Afaste para ver a logo inteira ou aproxime para preencher.
        </p>
        <div
          className="term-logo-crop-stage"
          style={{ width: TERM_LOGO_STAGE_W, height: TERM_LOGO_STAGE_H }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {ready ? (
            <img
              src={src}
              alt=""
              draggable={false}
              className="term-logo-crop-image"
              style={{
                width: natural.w * zoom,
                height: natural.h * zoom,
                transform: `translate(${offset.x}px, ${offset.y}px)`,
              }}
            />
          ) : (
            <div className="muted" style={{ padding: '1rem' }}>
              Carregando…
            </div>
          )}
          <div className="term-logo-crop-frame" aria-hidden />
        </div>
        <div className="field" style={{ marginTop: '1rem' }}>
          <label htmlFor="term-logo-zoom">Zoom</label>
          <input
            id="term-logo-zoom"
            type="range"
            min={minZoom}
            max={maxZoom}
            step={0.01}
            value={zoom}
            disabled={!ready || busy}
            onChange={(e) => onZoomChange(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" disabled={!ready || busy} onClick={handleConfirm}>
            {busy ? 'Enviando…' : 'Usar este enquadramento'}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
