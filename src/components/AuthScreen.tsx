/**
 * Giriş ekranı — Aurora tasarım diliyle sıfırdan.
 *
 * ESKİ EKRANIN SORUNU hiyerarşi değil, hiyerarşinin YOKLUĞUYDU: dört özellik kutusu, iki
 * büyük giriş düğmesi ve bir misafir düğmesi aynı ağırlıkta üst üste diziliyordu, bu yüzden
 * gözün gideceği bir yer yoktu. Burada ekran iki işe bölündü:
 *
 *   SOL (yalnızca geniş ekran)  — platform NE, kısa ve okunur.
 *   SAĞ (her ekran)             — tek bir iş: içeri gir.
 *
 * Telefonda sol taraf GİZLENİYOR. Orada tanıtım metnini de giriş kartını da aynı ekrana
 * sıkıştırmak, asıl eylemi katlamanın altına itiyordu; dar ekranda tek bir kart, altında
 * üç satır özet yeterli.
 *
 * GİRİŞ YOLU TEK: GitHub. Platformun kendisi depo etrafında kurulu, dolayısıyla GitHub
 * kimliği zaten gerekiyor; ikinci bir sağlayıcı sunmak, sonradan "depolarım neden
 * görünmüyor" sorusunu üreten yolu açık tutmak olurdu. Misafir girişi ayrı ve ikincil:
 * görmek için var, katılmak için değil.
 */
import React, { useState } from 'react';
import { Github, Shield, Sparkles, Code2, GitFork, MessageSquare, Zap, ArrowRight } from 'lucide-react';
import { UserProfile } from '../types';
import { signInWithGitHubSupabase, saveStoredProfile, DEFAULT_USER } from '../services/supabaseClient';

interface AuthScreenProps {
  language: 'tr' | 'en';
  onChangeLanguage?: (lang: 'tr' | 'en') => void;
  isClosedBetaActive?: boolean;
}

interface Feature {
  icon: React.ReactNode;
  title: { tr: string; en: string };
  body: { tr: string; en: string };
}

const FEATURES: Feature[] = [
  {
    icon: <Code2 className="h-4 w-4" />,
    title: { tr: 'Kod ve depo paylaşımı', en: 'Code and repositories' },
    body: {
      tr: 'Depolarını profilinde vitrine koy, kod parçalarını akışta paylaş.',
      en: 'Showcase your repositories and share snippets in the feed.'
    }
  },
  {
    icon: <MessageSquare className="h-4 w-4" />,
    title: { tr: 'Topluluklar', en: 'Communities' },
    body: {
      tr: 'İlgi alanına göre topluluklara katıl, projelerini oraya ekle.',
      en: 'Join communities and add your projects to them.'
    }
  },
  {
    icon: <GitFork className="h-4 w-4" />,
    title: { tr: 'Projeler', en: 'Projects' },
    body: {
      tr: 'Projelerini yayınla, takipçi topla ve ekibini bul.',
      en: 'Publish your projects, gather followers and find your team.'
    }
  },
  {
    icon: <Zap className="h-4 w-4" />,
    title: { tr: 'Canlı akış', en: 'Live feed' },
    body: {
      tr: 'Gönderiler, yorumlar ve mesajlar anında; yenilemeye gerek yok.',
      en: 'Posts, comments and messages arrive instantly.'
    }
  }
];

export const AuthScreen: React.FC<AuthScreenProps> = ({
  language,
  onChangeLanguage,
  isClosedBetaActive = false
}) => {
  const tr = language === 'tr';
  const [githubLoading, setGithubLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const anyLoading = githubLoading || demoLoading;

  const handleGitHubOAuth = async () => {
    setGithubLoading(true);
    setAuthError(null);
    try {
      await signInWithGitHubSupabase();
    } catch (err: any) {
      console.warn('Supabase GitHub OAuth attempt:', err);
      setAuthError(err?.message || (tr ? 'Giriş sırasında bir hata oluştu.' : 'Sign-in failed.'));
      setGithubLoading(false);
    }
    // Başarıda sayfa GitHub'a gidiyor; `finally` ile yükleniyor durumunu kapatmak
    // yönlendirme beklerken düğmeyi bir anlık "hazır" gösterirdi.
  };

  const handleDemoLogin = () => {
    if (isClosedBetaActive) {
      setAuthError(
        tr
          ? 'Kapalı beta aktif olduğu için misafir girişi engellenmiştir.'
          : 'Guest login is disabled during closed beta.'
      );
      return;
    }
    setDemoLoading(true);
    setTimeout(() => {
      const demoUser: UserProfile = {
        ...DEFAULT_USER,
        id: `usr_${Date.now()}`,
        username: 'c4e_developer',
        display_name: 'C4E Developer',
        avatar_url:
          'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        bio: tr
          ? 'Code4Ever topluluk üyesi ve açık kaynak tutkunu.'
          : 'Code4Ever community member and open-source enthusiast.',
        role: tr ? 'Geliştirici' : 'Developer',
        verified: false,
        betaStatus: 'pending' as const,
        custom_fields: { github: 'github.com/code4ever', location: 'Türkiye' }
      };
      saveStoredProfile(demoUser);
      window.location.reload();
    }, 400);
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden font-sans text-white">
      {/*
        Zemin. Aurora kütleleri `body`de zaten var; buraya yalnızca giriş kartının arkasında
        duran, yavaşça kayan tek bir ışık ekleniyor. `pointer-events-none` şart: aksi hâlde
        dekor, altındaki düğmelerin tıklamasını yutar.
      */}
      <div className="c4e-auth-glow pointer-events-none absolute -top-40 left-1/2 h-[46rem] w-[46rem] -translate-x-1/2 rounded-full blur-[140px]" />

      {onChangeLanguage && (
        <div className="absolute right-4 top-4 z-20 flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] p-1 backdrop-blur-md sm:right-6 sm:top-6">
          {(['tr', 'en'] as const).map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => onChangeLanguage(code)}
              aria-pressed={language === code}
              className={`min-h-9 min-w-11 rounded-full px-3 text-xs font-bold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                language === code ? 'c4e-pill-on' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {code === 'tr' ? 'TR' : 'EN'}
            </button>
          ))}
        </div>
      )}

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center gap-10 px-5 py-14 lg:flex-row lg:items-center lg:gap-16 lg:py-10">
        {/* ------------------------------------------------ SOL: platform nedir */}
        <div className="hidden min-w-0 flex-1 lg:block">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3.5 py-1.5 text-[11px] font-semibold text-zinc-300 backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5 text-indigo-300" />
            {tr ? 'Türkiye geliştirici ekosistemi' : 'Developer ecosystem'}
          </span>

          <h1 className="mt-5 text-5xl font-extrabold tracking-tight">
            <span className="c4e-gradient-text">Code4Ever</span>
          </h1>

          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-zinc-400">
            {tr
              ? 'Yazılımcılar için sosyal akış, proje vitrini ve topluluklar. Kodunu paylaş, ekibini bul, işini duyur.'
              : 'A social feed, project showcase and communities for developers. Share your code, find your team, ship your work.'}
          </p>

          <ul className="mt-8 grid max-w-xl grid-cols-2 gap-2.5">
            {FEATURES.map((feature) => (
              <li key={feature.title.en} className="c4e-card c4e-hover p-4">
                <span className="mb-2.5 flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.06] text-indigo-200">
                  {feature.icon}
                </span>
                <p className="text-[13px] font-bold text-white">{feature.title[language]}</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-zinc-500">
                  {feature.body[language]}
                </p>
              </li>
            ))}
          </ul>
        </div>

        {/* ------------------------------------------------ SAĞ: giriş */}
        <div className="w-full max-w-[25rem] flex-none">
          {/* Dar ekranda markayı kart taşıyor: sol sütun gizli olduğu için başka
              hiçbir yerde görünmüyor. */}
          <div className="mb-6 text-center lg:hidden">
            <h1 className="text-3xl font-extrabold tracking-tight">
              <span className="c4e-gradient-text">Code4Ever</span>
            </h1>
            <p className="mx-auto mt-2 max-w-xs text-[13px] leading-relaxed text-zinc-400">
              {tr
                ? 'Yazılımcılar için sosyal akış, proje vitrini ve topluluklar.'
                : 'Social feed, project showcase and communities for developers.'}
            </p>
          </div>

          <div className="c4e-glass p-6 sm:p-7">
            <h2 className="text-lg font-extrabold tracking-tight text-white">
              {tr ? 'Hoş geldin' : 'Welcome'}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              {tr
                ? 'GitHub hesabınla devam et. Ayrı bir şifre yok.'
                : 'Continue with your GitHub account. No separate password.'}
            </p>

            {authError && (
              <div
                role="alert"
                className="user-text mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-[11.5px] leading-relaxed text-amber-200"
              >
                {authError}
              </div>
            )}

            <button
              type="button"
              onClick={handleGitHubOAuth}
              disabled={anyLoading}
              className="group mt-5 flex min-h-12 w-full items-center justify-center gap-2.5 rounded-2xl bg-white px-4 text-sm font-bold text-zinc-950 shadow-xl transition-all hover:bg-zinc-100 active:translate-y-px disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Github className="h-[18px] w-[18px]" />
              <span>
                {githubLoading
                  ? tr
                    ? 'GitHub\'a yönlendiriliyor…'
                    : 'Redirecting to GitHub…'
                  : tr
                  ? 'GitHub ile giriş yap'
                  : 'Sign in with GitHub'}
              </span>
              {!githubLoading && (
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              )}
            </button>

            <p className="mt-3 text-center text-[11px] leading-relaxed text-zinc-500">
              {tr
                ? 'Profil resmin, biyografin ve kamuya açık depoların otomatik gelir.'
                : 'Your avatar, bio and public repositories are synced automatically.'}
            </p>

            {/* Ayırıcı. Misafir girişi aynı listede bir düğme daha olsaydı GitHub'la eşit
                ağırlıkta okunurdu; oysa biri hesap açıyor, öteki yalnızca gezdiriyor. */}
            <div className="my-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-white/[0.08]" />
              <span className="text-[10px] font-semibold tracking-wider text-zinc-600">
                {tr ? 'YA DA' : 'OR'}
              </span>
              <span className="h-px flex-1 bg-white/[0.08]" />
            </div>

            {isClosedBetaActive ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/[0.07] px-4 py-3 text-center text-[11.5px] font-semibold text-amber-300">
                <Sparkles className="h-3.5 w-3.5 flex-none" />
                <span>
                  {tr ? 'Kapalı beta — misafir girişi kapalı' : 'Closed beta — guest login disabled'}
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleDemoLogin}
                disabled={anyLoading}
                className="c4e-ghost flex min-h-11 w-full items-center justify-center gap-2 px-4 text-xs font-semibold text-zinc-300 hover:text-white active:translate-y-px disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Sparkles className="h-3.5 w-3.5 text-zinc-400" />
                <span>
                  {demoLoading
                    ? tr
                      ? 'Hazırlanıyor…'
                      : 'Preparing…'
                    : tr
                    ? 'Misafir olarak gez'
                    : 'Browse as a guest'}
                </span>
              </button>
            )}

            <div className="mt-6 flex items-center justify-center gap-2 border-t border-white/[0.07] pt-4 text-[11px] text-zinc-500">
              <Shield className="h-3.5 w-3.5 flex-none text-emerald-400/90" />
              <span>
                {tr
                  ? 'Şifren bizde durmuyor; kimliği GitHub doğruluyor.'
                  : 'We never store a password; GitHub verifies your identity.'}
              </span>
            </div>
          </div>

          {/* Dar ekranda özellikler kartın ALTINDA ve kısa: asıl eylemi aşağı itmesin. */}
          <ul className="mt-6 space-y-2 lg:hidden">
            {FEATURES.slice(0, 3).map((feature) => (
              <li key={feature.title.en} className="flex items-center gap-3 px-1">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-xl bg-white/[0.05] text-indigo-200">
                  {feature.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-zinc-200">
                    {feature.title[language]}
                  </span>
                  <span className="block truncate text-[11px] text-zinc-500">
                    {feature.body[language]}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-7 text-center text-[11px] text-zinc-600">
            Lanux Software Systems &copy; 2026
          </p>
        </div>
      </div>
    </div>
  );
};
