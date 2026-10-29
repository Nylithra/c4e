/**
 * Hesaba bağlı kimlikler: GitHub ve Jubbio.
 *
 * İkisi burada yan yana duruyor çünkü kullanıcı için aynı soru: "bu hesaba hangi hesaplarım
 * bağlı ve ne kazandırıyorlar?" Ama rolleri AYNI DEĞİL ve kart metinleri bunu söylüyor:
 * GitHub depoları profilde göstermeye yarıyor, Jubbio ise yalnızca bir kimlik işareti.
 *
 * Her iki akış da tam sayfa yönlendirmeyle dönüyor, bu yüzden sonuç adres çubuğundan
 * okunuyor: GitHub'da `?github=linking`, Jubbio'da `?jubbio=linked`.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Github, Loader2, Unlink } from 'lucide-react';
import {
  fetchAccountLinks,
  linkGithub,
  startJubbioLink,
  unlinkGithub,
  unlinkJubbio,
  type AccountLinks
} from '../services/accountLinks';

/**
 * Tek bir bağlantı kartı.
 *
 * İki kart arasında yalnızca ikon, metin ve çağrılan işlev değişiyordu; markup'ı iki kez
 * yazmak, birinde yapılan bir düzeltmenin ötekinde kalmasının en kısa yolu.
 */
const LinkCard: React.FC<{
  icon: React.ReactNode;
  name: string;
  linked: boolean;
  handle?: string | null;
  description: string;
  linkLabel: string;
  unlinkLabel: string;
  disabled?: boolean;
  busy?: boolean;
  note?: string | null;
  onLink: () => void;
  onUnlink: () => void;
}> = ({
  icon,
  name,
  linked,
  handle,
  description,
  linkLabel,
  unlinkLabel,
  disabled,
  busy,
  note,
  onLink,
  onUnlink
}) => (
  <div className="c4e-card p-4 space-y-3">
    {/* Telefonda alt alta: yan yana dizildiğinde düğme genişliğin yarısını alıyor ve
        kartın anlattığı açıklama dört satıra sıkışıyordu. */}
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-white/[0.06] text-zinc-200">
          {icon}
        </span>
        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-white">
            <span>{name}</span>
            {linked && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                <CheckCircle2 className="h-2.5 w-2.5" />
                {handle ? `@${handle}` : 'Bağlı'}
              </span>
            )}
          </p>
          <p className="user-text text-[11.5px] leading-relaxed text-zinc-400">{description}</p>
        </div>
      </div>

      {linked ? (
        <button
          type="button"
          onClick={onUnlink}
          disabled={busy}
          className="flex min-h-10 flex-none items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] px-3.5 text-xs font-semibold text-zinc-300 transition-colors hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-200 disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Unlink className="h-3.5 w-3.5" />
          <span>{unlinkLabel}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={onLink}
          disabled={busy || disabled}
          className="c4e-btn flex min-h-10 flex-none items-center justify-center gap-2 px-4 text-xs disabled:cursor-not-allowed cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
          <span>{linkLabel}</span>
        </button>
      )}
    </div>

    {note && <p className="user-text text-[11px] leading-relaxed text-amber-300/90">{note}</p>}
  </div>
);

/** Jubbio'nun lucide'de ikonu yok; tasarım dilinin harf işaretini kullanıyoruz. */
const JubbioMark: React.FC = () => (
  <span className="c4e-mono-av h-5 w-5 rounded-md text-[11px]" aria-hidden="true">
    J
  </span>
);

export const AccountLinksSettings: React.FC<{ language: 'tr' | 'en' }> = ({ language }) => {
  const tr = language === 'tr';
  const [links, setLinks] = useState<AccountLinks | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLinks(await fetchAccountLinks());
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Bağlama akışları tam sayfa yönlendirmeyle döndüğü için sonucu adresten okuyoruz.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const clean = (key: string) => {
      const url = new URL(window.location.href);
      url.searchParams.delete(key);
      window.history.replaceState({}, '', url.toString());
    };

    if (params.get('jubbio') === 'linked') {
      clean('jubbio');
      setNotice(tr ? 'Jubbio hesabınız bağlandı.' : 'Your Jubbio account is linked.');
    }

    // GitHub yetkilendirmesinden dönüş. Kimlik artık auth kaydında, ama profildeki
    // github_username'i yalnızca sunucu yazabilir; bağlamayı burada tamamlıyoruz.
    if (params.get('github') === 'linking') {
      clean('github');
      void (async () => {
        setBusy(true);
        const result = await linkGithub();
        if (!result.ok) setError(result.error || null);
        else setNotice(tr ? 'GitHub hesabınız bağlandı.' : 'GitHub account linked.');
        setBusy(false);
        await load();
      })();
    }
  }, [tr, load]);

  /**
   * Her eylem aynı kalıbı izliyor: meşgul işaretle, mesajları temizle, çalıştır, sonucu
   * göster, durumu yeniden oku. `redirecting` dönen bir eylemde durum sıfırlanmıyor —
   * sayfa birazdan gidiyor ve "bitti" demek yanlış olurdu.
   */
  const run = async (
    action: () => Promise<{ ok: boolean; error?: string; redirecting?: boolean }>,
    successMessage: string
  ) => {
    setBusy(true);
    setError(null);
    setNotice(null);

    const result = await action();
    if (result.redirecting) return;

    if (!result.ok) setError(result.error || null);
    else setNotice(successMessage);
    setBusy(false);
    await load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-10 text-xs text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{tr ? 'Bağlantılar yükleniyor…' : 'Loading links…'}</span>
      </div>
    );
  }

  const githubLinked = links?.github?.linked === true;
  const jubbioLinked = links?.jubbio?.linked === true;

  return (
    <div className="space-y-3">
      <LinkCard
        icon={<Github className="h-4 w-4" />}
        name="GitHub"
        linked={githubLinked}
        handle={links?.github?.username}
        description={
          githubLinked
            ? tr
              ? 'Depoların profilinde gösterilebilir ve projelerine depo bağlayabilirsin.'
              : 'Your repositories can be shown on your profile and linked to your projects.'
            : tr
            ? 'Depolarını profilinde göstermek ve projelerine depo bağlamak için GitHub hesabını bağla.'
            : 'Link GitHub to show your repositories and attach them to your projects.'
        }
        linkLabel={tr ? 'GitHub ile bağla' : 'Link with GitHub'}
        unlinkLabel={tr ? 'Kaldır' : 'Unlink'}
        busy={busy}
        onLink={() =>
          void run(linkGithub, tr ? 'GitHub hesabınız bağlandı.' : 'GitHub account linked.')
        }
        onUnlink={() =>
          void run(unlinkGithub, tr ? 'GitHub bağlantısı kaldırıldı.' : 'GitHub account unlinked.')
        }
      />

      <LinkCard
        icon={<JubbioMark />}
        name="Jubbio"
        linked={jubbioLinked}
        handle={links?.jubbio?.username}
        description={
          jubbioLinked
            ? tr
              ? 'Jubbio hesabın profilinde doğrulanmış olarak görünüyor.'
              : 'Your Jubbio account appears verified on your profile.'
            : tr
            ? 'Jubbio hesabını bağlayınca profilinde doğrulanmış olarak görünür.'
            : 'Link your Jubbio account to show it as verified on your profile.'
        }
        linkLabel={tr ? 'Jubbio hesabı bağla' : 'Link Jubbio'}
        unlinkLabel={tr ? 'Kaldır' : 'Unlink'}
        busy={busy}
        disabled={links?.jubbioConfigured === false}
        note={links?.jubbioConfigured === false ? links?.jubbioReason || null : null}
        onLink={() =>
          void run(startJubbioLink, tr ? 'Jubbio hesabınız bağlandı.' : 'Jubbio account linked.')
        }
        onUnlink={() =>
          void run(unlinkJubbio, tr ? 'Jubbio bağlantısı kaldırıldı.' : 'Jubbio account unlinked.')
        }
      />

      <div className="min-h-5 text-[11px]">
        {error && (
          <span className="user-text flex items-start gap-1.5 text-rose-300">
            <AlertCircle className="mt-0.5 h-3 w-3 flex-shrink-0" />
            {error}
          </span>
        )}
        {!error && notice && (
          <span className="flex items-center gap-1.5 text-emerald-300">
            <CheckCircle2 className="h-3 w-3" />
            {notice}
          </span>
        )}
      </div>
    </div>
  );
};
