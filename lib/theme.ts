import type { CSSProperties } from 'react';

export type ThemeSettings = { palette: string; custom: string; mode: 'light' | 'dark'; font: 'serif' | 'sans' };
export const DEFAULT_THEME: ThemeSettings = { palette: 'rose', custom: '#3f7cac', mode: 'light', font: 'serif' };

type Tokens = {
  bg: string; surface: string; surface2: string; border: string; borderStrong: string;
  text: string; heading: string; muted: string; muted2: string;
  primary: string; primaryStrong: string; primarySoft: string; heroBg: string;
  accent: string; accentSoft: string;
};

export const PALETTES: { id: string; name: string; tokens: Tokens }[] = [
  { id: 'rose', name: 'Rosé', tokens: { bg: '#faf8f5', surface: '#fffdfa', surface2: '#eee7e0', border: '#ece5df', borderStrong: '#e5d8cf', text: '#493c3c', heading: '#694b48', muted: '#a08a7e', muted2: '#bcab9c', primary: '#b77e85', primaryStrong: '#a0676e', primarySoft: '#f5e7e5', heroBg: '#f2e4df', accent: '#b0915f', accentSoft: '#f7f3ea' } },
  { id: 'oceano', name: 'Oceano', tokens: { bg: '#f5f8fa', surface: '#ffffff', surface2: '#e6eef3', border: '#e1e9ef', borderStrong: '#d3dee6', text: '#22343f', heading: '#1f4e66', muted: '#6f8796', muted2: '#9fb2be', primary: '#2f7fa8', primaryStrong: '#23658a', primarySoft: '#e3f0f7', heroBg: '#dcebf3', accent: '#c08a3e', accentSoft: '#f6f1e6' } },
  { id: 'floresta', name: 'Floresta', tokens: { bg: '#f6f8f4', surface: '#fefffd', surface2: '#e8eee3', border: '#e3e9de', borderStrong: '#d5ddce', text: '#2d3a2c', heading: '#34553a', muted: '#7b8a77', muted2: '#a9b5a5', primary: '#4f8a5b', primaryStrong: '#3d6f48', primarySoft: '#e5f0e6', heroBg: '#dfeadf', accent: '#b08a3e', accentSoft: '#f5f1e4' } },
  { id: 'lavanda', name: 'Lavanda', tokens: { bg: '#f8f6fb', surface: '#fffeff', surface2: '#ece7f3', border: '#e8e2f0', borderStrong: '#dbd3e6', text: '#3a3347', heading: '#5a4775', muted: '#8d829e', muted2: '#b6adc4', primary: '#8a6bb8', primaryStrong: '#6f539b', primarySoft: '#efe8f8', heroBg: '#e9e0f4', accent: '#c0907a', accentSoft: '#f8efe9' } },
  { id: 'terracota', name: 'Terracota', tokens: { bg: '#fbf7f3', surface: '#fffdfb', surface2: '#f1e7de', border: '#efe3d9', borderStrong: '#e4d4c6', text: '#43322a', heading: '#7a4430', muted: '#a38878', muted2: '#c4ae9f', primary: '#c0673f', primaryStrong: '#9f5131', primarySoft: '#f8e7dd', heroBg: '#f4e0d3', accent: '#6f8a5a', accentSoft: '#edf2e7' } },
  { id: 'grafite', name: 'Grafite', tokens: { bg: '#f5f5f4', surface: '#ffffff', surface2: '#e9e9e7', border: '#e4e4e2', borderStrong: '#d6d6d3', text: '#262626', heading: '#303030', muted: '#7a7a77', muted2: '#a8a8a4', primary: '#3f4a5a', primaryStrong: '#2c3542', primarySoft: '#e8eaee', heroBg: '#e6e7ea', accent: '#c4943d', accentSoft: '#f6f0e2' } },
];

const HEX = /^#[0-9a-fA-F]{6}$/;

export function normalizeTheme(t?: Partial<ThemeSettings> | null): ThemeSettings {
  const v = { ...DEFAULT_THEME, ...(t || {}) };
  if (v.palette !== 'custom' && !PALETTES.some((p) => p.id === v.palette)) v.palette = DEFAULT_THEME.palette;
  if (!HEX.test(v.custom)) v.custom = DEFAULT_THEME.custom;
  if (v.mode !== 'dark') v.mode = 'light';
  if (v.font !== 'sans') v.font = 'serif';
  return v;
}

function tokensFor(t: ThemeSettings): Tokens {
  if (t.palette !== 'custom') return { ...PALETTES.find((p) => p.id === t.palette)!.tokens };
  const base = { ...PALETTES.find((p) => p.id === 'grafite')!.tokens };
  const c = t.custom;
  return {
    ...base,
    heading: `color-mix(in srgb, ${c} 55%, #1f1f1f)`,
    primary: c,
    primaryStrong: `color-mix(in srgb, ${c} 80%, black)`,
    primarySoft: `color-mix(in srgb, ${c} 12%, white)`,
    heroBg: `color-mix(in srgb, ${c} 18%, white)`,
  };
}

/** Variáveis CSS do tema escolhido, aplicadas no contêiner do painel. */
export function themeVars(input?: Partial<ThemeSettings> | null): CSSProperties {
  const t = normalizeTheme(input);
  const k = tokensFor(t);
  if (t.mode === 'dark') {
    const dark = '#1d1d21';
    Object.assign(k, {
      bg: '#151518', surface: dark, surface2: '#2a2a30', border: '#2c2c33', borderStrong: '#3a3a43',
      text: '#e7e3e0', heading: '#f4f0ed', muted: '#a8a29e', muted2: '#7f7a76',
      primary: `color-mix(in srgb, ${k.primary} 75%, white)`,
      primaryStrong: `color-mix(in srgb, ${k.primary} 55%, white)`,
      primarySoft: `color-mix(in srgb, ${k.primary} 22%, ${dark})`,
      heroBg: `color-mix(in srgb, ${k.primary} 16%, ${dark})`,
      accent: `color-mix(in srgb, ${k.accent} 80%, white)`,
      accentSoft: `color-mix(in srgb, ${k.accent} 14%, ${dark})`,
    });
  }
  return {
    '--bg': k.bg, '--surface': k.surface, '--surface-2': k.surface2, '--border': k.border, '--border-strong': k.borderStrong,
    '--text': k.text, '--heading': k.heading, '--muted': k.muted, '--muted-2': k.muted2,
    '--primary': k.primary, '--primary-strong': k.primaryStrong, '--primary-soft': k.primarySoft, '--hero-bg': k.heroBg,
    '--accent': k.accent, '--accent-soft': k.accentSoft,
    '--font-heading': t.font === 'sans' ? "'DM Sans', Arial, sans-serif" : "'Playfair Display', Georgia, serif",
    colorScheme: t.mode,
  } as CSSProperties;
}

export const WIDGETS: { id: string; label: string; on: boolean }[] = [
  { id: 'banner', label: 'Banner de boas-vindas', on: true },
  { id: 'resumo', label: 'Cartões de resumo (atendimentos, recebido, clientes, pacotes)', on: true },
  { id: 'faturamento', label: 'Gráfico: recebido nos últimos 6 meses', on: true },
  { id: 'servicos', label: 'Gráfico: serviços mais realizados', on: true },
  { id: 'semana', label: 'Gráfico: movimento por dia da semana', on: false },
  { id: 'caixa', label: 'Gráfico: entradas x despesas do mês', on: false },
  { id: 'agenda', label: 'Agenda de hoje', on: true },
  { id: 'atalhos', label: 'Atalhos rápidos', on: true },
];

export const widgetOn = (widgets: Record<string, boolean> | undefined, id: string) =>
  widgets && id in widgets ? !!widgets[id] : !!WIDGETS.find((w) => w.id === id)?.on;

export type HomeTexts = { greeting: string; eyebrow: string; title: string; subtitle: string; sidebar: string };
export const DEFAULT_HOME: HomeTexts = {
  greeting: 'Tudo o que importa no seu dia, em um só lugar.',
  eyebrow: 'SEU NEGÓCIO EM UM SÓ LUGAR',
  title: 'Agenda, clientes e vendas. Tudo organizado.',
  subtitle: 'Menos papel, mais tempo para o que você faz de melhor.',
  sidebar: 'Seu negócio, organizado em um só lugar.',
};
