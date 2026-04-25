import { TAB_BAR_H, Z } from '../utils/layout';
import { COLORS } from '../utils/theme';

export default function TabBar({ tabs, onTabClick, timeframe, timeframeTitle }) {
  return (
    <div
      role="tablist"
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        minHeight: TAB_BAR_H, background: COLORS.bgChrome,
        borderTop: '1px solid rgba(0,0,0,0.18)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        zIndex: Z.tabBar, userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
        {tabs.map((tab, i) => {
          const isActive = i === tabs.length - 1;
          return (
            <button
              key={i}
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabClick(tab)}
              style={{
                height: isActive ? 30 : 26,
                padding: '0 16px',
                border: '1px solid rgba(0,0,0,0.18)',
                borderBottom: isActive ? '1px solid #fff' : '1px solid rgba(0,0,0,0.18)',
                borderTop: isActive ? `3px solid ${COLORS.link}` : '1px solid rgba(0,0,0,0.18)',
                background: isActive ? '#fff' : '#d0d0d0',
                fontWeight: isActive ? 700 : 400,
                fontSize: 12,
                fontFamily: 'inherit',
                color: isActive ? '#111' : '#555',
                cursor: isActive ? 'default' : 'pointer',
                marginRight: 2,
                alignSelf: 'flex-end',
                outline: 'none',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {timeframe && (
        <div
          title={timeframeTitle || timeframe}
          style={{
            fontSize: 9, color: '#555', lineHeight: 1.25,
            padding: '0 8px 4px 0', textAlign: 'right',
            maxWidth: '48%', alignSelf: 'center', letterSpacing: '0.01em',
          }}
        >
          {timeframe}
        </div>
      )}
    </div>
  );
}
