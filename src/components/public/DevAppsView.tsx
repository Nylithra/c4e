/**
 * /dev/apps — geliştiricinin Code4Ever uygulamalarını yönettiği ekran.
 *
 * Buradan çıkan `client_id` + `client_secret` çiftiyle bir uygulama, üyelerin İZNİYLE
 * onların adına Code4Ever verisine erişiyor ("Code4Ever ile giriş yap").
 *
 * EKRANIN TAŞIDIĞI TEK ZOR KARAR: İSTEMCİ SIRRI
 *
 * Sır sunucuda yalnızca SHA-256 özeti olarak duruyor; düz metin hâli tek bir yanıtta, bir
 * kez geçiyor ve hiçbir yere kaydedilmiyor. Bu yüzden ekran onu KAPATILABİLİR BİR PANELDE
 * gösteriyor ve kapatmadan önce ne olduğunu açıkça söylüyor. Saklamak (localStorage) bir
 * kolaylık gibi görünürdü ama sırrı her XSS'e açık hâle getirirdi.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  Eye,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X
} from 'lucide-react';
import { PublicPageShell, Section } from './PublicPageShell';
import {
  createApp,
  deleteApp,
  fetchApps,
  fetchScopes,
  rotateSecret,
  updateApp,
  type AppDraft,
  type DevApp,
  type ScopeInfo
} from '../../services/devAppsClient';

interface DevAppsViewProps {
  language: 'tr' | 'en';
  isAuthenticated: boolean;
}

/** Panoya kopyalayan küçük düğme; başarıyı iki saniye gösteriyor. */
const CopyButton: React.FC<{ value: string; label: string }> = ({ value, label }) => {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          // Pano güvensiz kaynakta ya da izin verilmediğinde hata fırlatır; değer zaten
          // ekranda, elle seçilebiliyor.
        }
      }}
      aria-label={label}
      title={label}
      className="flex min-h-9 min-w-9 flex-none items-center justify-center rounded-lg border border-white/[0.08] text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {done ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
};

/** Etiketli, kopyalanabilir tek satırlık değer. */
const Field: React.FC<{ label: string; value: string; mono?: boolean; copyLabel: string }> = ({
  label,
  value,
  mono = true,
  copyLabel
}) => (
  <div className="space-y-1">
    <p className="text-[10px] font-bold tracking-wide text-zinc-500">{label}</p>
    <div className="flex items-center gap-2">
      <code
        className={`c4e-code min-w-0 flex-1 overflow-x-auto whitespace-nowrap px-3 py-2 text-[11.5px] text-zinc-200 ${
          mono ? 'font-mono' : ''
        }`}
      >
        {value}
      </code>
      <CopyButton value={value} label={copyLabel} />
    </div>
  </div>
);

/**
 * Üretilen sırrı gösteren panel.
 *
 * Kapatılabilir ve kapandıktan sonra geri getirilemez — tam olarak sunucudaki durumun
 * aynısı. "Tekrar göster" düğmesi koymak, sırrın bir yerde saklandığı izlenimi verirdi.
 */
const SecretPanel: React.FC<{ secret: string; tr: boolean; onClose: () => void }> = ({
  secret,
  tr,
  onClose
}) => (
  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-4 space-y-3">
    <div className="flex items-start justify-between gap-3">
      <p className="flex items-center gap-2 text-sm font-bold text-amber-200">
        <KeyRound className="h-4 w-4 flex-none" />
        {tr ? 'İstemci sırrın' : 'Your client secret'}
      </p>
      <button
        type="button"
        onClick={onClose}
        aria-label={tr ? 'Kapat' : 'Close'}
        className="flex min-h-9 min-w-9 flex-none items-center justify-center rounded-lg text-amber-200/70 transition-colors hover:bg-white/[0.06] hover:text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" />
      </button>
    </div>

    <Field
      label="client_secret"
      value={secret}
      copyLabel={tr ? 'İstemci sırrını kopyala' : 'Copy client secret'}
    />

    <p className="text-[11.5px] leading-relaxed text-amber-200/90">
      {tr
        ? 'Bu değer yalnızca şimdi görünüyor. Sunucuda sadece özeti saklanıyor, dolayısıyla biz de geri getiremeyiz. Kaybedersen yenisini üretmen gerekir. Sırrı tarayıcıda çalışan bir koda KOYMA: oradan okunabilir.'
        : 'This value is shown only now. The server keeps just a hash of it, so we cannot recover it either. If you lose it, generate a new one. Never put the secret in browser-side code: it can be read from there.'}
    </p>
  </div>
);

/** Uygulama oluşturma / düzenleme formu. */
const AppForm: React.FC<{
  tr: boolean;
  scopeList: ScopeInfo[];
  initial?: DevApp | null;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (draft: AppDraft) => void;
}> = ({ tr, scopeList, initial, busy, onCancel, onSubmit }) => {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [website, setWebsite] = useState(initial?.website_url || '');
  const [redirects, setRedirects] = useState((initial?.redirect_uris || []).join('\n'));
  const [scopes, setScopes] = useState<string[]>(initial?.scopes || ['identify']);

  const toggleScope = (key: string) => {
    setScopes((current) => {
      // `identify` çıkarılamıyor: bir uygulamanın kullanıcıyı hiç tanımadan erişim
      // istemesinin anlamı yok ve kaynak uçlarının tamamı kimliğe dayanıyor.
      if (key === 'identify') return current;
      return current.includes(key) ? current.filter((s) => s !== key) : [...current, key];
    });
  };

  return (
    <form
      className="c4e-card space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          name: name.trim(),
          description: description.trim(),
          website_url: website.trim(),
          redirect_uris: redirects
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
          scopes
        });
      }}
    >
      <div className="space-y-1.5">
        <label htmlFor="app-name" className="block text-[11px] font-bold tracking-wide text-zinc-500">
          {tr ? 'Uygulama adı' : 'Application name'}
        </label>
        <input
          id="app-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          required
          placeholder={tr ? 'Örn. Benim Botum' : 'e.g. My Bot'}
          className="c4e-input min-h-11 w-full px-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="text-[11px] text-zinc-600">
          {tr
            ? 'Onay ekranında üyeye bu ad gösterilir.'
            : 'This name is shown to members on the consent screen.'}
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="app-desc" className="block text-[11px] font-bold tracking-wide text-zinc-500">
          {tr ? 'Kısa açıklama' : 'Short description'}
        </label>
        <input
          id="app-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={300}
          placeholder={tr ? 'Uygulaman ne yapıyor?' : 'What does your app do?'}
          className="c4e-input min-h-11 w-full px-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="app-site" className="block text-[11px] font-bold tracking-wide text-zinc-500">
          {tr ? 'Web sitesi (isteğe bağlı)' : 'Website (optional)'}
        </label>
        <input
          id="app-site"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://..."
          className="c4e-input min-h-11 w-full px-3 font-mono text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="app-redirects" className="block text-[11px] font-bold tracking-wide text-zinc-500">
          {tr ? 'Yönlendirme adresleri' : 'Redirect URIs'}
        </label>
        <textarea
          id="app-redirects"
          value={redirects}
          onChange={(e) => setRedirects(e.target.value)}
          rows={3}
          required
          placeholder={'https://uygulamam.com/oauth/callback\nhttp://localhost:3000/callback'}
          className="c4e-input w-full resize-y px-3 py-2.5 font-mono text-[12px] leading-relaxed text-white placeholder:text-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="text-[11px] leading-relaxed text-zinc-600">
          {tr
            ? 'Her satıra bir adres. TAM EŞLEŞME aranır, joker yok — yetkilendirme kodu yalnızca buradaki adreslerden birine gönderilir. https zorunlu; yerel geliştirmede http://localhost kabul edilir.'
            : 'One address per line. Matched EXACTLY, no wildcards — the authorization code is only sent to one of these. https is required; http://localhost is accepted for local development.'}
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-bold tracking-wide text-zinc-500">
          {tr ? 'İstenebilecek izinler' : 'Requestable scopes'}
        </p>
        <div className="space-y-1.5">
          {scopeList.map((scope) => {
            const on = scopes.includes(scope.key);
            const locked = scope.key === 'identify';
            return (
              <label
                key={scope.key}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                  on ? 'border-indigo-400/40 bg-indigo-500/[0.1]' : 'border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.05]'
                } ${locked ? 'cursor-default opacity-90' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  disabled={locked}
                  onChange={() => toggleScope(scope.key)}
                  className="mt-0.5 h-4 w-4 flex-none accent-indigo-500"
                />
                <span className="min-w-0">
                  <span className="block font-mono text-[12px] font-bold text-zinc-100">{scope.key}</span>
                  <span className="block text-[11.5px] leading-relaxed text-zinc-500">
                    {tr ? scope.tr : scope.en}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        <p className="text-[11px] leading-relaxed text-zinc-600">
          {tr
            ? 'Uygulaman yalnızca burada seçtiğin izinleri isteyebilir. Kullanıcı yine de onaylamak zorunda.'
            : 'Your app can only request the scopes selected here. The member still has to approve.'}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="submit"
          disabled={busy}
          className="c4e-btn flex min-h-11 items-center gap-2 px-4 text-xs disabled:cursor-not-allowed cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          <span>{initial ? (tr ? 'Kaydet' : 'Save') : tr ? 'Uygulamayı oluştur' : 'Create application'}</span>
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="min-h-11 rounded-xl border border-white/[0.08] px-4 text-xs font-semibold text-zinc-400 transition-colors hover:text-white disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {tr ? 'Vazgeç' : 'Cancel'}
        </button>
      </div>
    </form>
  );
};

export const DevAppsView: React.FC<DevAppsViewProps> = ({ language, isAuthenticated }) => {
  const tr = language === 'tr';
  const [apps, setApps] = useState<DevApp[]>([]);
  const [limit, setLimit] = useState(10);
  const [scopeList, setScopeList] = useState<ScopeInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://app.lanux.online';

  const load = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [result, scopes] = await Promise.all([fetchApps(), fetchScopes()]);
    setScopeList(scopes);
    if (result) {
      setApps(result.apps);
      setLimit(result.limit);
    }
    setLoading(false);
  }, [isAuthenticated]);

  useEffect(() => {
    void load();
  }, [load]);

  const editing = useMemo(() => apps.find((a) => a.id === editingId) || null, [apps, editingId]);

  const handleCreate = async (draft: AppDraft) => {
    setBusy(true);
    setError(null);
    const result = await createApp(draft);
    setBusy(false);
    if (!result.ok) {
      setError(result.error || null);
      return;
    }
    setCreating(false);
    setSecret(result.clientSecret || null);
    await load();
  };

  const handleUpdate = async (draft: AppDraft) => {
    if (!editing) return;
    setBusy(true);
    setError(null);
    const result = await updateApp(editing.id, draft);
    setBusy(false);
    if (!result.ok) {
      setError(result.error || null);
      return;
    }
    setEditingId(null);
    await load();
  };

  const handleRotate = async (app: DevApp) => {
    setBusy(true);
    setError(null);
    const result = await rotateSecret(app.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error || null);
      return;
    }
    setSecret(result.clientSecret || null);
    await load();
  };

  const handleDelete = async (app: DevApp) => {
    setBusy(true);
    setError(null);
    const done = await deleteApp(app.id);
    setBusy(false);
    setConfirmDelete(null);
    if (!done) {
      setError(tr ? 'Uygulama kapatılamadı.' : 'Could not close the application.');
      return;
    }
    await load();
  };

  return (
    <PublicPageShell
      language={language}
      eyebrow="/dev/apps"
      title={tr ? 'Uygulamalarım' : 'My applications'}
      subtitle={
        tr
          ? 'Code4Ever API\'sini kullanan uygulamalarını buradan açıyor ve yönetiyorsun. Bir uygulama, üyenin izniyle onun adına Code4Ever verisine erişebilir.'
          : 'Create and manage the applications that use the Code4Ever API. An application can access a member\'s Code4Ever data with their permission.'
      }
    >
      {!isAuthenticated ? (
        <Section id="giris" title={tr ? 'Önce giriş yap' : 'Sign in first'}>
          <div className="c4e-empty px-6 py-14 text-center">
            <p className="text-sm font-bold text-zinc-300">
              {tr ? 'Bu sayfa oturum gerektiriyor' : 'This page needs a session'}
            </p>
            <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-zinc-500">
              {tr
                ? 'Uygulamalar hesabına bağlı. Giriş yaptıktan sonra buraya geri dönebilirsin.'
                : 'Applications belong to your account. Sign in and come back to this page.'}
            </p>
            <a
              href="/"
              className="c4e-btn mx-auto mt-5 flex min-h-11 w-fit items-center px-5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {tr ? 'Giriş yap' : 'Sign in'}
            </a>
          </div>
        </Section>
      ) : (
        <>
          <Section id="uygulamalar" title={tr ? 'Uygulamalar' : 'Applications'}>
            {secret && <SecretPanel secret={secret} tr={tr} onClose={() => setSecret(null)} />}

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-3 text-[11.5px] leading-relaxed text-rose-200">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-none" />
                <span>{error}</span>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center gap-2 py-14 text-xs text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                {tr ? 'Uygulamalar yükleniyor…' : 'Loading applications…'}
              </div>
            ) : (
              <div className="space-y-3">
                {apps.length === 0 && !creating && (
                  <div className="c4e-empty px-6 py-14 text-center">
                    <div className="c4e-card mx-auto mb-3 flex h-12 w-12 items-center justify-center text-zinc-600">
                      <KeyRound className="h-5 w-5" />
                    </div>
                    <p className="text-sm font-bold text-zinc-300">
                      {tr ? 'Henüz uygulaman yok' : 'No applications yet'}
                    </p>
                    <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-zinc-500">
                      {tr
                        ? 'İlk uygulamanı oluştur; client_id ve client_secret hemen üretilir.'
                        : 'Create your first application; the client_id and client_secret are generated right away.'}
                    </p>
                  </div>
                )}

                {apps.map((app) =>
                  editingId === app.id ? (
                    <AppForm
                      key={app.id}
                      tr={tr}
                      scopeList={scopeList}
                      initial={app}
                      busy={busy}
                      onCancel={() => setEditingId(null)}
                      onSubmit={handleUpdate}
                    />
                  ) : (
                    <article key={app.id} className="c4e-card space-y-4 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-bold text-white">{app.name}</h3>
                          {app.description && (
                            <p className="user-text mt-1 text-[11.5px] leading-relaxed text-zinc-400">
                              {app.description}
                            </p>
                          )}
                          <p className="mt-1.5 font-mono text-[11px] text-zinc-600">
                            {tr ? 'istek' : 'requests'}: {app.request_count}
                            {app.last_used_at
                              ? ` · ${tr ? 'son kullanım' : 'last used'} ${new Date(
                                  app.last_used_at
                                ).toLocaleDateString(tr ? 'tr-TR' : 'en-US')}`
                              : ` · ${tr ? 'henüz kullanılmadı' : 'never used'}`}
                          </p>
                        </div>

                        <div className="flex flex-none gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingId(app.id)}
                            title={tr ? 'Düzenle' : 'Edit'}
                            aria-label={tr ? `${app.name} uygulamasını düzenle` : `Edit ${app.name}`}
                            className="flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-white/[0.08] text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleRotate(app)}
                            disabled={busy}
                            title={tr ? 'Yeni istemci sırrı üret' : 'Generate a new client secret'}
                            aria-label={tr ? `${app.name} için yeni sır üret` : `Rotate secret for ${app.name}`}
                            className="flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-white/[0.08] text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(app.id)}
                            disabled={busy}
                            title={tr ? 'Uygulamayı kapat' : 'Close the application'}
                            aria-label={tr ? `${app.name} uygulamasını kapat` : `Close ${app.name}`}
                            className="flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-white/[0.08] text-zinc-400 transition-colors hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/*
                        Silme ONAY İSTİYOR. Kapatmak, uygulamaya verilmiş bütün izinleri ve
                        belirteçleri siliyor — tek tıkla geri alınamaz bir iş.
                      */}
                      {confirmDelete === app.id && (
                        <div className="rounded-xl border border-rose-500/30 bg-rose-500/[0.08] p-3.5 space-y-2.5">
                          <p className="text-[11.5px] leading-relaxed text-rose-200">
                            {tr
                              ? `"${app.name}" kapatılsın mı? Bu uygulamaya izin vermiş herkesin erişimi anında kesilir ve geri alınamaz.`
                              : `Close "${app.name}"? Everyone who authorized it loses access immediately, and this cannot be undone.`}
                          </p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => void handleDelete(app)}
                              disabled={busy}
                              className="flex min-h-9 items-center gap-1.5 rounded-lg bg-rose-500/90 px-3 text-[11px] font-bold text-white transition-colors hover:bg-rose-500 disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              {tr ? 'Evet, kapat' : 'Yes, close it'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(null)}
                              className="min-h-9 rounded-lg border border-white/[0.08] px-3 text-[11px] font-semibold text-zinc-300 transition-colors hover:text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {tr ? 'Vazgeç' : 'Cancel'}
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="space-y-2.5">
                        <Field
                          label="client_id"
                          value={app.client_id}
                          copyLabel={tr ? 'client_id kopyala' : 'Copy client_id'}
                        />
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold tracking-wide text-zinc-500">client_secret</p>
                          <p className="flex items-center gap-2 font-mono text-[11.5px] text-zinc-500">
                            <Eye className="h-3.5 w-3.5 flex-none opacity-50" />
                            <span>{app.client_secret_prefix}…</span>
                            <span className="font-sans text-[11px] text-zinc-600">
                              {tr
                                ? '— tam değeri yalnızca üretildiği anda görünür'
                                : '— the full value is visible only when generated'}
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {app.scopes.map((scope) => (
                          <span
                            key={scope}
                            className="rounded-full bg-white/[0.06] px-2.5 py-1 font-mono text-[10.5px] text-zinc-300"
                          >
                            {scope}
                          </span>
                        ))}
                      </div>

                      <div className="space-y-1">
                        <p className="text-[10px] font-bold tracking-wide text-zinc-500">
                          {tr ? 'Yönlendirme adresleri' : 'Redirect URIs'}
                        </p>
                        <ul className="space-y-1">
                          {app.redirect_uris.map((uri) => (
                            <li key={uri} className="truncate font-mono text-[11.5px] text-zinc-400">
                              {uri}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </article>
                  )
                )}

                {creating ? (
                  <AppForm
                    tr={tr}
                    scopeList={scopeList}
                    busy={busy}
                    onCancel={() => setCreating(false)}
                    onSubmit={handleCreate}
                  />
                ) : (
                  apps.length < limit && (
                    <button
                      type="button"
                      onClick={() => {
                        setCreating(true);
                        setEditingId(null);
                      }}
                      className="c4e-btn flex min-h-11 items-center gap-2 px-4 text-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Plus className="h-4 w-4" />
                      {tr ? 'Yeni uygulama' : 'New application'}
                    </button>
                  )
                )}

                {apps.length >= limit && (
                  <p className="text-[11px] text-zinc-600">
                    {tr
                      ? `Uygulama sınırına ulaştın (${limit}). Kullanmadığın birini kapatarak yer açabilirsin.`
                      : `You reached the application limit (${limit}). Close one you no longer use to make room.`}
                  </p>
                )}
              </div>
            )}
          </Section>

          <Section id="nasil" title={tr ? 'Buradan sonrası' : 'What comes next'}>
            <div className="c4e-card space-y-3 p-5 text-[12.5px] leading-relaxed text-zinc-400">
              <p>
                {tr
                  ? 'Uygulamanı oluşturduktan sonra kullanıcıyı şu adrese gönder; o da izin verdiğinde senin yönlendirme adresine bir kod düşer:'
                  : 'Once your application exists, send the user here; when they approve, a code lands on your redirect URI:'}
              </p>
              <code className="c4e-code block overflow-x-auto whitespace-pre px-3.5 py-3 font-mono text-[11.5px] text-zinc-200">
                {`${origin}/oauth/authorize?client_id=...&redirect_uri=...&scope=identify&state=...`}
              </code>
              <p>
                {tr ? 'Akışın tamamı ve örnek kod: ' : 'The full flow and sample code: '}
                <a href="/dev/docs#oauth" className="text-indigo-300 underline-offset-2 hover:underline">
                  /dev/docs
                </a>
              </p>
            </div>
          </Section>
        </>
      )}
    </PublicPageShell>
  );
};
