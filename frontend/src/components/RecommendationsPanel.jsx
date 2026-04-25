import { useRef } from 'react';
import { PANEL_HEADER_H, clampPanelH, Z } from '../utils/layout';
import { COLORS, PANEL_HEADER_GRADIENT, TNUM } from '../utils/theme';
/**
 * Sits between “All requests” and “Workload” — one plain-English read per view + optional nav.
 * Future: you can add a one-line line from the backend above this; keep this block grounded in the same data.
 */
export default function RecommendationsPanel({
  title,
  items,
  open,
  onOpenChange,
  contentHeight,
  onContentHeightChange,
  bottomPx,
  onNavigate,
}) {
  const drag = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

  function onHeaderPointerDown(e) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    startY.current = e.clientY;
    startH.current = contentHeight;
    drag.current = false;
  }
  function onHeaderPointerMove(e) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const dy = startY.current - e.clientY;
    if (Math.abs(dy) > 3) {
      drag.current = true;
      onContentHeightChange(clampPanelH(startH.current + dy));
    }
  }
  function onHeaderPointerUp(e) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (!drag.current) onOpenChange(!open);
  }

  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom: `${bottomPx}px`, zIndex: Z.recommendations,
      display: 'flex', flexDirection: 'column', width: '100%',
      background: COLORS.bgChrome, boxShadow: '0 -2px 10px rgba(0,0,0,0.1)', borderTop: '1px solid rgba(0,0,0,0.2)',
    }}
    >
      <div
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        onPointerCancel={onHeaderPointerUp}
        style={{
          height: PANEL_HEADER_H, minHeight: PANEL_HEADER_H, flexShrink: 0,
          display: 'flex', alignItems: 'center', padding: '0 14px',
          cursor: 'ns-resize', userSelect: 'none', background: PANEL_HEADER_GRADIENT,
          borderBottom: open ? `1px solid ${COLORS.border}` : 'none',
        }}
      >
        <span aria-hidden style={{ width: 16, height: 4, borderTop: '1px solid #94a3b8', borderBottom: '1px solid #94a3b8', marginRight: 8 }} />
        <span style={{ transform: open ? 'rotate(0deg)' : 'rotate(180deg)', fontSize: 9 }}>▼</span>
        <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 700, color: '#222', letterSpacing: '0.04em' }}>
          All recommendations — {title}
        </span>
        <span style={{
          background: '#6366f1', color: '#fff', borderRadius: 3,
          padding: '2px 7px', fontSize: 10, fontWeight: 700, marginLeft: 8, ...TNUM,
        }}>{items.length} {items.length === 1 ? 'read' : 'reads'}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: COLORS.textMuted, fontWeight: 500 }}>
          drag to resize · click to {open ? 'hide' : 'show'}
        </span>
      </div>

      {open && (
        <div style={{
          height: `${contentHeight}px`, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', background: '#f8fafc',
        }}
        >
          <ul style={{ margin: 0, padding: '10px 14px', listStyle: 'none' }}>
            {items.length === 0 ? (
              <li style={{ color: COLORS.textFaint, fontSize: 12, fontStyle: 'italic' }}>No recommendations for this view.</li>
            ) : items.map((it) => {
              const clickable = it.nav && onNavigate;
              return (
                <li
                  key={it.id}
                  style={{ marginBottom: 12, paddingBottom: 10, borderBottom: `1px solid ${COLORS.borderSoft}` }}
                >
                  <div
                    role={clickable ? 'button' : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    onClick={() => clickable && onNavigate(it.nav)}
                    onKeyDown={clickable && ((e) => e.key === 'Enter' && onNavigate(it.nav))}
                    style={{
                      fontSize: 12, lineHeight: 1.45, color: '#0f172a', fontWeight: 600,
                      cursor: clickable ? 'pointer' : 'default',
                    }}
                  >
                    {it.text}
                  </div>
                  {it.hint
                    ? <div style={{ fontSize: 10, color: '#64748b', marginTop: 4, lineHeight: 1.35 }}>{it.hint}</div>
                    : null}
                </li>
              );
            })}
          </ul>
          <div style={{ padding: '0 14px 12px', fontSize: 10, color: '#94a3b8', lineHeight: 1.35 }}>
            One plain story per view, using the same live data as the rest of the app. The line under each item says
            what went into the 0-100 read. A short <strong>AI summary</strong> from your backend can sit above this if you want.
          </div>
        </div>
      )}
    </div>
  );
}
