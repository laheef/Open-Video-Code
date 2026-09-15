import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { backgroundStyle, resolveColors } from '../theme.js';

export const QuoteCard = ({ quote = '', attribution = '', theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const colors = resolveColors(theme);

  const s = spring({ frame, fps, config: { damping: 200 } });
  const scale = interpolate(s, [0, 1], [0.9, 1]);
  const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const markOpacity = interpolate(frame, [0, 15], [0, 0.25], { extrapolateRight: 'clamp' });
  const attrOpacity = interpolate(frame, [25, 45], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ ...backgroundStyle(theme), justifyContent: 'center', alignItems: 'center', padding: '0 10%' }}>
      <div style={{
        position: 'absolute', top: '16%', fontSize: 360, lineHeight: 0.7,
        fontWeight: 900, color: colors.accent, opacity: markOpacity, fontFamily: 'Georgia, serif',
      }}>“</div>
      <div style={{
        transform: `scale(${scale})`, opacity,
        fontSize: 62, fontWeight: 700, lineHeight: 1.3, textAlign: 'center',
        fontStyle: 'italic', maxWidth: '90%',
      }}>{quote}</div>
      {attribution ? (
        <div style={{ opacity: attrOpacity, marginTop: 48, fontSize: 40, fontWeight: 600, color: colors.accent }}>
          — {attribution}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
