'use client';
import { useState } from 'react';
import { Check, Moon, Sun, RotateCcw } from 'lucide-react';
import { DEFAULT_HOME, DEFAULT_THEME, normalizeTheme, PALETTES, themeVars, widgetOn, WIDGETS, type ThemeSettings } from '../lib/theme';

type Item = Record<string, any>;

export const HIDEABLE_TABS = ['Agenda', 'Clientes', 'Serviços', 'Pacotes', 'Notinhas', 'Financeiro', 'Atendimento'];

export default function SettingsForm({ settings, business, segment, owner, saving, onSave, onPreview, onError }: {
  settings: Item; business: string; segment: string; owner: string; saving: boolean;
  onSave: (settings: Item) => Promise<boolean>; onPreview: (theme: ThemeSettings | null) => void; onError: (msg: string) => void;
}) {
  const [theme, setTheme] = useState<ThemeSettings>(normalizeTheme(settings.theme));
  const hidden: string[] = Array.isArray(settings.hiddenTabs) ? settings.hiddenTabs : [];

  function change(patch: Partial<ThemeSettings>) {
    const next = normalizeTheme({ ...theme, ...patch });
    setTheme(next);
    onPreview(next);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) || '').trim();
    if (!text('business')) { onError('Informe o nome do negócio.'); return; }
    const homeTexts: Item = {};
    for (const k of Object.keys(DEFAULT_HOME)) homeTexts[k] = text('home_' + k);
    const widgets: Item = {};
    for (const w of WIDGETS) widgets[w.id] = f.get('widget_' + w.id) === 'on';
    const visible = f.getAll('tabs').map(String);
    const ok = await onSave({
      ...settings,
      business: text('business'), segment: text('segment'), owner: text('owner'),
      theme, home: homeTexts, widgets, hiddenTabs: HIDEABLE_TABS.filter((t) => !visible.includes(t)),
    });
    if (ok) onPreview(null);
  }

  return (
    <form className="panel settings" onSubmit={submit}>
      <h3>Seu negócio</h3>
      <label>Nome do negócio<input name="business" defaultValue={business} required /></label>
      <div className="form-grid">
        <label>Ramo de atividade<input name="segment" defaultValue={segment} placeholder="Ex.: Manicure, Barbearia, Loja" /></label>
        <label>Seu nome<input name="owner" defaultValue={owner} /></label>
      </div>
      <p className="footnote">Esses dados aparecem no menu, na tela inicial e no rodapé.</p>

      <hr />
      <h3>Paleta de cores</h3>
      <div className="palettes" role="radiogroup" aria-label="Paleta de cores">
        {PALETTES.map((p) => (
          <button type="button" role="radio" aria-checked={theme.palette === p.id} key={p.id} className={'palette' + (theme.palette === p.id ? ' on' : '')} onClick={() => change({ palette: p.id })}>
            <span className="swatches"><i style={{ background: p.tokens.primary }} /><i style={{ background: p.tokens.accent }} /><i style={{ background: p.tokens.heroBg }} /></span>
            {p.name}{theme.palette === p.id && <Check size={14} />}
          </button>
        ))}
        <label className={'palette custom' + (theme.palette === 'custom' ? ' on' : '')}>
          <span className="swatches"><input type="color" aria-label="Escolher cor" value={theme.custom} onChange={(e) => change({ palette: 'custom', custom: e.target.value })} onClick={() => theme.palette !== 'custom' && change({ palette: 'custom' })} /></span>
          Sua cor{theme.palette === 'custom' && <Check size={14} />}
        </label>
      </div>
      <div className="form-grid">
        <div>
          <p className="field-label">Tema</p>
          <div className="segmented">
            <button type="button" className={theme.mode === 'light' ? 'on' : ''} onClick={() => change({ mode: 'light' })}><Sun size={13} /> Claro</button>
            <button type="button" className={theme.mode === 'dark' ? 'on' : ''} onClick={() => change({ mode: 'dark' })}><Moon size={13} /> Escuro</button>
          </div>
        </div>
        <div>
          <p className="field-label">Estilo dos títulos</p>
          <div className="segmented">
            <button type="button" className={theme.font === 'serif' ? 'on' : ''} onClick={() => change({ font: 'serif' })} style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>Elegante</button>
            <button type="button" className={theme.font === 'sans' ? 'on' : ''} onClick={() => change({ font: 'sans' })}>Moderno</button>
          </div>
        </div>
      </div>
      <div className="theme-preview" style={themeVars(theme)}>
        <span className="eyebrow">PRÉVIA</span>
        <strong>{business}</strong>
        <span className="preview-chip">Botão</span><span className="badge">Etiqueta</span>
      </div>
      <button type="button" className="small" onClick={() => change(DEFAULT_THEME)}><RotateCcw size={12} /> Voltar às cores padrão</button>

      <hr />
      <h3>Mensagens da tela inicial</h3>
      <p className="footnote">Deixe em branco para usar o texto padrão.</p>
      <label>Frase abaixo de &quot;Olá, {owner}&quot;<input name="home_greeting" defaultValue={settings.home?.greeting || ''} placeholder={DEFAULT_HOME.greeting} /></label>
      <label>Frase pequena do banner<input name="home_eyebrow" defaultValue={settings.home?.eyebrow || ''} placeholder={DEFAULT_HOME.eyebrow} /></label>
      <label>Título do banner<input name="home_title" defaultValue={settings.home?.title || ''} placeholder={DEFAULT_HOME.title} /></label>
      <label>Texto de apoio do banner<input name="home_subtitle" defaultValue={settings.home?.subtitle || ''} placeholder={DEFAULT_HOME.subtitle} /></label>
      <label>Frase do menu lateral<input name="home_sidebar" defaultValue={settings.home?.sidebar || ''} placeholder={DEFAULT_HOME.sidebar} /></label>

      <hr />
      <h3>O que aparece na Visão geral</h3>
      <div className="checks">
        {WIDGETS.map((w) => (
          <label key={w.id}><input type="checkbox" name={'widget_' + w.id} defaultChecked={widgetOn(settings.widgets, w.id)} />{w.label}</label>
        ))}
      </div>

      <hr />
      <h3>Abas do menu</h3>
      <p className="footnote">Esconda as abas que este negócio não usa. Visão geral e Configurações ficam sempre visíveis.</p>
      <div className="checks columns">
        {HIDEABLE_TABS.map((t) => (
          <label key={t}><input type="checkbox" name="tabs" value={t} defaultChecked={!hidden.includes(t)} />{t}</label>
        ))}
      </div>

      <div className="settings-actions">
        <button type="button" className="small" onClick={() => { const t = normalizeTheme(settings.theme); setTheme(t); onPreview(null); }}>Descartar cores</button>
        <button className="primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar personalização'}</button>
      </div>
    </form>
  );
}
