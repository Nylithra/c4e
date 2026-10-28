import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Bell,
  BellOff,
  ExternalLink,
  GitCommit,
  Github,
  Heart,
  ImagePlus,
  Loader2,
  Pencil,
  Save,
  Trash2,
  X
} from 'lucide-react';
import {
  fetchProjectBySlug,
  setProjectRelation,
  updateProject,
  type Project
} from '../../services/projectsClient';
import { shrinkImage } from '../../utils/imageResize';

/**
 * /project/<slug> — projenin herkese açık sayfası.
 *
 * OTURUM GEREKTİRMEZ. Sayfanın bütün amacı paylaşılabilir olması: bağlantıyı alan biri,
 * hesabı olmasa bile projeyi görebilmeli. Bu yüzden bileşen giriş durumundan bağımsız
 * çalışıyor; oturum yalnızca beğeni/takip ve düzenleme için gerekiyor.
 *
 * Sahibi üstteki kalem düğmesiyle sayfayı yerinde düzenliyor — ayrı bir yönetim ekranı
 * yerine, gördüğü şeyin üstünde.
 */

interface ProjectPageViewProps {
  slug: string;
  language: 'tr' | 'en';
  /** Oturum sahibinin kimliği; yoksa ziyaretçi. */
  currentUserId?: string | null;
  onBack?: () => void;
}

function timeAgo(iso: string | null | undefined, tr: boolean): string {
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

const MAX_GALLERY = 6;

export const ProjectPageView: React.FC<ProjectPageViewProps> = ({
  slug,
  language,
  currentUserId,
  onBack
}) => {
  const tr = language === 'tr';
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Düzenleme taslağı. Kaydedilene kadar görünen veriye dokunulmuyor: vazgeçen kullanıcı
  // sayfayı olduğu gibi geri bulmalı.
  const [draft, setDraft] = useState({ name: '', about: '', description: '' });
  const [cover, setCover] = useState<string | null>(null);
  const [gallery, setGallery] = useState<string[]>([]);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const coverInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const found = await fetchProjectBySlug(slug);
    setProject(found);
    setLoading(false);
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  // Sayfa başlığı adresle birlikte değişsin: paylaşılan sekme "Code4Ever" değil projenin
  // adını göstersin.
  useEffect(() => {
    if (!project) return;
    const previous = document.title;
    document.title = `${project.name} · Code4Ever`;
    return () => {
      document.title = previous;
    };
  }, [project]);

  const isOwner = Boolean(currentUserId && project && project.owner_id === currentUserId);

  const beginEdit = () => {
    if (!project) return;
    setDraft({
      name: project.name || '',
      about: project.about || '',
      description: project.description || ''
    });
    setCover(project.cover_url || null);
    setGallery(Array.isArray(project.gallery) ? project.gallery : []);
    setError(null);
    setEditing(true);
  };

  const pickImage = async (file: File | undefined, target: 'cover' | 'gallery') => {
    if (!file || !file.type.startsWith('image/')) return;
    setBusy(true);
    setError(null);
    try {
      const shrunk = await shrinkImage(file);
      if (target === 'cover') setCover(shrunk);
      else setGallery((current) => (current.length >= MAX_GALLERY ? current : [...current, shrunk]));
    } catch {
      setError(tr ? 'Görsel okunamadı.' : 'Could not read the image.');
    }
    setBusy(false);
  };

  const save = async () => {
    if (!project || !draft.name.trim()) return;
    setBusy(true);
    setError(null);
    const result = await updateProject(project.id, {
      name: draft.name.trim(),
      about: draft.about.trim(),
      description: draft.description.trim(),
      cover_url: cover,
      gallery
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || null);
      return;
    }
    setEditing(false);
    await load();
  };

  const toggle = async (relation: 'like' | 'follow') => {
    if (!project) return;
    const on = relation === 'like' ? project.liked_by_me !== true : project.followed_by_me !== true;
    setBusy(true);
    const result = await setProjectRelation(project.id, relation, on);
    setBusy(false);
    if (!result.ok) return;
    setProject((current) =>
      current
        ? {
            ...current,
            likes_count: result.likes_count ?? current.likes_count,
            followers_count: result.followers_count ?? current.followers_count,
            ...(relation === 'like' ? { liked_by_me: on } : { followed_by_me: on })
          }
        : current
    );
  };

  const shownGallery = useMemo(
    () => (editing ? gallery : Array.isArray(project?.gallery) ? project!.gallery! : []),
    [editing, gallery, project]
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-xs text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{tr ? 'Proje yükleniyor...' : 'Loading project...'}</span>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center">
        <Github className="h-8 w-8 text-zinc-700" />
        <p className="text-sm font-bold text-white">{tr ? 'Proje bulunamadı' : 'Project not found'}</p>
        <p className="user-text max-w-sm text-xs text-zinc-500">
          {tr
            ? 'Bu adreste bir proje yok. Silinmiş ya da adres yanlış yazılmış olabilir.'
            : 'There is no project at this address. It may have been removed, or the link is wrong.'}
        </p>
        <a
          href="/"
          className="brand-gradient mt-2 flex min-h-11 items-center rounded-xl px-4 text-xs font-bold shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {tr ? 'Code4Ever’e git' : 'Go to Code4Ever'}
        </a>
      </div>
    );
  }

  const liked = project.liked_by_me === true;
  const followed = project.followed_by_me === true;

  return (
    <div className="min-h-screen pb-20">
      {/* ÜST ÇUBUK */}
      <div className="sticky top-0 z-20 border-b border-white/[0.07] bg-[#0a0a14]/90 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => (onBack ? onBack() : (window.location.href = '/projects'))}
            className="flex min-h-9 items-center gap-1.5 rounded-xl px-2 text-xs font-semibold text-zinc-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>{tr ? 'Projeler' : 'Projects'}</span>
          </button>

          {isOwner && !editing && (
            <button
              type="button"
              onClick={beginEdit}
              className="flex min-h-9 items-center gap-1.5 rounded-xl border border-white/[0.07] px-3 text-xs font-semibold text-zinc-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Pencil className="h-3.5 w-3.5" />
              <span>{tr ? 'Düzenle' : 'Edit'}</span>
            </button>
          )}

          {editing && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={busy}
                className="min-h-9 rounded-xl border border-white/[0.07] px-3 text-xs font-semibold text-zinc-400 transition-colors hover:text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {tr ? 'Vazgeç' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={save}
                disabled={busy || !draft.name.trim()}
                className="brand-gradient flex min-h-9 items-center gap-1.5 rounded-xl px-3.5 text-xs font-bold shadow-lg disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                <span>{tr ? 'Kaydet' : 'Save'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-5 p-4">
        {/* KAPAK */}
        <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-black/25">
          {(editing ? cover : project.cover_url) ? (
            <img
              src={(editing ? cover : project.cover_url) as string}
              alt={tr ? `${project.name} kapak görseli` : `${project.name} cover image`}
              className="h-48 w-full object-cover sm:h-64"
            />
          ) : (
            <div className="flex h-32 w-full items-center justify-center bg-gradient-to-br from-indigo-950/40 to-violet-950/40 sm:h-40">
              <Github className="h-8 w-8 text-zinc-700" />
            </div>
          )}

          {editing && (
            <div className="absolute bottom-3 right-3 flex gap-2">
              {cover && (
                <button
                  type="button"
                  onClick={() => setCover(null)}
                  className="flex min-h-9 items-center gap-1.5 rounded-xl bg-black/70 px-3 text-[11px] font-semibold text-white backdrop-blur focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>{tr ? 'Kaldır' : 'Remove'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => coverInput.current?.click()}
                className="flex min-h-9 items-center gap-1.5 rounded-xl bg-black/70 px-3 text-[11px] font-semibold text-white backdrop-blur focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ImagePlus className="h-3.5 w-3.5" />
                <span>{tr ? 'Kapak seç' : 'Choose cover'}</span>
              </button>
              <input
                ref={coverInput}
                type="file"
                accept="image/*"
                className="hidden"
                aria-label={tr ? 'Kapak görseli' : 'Cover image'}
                onChange={(e) => void pickImage(e.target.files?.[0], 'cover')}
              />
            </div>
          )}
        </div>

        {/* BAŞLIK */}
        {editing ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="pp-ad" className="block text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                {tr ? 'Proje adı' : 'Project name'}
              </label>
              <input
                id="pp-ad"
                type="text"
                value={draft.name}
                maxLength={80}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                className="min-h-11 w-full rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 text-sm font-bold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="pp-ozet" className="block text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                {tr ? 'Kısa tanıtım' : 'Short summary'}
              </label>
              <input
                id="pp-ozet"
                type="text"
                value={draft.about}
                maxLength={600}
                onChange={(e) => setDraft((d) => ({ ...d, about: e.target.value }))}
                placeholder={tr ? 'Listede görünen tek satır' : 'One line shown in the list'}
                className="min-h-11 w-full rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 text-xs text-white placeholder-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <h1 className="user-text text-xl font-bold tracking-tight text-white">{project.name}</h1>
            {project.about && (
              <p className="user-text text-xs leading-relaxed text-zinc-400">{project.about}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
              <a
                href={`/@${project.owner_username}`}
                className="transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                @{project.owner_username}
              </a>
              {project.language && (
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                  {project.language}
                </span>
              )}
              {project.repo_full_name && (
                <a
                  href={project.repo_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="user-text flex items-center gap-1.5 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                >
                  <Github className="h-3 w-3 flex-shrink-0" />
                  <span>{project.repo_full_name}</span>
                  <ExternalLink className="h-2.5 w-2.5 flex-shrink-0" />
                </a>
              )}
              {project.last_commit_at && (
                <span className="flex items-center gap-1">
                  <GitCommit className="h-3 w-3" />
                  {tr ? 'son commit' : 'last commit'} {timeAgo(project.last_commit_at, tr)}
                </span>
              )}
            </div>
          </div>
        )}

        {/* BEĞEN / TAKİP */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => toggle('like')}
            disabled={busy || !currentUserId}
            aria-pressed={liked}
            aria-label={tr ? `${project.name} projesini beğen` : `Like ${project.name}`}
            title={!currentUserId ? (tr ? 'Beğenmek için giriş yap' : 'Sign in to like') : undefined}
            className={`flex min-h-11 items-center gap-1.5 rounded-xl border px-3.5 text-xs font-semibold transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              liked ? 'border-rose-500/40 bg-rose-500/10 text-rose-300' : 'border-white/[0.07] text-zinc-400 hover:text-white'
            }`}
          >
            <Heart className={`h-3.5 w-3.5 ${liked ? 'fill-current' : ''}`} />
            <span>{project.likes_count}</span>
            <span>{tr ? 'beğeni' : 'likes'}</span>
          </button>

          <button
            type="button"
            onClick={() => toggle('follow')}
            disabled={busy || !currentUserId}
            aria-pressed={followed}
            aria-label={tr ? `${project.name} projesini takip et` : `Follow ${project.name}`}
            title={
              !currentUserId
                ? tr
                  ? 'Takip etmek için giriş yap'
                  : 'Sign in to follow'
                : tr
                ? 'Her yeni commit için bildirim al'
                : 'Get a notification on every new commit'
            }
            className={`flex min-h-11 items-center gap-1.5 rounded-xl border px-3.5 text-xs font-semibold transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              followed
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'border-white/[0.07] text-zinc-400 hover:text-white'
            }`}
          >
            {followed ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
            <span>{followed ? (tr ? 'Takiptesin' : 'Following') : tr ? 'Takip et' : 'Follow'}</span>
            <span className="text-zinc-500">{project.followers_count}</span>
          </button>
        </div>

        {/* AÇIKLAMA */}
        {editing ? (
          <div className="space-y-1.5">
            <label htmlFor="pp-aciklama" className="block text-[11px] font-bold uppercase tracking-wide text-zinc-500">
              {tr ? 'Proje açıklaması' : 'Project description'}
            </label>
            <textarea
              id="pp-aciklama"
              value={draft.description}
              maxLength={4000}
              rows={10}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              placeholder={
                tr
                  ? 'Proje ne yapıyor, nasıl çalışıyor, neden yazdın?'
                  : 'What does it do, how does it work, why did you build it?'
              }
              className="w-full resize-y rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 py-2.5 text-xs leading-relaxed text-white placeholder-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="text-right text-[10px] text-zinc-600">{draft.description.length}/4000</p>
          </div>
        ) : (
          project.description && (
            <div className="rounded-2xl border border-white/[0.07] bg-black/25 p-4">
              {/*
                whitespace-pre-wrap: açıklama düz metin olarak saklanıyor ve satır araları
                yazanın niyetidir. HTML olarak basmıyoruz — React metni kaçışlıyor ve
                kullanıcı içeriği hiçbir yerde ham HTML olarak render edilmiyor.
              */}
              <p className="user-text whitespace-pre-wrap text-xs leading-relaxed text-zinc-300">
                {project.description}
              </p>
            </div>
          )
        )}

        {/* GALERİ */}
        {(shownGallery.length > 0 || editing) && (
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
              {tr ? 'Proje içerisinden görüntüler' : 'Images from the project'}
              {editing && (
                <span className="ml-1 font-semibold normal-case text-zinc-600">
                  {shownGallery.length}/{MAX_GALLERY}
                </span>
              )}
            </p>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {shownGallery.map((src, index) => (
                <div key={`${index}-${src.slice(-24)}`} className="group relative overflow-hidden rounded-xl border border-white/[0.07]">
                  <img
                    src={src}
                    alt={tr ? `${project.name} görsel ${index + 1}` : `${project.name} image ${index + 1}`}
                    className="h-28 w-full object-cover"
                  />
                  {editing ? (
                    <button
                      type="button"
                      onClick={() => setGallery((current) => current.filter((_, i) => i !== index))}
                      aria-label={tr ? `Görsel ${index + 1} kaldır` : `Remove image ${index + 1}`}
                      className="absolute right-1.5 top-1.5 flex min-h-9 min-w-9 items-center justify-center rounded-lg bg-black/70 text-white backdrop-blur focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setLightbox(src)}
                      aria-label={tr ? `Görsel ${index + 1} büyüt` : `Open image ${index + 1}`}
                      className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  )}
                </div>
              ))}

              {editing && shownGallery.length < MAX_GALLERY && (
                <>
                  <button
                    type="button"
                    onClick={() => galleryInput.current?.click()}
                    disabled={busy}
                    className="flex h-28 items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/[0.07] text-[11px] font-semibold text-zinc-500 transition-colors hover:text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                    <span>{tr ? 'Görsel ekle' : 'Add image'}</span>
                  </button>
                  <input
                    ref={galleryInput}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    aria-label={tr ? 'Galeri görseli' : 'Gallery image'}
                    onChange={(e) => {
                      void pickImage(e.target.files?.[0], 'gallery');
                      // Aynı dosyayı ikinci kez seçmek de olay üretsin.
                      e.target.value = '';
                    }}
                  />
                </>
              )}
            </div>

            {editing && (
              <p className="user-text text-[11px] leading-relaxed text-zinc-600">
                {tr
                  ? 'Görseller yüklenmeden önce küçültülür; telefon fotoğrafını olduğu gibi seçebilirsin.'
                  : 'Images are shrunk before upload, so a phone photo can be selected as is.'}
              </p>
            )}
          </div>
        )}

        {error && (
          <p className="user-text flex items-start gap-1.5 text-[11px] text-red-400">
            <AlertCircle className="mt-0.5 h-3 w-3 flex-shrink-0" />
            {error}
          </p>
        )}
      </div>

      {/* BÜYÜTÜLMÜŞ GÖRSEL */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[400] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            aria-label={tr ? 'Kapat' : 'Close'}
            className="absolute right-4 top-4 flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-white/[0.04] text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" />
          </button>
          <img src={lightbox} alt="" className="max-h-full max-w-full rounded-xl object-contain" />
        </div>
      )}
    </div>
  );
};
