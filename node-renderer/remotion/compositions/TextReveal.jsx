import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { backgroundStyle, resolveColors } from '../theme.js';

export const TextReveal = ({ lines = [], revealBy = 'line', align = 'center', theme }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const colors = resolveColors(theme);
  const safeLines = (Array.isArray(lines) && lines.length ? lines : ['']).slice(0, 8);

  const tokens = revealBy === 'word'
    ? safeLines.flatMap((l, li) => l.split(/\s+/).filter(Boolean).map((w) => ({ w, li })))
    : safeLines.map((w, li) => ({ w, li }));

  const start = 8;
  const per = Math.max(4, Math.floor((durationInFrames - start - 12) / Math.max(1, tokens.length)));

  return (
    <AbsoluteFill style={{
      ...backgroundStyle(theme),
      justifyContent: 'center',
      alignItems: align === 'left' ? 'flex-start' : 'center',
      padding: '0 9%',
    }}>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: revealBy === 'word' ? '0 22px' : 18,
        flexDirection: revealBy === 'word' ? 'row' : 'column',
        justifyContent: align === 'left' ? 'flex-start' : 'center',
        textAlign: align,
      }}>
        {tokens.map((tk, i) => {
          const appear = start + i * per;
          const s = spring({ frame: frame - appear, fps, config: { damping: 200, stiffness: 120 } });
          const opacity = interpolate(frame - appear, [0, 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const y = interpolate(s, [0, 1], [40, 0]);
          const isAccent = revealBy === 'line' && tk.li % 2 === 1;
          return (
            <span key={i} style={{
              display: 'inline-block',
              transform: `translateY(${y}px)`,
              opacity,
              fontSize: revealBy === 'word' ? 78 : 72,
              fontWeight: 800,
              lineHeight: 1.15,
              color: isAccent ? colors.accent : colors.fg,
            }}>{tk.w}</span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
