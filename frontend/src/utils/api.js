/**
 * Thin fetch wrapper for the backend REST API.
 * All calls fail silently (return null) so the dashboard degrades gracefully
 * when the backend is not running.
 */

const TIMEOUT_MS = 5000;

async function safeFetch(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(path, { ...options, signal: controller.signal });
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
