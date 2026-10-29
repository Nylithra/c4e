import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, TrendingUp, Code2, Users, ArrowUpRight, Loader2, Database } from 'lucide-react';
import { Post, Community, Trend } from '../types';
import { UserAvatar } from './ui/avatar';
import { searchPostsOnServer } from '../services/supabaseClient';

/**
 * Dil süzgecinde gösterilen diller. Serbest metin yerine sabit bir liste, çünkü değer
 * doğrudan `code_language = ?` sorgusuna gidiyor ve orada yazım hatası sessiz bir "sonuç
 * yok" üretirdi.
 */
const LANGUAGES = [
  'typescript', 'javascript', 'python', 'java', 'csharp', 'cpp', 'go',
  'rust', 'php', 'ruby', 'kotlin', 'swift', 'sql', 'bash', 'html', 'css'
];

interface ExploreViewProps {
  posts: Post[];
  communities: Community[];
  trends: Trend[];
  language: 'tr' | 'en';
  onLikePost: (id: string) => void;
  onSelectCommunity: (id: string) => void;
}

export const ExploreView: React.FC<ExploreViewProps> = ({
  posts,
  communities,
  trends,
  language,
  onSelectCommunity
}) => {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'posts' | 'communities'>('all');
  const [codeOnly, setCodeOnly] = useState(false);
  const [lang, setLang] = useState('');

  // Sunucu araması
  const [serverPosts, setServerPosts] = useState<Post[] | null>(null);
  const [searching, setSearching] = useState(false);
  const requestId = useRef(0);

  const q = (query || '').toLowerCase().trim();

  /** Yerel arama: sunucuya ulaşılamadığında ve yazarken anında geri bildirim için. */
  const localPosts = useMemo(
    () =>
      posts.filter((p) => {
        if (!p) return false;
        const content = (p.content || '').toLowerCase();
        const snippetCode =
          typeof p.code_snippet === 'object' && p.code_snippet
            ? p.code_snippet.code || ''
            : typeof p.code_snippet === 'string'
            ? p.code_snippet
            : '';
        const authorUser = (p.author?.username || '').toLowerCase();
        return content.includes(q) || snippetCode.toLowerCase().includes(q) || authorUser.includes(q);
      }),
    [posts, q]
  );

  /**
   * Yazma durunca sunucuya sorar.
   *
   * Gecikme (debounce) her tuş vuruşunda sorgu atmamak için; `requestId` ise yarış koşulunu
   * kapatıyor: hızlı yazarken önce başlayan bir istek sonra bitip, daha yeni sorgunun
   * sonuçlarının üzerine yazabilirdi.
   */
  useEffect(() => {
    if (q.length < 2) {
      setServerPosts(null);
      setSearching(false);
      return;
    }

    const id = ++requestId.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      const result = await searchPostsOnServer(query, {
        language: lang || undefined,
        scope: codeOnly ? 'code' : 'all',
        limit: 40
      });
      if (id !== requestId.current) return; // Daha yeni bir arama başladı.
      setServerPosts(result.ok ? result.posts : null);
      setSearching(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [query, q, lang, codeOnly]);

  // Sunucu yanıt verdiyse onu göster; veremediyse (yapılandırılmamış/çevrimdışı) yerel
  // sonuçlar boş bir ekrandan iyidir.
  const usingServer = serverPosts !== null;
  const filteredPosts = usingServer
    ? serverPosts
    : localPosts.filter((p) => {
        if (codeOnly && !p.code_snippet) return false;
        if (lang && (p as any).code_language !== lang && p.code_snippet?.language !== lang) return false;
        return true;
      });

  const filteredCommunities = communities.filter((c) => {
    if (!c) return false;
    const cName = (c.name || '').toLowerCase();
    const cHandle = (c.handle || '').toLowerCase();
    return cName.includes(q) || cHandle.includes(q);
  });

  return (
    <div className="c4e-screen content-column pb-16">
      <div className="c4e-topbar z-20 px-5 py-3.5 space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              language === 'tr'
                ? 'Konu, etiket, gönderi veya topluluk ara...'
                : 'Search topic, tag, post or community...'
            }
            className="c4e-input w-full pl-10 pr-4 py-2.5 text-xs text-white placeholder-zinc-500"
          />
        </div>

        <div className="flex items-center gap-2 pt-1 overflow-x-auto pb-0.5 no-scrollbar">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              filter === 'all'
                ? 'bg-zinc-100 text-zinc-950 font-bold shadow-sm'
                : 'bg-white/[0.04] border border-white/[0.07] text-zinc-400 hover:text-white'
            }`}
          >
            {language === 'tr' ? 'Tümü' : 'All'}
          </button>
          <button
            onClick={() => setFilter('posts')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              filter === 'posts'
                ? 'bg-zinc-100 text-zinc-950 font-bold shadow-sm'
                : 'bg-white/[0.04] border border-white/[0.07] text-zinc-400 hover:text-white'
            }`}
          >
            {language === 'tr' ? 'Gönderiler' : 'Posts'}
          </button>
          <button
            onClick={() => setFilter('communities')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              filter === 'communities'
                ? 'bg-zinc-100 text-zinc-950 font-bold shadow-sm'
                : 'bg-white/[0.04] border border-white/[0.07] text-zinc-400 hover:text-white'
            }`}
          >
            {language === 'tr' ? 'Topluluklar' : 'Communities'}
          </button>
        </div>

        {/* Kod süzgeçleri. Yalnızca gönderi sonuçları gösterilirken anlamlı oldukları için
            topluluk sekmesinde gizleniyorlar. */}
        {filter !== 'communities' && (
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5 no-scrollbar">
            <button
              type="button"
              onClick={() => setCodeOnly((v) => !v)}
              aria-pressed={codeOnly}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                codeOnly
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white/[0.04] border border-white/[0.07] text-zinc-400 hover:text-white'
              }`}
            >
              <Code2 className="h-3.5 w-3.5" />
              <span>{language === 'tr' ? 'Sadece kod' : 'Code only'}</span>
            </button>

            <select
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              aria-label={language === 'tr' ? 'Programlama dili' : 'Programming language'}
              className="c4e-input px-3 py-1.5 text-xs font-semibold text-zinc-300 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">{language === 'tr' ? 'Tüm diller' : 'All languages'}</option>
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>

            {(codeOnly || lang) && (
              <button
                type="button"
                onClick={() => {
                  setCodeOnly(false);
                  setLang('');
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap text-zinc-500 hover:text-white transition-colors cursor-pointer"
              >
                {language === 'tr' ? 'Temizle' : 'Clear'}
              </button>
            )}
          </div>
        )}

        {/* Sonuçların nereden geldiğini söylemek önemli: "arşivin tamamı" ile "ekrandaki
            gönderiler" çok farklı iki şey ve kullanıcı hangisine baktığını bilmeli. */}
        {q.length >= 2 && (
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            {searching ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>{language === 'tr' ? 'Arşivde aranıyor...' : 'Searching the archive...'}</span>
              </>
            ) : usingServer ? (
              <>
                <Database className="h-3 w-3 text-emerald-500" />
                <span>
                  {language === 'tr'
                    ? `Tüm arşivde ${filteredPosts.length} sonuç`
                    : `${filteredPosts.length} results across the archive`}
                </span>
              </>
            ) : (
              <>
                <Search className="h-3 w-3" />
                <span>
                  {language === 'tr'
                    ? 'Yalnızca yüklenmiş gönderilerde arandı (sunucu araması kullanılamıyor)'
                    : 'Searched loaded posts only (server search unavailable)'}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      <div className="p-5 space-y-6">
        {!query && (
          <div className="c4e-card p-4 space-y-3">
            <h3 className="text-xs font-bold text-white flex items-center gap-2 border-b border-white/[0.07] pb-2">
              <TrendingUp className="w-4 h-4 text-zinc-300" />
              <span>{language === 'tr' ? 'Popüler Konular' : 'Popular Topics'}</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {trends.map((t) => (
                <div
                  key={t.id}
                  onClick={() => setQuery(t.tag)}
                  className="c4e-well p-3 cursor-pointer flex items-center justify-between"
                >
                  <div>
                    <span className="text-xs font-bold text-white block">{t.tag}</span>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {t.posts_count} {language === 'tr' ? 'gönderi' : 'posts'}
                    </span>
                  </div>
                  <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500" />
                </div>
              ))}
            </div>
          </div>
        )}

        {(filter === 'all' || filter === 'communities') && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-zinc-300" />
              <span>{language === 'tr' ? 'Topluluk Sonuçları' : 'Community Results'}</span>
            </h3>
            <div className="space-y-2">
              {filteredCommunities.map((comm) => (
                <div
                  key={comm.id}
                  onClick={() => onSelectCommunity(comm.id)}
                  className="c4e-card p-3 flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <UserAvatar src={comm.avatar_url} name={comm.name} className="w-10 h-10 rounded-xl ring-1 ring-white/[0.08] text-[10px]" />
                    <div>
                      <h4 className="text-xs font-bold text-white">{comm.name}</h4>
                      <span className="text-[10px] text-purple-400 font-mono">/c/@{comm.handle.replace(/^@/, '')}</span>
                    </div>
                  </div>
                  <span className="text-[10px] text-zinc-400 font-mono bg-white/[0.04] px-2 py-1 rounded-lg">
                    {comm.members_count} {language === 'tr' ? 'üye' : 'members'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {(filter === 'all' || filter === 'posts') && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-white flex items-center gap-2">
              <Code2 className="w-4 h-4 text-blue-400" />
              <span>{language === 'tr' ? 'İlgili Gönderiler' : 'Related Posts'}</span>
            </h3>

            {filteredPosts.length === 0 ? (
              <div className="c4e-card p-8 text-center text-xs text-zinc-500 font-mono">
                {language === 'tr' ? 'Aramanıza uygun gönderi bulunamadı.' : 'No matching posts found.'}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredPosts.map((post) => (
                  <div key={post.id} className="c4e-card p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <UserAvatar
                        src={post.author.avatar_url}
                        name={post.author.display_name || post.author.username}
                        className="w-7 h-7 text-[10px]"
                      />
                      <span className="text-xs font-bold text-white">{post.author.display_name}</span>
                      <span className="text-[10px] text-zinc-500 font-mono">@{post.author.username}</span>
                    </div>
                    <p className="text-xs text-zinc-300 user-text">{post.content}</p>
                    {post.media_url && (
                      <div className="rounded-xl overflow-hidden border border-white/[0.07] bg-black max-h-60 mt-1">
                        {post.media_type === 'video' || post.media_url.startsWith('data:video') ? (
                          <video src={post.media_url} controls playsInline className="w-full max-h-60 object-contain" />
                        ) : (
                          <img src={post.media_url} alt="Post media" className="w-full max-h-60 object-cover" />
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
