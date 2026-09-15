// Shared theme helpers for all compositions.
export const PALETTES = {
  midnight: { bg: ['#0f172a', '#1e293b'], fg: '#f8fafc', accent: '#38bdf8' },
  sunset: { bg: ['#7c2d12', '#b91c1c'], fg: '#fff7ed', accent: '#fbbf24' },
  forest: { bg: ['#052e16', '#166534'], fg: '#f0fdf4', accent: '#4ade80' },
  grape: { bg: ['#3b0764', '#7e22ce'], fg: '#faf5ff', accent: '#e879f9' },
  mono: { bg: ['#0a0a0a', '#262626'], fg: '#fafafa', accent: '#a3a3a3' },
  ocean: { bg: ['#082f49', '#0369a1'], fg: '#f0f9ff', accent: '#22d3ee' },
  candy: { bg: ['#831843', '#db2777'], fg: '#fff1f2', accent: '#fda4af' },
};

export function resolveColors(theme) {
  if (theme && theme.colors) return theme.colors;
  const p = (theme && theme.palette) || 'midnight';
  return PALETTES[p] || PALETTES.midnight;
}

export function backgroundStyle(theme) {
  const colors = resolveColors(theme);
  const font = (theme && theme.font) || 'Inter';
  const base = {
    fontFamily: `${font}, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`,
    color: colors.fg,
  };
  if (theme && theme.backgroundImage) {
    return {
      ...base,
      backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.35), rgba(0,0,0,0.55)), url("${theme.backgroundImage}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  return {
    ...base,
    background: `linear-gradient(135deg, ${colors.bg[0]}, ${colors.bg[1]})`,
  };
}
