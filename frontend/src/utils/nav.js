/**
 * Navigation state lives as a discriminated union, serialised in the URL hash
 * so deep links work and refresh preserves the view.
 *
 *   { kind: 'attention' }
 *   { kind: 'company' }
 *   { kind: 'dept', deptId }
 *   { kind: 'member', deptId, memberId, requestId? }
 *
 * Hash shapes:
 *   #/                              -> company
 *   #/attention                     -> attention
 *   #/dept/<deptId>                 -> dept
 *   #/dept/<deptId>/<memberId>      -> member
 *   #/dept/<deptId>/<memberId>/r/<requestId> -> member + open request detail
 */

export function navsEqual(a, b) {
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'dept') return a.deptId === b.deptId;
  if (a.kind === 'member') {
    return a.deptId === b.deptId
      && a.memberId === b.memberId
      && (a.requestId ?? null) === (b.requestId ?? null);
  }
  return true;
}

export function navToHash(nav) {
  if (!nav) return '#/';
  switch (nav.kind) {
    case 'attention': return '#/';
    case 'company':   return '#/';
    case 'dept':      return `#/dept/${encodeURIComponent(nav.deptId)}`;
    case 'member': {
      const base = `#/dept/${encodeURIComponent(nav.deptId)}/${encodeURIComponent(nav.memberId)}`;
      if (nav.requestId) return `${base}/r/${encodeURIComponent(nav.requestId)}`;
      return base;
    }
    default:          return '#/';
  }
}

export function hashToNav(hash) {
  const h = (hash || '').replace(/^#\/?/, '');
  if (!h) return { kind: 'company' };
  const parts = h.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'attention') return { kind: 'company' };
  if (parts[0] === 'dept' && parts[1] && parts[2]) {
    if (parts[3] === 'r' && parts[4]) {
      return { kind: 'member', deptId: parts[1], memberId: parts[2], requestId: parts[4] };
    }
    return { kind: 'member', deptId: parts[1], memberId: parts[2] };
  }
  if (parts[0] === 'dept' && parts[1]) {
    return { kind: 'dept', deptId: parts[1] };
  }
  return { kind: 'company' };
}

/** Stack reconstruction from a single nav state — used to drive the bottom tab bar. */
export function navStack(nav) {
  if (!nav) return [{ kind: 'company' }];
  if (nav.kind === 'attention') return [{ kind: 'company' }];
  if (nav.kind === 'company')   return [{ kind: 'company' }];
  if (nav.kind === 'dept')      return [{ kind: 'company' }, nav];
  if (nav.kind === 'member') {
    return [
      { kind: 'company' },
      { kind: 'dept', deptId: nav.deptId },
      { ...nav, requestId: undefined },
    ];
  }
  return [{ kind: 'company' }];
}

export function popNav(nav) {
  if (!nav) return { kind: 'company' };
  if (nav.kind === 'member' && nav.requestId) {
    return { kind: 'member', deptId: nav.deptId, memberId: nav.memberId };
  }
  if (nav.kind === 'member') return { kind: 'dept', deptId: nav.deptId };
  if (nav.kind === 'dept')   return { kind: 'company' };
  return { kind: 'company' };
}
