import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import rawData from './data/db.json';
import { computeScores } from './utils/scoring';
import { hashToNav, navToHash, navStack, navsEqual, popNav } from './utils/nav';
import { TOP_BAR_H, TAB_BAR_H, PANEL_HEADER_H, Z } from './utils/layout';
import { COLORS, FONT_STACK, TNUM } from './utils/theme';
import { fmtDateHeader, fmtRelative } from './utils/format';
import { usePersistedState } from './utils/persist';
import CompanyView from './components/CompanyView';
import DepartmentView from './components/DepartmentView';
import MemberView from './components/MemberView';
import AttentionView from './components/AttentionView';
import TabBar from './components/TabBar';
import LiveRequestsPanel from './components/LiveRequestsPanel';
import GraphingPanel from './components/GraphingPanel';
import slapHand from './assets/slap-hand.png';

export default function App() {
  /* "now" only ticks once a minute and is the SINGLE source of truth across the app
   * for staleness, age columns and the relative timestamp in the top bar. */
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(i);
  }, []);

  /* Heavy aggregation runs once per `now` tick, not per render. */
  const data = useMemo(() => computeScores(rawData.departments, { now }), [now]);

  /* URL-hash-backed nav state. */
  const [nav, setNav] = useState(() => hashToNav(window.location.hash));
  useEffect(() => {
    const next = navToHash(nav);
    if (window.location.hash !== next) {
      window.history.replaceState(null, '', next);
    }
  }, [nav]);
  useEffect(() => {
    function onPop() { setNav(hashToNav(window.location.hash)); }
    window.addEventListener('hashchange', onPop);
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('hashchange', onPop);
      window.removeEventListener('popstate', onPop);
    };
  }, []);

  /* UI preferences — persisted across refreshes. */
  const [liveRequestsOpen, setLiveRequestsOpen] = usePersistedState('live.open', false);
  const [graphingOpen, setGraphingOpen] = usePersistedState('graphing.open', false);
  const [liveContentHeight, setLiveContentHeight] = usePersistedState('live.height', 220);
  const [graphingContentHeight, setGraphingContentHeight] = usePersistedState('graphing.height', 240);

  const liveFilterRef = useRef(null);
  const goNav = useCallback((next) => {
    setNav(prev => (navsEqual(prev, next) ? prev : next));
  }, []);

  /* Keyboard: Esc pops the stack, "/" focuses the live filter. */
  useEffect(() => {
    function onKey(e) {
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (e.key === 'Escape') {
        setNav(prev => popNav(prev));
      } else if (e.key === '/') {
        e.preventDefault();
        if (!liveRequestsOpen) setLiveRequestsOpen(true);
        setTimeout(() => liveFilterRef.current?.focus?.(), 50);
      } else if (e.key === 'g') {
        setGraphingOpen(v => !v);
      } else if (e.key === 'l') {
        setLiveRequestsOpen(v => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [liveRequestsOpen, setLiveRequestsOpen, setGraphingOpen]);

  const stack = useMemo(() => navStack(nav), [nav]);
  const tabs = useMemo(() => stack.map((frame, i) => {
    let label = 'Company';
    if (frame.kind === 'attention') label = 'Attention';
    else if (frame.kind === 'dept') {
      const d = data.departments.find(d => d.id === frame.deptId);
      label = d?.name ?? 'Department';
    } else if (frame.kind === 'member') {
      const d = data.departments.find(d => d.id === frame.deptId);
      const m = d?.members.find(x => x.id === frame.memberId);
      label = m?.name ?? 'Member';
    }
    return { label, _stackIndex: i, frame };
  }), [stack, data.departments]);

  const currentDept = (nav.kind === 'dept' || nav.kind === 'member')
    ? data.departments.find(d => d.id === nav.deptId) ?? null
    : null;
  const currentMember = (nav.kind === 'member' && currentDept)
    ? currentDept.members.find(m => m.id === nav.memberId) ?? null
    : null;

  const liveBlockH = PANEL_HEADER_H + (liveRequestsOpen ? liveContentHeight : 0);
  const graphingBottomPx = TAB_BAR_H + liveBlockH;
  const mainPadBottom = 20 + TAB_BAR_H + liveBlockH + (graphingOpen ? PANEL_HEADER_H + graphingContentHeight : 0);

  const { liveRequests, liveTitle, graphingView } = useMemo(
    () => buildView({ nav, data, currentDept, currentMember }),
    [nav, data, currentDept, currentMember],
  );

  const openRequestFromLive = useCallback((r) => {
    if (!r?._deptId || !r?._memberId || !r.id) return;
    goNav({ kind: 'member', deptId: r._deptId, memberId: r._memberId, requestId: r.id });
  }, [goNav]);

  const onSelectMemberRequest = useCallback((id) => {
    if (!currentMember || !currentDept) return;
    goNav(
      id
        ? { kind: 'member', deptId: currentDept.id, memberId: currentMember.id, requestId: id }
        : { kind: 'member', deptId: currentDept.id, memberId: currentMember.id },
    );
  }, [goNav, currentMember, currentDept]);

  const isOrgView = nav.kind !== 'attention';

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, fontFamily: FONT_STACK, ...TNUM }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', height: TOP_BAR_H,
        background: COLORS.topBar, color: COLORS.topBarText,
        position: 'sticky', top: 0, zIndex: Z.topBar,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <img
            src={slapHand}
            alt="SLAP"
            width={36}
            height={36}
            style={{ display: 'block', width: 36, height: 36, imageRendering: 'pixelated' }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => goNav({ kind: 'company' })}
              style={topNavBtn(isOrgView)}
            >
              Dashboard
            </button>
            <button
              type="button"
              onClick={() => goNav({ kind: 'attention' })}
              style={topNavBtn(nav.kind === 'attention')}
            >
              Attention
            </button>
          </div>
        </div>
        <span
          title={`Updated ${fmtDateHeader(now)}`}
          style={{ fontSize: 11, color: COLORS.topBarMuted, fontVariantNumeric: 'tabular-nums' }}
        >
          {fmtDateHeader(now)} · live {fmtRelative(now, now)}
        </span>
      </div>

      <div style={{ paddingBottom: mainPadBottom }}>
        {nav.kind === 'attention' && (
          <AttentionView
            data={data}
            onPersonClick={(d, m) => goNav({ kind: 'member', deptId: d.id, memberId: m.id })}
            onRequestClick={(d, m, requestId) => goNav(
              requestId
                ? { kind: 'member', deptId: d.id, memberId: m.id, requestId }
                : { kind: 'member', deptId: d.id, memberId: m.id },
            )}
            onDeptClick={(d) => goNav({ kind: 'dept', deptId: d.id })}
          />
        )}
        {nav.kind === 'company' && (
          <CompanyView data={data} onDeptClick={(d) => goNav({ kind: 'dept', deptId: d.id })} />
        )}
        {nav.kind === 'dept' && currentDept && (
          <DepartmentView
            dept={currentDept}
            onMemberClick={(m) => goNav({ kind: 'member', deptId: currentDept.id, memberId: m.id })}
          />
        )}
        {nav.kind === 'member' && currentMember && currentDept && (
          <MemberView
            member={currentMember}
            dept={currentDept}
            now={now}
            selectedRequestId={nav.requestId}
            onSelectRequest={onSelectMemberRequest}
          />
        )}
      </div>

      {isOrgView && (
        <>
          <GraphingPanel
            view={graphingView}
            open={graphingOpen}
            onOpenChange={setGraphingOpen}
            contentHeight={graphingContentHeight}
            onContentHeightChange={setGraphingContentHeight}
            bottomPx={graphingBottomPx}
          />
          <LiveRequestsPanel
            requests={liveRequests}
            title={liveTitle}
            open={liveRequestsOpen}
            onOpenChange={setLiveRequestsOpen}
            contentHeight={liveContentHeight}
            onContentHeightChange={setLiveContentHeight}
            now={now}
            filterInputRef={liveFilterRef}
            onOpenRequest={openRequestFromLive}
          />
        </>
      )}

      <TabBar
        tabs={tabs}
        onTabClick={(tab) => goNav(tab.frame)}
        timeframe={`Snapshot · ${fmtDateHeader(now)}`}
        timeframeTitle="Click any tab to jump to that level. Esc pops up one level. Press / to filter live requests."
      />
    </div>
  );
}

function topNavBtn(active) {
  return {
    fontSize: 12,
    fontWeight: active ? 800 : 500,
    color: active ? '#fff' : '#888',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 6px',
  };
}

/**
 * Compute the per-view payload for LiveRequestsPanel + GraphingPanel.
 * Kept separate from the App component to keep the JSX legible.
 */
function buildView({ nav, data, currentDept, currentMember }) {
  if (nav.kind === 'company') {
    const surface = data.visibleDepartments.slice().sort((a, b) => b.deptScore - a.deptScore);
    const allPeople = surface.flatMap(d => d.members);
    const allRequests = surface.flatMap(dept =>
      dept.members.flatMap(m =>
        (m.requests || []).map(r => ({
          ...r,
          _memberName: m.name,
          _deptName: dept.name,
          _deptId: dept.id,
          _memberId: m.id,
        })),
      ),
    );
    return {
      liveRequests: allRequests,
      liveTitle: 'ALL',
      graphingView: {
        workloadBars: surface.map(d => ({
          label: d.name.length > 10 ? d.name.split(' ')[0] : d.name,
          fullLabel: d.name,
          valuePending: d.pendingTotal,
          valueResolved: d.members.reduce((s, m) => s + m.resolvedCount, 0),
        })),
        workloadStacked: true,
        workloadCaption: 'Departments ranked by workload — open requests vs completed',
        workShare: workShareResolvedByMembers(allPeople, 12),
        workShareTitle: 'Who completed the most work',
      },
    };
  }
  if (nav.kind === 'dept' && currentDept) {
    const allRequests = currentDept.members.flatMap(m =>
      (m.requests || []).map(r => ({
        ...r,
        _memberName: m.name,
        _deptName: currentDept.name,
        _deptId: currentDept.id,
        _memberId: m.id,
      })),
    );
    const sortedM = [...currentDept.members].sort((a, b) => b.burdenScore - a.burdenScore);
    return {
      liveRequests: allRequests,
      liveTitle: currentDept.name.toUpperCase(),
      graphingView: {
        workloadBars: sortedM.map(m => ({
          label: m.name.length > 10 ? m.name.split(' ').map(n => n[0]).join('') : m.name,
          fullLabel: m.name,
          valuePending: m.pendingCount,
          valueResolved: m.resolvedCount,
        })),
        workloadStacked: true,
        workloadCaption: `${currentDept.name} — people ranked by workload; open requests vs completed`,
        workShare: workShareResolvedByMembers(currentDept.members, 12),
        workShareTitle: 'Who completed the most work',
      },
    };
  }
  if (nav.kind === 'member' && currentMember && currentDept) {
    const reqs = currentMember.requests || [];
    const pend = currentMember.pendingCount || 0;
    const res = currentMember.resolvedCount || 0;
    return {
      liveRequests: reqs.map(r => ({
        ...r,
        _memberName: currentMember.name,
        _deptName: currentDept.name,
        _deptId: currentDept.id,
        _memberId: currentMember.id,
      })),
      liveTitle: currentMember.name.toUpperCase(),
      graphingView: {
        workloadBars: [
          { label: 'Open', value: pend, color: '#c2410c', fullLabel: 'Open' },
          { label: 'Done', value: res, color: '#10b981', fullLabel: 'Done' },
        ],
        workloadStacked: false,
        workloadCaption: `${currentMember.name} — open requests vs completed`,
        workShare: [
          { label: 'Done', fullLabel: 'Resolved', value: res },
          { label: 'Open', fullLabel: 'Pending', value: pend },
        ],
        workShareTitle: 'Completed vs still open',
      },
    };
  }
  return {
    liveRequests: [],
    liveTitle: '',
    graphingView: {
      workloadBars: [],
      workloadStacked: false,
      workloadCaption: '',
      workShare: [],
      workShareTitle: '',
    },
  };
}

function shortWorkerLabel(name) {
  if (!name) return '—';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0]} ${parts[parts.length - 1][0]}.`;
  return name.length > 14 ? `${name.slice(0, 13)}…` : name;
}

function workShareResolvedByMembers(members, maxSlices) {
  const raw = (members || [])
    .map(m => ({
      label: shortWorkerLabel(m.name),
      fullLabel: m.name,
      value: m.resolvedCount || 0,
    }))
    .filter(x => x.value > 0)
    .sort((a, b) => b.value - a.value);
  if (raw.length === 0) return [];
  if (raw.length <= maxSlices) return raw;
  const head = raw.slice(0, maxSlices - 1);
  const tail = raw.slice(maxSlices - 1);
  const otherVal = tail.reduce((s, x) => s + x.value, 0);
  return otherVal > 0
    ? [...head, { label: 'Other', fullLabel: `${tail.length} people`, value: otherVal }]
    : head;
}
