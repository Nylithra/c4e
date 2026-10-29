import React, { useState, useEffect } from 'react';
import {
  Home,
  Compass,
  Bell,
  Mail,
  Bot,
  Code2,
  Users,
  Briefcase,
  Bookmark,
  Settings,
  PlusCircle,
  Plus,
  LogOut,
  ChevronRight,
  Shield,
  Sparkles,
  Menu,
  X,
  User,
  Globe,
  Download,
  Smartphone,
  Bug
} from 'lucide-react';
import { UserProfile, DynamicTheme } from '../types';
import { verifyAdminAccess } from '../utils/securityHelper';
import { Button } from './ui/button';
import { UserAvatar } from './ui/avatar';
import { isPWARunningStandalone } from '../utils/pwaHelper';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user: UserProfile;
  theme: DynamicTheme;
  language: 'tr' | 'en';
  unreadCount: number;
  onOpenNewPost: () => void;
  onLogout: () => void;
  onOpenBetaModal: (tabType?: string) => void;
  onChangeLanguage?: (lang: 'tr' | 'en') => void;
  onOpenInstallPWA?: () => void;
  onOpenReportError?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  user,
  theme,
  language,
  unreadCount,
  onOpenNewPost,
  onLogout,
  onOpenBetaModal,
  onChangeLanguage,
  onOpenInstallPWA,
  onOpenReportError
}) => {
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const hasAdminAccess = verifyAdminAccess(user);

  useEffect(() => {
    setIsStandalone(isPWARunningStandalone());
  }, []);

  const navItems = [
    { id: 'feed', label: language === 'tr' ? 'Ana Sayfa' : 'Home', icon: Home },
    { id: 'explore', label: language === 'tr' ? 'Keşfet' : 'Explore', icon: Compass },
    { id: 'jobs', label: language === 'tr' ? 'İş & Ekip İlanları' : 'Job & Team Listings', icon: Briefcase },
    {
      id: 'notifications',
      label: language === 'tr' ? 'Bildirimler' : 'Notifications',
      icon: Bell,
      badge: unreadCount > 0 ? unreadCount : undefined
    },
    {
      id: 'messages',
      label: language === 'tr' ? 'Mesajlar' : 'Messages',
      icon: Mail
    },
    {
      id: 'everychat',
      label: 'EveryChat',
      icon: Bot,
      isBetaModal: !hasAdminAccess,
      isBetaBadge: true
    },
    { id: 'projects', label: language === 'tr' ? 'Projeler' : 'Projects', icon: Code2 },
    { id: 'communities', label: language === 'tr' ? 'Topluluklar' : 'Communities', icon: Users },
    { id: 'bookmarks', label: language === 'tr' ? 'Yer İşaretleri' : 'Bookmarks', icon: Bookmark },
    { id: 'support', label: language === 'tr' ? 'Destek Ol' : 'Support Us', icon: Sparkles },
    { id: 'settings', label: language === 'tr' ? 'Ayarlar' : 'Settings', icon: Settings },
    ...(hasAdminAccess
      ? [
          {
            id: 'admin',
            label: 'Admin Paneli',
            icon: Shield,
            isAdminBadge: true
          }
        ]
      : [])
  ];

  /**
   * The four destinations of the mobile bottom bar. Deliberately short: a phone bar with
   * five icons plus a floating button left no room for real tap targets, and "Keşfet" /
   * "Topluluklar" are one tap away in the drawer.
   */
  const bottomNavItems: Array<{
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    { id: 'feed', label: language === 'tr' ? 'Akış' : 'Feed', icon: Home },
    { id: 'jobs', label: language === 'tr' ? 'İş İlanları' : 'Jobs', icon: Briefcase },
    { id: 'messages', label: language === 'tr' ? 'Mesajlar' : 'Messages', icon: Mail },
    {
      id: 'profile',
      label: language === 'tr' ? 'Hesabım' : 'Account',
      icon: User
    }
  ];

  const handleNavClick = (id: string, isBetaModal?: boolean) => {
    if (isBetaModal) {
      onOpenBetaModal(id);
    } else {
      setActiveTab(id);
    }
    setIsMobileDrawerOpen(false);
  };

  return (
    <>
      {/* ======================================================== */}
      {/* 1. MOBILE TOP HEADER (Screens < md)                      */}
      {/* ======================================================== */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-40 app-rail backdrop-blur-xl border-b border-white/[0.07] px-4 py-2.5 flex items-center justify-between select-none">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsMobileDrawerOpen(true)}
            className="p-1.5 -ml-1 text-zinc-400 hover:text-white rounded-xl hover:bg-white/[0.09] active:bg-white/[0.11] transition-colors cursor-pointer"
            aria-label="Open Menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div
            onClick={() => setActiveTab('feed')}
            className="cursor-pointer flex items-center gap-1.5"
          >
            <span className="text-base font-extrabold text-white tracking-tight">Code4Ever</span>
          </div>
        </div>

        {/* The header keeps only what the bottom bar does not already offer: search,
            notifications and composing. The avatar lives in the bottom bar ("Hesabım")
            and PWA install lives in the drawer + install banner, so both were duplicates. */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setActiveTab('explore')}
            className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-white/[0.09] active:bg-white/[0.11] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={language === 'tr' ? 'Keşfet' : 'Explore'}
            title={language === 'tr' ? 'Keşfet' : 'Explore'}
          >
            <Compass className="w-5 h-5" />
          </button>

          <button
            onClick={() => setActiveTab('notifications')}
            className="relative p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-white/[0.09] active:bg-white/[0.11] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={
              unreadCount > 0
                ? (language === 'tr' ? `Bildirimler (${unreadCount} okunmamış)` : `Notifications (${unreadCount} unread)`)
                : (language === 'tr' ? 'Bildirimler' : 'Notifications')
            }
            title={language === 'tr' ? 'Bildirimler' : 'Notifications'}
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] rounded-full bg-red-500 px-1 text-center text-[10px] font-bold leading-4 text-white ring-2 ring-[#0a0a14]">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          <button
            onClick={onOpenNewPost}
            className="ml-1 h-9 px-3 rounded-full bg-zinc-100 text-zinc-950 hover:bg-white active:scale-95 transition-all shadow-sm font-bold text-xs flex items-center gap-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={language === 'tr' ? 'Yeni gönderi' : 'New post'}
          >
            <Plus className="w-4 h-4 text-zinc-950 stroke-[2.75px]" />
            <span>{language === 'tr' ? 'Paylaş' : 'Post'}</span>
          </button>
        </div>
      </header>

      {/* ======================================================== */}
      {/* 2. MOBILE SLIDE-OUT DRAWER SHEET (Screens < md)           */}
      {/* ======================================================== */}
      {isMobileDrawerOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex animate-in fade-in duration-200 select-none"
          onClick={() => setIsMobileDrawerOpen(false)}
        >
          <div
            className="w-72 max-w-[80vw] h-full bg-[#0a0a14] border-r border-white/[0.07] p-4 flex flex-col justify-between overflow-y-auto animate-in slide-in-from-left duration-250 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-4">
              {/* Drawer Top Header */}
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.07]">
                <span className="text-lg font-extrabold text-white tracking-tight">Code4Ever</span>
                <button
                  onClick={() => setIsMobileDrawerOpen(false)}
                  className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.09] transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* User Profile Card */}
              <div
                onClick={() => {
                  setActiveTab('profile');
                  setIsMobileDrawerOpen(false);
                }}
                className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.07] hover:border-white/[0.16] cursor-pointer transition-all"
              >
                <UserAvatar
                  src={user.avatar_url}
                  name={user.display_name || user.username}
                  className="w-10 h-10 ring-2 ring-white/[0.12] flex-shrink-0"
                />
                <div className="truncate flex-1">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-bold text-white truncate">{user.display_name}</span>
                    {hasAdminAccess && (
                      <span className="px-1 py-0.2 rounded bg-white/[0.07] text-[9px] text-zinc-400 font-mono">
                        ADMIN
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-zinc-400 font-mono truncate block">@{user.username}</span>
                </div>
              </div>

              {/* PWA Download Banner Button inside Drawer */}
              {!isStandalone && onOpenInstallPWA && (
                <button
                  onClick={() => {
                    setIsMobileDrawerOpen(false);
                    onOpenInstallPWA();
                  }}
                  className="w-full flex items-center justify-between p-3 rounded-2xl bg-white/[0.04] border border-white/[0.12] hover:bg-white/[0.09] active:scale-[0.98] transition-all cursor-pointer shadow-md"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-xl bg-zinc-100 text-zinc-950 font-bold">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <span className="text-xs font-bold text-white block">
                        {language === 'tr' ? 'Telefona Nasıl İndirilir?' : 'How to Install on Phone'}
                      </span>
                      <span className="text-[10px] text-zinc-400 font-mono block">
                        {language === 'tr' ? 'Kolay kurulum rehberi (PWA)' : 'PWA Setup guide'}
                      </span>
                    </div>
                  </div>
                  <Download className="w-4 h-4 text-zinc-300 stroke-[2.5px]" />
                </button>
              )}

              {/* Navigation Items */}
              <nav className="space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavClick(item.id, item.isBetaModal)}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        isActive
                          ? 'text-white nav-active shadow-sm border border-white/[0.12]'
                          : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06]'
                      }`}
                      style={
                        isActive
                          ? {
                              borderLeftColor: theme.accentColor,
                              borderLeftWidth: '3px'
                            }
                          : {}
                      }
                    >
                      <div className="flex items-center gap-3">
                        <Icon
                          className={`w-4 h-4 transition-colors ${
                            isActive ? 'text-zinc-200' : 'text-zinc-400'
                          }`}
                        />
                        <span>{item.label}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {(item.isBetaModal || item.isBetaBadge) && (
                          <span className="px-1.5 py-0.5 text-[9px] font-bold font-mono bg-white/[0.07] text-zinc-300 border border-white/[0.12] rounded shadow-sm">
                            BETA
                          </span>
                        )}
                        {item.badge !== undefined && (
                          <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-zinc-100 text-zinc-950 rounded-full">
                            {item.badge}
                          </span>
                        )}
                        {item.isAdminBadge && (
                          <span className="px-1.5 py-0.5 text-[9px] font-bold font-mono bg-white/[0.07] text-zinc-300 border border-white/[0.12] rounded shadow-sm">
                            ADMIN
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </nav>

              {/* Mobile New Post Action */}
              <Button
                onClick={() => {
                  onOpenNewPost();
                  setIsMobileDrawerOpen(false);
                }}
                size="lg"
                className="w-full"
              >
                <PlusCircle />
                <span>{language === 'tr' ? 'Yeni Gönderi Paylaş' : 'Create New Post'}</span>
              </Button>
            </div>

            {/* Bottom Actions inside Drawer */}
            <div className="pt-4 border-t border-white/[0.07] space-y-2">
              {onOpenReportError && (
                <button
                  onClick={() => {
                    setIsMobileDrawerOpen(false);
                    onOpenReportError();
                  }}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Bug className="w-4 h-4 text-red-400" />
                    <span>{language === 'tr' ? 'Bir Hata Bildir' : 'Report an Issue'}</span>
                  </div>
                  <span className="text-[10px] font-mono font-bold bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded">
                    LOG
                  </span>
                </button>
              )}

              {onChangeLanguage && (
                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.07] text-xs text-zinc-400">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-zinc-400" />
                    <span>{language === 'tr' ? 'Dil' : 'Language'}</span>
                  </div>
                  <div className="flex items-center gap-1 font-mono text-[11px]">
                    <button
                      onClick={() => onChangeLanguage('tr')}
                      className={`px-2 py-1 rounded-lg ${
                        language === 'tr' ? 'bg-white/[0.07] text-white font-bold' : 'text-zinc-500'
                      }`}
                    >
                      TR
                    </button>
                    <button
                      onClick={() => onChangeLanguage('en')}
                      className={`px-2 py-1 rounded-lg ${
                        language === 'en' ? 'bg-white/[0.07] text-white font-bold' : 'text-zinc-500'
                      }`}
                    >
                      EN
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={() => {
                  setIsMobileDrawerOpen(false);
                  onLogout();
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold text-red-400 hover:bg-red-500/10 active:bg-red-500/20 border border-red-500/20 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>{language === 'tr' ? 'Çıkış Yap' : 'Sign Out'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. MOBILE BOTTOM NAVIGATION BAR (Screens < md)            */}
      {/* ======================================================== */}
      {/* A floating pill instead of a full-width bar: four destinations, each a real
          44px+ tap target, the active one carried by a lighter pill behind the icon. */}
      <nav
        aria-label={language === 'tr' ? 'Ana gezinme' : 'Primary navigation'}
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 px-3 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2 select-none pointer-events-none"
      >
        <div className="pointer-events-auto mx-auto flex max-w-md items-center justify-between gap-1 rounded-[26px] border border-white/[0.07] bg-white/[0.03]/95 p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.55)] backdrop-blur-xl">
          {bottomNavItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                title={item.label}
                className={`relative flex h-11 flex-1 items-center justify-center rounded-[20px] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isActive
                    ? 'nav-active text-white'
                    : 'text-zinc-500 hover:text-zinc-200 active:bg-white/[0.07]'
                }`}
              >
                {item.id === 'profile' ? (
                  <span className="relative">
                    <UserAvatar
                      src={user.avatar_url}
                      name={user.display_name || user.username}
                      className={`h-7 w-7 text-[10px] ring-2 transition-colors ${
                        isActive ? 'ring-zinc-300' : 'ring-white/[0.12]'
                      }`}
                    />
                    {/* Online indicator, mirroring the reference design. */}
                    <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-[#0a0a14]" />
                  </span>
                ) : (
                  <item.icon
                    className={`h-[22px] w-[22px] ${isActive ? 'stroke-[2.25px]' : 'stroke-[1.75px]'}`}
                  />
                )}

                {/* Unread counters ride on the icon rather than adding a second row. */}
                {item.badge ? (
                  <span className="absolute right-[18%] top-1.5 min-w-[17px] rounded-full bg-red-500 px-1 text-center text-[10px] font-bold leading-[17px] text-white ring-2 ring-[#0a0a14]">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </nav>

      {/* ======================================================== */}
      {/* 4. DESKTOP PERMANENT SIDEBAR (Screens >= md)              */}
      {/* ======================================================== */}
      <aside className="hidden md:flex w-64 flex-shrink-0 flex-col justify-between p-4 app-rail z-30 select-none">
        <div className="space-y-5">
          <div className="px-2 pt-2 pb-1">
            {/* Marka işareti + kelime. Önceden yalnızca yazıydı; uygulama kenar
                çubuğunun tepesinde bir işaret olması, ekranın "bir ürün" gibi
                okunmasını sağlayan en ucuz değişiklik. */}
            <div
              className="group flex cursor-pointer items-center gap-2.5 transition-opacity hover:opacity-90"
              onClick={() => setActiveTab('feed')}
            >
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[11px] bg-gradient-to-br from-blue-400 via-indigo-500 to-fuchsia-500 shadow-[0_6px_18px_-4px_rgba(129,140,248,0.85)]">
                <Code2 className="h-4 w-4 text-white" strokeWidth={2.6} />
              </span>
              <span className="brand-gradient-text text-xl font-extrabold tracking-tight">Code4Ever</span>
            </div>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (item.isBetaModal) {
                      onOpenBetaModal(item.id);
                    } else {
                      setActiveTab(item.id);
                    }
                  }}
                  aria-current={isActive ? 'page' : undefined}
                  className={`c4e-nav w-full justify-between text-[13px] font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    isActive ? 'c4e-nav-on' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      className={`w-4 h-4 transition-colors ${
                        isActive ? 'text-violet-200' : 'text-zinc-400'
                      }`}
                    />
                    <span>{item.label}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {(item.isBetaModal || item.isBetaBadge) && (
                      <span className="px-1.5 py-0.5 text-[9px] font-bold font-mono bg-white/[0.07] text-zinc-300 border border-white/[0.12] rounded shadow-sm">
                        BETA
                      </span>
                    )}
                    {item.badge !== undefined && (
                      <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-zinc-100 text-zinc-950 rounded-full">
                        {item.badge}
                      </span>
                    )}
                    {item.isAdminBadge && (
                      <span className="px-1.5 py-0.5 text-[9px] font-bold font-mono bg-white/[0.07] text-zinc-300 border border-white/[0.12] rounded shadow-sm">
                        ADMIN
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </nav>

          <div className="pt-2 space-y-2">
            <Button onClick={onOpenNewPost} size="lg" className="w-full shadow-lg">
              <PlusCircle />
              <span>{language === 'tr' ? 'Yeni Gönderi' : 'New Post'}</span>
            </Button>

            {onOpenReportError && (
              <Button
                onClick={onOpenReportError}
                variant="ghost"
                className="w-full rounded-[14px] border border-rose-400/20 bg-rose-500/[0.08] text-rose-300 hover:bg-rose-500/15 hover:text-rose-200"
              >
                <Bug />
                <span>{language === 'tr' ? 'Bir Hata Bildir' : 'Report an Issue'}</span>
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div
            onClick={() => setActiveTab('profile')}
            className="flex items-center justify-between p-2.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.09] border border-white/[0.07] cursor-pointer transition-all hover:border-white/[0.16]"
          >
            <div className="flex items-center gap-2.5 overflow-hidden">
              <UserAvatar
                src={user.avatar_url}
                name={user.display_name || user.username}
                className="w-9 h-9 ring-2 ring-white/[0.12] flex-shrink-0 text-[10px]"
              />
              <div className="truncate">
                <div className="flex items-center gap-1 truncate">
                  <span className="text-xs font-bold text-white truncate">{user.display_name}</span>
                  {hasAdminAccess && (
                    <span className="px-1 py-0.2 rounded bg-white/[0.07] text-[9px] text-zinc-400 font-mono">
                      ADMIN
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-zinc-400 font-mono truncate block">@{user.username}</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onLogout();
                }}
                title={language === 'tr' ? 'Çıkış Yap' : 'Sign Out'}
                /* `title` tek basina yetiyor gibi gorunuyordu ama dugme 28x28'di: fareyle
                   bile isabet ettirmesi zor, dokunmatikte daha da zor. aria-label ayrica
                   veriliyor cunku `title` bazi ekran okuyucularda okunmuyor. */
                aria-label={language === 'tr' ? 'Çıkış Yap' : 'Sign Out'}
                className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-zinc-500 hover:text-red-400 hover:bg-white/[0.09] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <LogOut className="w-4 h-4" />
              </button>
              <ChevronRight className="w-4 h-4 text-zinc-600" />
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

