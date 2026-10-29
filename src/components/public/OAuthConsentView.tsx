/**
 * /oauth/authorize — "X uygulaması Code4Ever hesabına erişmek istiyor" onay ekranı.
 *
 * EKRANIN TEK İŞİ KARARI NETLEŞTİRMEK. Kullanıcı buraya başka bir siteden geliyor ve
 * tanımadığı bir şeye yetki vermesi isteniyor; bu yüzden ekran üç soruyu açıkça
 * yanıtlıyor: kim istiyor, neyi görecek, bunu kim yaptı (uygulamanın sahibi).
 *
 * ONAYIN KENDİSİ BURADA DEĞİL. "İzin ver"e basılınca sunucuya gidiliyor ve kodu sunucu
 * üretiyor; bu bileşen yalnızca dönen adrese yönlendiriyor. Parametrelerin tamamı
 * sunucuda yeniden doğrulanıyor, dolayısıyla buradaki hiçbir değeri kurcalamak bir şey
 * kazandırmıyor.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, Check, Loader2, ShieldCheck } from 'lucide-react';
import {
  approveAuthorization,
  fetchConsentInfo,
  type ConsentInfo
} from '../../services/devAppsClient';

interface OAuthConsentViewProps {
  language: 'tr' | 'en';
  isAuthenticated: boolean;
}

/** Adres çubuğundaki istek parametreleri. */
function readParams() {
  const q = new URLSearchParams(window.location.search);
  return {
    clientId: q.get('client_id') || '',
    redirectUri: q.get('redirect_uri') || '',
    scope: q.get('scope') || 'identify',
    state: q.get('state') || '',
    codeChallenge: q.get('code_challenge') || '',
    codeChallengeMethod: q.get('code_challenge_method') || '',
    responseType: q.get('response_type') || 'code'
  };
}

/**
 * Reddetme, kullanıcıyı uygulamaya geri gönderir — BOŞLUĞA değil.
 *
 * RFC 6749 §4.1.2.1: hata da yönlendirme adresine, `error=access_denied` ile bildirilir.
 * Kullanıcıyı burada bırakmak, uygulamanın hiç haber alamaması ve o tarafta sonsuz bir
 * bekleme ekranı demek olurdu.
 */
function denyUrl(redirectUri: string, state: string): string | null {
  try {
    const url = new URL(redirectUri);
    url.searchParams.set('error', 'access_denied');
    url.searchParams.set('error_description', 'Kullanıcı izin vermedi.');
    if (state) url.searchParams.set('state', state);
    return url.toString();
  } catch {
    return null;
  }
}

export const OAuthConsentView: React.FC<OAuthConsentViewProps> = ({ language, isAuthenticated }) => {
  const tr = language === 'tr';
  const [params] = useState(readParams);
  const [info, setInfo] = useState<ConsentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    if (params.responseType !== 'code') {
      setError(
        tr
          ? 'Yalnızca response_type=code destekleniyor.'
          : 'Only response_type=code is supported.'
      );
      setLoading(false);
      return;
    }
    const result = await fetchConsentInfo({
      clientId: params.clientId,
      redirectUri: params.redirectUri,
      scope: params.scope
    });
    if (result.ok && result.info) setInfo(result.info);
    else setError(result.error || null);
    setLoading(false);
  }, [params, tr]);

  useEffect(() => {
    void load();
  }, [load]);

  const approve = async () => {
    setBusy(true);
    setError(null);
    const result = await approveAuthorization({
      clientId: params.clientId,
      redirectUri: params.redirectUri,
      scope: params.scope,
      state: params.state || undefined,
      codeChallenge: params.codeChallenge || undefined,
      codeChallengeMethod: params.codeChallengeMethod || undefined
    });
    if (!result.ok || !result.redirect) {
      setError(result.error || null);
      setBusy(false);
      return;
    }
    window.location.href = result.redirect;
  };

  const deny = () => {
    const url = denyUrl(params.redirectUri, params.state);
    window.location.href = url || '/';
  };

  const shell = (children: React.ReactNode) => (
    <div className="relative flex min-h-screen items-center justify-center p-5 text-white">
      <div className="c4e-auth-glow pointer-events-none absolute -top-40 left-1/2 h-[40rem] w-[40rem] -translate-x-1/2 rounded-full blur-[140px]" />
      <div className="relative z-10 w-full max-w-md">{children}</div>
    </div>
  );

  if (loading) {
    return shell(
      <div className="c4e-glass flex items-center justify-center gap-2 p-10 text-xs text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        {tr ? 'Uygulama bilgisi alınıyor…' : 'Loading application details…'}
      </div>
    );
  }

  if (error || !info) {
    return shell(
      <div className="c4e-glass p-7 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-300">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h1 className="text-base font-bold text-white">
          {tr ? 'Bu istek tamamlanamaz' : 'This request cannot be completed'}
        </h1>
        <p className="user-text mx-auto mt-2 max-w-xs text-xs leading-relaxed text-zinc-400">
          {error || (tr ? 'Uygulama bilgisi alınamadı.' : 'Could not load the application.')}
        </p>
        {/* Hatayı GÖREN kullanıcı ama ÇÖZEBİLECEK olan geliştirici; bu yüzden mesaj olduğu
            gibi gösteriliyor ve kullanıcıya ne yapacağı söyleniyor. */}
        <p className="mx-auto mt-3 max-w-xs text-[11px] leading-relaxed text-zinc-600">
          {tr
            ? 'Bu genellikle uygulamanın yanlış yapılandırılmasından olur. Uygulamayı yapan kişiye bu mesajı iletebilirsin.'
            : 'This usually means the application is misconfigured. You can pass this message to whoever built it.'}
        </p>
        <a
          href="/"
          className="c4e-btn mx-auto mt-6 flex min-h-11 w-full items-center justify-center px-4 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {tr ? 'Code4Ever’e dön' : 'Back to Code4Ever'}
        </a>
      </div>
    );
  }

  if (!isAuthenticated) {
    return shell(
      <div className="c4e-glass p-7 text-center">
        <h1 className="text-base font-bold text-white">
          {tr ? 'Önce Code4Ever’e giriş yap' : 'Sign in to Code4Ever first'}
        </h1>
        <p className="user-text mx-auto mt-2 max-w-xs text-xs leading-relaxed text-zinc-400">
          {tr
            ? `"${info.app.name}" hesabına erişmek istiyor. İzin verebilmen için önce giriş yapman gerekiyor.`
            : `"${info.app.name}" wants to access your account. Sign in first to decide.`}
        </p>
        {/*
          Giriş sonrası BU SAYFAYA dönülüyor: adres olduğu gibi korunuyor, dolayısıyla
          kullanıcı giriş yapıp geri geldiğinde onay ekranı aynı istekle açılıyor ve
          uygulamanın akışı baştan başlamak zorunda kalmıyor.
        */}
        <a
          href={`/?next=${encodeURIComponent(window.location.pathname + window.location.search)}`}
          className="c4e-btn mx-auto mt-6 flex min-h-11 w-full items-center justify-center px-4 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {tr ? 'Giriş yap' : 'Sign in'}
        </a>
        <button
          type="button"
          onClick={deny}
          className="mx-auto mt-2 min-h-10 w-full rounded-xl border border-white/[0.08] px-4 text-xs font-semibold text-zinc-400 transition-colors hover:text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {tr ? 'Vazgeç' : 'Cancel'}
        </button>
      </div>
    );
  }

  let host = '';
  try {
    host = new URL(params.redirectUri).host;
  } catch {
    host = params.redirectUri;
  }

  return shell(
    <div className="c4e-glass overflow-hidden">
      <div className="flex items-center gap-3.5 border-b border-white/[0.07] px-6 py-5">
        {info.app.logo_url ? (
          <img src={info.app.logo_url} alt="" className="h-12 w-12 flex-none rounded-2xl object-cover" />
        ) : (
          <span className="c4e-mono-av h-12 w-12 flex-none rounded-2xl text-lg" aria-hidden="true">
            {(info.app.name || '?').charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-base font-extrabold text-white">{info.app.name}</h1>
          <p className="truncate text-[11px] text-zinc-500">
            {info.app.owner_username
              ? `${tr ? 'geliştirici' : 'by'} @${info.app.owner_username}`
              : tr
              ? 'üçüncü taraf uygulama'
              : 'third-party application'}
          </p>
        </div>
      </div>

      <div className="space-y-5 px-6 py-6">
        <p className="text-sm leading-relaxed text-zinc-300">
          {tr ? (
            <>
              <strong className="text-white">{info.app.name}</strong>, Code4Ever hesabına erişmek
              istiyor.
            </>
          ) : (
            <>
              <strong className="text-white">{info.app.name}</strong> wants to access your Code4Ever
              account.
            </>
          )}
        </p>

        {info.app.description && (
          <p className="user-text text-xs leading-relaxed text-zinc-500">{info.app.description}</p>
        )}

        <div className="space-y-2">
          <p className="text-[11px] font-bold tracking-wide text-zinc-500">
            {tr ? 'Bu uygulama şunları yapabilecek' : 'This application will be able to'}
          </p>
          <ul className="space-y-1.5">
            {info.scopes.map((scope) => (
              <li key={scope.key} className="flex items-start gap-2.5 c4e-card px-3.5 py-2.5">
                <Check className="mt-0.5 h-3.5 w-3.5 flex-none text-emerald-400" />
                <span className="min-w-0">
                  <span className="block text-[12.5px] text-zinc-200">{tr ? scope.tr : scope.en}</span>
                  <span className="block font-mono text-[10.5px] text-zinc-600">{scope.key}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/*
          Nereye gidileceğini SÖYLEMEK şart. Kullanıcı "izin ver"e bastığında tarayıcı
          başka bir siteye gidiyor; hangi siteye gittiğini önceden görmesi, sahte bir
          uygulamayı tanımasının en pratik yolu.
        */}
        <div className="c4e-well flex items-start gap-2.5 px-3.5 py-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 flex-none text-indigo-300" />
          <p className="text-[11.5px] leading-relaxed text-zinc-400">
            {tr ? (
              <>
                İzin verirsen <strong className="font-mono text-zinc-200">{host}</strong> adresine
                yönlendirileceksin. Şifren bu uygulamayla <strong className="text-zinc-200">hiçbir
                zaman</strong> paylaşılmaz; erişimi istediğin an Ayarlar &gt; Bağlı uygulamalar
                bölümünden kesebilirsin.
              </>
            ) : (
              <>
                You will be redirected to <strong className="font-mono text-zinc-200">{host}</strong>.
                Your password is <strong className="text-zinc-200">never</strong> shared with this
                application, and you can revoke access any time under Settings &gt; Connected
                applications.
              </>
            )}
          </p>
        </div>

        {error && (
          <p className="user-text flex items-start gap-1.5 text-[11.5px] text-rose-300">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-none" />
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={deny}
            disabled={busy}
            className="min-h-11 flex-1 rounded-xl border border-white/[0.08] px-4 text-xs font-semibold text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {tr ? 'Reddet' : 'Deny'}
          </button>
          <button
            type="button"
            onClick={approve}
            disabled={busy}
            className="c4e-btn flex min-h-11 flex-1 items-center justify-center gap-2 px-4 text-xs disabled:cursor-not-allowed cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            <span>{tr ? 'İzin ver' : 'Authorize'}</span>
            {!busy && <ArrowRight className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};
