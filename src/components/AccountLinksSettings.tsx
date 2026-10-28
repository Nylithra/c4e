import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Github, KeyRound, Link2, Loader2, Unlink } from 'lucide-react';
import {
  fetchLanuxStatus,
  linkGithub,
  startLanuxFlow,
  unlinkGithub,
  unlinkLanux,
  type LanuxStatus
} from '../services/lanuxClient';

/**
 * Hesaba bağlı kimlikler: Lanux ve GitHub.
 *
 * İkisi burada yan yana duruyor çünkü kullanıcı için aynı soru: "bu hesaba hangi yollardan
 * girebiliyorum ve nelere erişiyorum?" Ayrıca aralarında gerçek bir bağımlılık var — yalnızca
 * Lanux ile giren birinin GitHub kimliği yoktur ve depolarını göremez.
 */
export const AccountLinksSettings: React.FC<{ language: 'tr' | 'en' }> = ({ language }) => {
  const tr = language === 'tr';
  const [status, setStatus] = useState<LanuxStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setStatus(await fetchLanuxStatus());
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Bağlama akışı tam sayfa yönlendirmeyle döndüğü için sonucu adresten okuyoruz.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get('lanux') === 'linked') {
      setNotice(tr ? 'Lanux hesabınız bağlandı.' : 'Your Lanux account is linked.');
      const url = new URL(window.location.href);
      url.searchParams.delete('lanux');
      window.history.replaceState({}, '', url.toString());
    }

    // GitHub yetkilendirmesinden dönüş. Kimlik artık auth kaydında, ama profildeki
    // github_username'i yalnızca sunucu yazabilir; bağlamayı burada tamamlıyoruz.
    if (params.get('github') === 'linking') {
      const url = new URL(window.location.href);
      url.searchParams.delete('github');
      window.history.replaceState({}, '', url.toString());

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

  const handleLink = async () => {
    setBusy(true);
    setError(null);
    const result = await startLanuxFlow('link');
    if (!result.ok) {
      setError(result.error || (tr ? 'Bağlantı başlatılamadı.' : 'Could not start linking.'));
      setBusy(false);
    }
  };

  const handleUnlink = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await unlinkLanux();
    if (!result.ok) setError(result.error || null);
    else setNotice(tr ? 'Lanux bağlantısı kaldırıldı.' : 'Lanux account unlinked.');
    setBusy(false);
    await load();
  };

  const handleGithubLink = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await linkGithub();

    // Yetkilendirmeye gidiliyorsa sayfa birazdan gidecek; "bağlandı" demek yanlış olurdu.
    if (result.redirecting) return;

    if (!result.ok) setError(result.error || null);
    else setNotice(tr ? 'GitHub hesabınız bağlandı.' : 'GitHub account linked.');
    setBusy(false);
    await load();
  };

  const handleGithubUnlink = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await unlinkGithub();
    if (!result.ok) setError(result.error || null);
    else setNotice(tr ? 'GitHub bağlantısı kaldırıldı.' : 'GitHub account unlinked.');
    setBusy(false);
    await load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-xs text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{tr ? 'Bağlantılar yükleniyor...' : 'Loading links...'}</span>
      </div>
    );
  }

  const lanuxLinked = status?.lanux?.linked === true;
  const githubLinked = status?.github?.linked === true;
  // Bu kişi için GitHub bağlamak zorunlu: başka kimliği yok, dolayısıyla depolarına erişemez.
  const githubRequired = lanuxLinked && !githubLinked;

  return (
    <div className="space-y-4">
      {/* LANUX */}
      <div className="rounded-xl border border-white/[0.07] bg-black/25 p-3.5 space-y-3">
        {/*
          Telefonda alt alta. Yan yana dizildiğinde düğme genişliğin yarısını alıyor ve
          açıklama dört satıra sıkışıyordu; kartın anlattığı şey tam da o açıklama.
        */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-0.5">
            <p className="flex items-center gap-2 text-xs font-bold text-white">
              <KeyRound className="h-3.5 w-3.5 text-indigo-400" />
              <span>Lanux</span>
              {lanuxLinked && (
                <span className="flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  {tr ? 'Bağlı' : 'Linked'}
                </span>
              )}
            </p>
            <p className="user-text text-[11px] leading-relaxed text-zinc-400">
              {lanuxLinked
                ? tr
                  ? `Lanux hesabınla giriş yapabilirsin${status?.lanux?.username ? ` (@${status.lanux.username})` : ''}.`
                  : `You can sign in with your Lanux account${status?.lanux?.username ? ` (@${status.lanux.username})` : ''}.`
                : tr
                ? 'Lanux hesabını bağlayınca bu hesaba Lanux ile de giriş yapabilirsin.'
                : 'Link Lanux to sign in to this account with it as well.'}
            </p>
          </div>

          {lanuxLinked ? (
            <button
              type="button"
              onClick={handleUnlink}
              disabled={busy}
              className="flex min-h-11 flex-shrink-0 items-center justify-center gap-1.5 rounded-xl border border-white/[0.07] px-3 text-xs font-semibold text-zinc-300 transition-colors hover:text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Unlink className="h-3.5 w-3.5" />
              <span>{tr ? 'Kaldır' : 'Unlink'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleLink}
              disabled={busy || status?.configured === false}
              className="brand-gradient flex min-h-11 flex-shrink-0 items-center justify-center gap-1.5 rounded-xl px-3.5 text-xs font-bold shadow-lg transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              <span>{tr ? 'Lanux hesabı bağla' : 'Link Lanux'}</span>
            </button>
          )}
        </div>

        {status?.configured === false && (
          <p className="user-text text-[11px] leading-relaxed text-amber-300/90">{status.reason}</p>
        )}
      </div>

      {/* GITHUB */}
      <div
        className={`rounded-xl border p-3.5 space-y-3 ${
          githubRequired ? 'border-amber-700/50 bg-amber-950/20' : 'border-white/[0.07] bg-black/25'
        }`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-0.5">
            <p className="flex items-center gap-2 text-xs font-bold text-white">
              <Github className="h-3.5 w-3.5 text-zinc-300" />
              <span>GitHub</span>
              {githubLinked && (
                <span className="flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  {tr ? 'Bağlı' : 'Linked'}
                </span>
              )}
            </p>
            <p className="user-text text-[11px] leading-relaxed text-zinc-400">
              {githubLinked
                ? tr
                  ? `Depoların profilinde gösterilebilir (@${status?.github?.username}).`
                  : `Your repositories can be shown on your profile (@${status?.github?.username}).`
                : githubRequired
                ? tr
                  ? 'Lanux ile giriş yaptın, bu yüzden hesabında GitHub kimliği yok. Depolarını görebilmek için GitHub hesabını bağla.'
                  : 'You signed in with Lanux, so this account has no GitHub identity. Link your GitHub account to see your repositories.'
                : tr
                ? 'Depolarını profilinde göstermek için GitHub hesabını bağla.'
                : 'Link your GitHub account to show your repositories.'}
            </p>
          </div>

          {githubLinked ? (
            <button
              type="button"
              onClick={handleGithubUnlink}
              disabled={busy}
              className="flex min-h-11 flex-shrink-0 items-center justify-center gap-1.5 rounded-xl border border-white/[0.07] px-3 text-xs font-semibold text-zinc-300 transition-colors hover:text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Unlink className="h-3.5 w-3.5" />
              <span>{tr ? 'Kaldır' : 'Unlink'}</span>
            </button>
          ) : (
            /*
              Girişteki düğmenin aynısı: kullanıcı adı yazılmıyor, GitHub'a gidiliyor ve
              sahipliği GitHub kanıtlıyor.
            */
            <button
              type="button"
              onClick={handleGithubLink}
              disabled={busy}
              className="flex min-h-11 flex-shrink-0 items-center justify-center gap-1.5 rounded-xl bg-zinc-100 px-3.5 text-xs font-bold text-zinc-950 transition-colors hover:bg-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Github className="h-3.5 w-3.5" />}
              <span>{tr ? 'GitHub ile bağla' : 'Link with GitHub'}</span>
            </button>
          )}
        </div>
      </div>

      <div className="min-h-5 text-[11px]">
        {error && (
          <span className="user-text flex items-center gap-1.5 text-red-400">
            <AlertCircle className="h-3 w-3 flex-shrink-0" />
            {error}
          </span>
        )}
        {!error && notice && (
          <span className="flex items-center gap-1.5 text-emerald-400">
            <CheckCircle2 className="h-3 w-3" />
            {notice}
          </span>
        )}
      </div>
    </div>
  );
};
