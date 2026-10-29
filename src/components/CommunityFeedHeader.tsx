import React, { useState } from 'react';
import {
  ArrowLeft,
  Users,
  Check,
  UserPlus,
  Link2,
  Calendar,
  MessageSquare,
  Settings,
  Globe,
  Shield,
  Lock
} from 'lucide-react';
import { Community, UserProfile } from '../types';
import { sanitizeUrl, verifyAdminAccess } from '../utils/securityHelper';

interface CommunityFeedHeaderProps {
  community: Community;
  user: UserProfile;
  language: 'tr' | 'en';
  postCount: number;
  isJoined: boolean;
  onBack?: () => void;
  onToggleJoin?: (communityId: string) => void;
  onOpenSettings?: (community: Community) => void;
  onSelectUser?: (username: string) => void;
}


/**
 * Hero header of a single community's feed page: banner, identity, live stats and the
 * join / leave action. Rendered above the shared feed timeline so a community reads like a
 * place of its own rather than a filter on the global feed.
 */
export const CommunityFeedHeader: React.FC<CommunityFeedHeaderProps> = ({
  community,
  user,
  language,
  postCount,
  isJoined,
  onBack,
  onToggleJoin,
  onOpenSettings,
  onSelectUser
}) => {
  const [copied, setCopied] = useState(false);

  const handle = (community.handle || '').replace(/^@/, '').toLowerCase();
  /*
   * Afiş görseli OLMAYAN topluluk, kendi avatarının bulanık bir kopyasını afiş
   * yapıyordu — çoğu toplulukta avatar da yok, sonuç koca bir boş siyah bloktu.
   * Görsel gerçekten yoksa artık marka gradyanından bir doku gösteriliyor:
   * "eksik" değil "sade" görünüyor.
   */
  const ownBanner = sanitizeUrl(community.banner_url);
  /*
   * Avatarı olmayan topluluk, jenerik bir "kişi" yer tutucusu gösteriyordu —
   * hem topluluk için yanlış simge hem de yarım kalmış izlenimi. Görsel yoksa
   * artık adın baş harfi, marka gradyanlı bir karede.
   */
  const ownAvatar = sanitizeUrl(community.avatar_url);
  const initials = (community.name || '?').trim().slice(0, 2).toLocaleUpperCase('tr-TR');

  const isOwner =
    (community.created_by && community.created_by === user.id) ||
    (community.creator_username || '').toLowerCase() === (user.username || '').toLowerCase() ||
    verifyAdminAccess(user);

  const memberCount = Math.max(0, Number(community.members_count) || 0);

  const createdAt = community.created_at ? new Date(community.created_at) : null;
  const createdLabel =
    createdAt && !Number.isNaN(createdAt.getTime())
      ? createdAt.toLocaleDateString(language === 'tr' ? 'tr-TR' : 'en-GB', { year: 'numeric', month: 'long' })
      : null;

  const handleCopyLink = () => {
    const url = `${window.location.origin}/c/@${handle}`;
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative border-b border-white/[0.06]">
      {/* Banner */}
      <div className={`h-32 md:h-40 w-full overflow-hidden relative ${ownBanner ? 'bg-white/[0.04]' : 'c4e-banner-fallback'}`}>
        {ownBanner && <img src={ownBanner} alt="" className="w-full h-full object-cover opacity-80" />}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a14] via-[#09090b]/40 to-black/30" />

        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="absolute top-3 left-3 p-2 rounded-xl bg-black/60 hover:bg-black/80 border border-white/10 text-zinc-200 hover:text-white backdrop-blur-md transition-colors cursor-pointer"
            title={language === 'tr' ? 'Topluluklara dön' : 'Back to communities'}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}

        <span className="absolute top-3 right-3 flex items-center gap-1.5">
          {community.is_private && (
            <span className="px-2.5 py-1 rounded-xl bg-amber-500/20 border border-amber-400/30 backdrop-blur-md text-[10px] font-black uppercase tracking-wider text-amber-200 flex items-center gap-1.5">
              <Lock className="w-3 h-3" />
              {language === 'tr' ? 'Gizli' : 'Private'}
            </span>
          )}
          <span className="px-2.5 py-1 rounded-xl bg-black/60 border border-white/10 backdrop-blur-md text-[10px] font-black uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
            <Users className="w-3 h-3" />
            {language === 'tr' ? 'Topluluk Akışı' : 'Community feed'}
          </span>
        </span>
      </div>

      {/* Identity row */}
      <div className="px-5 pb-4 -mt-10 relative">
        <div className="flex items-end justify-between gap-3">
          {ownAvatar ? (
            <img
              src={ownAvatar}
              alt={community.name}
              className="c4e-sheet w-20 h-20 object-cover ring-4 ring-[#0a0a14]"
            />
          ) : (
            <span
              aria-label={community.name}
              className="flex h-20 w-20 select-none items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 via-indigo-500 to-violet-500 text-2xl font-extrabold text-white ring-4 ring-[#0a0a14] shadow-2xl"
            >
              {initials}
            </span>
          )}

          <div className="flex items-center gap-2 pb-1">
            <button
              type="button"
              onClick={handleCopyLink}
              className="px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.07] text-zinc-300 text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              title={language === 'tr' ? 'Bağlantıyı kopyala' : 'Copy link'}
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Link2 className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">
                {copied ? (language === 'tr' ? 'Kopyalandı' : 'Copied') : (language === 'tr' ? 'Bağlantı' : 'Link')}
              </span>
            </button>

            {isOwner && onOpenSettings && (
              <button
                type="button"
                onClick={() => onOpenSettings(community)}
                className="px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.07] text-zinc-300 text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{language === 'tr' ? 'Yönet' : 'Manage'}</span>
              </button>
            )}

            {onToggleJoin && (
              <button
                type="button"
                onClick={() => onToggleJoin(community.id)}
                className={`px-4 py-2 rounded-xl text-[11px] font-black flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer ${
                  isJoined
                    ? 'bg-white/[0.07] hover:bg-red-500/15 hover:text-red-400 border border-white/[0.12] text-zinc-200'
                    : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/20'
                }`}
              >
                {isJoined ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    {language === 'tr' ? 'Üyesin' : 'Joined'}
                  </>
                ) : (
                  <>
                    <UserPlus className="w-3.5 h-3.5" />
                    {language === 'tr' ? 'Katıl' : 'Join'}
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-extrabold text-white tracking-tight">{community.name}</h2>
            <span className="px-2 py-0.5 rounded-lg bg-purple-500/10 border border-purple-500/25 text-purple-300 text-[10px] font-bold font-mono">
              @{handle}
            </span>
          </div>

          {community.description && (
            <p className="text-xs text-zinc-300 leading-relaxed max-w-2xl user-text">{community.description}</p>
          )}

          <div className="flex items-center gap-4 flex-wrap text-[11px] text-zinc-400 font-mono pt-0.5">
            <span className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-purple-400" />
              <strong className="text-zinc-200">{memberCount}</strong>
              {language === 'tr' ? 'üye' : 'members'}
            </span>
            <span className="flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
              <strong className="text-zinc-200">{postCount}</strong>
              {language === 'tr' ? 'gönderi' : 'posts'}
            </span>
            {community.creator_username && (
              <button
                type="button"
                onClick={() => onSelectUser?.(community.creator_username!)}
                className="flex items-center gap-1.5 py-1 -my-1 hover:text-white transition-colors cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                <span>@{community.creator_username}</span>
              </button>
            )}
            {createdLabel && (
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                {createdLabel}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              {community.is_private ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Globe className="w-3.5 h-3.5" />}
              {community.is_private
                ? (language === 'tr' ? 'gönderiler üyelere özel' : 'posts are members-only')
                : `/c/@${handle}`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
