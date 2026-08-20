import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  KUNK_LOGO_EXPORT_SIZE,
  KUNK_LOGO_FRAME_SIZE,
  KUNK_LOGO_RECT_ASPECT,
  KUNK_LOGO_RECT_EXPORT_H,
  KUNK_LOGO_RECT_EXPORT_W,
  KUNK_LOGO_RECT_FRAME_H,
  KUNK_LOGO_RECT_FRAME_W,
  LOGO_FORMAT_RECTANGULAR,
  LOGO_FORMAT_SQUARE,
  normalizeLogoFormat,
} from '@kunk/config';

const SQUARE_STAGE = 280;
const RECT_STAGE_W = 360;
const RECT_STAGE_H = Math.round(RECT_STAGE_W / KUNK_LOGO_RECT_ASPECT);
const SAFE_INSET = 28;

function stageForFormat(format) {
  if (normalizeLogoFormat(format) === LOGO_FORMAT_RECTANGULAR) {
    return { w: RECT_STAGE_W, h: RECT_STAGE_H };
  }
  return { w: SQUARE_STAGE, h: SQUARE_STAGE };
}

function exportForFormat(format) {
  if (normalizeLogoFormat(format) === LOGO_FORMAT_RECTANGULAR) {
    return { w: KUNK_LOGO_RECT_EXPORT_W, h: KUNK_LOGO_RECT_EXPORT_H };
  }
  return { w: KUNK_LOGO_EXPORT_SIZE, h: KUNK_LOGO_EXPORT_SIZE };
}

/**
 * Assistente de enquadramento (símbolo 1:1 ou logo completa 3:1).
 */
export function LogoCropModal({
  src,
  onConfirm,
  onCancel,
  busy = false,
  format = LOGO_FORMAT_SQUARE,
}) {
  const fmt = normalizeLogoFormat(format);
  const stage = stageForFormat(fmt);
  const isRect = fmt === LOGO_FORMAT_RECTANGULAR;
  const imgRef = useRef(null);
  const dragRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [minZoom, setMinZoom] = useState(1);
  const [maxZoom, setMaxZoom] = useState(4);

  useEffect(() => {
    setReady(false);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      setNatural({ w, h });
      const cover = Math.max(stage.w / w, stage.h / h);
      const contain = Math.min(stage.w / w, stage.h / h);
      const safeInset = isRect ? Math.round(SAFE_INSET / 2) : SAFE_INSET;
      // Zoom out até caber na área segura (margem recomendada), não só preencher o quadro.
      const fitSafe = Math.min(
        (stage.w - 2 * safeInset) / w,
        (stage.h - 2 * safeInset) / h,
      );
      const minZ = Math.min(contain, fitSafe);
      const maxZ = Math.max(cover * 4, minZ * 4);
      setMinZoom(minZ);
      setMaxZoom(maxZ);
      // Começa com a logo inteira visível; o usuário pode aproximar ou afastar.
      setZoom(contain);
      setOffset({
        x: (stage.w - w * contain) / 2,
        y: (stage.h - h * contain) / 2,
      });
      imgRef.current = img;
      setReady(true);
    };
    img.onerror = () => setReady(false);
    img.src = src;
  }, [src, stage.w, stage.h, isRect]);

  const clampOffset = useCallback((x, y, z, nw, nh) => {
    const iw = nw * z;
    const ih = nh * z;
    let nx = x;
    let ny = y;
    if (iw <= stage.w) nx = (stage.w - iw) / 2;
    else nx = Math.min(0, Math.max(stage.w - iw, x));
    if (ih <= stage.h) ny = (stage.h - ih) / 2;
    else ny = Math.min(0, Math.max(stage.h - ih, y));
    return { x: nx, y: ny };
  }, [stage.w, stage.h]);

  function onZoomChange(nextZoom) {
    const z = Math.max(minZoom, Math.min(maxZoom, Number(nextZoom)));
    const cx = stage.w / 2;
    const cy = stage.h / 2;
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
      clampOffset(
        dragRef.current.ox + dx,
        dragRef.current.oy + dy,
        zoom,
        natural.w,
        natural.h,
      ),
    );
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  async function handleConfirm() {
    const img = imgRef.current;
    if (!img) return;
    const exp = exportForFormat(fmt);
    const canvas = document.createElement('canvas');
    canvas.width = exp.w;
    canvas.height = exp.h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scaleX = exp.w / stage.w;
    const scaleY = exp.h / stage.h;
    ctx.drawImage(
      img,
      offset.x * scaleX,
      offset.y * scaleY,
      natural.w * zoom * scaleX,
      natural.h * zoom * scaleY,
    );
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Falha ao gerar imagem'))),
        'image/png',
      );
    });
    await onConfirm(blob);
  }

  const frameHint = isRect
    ? `${KUNK_LOGO_RECT_FRAME_W}×${KUNK_LOGO_RECT_FRAME_H}px (3:1)`
    : `${KUNK_LOGO_FRAME_SIZE}×${KUNK_LOGO_FRAME_SIZE}px`;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Enquadrar logo">
      <div className={`modal-card logo-crop-modal${isRect ? ' logo-crop-modal--rect' : ''}`}>
        <h2 style={{ marginTop: 0 }}>
          {isRect ? 'Enquadrar logo completa' : 'Enquadrar símbolo'}
        </h2>
        <p className="muted">
          Arraste e use o zoom para encaixar{' '}
          {isRect ? 'a logo completa' : 'o símbolo'} no quadro (
          {frameHint}
          ). Afaste para ver a imagem inteira ou aproxime para preencher. A área
          tracejada é a margem recomendada.
        </p>

        <div
          className={`logo-crop-stage${isRect ? ' logo-crop-stage--rect' : ''}`}
          style={{ width: stage.w, height: stage.h }}
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
              className="logo-crop-image"
              style={{
                width: natural.w * zoom,
                height: natural.h * zoom,
                transform: `translate(${offset.x}px, ${offset.y}px)`,
              }}
            />
          ) : (
            <div className="muted" style={{ padding: '1rem' }}>Carregando imagem…</div>
          )}
          <div className="logo-crop-frame" aria-hidden />
          <div
            className="logo-crop-safe"
            style={{
              inset: isRect ? Math.round(SAFE_INSET / 2) : SAFE_INSET,
            }}
            aria-hidden
          />
        </div>

        <label className="field" style={{ marginTop: '1rem' }}>
          <span>Zoom</span>
          <input
            type="range"
            min={minZoom}
            max={maxZoom}
            step={0.01}
            value={zoom}
            disabled={!ready || busy}
            onChange={(e) => onZoomChange(e.target.value)}
          />
        </label>

        <div className="appearance-actions" style={{ borderTop: 'none', paddingTop: 0 }}>
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
