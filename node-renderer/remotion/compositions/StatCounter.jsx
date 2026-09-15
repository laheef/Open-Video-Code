import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from 'remotion';
import { backgroundStyle, resolveColors } from '../theme.js';

export const StatCounter = ({ value = 100, prefix = '', suffix = '', label = '', decimals = 0, theme }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const colors = resolveColors(theme);

  const countEnd = Math.min(durationInFrames * 0.7, durationInFrames - 10);
  const progress = interpolate(frame, [6, countEnd], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic),
  });
  const current = value * progress;
  const display = current.toLocaleString('en-US', {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  });

  const pop = spring({ frame, fps, config: { damping: 200 } });
  const scale = interpolate(pop, [0, 1], [0.6, 1]);
  const labelOpacity = interpolate(frame, [countEnd - 10, countEnd + 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ ...backgroundStyle(theme), justifyContent: 'center', alignItems: 'center', padding: '0 8%' }}>
      <div style={{ transform: `scale(${scale})`, display: 'flex', alignItems: 'baseline', fontWeight: 900 }}>
        {prefix ? <span style={{ fontSize: 90, color: colors.accent }}>{prefix}</span> : null}
        <span style={{ fontSize: 200, letterSpacing: -4, color: colors.fg, fontVariantNumeric: 'tabular-nums' }}>{display}</span>
        {suffix ? <span style={{ fontSize: 110, color: colors.accent, marginLeft: 8 }}>{suffix}</span> : null}
      </div>
      {label ? (
        <div style={{ opacity: labelOpacity, marginTop: 28, fontSize: 48, fontWeight: 600, textAlign: 'center', maxWidth: '85%' }}>
          {label}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
