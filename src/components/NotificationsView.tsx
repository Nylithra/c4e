import React, { useState, useEffect, useMemo } from 'react';
import {
  Bell,
  BellOff,
  Heart,
  Star,
  MessageSquare,
  Users,
  CheckCheck,
  Trash2,
  Briefcase,
  Repeat2,
  UserPlus,
  Mail,
  Inbox,
  GitCommit
} from 'lucide-react';
import { NotificationItem } from '../types';
import { UserAvatar } from './ui/avatar';
import { getNotificationPermission, requestNotificationPermission } from '../utils/notificationSound';

interface NotificationsViewProps {
  notifications: NotificationItem[];
  language: 'tr' | 'en';
  onMarkAllAsRead: () => void;
  onClearNotifications: () => void;
  onMarkAsRead?: (id: string) => void;
  onSelectTab?: (tab: string) => void;
}

type FilterId = 'all' | 'unread' | 'social' | 'work';

/** Which notification types belong to which filter tab. */
const FILTER_TYPES: Record<Exclude<FilterId, 'all' | 'unread'>, ReadonlyArray<NotificationItem['type']>> = {
  social: ['like', 'star', 'comment', 'repost', 'follow', 'community', 'group_invite', 'message', 'project_commit'],
  work: ['job_application', 'job_listing']
};

/**
 * Visual treatment per notification type. The small badge on the avatar is the only
 * colour in a row, so the type is readable at a glance without reading the sentence.
 */
const TYPE_STYLES: Record<
  NotificationItem['type'],
  { icon: React.ComponentType<{ className?: string }>; badge: string; tint: string }
> = {
  like: { icon: Heart, badge: 'bg-rose-500/20 text-rose-400 border-rose-500/30', tint: 'text-rose-400' },
  star: { icon: Star, badge: 'bg-amber-500/20 text-amber-400 border-amber-500/30', tint: 'text-amber-400' },
  comment: { icon: MessageSquare, badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', tint: 'text-emerald-400' },
  repost: { icon: Repeat2, badge: 'bg-sky-500/20 text-sky-400 border-sky-500/30', tint: 'text-sky-400' },
  follow: { icon: UserPlus, badge: 'bg-violet-500/20 text-violet-400 border-violet-500/30', tint: 'text-violet-400' },
  community: { icon: Users, badge: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30', tint: 'text-indigo-400' },
  group_invite: { icon: Users, badge: 'bg-purple-500/20 text-purple-400 border-purple-500/30', tint: 'text-purple-400' },
  message: { icon: Mail, badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30', tint: 'text-blue-400' },
  job_application: { icon: Briefcase, badge: 'bg-teal-500/20 text-teal-400 border-teal-500/30', tint: 'text-teal-400' },
  job_listing: { icon: Briefcase, badge: 'bg-teal-500/20 text-teal-400 border-teal-500/30', tint: 'text-teal-400' },
  project_commit: { icon: GitCommit, badge: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30', tint: 'text-indigo-400' }
};

const FALLBACK_STYLE = { icon: Bell, badge: 'bg-white/[0.07] text-zinc-300 border-white/[0.12]', tint: 'text-zinc-300' };

/**
 * Buckets notifications by age. Reading a long list top to bottom is much easier when
 * "today" is visibly separated from "last month".
 */
function bucketOf(item: NotificationItem, now: number): 'today' | 'week' | 'earlier' {
  const raw = item.created_at ? Date.parse(item.created_at) : NaN;
  if (!Number.isFinite(raw)) return 'earlier';
  const ageHours = (now - raw) / 3_600_000;
  if (ageHours < 24) return 'today';
  if (ageHours < 24 * 7) return 'week';
  return 'earlier';
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  notifications,
  language,
  onMarkAllAsRead,
  onClearNotifications,
  onMarkAsRead,
  onSelectTab
}) => {
  const [filter, setFilter] = useState<FilterId>('all');
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [isPromptDismissed, setIsPromptDismissed] = useState(false);

  useEffect(() => {
    setPermission(getNotificationPermission());
  }, []);

  const tr = language === 'tr';
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const counts = useMemo(
    () => ({
      all: notifications.length,
      unread: unreadCount,
      social: notifications.filter((n) => FILTER_TYPES.social.includes(n.type)).length,
      work: notifications.filter((n) => FILTER_TYPES.work.includes(n.type)).length
    }),
    [notifications, unreadCount]
  );

  const filtered = useMemo(() => {
    if (filter === 'unread') return notifications.filter((n) => !n.is_read);
    if (filter === 'all') return notifications;
    return notifications.filter((n) => FILTER_TYPES[filter].includes(n.type));
  }, [notifications, filter]);

  /** Newest first, then split into the three age buckets. */
  const groups = useMemo(() => {
    const now = Date.now();
    const sorted = [...filtered].sort((a, b) => {
      const ta = a.created_at ? Date.parse(a.created_at) : 0;
      const tb = b.created_at ? Date.parse(b.created_at) : 0;
      return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
    });

    const buckets: Array<{ id: 'today' | 'week' | 'earlier'; label: string; items: NotificationItem[] }> = [
      { id: 'today', label: tr ? 'Bugün' : 'Today', items: [] },
      { id: 'week', label: tr ? 'Bu hafta' : 'This week', items: [] },
      { id: 'earlier', label: tr ? 'Daha önce' : 'Earlier', items: [] }
    ];

    for (const item of sorted) {
      const bucket = bucketOf(item, now);
      buckets.find((b) => b.id === bucket)!.items.push(item);
    }

    return buckets.filter((b) => b.items.length > 0);
  }, [filtered, tr]);

  const handleEnableNotifications = async () => {
    const result = await requestNotificationPermission();
    setPermission(result);
  };

  const handleOpen = (item: NotificationItem) => {
    if (!item.is_read) onMarkAsRead?.(item.id);
    if (!onSelectTab) return;
    if (item.type === 'message' || item.type === 'group_invite') onSelectTab('messages');
    else if (item.type === 'job_application' || item.type === 'job_listing') onSelectTab('jobs');
    else if (item.type === 'community') onSelectTab('communities');
    else if (item.type === 'project_commit') onSelectTab('projects');
  };

  const filterTabs: Array<{ id: FilterId; label: string; count: number }> = [
    { id: 'all', label: tr ? 'Tümü' : 'All', count: counts.all },
    { id: 'unread', label: tr ? 'Okunmamış' : 'Unread', count: counts.unread },
    { id: 'social', label: tr ? 'Etkileşim' : 'Activity', count: counts.social },
    { id: 'work', label: tr ? 'İlanlar' : 'Jobs', count: counts.work }
  ];

  const showPermissionPrompt =
    permission === 'default' && !isPromptDismissed && notifications.length > 0;

  return (
    <div className="c4e-screen content-column">
      {/* Header */}
      <div className="c4e-topbar z-20">
        <div className="px-5 py-3.5 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2 min-w-0">
            <Bell className="w-5 h-5 text-zinc-300 flex-shrink-0" />
            <span className="truncate">{tr ? 'Bildirimler' : 'Notifications'}</span>
            {unreadCount > 0 && (
              <span className="flex-shrink-0 rounded-full bg-red-500 px-2 text-[11px] font-bold leading-5 text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </h2>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={onMarkAllAsRead}
              disabled={unreadCount === 0}
              className="h-9 px-2.5 rounded-xl bg-white/[0.04] border border-white/[0.07] text-zinc-400 hover:text-white hover:border-white/[0.16] disabled:opacity-40 disabled:hover:text-zinc-400 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center gap-1.5 text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title={tr ? 'Tümünü okundu işaretle' : 'Mark all as read'}
            >
              <CheckCheck className="w-4 h-4" />
              <span className="hidden xs:inline">{tr ? 'Okundu' : 'Read all'}</span>
            </button>
            <button
              type="button"
              onClick={onClearNotifications}
              disabled={notifications.length === 0}
              className="h-9 w-9 rounded-xl bg-white/[0.04] border border-white/[0.07] text-zinc-400 hover:text-red-400 hover:border-red-500/40 disabled:opacity-40 disabled:hover:text-zinc-400 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title={tr ? 'Tüm bildirimleri sil' : 'Clear all notifications'}
              aria-label={tr ? 'Tüm bildirimleri sil' : 'Clear all notifications'}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="px-3 pb-2.5 flex gap-1.5 overflow-x-auto no-scrollbar">
          {filterTabs.map((tab) => {
            const isActive = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                aria-pressed={isActive}
                className={`h-9 flex-shrink-0 rounded-full px-3.5 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isActive
                    ? 'bg-zinc-100 text-zinc-950'
                    : 'bg-white/[0.04] text-zinc-400 hover:text-white border border-white/[0.07]'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span
                    className={`text-[10px] font-mono ${isActive ? 'text-zinc-600' : 'text-zinc-500'}`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Browser permission prompt: one quiet line, dismissable, no marketing copy. */}
      {showPermissionPrompt && (
        <div className="c4e-card mx-4 mt-4 flex items-center gap-3 p-3">
          <Bell className="h-4 w-4 flex-shrink-0 text-zinc-400" />
          <p className="flex-1 min-w-0 text-[11px] leading-snug text-zinc-400">
            {tr
              ? 'Tarayıcı bildirimleri kapalı. Açarsan sekme arkadayken de haberin olur.'
              : 'Browser notifications are off. Turn them on to get notified while the tab is in the background.'}
          </p>
          <button
            type="button"
            onClick={handleEnableNotifications}
            className="h-8 flex-shrink-0 rounded-lg bg-zinc-100 px-3 text-[11px] font-bold text-zinc-950 hover:bg-white transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {tr ? 'Aç' : 'Enable'}
          </button>
          <button
            type="button"
            onClick={() => setIsPromptDismissed(true)}
            aria-label={tr ? 'Kapat' : 'Dismiss'}
            className="h-8 w-8 flex-shrink-0 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.09] transition-colors cursor-pointer flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <BellOff className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* List */}
      {groups.length === 0 ? (
        <div className="px-6 py-20 text-center">
          <div className="c4e-card mx-auto mb-4 flex h-14 w-14 items-center justify-center text-zinc-500">
            <Inbox className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-bold text-white">
            {filter === 'unread'
              ? tr ? 'Okunmamış bildirim yok' : 'No unread notifications'
              : tr ? 'Henüz bildirim yok' : 'No notifications yet'}
          </h3>
          <p className="mx-auto mt-1.5 max-w-xs text-xs leading-relaxed text-zinc-500">
            {filter === 'unread'
              ? tr ? 'Hepsini okudun. Temiz kutu.' : "You're all caught up."
              : tr
              ? 'Gönderilerin beğenildiğinde, yorum aldığında veya ilanlarına başvuru geldiğinde burada görünecek.'
              : 'Likes, comments, follows and job applications will show up here.'}
          </p>
        </div>
      ) : (
        <div>
          {groups.map((group) => (
            <section key={group.id}>
              <h3 className="bg-white/[0.03] px-5 py-2 text-[11px] font-bold uppercase tracking-wider text-zinc-500 border-y border-white/[0.07]">
                {group.label}
              </h3>

              <ul className="c4e-stagger divide-y divide-white/[0.06]">
                {group.items.map((item) => {
                  const style = TYPE_STYLES[item.type] || FALLBACK_STYLE;
                  const TypeIcon = style.icon;
                  const actorUsername = item.actor?.username || (item as any).actor_username;
                  const actorName = item.actor?.display_name || actorUsername;

                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => handleOpen(item)}
                        className={`group w-full text-left px-4 py-3.5 flex items-start gap-3 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                          item.is_read ? 'hover:bg-white/[0.06]' : 'bg-white/[0.04] hover:bg-white/[0.06]'
                        }`}
                      >
                        {/* Unread marker: a thin rail, not a coloured blob to dismiss. */}
                        <span
                          aria-hidden="true"
                          className={`mt-4 h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                            item.is_read ? 'bg-transparent' : 'bg-blue-500'
                          }`}
                        />

                        <div className="relative flex-shrink-0">
                          <UserAvatar
                            src={item.actor?.avatar_url}
                            name={actorName || '?'}
                            className="h-10 w-10 text-[11px] ring-1 ring-white/[0.08]"
                          />
                          <span
                            className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border ${style.badge} ring-2 ring-[#0a0a14]`}
                          >
                            <TypeIcon className="h-2.5 w-2.5" />
                          </span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <p
                            className={`user-text text-[13px] leading-snug ${
                              item.is_read ? 'text-zinc-400' : 'text-zinc-200'
                            }`}
                          >
                            {actorName && (
                              <span className="font-bold text-white">{actorName}</span>
                            )}
                            {actorUsername && item.actor?.display_name && (
                              <span className="ml-1 font-mono text-[11px] text-zinc-500">
                                @{actorUsername}
                              </span>
                            )}{' '}
                            <span>{item.content}</span>
                          </p>
                          <span className="mt-1 block font-mono text-[11px] text-zinc-500">
                            {item.time_ago ||
                              (item.created_at
                                ? new Date(item.created_at).toLocaleString(tr ? 'tr-TR' : 'en-US', {
                                    day: '2-digit',
                                    month: 'short',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })
                                : '')}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
