import { useRef, useMemo, useState } from 'react';
import { navToHash } from '../utils/nav';
import { isRequestOpen } from '../utils/requestModel';
import { SCORE_COLORS } from '../utils/scoring';
import { fmtTimestamp } from '../utils/format';
import { TAB_BAR_H, PANEL_HEADER_H, clampPanelH, Z } from '../utils/layout';
import { COLORS, MONO_STACK, PANEL_HEADER_GRADIENT, TNUM } from '../utils/theme';
import { usePersistedState } from '../utils/persist';

function comparePending(a, b, sortKey, sortDir) {
  switch (sortKey) {
    case 'department': // legacy → To column
    case 'to': {
      const c = (a._to || '').localeCompare(b._to || '', 'en', { sensitivity: 'base' });
      return sortDir === 1 ? c : -c;
    }
    case 'member': // legacy → From column
    case 'from': {
      const c = (a._from || '').localeCompare(b._from || '', 'en', { sensitivity: 'base' });
      return sortDir === 1 ? c : -c;
    }
    case 'complexity':
      return (a.complexity - b.complexity) * sortDir;
    case 'timestamp': {
      const ta = new Date(a._created).getTime();
      const tb = new Date(b._created).getTime();
      return (ta - tb) * sortDir;
    }
    default:
      return 0;
  }
}

export default function LiveRequestsPanel({
  requests, title, open, onOpenChange, contentHeight, onContentHeightChange,
  now, filterInputRef, onOpenRequest,
}) {
  const [sortKey, setSortKey] = usePersistedState('live.sortKey', 'complexity');
  const [sortDir, setSortDir] = usePersistedState('live.sortDir', -1);
  const [fPendingOnly, setFPendingOnly] = usePersistedState('live.f.pending', true);
  const [fHighC, setFHighC] = usePersistedState('live.f.highC', false);
  const [fOld, setFOld] = usePersistedState('live.f.old', false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return requests
      .map(r => ({ ...r, _created: r.created_at }))
      .filter((r) => {
        if (fPendingOnly && !isRequestOpen(r)) return false;
        if (fHighC && (r.complexity || 0) < 7) return false;
        if (fOld) {
          const days = (now.getTime() - new Date(r._created).getTime()) / 86400000;
          if (days <= 7) return false;
        }
        if (q) {
          const hay = `${r.id ?? ''} ${r.description} ${r._from ?? ''} ${r._to ?? ''} ${r._memberName ?? ''} ${r._deptName ?? ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
  }, [requests, fPendingOnly, fHighC, fOld, query, now]);

  const pending = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => comparePending(a, b, sortKey, sortDir));
    return list;
  }, [filtered, sortKey, sortDir]);

  function isSameSortCol(key, current) {
    if (key === current) return true;
    if (key === 'from' && current === 'member') return true;
    if (key === 'to' && current === 'department') return true;
    return false;
  }
  function onSortColumn(key) {
    if (isSameSortCol(key, sortKey)) setSortDir(d => -d);
    else {
      setSortKey(key);
      setSortDir(
        key === 'to' || key === 'from' || key === 'department' || key === 'member' ? 1 : -1,
      );
    }
  }

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
      position: 'fixed', bottom: `${TAB_BAR_H}px`, left: 0, right: 0,
      zIndex: Z.liveRequests,
      display: 'flex', flexDirection: 'column', width: '100%', maxWidth: '100vw',
      background: COLORS.bgChrome, boxShadow: '0 -2px 10px rgba(0,0,0,0.1)',
      borderTop: '1px solid rgba(0,0,0,0.2)', overflow: 'hidden',
      isolation: 'isolate', pointerEvents: 'auto',
    }}>
      <div
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        onPointerCancel={onHeaderPointerUp}
        style={{
          height: PANEL_HEADER_H, minHeight: PANEL_HEADER_H, flexShrink: 0,
          display: 'flex', alignItems: 'center', padding: '0 14px',
          cursor: 'ns-resize', userSelect: 'none',
          background: PANEL_HEADER_GRADIENT,
          borderBottom: open ? `1px solid ${COLORS.border}` : 'none',
        }}
      >
        <span aria-hidden style={{ width: 16, height: 4, borderTop: '1px solid #94a3b8', borderBottom: '1px solid #94a3b8', marginRight: 8 }} />
        <span style={{ transform: open ? 'rotate(0deg)' : 'rotate(180deg)', fontSize: 9 }}>▼</span>
        <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 700, color: '#222', letterSpacing: '0.04em' }}>
          All requests — {title}
        </span>
        <span style={{
          background: '#475569', color: '#fff', borderRadius: 3,
          padding: '2px 7px', fontSize: 10, fontWeight: 700, marginLeft: 8, ...TNUM,
        }}>{pending.length} shown</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: COLORS.textMuted, fontWeight: 500 }}>
          drag to resize · click to {open ? 'hide' : 'show'}
        </span>
      </div>

      {open && (
        <div style={{
          height: `${contentHeight}px`, minHeight: 0,
          overflowY: 'auto', overflowX: 'auto', background: '#fafafa',
        }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 12px', borderBottom: `1px solid ${COLORS.border}`, background: '#f3f3f3', alignItems: 'center' }}>
            <input
              ref={filterInputRef}
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Filter description, from, to, id…  (press / to focus)"
              style={{
                flex: '1 1 220px', maxWidth: 360, fontSize: 11,
                padding: '4px 8px', borderRadius: 4,
                border: '1px solid #ccc', outline: 'none', background: '#fff',
              }}
            />
            {[
              { on: fPendingOnly, set: setFPendingOnly, label: 'Pending only' },
              { on: fHighC, set: setFHighC, label: 'Complexity ≥ 7' },
              { on: fOld, set: setFOld, label: '> 7 days old' },
            ].map(f => (
              <button
                key={f.label}
                type="button"
                onClick={() => f.set(x => !x)}
                aria-pressed={f.on}
                style={{
                  fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 4,
                  border: '1px solid #ccc', cursor: 'pointer',
                  background: f.on ? COLORS.link : '#fff',
                  color: f.on ? '#fff' : '#333',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
          <table style={{
            width: '100%', borderCollapse: 'collapse', fontSize: 12,
            tableLayout: 'fixed', ...TNUM,
          }}>
            <colgroup>
              <col style={{ width: 160, minWidth: 140 }} />
              <col style={{ width: 160, minWidth: 140 }} />
              <col style={{ width: 88 }} />
              <col />
              <col style={{ width: 96, minWidth: 88 }} />
              <col style={{ width: 128 }} />
            </colgroup>
            <thead>
              <tr style={{ background: COLORS.bgChrome, position: 'sticky', top: 0, zIndex: 1 }}>
                {[
                  { id: 'from', text: 'Request from', sort: 'from' },
                  { id: 'to', text: 'Request to', sort: 'to' },
                  { id: 'id', text: 'ID', sort: null },
                  { id: 'desc', text: 'Description', sort: null },
                  { id: 'cplx', text: 'Complexity', sort: 'complexity', align: 'center' },
                  { id: 'ts', text: 'Created', sort: 'timestamp' },
                ].map(col => {
                  const sortKeyForActive = col.sort;
                  const active = sortKeyForActive
                    && (sortKey === sortKeyForActive
                      || (sortKeyForActive === 'from' && sortKey === 'member')
                      || (sortKeyForActive === 'to' && sortKey === 'department'));
                  const ariaSort = active ? (sortDir === 1 ? 'ascending' : 'descending') : (col.sort ? 'none' : undefined);
                  return (
                    <th
                      key={col.id}
                      onClick={col.sort ? () => onSortColumn(col.sort) : undefined}
                      aria-sort={ariaSort}
                      style={{
                        padding: '8px 8px', textAlign: col.align ?? 'left',
                        borderBottom: `1px solid ${COLORS.border}`,
                        fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap',
                        color: '#333', cursor: col.sort ? 'pointer' : 'default',
                        userSelect: 'none', textTransform: 'uppercase', letterSpacing: '0.04em',
                        overflow: col.id === 'cplx' ? 'visible' : 'hidden', textOverflow: 'ellipsis',
                      }}
                    >
                      {col.text}
                      {active && <span style={{ marginLeft: 4, fontSize: 9, color: COLORS.link }}>{sortDir === 1 ? '▲' : '▼'}</span>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {pending.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '16px 14px', color: COLORS.textFaint, fontStyle: 'italic', fontSize: 12 }}>
                    No requests match the filters.
                  </td>
                </tr>
              ) : pending.map((r, i) => {
                const canLink = onOpenRequest && r._deptId && r._memberId && r.id;
                const href = canLink
                  ? navToHash({ kind: 'member', deptId: r._deptId, memberId: r._memberId, requestId: r.id })
                  : undefined;
                return (
                <tr key={r.id} style={{ background: i % 2 === 0 ? COLORS.bg : '#f3f3f3' }}>
                  <td style={tdFromTo} title={r._from}>{r._from || '—'}</td>
                  <td style={tdFromTo} title={r._to}>{r._to || '—'}</td>
                  <td style={{ ...td, fontFamily: MONO_STACK, fontSize: 10, color: COLORS.textFaint, maxWidth: 88 }}>
                    {canLink
                      ? (
                          <a
                            href={href}
                            onClick={(e) => { e.preventDefault(); onOpenRequest(r); }}
                            style={{ color: COLORS.link, fontWeight: 600 }}
                          >
                            {r.id}
                          </a>
                        )
                      : (r.id || '—')}
                  </td>
                  <td style={{ ...td, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                    {canLink
                      ? (
                          <a
                            href={href}
                            onClick={(e) => { e.preventDefault(); onOpenRequest(r); }}
                            style={{ color: COLORS.link, fontWeight: 600, cursor: 'pointer' }}
                          >
                            {r.description}
                          </a>
                        )
                      : (r.description)}
                  </td>
                  <td style={{ ...td, textAlign: 'center', fontFamily: MONO_STACK, minWidth: 88 }}>
                    <span style={{
                      fontWeight: 700,
                      color: r.complexity >= 8 ? SCORE_COLORS[5] : r.complexity >= 5 ? SCORE_COLORS[3] : SCORE_COLORS[1],
                    }}>{r.complexity}</span>
                  </td>
                  <td style={{ ...td, color: COLORS.textMuted, fontFamily: MONO_STACK }}>{fmtTimestamp(r._created)}</td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const td = {
  padding: '7px 10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  borderBottom: `1px solid ${COLORS.borderSoft}`,
};

const tdFromTo = {
  ...td,
  whiteSpace: 'normal',
  lineHeight: 1.35,
  wordBreak: 'break-word',
  verticalAlign: 'top',
};
