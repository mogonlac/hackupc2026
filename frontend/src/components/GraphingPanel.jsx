import { useRef } from 'react';
import WorkSharePie from './WorkSharePie';
import { PANEL_HEADER_H, clampPanelH, Z } from '../utils/layout';
import { COLORS, PANEL_HEADER_GRADIENT, TNUM } from '../utils/theme';

const PENDING_BAR = '#D85A30';
const RESOLVED_BAR = '#10b981';

/**
 * `view` is { workloadBars, workloadStacked, workloadCaption, workShare, workShareTitle } — App.jsx assembles.
 */
export default function GraphingPanel({
  view,
  open,
  onOpenChange,
  contentHeight,
  onContentHeightChange,
  bottomPx,
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
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!drag.current) onOpenChange(!open);
  }

  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom: `${bottomPx}px`, zIndex: Z.graphing,
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
          height: PANEL_HEADER_H, minHeight: PANEL_HEADER_H, display: 'flex', alignItems: 'center', padding: '0 14px',
          cursor: 'ns-resize', userSelect: 'none',
          background: PANEL_HEADER_GRADIENT,
          borderBottom: open ? `1px solid ${COLORS.border}` : 'none',
        }}
      >
        <span aria-hidden style={{ width: 16, height: 4, borderTop: '1px solid #94a3b8', borderBottom: '1px solid #94a3b8', marginRight: 8 }} />
        <span style={{ transform: open ? 'rotate(0deg)' : 'rotate(180deg)', fontSize: 9 }}>▼</span>
        <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 700, color: '#222' }}>Workload</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: COLORS.textMuted }}>drag to resize · click to {open ? 'hide' : 'show'}</span>
      </div>
      {open && (
        <div style={{
          height: contentHeight,
          minHeight: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'row',
          background: '#fff',
          padding: '10px 12px',
          gap: 14,
        }}
        >
          <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <WorkloadPane
              bars={view.workloadBars}
              stacked={view.workloadStacked}
              caption={view.workloadCaption}
            />
          </div>
          <div
            style={{
              width: 1, alignSelf: 'stretch', minHeight: 100, background: COLORS.border, flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <WorkSharePie
              items={view.workShare || []}
              title={view.workShareTitle ?? 'Share of work (by resolved count)'}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function WorkloadPane({ bars, stacked, caption }) {
  const maxV = Math.max(1, ...bars.map(b => (stacked ? (b.valuePending + b.valueResolved) : b.value)));
  return (
    <div style={paneCol}>
      <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Open vs completed</div>
      {caption
        ? <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 4, lineHeight: 1.35 }}>{caption}</div>
        : null}
      <div style={{ flex: 1, minHeight: 0, marginTop: 6, display: 'flex', flexDirection: 'column' }}>
        {bars.length === 0 ? (
          <div style={emptyState}>No bar chart in this view.</div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'row', alignItems: 'stretch', gap: 4, justifyContent: 'space-between' }}>
            {bars.map((b, bi) => {
              const pr = stacked ? b.valuePending : 0;
              const rs = stacked ? b.valueResolved : 0;
              const total = stacked ? pr + rs : b.value;
              const frac = total / maxV;
              const labelText = stacked ? `${pr}/${total}` : `${b.value}`;
              return (
                <div
                  key={bi}
                  title={stacked ? `${b.fullLabel || b.label}: ${pr} pending, ${rs} resolved` : `${b.fullLabel || b.label}: ${b.value}`}
                  style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}
                >
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#333', marginBottom: 4, ...TNUM }}>{labelText}</div>
                  <div style={{ flex: 1, width: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
                    <div
                      style={{
                        width: '100%', maxWidth: 44, height: `${Math.max(0.12, frac) * 100}%`, maxHeight: '100%',
                        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                        borderRadius: 4, overflow: 'hidden', background: 'rgba(0,0,0,0.06)',
                      }}
                    >
                      {stacked
                        ? total > 0
                          ? (
                            <>
                              {pr > 0 && <div style={{ flex: pr, minHeight: 2, background: PENDING_BAR, width: '100%' }} />}
                              {rs > 0 && <div style={{ flex: rs, minHeight: 2, background: RESOLVED_BAR, width: '100%' }} />}
                            </>
                            )
                          : null
                        : <div style={{ height: '100%', background: b.color, width: '100%' }} />}
                    </div>
                  </div>
                  <div style={{ fontSize: 9, color: '#333', marginTop: 6, fontWeight: 600 }}>{b.label}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {stacked && bars.length > 0
        ? (
            <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 10, justifyContent: 'center', color: COLORS.textMuted }}>
              <span><span style={swatch(PENDING_BAR)} />pending</span>
              <span><span style={swatch(RESOLVED_BAR)} />resolved</span>
            </div>
          )
        : null}
    </div>
  );
}

const paneCol = { flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' };
const emptyState = { fontSize: 12, color: COLORS.textFaint, textAlign: 'center', padding: 18 };
function swatch(color) {
  return { display: 'inline-block', width: 9, height: 9, background: color, marginRight: 5, verticalAlign: 'middle' };
}
