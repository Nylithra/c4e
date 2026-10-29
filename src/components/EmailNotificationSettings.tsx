import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Mail } from 'lucide-react';
import { apiFetchJson } from '../services/apiClient';

/**
 * Hangi bildirimlerin e-postayla da geleceğini seçtiren panel.
 *
 * Tercihler SUNUCUDAN okunur ve sunucuya yazılır (`/api/me/email-prefs`), doğrudan profile
 * değil. Sebep: gönderime karar veren taraf sunucu ve tercihi de o okuyor; aynı değeri iki
 * ayrı yoldan yazmak, "kapattım ama yine geliyor" sınıfı tutarsızlıkların kaynağı olurdu.
 */

type EmailType =
  | 'comment' | 'message' | 'follow' | 'job_application' | 'group_invite'
  | 'community' | 'like' | 'repost' | 'star' | 'job_listing' | 'project_commit';

interface EmailPrefs {
  enabled: boolean;
  types: Record<EmailType, boolean>;
}

interface Group {
  title: string;
  hint: string;
  items: Array<{ id: EmailType; label: string; description: string }>;
}

/**
 * Sıralama bilinçli: üyenin doğrudan muhatap olduğu, yanıt bekleyen olaylar üstte; yüksek
 * hacimli "hoşuna gitti" bildirimleri altta. Varsayılanlar da bu ayrımı izliyor.
 */
const GROUPS: Group[] = [
  {
    title: 'Sana doğrudan ulaşanlar',
    hint: 'Bunlar genelde bir yanıt bekler; kaçırmak maliyetlidir.',
    items: [
      { id: 'comment', label: 'Gönderine yanıt', description: 'Biri gönderine yorum yazdığında' },
      { id: 'message', label: 'Özel mesaj', description: 'Sana doğrudan mesaj geldiğinde' },
      { id: 'follow', label: 'Yeni takipçi', description: 'Biri seni takip etmeye başladığında' },
      { id: 'group_invite', label: 'Grup daveti', description: 'Bir gruba davet edildiğinde' },
      {
        id: 'project_commit',
        label: 'Takip ettiğin projeler',
        description: 'Takip ettiğin bir projeye yeni commit geldiğinde'
      }
    ]
  },
  {
    title: 'İlanların ve toplulukların',
    hint: 'Sahibi olduğun içerikle ilgili hareketler.',
    items: [
      { id: 'job_application', label: 'İlanına başvuru', description: 'Biri ilanına başvurduğunda' },
      { id: 'community', label: 'Topluluk hareketleri', description: 'Topluluğunla ilgili işlemlerde' },
      { id: 'job_listing', label: 'Yeni ilanlar', description: 'Takip ettiğin alanda ilan açıldığında' }
    ]
  },
  {
    title: 'Etkileşimler',
    hint: 'Hacmi yüksektir. Varsayılan olarak kapalı gelirler; açarsan özet e-postana eklenir.',
    items: [
      { id: 'like', label: 'Beğeni', description: 'Gönderin beğenildiğinde' },
      { id: 'repost', label: 'Yeniden paylaşım', description: 'Gönderin yeniden paylaşıldığında' },
      { id: 'star', label: 'Yıldız', description: 'Gönderine yıldız verildiğinde' }
    ]
  }
];

const Toggle: React.FC<{
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}> = ({ checked, onChange, disabled, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 ${
      checked ? 'bg-blue-600' : 'bg-zinc-700'
    }`}
  >
    <span
      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
        checked ? 'translate-x-[22px]' : 'translate-x-0.5'
      }`}
    />
  </button>
);

export const EmailNotificationSettings: React.FC<{ language: 'tr' | 'en' }> = ({ language }) => {
  const tr = language === 'tr';
  const [prefs, setPrefs] = useState<EmailPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { ok, data } = await apiFetchJson<{ prefs: EmailPrefs; error?: string }>('/api/me/email-prefs');
    if (ok && data?.prefs) setPrefs(data.prefs);
    else setError(tr ? 'Tercihler okunamadı.' : 'Could not load preferences.');
    setLoading(false);
  }, [tr]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Her değişiklik anında kaydedilir; ayrı bir "Kaydet" düğmesi yok.
   * Kaydedilmemiş bir tercihle sayfadan ayrılmak, kullanıcının kapattığını sandığı postaların
   * gelmeye devam etmesi demek olurdu — bu ekranda en pahalı hata tam olarak budur.
   */
  const persist = async (next: EmailPrefs) => {
    const previous = prefs;
    setPrefs(next);
    setSaving(true);
    setError(null);

    const { ok } = await apiFetchJson('/api/me/email-prefs', { method: 'PUT', json: next });
    if (ok) {
      setSavedAt(Date.now());
    } else {
      // Başarısız kaydı ekranda "olmuş" gibi bırakmak yanıltıcı olur: eski hâle dönülür.
      setPrefs(previous);
      setError(tr ? 'Kaydedilemedi. Bağlantını kontrol edip tekrar dene.' : 'Could not save.');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-xs text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{tr ? 'Tercihler yükleniyor...' : 'Loading preferences...'}</span>
      </div>
    );
  }

  if (!prefs) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-red-700/40 bg-red-950/30 p-3 text-xs text-red-300">
        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
        <span className="user-text">{error || (tr ? 'Tercihler okunamadı.' : 'Could not load preferences.')}</span>
      </div>
    );
  }

  const master = prefs.enabled;

  return (
    <div className="space-y-4">
      <div className="c4e-well flex items-start justify-between gap-3 p-3.5">
        <div className="min-w-0 space-y-0.5">
          <p className="flex items-center gap-2 text-xs font-bold text-white">
            <Mail className="h-3.5 w-3.5 text-blue-400" />
            <span>{tr ? 'E-posta bildirimleri' : 'E-mail notifications'}</span>
          </p>
          <p className="user-text text-[11px] leading-relaxed text-zinc-400">
            {tr
              ? 'Bekleyen bildirimlerin tek bir özet e-postada toplanıp gönderilir — her bildirim için ayrı posta gelmez.'
              : 'Pending notifications are collected into a single digest — never one e-mail per notification.'}
          </p>
        </div>
        <Toggle
          checked={master}
          onChange={(next) => persist({ ...prefs, enabled: next })}
          label={tr ? 'E-posta bildirimleri ana anahtarı' : 'E-mail notifications master switch'}
        />
      </div>

      {!master && (
        <p className="user-text rounded-xl border border-white/[0.07] bg-white/[0.04] p-3 text-[11px] leading-relaxed text-zinc-400">
          {tr
            ? 'Ana anahtar kapalı: hiçbir bildirim e-postası gönderilmiyor. Uygulama içi bildirimler etkilenmez.'
            : 'Master switch is off: no notification e-mails are sent. In-app notifications are unaffected.'}
        </p>
      )}

      {GROUPS.map((group) => (
        <div
          key={group.title}
          className={`space-y-2 rounded-xl border border-white/[0.07] p-3.5 transition-opacity ${
            master ? '' : 'pointer-events-none opacity-40'
          }`}
        >
          <div className="space-y-0.5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-300">{group.title}</p>
            <p className="user-text text-[11px] leading-relaxed text-zinc-500">{group.hint}</p>
          </div>

          <div className="divide-y divide-white/[0.06]">
            {group.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white">{item.label}</p>
                  <p className="user-text text-[11px] text-zinc-500">{item.description}</p>
                </div>
                <Toggle
                  checked={prefs.types[item.id] === true}
                  disabled={!master}
                  onChange={(next) =>
                    persist({ ...prefs, types: { ...prefs.types, [item.id]: next } })
                  }
                  label={item.label}
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="flex min-h-5 items-center gap-2 text-[11px]">
        {saving && (
          <span className="flex items-center gap-1.5 text-zinc-400">
            <Loader2 className="h-3 w-3 animate-spin" />
            {tr ? 'Kaydediliyor...' : 'Saving...'}
          </span>
        )}
        {!saving && error && (
          <span className="user-text flex items-center gap-1.5 text-red-400">
            <AlertCircle className="h-3 w-3" />
            {error}
          </span>
        )}
        {!saving && !error && savedAt && (
          <span className="flex items-center gap-1.5 text-emerald-400">
            <CheckCircle2 className="h-3 w-3" />
            {tr ? 'Kaydedildi' : 'Saved'}
          </span>
        )}
      </div>
    </div>
  );
};
