import React, { useEffect, useMemo, useState } from 'react';
import {
  Palette,
  Sparkles,
  RotateCcw,
  Save,
  Check,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Lock,
  Wand2,
  SunMoon,
  Blend,
  Layers,
  Type as TypeIcon,
  Square,
  Compass
} from 'lucide-react';
import { UserProfile } from '../types';
import { isUserSpark } from '../utils/fileUploadHelper';
import {
  DEFAULT_PROFILE_THEME,
  MAX_GRADIENT_STOPS,
  MIN_GRADIENT_STOPS,
  ProfileTheme,
  THEME_PRESETS,
  ThemeFill,
  ThemeGradient,
  applyGlobalProfileTheme,
  ensureThemeStylesheet,
  getProfileTheme,
  gradientToCss,
  isValidColor,
  sanitizeProfileTheme,
  themeToStyle
} from '../utils/themeHelper';

interface ThemeStudioProps {
  user: UserProfile;
  language: 'tr' | 'en';
  onSaveTheme: (theme: ProfileTheme) => void;
  onOpenSupport?: () => void;
}

type FillKeyName = 'background' | 'surface' | 'accent' | 'banner';

const t = (language: 'tr' | 'en', tr: string, en: string) => (language === 'tr' ? tr : en);

// -------------------------------------------------------------
// SMALL CONTROLS
// -------------------------------------------------------------

const ColorField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}> = ({ label, value, onChange, hint }) => {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = (next: string) => {
    setDraft(next);
    if (isValidColor(next)) onChange(next.toLowerCase());
  };

  return (
    <label className="c4e-well flex items-center justify-between gap-3 p-2.5">
      <span className="min-w-0">
        <span className="block text-[11px] font-bold text-zinc-200 truncate">{label}</span>
        {hint && <span className="block text-[10px] text-zinc-500 truncate">{hint}</span>}
      </span>
      <span className="flex items-center gap-2 flex-shrink-0">
        <input
          type="text"
          value={draft}
          onChange={(e) => commit(e.target.value.trim())}
          spellCheck={false}
          className="w-[88px] px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.12] text-[11px] font-mono text-zinc-200 focus:outline-none focus:border-zinc-500"
        />
        <input
          type="color"
          value={isValidColor(draft) ? draft.slice(0, 7) : '#000000'}
          onChange={(e) => commit(e.target.value)}
          className="w-9 h-9 rounded-lg bg-transparent border border-white/[0.12] cursor-pointer p-0.5"
          aria-label={label}
        />
      </span>
    </label>
  );
};

const SliderField: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}> = ({ label, value, min, max, step = 1, unit = '', onChange }) => (
  <label className="c4e-well block p-2.5">
    <span className="flex items-center justify-between text-[11px] font-bold text-zinc-200 mb-1.5">
      <span>{label}</span>
      <span className="font-mono text-zinc-400">
        {value}
        {unit}
      </span>
    </span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full accent-amber-500 cursor-pointer"
    />
  </label>
);

const ToggleField: React.FC<{
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ label, description, checked, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className="c4e-listrow w-full flex items-center justify-between gap-3 p-3 text-left cursor-pointer"
  >
    <span className="min-w-0">
      <span className="block text-[11px] font-bold text-zinc-100">{label}</span>
      {description && <span className="block text-[10px] text-zinc-500 leading-relaxed">{description}</span>}
    </span>
    <span
      className={`w-10 h-5 rounded-full flex-shrink-0 relative transition-colors ${checked ? 'bg-amber-500' : 'bg-zinc-700'}`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`}
      />
    </span>
  </button>
);

// -------------------------------------------------------------
// GRADIENT EDITOR
// -------------------------------------------------------------

const GRADIENT_DIRECTION_PRESETS: Array<{ label: string; angle: number }> = [
  { label: '↑', angle: 0 },
  { label: '↗', angle: 45 },
  { label: '→', angle: 90 },
  { label: '↘', angle: 135 },
  { label: '↓', angle: 180 },
  { label: '↙', angle: 225 },
  { label: '←', angle: 270 },
  { label: '↖', angle: 315 }
];

const GradientEditor: React.FC<{
  language: 'tr' | 'en';
  gradient: ThemeGradient;
  onChange: (gradient: ThemeGradient) => void;
}> = ({ language, gradient, onChange }) => {
  const update = (patch: Partial<ThemeGradient>) => onChange({ ...gradient, ...patch });

  const updateStop = (index: number, patch: Partial<{ color: string; position: number }>) => {
    const stops = gradient.stops.map((stop, i) => (i === index ? { ...stop, ...patch } : stop));
    update({ stops });
  };

  const addStop = () => {
    if (gradient.stops.length >= MAX_GRADIENT_STOPS) return;
    const last = gradient.stops[gradient.stops.length - 1];
    const previous = gradient.stops[gradient.stops.length - 2];
    const position = previous ? Math.min(100, Math.round((last.position + previous.position) / 2) + 20) : 50;
    update({ stops: [...gradient.stops, { color: last.color, position }] });
  };

  const removeStop = (index: number) => {
    if (gradient.stops.length <= MIN_GRADIENT_STOPS) return;
    update({ stops: gradient.stops.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-2.5">
      <div
        className="h-16 rounded-xl border border-white/[0.12] shadow-inner"
        style={{ backgroundImage: gradientToCss(gradient) }}
      />

      <div className="grid grid-cols-3 gap-2">
        {(['linear', 'radial', 'conic'] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => update({ kind })}
            className={`py-2 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer ${
              gradient.kind === kind
                ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                : 'bg-black/25 border-white/[0.07] text-zinc-400 hover:border-white/[0.16]'
            }`}
          >
            {kind === 'linear' ? t(language, 'Doğrusal', 'Linear') : kind === 'radial' ? t(language, 'Dairesel', 'Radial') : t(language, 'Konik', 'Conic')}
          </button>
        ))}
      </div>

      {gradient.kind !== 'radial' && (
        <>
          <SliderField
            label={t(language, 'Gradyan Yönü (açı)', 'Gradient direction (angle)')}
            value={gradient.angle}
            min={0}
            max={360}
            unit="°"
            onChange={(angle) => update({ angle })}
          />
          <div className="grid grid-cols-8 gap-1.5">
            {GRADIENT_DIRECTION_PRESETS.map((direction) => (
              <button
                key={direction.angle}
                type="button"
                title={`${direction.angle}°`}
                onClick={() => update({ angle: direction.angle })}
                className={`py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                  gradient.angle === direction.angle
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                    : 'bg-black/25 border-white/[0.07] text-zinc-400 hover:border-white/[0.16]'
                }`}
              >
                {direction.label}
              </button>
            ))}
          </div>
        </>
      )}

      {gradient.kind !== 'linear' && (
        <div className="grid grid-cols-2 gap-2">
          <SliderField
            label={t(language, 'Merkez X', 'Center X')}
            value={gradient.centerX}
            min={0}
            max={100}
            unit="%"
            onChange={(centerX) => update({ centerX })}
          />
          <SliderField
            label={t(language, 'Merkez Y', 'Center Y')}
            value={gradient.centerY}
            min={0}
            max={100}
            unit="%"
            onChange={(centerY) => update({ centerY })}
          />
        </div>
      )}

      {gradient.kind === 'radial' && (
        <div className="grid grid-cols-2 gap-2">
          {(['ellipse', 'circle'] as const).map((shape) => (
            <button
              key={shape}
              type="button"
              onClick={() => update({ shape })}
              className={`py-2 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer ${
                gradient.shape === shape
                  ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                  : 'bg-black/25 border-white/[0.07] text-zinc-400 hover:border-white/[0.16]'
              }`}
            >
              {shape === 'ellipse' ? t(language, 'Elips', 'Ellipse') : t(language, 'Daire', 'Circle')}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-zinc-300">
            {t(language, 'Renk Durakları', 'Colour stops')} ({gradient.stops.length}/{MAX_GRADIENT_STOPS})
          </span>
          <button
            type="button"
            onClick={addStop}
            disabled={gradient.stops.length >= MAX_GRADIENT_STOPS}
            className="px-2.5 py-1 rounded-lg bg-white/[0.07] hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-[10px] font-bold text-zinc-200 flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            {t(language, 'Renk Ekle', 'Add colour')}
          </button>
        </div>

        {gradient.stops.map((stop, index) => (
          <div key={index} className="c4e-well p-2.5 space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={isValidColor(stop.color) ? stop.color.slice(0, 7) : '#000000'}
                onChange={(e) => updateStop(index, { color: e.target.value })}
                className="w-9 h-9 rounded-lg bg-transparent border border-white/[0.12] cursor-pointer p-0.5 flex-shrink-0"
                aria-label={`${t(language, 'Renk', 'Colour')} ${index + 1}`}
              />
              <input
                type="text"
                value={stop.color}
                spellCheck={false}
                onChange={(e) => {
                  const next = e.target.value.trim();
                  if (isValidColor(next)) updateStop(index, { color: next });
                }}
                className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.12] text-[11px] font-mono text-zinc-200 focus:outline-none focus:border-zinc-500"
              />
              <button
                type="button"
                onClick={() => removeStop(index)}
                disabled={gradient.stops.length <= MIN_GRADIENT_STOPS}
                className="p-2 rounded-lg bg-white/[0.04] hover:bg-red-500/20 text-zinc-400 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex-shrink-0"
                aria-label={t(language, 'Rengi sil', 'Remove colour')}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <SliderField
              label={t(language, 'Konum', 'Position')}
              value={stop.position}
              min={0}
              max={100}
              unit="%"
              onChange={(position) => updateStop(index, { position })}
            />
          </div>
        ))}
      </div>

      <ToggleField
        label={t(language, 'Gradyanı canlandır', 'Animate gradient')}
        description={t(language, 'Renkler yavaşça akar (hareket azaltma tercihine saygı duyar).', 'Colours drift slowly (respects reduced-motion).')}
        checked={gradient.animate}
        onChange={(animate) => update({ animate })}
      />
    </div>
  );
};

// -------------------------------------------------------------
// FILL SECTION (solid <-> gradient)
// -------------------------------------------------------------

const FillSection: React.FC<{
  language: 'tr' | 'en';
  title: string;
  description: string;
  icon: React.ReactNode;
  fill: ThemeFill;
  onChange: (fill: ThemeFill) => void;
  children?: React.ReactNode;
}> = ({ language, title, description, icon, fill, onChange, children }) => (
  <section className="c4e-card p-4 space-y-3">
    <header className="flex items-start gap-2.5">
      <span className="w-8 h-8 rounded-xl bg-black/25 border border-white/[0.07] flex items-center justify-center text-amber-400 flex-shrink-0">
        {icon}
      </span>
      <span className="min-w-0">
        <h4 className="text-xs font-extrabold text-white">{title}</h4>
        <p className="text-[10px] text-zinc-500 leading-relaxed">{description}</p>
      </span>
    </header>

    <div className="grid grid-cols-2 gap-2">
      {(['solid', 'gradient'] as const).map((kind) => (
        <button
          key={kind}
          type="button"
          onClick={() => onChange({ ...fill, kind })}
          className={`py-2 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer ${
            fill.kind === kind
              ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
              : 'bg-black/25 border-white/[0.07] text-zinc-400 hover:border-white/[0.16]'
          }`}
        >
          {kind === 'solid' ? t(language, 'Düz Renk', 'Solid') : t(language, 'Gradyan', 'Gradient')}
        </button>
      ))}
    </div>

    {fill.kind === 'solid' ? (
      <ColorField label={t(language, 'Renk', 'Colour')} value={fill.color} onChange={(color) => onChange({ ...fill, color })} />
    ) : (
      <GradientEditor language={language} gradient={fill.gradient} onChange={(gradient) => onChange({ ...fill, gradient })} />
    )}

    {children}
  </section>
);

// -------------------------------------------------------------
// LIVE PREVIEW
// -------------------------------------------------------------

const ThemePreview: React.FC<{ theme: ProfileTheme; user: UserProfile; language: 'tr' | 'en' }> = ({ theme, user, language }) => {
  // Mirrors the rule used on the real profile: the uploaded photo wins unless the member
  // switched the banner over to the gradient (or has no photo at all).
  const usesGradientBanner =
    theme.banner.kind === 'gradient' && (!theme.banner.useProfileImage || !(user.banner_url || '').trim());

  return (
  <div
    className="c4e-theme-scope rounded-2xl overflow-hidden border"
    style={{ ...themeToStyle(theme), borderColor: theme.border.color }}
  >
    <div
      className={`h-20 w-full relative overflow-hidden ${
        usesGradientBanner ? `c4e-theme-banner ${theme.banner.gradient.animate ? 'c4e-theme-animated' : ''}` : 'bg-white/[0.04]'
      }`}
    >
      {!usesGradientBanner && user.banner_url && (
        <img src={user.banner_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
      )}
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(to top, var(--c4e-bg), transparent)`, opacity: theme.banner.overlayOpacity / 100 }}
      />
    </div>

    <div className="px-4 pb-4 -mt-8 space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div
          className="w-16 h-16 rounded-full overflow-hidden border-2 flex-shrink-0"
          style={{ borderColor: theme.background.color, backgroundColor: theme.surface.color }}
        >
          {user.avatar_url ? (
            <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="w-full h-full flex items-center justify-center text-lg font-black" style={{ color: theme.text.primary }}>
              {(user.display_name || user.username || 'C')[0].toUpperCase()}
            </span>
          )}
        </div>
        <button
          type="button"
          className={`c4e-theme-accent px-3.5 py-1.5 text-[11px] font-bold ${theme.accent.gradient.animate ? 'c4e-theme-animated' : ''}`}
        >
          {t(language, 'Mesaj Gönder', 'Send message')}
        </button>
      </div>

      <div>
        <p className="text-sm font-extrabold" style={{ color: theme.text.primary }}>
          {user.display_name || t(language, 'Görünen Ad', 'Display name')}
        </p>
        <p className="text-[11px] font-mono c4e-theme-muted">@{user.username || 'kullanici'}</p>
      </div>

      <div className="c4e-theme-surface p-3" style={{ backdropFilter: theme.effects.blur ? `blur(${theme.effects.blur}px)` : undefined }}>
        <p className="text-[11px] leading-relaxed" style={{ color: theme.text.primary }}>
          {t(language, 'Bu bir örnek kart. Kart arka planı, kenarlık ve köşe yarıçapı temanızdan gelir.', 'Sample card. Surface, border and radius come from your theme.')}
        </p>
        <p className="text-[11px] mt-1.5 c4e-theme-muted">{t(language, 'İkincil metin rengi', 'Muted text colour')}</p>
        <p className="text-[11px] mt-1.5 font-mono" style={{ color: theme.text.code }}>
          const spark = &quot;{t(language, 'kod rengi', 'code colour')}&quot;;
        </p>
        <p className="text-[11px] mt-1.5 c4e-theme-link underline">{t(language, 'Bağlantı rengi', 'Link colour')}</p>
      </div>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// MAIN COMPONENT
// -------------------------------------------------------------

export const ThemeStudio: React.FC<ThemeStudioProps> = ({ user, language, onSaveTheme, onOpenSupport }) => {
  const isSpark = isUserSpark(user);
  const storedTheme = useMemo(() => getProfileTheme(user), [user]);

  const [draft, setDraft] = useState<ProfileTheme>(() =>
    sanitizeProfileTheme(storedTheme || { ...DEFAULT_PROFILE_THEME, enabled: true })
  );
  const [livePreview, setLivePreview] = useState(true);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  useEffect(() => {
    ensureThemeStylesheet();
  }, []);

  // Paint the session while the studio is open, and restore the saved theme on exit.
  useEffect(() => {
    if (!isSpark) return;
    if (livePreview) {
      applyGlobalProfileTheme(draft.enabled ? draft : null);
    }
    return () => {
      applyGlobalProfileTheme(storedTheme);
    };
  }, [draft, livePreview, isSpark, storedTheme]);

  if (!isSpark) {
    return (
      <div className="rounded-3xl border border-amber-500/25 bg-gradient-to-b from-amber-500/5 to-zinc-950 p-6 text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6" />
        </div>
        <h3 className="text-base font-extrabold text-white">
          {t(language, 'Gradyan Tema Stüdyosu — Spark Destekçilerine Özel', 'Gradient Theme Studio — Spark supporters only')}
        </h3>
        <p className="text-xs text-zinc-400 leading-relaxed max-w-md mx-auto">
          {t(
            language,
            'Spark Destekçisi olarak arka plan, kart, vurgu ve banner renklerinin tamamını, gradyan türünü ve yönünü özelleştirebilir; temanızı profilinizde diğer kullanıcılara gösterebilirsiniz.',
            'As a Spark supporter you can customise every colour, the gradient type and its direction, and show your theme to other members on your profile.'
          )}
        </p>
        {onOpenSupport && (
          <button
            onClick={onOpenSupport}
            className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-black text-xs inline-flex items-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            {t(language, 'Spark Destekçisi Ol', 'Become a Spark supporter')}
          </button>
        )}
      </div>
    );
  }

  const updateFill = (key: FillKeyName, fill: ThemeFill) => {
    setActivePresetId(null);
    setDraft((prev) => {
      if (key === 'banner') {
        return { ...prev, banner: { ...prev.banner, ...fill } };
      }
      return { ...prev, [key]: fill } as ProfileTheme;
    });
  };

  const patchDraft = (patch: Partial<ProfileTheme>) => {
    setActivePresetId(null);
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const handleSave = () => {
    const clean = sanitizeProfileTheme(draft);
    onSaveTheme(clean);
    applyGlobalProfileTheme(clean.enabled ? clean : null);
    setSavedAt(Date.now());
    setTimeout(() => setSavedAt(null), 2500);
  };

  const handleReset = () => {
    const reset = sanitizeProfileTheme({ ...DEFAULT_PROFILE_THEME, enabled: draft.enabled });
    setDraft(reset);
    setActivePresetId(null);
  };

  return (
    <div className="space-y-4">
      <header className="rounded-3xl border border-white/[0.07] bg-gradient-to-r from-amber-500/10 via-zinc-950 to-zinc-950 p-5 flex flex-col md:flex-row md:items-center gap-3 justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <span className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center flex-shrink-0">
            <Palette className="w-5 h-5" />
          </span>
          <span className="min-w-0">
            <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
              {t(language, 'Gradyan Tema Stüdyosu', 'Gradient Theme Studio')}
              <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[9px] font-black uppercase tracking-wider">
                Spark
              </span>
            </h3>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              {t(
                language,
                'Her rengi, gradyan türünü ve yönünü değiştirin. Temanız profilinizde diğer kullanıcılara da görünür.',
                'Change every colour, gradient type and direction. Your theme is visible to visitors on your profile.'
              )}
            </p>
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setLivePreview((prev) => !prev)}
            className="px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.07] hover:border-white/[0.16] text-[11px] font-bold text-zinc-300 flex items-center gap-1.5 cursor-pointer"
            title={t(language, 'Canlı önizleme', 'Live preview')}
          >
            {livePreview ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            {t(language, 'Canlı', 'Live')}
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.07] hover:border-white/[0.16] text-[11px] font-bold text-zinc-300 flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {t(language, 'Sıfırla', 'Reset')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 text-[11px] font-black flex items-center gap-1.5 shadow-lg shadow-amber-500/20 cursor-pointer"
          >
            {savedAt ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            {savedAt ? t(language, 'Kaydedildi', 'Saved') : t(language, 'Kaydet', 'Save')}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          {/* Presets */}
          <section className="c4e-card p-4 space-y-3">
            <header className="flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-amber-400" />
              <h4 className="text-xs font-extrabold text-white">{t(language, 'Hazır Temalar', 'Presets')}</h4>
            </header>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {THEME_PRESETS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setDraft(sanitizeProfileTheme({ ...item.theme, enabled: true, shareWithVisitors: draft.shareWithVisitors, paintWholeApp: draft.paintWholeApp }));
                    setActivePresetId(item.id);
                  }}
                  className={`p-2 rounded-xl border text-left transition-colors cursor-pointer ${
                    activePresetId === item.id ? 'border-amber-500/60 bg-amber-500/10' : 'border-white/[0.07] bg-black/25 hover:border-white/[0.16]'
                  }`}
                >
                  <span
                    className="block h-10 rounded-lg mb-1.5 border border-black/30"
                    style={{
                      backgroundImage:
                        item.theme.background.kind === 'gradient'
                          ? gradientToCss(item.theme.background.gradient)
                          : gradientToCss(item.theme.accent.gradient),
                      backgroundColor: item.theme.background.color
                    }}
                  />
                  <span className="block text-[11px] font-bold text-zinc-100 truncate">{item.name}</span>
                  <span className="block text-[9px] text-zinc-500 truncate">{item.description}</span>
                </button>
              ))}
            </div>
          </section>

          <FillSection
            language={language}
            title={t(language, 'Arka Plan', 'Background')}
            description={t(language, 'Uygulamanın ana zemini.', 'The main application canvas.')}
            icon={<SunMoon className="w-4 h-4" />}
            fill={draft.background}
            onChange={(fill) => updateFill('background', fill)}
          />

          <FillSection
            language={language}
            title={t(language, 'Kartlar & Yüzeyler', 'Cards & surfaces')}
            description={t(language, 'Gönderi kartları, paneller ve modaller.', 'Post cards, panels and modals.')}
            icon={<Layers className="w-4 h-4" />}
            fill={draft.surface}
            onChange={(fill) => updateFill('surface', fill)}
          />

          <FillSection
            language={language}
            title={t(language, 'Vurgu (Butonlar & Rozetler)', 'Accent (buttons & badges)')}
            description={t(language, 'Birincil butonlar, aktif sekmeler ve vurgular.', 'Primary buttons, active tabs and highlights.')}
            icon={<Blend className="w-4 h-4" />}
            fill={draft.accent}
            onChange={(fill) => updateFill('accent', fill)}
          />

          <FillSection
            language={language}
            title={t(language, 'Profil Banner', 'Profile banner')}
            description={t(language, 'Profilinizin üst şeridi — ziyaretçiler de görür.', 'The banner strip on your profile — visitors see it too.')}
            icon={<Square className="w-4 h-4" />}
            fill={draft.banner}
            onChange={(fill) => updateFill('banner', fill)}
          >
            <ToggleField
              label={t(language, 'Yüklediğim banner görselini koru', 'Keep my uploaded banner photo')}
              description={t(
                language,
                'Açıkken profilindeki banner fotoğrafın olduğu gibi kalır; kapatırsan yukarıdaki gradyan banner olarak kullanılır.',
                'When on, your uploaded banner photo stays as it is; turn it off to use the gradient above as the banner.'
              )}
              checked={draft.banner.useProfileImage}
              onChange={(useProfileImage) => patchDraft({ banner: { ...draft.banner, useProfileImage } })}
            />
            <SliderField
              label={t(language, 'Banner karartma', 'Banner overlay')}
              value={draft.banner.overlayOpacity}
              min={0}
              max={100}
              unit="%"
              onChange={(overlayOpacity) => patchDraft({ banner: { ...draft.banner, overlayOpacity } })}
            />
          </FillSection>

          {/* Text colours */}
          <section className="c4e-card p-4 space-y-2.5">
            <header className="flex items-center gap-2">
              <TypeIcon className="w-4 h-4 text-amber-400" />
              <h4 className="text-xs font-extrabold text-white">{t(language, 'Metin Renkleri', 'Text colours')}</h4>
            </header>
            <ColorField
              label={t(language, 'Ana metin', 'Primary text')}
              value={draft.text.primary}
              onChange={(primary) => patchDraft({ text: { ...draft.text, primary } })}
            />
            <ColorField
              label={t(language, 'İkincil metin', 'Muted text')}
              value={draft.text.muted}
              onChange={(muted) => patchDraft({ text: { ...draft.text, muted } })}
            />
            <ColorField
              label={t(language, 'Vurgu üzerindeki metin', 'Text on accent')}
              value={draft.text.onAccent}
              onChange={(onAccent) => patchDraft({ text: { ...draft.text, onAccent } })}
            />
            <ColorField
              label={t(language, 'Kod rengi', 'Code colour')}
              value={draft.text.code}
              onChange={(code) => patchDraft({ text: { ...draft.text, code } })}
            />
            <ColorField
              label={t(language, 'Bağlantı rengi', 'Link colour')}
              value={draft.text.link}
              onChange={(link) => patchDraft({ text: { ...draft.text, link } })}
            />
          </section>

          {/* Borders, glow, effects */}
          <section className="c4e-card p-4 space-y-2.5">
            <header className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-amber-400" />
              <h4 className="text-xs font-extrabold text-white">{t(language, 'Kenarlık, Işıma & Efektler', 'Borders, glow & effects')}</h4>
            </header>
            <ColorField
              label={t(language, 'Kenarlık rengi', 'Border colour')}
              value={draft.border.color}
              onChange={(color) => patchDraft({ border: { ...draft.border, color } })}
            />
            <SliderField
              label={t(language, 'Köşe yarıçapı', 'Corner radius')}
              value={draft.border.radius}
              min={0}
              max={40}
              unit="px"
              onChange={(radius) => patchDraft({ border: { ...draft.border, radius } })}
            />
            <SliderField
              label={t(language, 'Kenarlık kalınlığı', 'Border width')}
              value={draft.border.width}
              min={0}
              max={4}
              unit="px"
              onChange={(width) => patchDraft({ border: { ...draft.border, width } })}
            />
            <ColorField
              label={t(language, 'Işıma rengi', 'Glow colour')}
              value={draft.glow.color}
              onChange={(color) => patchDraft({ glow: { ...draft.glow, color } })}
            />
            <SliderField
              label={t(language, 'Işıma yoğunluğu', 'Glow intensity')}
              value={draft.glow.intensity}
              min={0}
              max={100}
              unit="%"
              onChange={(intensity) => patchDraft({ glow: { ...draft.glow, intensity } })}
            />
            <SliderField
              label={t(language, 'Kart bulanıklığı', 'Card blur')}
              value={draft.effects.blur}
              min={0}
              max={24}
              unit="px"
              onChange={(blur) => patchDraft({ effects: { ...draft.effects, blur } })}
            />
            <ToggleField
              label={t(language, 'Izgara dokusu', 'Grid texture')}
              description={t(language, 'Code4Ever imzası olan ince ızgara deseni.', "Code4Ever's signature grid pattern.")}
              checked={draft.effects.grid}
              onChange={(grid) => patchDraft({ effects: { ...draft.effects, grid } })}
            />
          </section>

          {/* Visibility */}
          <section className="c4e-card p-4 space-y-2.5">
            <header className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <h4 className="text-xs font-extrabold text-white">{t(language, 'Görünürlük', 'Visibility')}</h4>
            </header>
            <ToggleField
              label={t(language, 'Temam aktif', 'Theme enabled')}
              description={t(language, 'Kapatırsanız varsayılan Code4Ever teması kullanılır.', 'When off, the default Code4Ever theme is used.')}
              checked={draft.enabled}
              onChange={(enabled) => patchDraft({ enabled })}
            />
            <ToggleField
              label={t(language, 'Diğer kullanıcılara göster', 'Show to other members')}
              description={t(language, 'Profilinizi ziyaret edenler temanızı görür.', 'Visitors to your profile see your theme.')}
              checked={draft.shareWithVisitors}
              onChange={(shareWithVisitors) => patchDraft({ shareWithVisitors })}
            />
            <ToggleField
              label={t(language, 'Tüm arayüzü boya', 'Paint the whole interface')}
              description={t(language, 'Kapalıyken tema yalnızca profil yüzeylerinde uygulanır.', 'When off, the theme only applies to profile surfaces.')}
              checked={draft.paintWholeApp}
              onChange={(paintWholeApp) => patchDraft({ paintWholeApp })}
            />
          </section>
        </div>

        {/* Sticky preview */}
        <aside className="lg:sticky lg:top-4 space-y-3">
          <p className="text-[11px] font-bold text-zinc-300 flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-amber-400" />
            {t(language, 'Önizleme', 'Preview')}
          </p>
          <ThemePreview theme={draft} user={user} language={language} />
          <p className="text-[10px] text-zinc-500 leading-relaxed">
            {t(
              language,
              'Renk değerleri kaydedilirken doğrulanır; yalnızca geçerli HEX renkleri ve sınırlandırılmış sayısal değerler saklanır.',
              'Values are validated on save: only valid HEX colours and clamped numbers are stored.'
            )}
          </p>
        </aside>
      </div>
    </div>
  );
};
