import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { backgroundStyle, resolveColors } from '../theme.js';

export const TitleIntro = ({ title = 'Untitled', subtitle = '', eyebrow = '', theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const colors = resolveColors(theme);

  const enter = spring({ frame, fps, config: { damping: 200 } });
  const titleY = interpolate(enter, [0, 1], [40, 0]);
  const titleOpacity = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: 'clamp' });
  const eyebrowOpacity = interpolate(frame, [4, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const subOpacity = interpolate(frame, [22, 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const barW = interpolate(spring({ frame: frame - 10, fps, config: { damping: 200 } }), [0, 1], [0, 120]);

  return (
    <AbsoluteFill style={{ ...backgroundStyle(theme), justifyContent: 'center', alignItems: 'center', padding: '0 8%' }}>
      {eyebrow ? (
        <div style={{
          opacity: eyebrowOpacity, textTransform: 'uppercase', letterSpacing: 6,
          fontSize: 34, fontWeight: 700, color: colors.accent, marginBottom: 24,
        }}>{eyebrow}</div>
      ) : null}
      <div style={{
        transform: `translateY(${titleY}px)`, opacity: titleOpacity,
        fontSize: 100, fontWeight: 900, lineHeight: 1.05, textAlign: 'center',
        textShadow: '0 6px 30px rgba(0,0,0,0.35)',
      }}>{title}</div>
      <div style={{ width: barW, height: 8, borderRadius: 8, background: colors.accent, margin: '36px 0' }} />
      {subtitle ? (
        <div style={{ opacity: subOpacity, fontSize: 44, fontWeight: 500, textAlign: 'center', maxWidth: '85%', opacity: subOpacity * 0.9 }}>
          {subtitle}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
