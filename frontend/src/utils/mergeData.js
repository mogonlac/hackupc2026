/**
 * Merges a live backend snapshot into the static frontend baseline (db.json).
 *
 * Rules:
 *  - Static db.json is the illustration layer (hundreds of fake people).
 *  - Backend snapshot is the real layer (Nicholas, Phoebe, Marina, Victor).
 *  - Real members are prepended to the matching department so they appear first.
 *  - Department matching is by normalized name (case-insensitive).
 *  - If the backend has a department with no static match, it is added at the top.
 *  - Members with id "unassigned" are skipped — they're internal routing artefacts.
 *  - The same person may appear in several backend departments (e.g. CEO row in
 *    Product and self-work in Engineering). They are shown once (first dept in
 *    snapshot order) but requests from every appearance are merged onto that row.
 *  - If a backend member id already exists in static db.json, live requests are
 *    merged into that row instead of skipping.
 *  - Never mutates either input.
 */

/** Append source requests onto target, deduped by request id (incoming first). */
function mergeRequestsInto(targetMember, sourceMember) {
  const have = new Set((targetMember.requests || []).map(r => r.id).filter(Boolean));
  const incoming = (sourceMember.requests || []).filter(r => r.id && !have.has(r.id));
  if (incoming.length === 0) return;
  targetMember.requests = [...incoming, ...(targetMember.requests || [])];
}

function normKey(s) {
  return (s || '').toLowerCase().trim();
}

/**
 * Attempt to turn run-together lowercase Slack display names into something
 * readable. "nicholastchakov" → "Nicholastchakov" (best we can do without a
 * lookup table). Proper names like "Phoebe Iglesias Cividanes" are left as-is.
 */
function displayName(raw) {
  if (!raw) return raw;
  const trimmed = raw.trim();
  if (trimmed.includes(' ')) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function mergeSnapshot(staticData, backendSnapshot) {
  if (!backendSnapshot || !Array.isArray(backendSnapshot.departments)) {
    return staticData;
  }

  const base = JSON.parse(JSON.stringify(staticData));

  // Index static departments by normalized name for O(1) lookup
  const deptByName = new Map();
  for (const d of base.departments) {
    deptByName.set(normKey(d.name), d);
  }

  // First time we see a backend member id → the object we put on the tree.
  // Later appearances (other depts) only merge more requests into that object.
  const injectedIds = new Set();
  const injectedRef = new Map();

  // Process backend departments in order
  const newDepts = [];
  for (const backendDept of backendSnapshot.departments) {
    const key = normKey(backendDept.name);
    let targetDept = deptByName.get(key);

    if (!targetDept) {
      targetDept = {
        id: backendDept.id,
        name: backendDept.name,
        members: [],
      };
      newDepts.push(targetDept);
      deptByName.set(key, targetDept);
    }

    const existingIds = new Set(targetDept.members.map(m => m.id));

    const realMembers = [];
    for (const m of backendDept.members) {
      if (m.id === 'unassigned') continue;

      if (injectedIds.has(m.id)) {
        const row = injectedRef.get(m.id);
        if (row) mergeRequestsInto(row, m);
        continue;
      }

      const staticRow = existingIds.has(m.id)
        ? targetDept.members.find(x => x.id === m.id)
        : null;
      if (staticRow) {
        mergeRequestsInto(staticRow, m);
        staticRow.name = displayName(m.name) || staticRow.name;
        if (m.role != null && m.role !== '') staticRow.role = m.role;
        staticRow._real = true;
        injectedIds.add(m.id);
        injectedRef.set(m.id, staticRow);
        continue;
      }

      injectedIds.add(m.id);
      const merged = {
        ...m,
        name: displayName(m.name),
        _real: true,
      };
      injectedRef.set(m.id, merged);
      realMembers.push(merged);
    }

    // Prepend so real people appear at the top of each department
    targetDept.members = [...realMembers, ...targetDept.members];
  }

  // New departments (no static match) go at the very front
  base.departments = [...newDepts, ...base.departments];

  return base;
}
