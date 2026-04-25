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
 *  - A member who appears in multiple backend departments (e.g. Phoebe in both
 *    operations and sales) is only injected once — first occurrence wins.
 *  - Never mutates either input.
 */

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

  // Track injected member IDs globally to avoid duplicating people
  // who appear in more than one backend department
  const injectedIds = new Set();

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
      if (injectedIds.has(m.id)) continue;
      if (existingIds.has(m.id)) continue;

      injectedIds.add(m.id);
      realMembers.push({
        ...m,
        name: displayName(m.name),
        _real: true,
      });
    }

    // Prepend so real people appear at the top of each department
    targetDept.members = [...realMembers, ...targetDept.members];
  }

  // New departments (no static match) go at the very front
  base.departments = [...newDepts, ...base.departments];

  return base;
}
