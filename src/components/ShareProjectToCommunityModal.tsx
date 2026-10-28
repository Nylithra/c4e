/**
 * "Projeni bir topluluğa ekle" seçicisi.
 *
 * Yalnızca ÜYESİ OLUNAN topluluklar listeleniyor. Hepsini gösterip tıklayınca hata
 * vermek, kullanıcıya önce bir kapı açıp sonra yüzüne kapatmak olurdu; sunucu zaten
 * üyeliği arıyor, arayüz de aynı kuralı baştan gösteriyor.
 *
 * Sayfa hangi projeyi paylaştığını biliyor; seçici yalnızca HANGİ TOPLULUK sorusunu
 * soruyor ve her satır bağımsız olarak açılıp kapanıyor (bir proje birden fazla
 * toplulukta olabilir).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Lock, Search, Users, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { fetchProjectCommunityIds, setProjectCommunity, type Project } from '../services/projectsClient';
import { Community, UserProfile } from '../types';

interface ShareProjectToCommunityModalProps {
  isOpen: boolean;
  /** Seçili proje. null ise ve `projects` doluysa önce proje sorulur. */
  project: Project | null;
  /** Üyenin kendi projeleri — proje seçme adımı için. */
  projects?: Project[];
  onPickProject?: (project: Project) => void;
  communities: Community[];
  user: UserProfile;
  language: 'tr' | 'en';
  onClose: () => void;
  /** Bir bağ değiştiğinde üst ekran listesini tazeleyebilsin. */
  onChanged?: () => void;
}

export const ShareProjectToCommunityModal: React.FC<ShareProjectToCommunityModalProps> = ({
  isOpen,
  project,
  projects = [],
  onPickProject,
  communities,
  user,
  language,
  onClose,
  onChanged
}) => {
  const tr = language === 'tr';
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // Yalnızca üyesi olunan topluluklar.
  const mine = useMemo(() => {
    const joined = new Set((user.joined_communities || []).map(String));
    return communities.filter((c) => joined.has(c.id));
  }, [communities, user.joined_communities]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mine;
    return mine.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.handle || '').toLowerCase().includes(q)
    );
  }, [mine, query]);

  useEffect(() => {
    if (!isOpen || !project) return;
    let alive = true;
    setLoading(true);
    setError(null);
    setQuery('');
    fetchProjectCommunityIds(project.id).then((ids) => {
      if (!alive) return;
      setSelected(new Set(ids));
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [isOpen, project]);

  const toggle = async (community: Community) => {
    if (!project) return;
    const on = !selected.has(community.id);
    setBusyId(community.id);
    setError(null);

    const result = await setProjectCommunity(community.id, project.id, on);
    if (result.ok) {
      setSelected((prev) => {
        const next = new Set(prev);
        if (on) next.add(community.id);
        else next.delete(community.id);
        return next;
      });
      onChanged?.();
    } else {
      setError(result.error || (tr ? 'İşlem tamamlanamadı.' : 'Could not complete.'));
    }
    setBusyId(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-indigo-400" />
            {tr ? 'Topluluğa ekle' : 'Add to a community'}
          </DialogTitle>
        </DialogHeader>

        {/* Proje henüz seçilmediyse önce o soruluyor. Topluluk listesini gösterip
            "hangi proje?" sorusunu sonraya bırakmak, seçimin neye uygulandığını
            belirsiz bırakırdı. */}
        {!project && (
          <div className="space-y-1.5">
            {projects.length === 0 ? (
              <div className="px-2 py-10 text-center">
                <p className="text-sm font-bold text-zinc-300">
                  {tr ? 'Henüz bir projen yok' : 'You have no projects yet'}
                </p>
                <p className="mx-auto mt-1.5 max-w-[17rem] text-xs leading-relaxed text-zinc-500">
                  {tr
                    ? 'Projeler sekmesinden bir proje oluşturduğunda burada seçebilirsin.'
                    : 'Create one from the Projects tab and it will show up here.'}
                </p>
              </div>
            ) : (
              <>
                <p className="px-0.5 text-xs font-bold text-zinc-400">
                  {tr ? 'Hangi projeyi ekleyeceksin?' : 'Which project?'}
                </p>
                <div className="max-h-72 space-y-1.5 overflow-y-auto pr-0.5">
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onPickProject?.(p)}
                      className="flex w-full items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2.5 text-left transition-all hover:border-indigo-500/50 hover:bg-indigo-500/5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-zinc-800 text-xs font-extrabold text-zinc-300">
                        {p.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-zinc-100">{p.name}</span>
                        {p.about && (
                          <span className="block truncate text-[11px] text-zinc-500">{p.about}</span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {project && (
          <p className="-mt-1 truncate text-xs text-zinc-400">
            <span className="text-zinc-500">{tr ? 'Proje:' : 'Project:'}</span>{' '}
            <strong className="text-zinc-200">{project.name}</strong>
          </p>
        )}

        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {error}
          </div>
        )}

        {project && mine.length > 3 && (
          <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2">
            <Search className="h-3.5 w-3.5 flex-none text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr ? 'Topluluk ara…' : 'Search communities…'}
              className="w-full bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={tr ? 'Aramayı temizle' : 'Clear search'}
                className="flex-none text-zinc-500 hover:text-zinc-300 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {project && <div className="max-h-72 space-y-1.5 overflow-y-auto pr-0.5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {tr ? 'Yükleniyor…' : 'Loading…'}
            </div>
          ) : mine.length === 0 ? (
            <div className="px-2 py-10 text-center">
              <p className="text-sm font-bold text-zinc-300">
                {tr ? 'Henüz bir topluluğa katılmadın' : 'You have not joined a community yet'}
              </p>
              <p className="mx-auto mt-1.5 max-w-[16rem] text-xs leading-relaxed text-zinc-500">
                {tr
                  ? 'Projeni yalnızca üyesi olduğun topluluklara ekleyebilirsin.'
                  : 'You can only add your project to communities you belong to.'}
              </p>
            </div>
          ) : visible.length === 0 ? (
            <p className="py-10 text-center text-xs text-zinc-500">
              {tr ? 'Eşleşen topluluk yok.' : 'No matching community.'}
            </p>
          ) : (
            visible.map((community) => {
              const on = selected.has(community.id);
              const busy = busyId === community.id;
              return (
                <button
                  key={community.id}
                  type="button"
                  onClick={() => toggle(community)}
                  disabled={busy}
                  aria-pressed={on}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all disabled:opacity-60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    on
                      ? 'border-indigo-500/50 bg-indigo-500/10'
                      : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700 hover:bg-zinc-900/60'
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 flex-none items-center justify-center rounded-lg text-xs font-extrabold ${
                      on ? 'bg-indigo-500 text-white' : 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    {community.name.charAt(0).toUpperCase()}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-bold text-zinc-100">{community.name}</span>
                      {community.is_private && <Lock className="h-3 w-3 flex-none text-amber-400" />}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-zinc-500">
                      {community.handle}
                    </span>
                  </span>

                  <span className="flex-none">
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                    ) : on ? (
                      <Check className="h-4 w-4 text-indigo-300" />
                    ) : (
                      <span className="block h-4 w-4 rounded-md border border-zinc-700" />
                    )}
                  </span>
                </button>
              );
            })
          )}
        </div>}

        {project && <p className="text-[11px] leading-relaxed text-zinc-500">
          {tr
            ? 'Bir proje birden fazla toplulukta paylaşılabilir. İstediğin zaman geri alabilirsin.'
            : 'A project can be shared with more than one community. You can undo this at any time.'}
        </p>}
      </DialogContent>
    </Dialog>
  );
};
