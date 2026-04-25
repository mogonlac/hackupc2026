import { useEffect, useRef } from 'react';
import ScoreBox from './ScoreBox';
import StatStrip from './StatStrip';
import { SCORE_COLORS, SCORE_BADGE_TEXT } from '../utils/scoring';
import { navToHash } from '../utils/nav';
import { fmtResolveSpeed, fmtTimestampLong, fmtDuration, durationBetween, initials } from '../utils/format';
import { COLORS, MONO_STACK, TABLE_BASE, TABLE_TH, TABLE_TD, TNUM } from '../utils/theme';

function complexityColor(c) {
  if (c >= 8) return SCORE_COLORS[5];
  if (c >= 5) return SCORE_COLORS[3];
  return SCORE_COLORS[1];
}

const TRAJECTORY_STYLE = { rising: '#c2410c', stable: '#64748b', falling: '#166534' };

function RequestDetail({ request, memberName, now, onClose, detailRef }) {
  if (!request) return null;
  const created = request.created_at || request.timestamp;
  const started = request.started_at;
  const finished = request.finished_at;
  const ageOpenMs = created ? (now - new Date(created).getTime()) : null;
  const activeWorkMs = started
    ? (request.status === 'pending'
        ? (now - new Date(started).getTime())
        : durationBetween(started, finished))
    : null;
  const spentMs = request.processHours != null
    ? request.processHours * 3_600_000
    : durationBetween(started, finished);

  return (
    <div
      ref={detailRef}
      id="request-detail"
      style={{
        margin: '0 0 12px', padding: '14px 16px', background: '#f8fafc',
        border: `1px solid ${COLORS.border}`, borderRadius: 6, borderLeft: `4px solid ${COLORS.link}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>
          Request <code style={{ fontSize: 12, color: '#334155' }}>{request.id}</code>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ fontSize: 11, fontWeight: 600, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Close
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px', fontSize: 12, lineHeight: 1.5 }}>
        <div><span style={{ color: COLORS.textFaint, fontWeight: 600 }}>Description</span><br />{request.description}</div>
        <div>
          <span style={{ color: COLORS.textFaint, fontWeight: 600 }}>Received by</span><br />
          {memberName} (assignee)
        </div>
        <div>
          <span style={{ color: COLORS.textFaint, fontWeight: 600 }}>From (requester id)</span><br />
          <code style={{ fontSize: 11 }}>{request.requester_id || '—'}</code>
        </div>
        <div>
          <span style={{ color: COLORS.textFaint, fontWeight: 600 }}>Direction</span><br />
          {request.direction}
        </div>
        <div>
          <span style={{ color: COLORS.textFaint, fontWeight: 600 }}>Created</span><br />
          <span style={{ fontFamily: MONO_STACK }}>{fmtTimestampLong(created)}</span>
        </div>
        <div>
          <span style={{ color: COLORS.textFaint, fontWeight: 600 }}>Status</span><br />
          <span style={{ textTransform: 'uppercase', fontWeight: 700, color: request.status === 'pending' ? '#9a3412' : '#166534' }}>{request.status}</span>
        </div>
        <div>
          <span style={{ color: COLORS.textFaint, fontWeight: 600 }}>Work began</span><br />
          {started ? 'Yes · ' : 'Not yet — '}
          {started
            ? <span style={{ fontFamily: MONO_STACK }}>{fmtTimestampLong(started)}</span>
            : <span>—</span>}
        </div>
        <div>
          <span style={{ color: COLORS.textFaint, fontWeight: 600 }}>Age (queue)</span><br />
          {fmtDuration(ageOpenMs)}
        </div>
        <div>
          <span style={{ color: COLORS.textFaint, fontWeight: 600 }}>Time in progress</span><br />
          {activeWorkMs != null && Number.isFinite(activeWorkMs) ? fmtDuration(activeWorkMs) : '—'}
        </div>
        <div>
          <span style={{ color: COLORS.textFaint, fontWeight: 600 }}>Completed / time spent (resolved)</span><br />
          {finished
            ? (
                <>
                  <span style={{ fontFamily: MONO_STACK }}>{fmtTimestampLong(finished)}</span>
                  {spentMs != null && ` · total ${fmtDuration(spentMs)}`}
                </>
              )
            : '—'}
        </div>
        <div>
          <span style={{ color: COLORS.textFaint, fontWeight: 600 }}>Complexity</span><br />
          <span style={{ fontWeight: 800, color: complexityColor(request.complexity), fontFamily: MONO_STACK }}>{request.complexity}</span>
        </div>
      </div>
    </div>
  );
}

function RequestTable({
  requests, direction, memberId, deptId, onSelectRequest, selectedId,
}) {
  const sorted = [...requests].sort((a, b) => {
    if (a.status === b.status) return b.complexity - a.complexity;
    return a.status === 'pending' ? -1 : 1;
  });
  const baseMemberNav = { kind: 'member', deptId, memberId };
  return (
    <table style={TABLE_BASE}>
      <thead>
        <tr style={{ background: COLORS.bgHeader }}>
          {['ID', 'Description', 'Complexity', 'Status', 'Created', 'Started', 'Completed', 'Time spent'].map(h => (
            <th key={h} style={{ ...TABLE_TH, width: h === 'ID' ? 100 : h === 'Description' ? undefined : h === 'Complexity' ? 80 : undefined }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.length === 0 ? (
          <tr><td colSpan={8} style={{ padding: 14, color: COLORS.textFaint }}>No {direction} requests.</td></tr>
        ) : sorted.map((r, i) => {
          const isP = r.status === 'pending';
          const created = r.created_at || r.timestamp;
          const started = r.started_at;
          const finished = r.finished_at;
          const spentMs = r.processHours != null
            ? r.processHours * 3_600_000
            : durationBetween(started, finished);
          const isSel = selectedId === r.id;
          const href = navToHash({ ...baseMemberNav, requestId: r.id });
          return (
            <tr
              key={r.id}
              style={{
                background: isSel ? '#e0f2fe' : (i % 2 ? COLORS.bgAlt : COLORS.bg),
                opacity: isP ? 1 : 0.65,
                outline: isSel ? `2px solid ${COLORS.link}` : 'none',
              }}
            >
              <td style={{ ...TABLE_TD, fontFamily: MONO_STACK, fontSize: 10, color: COLORS.textMuted }}>{r.id}</td>
              <td style={{ ...TABLE_TD, textDecoration: isP ? 'none' : 'line-through' }}>
                <a
                  href={href}
                  onClick={(e) => { e.preventDefault(); onSelectRequest(r.id); }}
                  style={{ color: COLORS.link, fontWeight: 600, cursor: 'pointer' }}
                >
                  {r.description}
                </a>
              </td>
              <td style={{ ...TABLE_TD, textAlign: 'center', fontWeight: 700, color: complexityColor(r.complexity), fontFamily: MONO_STACK }}>
                {r.complexity}
              </td>
              <td style={{ ...TABLE_TD, textTransform: 'uppercase', fontSize: 11, color: isP ? '#9a3412' : '#166534', fontWeight: 600 }}>
                {r.status}
              </td>
              <td style={{ ...TABLE_TD, color: COLORS.textMuted, fontFamily: MONO_STACK, whiteSpace: 'nowrap' }}>{fmtTimestampLong(created)}</td>
              <td style={{ ...TABLE_TD, color: COLORS.textMuted, fontFamily: MONO_STACK, whiteSpace: 'nowrap' }}>
                {started ? fmtTimestampLong(started) : '—'}
              </td>
              <td style={{ ...TABLE_TD, color: COLORS.textMuted, fontFamily: MONO_STACK, whiteSpace: 'nowrap' }}>
                {finished ? fmtTimestampLong(finished) : '—'}
              </td>
              <td style={{ ...TABLE_TD, color: COLORS.text, fontFamily: MONO_STACK, fontWeight: 600, whiteSpace: 'nowrap', textAlign: 'right' }}>
                {fmtDuration(spentMs)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function signed(n) {
  if (n == null || Number.isNaN(n)) return '—';
  const s = n.toFixed(1);
  if (n > 0) return `+${s}`;
  return s;
}

export default function MemberView({
  member, dept, now, selectedRequestId, onSelectRequest,
}) {
  const requests = member.requests || [];
  const outbound = requests.filter(r => r.direction === 'outbound');
  const inbound = requests.filter(r => r.direction === 'inbound');
  const init = initials(member.name);
  const dDept = member.burdenScore - (dept.deptScore || 0);
  const traj = member.workloadTrajectory || 'stable';
  const trajC = TRAJECTORY_STYLE[traj] || TRAJECTORY_STYLE.stable;
  const activeReq = selectedRequestId
    ? requests.find(r => r.id === selectedRequestId)
    : null;
  const detailRef = useRef(null);

  useEffect(() => {
    if (selectedRequestId && !activeReq) onSelectRequest?.(null);
  }, [selectedRequestId, activeReq, onSelectRequest]);

  useEffect(() => {
    if (activeReq) detailRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [activeReq?.id]);

  return (
    <div style={{ padding: '0 12px 24px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '14px 20px', background: COLORS.bgPanel,
        borderBottom: `1px solid ${COLORS.border}`,
      }}
      >
        <span style={{
          display: 'inline-flex', width: 44, height: 44, borderRadius: 3,
          alignItems: 'center', justifyContent: 'center',
          background: SCORE_COLORS[member.burdenScore],
          color: SCORE_BADGE_TEXT[member.burdenScore] ?? '#fff',
          fontSize: 16, fontWeight: 700, ...TNUM,
        }}>{init}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{member.name}</div>
          <div style={{ fontSize: 12, color: COLORS.textMuted }}>{member.role} · {dept.name}</div>
        </div>
        <ScoreBox value={member.burdenScore} title={member.name} />
      </div>

      <StatStrip dense stats={[
        { label: 'Open requests', value: member.pendingCount },
        { label: 'Avg complexity', value: member.pendingCount > 0 ? (member.avgComplexityPending || 0).toFixed(1) : '—' },
        { label: 'Oldest open (days)', value: member.pendingCount > 0 && member.oldestPendingDays != null ? member.oldestPendingDays.toFixed(1) : '—' },
        { label: 'Closed this week', value: member.throughput7d ?? 0, color: (member.throughput7d ?? 0) > 0 ? '#166534' : undefined },
        { label: 'Outbound pending', value: member.outboundPending ?? 0 },
        { label: 'Inbound pending', value: member.inboundPending ?? 0 },
        { label: 'Hours per item', value: fmtResolveSpeed(member.resolveSpeedHPerC) },
        { label: '2-week trend', value: <span style={{ textTransform: 'capitalize', color: trajC, fontWeight: 800 }}>{traj}</span> },
        { label: 'vs team avg', value: signed(dDept) },
      ]} />

      {activeReq && (
        <RequestDetail
          request={activeReq}
          memberName={member.name}
          now={now.getTime()}
          onClose={() => onSelectRequest?.(null)}
          detailRef={detailRef}
        />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: `1px solid ${COLORS.border}`, marginTop: 8 }}>
        <div style={{ borderRight: `1px solid ${COLORS.border}` }}>
          <div style={{ padding: '6px 10px', fontSize: 11, fontWeight: 700, background: '#f1f5f9', color: '#334155', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            ↗ Outbound — {outbound.length}
          </div>
          <div style={{ maxHeight: 360, overflow: 'auto' }}>
            <RequestTable
              requests={outbound}
              direction="outbound"
              memberId={member.id}
              deptId={dept.id}
              onSelectRequest={id => onSelectRequest?.(id)}
              selectedId={selectedRequestId}
            />
          </div>
        </div>
        <div>
          <div style={{ padding: '6px 10px', fontSize: 11, fontWeight: 700, background: '#fdf2f8', color: '#831843', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            ↘ Inbound — {inbound.length}
          </div>
          <div style={{ maxHeight: 360, overflow: 'auto' }}>
            <RequestTable
              requests={inbound}
              direction="inbound"
              memberId={member.id}
              deptId={dept.id}
              onSelectRequest={id => onSelectRequest?.(id)}
              selectedId={selectedRequestId}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
