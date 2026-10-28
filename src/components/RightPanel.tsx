import React, { useState } from 'react';
import { Trend, Community, PlatformSettings } from '../types';
import { TrendingUp, Users, Check, UserPlus, Sparkles } from 'lucide-react';
import { UserAvatar } from './ui/avatar';

interface RightPanelProps {
  trends: Trend[];
  communities: Community[];
  platformSettings?: PlatformSettings;
  language: 'tr' | 'en';
  onToggleJoinCommunity: (id: string) => void;
  onSelectCommunity?: (community: Community) => void;
  onSelectTrend?: (trend: Trend) => void;
}

export const RightPanel: React.FC<RightPanelProps> = ({
  trends,
  communities,
  platformSettings,
  language,
  onToggleJoinCommunity,
  onSelectCommunity,
  onSelectTrend
}) => {
  const [pendingJoinIds, setPendingJoinIds] = useState<Set<string>>(new Set());
  const brandTitle = platformSettings?.brandTitle || 'Code4Ever Platform';
  const brandDomain = platformSettings?.brandDomain || 'lanux.online';

  const handleJoinClick = (commId: string) => {
    if (pendingJoinIds.has(commId)) return;
    setPendingJoinIds((prev) => new Set(prev).add(commId));
    setTimeout(() => {
      setPendingJoinIds((prev) => {
        const next = new Set(prev);
        next.delete(commId);
        return next;
      });
    }, 500);
    onToggleJoinCommunity(commId);
  };

  return (
    <aside className="w-80 min-w-[320px] max-w-[320px] flex-shrink-0 hidden xl:block p-5 space-y-7 app-rail overflow-y-auto z-20 select-none">
      <div className="space-y-3">
        <div className="flex items-center gap-2 pb-1">
          <TrendingUp className="w-4 h-4 text-zinc-300" />
          <h3 className="text-xs font-bold text-white tracking-wider uppercase">
            {language === 'tr' ? 'Trendler' : 'Trending'}
          </h3>
        </div>

        {trends.length === 0 ? (
          <div className="c4e-empty flex flex-col items-center gap-2 px-4 py-7 text-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06] text-zinc-400">
              <TrendingUp className="h-4 w-4" />
            </span>
            <p className="text-xs font-semibold text-zinc-400">
              {language === 'tr' ? 'Henüz trend konu yok' : 'No trending topics yet'}
            </p>
            <p className="max-w-[14rem] text-[11px] leading-relaxed text-zinc-600">
              {language === 'tr'
                ? 'Etiketli gönderiler çoğaldıkça en çok konuşulanlar burada görünür.'
                : 'As tagged posts pile up, the most discussed ones show up here.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {trends.map((trend) => (
              <div
                key={trend.id}
                onClick={() => onSelectTrend && onSelectTrend(trend)}
                className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800/40 hover:border-zinc-700 transition-all cursor-pointer space-y-0.5 group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white group-hover:text-zinc-200 font-mono">
                    {trend.topic || trend.tag}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">{trend.category}</span>
                </div>
                <span className="text-[10px] text-zinc-400 font-mono block">
                  {trend.posts_count} {language === 'tr' ? 'gönderi' : 'posts'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 pb-1">
          <Users className="w-4 h-4 text-zinc-300" />
          <h3 className="text-xs font-bold text-white tracking-wider uppercase">
            {language === 'tr' ? 'Topluluklar' : 'Communities'}
          </h3>
        </div>

        {communities.length === 0 ? (
          <div className="py-4 text-center text-zinc-500 text-xs font-mono">
            {language === 'tr' ? 'Henüz topluluk oluşturulmadı.' : 'No communities created yet.'}
          </div>
        ) : (
          <div className="space-y-2.5">
            {communities.map((comm) => (
              <div
                key={comm.id}
                className="flex items-center justify-between gap-3 p-2 rounded-xl bg-zinc-950/40 hover:bg-zinc-900/60 transition-colors"
              >
                <div
                  onClick={() => onSelectCommunity && onSelectCommunity(comm)}
                  className="flex items-center gap-2.5 overflow-hidden cursor-pointer"
                >
                  <UserAvatar
                    src={comm.avatar_url}
                    name={comm.name}
                    className="w-8 h-8 rounded-xl ring-1 ring-zinc-800 flex-shrink-0 text-[10px]"
                  />
                  <div className="truncate">
                    <span className="text-xs font-bold text-white truncate block hover:text-zinc-200">
                      {comm.name}
                    </span>
                    <span className="text-[10px] text-purple-400 font-mono truncate block">
                      /c/@{comm.handle.replace(/^@/, '')}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={pendingJoinIds.has(comm.id)}
                  onClick={() => handleJoinClick(comm.id)}
                  className={`p-1.5 rounded-lg text-xs font-semibold transition-all flex-shrink-0 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed active:scale-95 ${
                    comm.is_joined
                      ? 'bg-zinc-800 text-emerald-400 border border-zinc-700/50'
                      : 'bg-zinc-100 hover:bg-white text-zinc-950 shadow'
                  }`}
                  title={comm.is_joined ? (language === 'tr' ? 'Katılındı' : 'Joined') : (language === 'tr' ? 'Katıl' : 'Join')}
                >
                  {comm.is_joined ? <Check className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5 text-zinc-950" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-3 bg-zinc-950 border border-zinc-800/60 rounded-xl text-center space-y-1.5">
        <span className="text-[11px] font-mono text-zinc-400 flex items-center justify-center gap-1">
          <Sparkles className="w-3 h-3 text-zinc-400" />
          <span>{brandTitle}</span>
        </span>
        <span className="text-[10px] text-zinc-500 font-mono block">{brandDomain}</span>

        {/* Legal and developer pages render outside the app shell, so they are plain links. */}
        <nav className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 pt-1 text-[10px] text-zinc-500">
          <a href="/dev/docs" className="hover:text-zinc-300 transition-colors">
            {language === 'tr' ? 'Geliştirici API' : 'Developer API'}
          </a>
          <span aria-hidden="true">·</span>
          <a href="/tos" className="hover:text-zinc-300 transition-colors">
            {language === 'tr' ? 'Kullanım Şartları' : 'Terms'}
          </a>
          <span aria-hidden="true">·</span>
          <a href="/privacy" className="hover:text-zinc-300 transition-colors">
            {language === 'tr' ? 'Gizlilik' : 'Privacy'}
          </a>
        </nav>
      </div>
    </aside>
  );
};
