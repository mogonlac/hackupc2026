import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import staticDb from './data/db.json';
import { computeScores } from './utils/scoring';
import { fetchSnapshot } from './utils/api';
import { mergeSnapshot } from './utils/mergeData';
import { hashToNav, navToHash, navStack, navsEqual, popNav } from './utils/nav';
import { TOP_BAR_H, TAB_BAR_H, PANEL_HEADER_H, Z } from './utils/layout';
import { COLORS, FONT_STACK, TNUM } from './utils/theme';
import { fmtDateHeader, fmtRelative } from './utils/format';
import { usePersistedState } from './utils/persist';
import CompanyView from './components/CompanyView';
import DepartmentView from './components/DepartmentView';
import MemberView from './components/MemberView';
import TabBar from './components/TabBar';
import LiveRequestsPanel from './components/LiveRequestsPanel';
import slapHand from './assets/slap-hand.png';

export default function App() {
  /* "now" only ticks once a minute and is the SINGLE source of truth across the app
   * for staleness, age columns and the relative timestamp in the top bar. */
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(i);
  }, []);

  /* Start with the static illustration data immediately; merge real people from
   * the backend in the background. If the backend is unreachable, nothing breaks. */
  const [rawData, setRawData] = useState(staticDb);
  const [syncState, setSyncState] = useState(null); // { ok: bool, at: Date }

  const refreshData = useCallback(() => {
    fetchSnapshot().then(snap => {
      if (snap) {
        setRawData(mergeSnapshot(staticDb, snap));
        setSyncState({ ok: true, at: new Date() });
      } else {
        setSyncState(prev => ({ ok: false, at: prev?.at ?? null }));
      }
    });
  }, []);

  useEffect(() => {
    refreshData();
    const i = setInterval(refreshData, 10_000);
    return () => clearInterval(i);
  }, [refreshData]);

  /* Heavy aggregation runs once per `now` tick or when rawData changes. */
  const data = useMemo(() => computeScores(rawData.departments, { now }), [now, rawData]);

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
  const [liveContentHeight, setLiveContentHeight] = usePersistedState('live.height', 220);

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
      } else if (e.key === 'l') {
        setLiveRequestsOpen(v => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [liveRequestsOpen, setLiveRequestsOpen]);

  const stack = useMemo(() => navStack(nav), [nav]);
  const tabs = useMemo(() => stack.map((frame, i) => {
    let label = 'Company';
    if (frame.kind === 'dept') {
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
  const mainPadBottom = 20 + TAB_BAR_H + liveBlockH;

  const { liveRequests, liveTitle } = useMemo(
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

  const isOrgView = true;

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
            onClick={refreshData}
            title="Refresh live data"
            style={{ display: 'block', width: 36, height: 36, imageRendering: 'pixelated', cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => goNav({ kind: 'company' })}
              style={topNavBtn(nav.kind === 'company' || nav.kind === 'dept' || nav.kind === 'member')}
            >
              Dashboard
            </button>
          </div>
        </div>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: COLORS.topBarMuted, fontVariantNumeric: 'tabular-nums' }}>
            {fmtDateHeader(now)}
          </span>
          {syncState === null ? (
            <span style={{ fontSize: 10, color: COLORS.topBarMuted }}>connecting…</span>
          ) : syncState.ok ? (
            <span
              title={`Last synced ${syncState.at.toLocaleTimeString()}`}
              style={{ fontSize: 10, color: '#4ade80', fontWeight: 700 }}
            >
              ● synced {fmtRelative(syncState.at, now)}
            </span>
          ) : (
            <span
              title={syncState.at ? `Last synced ${syncState.at.toLocaleTimeString()}` : 'Never synced'}
              style={{ fontSize: 10, color: '#f87171', fontWeight: 700 }}
            >
              ● backend offline
            </span>
          )}
        </span>
      </div>

      <div style={{ paddingBottom: mainPadBottom }}>
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

/** Map member id → { name, dept } for resolving requester/assignee parties. */
function buildMemberById(data) {
  const map = new Map();
  for (const d of data?.departments || []) {
    for (const m of d.members || []) {
      map.set(m.id, { name: m.name, dept: d.name });
    }
  }
  return map;
}

/** All members, stable order — used to map legacy `req_*` ids to a real name + department. */
function allMembersSorted(memberById) {
  return [...memberById.entries()]
    .map(([id, { name, dept }]) => ({ id, name, dept }))
    .sort((a, b) => a.id.localeCompare(b.id, 'en'));
}

function requesterPartyLine(r, memberById) {
  if (r.requester_name) return r.requester_name;
  const id = r.requester_id;
  if (id == null || id === '' || id === 'org') return 'Organization';
  const p = memberById.get(id);
  if (p) return `${p.name} · ${p.dept}`;

  // Demo/legacy data often uses `req_123` instead of a real member id — pick a
  // deterministic org member so the UI always shows "Person · Department".
  const pool = allMembersSorted(memberById);
  if (pool.length === 0) return 'Organization';
  const reqNum = String(id).match(/req_(\d+)/i);
  let idx = reqNum
    ? parseInt(reqNum[1], 10) % pool.length
    : [...String(id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0) % pool.length;
  const assigneeId = r.assignee_id;
  for (let k = 0; k < pool.length; k++) {
    const m = pool[(idx + k) % pool.length];
    if (m.id !== assigneeId) return `${m.name} · ${m.dept}`;
  }
  return `${pool[idx].name} · ${pool[idx].dept}`;
}

function enrichLiveRequest(r, memberById) {
  const assignee = `${r._memberName} · ${r._deptName}`;
  const fromReq = requesterPartyLine(r, memberById);
  const inbound = r.direction === 'inbound';
  return {
    ...r,
    _from: inbound ? fromReq : assignee,
    _to: inbound ? assignee : fromReq,
  };
}

/**
 * Compute the per-view payload for LiveRequestsPanel + GraphingPanel.
 * Kept separate from the App component to keep the JSX legible.
 */
function buildView({ nav, data, currentDept, currentMember }) {
  const memberById = buildMemberById(data);

  if (nav.kind === 'company') {
    const surface = data.visibleDepartments.slice().sort((a, b) => b.deptScore - a.deptScore);
    const allPeople = surface.flatMap(d => d.members);
    const allRequests = surface.flatMap(dept =>
      dept.members.flatMap(m =>
        (m.requests || []).map(r =>
          enrichLiveRequest({
            ...r,
            _memberName: m.name,
            _deptName: dept.name,
            _deptId: dept.id,
            _memberId: m.id,
          }, memberById),
        ),
      ),
    );
    return { liveRequests: allRequests, liveTitle: 'ALL' };
  }
  if (nav.kind === 'dept' && currentDept) {
    const allRequests = currentDept.members.flatMap(m =>
      (m.requests || []).map(r =>
        enrichLiveRequest({
          ...r,
          _memberName: m.name,
          _deptName: currentDept.name,
          _deptId: currentDept.id,
          _memberId: m.id,
        }, memberById),
      ),
    );
    return { liveRequests: allRequests, liveTitle: currentDept.name.toUpperCase() };
  }
  if (nav.kind === 'member' && currentMember && currentDept) {
    const reqs = currentMember.requests || [];
    return {
      liveRequests: reqs.map(r =>
        enrichLiveRequest({
          ...r,
          _memberName: currentMember.name,
          _deptName: currentDept.name,
          _deptId: currentDept.id,
          _memberId: currentMember.id,
        }, memberById),
      ),
      liveTitle: currentMember.name.toUpperCase(),
    };
  }
  return { liveRequests: [], liveTitle: '' };
}

function shortWorkerLabel(name) {
  if (!name) return '—';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0]} ${parts[parts.length - 1][0]}.`;
  return name.length > 14 ? `${name.slice(0, 13)}…` : name;
}

/** One row per employee (incl. 0 completed); pie uses only non-zero slices. */
function workShareByMembers(members) {
  return (members || [])
    .map(m => ({
      label: shortWorkerLabel(m.name),
      fullLabel: m.name,
      value: m.resolvedCount || 0,
    }))
    .sort((a, b) => b.value - a.value);
}
