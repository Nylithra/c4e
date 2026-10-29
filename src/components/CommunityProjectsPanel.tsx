/**
 * Bir topluluğa paylaşılmış projelerin listesi.
 *
 * Kaldırma yetkisi İKİ kişide: projenin sahibi kendi girdisini geri alabilir,
 * topluluğun kurucusu ise topluluğundaki herhangi bir girdiyi kaldırabilir. İkincisi
 * moderasyon için şart — yoksa topluluk sahibi, topluluğuna konan alakasız bir projeyi
 * kaldıramazdı. Burada yalnızca DÜĞME gösteriliyor; asıl karar sunucuda veriliyor,
 * dolayısıyla buradaki kontrolü atlatmak bir şey kazandırmaz.
 */
import React, { useEffect, useState } from 'react';
import { Code2, ExternalLink, Github, Heart, Loader2, Plus, Star, Trash2, Users } from 'lucide-react';
import {
  fetchCommunityProjects,
  setProjectCommunity,
  type CommunityProject
} from '../services/projectsClient';
import { Community, UserProfile } from '../types';

interface CommunityProjectsPanelProps {
  community: Community;
  user: UserProfile;
  language: 'tr' | 'en';
  isMember: boolean;
  /** Üyenin paylaşabileceği bir projesi varsa seçici açılsın. */
  onOpenShare?: () => void;
  onOpenProject?: (slug: string) => void;
}

function timeAgo(iso: string | null, tr: boolean): string {
  if (!iso) return tr ? 'bilinmiyor' : 'unknown';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return tr ? 'az önce' : 'just now';
  if (min < 60) return tr ? `${min} dk önce` : `${min}m ago`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return tr ? `${hour} sa önce` : `${hour}h ago`;
  const day = Math.floor(hour / 24);
  if (day < 30) return tr ? `${day} gün önce` : `${day}d ago`;
  return new Date(iso).toLocaleDateString(tr ? 'tr-TR' : 'en-US');
}

export const CommunityProjectsPanel: React.FC<CommunityProjectsPanelProps> = ({
  community,
  user,
  language,
  isMember,
  onOpenShare,
  onOpenProject
}) => {
  const tr = language === 'tr';
  const [projects, setProjects] = useState<CommunityProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isCommunityOwner =
    (community.created_by && community.created_by === user.id) ||
    (community.creator_username || '').toLowerCase() === (user.username || '').toLowerCase();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchCommunityProjects(community.id).then((rows) => {
      if (!alive) return;
      setProjects(rows);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [community.id]);

  const handleRemove = async (project: CommunityProject) => {
    setBusyId(project.id);
    setError(null);
    const result = await setProjectCommunity(community.id, project.id, false);
    if (result.ok) {
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
    } else {
      setError(result.error || (tr ? 'Kaldırılamadı.' : 'Could not remove.'));
    }
    setBusyId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        {tr ? 'Projeler yükleniyor…' : 'Loading projects…'}
      </div>
    );
  }

  return (
    <div className="px-4 py-4 space-y-3">
      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
          {error}
        </div>
      )}

      {/* Paylaşma çağrısı yalnızca ÜYEYE gösteriliyor: üye olmayan zaten ekleyemez ve
          tıklayınca hata alacağı bir düğme göstermek kötü bir davet. */}
      {isMember && onOpenShare && (
        <button
          type="button"
          onClick={onOpenShare}
          className="group flex w-full items-center gap-3 c4e-empty px-5 py-4 text-left transition-all hover:border-indigo-400/50 hover:bg-indigo-500/[0.07] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-white/[0.06] text-zinc-300 transition-colors group-hover:bg-indigo-500/20 group-hover:text-indigo-200">
            <Plus className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-zinc-200 group-hover:text-white">
              {tr ? 'Projeni bu topluluğa ekle' : 'Add your project here'}
            </span>
            <span className="block text-[11px] text-zinc-500">
              {tr
                ? 'Yalnızca kendi projelerini ekleyebilirsin.'
                : 'You can only add projects you own.'}
            </span>
          </span>
        </button>
      )}

      {projects.length === 0 ? (
        <div className="c4e-empty px-6 py-16 text-center">
          <div className="c4e-card mx-auto mb-3 flex h-12 w-12 items-center justify-center text-zinc-600">
            <Code2 className="h-5 w-5" />
          </div>
          <p className="text-sm font-bold text-zinc-300">
            {tr ? 'Bu toplulukta henüz proje yok' : 'No projects here yet'}
          </p>
          <p className="mx-auto mt-1.5 max-w-xs text-xs leading-relaxed text-zinc-500">
            {tr
              ? 'Topluluğa eklenen projeler burada listelenir. İlk ekleyen sen ol.'
              : 'Projects shared with this community appear here. Be the first.'}
          </p>
        </div>
      ) : (
        projects.map((project) => {
          const canRemove = project.owner_id === user.id || isCommunityOwner;
          return (
            <article
              key={project.id}
              className="group c4e-card c4e-hover p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <a
                    href={`/project/${project.slug}`}
                    onClick={(e) => {
                      // Ctrl/Cmd+tık ve orta tık yeni sekmede açılsın.
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                      if (!onOpenProject) return;
                      e.preventDefault();
                      onOpenProject(project.slug);
                    }}
                    className="user-text block truncate text-sm font-bold text-white transition-colors hover:text-indigo-300 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {project.name}
                  </a>

                  {project.repo_full_name && (
                    <a
                      href={project.repo_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="user-text inline-flex items-center gap-1.5 text-[11px] text-zinc-400 transition-colors hover:text-white rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Github className="h-3 w-3 flex-none" />
                      <span className="truncate">{project.repo_full_name}</span>
                      <ExternalLink className="h-2.5 w-2.5 flex-none" />
                    </a>
                  )}
                </div>

                {canRemove && (
                  <button
                    type="button"
                    onClick={() => handleRemove(project)}
                    disabled={busyId === project.id}
                    title={tr ? 'Topluluktan kaldır' : 'Remove from community'}
                    aria-label={tr ? 'Topluluktan kaldır' : 'Remove from community'}
                    className="flex h-8 w-8 flex-none items-center justify-center rounded-xl border border-white/[0.08] text-zinc-400 transition-colors hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {busyId === project.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>

              {project.about && (
                <p className="user-text mt-2 line-clamp-2 text-xs leading-relaxed text-zinc-400">
                  {project.about}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-white/[0.06] pt-3.5 font-mono text-[11px] text-zinc-500">
                <span className="inline-flex items-center gap-1.5">
                  <Heart className="h-3 w-3 text-rose-400" />
                  <strong className="text-zinc-300">{project.likes_count}</strong>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Users className="h-3 w-3 text-indigo-400" />
                  <strong className="text-zinc-300">{project.followers_count}</strong>
                </span>
                {project.language && (
                  <span className="inline-flex items-center gap-1.5">
                    <Star className="h-3 w-3 text-amber-400" />
                    {project.language}
                  </span>
                )}
                <span className="ml-auto">
                  {project.added_by_username ? `@${project.added_by_username} · ` : ''}
                  {timeAgo(project.added_at, tr)}
                </span>
              </div>
            </article>
          );
        })
      )}
    </div>
  );
};
