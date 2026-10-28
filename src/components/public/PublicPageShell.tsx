import React from 'react';
import { ArrowLeft, ExternalLink } from 'lucide-react';

interface PublicPageShellProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  language: 'tr' | 'en';
  /** Rendered in the sticky sidebar on wide screens. */
  nav?: Array<{ id: string; label: string }>;
  children: React.ReactNode;
}

/**
 * Chrome shared by the pages that must render without a session: /dev/docs, /tos and
 * /privacy. Those are reachable by search engines and by people who have not signed up, so
 * they deliberately do not mount the app shell (sidebar, feed, Supabase subscriptions).
 */
export const PublicPageShell: React.FC<PublicPageShellProps> = ({
  title,
  subtitle,
  eyebrow,
  language,
  nav,
  children
}) => {
  const tr = language === 'tr';

  return (
    <div className="min-h-screen w-full bg-[#0a0a14] text-zinc-200 font-display">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#0a0a14]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-3">
          <a
            href="/"
            className="flex items-center gap-2 text-sm font-extrabold tracking-tight text-white hover:opacity-90"
          >
            <ArrowLeft className="h-4 w-4 text-zinc-400" />
            <span>Code4Ever</span>
          </a>
          <nav className="flex items-center gap-1 text-[11px] font-semibold">
            <a
              href="/dev/docs"
              className="rounded-lg px-2.5 py-1.5 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              {tr ? 'Geliştirici' : 'Developers'}
            </a>
            <a
              href="/tos"
              className="rounded-lg px-2.5 py-1.5 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              {tr ? 'Kullanım Şartları' : 'Terms'}
            </a>
            <a
              href="/privacy"
              className="rounded-lg px-2.5 py-1.5 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              {tr ? 'Gizlilik' : 'Privacy'}
            </a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <div className="border-b border-white/[0.07] bg-gradient-to-b from-zinc-900/40 to-transparent">
        <div className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
          {eyebrow && (
            <span className="mb-3 inline-block rounded-full border border-white/[0.12] bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] text-zinc-400">
              {eyebrow}
            </span>
          )}
          <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-4xl">{title}</h1>
          {subtitle && (
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">{subtitle}</p>
          )}
        </div>
      </div>

      <div className="mx-auto flex max-w-5xl gap-10 px-5 py-10">
        {nav && nav.length > 0 && (
          <aside className="hidden w-52 flex-shrink-0 lg:block">
            <nav className="sticky top-24 space-y-0.5">
              {nav.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="block rounded-lg px-3 py-1.5 text-[12px] text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </aside>
        )}

        <main className="min-w-0 flex-1 space-y-12">{children}</main>
      </div>

      <footer className="border-t border-white/[0.07]">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-5 py-8 text-[11px] text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-mono">lanux.online — Code4Ever</span>
          <div className="flex flex-wrap items-center gap-4">
            <a href="/tos" className="hover:text-zinc-300">
              {tr ? 'Kullanım Şartları' : 'Terms of Service'}
            </a>
            <a href="/privacy" className="hover:text-zinc-300">
              {tr ? 'Gizlilik İlkeleri' : 'Privacy Policy'}
            </a>
            <a href="/dev/docs" className="hover:text-zinc-300">
              API
            </a>
            <a href="/" className="inline-flex items-center gap-1 hover:text-zinc-300">
              {tr ? 'Uygulamaya dön' : 'Back to the app'}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

/** A titled block with an anchor so the sidebar can link to it. */
export const Section: React.FC<{ id: string; title: string; children: React.ReactNode }> = ({
  id,
  title,
  children
}) => (
  <section id={id} className="scroll-mt-24 space-y-4">
    <h2 className="text-lg font-bold tracking-tight text-white">{title}</h2>
    {children}
  </section>
);
