import React, { useState, useEffect, useRef } from 'react';
import { Post, UserProfile, GitHubRepo, Community } from '../types';
import { UserBadges } from './UserBadges';
import { CodeSnippetBlock } from './CodeSnippetBlock';
import { ReportPostModal } from './ReportPostModal';
import { CategorySelector } from './CategorySelector';
import { CommunityFeedHeader } from './CommunityFeedHeader';
import { CommunityProjectsPanel } from './CommunityProjectsPanel';
import { filterVisiblePosts } from '../utils/communityVisibility';
import { Button } from './ui/button';
import { UserAvatar } from './ui/avatar';
import { Badge } from './ui/badge';
import { Textarea } from './ui/textarea';
import { Skeleton } from './ui/skeleton';
import { HintTooltip } from './ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from './ui/dropdown-menu';
import { cn } from '../lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from './ui/alert-dialog';
import { getStoredCategories, DynamicCategory } from '../utils/categoryHelper';
import {
  MessageSquare,
  Heart,
  Repeat,
  Send,
  Code,
  Sparkles,
  Trash2,
  Bookmark,
  Share2,
  Check,
  GitBranch,
  ExternalLink,
  Star,
  GitFork,
  Image as ImageIcon,
  Video,
  Loader2,
  Users,
  Shield,
  Copy,
  User,
  AlertCircle,
  Tag,
  Filter,
  Flag,
  MoreHorizontal,
  Globe,
  Lock,
  Link2
} from 'lucide-react';
import { getGitHubToken } from '../services/supabaseClient';
import { validateFileSize, notifyFileSizeExceeded, getMaxPostLength } from '../utils/fileUploadHelper';
import { formatTimeAgo } from '../utils/timeAgo';
import { verifyAdminAccess } from '../utils/securityHelper';

interface FeedViewProps {
  posts: Post[];
  user: UserProfile;
  allUsers?: UserProfile[];
  communities?: Community[];
  language: 'tr' | 'en';
  selectedHashtag?: string | null;
  onClearHashtag?: () => void;
  onSelectHashtag?: (hashtag: string) => void;
  onLikePost: (id: string) => void;
  onRepostPost: (id: string) => void;
  onBookmarkPost: (id: string) => void;
  onDeletePost: (id: string) => void;
  onCreatePost: (
    content: string,
    codeSnippet?: { title: string; language: string; code: string },
    selectedRepo?: GitHubRepo,
    mediaUrl?: string,
    mediaType?: 'image' | 'video',
    communityId?: string,
    communityName?: string,
    communityHandle?: string,
    category?: string,
    categoryName?: string
  ) => Promise<boolean> | boolean | void;
  onAddComment: (postId: string, commentText: string) => void;
  onSelectUser: (username: string) => void;
  onSelectCommunity?: (community: Community | string) => void;
  /**
   * When set, the timeline becomes that community's own feed: only its posts are listed and
   * every new post is published into it. Leave undefined for the global feed.
   */
  /** True until the first post sync completes; renders skeletons instead of "no posts yet". */
  isLoading?: boolean;
  communityScope?: Community | null;
  onExitCommunityScope?: () => void;
  onToggleJoinCommunity?: (communityId: string) => void;
  onOpenCommunitySettings?: (community: Community) => void;
  /** Topluluk projeleri sekmesindeki "projeni ekle" çağrısı. */
  onOpenShareProject?: () => void;
}

export const FeedView: React.FC<FeedViewProps> = ({
  posts,
  user,
  allUsers = [],
  communities = [],
  language,
  selectedHashtag,
  onClearHashtag,
  onSelectHashtag,
  onLikePost,
  onRepostPost,
  onBookmarkPost,
  onDeletePost,
  onCreatePost,
  onAddComment,
  onSelectUser,
  onSelectCommunity,
  isLoading = false,
  communityScope = null,
  onExitCommunityScope,
  onToggleJoinCommunity,
  onOpenCommunitySettings,
  onOpenShareProject
}) => {
  const [content, setContent] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('genel');
  const [selectedCategoryName, setSelectedCategoryName] = useState<string>('Genel & Sohbet');
  const [feedCategoryFilter, setFeedCategoryFilter] = useState<string>('all');
  // Global feed only: 'all' shows everything, 'general' hides posts that belong to a community.
  const [feedSourceFilter, setFeedSourceFilter] = useState<'all' | 'general'>('all');
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(null);
  const [dynamicCategories, setDynamicCategories] = useState<DynamicCategory[]>([]);

  useEffect(() => {
    setDynamicCategories(getStoredCategories());
  }, []);

  const [showCodeAttach, setShowCodeAttach] = useState(false);
  const [codeTitle, setCodeTitle] = useState('');
  const [codeLang, setCodeLang] = useState('TypeScript');
  const [codeSnippet, setCodeSnippet] = useState('');

  const [showRepoAttach, setShowRepoAttach] = useState(false);
  const [userRepos, setUserRepos] = useState<GitHubRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [loadingRepos, setLoadingRepos] = useState(false);

  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // On phones the composer opens compact (avatar + one line) and reveals the category /
  // community selectors once it is in use — the full form used to eat ~70% of the screen.
  const [isComposerFocused, setIsComposerFocused] = useState(false);
  /*
   * Topluluk sayfasındaki sekme: gönderiler mi projeler mi.
   *
   * Durum TOPLULUĞA GÖRE sıfırlanıyor (aşağıdaki effect): bir topluluğun projeler
   * sekmesinde kalıp başka bir topluluğa geçildiğinde oradaki gönderileri değil yine
   * projeleri görmek, kullanıcının beklemediği bir yere düşmek olurdu.
   */
  const [communityTab, setCommunityTab] = useState<'posts' | 'projects'>('posts');
  const mediaInputRef = useRef<HTMLInputElement>(null);

  const [activeCommentPostId, setActiveCommentPostId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [copiedPostId, setCopiedPostId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [postToDelete, setPostToDelete] = useState<Post | null>(null);
  const [postToReport, setPostToReport] = useState<Post | null>(null);

  // Right-click / long-press context menu state
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    post: Post | null;
  }>({ visible: false, x: 0, y: 0, post: null });

  const touchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const [longPressingPostId, setLongPressingPostId] = useState<string | null>(null);

  const isNylithra = verifyAdminAccess(user);

  useEffect(() => {
    const handleWindowClick = () => {
      setContextMenu({ visible: false, x: 0, y: 0, post: null });
    };
    const handleWindowScroll = () => {
      setContextMenu({ visible: false, x: 0, y: 0, post: null });
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu({ visible: false, x: 0, y: 0, post: null });
      }
    };

    window.addEventListener('click', handleWindowClick);
    window.addEventListener('scroll', handleWindowScroll);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleWindowClick);
      window.removeEventListener('scroll', handleWindowScroll);
      window.removeEventListener('keydown', handleKeyDown);
      if (touchTimerRef.current) {
        clearTimeout(touchTimerRef.current);
      }
    };
  }, []);

  const handlePostContextMenu = (e: React.MouseEvent, post: Post) => {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 240;
    const menuHeight = 240;
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 16);
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 16);
    setContextMenu({ visible: true, x, y, post });
  };

  const handleTouchStart = (e: React.TouchEvent, post: Post) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    setLongPressingPostId(post.id);

    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
    }

    touchTimerRef.current = setTimeout(() => {
      if (touchStartPosRef.current) {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate(50);
          } catch {}
        }
        const posX = touchStartPosRef.current.x;
        const posY = touchStartPosRef.current.y;
        const menuWidth = 240;
        const menuHeight = 240;
        const x = Math.min(Math.max(16, posX - 100), window.innerWidth - menuWidth - 16);
        const y = Math.min(Math.max(16, posY - 50), window.innerHeight - menuHeight - 16);
        setContextMenu({ visible: true, x, y, post });
      }
      setLongPressingPostId(null);
      touchTimerRef.current = null;
    }, 550);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPosRef.current || !touchTimerRef.current) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
    const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);
    if (dx > 10 || dy > 10) {
      if (touchTimerRef.current) {
        clearTimeout(touchTimerRef.current);
        touchTimerRef.current = null;
      }
      touchStartPosRef.current = null;
      setLongPressingPostId(null);
    }
  };

  const handleTouchEnd = () => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
    touchStartPosRef.current = null;
    setLongPressingPostId(null);
  };

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateFileSize(file, user);
    if (!validation.isValid) {
      notifyFileSizeExceeded(validation);
      if (mediaInputRef.current) mediaInputRef.current.value = '';
      return;
    }

    const isVid = file.type.startsWith('video');
    const isImg = file.type.startsWith('image');

    if (!isVid && !isImg) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) {
        setMediaUrl(ev.target.result as string);
        setMediaType(isVid ? 'video' : 'image');
      }
    };
    reader.readAsDataURL(file);
  };

  const fetchRepos = async () => {
    if (!user.username) return;
    setLoadingRepos(true);
    try {
      const token = getGitHubToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`https://api.github.com/users/${user.username}/repos?sort=updated&per_page=30`, { headers });
      if (res.ok) {
        const data = await res.json();
        setUserRepos(data);
      }
    } catch {
      setUserRepos([]);
    } finally {
      setLoadingRepos(false);
    }
  };

  useEffect(() => {
    if (showRepoAttach && userRepos.length === 0) {
      fetchRepos();
    }
  }, [showRepoAttach]);

  const MAX_CONTENT_LENGTH = getMaxPostLength(user);
  const MAX_CODE_LENGTH = 5000;

  const isContentOver = content.length > MAX_CONTENT_LENGTH;
  const isCodeOver = showCodeAttach && codeSnippet.length > MAX_CODE_LENGTH;
  const isSubmitDisabled =
    isSubmitting ||
    isContentOver ||
    isCodeOver ||
    (!content.trim() && !codeSnippet.trim() && !selectedRepo && !mediaUrl);

  const handlePostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || isContentOver || isCodeOver) return;
    if (!content.trim() && !codeSnippet.trim() && !selectedRepo && !mediaUrl) return;

    setIsSubmitting(true);
    let attachedSnippet;
    if (showCodeAttach && codeSnippet.trim()) {
      attachedSnippet = {
        title: codeTitle.trim() || 'Snippet',
        language: codeLang,
        code: codeSnippet.trim()
      };
    }

    // Inside a community feed every post belongs to that community, no matter what the
    // (hidden) picker holds.
    const selectedComm = communityScope || communities.find((c) => c.id === selectedCommunityId);

    try {
      const res = await onCreatePost(
        content.trim(),
        attachedSnippet,
        selectedRepo || undefined,
        mediaUrl || undefined,
        mediaType || undefined,
        selectedComm?.id,
        selectedComm?.name,
        selectedComm?.handle,
        selectedCategoryId,
        selectedCategoryName || selectedCategoryId
      );

      if (res !== false) {
        setContent('');
        setCodeTitle('');
        setCodeSnippet('');
        setShowCodeAttach(false);
        setShowRepoAttach(false);
        setSelectedRepo(null);
        setMediaUrl(null);
        setMediaType(null);
        setSelectedCommunityId(null);
        setSelectedCategoryId('genel');
        setSelectedCategoryName('Genel & Sohbet');
        setDynamicCategories(getStoredCategories());
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCommentSubmit = (postId: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    onAddComment(postId, commentText.trim());
    setCommentText('');
  };

  const handleShare = (post: Post) => {
    // Built from the live origin so the copied link always points at the deployment the
    // reader is actually on (app.lanux.online in production, localhost in development).
    const url = `${window.location.origin}/@${post.author.username}#post-${post.id}`;
    navigator.clipboard.writeText(url);
    setCopiedPostId(post.id);
    setToastMessage(language === 'tr' ? 'Gönderi bağlantısı kopyalandı!' : 'Post link copied to clipboard!');
    setTimeout(() => {
      setCopiedPostId(null);
      setToastMessage(null);
    }, 2500);
  };

  // Build combined unique categories from stored categories + posts
  const combinedCategoryList = (() => {
    const map = new Map<string, { id: string; name: string; icon: string }>();
    dynamicCategories.forEach((c) => {
      map.set(c.id, { id: c.id, name: c.name, icon: c.icon || '🏷️' });
    });
    posts.forEach((p) => {
      if (p.category && !map.has(p.category)) {
        map.set(p.category, {
          id: p.category,
          name: p.category_name || p.category,
          icon: '🏷️'
        });
      }
    });
    return Array.from(map.values());
  })();

  const isComposerExpanded = Boolean(
    isComposerFocused || content.trim() || mediaUrl || selectedRepo || showCodeAttach || showRepoAttach
  );

  const scopeHandle = (communityScope?.handle || '').replace(/^@/, '').toLowerCase();

  /** True when a post belongs to the community currently being viewed. */
  const belongsToScope = (post: Post): boolean => {
    if (!communityScope) return true;
    if (post.community_id && communityScope.id && post.community_id === communityScope.id) return true;
    const postHandle = (post.community_handle || '').replace(/^@/, '').toLowerCase();
    if (postHandle && scopeHandle && postHandle === scopeHandle) return true;
    // Legacy rows that only carried the display name.
    return Boolean(
      post.community_name &&
        communityScope.name &&
        post.community_name.toLowerCase() === communityScope.name.toLowerCase()
    );
  };

  // Private communities: their posts never appear to non-members, not in the community feed
  // and not in the global timeline. (The database enforces the same rule via RLS.)
  const visiblePosts = filterVisiblePosts(posts, user, communities);
  const scopedPosts = communityScope ? visiblePosts.filter(belongsToScope) : visiblePosts;

  /** A private community the viewer has not joined: nothing from it may be rendered. */
  const isScopeMember = Boolean(
    communityScope &&
      (communityScope.is_joined ||
        (user.joined_communities || []).includes(communityScope.id) ||
        (communityScope.created_by && communityScope.created_by === user.id) ||
        (communityScope.creator_username || '').toLowerCase() === (user.username || '').toLowerCase() ||
        isNylithra)
  );

  useEffect(() => {
    setCommunityTab('posts');
  }, [communityScope?.id]);

  const isPrivateLocked = Boolean(communityScope?.is_private && !isScopeMember);

  // Filter posts by community scope, source, category and hashtag
  const filteredPosts = scopedPosts.filter((post) => {
    if (!communityScope && feedSourceFilter === 'general' && post.community_id) return false;

    if (selectedHashtag) {
      const tag = selectedHashtag.toLowerCase();
      const contentHas = (post.content || '').toLowerCase().includes(tag);
      const snippetHas = (post.code_snippet?.code || '').toLowerCase().includes(tag);
      if (!contentHas && !snippetHas) return false;
    }

    if (feedCategoryFilter !== 'all') {
      const postCat = post.category || 'genel';
      if (postCat !== feedCategoryFilter) return false;
    }

    return true;
  });

  return (
    <div className="content-column flex-1 min-w-0 w-full border-r border-zinc-800/60 min-h-screen pb-16 relative">
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-zinc-900 border border-zinc-700 text-white text-xs font-bold px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2 animate-bounce">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Community feed hero (only inside a community) */}
      {communityScope ? (
        <CommunityFeedHeader
          community={communityScope}
          user={user}
          language={language}
          postCount={scopedPosts.length}
          isJoined={isScopeMember}
          onBack={onExitCommunityScope}
          onToggleJoin={onToggleJoinCommunity}
          onOpenSettings={onOpenCommunitySettings}
          onSelectUser={onSelectUser}
        />
      ) : (
        <>
          {/* Sticky Header */}
          <div className="sticky top-0 z-20 backdrop-blur-xl bg-[#09090b]/90 border-b border-zinc-800/40 px-5 py-3.5 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <span>{language === 'tr' ? 'Akış & Gönderiler' : 'Feed & Posts'}</span>
              <span className="w-2 h-2 rounded-full bg-zinc-400" />
            </h2>

            {selectedHashtag && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-mono">
                <span>{selectedHashtag}</span>
                <button onClick={onClearHashtag} className="hover:text-white font-bold ml-1 cursor-pointer">
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* Feed source switcher: everything / general only / jump into a community feed */}
          <div className="px-4 py-2.5 bg-[#09090b] border-b border-zinc-800/40 overflow-x-auto no-scrollbar flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFeedSourceFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                feedSourceFilter === 'all'
                  ? 'bg-zinc-100 text-zinc-950 shadow-md font-extrabold'
                  : 'bg-zinc-900/80 text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-800/80'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              {language === 'tr' ? 'Her Şey' : 'Everything'}
            </button>

            <button
              type="button"
              onClick={() => setFeedSourceFilter('general')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                feedSourceFilter === 'general'
                  ? 'bg-zinc-100 text-zinc-950 shadow-md font-extrabold'
                  : 'bg-zinc-900/80 text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-800/80'
              }`}
              title={language === 'tr' ? 'Topluluk gönderilerini gizle' : 'Hide community posts'}
            >
              <Globe className="w-3.5 h-3.5" />
              {language === 'tr' ? 'Sadece Genel' : 'General only'}
            </button>

            {communities.length > 0 && <span className="w-px h-5 bg-zinc-800 mx-1 flex-shrink-0" />}

            {[...communities]
              .sort((a, b) => Number(Boolean(b.is_joined)) - Number(Boolean(a.is_joined)))
              .slice(0, 12)
              .map((comm) => (
                <button
                  key={comm.id}
                  type="button"
                  onClick={() => onSelectCommunity?.(comm)}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer bg-zinc-900/80 text-zinc-300 hover:text-white hover:bg-zinc-800 border border-zinc-800/80"
                  title={language === 'tr' ? `${comm.name} akışını aç` : `Open the ${comm.name} feed`}
                >
                  <Users className={`w-3.5 h-3.5 ${comm.is_joined ? 'text-purple-400' : 'text-zinc-500'}`} />
                  <span>{comm.name}</span>
                </button>
              ))}
          </div>
        </>
      )}

      {/* Category Pills Filter Bar */}
      <div className="px-4 py-2.5 bg-[#0a0a0c] border-b border-zinc-800/60 overflow-x-auto no-scrollbar flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setFeedCategoryFilter('all')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
            feedCategoryFilter === 'all'
              ? 'bg-zinc-100 text-zinc-950 shadow-md font-extrabold'
              : 'bg-zinc-900/80 text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-800/80'
          }`}
        >
          <span>🌟</span>
          <span>{language === 'tr' ? 'Tüm Akış' : 'All Posts'}</span>
        </button>

        {combinedCategoryList.map((cat) => {
          const isActive = feedCategoryFilter === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setFeedCategoryFilter(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer font-medium ${
                isActive
                  ? 'bg-zinc-100 text-zinc-950 font-bold shadow-md'
                  : 'bg-zinc-900/80 text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-800/80'
              }`}
            >
              <span>{cat.icon || '🏷️'}</span>
              <span>{cat.name}</span>
            </button>
          );
        })}
      </div>

      {/* Private community + non-member: the timeline itself is locked */}
      {communityScope?.is_private && !isScopeMember && (
        <div className="p-10 text-center space-y-3 border-b border-zinc-800/60">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center mx-auto text-amber-400">
            <Lock className="w-7 h-7" />
          </div>
          <h3 className="text-sm font-bold text-white">
            {language === 'tr' ? 'Bu Topluluk Gizli' : 'This Community Is Private'}
          </h3>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
            {language === 'tr'
              ? `${communityScope.name} topluluğunun gönderilerini yalnızca üyeler görebilir. Katıldığında akış hemen açılır.`
              : `Only members can read posts in ${communityScope.name}. Join and the feed opens right away.`}
          </p>
          {onToggleJoinCommunity && (
            <button
              type="button"
              onClick={() => onToggleJoinCommunity(communityScope.id)}
              className="px-5 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-black inline-flex items-center gap-2 shadow-lg shadow-purple-600/20 transition-all active:scale-95 cursor-pointer"
            >
              <Users className="w-4 h-4" />
              {language === 'tr' ? 'Topluluğa Katıl' : 'Join community'}
            </button>
          )}
        </div>
      )}

      {/* Non-members see a join prompt instead of the composer */}
      {communityScope && !isScopeMember && !communityScope.is_private && (
        <div className="p-5 border-b border-zinc-800/60 bg-[#0c0c0e] flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/25 text-purple-300 flex items-center justify-center flex-shrink-0">
              <Users className="w-4 h-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-bold text-white">
                {language === 'tr' ? 'Bu toplulukta paylaşım yapmak için katıl' : 'Join to post in this community'}
              </span>
              <span className="block text-[11px] text-zinc-400 leading-relaxed">
                {language === 'tr'
                  ? 'Akışı herkes okuyabilir; gönderi paylaşmak için üye olman yeterli.'
                  : 'Anyone can read the feed — membership is only needed to post.'}
              </span>
            </span>
          </div>
          {onToggleJoinCommunity && (
            <button
              type="button"
              onClick={() => onToggleJoinCommunity(communityScope.id)}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-black flex items-center justify-center gap-1.5 shadow-lg shadow-purple-600/20 transition-all active:scale-95 cursor-pointer flex-shrink-0"
            >
              <Users className="w-3.5 h-3.5" />
              {language === 'tr' ? 'Topluluğa Katıl' : 'Join community'}
            </button>
          )}
        </div>
      )}

      {/* Topluluk sekmeleri: gönderiler / projeler.
          Gizli ve kilitli bir toplulukta sekme göstermiyoruz — iki sekme de boş olurdu
          ve kullanıcıya tıklayacak bir şey verip hiçbir şey göstermemek olurdu. */}
      {communityScope && !isPrivateLocked && (
        <div className="sticky top-0 z-20 flex items-center gap-1 border-b border-zinc-800/60 bg-[#09090b]/95 px-4 py-2 backdrop-blur-xl">
          {([
            ['posts', language === 'tr' ? 'Gönderiler' : 'Posts', scopedPosts.length],
            ['projects', language === 'tr' ? 'Projeler' : 'Projects', communityScope.projects_count ?? null]
          ] as const).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => setCommunityTab(key)}
              aria-current={communityTab === key}
              className={`relative flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                communityTab === key
                  ? 'bg-zinc-100 text-zinc-950 shadow-md'
                  : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
              }`}
            >
              <span>{label}</span>
              {count !== null && count !== undefined && (
                <span
                  className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] ${
                    communityTab === key ? 'bg-zinc-900/10 text-zinc-700' : 'bg-zinc-800/80 text-zinc-500'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Post Composer */}
      <div
        className={`p-4 border-b border-zinc-800/60 bg-[#0c0c0e] ${
          (communityScope && !isScopeMember) || (communityScope && communityTab === 'projects') ? 'hidden' : ''
        }`}
      >
        <form onSubmit={handlePostSubmit} className="space-y-3">
          {/* items-start keeps the avatar next to the first line of the message instead of
              drifting to the vertical middle as the composer grows. */}
          <div className="flex items-start gap-3">
            <UserAvatar
              src={user.avatar_url}
              name={user.display_name || user.username}
              className="ring-2 ring-zinc-800 flex-shrink-0"
              onClick={() => onSelectUser(user.username)}
            />
            <div className="flex-1 min-w-0 space-y-2.5">
              {/* Category & Community Target Selector Bar */}
              {/* Inside a community the target chip stays visible even in the compact state —
                  the writer must always know where the post is going. */}
              {communityScope && !isComposerExpanded && (
                <div className="sm:hidden flex items-center gap-1.5 text-[11px] font-mono text-purple-300">
                  <Users className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{communityScope.name}</span>
                  <Lock className="w-3 h-3 flex-shrink-0 text-purple-300/70" />
                </div>
              )}

              <div className={`${isComposerExpanded ? 'grid' : 'hidden sm:grid'} grid-cols-1 sm:grid-cols-2 gap-2`}>
                {/* Dynamic Category Selector */}
                <CategorySelector
                  selectedCategoryId={selectedCategoryId}
                  selectedCategoryName={selectedCategoryName}
                  onSelectCategory={(id, name) => {
                    setSelectedCategoryId(id);
                    setSelectedCategoryName(name);
                    setDynamicCategories(getStoredCategories());
                  }}
                  username={user.username}
                  language={language}
                />

                {/* Community target: locked inside a community feed, selectable otherwise */}
                {communityScope ? (
                  <div className="flex items-center justify-between bg-purple-500/10 border border-purple-500/25 rounded-xl px-3 py-2 text-xs min-h-[38px]">
                    <span className="text-purple-300 font-mono text-[11px] flex items-center gap-1.5 min-w-0">
                      <Users className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{communityScope.name}</span>
                    </span>
                    <span className="text-[10px] text-purple-300/70 font-mono flex items-center gap-1 flex-shrink-0">
                      <Lock className="w-3 h-3" />
                      {language === 'tr' ? 'topluluk akışı' : 'community feed'}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between bg-zinc-950/80 border border-zinc-800 rounded-xl px-3 py-2 text-xs min-h-[38px]">
                    <span className="text-zinc-400 font-mono text-[11px] flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-purple-400" />
                      <span>{language === 'tr' ? 'Topluluk:' : 'Scope:'}</span>
                    </span>
                    <select
                      value={selectedCommunityId || ''}
                      aria-label={language === 'tr' ? 'Gönderinin paylaşılacağı topluluk' : 'Community to post in'}
                      onChange={(e) => setSelectedCommunityId(e.target.value || null)}
                      className="bg-zinc-900 border border-zinc-700/80 text-zinc-200 text-xs rounded-lg px-2 py-1 focus:outline-none font-mono cursor-pointer max-w-[130px]"
                    >
                      <option value="" className="bg-zinc-900 text-zinc-400">
                        {language === 'tr' ? '🌐 Genel Feed' : '🌐 General Feed'}
                      </option>
                      {communities
                        .filter((c) => c.is_joined)
                        .map((comm) => (
                          <option key={comm.id} value={comm.id} className="bg-zinc-900 text-white">
                            👥 {comm.name}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Textarea Input */}
              <div className="relative">
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onKeyDown={(e) => {
                    // Ctrl/⌘ + Enter publishes, the way every other social composer works.
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault();
                      (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
                    }
                  }}
                  placeholder={
                    /* Collapsed (single-row) composer gets a short placeholder: the long one
                       wrapped onto a second line that the one-row box then clipped. */
                    isComposerExpanded
                      ? language === 'tr'
                        ? 'Ne düşünüyorsun? Proje, soru veya kod parçacığı paylaş...'
                        : 'What are you working on? Share a project, question or snippet...'
                      : language === 'tr'
                      ? 'Ne düşünüyorsun?'
                      : "What's happening?"
                  }
                  rows={isComposerExpanded ? 3 : 1}
                  onFocus={() => setIsComposerFocused(true)}
                  aria-label={language === 'tr' ? 'Gönderi içeriği' : 'Post content'}
                  className="border-transparent bg-transparent px-0 text-sm placeholder:text-zinc-500 focus-visible:border-transparent focus-visible:ring-0"
                />
              </div>

              {/* Media Preview */}
              {mediaUrl && (
                <div className="relative rounded-2xl overflow-hidden border border-zinc-800 bg-black max-h-56">
                  {mediaType === 'video' ? (
                    <video src={mediaUrl} controls className="w-full h-full max-h-56 object-cover" />
                  ) : (
                    <img src={mediaUrl} alt="Preview" className="w-full h-full max-h-56 object-cover" />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setMediaUrl(null);
                      setMediaType(null);
                    }}
                    className="absolute top-2 right-2 p-1.5 rounded-full bg-black/80 text-white hover:bg-red-600 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Code Snippet Input Box */}
              {showCodeAttach && (
                <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2 relative">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={codeTitle}
                      onChange={(e) => setCodeTitle(e.target.value)}
                      placeholder={language === 'tr' ? 'Kod Başlığı' : 'Snippet Title'}
                      className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none font-mono"
                    />
                    <select
                      value={codeLang}
                      onChange={(e) => setCodeLang(e.target.value)}
                      className="bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none font-mono"
                    >
                      <option value="TypeScript">TypeScript</option>
                      <option value="React">React</option>
                      <option value="Python">Python</option>
                      <option value="Rust">Rust</option>
                      <option value="Go">Go</option>
                      <option value="SQL">SQL</option>
                      <option value="HTML/CSS">HTML/CSS</option>
                      <option value="C++">C++</option>
                      <option value="Java">Java</option>
                    </select>
                  </div>
                  <div className="relative">
                    <textarea
                      value={codeSnippet}
                      onChange={(e) => setCodeSnippet(e.target.value)}
                      placeholder="code snippet goes here..."
                      rows={4}
                      className="w-full bg-zinc-900/90 border border-zinc-800 rounded-lg p-2.5 text-xs text-emerald-400 font-mono focus:outline-none resize-none pb-7"
                    />
                    <div className="absolute right-2 bottom-2">
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-md transition-all shadow-sm ${
                          codeSnippet.length > MAX_CODE_LENGTH
                            ? 'bg-red-500/20 text-red-400 border border-red-500/50 font-bold animate-pulse'
                            : codeSnippet.length >= 4000
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 font-semibold'
                            : 'bg-zinc-900/80 text-zinc-400 border border-zinc-800'
                        }`}
                        title={
                          codeSnippet.length > MAX_CODE_LENGTH
                            ? (language === 'tr' ? 'Kod sınırı aşıldı! Maksimum 5000 karakter.' : 'Code limit exceeded! Max 5000 chars.')
                            : undefined
                        }
                      >
                        {codeSnippet.length}/{MAX_CODE_LENGTH}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Repo Selector Box */}
              {showRepoAttach && (
                <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2">
                  <span className="text-xs font-bold text-white block">
                    {language === 'tr' ? 'GitHub Depolarımdan Seç' : 'Select From My GitHub Repos'}
                  </span>
                  {loadingRepos ? (
                    <div className="text-xs font-mono text-zinc-500 py-2 animate-pulse">
                      {language === 'tr' ? 'GitHub depoları yükleniyor...' : 'Loading repositories...'}
                    </div>
                  ) : userRepos.length === 0 ? (
                    <div className="text-xs font-mono text-zinc-500 py-1">
                      {language === 'tr' ? 'Depo bulunamadı veya yetki verilmedi.' : 'No repositories found.'}
                    </div>
                  ) : (
                    <select
                      onChange={(e) => {
                        const repo = userRepos.find((r) => r.id === Number(e.target.value));
                        setSelectedRepo(repo || null);
                      }}
                      className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-lg p-2 text-xs font-mono focus:outline-none"
                    >
                      <option value="">{language === 'tr' ? '-- Depo Seçin --' : '-- Select Repository --'}</option>
                      {userRepos.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.language || 'Code'}) - ⭐ {r.stargazers_count}
                        </option>
                      ))}
                    </select>
                  )}

                  {selectedRepo && (
                    <div className="p-2.5 bg-zinc-900/80 border border-zinc-700/50 rounded-lg space-y-1 text-xs">
                      <span className="font-bold text-white block">{selectedRepo.name}</span>
                      <p className="text-[11px] text-zinc-400">{selectedRepo.description}</p>
                      <span className="text-[10px] font-mono text-zinc-300 block">{selectedRepo.html_url}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Bottom Buttons Bar — wraps on narrow phones so the submit button is
                  never pushed off the screen. */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800/40">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                  <input
                    type="file"
                    ref={mediaInputRef}
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={handleMediaUpload}
                  />
                  <button
                    type="button"
                    onClick={() => mediaInputRef.current?.click()}
                    aria-label={language === 'tr' ? 'Medya ekle' : 'Attach media'}
                    className="text-xs font-mono flex items-center gap-1.5 px-2.5 h-8 rounded-lg transition-colors text-zinc-400 hover:text-white hover:bg-zinc-900 border border-transparent hover:border-zinc-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-zinc-300" />
                    <Video className="w-3.5 h-3.5 text-zinc-300" />
                    <span className="hidden xs:inline">{language === 'tr' ? 'Medya' : 'Media'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowCodeAttach(!showCodeAttach)}
                    aria-label={language === 'tr' ? 'Kod ekle' : 'Attach code'}
                    className={`text-xs font-mono flex items-center gap-1.5 px-2.5 h-8 rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      showCodeAttach
                        ? 'bg-zinc-800 text-white border border-zinc-700'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                    }`}
                  >
                    <Code className="w-3.5 h-3.5" />
                    <span className="hidden xs:inline">{language === 'tr' ? 'Kod Ekle' : 'Add Snippet'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowRepoAttach(!showRepoAttach)}
                    aria-label={language === 'tr' ? 'Depo ekle' : 'Attach repository'}
                    className={`text-xs font-mono flex items-center gap-1.5 px-2.5 h-8 rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      showRepoAttach
                        ? 'bg-zinc-800 text-white border border-zinc-700'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                    }`}
                  >
                    <GitBranch className="w-3.5 h-3.5" />
                    <span className="hidden xs:inline">{language === 'tr' ? 'Depo Ekle' : 'Attach Repo'}</span>
                  </button>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Character counter. It used to float on top of the textarea, where it
                      covered the placeholder's second line; it now lives in the action row. */}
                  <span
                    aria-live="polite"
                    className={`text-[11px] font-mono px-2 py-0.5 rounded-md transition-colors ${
                      content.length > MAX_CONTENT_LENGTH
                        ? 'bg-red-500/20 text-red-400 border border-red-500/50 font-bold'
                        : content.length >= MAX_CONTENT_LENGTH * 0.8
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 font-semibold'
                        : 'text-zinc-500'
                    }`}
                    title={
                      content.length > MAX_CONTENT_LENGTH
                        ? (language === 'tr' ? `Karakter sınırı aşıldı! Maksimum ${MAX_CONTENT_LENGTH} karakter.` : `Character limit exceeded! Max ${MAX_CONTENT_LENGTH} chars.`)
                        : undefined
                    }
                  >
                    {content.length}/{MAX_CONTENT_LENGTH}
                  </span>

                  <HintTooltip label={language === 'tr' ? 'Ctrl + Enter ile de paylaşabilirsin' : 'You can also press Ctrl + Enter'}>
                    <Button type="submit" size="sm" disabled={isSubmitDisabled}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="animate-spin" />
                        <span>{language === 'tr' ? 'Paylaşılıyor...' : 'Posting...'}</span>
                      </>
                    ) : (
                      <>
                        <Send />
                        <span>{language === 'tr' ? 'Paylaş' : 'Post'}</span>
                      </>
                    )}
                    </Button>
                  </HintTooltip>
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>

      {/* Post List (hidden entirely while a private community is locked) */}
      {/* Projeler paneli gönderi listesinin YERİNE geçiyor. */}
      {communityScope && communityTab === 'projects' && !isPrivateLocked && (
        <CommunityProjectsPanel
          community={communityScope}
          user={user}
          language={language}
          isMember={isScopeMember}
          onOpenShare={onOpenShareProject}
          onOpenProject={(slug) => {
            window.history.pushState(null, '', `/project/${slug}`);
            window.dispatchEvent(new PopStateEvent('popstate'));
          }}
        />
      )}

      <div
        className={`divide-y divide-zinc-800/40 ${
          isPrivateLocked || (communityScope && communityTab === 'projects') ? 'hidden' : ''
        }`}
      >
        {isLoading && filteredPosts.length === 0 ? (
          /* First sync: show the shape of the content instead of a "nothing here" message. */
          <div className="divide-y divide-zinc-800/40" aria-busy="true" aria-live="polite">
            {[0, 1, 2].map((index) => (
              <div key={index} className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-2.5 w-20" />
                  </div>
                </div>
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
                <div className="flex items-center gap-4 pt-1">
                  <Skeleton className="h-6 w-14 rounded-xl" />
                  <Skeleton className="h-6 w-14 rounded-xl" />
                  <Skeleton className="h-6 w-14 rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-zinc-300">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-sm font-bold text-white">
              {communityScope
                ? (language === 'tr' ? 'Bu Toplulukta Henüz Gönderi Yok' : 'No Posts In This Community Yet')
                : (language === 'tr' ? 'Henüz Gönderi Yok' : 'No Posts Yet')}
            </h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              {communityScope
                ? isScopeMember
                  ? (language === 'tr'
                      ? `İlk gönderiyi sen paylaş — buradan paylaştığın her şey otomatik olarak ${communityScope.name} akışına düşer.`
                      : `Be the first to post — everything you share here lands in the ${communityScope.name} feed.`)
                  : (language === 'tr'
                      ? 'Topluluğa katılarak ilk gönderiyi paylaşabilirsin.'
                      : 'Join the community to share the first post.')
                : (language === 'tr'
                    ? 'Bu kategoride veya akışta henüz bir gönderi bulunmuyor.'
                    : 'No posts found in this category or feed.')}
            </p>
          </div>
        ) : (
          filteredPosts.map((post) => {
            const postAuthorId = (post.author as any)?.id;
            const authorProfile =
              user &&
              ((postAuthorId && postAuthorId === user.id) ||
                post.author.username?.toLowerCase() === user.username?.toLowerCase())
                ? { ...post.author, ...user }
                : allUsers.find(
                    (u) =>
                      (u.id && postAuthorId && u.id === postAuthorId) ||
                      (u.username &&
                        u.username.toLowerCase() === post.author.username?.toLowerCase())
                  ) || post.author;

            const userKey = (user.username || user.id || '').toLowerCase();
            const isLiked = Boolean(
              (post.liked_by && post.liked_by.map((k) => k.toLowerCase()).includes(userKey)) ||
                post.is_liked
            );
            const isReposted = Boolean(
              (post.reposted_by && post.reposted_by.map((k) => k.toLowerCase()).includes(userKey)) ||
                post.is_reposted
            );
            const isBookmarked = Boolean(
              (post.bookmarked_by && post.bookmarked_by.map((k) => k.toLowerCase()).includes(userKey)) ||
                post.is_bookmarked ||
                user.saved_post_ids?.includes(post.id)
            );
            const likesCount =
              post.liked_by && post.liked_by.length > 0 ? post.liked_by.length : post.likes_count || 0;
            const repostsCount =
              post.reposted_by && post.reposted_by.length > 0
                ? post.reposted_by.length
                : post.reposts_count || 0;
            const commentsCount =
              post.comments && post.comments.length > 0 ? post.comments.length : post.comments_count || 0;

            const isPostAuthor =
              (authorProfile.username || '').toLowerCase() === (user.username || '').toLowerCase();
            const canDelete = isPostAuthor || isNylithra;

            const postCategoryObj = combinedCategoryList.find((c) => c.id === post.category);

            return (
              <article
                key={post.id}
                onContextMenu={(e) => handlePostContextMenu(e, post)}
                onTouchStart={(e) => handleTouchStart(e, post)}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
                /*
                  Üzerine gelme geri bildirimi eskiden neredeyse görünmezdi
                  (zinc-900/30). Satırın "tıklanabilir bir şey" olduğunu anlatan
                  en ucuz sinyal bu, biraz belirginleştirildi ve sol kenara ince
                  bir aksan çizgisi eklendi.
                */
                className={`group/post c4e-interactive relative select-text space-y-3 p-4 before:absolute before:inset-y-0 before:left-0 before:w-[2px] before:bg-gradient-to-b before:from-blue-500/0 before:via-indigo-500/60 before:to-violet-500/0 before:opacity-0 before:transition-opacity hover:bg-zinc-900/50 hover:before:opacity-100 ${
                  isNylithra ? 'cursor-context-menu' : ''
                } ${longPressingPostId === post.id ? 'bg-zinc-900/60 scale-[0.995] transition-transform' : ''}`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <UserAvatar
                      src={authorProfile.avatar_url}
                      name={authorProfile.display_name || authorProfile.username}
                      className="ring-1 ring-zinc-800"
                      onClick={() => onSelectUser(authorProfile.username)}
                      title={`@${authorProfile.username}`}
                    />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          onClick={() => onSelectUser(authorProfile.username)}
                          className="font-bold text-white text-xs hover:text-blue-400 cursor-pointer transition-colors"
                        >
                          {authorProfile.display_name}
                        </span>
                        <UserBadges user={authorProfile} singleHighestWeightOnly={true} showTextLabels={false} />
                        <span
                          onClick={() => onSelectUser(authorProfile.username)}
                          className="text-xs text-zinc-500 font-mono hover:underline cursor-pointer"
                        >
                          @{authorProfile.username}
                        </span>
                        <span className="text-xs text-zinc-600">·</span>
                        <span
                          className="text-[11px] text-zinc-500 font-mono"
                          title={post.created_at ? new Date(post.created_at).toLocaleString() : ''}
                        >
                          {formatTimeAgo(post.created_at || post.time_ago, language)}
                        </span>

                        {/* Category Badge */}
                        {post.category && (
                          <>
                            <span className="text-xs text-zinc-600">·</span>
                            <button type="button" onClick={() => setFeedCategoryFilter(post.category!)} className="cursor-pointer">
                              <Badge variant="category" className="hover:bg-blue-500/20 transition-colors">
                                <span>{postCategoryObj?.icon || '🏷️'}</span>
                                <span>{postCategoryObj?.name || post.category_name || post.category}</span>
                              </Badge>
                            </button>
                          </>
                        )}

                        {post.community_name && (
                          <>
                            <span className="text-xs text-zinc-600">·</span>
                            <button
                              type="button"
                              onClick={() => {
                                if (onSelectCommunity) {
                                  onSelectCommunity(post.community_handle || post.community_name!);
                                } else {
                                  onSelectUser(post.community_handle || post.community_name!);
                                }
                              }}
                              className="cursor-pointer"
                            >
                              <Badge variant="community" className="hover:bg-purple-500/20 transition-colors">
                                <Users className="w-3 h-3" />
                                <span>{post.community_name}</span>
                              </Badge>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Post menu — one affordance instead of a row of naked icons, and it is
                      keyboard reachable (Radix handles focus, Escape and arrow keys). */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="iconSm"
                        className="text-zinc-600 hover:text-white shrink-0"
                        aria-label={language === 'tr' ? 'Gönderi menüsü' : 'Post menu'}
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => handleShare(post)}>
                        <Link2 />
                        {language === 'tr' ? 'Bağlantıyı kopyala' : 'Copy link'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onBookmarkPost(post.id)}>
                        <Bookmark />
                        {isBookmarked
                          ? language === 'tr' ? 'Kayıtlardan çıkar' : 'Remove bookmark'
                          : language === 'tr' ? 'Kaydet' : 'Bookmark'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onSelectUser(authorProfile.username)}>
                        <User />
                        {language === 'tr' ? 'Profili görüntüle' : 'View profile'}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => setPostToReport(post)}>
                        <Flag />
                        {language === 'tr' ? 'Gönderiyi bildir' : 'Report post'}
                      </DropdownMenuItem>
                      {canDelete && (
                        <DropdownMenuItem destructive onSelect={() => setPostToDelete(post)}>
                          <Trash2 />
                          {isNylithra && !isPostAuthor
                            ? language === 'tr' ? 'Yönetici olarak sil' : 'Delete as admin'
                            : language === 'tr' ? 'Sil' : 'Delete'}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Content */}
                {post.content && <p className="text-xs text-zinc-200 leading-relaxed user-text">{post.content}</p>}

                {/* Media */}
                {post.media_url && (
                  <div className="rounded-2xl overflow-hidden border border-zinc-800 bg-black max-h-[480px] flex items-center justify-center">
                    {post.media_type === 'video' || post.media_url.startsWith('data:video') ? (
                      <video
                        src={post.media_url}
                        controls
                        playsInline
                        className="w-full max-h-[480px] object-contain rounded-2xl"
                      />
                    ) : (
                      <img
                        src={post.media_url}
                        alt="Post attachment"
                        className="w-full max-h-[480px] object-cover rounded-2xl"
                      />
                    )}
                  </div>
                )}

                {/* Project Card */}
                {post.project_card && (
                  <div className="p-3 bg-[#0c0c0e] border border-blue-900/40 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-white flex items-center gap-1.5">
                        <GitBranch className="w-3.5 h-3.5 text-blue-400" />
                        <span>{post.project_card.title}</span>
                      </span>
                      <a
                        href={`https://github.com/${post.author.username}/${post.project_card.title}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1 text-zinc-400 hover:text-white"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                    {post.project_card.description && (
                      <p className="text-xs text-zinc-400">{post.project_card.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-[10px] font-mono text-zinc-500 pt-1">
                      <span className="text-blue-400">{post.project_card.language}</span>
                      <span className="flex items-center gap-1">
                        <Star className="w-3 h-3 text-amber-400" />
                        <span>{post.project_card.stars}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <GitFork className="w-3 h-3 text-zinc-400" />
                        <span>{post.project_card.forks}</span>
                      </span>
                    </div>
                  </div>
                )}

                {/* Code Snippet */}
                {post.code_snippet && (
                  <CodeSnippetBlock
                    snippet={post.code_snippet}
                    language={language}
                    postAuthor={post.author.username}
                  />
                )}

                {/* Post Action Buttons */}
                <div className="flex items-center justify-between pt-2.5 mt-1 border-t border-zinc-800/40 text-xs text-zinc-400">
                  <div className="flex items-center gap-1 sm:gap-2">
                    {/* Comment */}
                    <button
                      type="button"
                      onClick={() =>
                        setActiveCommentPostId(
                          activeCommentPostId === post.id ? null : post.id
                        )
                      }
                      className={cn(
                        'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        activeCommentPostId === post.id
                          ? 'text-blue-400 bg-blue-500/10 font-semibold'
                          : 'text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10'
                      )}
                      aria-label={language === 'tr' ? 'Yorumlar' : 'Comments'}
                      aria-expanded={activeCommentPostId === post.id}
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span className="font-mono text-xs">{commentsCount}</span>
                    </button>

                    {/* Repost */}
                    <HintTooltip label={language === 'tr' ? 'Yeniden paylaş' : 'Repost'}>
                    <button
                      type="button"
                      onClick={() => onRepostPost(post.id)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition-all cursor-pointer ${
                        isReposted
                          ? 'text-emerald-400 bg-emerald-500/10 font-bold'
                          : 'text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10'
                      }`}
                      aria-label={language === 'tr' ? 'Yeniden paylaş' : 'Repost'}
                      aria-pressed={isReposted}
                    >
                      <Repeat className="w-4 h-4" />
                      <span className="font-mono text-xs">{repostsCount}</span>
                    </button>
                    </HintTooltip>

                    {/* Like */}
                    <HintTooltip label={isLiked ? (language === 'tr' ? 'Beğeniyi geri al' : 'Unlike') : (language === 'tr' ? 'Beğen' : 'Like')}>
                    <button
                      type="button"
                      onClick={() => onLikePost(post.id)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition-all cursor-pointer ${
                        isLiked
                          ? 'text-red-500 bg-red-500/10 font-bold'
                          : 'text-zinc-400 hover:text-red-400 hover:bg-red-500/10'
                      }`}
                      aria-label={language === 'tr' ? 'Beğen' : 'Like'}
                      aria-pressed={isLiked}
                    >
                      <Heart className={`w-4 h-4 transition-transform group-hover:scale-105 ${isLiked ? 'fill-red-500 stroke-red-500 scale-110' : ''}`} />
                      <span className="font-mono text-xs">{likesCount}</span>
                    </button>
                    </HintTooltip>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Bookmark */}
                    <HintTooltip label={isBookmarked ? (language === 'tr' ? 'Kayıtlardan çıkar' : 'Remove bookmark') : (language === 'tr' ? 'Kaydet' : 'Bookmark')}>
                    <button
                      type="button"
                      onClick={() => onBookmarkPost(post.id)}
                      className={`p-1.5 rounded-xl transition-all inline-flex items-center justify-center cursor-pointer ${
                        isBookmarked
                          ? 'text-amber-400 bg-amber-500/10'
                          : 'text-zinc-400 hover:text-amber-400 hover:bg-zinc-800/40'
                      }`}
                      title={
                        isBookmarked
                          ? language === 'tr'
                            ? 'Kaydedildi'
                            : 'Bookmarked'
                          : language === 'tr'
                          ? 'Kaydet'
                          : 'Save'
                      }
                    >
                      <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-amber-400' : ''}`} />
                    </button>
                    </HintTooltip>

                    {/* Share */}
                    <HintTooltip label={copiedPostId === post.id ? (language === 'tr' ? 'Kopyalandı!' : 'Copied!') : (language === 'tr' ? 'Bağlantıyı kopyala' : 'Copy link')}>
                    <button
                      type="button"
                      onClick={() => handleShare(post)}
                      className={`p-1.5 rounded-xl transition-all inline-flex items-center justify-center cursor-pointer ${
                        copiedPostId === post.id
                          ? 'text-emerald-400 bg-emerald-500/10'
                          : 'text-zinc-400 hover:text-white hover:bg-zinc-800/40'
                      }`}
                      title={
                        copiedPostId === post.id
                          ? language === 'tr'
                            ? 'Bağlantı Kopyalandı'
                            : 'Link Copied'
                          : language === 'tr'
                          ? 'Paylaş'
                          : 'Share'
                      }
                    >
                      {copiedPostId === post.id ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Share2 className="w-4 h-4" />
                      )}
                    </button>
                    </HintTooltip>
                  </div>
                </div>

                {/* Comment Section Dropdown */}
                {activeCommentPostId === post.id && (
                  <div className="pt-3 border-t border-zinc-800/40 space-y-3">
                    <form
                      onSubmit={(e) => handleCommentSubmit(post.id, e)}
                      className="flex gap-2"
                    >
                      <input
                        type="text"
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        placeholder={
                          language === 'tr'
                            ? 'Fikrini veya cevabını yaz...'
                            : 'Write your thoughts or reply...'
                        }
                        className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                      />
                      <Button type="submit" size="sm" disabled={!commentText.trim()}>
                        <Send />
                        <span>{language === 'tr' ? 'Yanıtla' : 'Reply'}</span>
                      </Button>
                    </form>

                    {post.comments && post.comments.length > 0 && (
                      <div className="space-y-2 pt-1">
                        {post.comments.map((comment) => {
                          const commentAuthor = allUsers.find(
                            (u) => u.username?.toLowerCase() === comment.author.username?.toLowerCase()
                          ) || comment.author;

                          return (
                            <div
                              key={comment.id}
                              className="p-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800/80 text-xs space-y-1"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span
                                    onClick={() => onSelectUser(comment.author.username)}
                                    className="font-bold text-white hover:underline cursor-pointer"
                                  >
                                    {comment.author.display_name}
                                  </span>
                                  <UserBadges user={commentAuthor} showTextLabels={false} />
                                  <span className="text-zinc-500 font-mono text-[10px]">
                                    @{comment.author.username}
                                  </span>
                                </div>
                                <span className="text-zinc-600 font-mono text-[10px]">
                                  {formatTimeAgo(comment.created_at || 'Az önce', language)}
                                </span>
                              </div>
                              <p className="text-zinc-300 leading-relaxed user-text">{comment.content}</p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>

      {/* Right-Click / Long-Press Context Menu */}
      {contextMenu.visible && contextMenu.post && (() => {
        const isPostAuthor =
          (contextMenu.post.author?.username || '').toLowerCase() === (user.username || '').toLowerCase();
        const canDelete = isPostAuthor || isNylithra;

        return (
          <div
            className="fixed z-50 animate-in fade-in zoom-in-95 duration-100"
            style={{
              left: `${contextMenu.x}px`,
              top: `${contextMenu.y}px`
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-60 bg-[#121215]/95 backdrop-blur-xl border border-zinc-700/80 rounded-2xl shadow-2xl p-1.5 space-y-1">
              <div className="px-3 py-2 border-b border-zinc-800/60 flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  {isNylithra ? (
                    <>
                      <Shield className="w-3.5 h-3.5 text-red-400" />
                      <span className="text-red-400">Admin Menüsü</span>
                    </>
                  ) : (
                    <>
                      <Code className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Gönderi Seçenekleri</span>
                    </>
                  )}
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">@{contextMenu.post.author.username}</span>
              </div>

              {/* Profile Button */}
              <button
                type="button"
                onClick={() => {
                  if (contextMenu.post) {
                    onSelectUser(contextMenu.post.author.username);
                    setContextMenu({ visible: false, x: 0, y: 0, post: null });
                  }
                }}
                className="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-zinc-200 hover:bg-zinc-800/80 transition-colors flex items-center gap-2.5 cursor-pointer"
              >
                <User className="w-3.5 h-3.5 text-blue-400" />
                <span>{language === 'tr' ? 'Yazar Profilini Aç' : 'View Author Profile'}</span>
              </button>

              {/* Copy Link Button */}
              <button
                type="button"
                onClick={() => {
                  if (contextMenu.post) {
                    handleShare(contextMenu.post);
                    setContextMenu({ visible: false, x: 0, y: 0, post: null });
                  }
                }}
                className="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-zinc-300 hover:bg-zinc-800/80 transition-colors flex items-center gap-2.5 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5 text-zinc-400" />
                <span>{language === 'tr' ? 'Bağlantıyı Kopyala' : 'Copy Post Link'}</span>
              </button>

              {/* Bookmark Button */}
              <button
                type="button"
                onClick={() => {
                  if (contextMenu.post) {
                    onBookmarkPost(contextMenu.post.id);
                    setToastMessage(language === 'tr' ? 'Yer işaretleri güncellendi.' : 'Bookmarks updated.');
                    setTimeout(() => setToastMessage(null), 2000);
                    setContextMenu({ visible: false, x: 0, y: 0, post: null });
                  }
                }}
                className="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-zinc-300 hover:bg-zinc-800/80 transition-colors flex items-center gap-2.5 cursor-pointer"
              >
                <Bookmark className="w-3.5 h-3.5 text-amber-400" />
                <span>
                  {user.saved_post_ids?.includes(contextMenu.post.id)
                    ? language === 'tr'
                      ? 'Yer İşaretlerinden Kaldır'
                      : 'Remove Bookmark'
                    : language === 'tr'
                    ? 'Yer İşaretlerine Ekle'
                    : 'Save to Bookmarks'}
                </span>
              </button>

              {/* Report Post Button */}
              <button
                type="button"
                onClick={() => {
                  if (contextMenu.post) {
                    const target = contextMenu.post;
                    setContextMenu({ visible: false, x: 0, y: 0, post: null });
                    setPostToReport(target);
                  }
                }}
                className="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-amber-400 hover:bg-amber-500/15 transition-colors flex items-center gap-2.5 cursor-pointer"
              >
                <Flag className="w-3.5 h-3.5 text-amber-400" />
                <span>{language === 'tr' ? 'Gönderiyi Bildir' : 'Report Post'}</span>
              </button>

              {/* Delete Button */}
              {canDelete && (
                <button
                  type="button"
                  onClick={() => {
                    if (contextMenu.post) {
                      const target = contextMenu.post;
                      setContextMenu({ visible: false, x: 0, y: 0, post: null });
                      setPostToDelete(target);
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl text-left text-xs font-bold text-red-400 hover:bg-red-500/15 transition-colors flex items-center gap-2.5 border-t border-zinc-800/80 mt-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  <span>
                    {isNylithra && !isPostAuthor
                      ? language === 'tr'
                        ? 'Bu Gönderiyi Sil (Yönetici)'
                        : 'Delete Post (Admin)'
                      : language === 'tr'
                      ? 'Bu Gönderiyi Sil'
                      : 'Delete Post'}
                  </span>
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* Report Post Modal */}
      {postToReport && (
        <ReportPostModal
          isOpen={Boolean(postToReport)}
          onClose={() => setPostToReport(null)}
          post={postToReport}
          currentUser={user}
          language={language}
          onSuccess={() => {
            setToastMessage(
              language === 'tr'
                ? 'Şikayetiniz yöneticiye iletildi. Teşekkürler!'
                : 'Report submitted to admin. Thank you!'
            );
            setTimeout(() => setToastMessage(null), 3000);
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {/* Destructive confirmation — Radix AlertDialog traps focus, closes on Escape and
          announces itself to screen readers, none of which the old overlay did. */}
      <AlertDialog open={!!postToDelete} onOpenChange={(open) => !open && setPostToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 flex-shrink-0">
                <Trash2 className="w-5 h-5" />
              </span>
              <span className="min-w-0 text-left">
                <AlertDialogTitle>{language === 'tr' ? 'Gönderiyi Sil' : 'Delete Post'}</AlertDialogTitle>
                <p className="text-xs text-zinc-400 font-mono">@{postToDelete?.author?.username}</p>
              </span>
            </div>
            <AlertDialogDescription className="pt-1">
              {language === 'tr'
                ? 'Bu gönderiyi kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz.'
                : 'Are you sure you want to permanently delete this post? This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {postToDelete?.content && (
            <p className="p-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800/80 text-[11px] text-zinc-400 line-clamp-2 italic font-mono">
              &quot;{postToDelete.content}&quot;
            </p>
          )}

          <AlertDialogFooter className="border-t border-zinc-800/80 pt-4">
            <AlertDialogCancel>{language === 'tr' ? 'Vazgeç' : 'Cancel'}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!postToDelete) return;
                onDeletePost(postToDelete.id);
                setPostToDelete(null);
                setToastMessage(language === 'tr' ? 'Gönderi silindi.' : 'Post deleted.');
                setTimeout(() => setToastMessage(null), 2500);
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{language === 'tr' ? 'Kalıcı Olarak Sil' : 'Delete Permanently'}</span>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
