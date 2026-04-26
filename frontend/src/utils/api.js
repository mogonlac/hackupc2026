/**
 * Thin fetch wrapper for the backend REST API.
 * All calls fail silently (return null) so the dashboard degrades gracefully
 * when the backend is not running.
 */

const TIMEOUT_MS = 8000;

/** Empty = same origin (Vite dev / preview proxy). Set in .env when API is elsewhere. */
function apiUrl(path) {
  const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
  return base ? `${base}${path}` : path;
}

async function safeFetch(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(apiUrl(path), { ...options, signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET /api/snapshot
 * Returns { departments: [...], people: [...] } or null if unavailable.
 */
export async function fetchSnapshot() {
  return safeFetch('/api/snapshot');
}
