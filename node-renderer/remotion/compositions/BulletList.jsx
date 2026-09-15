import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { backgroundStyle, resolveColors } from '../theme.js';

export const BulletList = ({ heading = '', items = [], theme }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const colors = resolveColors(theme);
  const list = (Array.isArray(items) && items.length ? items : ['']).slice(0, 6);

  const headOpacity = interpolate(frame, [0, 16], [0, 1], { extrapolateRight: 'clamp' });
  const headY = interpolate(spring({ frame, fps, config: { damping: 200 } }), [0, 1], [-30, 0]);

  const start = heading ? 20 : 8;
  const per = Math.max(6, Math.floor((durationInFrames - start - 12) / Math.max(1, list.length)));

  return (
    <AbsoluteFill style={{ ...backgroundStyle(theme), justifyContent: 'center', padding: '0 9%' }}>
      {heading ? (
        <div style={{
          opacity: headOpacity, transform: `translateY(${headY}px)`,
          fontSize: 66, fontWeight: 900, marginBottom: 56, color: colors.fg,
        }}>{heading}</div>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 34 }}>
        {list.map((item, i) => {
          const appear = start + i * per;
          const s = spring({ frame: frame - appear, fps, config: { damping: 200 } });
          const x = interpolate(s, [0, 1], [-60, 0]);
          const opacity = interpolate(frame - appear, [0, 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const dot = interpolate(s, [0, 1], [0, 1]);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 28, transform: `translateX(${x}px)`, opacity }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: colors.accent, transform: `scale(${dot})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#0a0a0a', fontWeight: 900, fontSize: 26,
              }}>{i + 1}</div>
              <div style={{ fontSize: 50, fontWeight: 600, lineHeight: 1.2 }}>{item}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
