import React from 'react';
import { Bookmark, Heart, Repeat, MessageSquare, Trash2 } from 'lucide-react';
import { Post, UserProfile } from '../types';
import { CodeSnippetBlock } from './CodeSnippetBlock';
import { UserAvatar } from './ui/avatar';

interface BookmarksViewProps {
  posts: Post[];
  user: UserProfile;
  language: 'tr' | 'en';
  onLikePost: (id: string) => void;
  onRepostPost: (id: string) => void;
  onDeletePost: (id: string) => void;
  onRemoveBookmark: (id: string) => void;
}

export const BookmarksView: React.FC<BookmarksViewProps> = ({
  posts,
  user,
  language,
  onLikePost,
  onRepostPost,
  onDeletePost,
  onRemoveBookmark
}) => {
  const bookmarkedPosts = posts.filter((p) => p.is_bookmarked);

  return (
    <div className="flex-1 min-w-0 w-full border-r border-white/[0.07] min-h-screen pb-16 bg-[#0a0a14]">
      <div className="sticky top-0 z-20 backdrop-blur-xl bg-[#0a0a14]/90 border-b border-white/[0.07] px-5 py-3.5 flex items-center justify-between">
        <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
          <Bookmark className="w-5 h-5 text-zinc-300" />
          <span>{language === 'tr' ? 'Yer İşaretleri' : 'Bookmarks'}</span>
        </h2>
      </div>

      <div className="divide-y divide-white/[0.06]">
        {bookmarkedPosts.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-white/[0.04] border border-white/[0.07] flex items-center justify-center mx-auto text-zinc-300">
              <Bookmark className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-sm font-bold text-white">
              {language === 'tr' ? 'Kaydedilmiş Gönderi Yok' : 'No Bookmarked Posts'}
            </h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              {language === 'tr'
                ? 'Daha sonra okumak için akıştaki gönderileri yer işaretlerine ekleyebilirsiniz.'
                : 'You can bookmark posts in the feed to read them later.'}
            </p>
          </div>
        ) : (
          bookmarkedPosts.map((post) => (
            <article key={post.id} className="p-4 hover:bg-white/[0.06] transition-colors space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <UserAvatar
                    src={post.author.avatar_url}
                    name={post.author.display_name || post.author.username}
                    className="w-10 h-10 ring-1 ring-white/[0.08]"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-xs">{post.author.display_name}</span>
                      <span className="text-xs text-zinc-500 font-mono">@{post.author.username}</span>
                      <span className="text-xs text-zinc-600">·</span>
                      <span className="text-[11px] text-zinc-500 font-mono">{post.time_ago}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onRemoveBookmark(post.id)}
                    className="text-amber-400 hover:text-zinc-500 p-1 rounded-lg transition-colors cursor-pointer"
                    title={language === 'tr' ? 'Yer işaretinden çıkar' : 'Remove bookmark'}
                  >
                    <Bookmark className="w-4 h-4 fill-current" />
                  </button>
                  {post.author.username === user.username && (
                    <button
                      onClick={() => onDeletePost(post.id)}
                      className="text-zinc-600 hover:text-red-400 p-1 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {post.content && <p className="text-xs text-zinc-200 leading-relaxed font-sans user-text">{post.content}</p>}

              {post.media_url && (
                <div className="rounded-2xl overflow-hidden border border-white/[0.07] bg-black max-h-[400px] flex items-center justify-center">
                  {post.media_type === 'video' || post.media_url.startsWith('data:video') ? (
                    <video
                      src={post.media_url}
                      controls
                      playsInline
                      className="w-full max-h-[400px] object-contain rounded-2xl"
                    />
                  ) : (
                    <img
                      src={post.media_url}
                      alt="Post attachment"
                      className="w-full max-h-[400px] object-cover rounded-2xl"
                    />
                  )}
                </div>
              )}

              {post.code_snippet && (
                <CodeSnippetBlock snippet={post.code_snippet} language={language} />
              )}

              <div className="flex items-center gap-6 pt-1 text-xs text-zinc-500 font-mono">
                <button
                  onClick={() => onLikePost(post.id)}
                  className={`flex items-center gap-1.5 transition-colors cursor-pointer ${
                    post.is_liked ? 'text-red-400' : 'hover:text-red-400'
                  }`}
                >
                  <Heart className={`w-3.5 h-3.5 ${post.is_liked ? 'fill-current text-red-400' : ''}`} />
                  <span>{post.likes_count}</span>
                </button>

                <button
                  onClick={() => onRepostPost(post.id)}
                  className={`flex items-center gap-1.5 transition-colors cursor-pointer ${
                    post.is_reposted ? 'text-emerald-400' : 'hover:text-emerald-400'
                  }`}
                >
                  <Repeat className="w-3.5 h-3.5" />
                  <span>{post.reposts_count}</span>
                </button>

                <div className="flex items-center gap-1.5 text-zinc-600">
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>{post.comments_count}</span>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
};
