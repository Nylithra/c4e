import React, { useState, useEffect } from 'react';
import { Download, X, Smartphone } from 'lucide-react';
import { isPWARunningStandalone, subscribePWAInstallState } from '../utils/pwaHelper';

interface PWAInstallBannerProps {
  onOpenInstallModal: () => void;
  language: 'tr' | 'en';
}

export const PWAInstallBanner: React.FC<PWAInstallBannerProps> = ({
  onOpenInstallModal,
  language
}) => {
  const [isDismissed, setIsDismissed] = useState(false);
  const [isStandalone, setIsStandalone] = useState(true);

  useEffect(() => {
    const standalone = isPWARunningStandalone();
    setIsStandalone(standalone);

    // Check if dismissed in this session
    const dismissed = sessionStorage.getItem('c4e_pwa_banner_dismissed');
    if (dismissed) {
      setIsDismissed(true);
    }
  }, []);

  const isVisible = !isStandalone && !isDismissed;

  /**
   * The banner floats above the mobile bottom navigation, so while it is on screen the
   * scrollable column needs extra breathing room — otherwise it permanently covers the last
   * card of every page (settings, feed, job listings...).
   */
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('has-pwa-banner', isVisible);
    return () => document.body.classList.remove('has-pwa-banner');
  }, [isVisible]);

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDismissed(true);
    sessionStorage.setItem('c4e_pwa_banner_dismissed', 'true');
  };

  if (!isVisible) {
    return null;
  }

  return (
    <aside
      aria-label="PWA Install Banner"
      className="md:hidden fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-4 right-4 z-30 bg-white/[0.04]/95 backdrop-blur-xl border border-white/[0.07] rounded-2xl p-3 shadow-2xl flex items-center justify-between gap-3 animate-in slide-in-from-bottom duration-300"
    >
      <div
        onClick={onOpenInstallModal}
        className="flex items-center gap-3 cursor-pointer flex-1 overflow-hidden"
      >
        <div className="w-9 h-9 rounded-xl bg-white/[0.07] border border-white/[0.12] flex items-center justify-center text-zinc-200 flex-shrink-0">
          <Smartphone className="w-4 h-4" />
        </div>
        <div className="truncate">
          <h4 className="text-xs font-bold text-white tracking-tight">
            {language === 'tr' ? 'Telefona Nasıl İndirilir?' : 'How to Install on Phone'}
          </h4>
          <p className="text-[11px] text-zinc-400 font-mono truncate">
            {language === 'tr' ? '3 adımda ana ekrana ekleme rehberi' : '3-step setup guide'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={onOpenInstallModal}
          className="px-3 py-1.5 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-bold transition-all shadow-sm active:scale-95 flex items-center gap-1 cursor-pointer"
        >
          <Smartphone className="w-3.5 h-3.5 text-zinc-950 stroke-[2.5px]" />
          <span>{language === 'tr' ? 'Rehber' : 'Guide'}</span>
        </button>

        <button
          onClick={handleDismiss}
          aria-label={language === 'tr' ? 'Kapat' : 'Dismiss'}
          className="h-8 w-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.09] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title={language === 'tr' ? 'Kapat' : 'Dismiss'}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </aside>
  );
};
