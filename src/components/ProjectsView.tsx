import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bell,
  BellOff,
  Crown,
  ExternalLink,
  GitCommit,
  Github,
  Heart,
  Loader2,
  Plus,
  Search,
  Star,
  Trash2,
  Trophy,
  Users,
  X
} from 'lucide-react';
import { UserProfile } from '../types';
import { fetchLanuxStatus, reconcileGithubLink } from '../services/lanuxClient';
import {
  createProject,
  deleteProject,
  fetchHighlights,
  fetchOwnRepos,
  fetchProjects,
  setProjectRelation,
  type Highlights,
  type Project,
  type ProjectSort,
  type RepoOption
} from '../services/projectsClient';

interface ProjectsViewProps {
  user: UserProfile;
  language: 'tr' | 'en';
  /** Seçiciyi açar; seçici App'te, çünkü aynı seçiciyi topluluk sekmesi de kullanıyor. */
  onShareProject?: (project: Project) => void;
}

/** "3 saat önce" biçiminde göreli zaman; commit tarihleri için. */
function timeAgo(iso: string | null, tr: boolean): string {
  if (!iso) return tr ? 'bilinmiyor' : 'unknown';
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return tr ? 'bilinmiyor' : 'unknown';

  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return tr ? 'az önce' : 'just now';
  if (minutes < 60) return tr ? `${minutes} dk önce` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return tr ? `${hours} sa önce` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return tr ? `${days} gün önce` : `${days}d ago`;
  return new Date(iso).toLocaleDateString(tr ? 'tr-TR' : 'en-US');
}

// -------------------------------------------------------------
// PROJE KARTI
// -------------------------------------------------------------

const ProjectCard: React.FC<{
  project: Project;
  tr: boolean;
  isOwner: boolean;
  busy: boolean;
  onLike: () => void;
  onFollow: () => void;
  onDelete: () => void;
  onOpen: () => void;
  onShare: () => void;
}> = ({ project, tr, isOwner, busy, onLike, onFollow, onDelete, onOpen, onShare }) => {
  const liked = project.liked_by_me === true;
  const followed = project.followed_by_me === true;

  return (
    <div className="c4e-card c4e-hover p-5 space-y-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <a
            href={`/project/${project.slug}`}
            onClick={(e) => {
              // Ctrl/Cmd+tık ve orta tık yeni sekmede açılsın: bağlantı gibi davranan bir
              // şeyin bağlantı gibi çalışmaması can sıkıcı.
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              onOpen();
            }}
            className="user-text block text-sm font-bold text-white transition-colors hover:text-indigo-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            {project.name}
          </a>
          <a
            href={project.repo_url}
            target="_blank"
            rel="noopener noreferrer"
            className="user-text inline-flex items-center gap-1.5 text-[11px] text-zinc-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            <Github className="h-3 w-3 flex-shrink-0" />
            <span>{project.repo_full_name}</span>
            <ExternalLink className="h-2.5 w-2.5 flex-shrink-0" />
          </a>
        </div>

        {isOwner && (
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            aria-label={tr ? 'Projeyi kaldır' : 'Remove project'}
            className="flex min-h-9 min-w-9 flex-shrink-0 items-center justify-center rounded-xl border border-white/[0.07] text-zinc-500 transition-colors hover:text-red-400 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {project.about && (
        <p className="user-text text-[12px] leading-relaxed text-zinc-400">{project.about}</p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
        <span>@{project.owner_username}</span>
        {project.language && (
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
            {project.language}
          </span>
        )}
        {project.last_commit_at && (
          <span className="flex items-center gap-1">
            <GitCommit className="h-3 w-3" />
            {tr ? 'son commit' : 'last commit'} {timeAgo(project.last_commit_at, tr)}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onLike}
          disabled={busy}
          aria-pressed={liked}
          /*
            Erişilebilir ad elle veriliyor. İçerikten türetilen ad "2beğeni" oluyordu: ekran
            okuyucuda anlamsız, ve neyin neyi beğendiği belirsiz.
          */
          aria-label={
            tr
              ? `${project.name} projesini beğen (${project.likes_count} beğeni)`
              : `Like ${project.name} (${project.likes_count} likes)`
          }
          className={`flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-[11px] font-semibold transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            liked
              ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
              : 'border-white/[0.08] text-zinc-300 hover:text-white'
          }`}
        >
          <Heart className={`h-3.5 w-3.5 ${liked ? 'fill-current' : ''}`} />
          <span>{project.likes_count}</span>
          <span>{tr ? 'beğeni' : 'likes'}</span>
        </button>

        {/*
          Takip, beğeninin "daha fazlası" değil BAŞKA bir şey: abonelik. Bu yüzden düğme
          bildirimi anlatıyor ("her commit'te haber al"), yoksa iki düğme aynı işi yapıyor
          gibi görünür ve kimse neden ikisinin de olduğunu anlamaz.
        */}
        <button
          type="button"
          onClick={onFollow}
          disabled={busy}
          aria-pressed={followed}
          aria-label={
            tr
              ? `${project.name} projesini takip et (${project.followers_count} takipçi)`
              : `Follow ${project.name} (${project.followers_count} followers)`
          }
          title={
            followed
              ? tr
                ? 'Her yeni commit için bildirim alıyorsun'
                : 'You get a notification on every new commit'
              : tr
              ? 'Takip et, her yeni commit için bildirim al'
              : 'Follow to get a notification on every new commit'
          }
          className={`flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-[11px] font-semibold transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            followed
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
              : 'border-white/[0.08] text-zinc-300 hover:text-white'
          }`}
        >
          {followed ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
          <span>{followed ? (tr ? 'Takiptesin' : 'Following') : tr ? 'Takip et' : 'Follow'}</span>
          <span className="text-zinc-500">{project.followers_count}</span>
        </button>

        {/* Topluluğa ekleme yalnızca SAHİBİNE gösteriliyor: sunucu da aynı kuralı
            uyguluyor, dolayısıyla başkasına göstermek tıklayınca hata alacağı bir
            düğme koymak olurdu. */}
        {isOwner && (
          <button
            type="button"
            onClick={onShare}
            title={tr ? 'Bu projeyi bir topluluğa ekle' : 'Add this project to a community'}
            aria-label={tr ? 'Bu projeyi bir topluluğa ekle' : 'Add this project to a community'}
            className="flex min-h-9 items-center gap-1.5 rounded-xl border border-white/[0.08] px-3 text-[11px] font-semibold text-zinc-300 transition-colors hover:border-indigo-400/40 hover:bg-indigo-500/[0.12] hover:text-indigo-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
          >
            <Users className="h-3.5 w-3.5" />
            <span>{tr ? 'Topluluğa ekle' : 'Add to community'}</span>
          </button>
        )}
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// ÖNE ÇIKANLAR
// -------------------------------------------------------------

const HighlightCard: React.FC<{
  project: Project;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accent: string;
  onOpen: () => void;
}> = ({ project, title, subtitle, icon, accent, onOpen }) => (
  <div className={`rounded-2xl border p-4 space-y-2 ${accent}`}>
    <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide">
      {icon}
      <span>{title}</span>
    </p>
    <a
      href={`/project/${project.slug}`}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onOpen();
      }}
      className="user-text block text-sm font-bold text-white transition-colors hover:text-indigo-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
    >
      {project.name}
    </a>
    <p className="user-text text-[11px] text-zinc-400">
      @{project.owner_username} · {project.repo_full_name}
    </p>
    <p className="text-[11px] font-semibold text-zinc-300">{subtitle}</p>
  </div>
);

// -------------------------------------------------------------
// OLUŞTURMA PENCERESİ
// -------------------------------------------------------------

const CreateProjectDialog: React.FC<{
  tr: boolean;
  /** Önbellekteki tahmin; gerçeği sunucuya soruyoruz. */
  cachedGithubUsername: string | null;
  onClose: () => void;
  onCreated: (project: Project) => void;
  onGithubResolved: (username: string) => void;
}> = ({ tr, cachedGithubUsername, onClose, onCreated, onGithubResolved }) => {
  const [githubUsername, setGithubUsername] = useState<string | null>(cachedGithubUsername);
  const [repos, setRepos] = useState<RepoOption[]>([]);
  // Üye "GitHub deposu bağla" dedi mi? Depo isteğe bağlı olduğu için varsayılan HAYIR.
  const [wantRepo, setWantRepo] = useState(false);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<RepoOption | null>(null);
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * GitHub bağlantısı YALNIZCA depo eklenmek istendiğinde sorgulanıyor.
   *
   * Proje paylaşmak GitHub gerektirmiyor, dolayısıyla pencere açılır açılmaz GitHub'a gitmek
   * hem gereksiz bir istek hem de yanlış bir mesaj olurdu ("demek ki GitHub lazım").
   * Doğrulama iddiayla orantılı: "şu depo benim" demiyorsan kanıt da istenmiyor.
   *
   * Bağlı görünmüyorsa bir de onarım deneniyor: GitHub ile kayıt olan üyenin kimliği auth
   * kaydında zaten var, yalnızca profil sütununa yazılmamış olabilir.
   */
  const loadRepos = async () => {
    setWantRepo(true);
    setLoadingRepos(true);

    const status = await fetchLanuxStatus();
    let username = status?.github?.linked ? status.github.username || null : null;
    if (!username) username = await reconcileGithubLink({ force: true });

    setGithubUsername(username);
    if (username) onGithubResolved(username);

    setRepos(username ? await fetchOwnRepos(username) : []);
    setLoadingRepos(false);
  };

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return repos;
    return repos.filter(
      (r) =>
        r.full_name.toLowerCase().includes(needle) ||
        (r.description || '').toLowerCase().includes(needle)
    );
  }, [repos, filter]);

  const choose = (repo: RepoOption) => {
    setSelected(repo);
    // Ad ve tanıtım depodan ön-doldurulur; çoğu kişi bunları olduğu gibi bırakmak ister,
    // isteyen değiştirir.
    setName((current) => current || repo.name);
    setAbout((current) => current || repo.description || '');
  };

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    // Depo seçilmediyse alan hiç gönderilmiyor; sunucu da onu "deposuz proje" diye anlıyor.
    const result = await createProject({
      repo: selected ? selected.full_name : '',
      name: name.trim(),
      about: about.trim()
    });
    if (result.ok && result.project) {
      onCreated(result.project);
      onClose();
      return;
    }
    setError(result.error || null);
    setBusy(false);
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-white/[0.07] bg-[#0a0a14] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
          <h2 className="text-sm font-bold text-white">{tr ? 'Proje Oluştur' : 'Create Project'}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={tr ? 'Kapat' : 'Close'}
            className="flex min-h-9 min-w-9 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {/*
            SIRA DEĞİŞTİ: ad ve tanıtım önce, depo en sonda ve İSTEĞE BAĞLI.
            Eskiden ilk adım "GitHub deposu seç"ti; bu, projenin GitHub'a ait olmasını
            zorunluymuş gibi gösteriyordu ve GitHub bağlamayan kimse hiçbir şey
            paylaşamıyordu.
          */}
          <div className="space-y-2">
            <label htmlFor="proje-adi" className="block text-[11px] font-bold uppercase tracking-wide text-zinc-500">
              {tr ? 'Proje adı' : 'Project name'}
            </label>
            <input
              id="proje-adi"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder={tr ? 'Projenin adı' : 'Project name'}
              className="min-h-11 w-full rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 text-xs text-white placeholder-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="proje-hakkinda" className="block text-[11px] font-bold uppercase tracking-wide text-zinc-500">
              {tr ? 'Hakkında' : 'About'}
            </label>
            <textarea
              id="proje-hakkinda"
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              maxLength={600}
              rows={3}
              placeholder={tr ? 'Proje ne yapıyor?' : 'What does this project do?'}
              className="w-full resize-none rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 py-2.5 text-xs leading-relaxed text-white placeholder-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="text-right text-[10px] text-zinc-600">{about.length}/600</p>
          </div>

          <div className="space-y-2 rounded-xl border border-white/[0.07] p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
              {tr ? 'GitHub deposu' : 'GitHub repository'}{' '}
              <span className="font-semibold normal-case text-zinc-600">{tr ? '(isteğe bağlı)' : '(optional)'}</span>
            </p>

            {!wantRepo ? (
              <>
                <p className="user-text text-[11px] leading-relaxed text-zinc-500">
                  {tr
                    ? 'Depo eklersen her yeni commit takipçilerine bildirim olarak gider. Eklemezsen proje yine paylaşılır.'
                    : 'Attaching a repository sends a notification to your followers on every new commit. Without one the project is still shared.'}
                </p>
                <button
                  type="button"
                  onClick={loadRepos}
                  className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-white/[0.07] text-[11px] font-semibold text-zinc-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Github className="h-3.5 w-3.5" />
                  <span>{tr ? 'GitHub deposu bağla' : 'Attach a GitHub repository'}</span>
                </button>
              </>
            ) : loadingRepos ? (
              <div className="flex items-center justify-center gap-2 p-4 text-[11px] text-zinc-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>{tr ? 'Depoların yükleniyor...' : 'Loading your repositories...'}</span>
              </div>
            ) : !githubUsername ? (
              /*
                Doğrulama YALNIZCA burada gerekiyor: "bu depo benim" iddiasını GitHub
                kanıtlıyor. Proje oluşturmayı engellemiyor — üye depoyu atlayıp devam edebilir.
              */
              <div className="space-y-2">
                <div className="flex items-start gap-2 rounded-lg border border-amber-700/50 bg-amber-950/20 p-2.5">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-400" />
                  <p className="user-text text-[11px] leading-relaxed text-amber-200/90">
                    {tr
                      ? 'Depo bağlamak için GitHub hesabın gerekiyor (Ayarlar > Bağlı Hesaplar). Deponun gerçekten senin olduğunu böyle doğruluyoruz. Depo eklemeden de projeni paylaşabilirsin.'
                      : 'Attaching a repository needs your GitHub account (Settings > Connected Accounts). That is how we verify the repository is really yours. You can still share the project without one.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setWantRepo(false)}
                  className="min-h-11 w-full rounded-xl border border-white/[0.07] text-[11px] font-semibold text-zinc-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {tr ? 'Depo eklemeden devam et' : 'Continue without a repository'}
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
                  <input
                    type="text"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder={tr ? 'Depolarında ara' : 'Search your repositories'}
                    aria-label={tr ? 'Depo ara' : 'Search repositories'}
                    className="min-h-11 w-full rounded-xl border border-white/[0.07] bg-white/[0.04] pl-9 pr-3 text-xs text-white placeholder-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>

                <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-xl border border-white/[0.07] p-1.5">
                  {visible.length === 0 ? (
                    <p className="p-4 text-center text-[11px] text-zinc-500">
                      {tr ? 'Depo bulunamadı.' : 'No repositories found.'}
                    </p>
                  ) : (
                    visible.map((repo) => (
                      <button
                        key={repo.full_name}
                        type="button"
                        onClick={() => choose(repo)}
                        className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          selected?.full_name === repo.full_name
                            ? 'bg-indigo-500/15 text-white'
                            : 'text-zinc-400 hover:bg-white/[0.06]'
                        }`}
                      >
                        <span className="user-text min-w-0 text-[12px] font-semibold">{repo.name}</span>
                        <span className="flex flex-shrink-0 items-center gap-1 text-[10px] text-zinc-500">
                          <Star className="h-2.5 w-2.5" />
                          {repo.stargazers_count}
                        </span>
                      </button>
                    ))
                  )}
                </div>

                {selected && (
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="min-h-9 text-[11px] font-semibold text-zinc-500 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                  >
                    {tr ? 'Depo seçimini kaldır' : 'Clear repository'}
                  </button>
                )}
              </>
            )}
          </div>

          {error && (
            <p className="user-text flex items-start gap-1.5 text-[11px] text-red-400">
              <AlertCircle className="mt-0.5 h-3 w-3 flex-shrink-0" />
              {error}
            </p>
          )}
        </div>

        <div className="flex gap-2 border-t border-white/[0.07] p-4">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 flex-1 rounded-xl border border-white/[0.07] text-xs font-semibold text-zinc-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {tr ? 'Vazgeç' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !name.trim()}
            className="brand-gradient flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-bold shadow-lg transition-opacity disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            <span>{tr ? 'Oluştur' : 'Create'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// GÖRÜNÜM
// -------------------------------------------------------------

export const ProjectsView: React.FC<ProjectsViewProps> = ({ user, language, onShareProject }) => {
  const tr = language === 'tr';
  const [sort, setSort] = useState<ProjectSort>('new');
  const [projects, setProjects] = useState<Project[]>([]);
  const [highlights, setHighlights] = useState<Highlights>({ week: null, all_time: null });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Önbellekten başlangıç değeri; pencere açıldığında sunucudan gelen gerçekle güncelleniyor.
  const [githubUsername, setGithubUsername] = useState<string | null>(user.github_username || null);

  const load = useCallback(async () => {
    setLoading(true);
    const [list, tops] = await Promise.all([fetchProjects(sort), fetchHighlights()]);
    setProjects(list);
    setHighlights(tops);
    setLoading(false);
  }, [sort]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Beğeni / takip.
   *
   * Sunucunun döndürdüğü sayılar yazılıyor, istemci kendi kendine +1 yapmıyor: iki sekmede
   * açık olan bir sayfa aksi hâlde farklı sayılar gösterir ve "haftanın projesi" gibi bir
   * sıralamada yanlış sayı, yanlış kazanandan daha kötüdür.
   */
  const toggle = async (project: Project, relation: 'like' | 'follow') => {
    const on = relation === 'like' ? project.liked_by_me !== true : project.followed_by_me !== true;
    setBusyId(project.id);
    const result = await setProjectRelation(project.id, relation, on);
    setBusyId(null);
    if (!result.ok) return;

    setProjects((current) =>
      current.map((p) =>
        p.id === project.id
          ? {
              ...p,
              likes_count: result.likes_count ?? p.likes_count,
              followers_count: result.followers_count ?? p.followers_count,
              ...(relation === 'like' ? { liked_by_me: on } : { followed_by_me: on })
            }
          : p
      )
    );
  };

  /**
   * Projenin sayfasına gider. `pushState` + `popstate`: uygulama kendi yönlendirmesini
   * adres çubuğundan okuyor, tam sayfa yenileme yapmadan oraya geçmenin yolu bu.
   */
  const openProject = (project: Project) => {
    window.history.pushState(null, '', `/project/${project.slug}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const remove = async (project: Project) => {
    setBusyId(project.id);
    const done = await deleteProject(project.id);
    setBusyId(null);
    if (done) setProjects((current) => current.filter((p) => p.id !== project.id));
  };

  const tabs: { key: ProjectSort; label: string }[] = [
    { key: 'new', label: tr ? 'Yeni' : 'New' },
    { key: 'top', label: tr ? 'En çok beğenilen' : 'Most liked' },
    { key: 'mine', label: tr ? 'Benim projelerim' : 'My projects' }
  ];

  return (
    <div className="content-column min-h-screen w-full min-w-0 flex-1 border-r border-white/[0.07] pb-16">
      <div className="sticky top-0 z-20 border-b border-white/[0.07] bg-[#0a0a14]/90 px-4 py-3 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight text-white">
            <Github className="h-5 w-5 text-indigo-400" />
            <span>{tr ? 'Projeler' : 'Projects'}</span>
          </h2>

          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="brand-gradient flex min-h-9 items-center gap-1.5 rounded-xl px-3.5 text-xs font-bold shadow-lg transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{tr ? 'Proje Oluştur' : 'Create'}</span>
          </button>
        </div>

        <div className="mt-3 flex gap-1.5 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setSort(tab.key)}
              className={`min-h-9 flex-shrink-0 rounded-xl px-3 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                sort === tab.key ? 'nav-active text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4 p-4">
        {(highlights.week || highlights.all_time) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {highlights.week && (
              <HighlightCard
                project={highlights.week}
                title={tr ? 'Haftanın Projesi' : 'Project of the Week'}
                subtitle={
                  tr
                    ? `Son 7 günde ${highlights.week.weekly_likes ?? 0} beğeni`
                    : `${highlights.week.weekly_likes ?? 0} likes in the last 7 days`
                }
                icon={<Trophy className="h-3 w-3" />}
                accent="border-amber-700/40 bg-amber-950/20 text-amber-300"
                onOpen={() => openProject(highlights.week!)}
              />
            )}
            {highlights.all_time && (
              <HighlightCard
                project={highlights.all_time}
                title={tr ? 'Tüm Zamanların En Çok Beğenileni' : 'All-Time Most Liked'}
                subtitle={
                  tr
                    ? `Toplam ${highlights.all_time.likes_count} beğeni`
                    : `${highlights.all_time.likes_count} likes in total`
                }
                icon={<Crown className="h-3 w-3" />}
                accent="border-indigo-700/40 bg-indigo-950/20 text-indigo-300"
                onOpen={() => openProject(highlights.all_time!)}
              />
            )}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-xs text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{tr ? 'Projeler yükleniyor...' : 'Loading projects...'}</span>
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/[0.07] p-8 text-center">
            <Github className="mx-auto mb-3 h-7 w-7 text-zinc-700" />
            <p className="text-xs text-zinc-400">
              {sort === 'mine'
                ? tr
                  ? 'Henüz bir projen yok.'
                  : 'You have no projects yet.'
                : tr
                ? 'Henüz proje eklenmemiş. İlk olan sen ol.'
                : 'No projects yet. Be the first.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                tr={tr}
                isOwner={project.owner_username === user.username}
                busy={busyId === project.id}
                onLike={() => toggle(project, 'like')}
                onFollow={() => toggle(project, 'follow')}
                onDelete={() => remove(project)}
                onOpen={() => openProject(project)}
                onShare={() => onShareProject?.(project)}
              />
            ))}
          </div>
        )}

        {/*
          Takibin ne işe yaradığını bir kez açıkça söylüyoruz. Beğeni ve takip düğmeleri yan
          yana durduğunda aradaki fark ("biri vitrin, öteki abonelik") kendiliğinden anlaşılmaz.
        */}
        <p className="user-text px-1 text-center text-[11px] leading-relaxed text-zinc-600">
          {tr
            ? 'Bir projeyi takip edersen her yeni commit için bildirim alırsın. Takip etmezsen sadece beğenirsin, bildirim gelmez.'
            : 'Follow a project to get a notification on every new commit. Without following you can still like it, but you get no notifications.'}
        </p>
      </div>

      {showCreate && (
        <CreateProjectDialog
          tr={tr}
          cachedGithubUsername={githubUsername}
          onGithubResolved={setGithubUsername}
          onClose={() => setShowCreate(false)}
          onCreated={(project) => {
            setProjects((current) => [project, ...current]);
          }}
        />
      )}
    </div>
  );
};
