export const TAB_BAR_H = 32;
export const PANEL_HEADER_H = 30;
export const PANEL_MIN_H = 120;
export const PANEL_MAX_H = 480;
export const TOP_BAR_H = 40;

export const Z = {
  topBar: 200,
  liveRequests: 100,
  recommendations: 101,
  graphing: 102,
  tabBar: 100,
};

export function clampPanelH(h) {
  return Math.max(PANEL_MIN_H, Math.min(PANEL_MAX_H, Math.round(h)));
}
