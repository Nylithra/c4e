import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import os from 'node:os';
import crypto from 'node:crypto';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  asString,
  attachOptionalAuth,
  createSignedState,
  env,
  isServerless,
  escapeHtml,
  isPlainObject,
  jsonForScript,
  normalizeUsername,
  rateLimit,
  requireAdmin,
  requireAuth,
  safeEquals,
  safeFetch,
  supabaseConfigured,
  verifySignedState,
  hmacHex
} from './src/server/security';
import {
  LIMITS,
  canManageCommunity,
  countActiveKeys,
  extractApiKey,
  findCommunityById,
  findCommunityByHandle,
  generateApiKey,
  insertCommunityPost,
  insertKey,
  listCommunityPosts,
  listKeysForCommunity,
  listPublicCommunities,
  resolveApiKey,
  revokeKey,
  sanitizeText,
  serviceRoleConfigured,
  toPublicKey,
  touchApiKey,
  validatePostPayload,
  type CommunityRow
} from './src/server/communityApi';
import {
  describeMailConfig,
  fetchInbox,
  getImapConfig,
  imapMode,
  imapUnavailableReason,
  getSmtpConfig,
  readMessage,
  resolveRecipientByUsername,
  sendMail,
  supportsLiveImap,
  syncInbox,
  verifyImap,
  verifySmtp
} from './src/server/mail';
import { clearMailbox, readInboxSnapshot, storeWarning } from './src/server/mailStore';
import { createPkce, openFlow, sealFlow } from './src/server/oauthFlow';
import {
  buildJubbioAuthorizeUrl,
  exchangeJubbioCode,
  fetchJubbioUser,
  getJubbioConfig,
  jubbioUnavailableReason
} from './src/server/jubbio';
import {
  accountsConfigured,
  clearGithubLink,
  clearJubbioLink,
  findByGithubUsername,
  findById,
  findByJubbioId,
  readGithubIdentity,
  writeGithubLink,
  writeJubbioLink
} from './src/server/accounts';
import {
  cronSecretMatches,
  dispatchNotificationEmails,
  dispatcherConfigured,
  readEmailPrefs,
  sanitizeEmailPrefs,
  verifyUnsubscribeToken,
  writeEmailPrefs,
  DEFAULT_EMAIL_PREFS
} from './src/server/notificationMail';
import { renderMailHtml } from './src/server/mailTemplate';
import {
  allTimeTop,
  allocateSlug,
  cleanGallery,
  cleanImage,
  cleanText,
  PROJECT_BODY_LIMIT,
  findProjectById,
  findProjectByRepo,
  findProjectBySlug,
  findProjectDetail,
  insertProject,
  listProjects,
  newProjectId,
  projectOfTheWeek,
  projectsConfigured,
  readRelations,
  runCommitWatch,
  setRelation,
  softDeleteProject,
  toPositiveInt,
  updateProject,
  verifyOwnRepo,
  type ProjectSort,
  type RepoFacts
} from './src/server/projects';
import {
  addProjectToCommunity,
  canSeeCommunity,
  communityProjectsConfigured,
  isCommunityOwner,
  isMemberOf,
  linkExists,
  listCommunityProjectLinks,
  listProjectCommunityIds,
  removeAllLinksForProject,
  removeProjectFromCommunity
} from './src/server/communityProjects';

/**
 * ASYNC İŞLEYİCİ KORUMASI — her rotayı ve her ara katmanı kapsar.
 *
 * SORUN: Express 4, async bir işleyiciden fırlayan hatayı YAKALAMAZ. Dönen söz
 * reddedildiğinde kimse onu ele almıyor; Node 22 ise yakalanmamış bir söz reddinde
 * SÜRECİ SONLANDIRIYOR. Yani Supabase'e giden tek bir isteğin takılması, o anda
 * platformu kullanan HERKESİN sunucusunu düşürüyordu — testte birebir yaşandı.
 *
 * NEDEN KAYIT NOKTASINDA, HER ROTAYI TEK TEK SARARAK DEĞİL:
 *
 *   1. Ara katmanlar da async. `requireAuth` ve `attachOptionalAuth` birer async
 *      fonksiyon ve tam olarak aynı şekilde reddedebiliyorlar. Rotaları tek tek
 *      sarmak onları kapsamazdı; asıl kimlik doğrulama yolu korumasız kalırdı.
 *   2. Unutulamaz. Yarın eklenen bir rota hiçbir şey yapmadan korunmuş oluyor;
 *      elle sarma düzeninde ise koruma "hatırlamaya" bağlı kalırdı.
 *   3. Tek nokta. 57 çağrı yerinde tekrarlanan bir sarmalayıcı, 57 ayrı yerde
 *      yanlış yazılma fırsatı demek.
 *
 * Hata `next(err)` ile aşağıdaki `/api` hata ara katmanına gidiyor: zaten var olan
 * tek hata yolu kullanılıyor, yanıt biçimi değişmiyor ve istemciye yığın izi sızmıyor.
 *
 * DÖRT ARGÜMANLI işleyicilere dokunulmuyor: Express bir fonksiyonun hata işleyicisi
 * olduğunu argüman SAYISINDAN anlıyor, sarmak onu sıradan bir ara katmana çevirirdi.
 */
type AnyHandler = (...args: any[]) => any;

function guardHandler(fn: AnyHandler): AnyHandler {
  if (typeof fn !== 'function' || fn.length >= 4) return fn;

  return function guarded(this: unknown, req: Request, res: Response, next: NextFunction) {
    let out: unknown;
    try {
      out = (fn as AnyHandler).call(this, req, res, next);
    } catch (err) {
      next(err);
      return;
    }
    if (out && typeof (out as Promise<unknown>).then === 'function') {
      (out as Promise<unknown>).catch(next);
    }
    return out;
  };
}

/** Rota kaydını yapan metotları, verilen işleyicileri koruyacak şekilde değiştirir. */
function installAsyncGuard(target: any): void {
  for (const method of ['get', 'post', 'put', 'patch', 'delete', 'all', 'use'] as const) {
    const original = target[method].bind(target);
    target[method] = (...args: any[]) => original(...args.map((a) => guardHandler(a)));
  }
}

const app = express();

// Rotalardan ÖNCE kurulmalı: koruma yalnızca kurulduktan sonra kaydedilen
// işleyicileri sarar, bu yüzden app oluşturulur oluşturulmaz çağrılıyor.
installAsyncGuard(app);

const PORT = Number(env('PORT', '3000'));
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * `trust proxy` must reflect the real deployment, otherwise `req.ip` is either spoofable
 * (when set too permissively) or always the proxy address (when unset behind a load
 * balancer), which silently disables every per-IP rate limit.
 */
app.set('trust proxy', env('TRUST_PROXY', IS_PRODUCTION ? '1' : 'loopback'));
app.disable('x-powered-by');

// Small bodies only: every endpoint below exchanges JSON metadata, never media blobs.
app.use(
  express.json({
    limit: '256kb',
    verify: (req: Request, _res, buf) => {
      // Keep the exact bytes around so inbound webhook signatures can be verified.
      (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
    }
  })
);

// -------------------------------------------------------------
// SECURITY HEADERS
// -------------------------------------------------------------

const CSP_DIRECTIVES = [
  "default-src 'self'",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.github.com https://github.com ws://localhost:* ws://127.0.0.1:*",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  // No 'unsafe-eval' and no wildcard host: only first-party scripts may execute.
  "script-src 'self' 'unsafe-inline'",
  "script-src-elem 'self' 'unsafe-inline'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'"
].join('; ');

app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Content-Security-Policy', CSP_DIRECTIVES);
  if (IS_PRODUCTION) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=(), usb=(), interest-cohort=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  // NOTE: X-XSS-Protection is deliberately NOT set. The legacy auditor is disabled in
  // every current browser and its filter introduced vulnerabilities of its own.
  next();
});

// Attach the caller's Supabase identity (when present) before the routes run.
app.use('/api', attachOptionalAuth);

// Baseline limiter for the whole API surface; individual routes tighten it further.
app.use('/api', rateLimit({ scope: 'api', windowMs: 60000, max: 120 }));

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    platform: 'Code4Ever',
    timestamp: new Date().toISOString(),
    auth: supabaseConfigured() ? 'supabase' : 'unconfigured',
    webhooks_supported: true,
    rate_limiter: 'sliding_window_active'
  });
});

// -------------------------------------------------------------
// WEBHOOK RELAY ENGINE (DISCORD, JUBBIO, TELEGRAM)
// -------------------------------------------------------------
// Every destination is validated by `safeFetch`: https only, host allow-listed, and the
// resolved IP must be public. Without this an authenticated user could point the relay at
// http://169.254.169.254/ (cloud metadata) or any internal service and read the response.

const DISCORD_HOSTS = ['discord.com', 'discordapp.com', 'ptb.discord.com', 'canary.discord.com'];
const TELEGRAM_HOSTS = ['api.telegram.org'];
const JUBBIO_HOSTS = env('JUBBIO_ALLOWED_HOSTS', 'jubbio.com,*.jubbio.com')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean);

const MAX_WEBHOOK_MESSAGE_LENGTH = 3500;

async function sendDiscordWebhook(webhookUrl: string, message: string, botName?: string, avatarUrl?: string) {
  const payload = {
    content: message,
    username: asString(botName, 80) || 'Code4Ever Bot',
    avatar_url: asString(avatarUrl, 500) || undefined
  };

  const response = await safeFetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    allowedHosts: DISCORD_HOSTS,
    timeoutMs: 12000
  });

  if (!response.ok) {
    throw new Error(`Discord Webhook hatası (${response.status}): ${response.text || response.statusText}`);
  }
  return true;
}

async function sendJubbioWebhook(
  config: { webhook_url?: string; bot_token?: string; guild_id?: string; channel_id?: string },
  message: string
) {
  const cleanUrl = asString(config.webhook_url, 500);
  const cleanToken = asString(config.bot_token, 300);
  const cleanChannelId = asString(config.channel_id, 100).replace(/[^a-zA-Z0-9_-]/g, '');

  // 1. Direct Webhook URL if provided
  if (cleanUrl) {
    const response = await safeFetch(cleanUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Code4Ever-Webhook/1.0',
        Accept: 'application/json, text/plain, */*'
      },
      body: JSON.stringify({
        content: message,
        text: message,
        message,
        username: 'Code4Ever Bot',
        name: 'Code4Ever Bot',
        platform: 'Code4Ever'
      }),
      allowedHosts: JUBBIO_HOSTS,
      timeoutMs: 12000
    });

    if (!response.ok) {
      throw new Error(`Jubbio Webhook hatası (${response.status}): ${response.text || response.statusText || 'Bilinmeyen yanıt'}`);
    }
    return true;
  }

  // 2. Jubbio Bot API endpoint if bot token & channel id provided
  if (cleanToken && cleanChannelId) {
    const response = await safeFetch(`https://jubbio.com/api/v1/channels/${encodeURIComponent(cleanChannelId)}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bot ${cleanToken.replace(/^Bot\s+/i, '')}`,
        'User-Agent': 'Code4Ever-Webhook/1.0',
        Accept: 'application/json, text/plain, */*'
      },
      body: JSON.stringify({ content: message, message }),
      allowedHosts: JUBBIO_HOSTS,
      timeoutMs: 12000
    });

    if (!response.ok) {
      throw new Error(`Jubbio Bot API hatası (${response.status}): ${response.text || response.statusText || 'Bilinmeyen yanıt'}`);
    }
    return true;
  }

  throw new Error('Jubbio için lütfen geçerli bir Webhook URL veya Bot Token + Kanal ID girin.');
}

async function sendTelegramWebhook(botToken: string, chatId: string, message: string) {
  const cleanToken = asString(botToken, 200).replace(/^bot/i, '');
  const cleanChatId = asString(chatId, 100);

  if (!/^[A-Za-z0-9:_-]+$/.test(cleanToken)) {
    throw new Error('Geçersiz Telegram Bot Token biçimi.');
  }

  const url = `https://api.telegram.org/bot${cleanToken}/sendMessage`;

  let response = await safeFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: cleanChatId,
      text: message,
      parse_mode: 'Markdown',
      disable_web_page_preview: false
    }),
    allowedHosts: TELEGRAM_HOSTS,
    timeoutMs: 12000
  });

  // Fallback to plain text if the Markdown parse fails on Telegram's side
  if (!response.ok) {
    response = await safeFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: cleanChatId,
        text: message.replace(/[*_`[\]()]/g, ''),
        disable_web_page_preview: false
      }),
      allowedHosts: TELEGRAM_HOSTS,
      timeoutMs: 12000
    });
  }

  if (!response.ok) {
    let description = '';
    try {
      description = JSON.parse(response.text || '{}').description || '';
    } catch {
      /* ignore malformed error payloads */
    }
    throw new Error(`Telegram API hatası (${response.status}): ${description || 'Geçersiz Bot Token veya Chat ID'}`);
  }
  return true;
}

// -------------------------------------------------------------
// POST DELETION & MULTI-DEVICE SYNC ENGINE
// -------------------------------------------------------------
// The deletion itself is performed with the CALLER's Supabase access token, so Row Level
// Security decides whether they own the post. The previous implementation accepted
// attacker supplied Supabase credentials and deleted any post for any anonymous caller.

const MAX_TRACKED_DELETIONS = 5000;
const globalDeletedPostIds = new Set<string>();

function trackDeletedPost(postId: string): void {
  globalDeletedPostIds.add(postId);
  if (globalDeletedPostIds.size > MAX_TRACKED_DELETIONS) {
    const overflow = globalDeletedPostIds.size - MAX_TRACKED_DELETIONS;
    let removed = 0;
    for (const id of globalDeletedPostIds) {
      globalDeletedPostIds.delete(id);
      if (++removed >= overflow) break;
    }
  }
}

app.get('/api/posts/deleted', (_req: Request, res: Response) => {
  res.json({ success: true, deleted_ids: Array.from(globalDeletedPostIds) });
});

app.post(
  '/api/posts/delete',
  requireAuth,
  rateLimit({ scope: 'post-delete', windowMs: 60000, max: 30, perUser: true }),
  async (req: Request, res: Response) => {
    const postId = asString(req.body?.postId, 120);

    if (!postId) {
      res.status(400).json({ success: false, error: 'postId gereklidir.' });
      return;
    }

    const accessToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    let supabaseDeleted = false;
    let supabaseError: string | null = null;

    if (SUPABASE_URL && SUPABASE_ANON_KEY && accessToken) {
      const endpoint = `${SUPABASE_URL}/rest/v1/posts?id=eq.${encodeURIComponent(postId)}`;
      const headers = {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      };

      try {
        const deleteRes = await safeFetch(endpoint, {
          method: 'DELETE',
          headers: { ...headers, Prefer: 'return=representation' },
          timeoutMs: 10000
        });

        if (deleteRes.ok) {
          supabaseDeleted = true;
        } else {
          // Soft-delete fallback for deployments whose DELETE policy is stricter than UPDATE.
          const patchRes = await safeFetch(endpoint, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ is_deleted: true, content: '[DELETED]' }),
            timeoutMs: 10000
          });
          if (patchRes.ok) {
            supabaseDeleted = true;
          } else {
            supabaseError = 'Bu gönderiyi silme yetkiniz yok.';
          }
        }
      } catch (err: any) {
        supabaseError = err?.message || 'Network error';
      }
    } else {
      supabaseError = 'Supabase yapılandırılmamış.';
    }

    if (!supabaseDeleted) {
      res.status(403).json({ success: false, postId, error: supabaseError || 'Silme işlemi reddedildi.' });
      return;
    }

    trackDeletedPost(postId);
    res.json({
      success: true,
      postId,
      supabaseDeleted,
      message: 'Gönderi başarıyla silindi ve tüm cihazlarda senkronize edildi.'
    });
  }
);

// -------------------------------------------------------------
// COMMUNITY CODE SHARING HTTP API (REST)
// -------------------------------------------------------------
//
// Public, documented at /dev/docs. Two halves:
//
//   * Read endpoints — open, unauthenticated, public communities and their posts only.
//   * Write endpoint — needs a community API key (`X-API-Key`). Keys are minted by the
//     community founder through the key-management endpoints below, which in turn need a
//     signed-in session. Keys are stored as SHA-256 hashes, so this file never holds and
//     never logs a usable credential.

/** Shape returned for a community in public listings. */
function publicCommunityShape(c: CommunityRow) {
  return {
    id: c.id,
    name: c.name,
    handle: c.handle,
    description: c.description,
    members_count: c.members_count ?? 0,
    posts_url: `/api/v1/communities/${encodeURIComponent(c.handle)}/posts`
  };
}

function apiKeysUnavailable(res: Response): boolean {
  if (serviceRoleConfigured()) return false;
  res.status(503).json({
    success: false,
    error:
      'Topluluk API sunucu tarafında yapılandırılmamış (SUPABASE_SERVICE_ROLE_KEY eksik). / Community API is not configured on this deployment.'
  });
  return true;
}

// 1. API index + list of public communities.
app.get(['/api/v1/communities', '/api/communities'], async (_req: Request, res: Response) => {
  const communities = serviceRoleConfigured() ? await listPublicCommunities(50) : [];

  res.json({
    success: true,
    api_version: 'v1',
    documentation: '/dev/docs',
    endpoints: {
      list_communities: 'GET /api/v1/communities',
      get_community: 'GET /api/v1/communities/:handle',
      list_posts: 'GET /api/v1/communities/:handle/posts?limit=50',
      publish_post: 'POST /api/v1/communities/:handle/posts  (X-API-Key required)',
      list_keys: 'GET /api/v1/communities/:handle/keys  (session required, founder only)',
      create_key: 'POST /api/v1/communities/:handle/keys  (session required, founder only)',
      revoke_key: 'DELETE /api/v1/communities/:handle/keys/:keyId  (session required, founder only)'
    },
    limits: {
      content_max_chars: LIMITS.content,
      code_snippet_max_chars: LIMITS.codeSnippet,
      publish_requests_per_minute: 30,
      active_keys_per_community: LIMITS.maxActiveKeysPerCommunity
    },
    payload_example: {
      content: 'Performanslı debounce hook örneği',
      code_snippet: 'export const sum = (a: number, b: number) => a + b;',
      code_language: 'typescript',
      category: 'frontend',
      author_name: 'CI Bot'
    },
    count: communities.length,
    communities: communities.map(publicCommunityShape)
  });
});

// 2. A single public community.
app.get(
  ['/api/v1/communities/:handle', '/api/communities/:handle'],
  rateLimit({ scope: 'community-read', windowMs: 60000, max: 60 }),
  async (req: Request, res: Response) => {
    if (apiKeysUnavailable(res)) return;

    const community = await findCommunityByHandle(String(req.params.handle || ''));
    if (!community) {
      res.status(404).json({ success: false, error: 'Topluluk bulunamadı. / Community not found.' });
      return;
    }
    if (community.is_private) {
      // A private community must not even confirm its own existence to an anonymous caller.
      res.status(404).json({ success: false, error: 'Topluluk bulunamadı. / Community not found.' });
      return;
    }
    res.json({ success: true, community: publicCommunityShape(community) });
  }
);

// 3. Posts of a public community.
app.get(
  ['/api/v1/communities/:handle/posts', '/api/communities/:handle/posts'],
  rateLimit({ scope: 'community-posts', windowMs: 60000, max: 60 }),
  async (req: Request, res: Response) => {
    if (apiKeysUnavailable(res)) return;

    const community = await findCommunityByHandle(String(req.params.handle || ''));
    if (!community || community.is_private) {
      res.status(404).json({ success: false, error: 'Topluluk bulunamadı. / Community not found.' });
      return;
    }

    const requested = Number(req.query.limit);
    const limit = Number.isFinite(requested) ? Math.min(Math.max(Math.trunc(requested), 1), 100) : 50;
    const posts = await listCommunityPosts(community.handle, limit);

    res.json({
      success: true,
      community: publicCommunityShape(community),
      count: posts.length,
      posts
    });
  }
);

// 4. Publish a post with an API key.
app.post(
  [
    '/api/v1/communities/:handle/posts',
    '/api/communities/:handle/posts',
    '/api/v1/community/post',
    '/api/v1/community/publish',
    '/api/community/post'
  ],
  rateLimit({ scope: 'community-publish', windowMs: 60000, max: 30 }),
  async (req: Request, res: Response) => {
    if (apiKeysUnavailable(res)) return;

    const body = isPlainObject(req.body) ? (req.body as Record<string, unknown>) : {};

    const presentedKey = extractApiKey({ headers: req.headers as Record<string, unknown>, body });
    if (!presentedKey) {
      res.status(401).json({
        success: false,
        error:
          'API anahtarı eksik. `X-API-Key` başlığını gönderin. / Missing API key: send the `X-API-Key` header.',
        documentation: '/dev/docs'
      });
      return;
    }

    const keyRow = await resolveApiKey(presentedKey);
    if (!keyRow) {
      res.status(401).json({
        success: false,
        error: 'API anahtarı geçersiz veya iptal edilmiş. / API key is invalid or revoked.'
      });
      return;
    }

    if (!keyRow.scopes?.includes('posts:write')) {
      res.status(403).json({
        success: false,
        error: 'Bu anahtar `posts:write` yetkisine sahip değil. / This key lacks the `posts:write` scope.'
      });
      return;
    }

    // The key decides the target community, never the URL. A key for @a cannot be aimed at
    // @b by changing the path.
    const community = await findCommunityById(keyRow.community_id);
    if (!community) {
      res.status(404).json({ success: false, error: 'Topluluk bulunamadı. / Community not found.' });
      return;
    }

    const routeHandle = String(req.params.handle || body.community_handle || '')
      .replace(/^@/, '')
      .toLowerCase();
    const keyHandle = community.handle.replace(/^@/, '').toLowerCase();
    if (routeHandle && routeHandle !== keyHandle) {
      res.status(403).json({
        success: false,
        error: `Bu anahtar yalnızca @${keyHandle} topluluğunda geçerli. / This key is only valid for @${keyHandle}.`
      });
      return;
    }

    const validation = validatePostPayload(body);
    if (!validation.ok || !validation.value) {
      res.status(422).json({ success: false, field: validation.field, error: validation.error });
      return;
    }

    const payload = validation.value;
    const authorUsername =
      normalizeUsername(asString(body.author_username ?? body.authorUsername)) ||
      keyRow.created_by_username ||
      'api';

    const post = await insertCommunityPost({
      id: `post_api_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
      author: {
        username: authorUsername,
        display_name: payload.authorName,
        avatar_url: '',
        // Marks the post as machine-published so the UI can label it honestly.
        via_api: true,
        api_key_name: keyRow.name
      },
      author_id: keyRow.created_by,
      content: payload.content,
      category: payload.category,
      category_name: payload.category,
      code_snippet: payload.codeSnippet,
      code_language: payload.codeLanguage,
      community_id: community.id,
      community_name: community.name,
      community_handle: community.handle
    });

    if (!post) {
      res.status(502).json({
        success: false,
        error: 'Gönderi veritabanına yazılamadı. / Could not write the post to the database.'
      });
      return;
    }

    void touchApiKey(keyRow);

    res.status(201).json({
      success: true,
      message: `Gönderi ${community.handle} topluluğuna iletildi. / Post published to ${community.handle}.`,
      post: {
        id: post.id,
        content: post.content,
        code_language: post.code_language,
        community_handle: post.community_handle,
        created_at: post.created_at,
        url: `${appOrigin()}/c/${community.handle}#post-${post.id}`
      }
    });
  }
);

// -------------------------------------------------------------
// COMMUNITY API KEY MANAGEMENT (session authenticated, founder only)
// -------------------------------------------------------------

/** Resolves the community in the path and checks the caller may manage it. */
async function requireCommunityOwner(
  req: Request,
  res: Response
): Promise<CommunityRow | null> {
  if (apiKeysUnavailable(res)) return null;

  const community = await findCommunityByHandle(String(req.params.handle || ''));
  if (!community) {
    res.status(404).json({ success: false, error: 'Topluluk bulunamadı. / Community not found.' });
    return null;
  }
  if (!canManageCommunity(community, req.auth)) {
    res.status(403).json({
      success: false,
      error:
        'Yalnızca topluluğun kurucusu API anahtarı yönetebilir. / Only the community founder can manage API keys.'
    });
    return null;
  }
  return community;
}

app.get(
  '/api/v1/communities/:handle/keys',
  requireAuth,
  rateLimit({ scope: 'community-keys-read', windowMs: 60000, max: 60, perUser: true }),
  async (req: Request, res: Response) => {
    const community = await requireCommunityOwner(req, res);
    if (!community) return;

    const keys = await listKeysForCommunity(community.id);
    res.json({
      success: true,
      community: { id: community.id, handle: community.handle, name: community.name },
      count: keys.length,
      keys: keys.map(toPublicKey)
    });
  }
);

app.post(
  '/api/v1/communities/:handle/keys',
  requireAuth,
  rateLimit({ scope: 'community-keys-create', windowMs: 60000, max: 10, perUser: true }),
  async (req: Request, res: Response) => {
    const community = await requireCommunityOwner(req, res);
    if (!community) return;

    const active = await countActiveKeys(community.id);
    if (active >= LIMITS.maxActiveKeysPerCommunity) {
      res.status(409).json({
        success: false,
        error: `Bir toplulukta en fazla ${LIMITS.maxActiveKeysPerCommunity} etkin anahtar olabilir. Önce birini iptal edin. / At most ${LIMITS.maxActiveKeysPerCommunity} active keys per community; revoke one first.`
      });
      return;
    }

    const body = isPlainObject(req.body) ? (req.body as Record<string, unknown>) : {};
    const name = sanitizeText(body.name, LIMITS.keyName) || 'default';
    const generated = generateApiKey();

    const row = await insertKey({
      id: `cak_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
      community_id: community.id,
      community_handle: community.handle,
      name,
      key_prefix: generated.prefix,
      key_hash: generated.hash,
      scopes: ['posts:write'],
      created_by: req.auth?.userId || null,
      created_by_username: req.auth?.username || null
    });

    if (!row) {
      res.status(502).json({
        success: false,
        error: 'Anahtar oluşturulamadı. / Could not create the key.'
      });
      return;
    }

    res.status(201).json({
      success: true,
      // The ONLY time the plaintext is ever transmitted.
      api_key: generated.plaintext,
      warning:
        'Bu anahtar bir daha gösterilmeyecek. Şimdi kaydedin. / This key will not be shown again. Store it now.',
      key: toPublicKey(row)
    });
  }
);

app.delete(
  '/api/v1/communities/:handle/keys/:keyId',
  requireAuth,
  rateLimit({ scope: 'community-keys-revoke', windowMs: 60000, max: 20, perUser: true }),
  async (req: Request, res: Response) => {
    const community = await requireCommunityOwner(req, res);
    if (!community) return;

    const keyId = asString(req.params.keyId);
    if (!/^cak_[A-Za-z0-9_]+$/.test(keyId)) {
      res.status(400).json({ success: false, error: 'Geçersiz anahtar kimliği. / Invalid key id.' });
      return;
    }

    const revoked = await revokeKey(keyId, community.id);
    if (!revoked) {
      res.status(404).json({ success: false, error: 'Anahtar bulunamadı. / Key not found.' });
      return;
    }

    res.json({ success: true, message: 'Anahtar iptal edildi. / Key revoked.' });
  }
);

// Webhook Test Endpoint — authenticated: it makes the server perform an outbound request.
app.post(
  '/api/integrations/webhook/test',
  requireAuth,
  rateLimit({ scope: 'webhook-test', windowMs: 60000, max: 10, perUser: true }),
  async (req: Request, res: Response) => {
    const platform = asString(req.body?.platform, 20).toLowerCase();
    const message = asString(req.body?.message, MAX_WEBHOOK_MESSAGE_LENGTH);
    const config = isPlainObject(req.body?.config) ? (req.body.config as Record<string, string>) : {};

    if (!platform || !message) {
      res.status(400).json({ success: false, error: 'Platform ve mesaj parametresi zorunludur.' });
      return;
    }

    try {
      if (platform === 'discord') {
        if (!config.webhook_url) {
          res.status(400).json({ success: false, error: 'Lütfen geçerli bir Discord Webhook URL adresi girin.' });
          return;
        }
        await sendDiscordWebhook(config.webhook_url, message, config.bot_name, config.avatar_url);
        res.json({ success: true, platform, message: 'Discord test mesajı başarıyla gönderildi!' });
        return;
      }

      if (platform === 'jubbio') {
        await sendJubbioWebhook(config, message);
        res.json({ success: true, platform, message: 'Jubbio test mesajı başarıyla iletildi!' });
        return;
      }

      if (platform === 'telegram') {
        if (!config.bot_token || !config.chat_id) {
          res.status(400).json({ success: false, error: 'Lütfen Telegram Bot Token ve Chat ID bilgilerini eksiksiz girin.' });
          return;
        }
        await sendTelegramWebhook(config.bot_token, config.chat_id, message);
        res.json({ success: true, platform, message: 'Telegram test bildirimi başarıyla gönderildi!' });
        return;
      }

      res.status(400).json({ success: false, error: 'Desteklenmeyen platform tipi.' });
    } catch (err: any) {
      res.status(502).json({ success: false, error: err?.message || 'Webhook gönderilirken beklenmeyen bir hata oluştu.' });
    }
  }
);

// Webhook Bulk Send for Job Applications
app.post(
  '/api/integrations/webhook/send',
  requireAuth,
  rateLimit({ scope: 'webhook-send', windowMs: 60000, max: 20, perUser: true }),
  async (req: Request, res: Response) => {
    const settings = isPlainObject(req.body?.settings) ? (req.body.settings as Record<string, any>) : null;
    const message = asString(req.body?.message, MAX_WEBHOOK_MESSAGE_LENGTH);

    if (!settings || !message) {
      res.status(400).json({ success: false, error: 'Eksik parametreler.' });
      return;
    }

    const results: Array<{ platform: string; success: boolean; error?: string }> = [];

    if (settings.discord?.enabled && settings.discord?.webhook_url) {
      try {
        await sendDiscordWebhook(settings.discord.webhook_url, message, settings.discord.bot_name, settings.discord.avatar_url);
        results.push({ platform: 'discord', success: true });
      } catch (e: any) {
        results.push({ platform: 'discord', success: false, error: e?.message });
      }
    }

    if (settings.jubbio?.enabled && (settings.jubbio?.webhook_url || (settings.jubbio?.bot_token && settings.jubbio?.channel_id))) {
      try {
        await sendJubbioWebhook(settings.jubbio, message);
        results.push({ platform: 'jubbio', success: true });
      } catch (e: any) {
        results.push({ platform: 'jubbio', success: false, error: e?.message });
      }
    }

    if (settings.telegram?.enabled && settings.telegram?.bot_token && settings.telegram?.chat_id) {
      try {
        await sendTelegramWebhook(settings.telegram.bot_token, settings.telegram.chat_id, message);
        results.push({ platform: 'telegram', success: true });
      } catch (e: any) {
        results.push({ platform: 'telegram', success: false, error: e?.message });
      }
    }

    res.json({ success: true, results });
  }
);

// -------------------------------------------------------------
// GITHUB OAUTH
// -------------------------------------------------------------

function appOrigin(): string {
  const configured = env('APP_URL');
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      /* fall through to the default below */
    }
  }
  return `http://localhost:${PORT}`;
}

app.get('/api/auth/github/url', rateLimit({ scope: 'oauth-url', windowMs: 60000, max: 30 }), (_req: Request, res: Response) => {
  const clientId = env('GITHUB_CLIENT_ID');
  if (!clientId) {
    res.status(503).json({ error: 'GitHub OAuth yapılandırılmamış (GITHUB_CLIENT_ID eksik).' });
    return;
  }

  const redirectUri = `${appOrigin()}/api/auth/github/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    // Least privilege: repository *write* access is never needed to list public repos.
    scope: 'read:user user:email public_repo',
    // Signed, expiring state so the callback can detect CSRF / replayed authorizations.
    state: createSignedState()
  });

  res.json({ url: `https://github.com/login/oauth/authorize?${params.toString()}`, redirect_uri: redirectUri });
});

app.get(
  ['/api/auth/github/callback', '/api/auth/github/callback/'],
  rateLimit({ scope: 'oauth-callback', windowMs: 60000, max: 30 }),
  async (req: Request, res: Response) => {
    const code = asString(req.query.code, 200);
    const state = asString(req.query.state, 200);
    const clientId = env('GITHUB_CLIENT_ID');
    const clientSecret = env('GITHUB_CLIENT_SECRET');

    const renderBridge = (payload: { ok: boolean; user?: unknown; error?: string }) => {
      const targetOrigin = appOrigin();
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(`<!DOCTYPE html>
<html lang="tr">
  <head>
    <meta charset="utf-8" />
    <title>Code4Ever GitHub OAuth</title>
    <style>
      body { background: #09090b; color: #f4f4f5; font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
      .card { background: #121215; padding: 24px; border-radius: 16px; border: 1px solid #27272a; text-align: center; max-width: 420px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h2>${payload.ok ? 'Code4Ever GitHub Eşleşmesi Başarılı!' : 'GitHub Bağlantısı Tamamlanamadı'}</h2>
      <p>${escapeHtml(payload.ok ? 'Yönlendiriliyorsunuz...' : payload.error || 'Lütfen tekrar deneyin.')}</p>
      <script>
        (function () {
          var payload = ${jsonForScript(payload)};
          if (window.opener) {
            // SECURITY: never postMessage to "*" — that hands the GitHub profile (and any
            // future token) to whatever page happens to have opened this popup.
            window.opener.postMessage(
              { type: payload.ok ? 'OAUTH_AUTH_SUCCESS' : 'OAUTH_AUTH_ERROR', user: payload.user, error: payload.error },
              ${jsonForScript(targetOrigin)}
            );
            window.close();
          } else {
            window.location.href = '/';
          }
        })();
      </script>
    </div>
  </body>
</html>`);
    };

    if (!verifySignedState(state)) {
      renderBridge({ ok: false, error: 'Güvenlik doğrulaması başarısız (geçersiz veya süresi dolmuş state).' });
      return;
    }

    if (!code || !clientId || !clientSecret) {
      renderBridge({ ok: false, error: 'GitHub OAuth yapılandırması eksik.' });
      return;
    }

    try {
      const tokenRes = await safeFetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
        allowedHosts: ['github.com'],
        timeoutMs: 10000
      });

      const tokenData = JSON.parse(tokenRes.text || '{}');
      if (!tokenData.access_token) {
        renderBridge({ ok: false, error: 'GitHub yetkilendirme kodu doğrulanamadı.' });
        return;
      }

      const userRes = await safeFetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          'User-Agent': 'Code4Ever-Platform',
          Accept: 'application/vnd.github+json'
        },
        allowedHosts: ['api.github.com'],
        timeoutMs: 10000
      });

      const githubUser = JSON.parse(userRes.text || '{}');

      // Only the fields the client actually renders leave the server. The raw GitHub
      // response carries e-mail addresses and account metadata that nothing here needs.
      renderBridge({
        ok: true,
        user: {
          login: asString(githubUser.login, 80),
          name: asString(githubUser.name, 120),
          avatar_url: asString(githubUser.avatar_url, 500),
          bio: asString(githubUser.bio, 300),
          html_url: asString(githubUser.html_url, 300)
        }
      });
    } catch (err: any) {
      console.error('GitHub token exchange error:', err?.message);
      renderBridge({ ok: false, error: 'GitHub ile iletişim kurulamadı.' });
    }
  }
);

// Proxy GitHub user public repositories
app.get('/api/github/repos', rateLimit({ scope: 'github-repos', windowMs: 60000, max: 30 }), async (req: Request, res: Response) => {
  const username = asString(req.query.username, 40) || 'octocat';
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(username)) {
    res.status(400).json({ error: 'Geçersiz GitHub kullanıcı adı.' });
    return;
  }

  try {
    // Proje oluşturma ekranı buradan besleniyor ve çok deposu olan biri kendi deposunu
    // 15 kayıtlık bir listede bulamaz. Üst sınır yine de bağlı: istemcinin istediği kadar
    // büyük bir sayfa istemesi, GitHub kotasını tek istekte tüketmenin yolu olurdu.
    const perPage = Math.min(Math.max(Number(req.query.per_page) || 15, 1), 100);
    const response = await safeFetch(
      `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=${perPage}`,
      {
        headers: { 'User-Agent': 'Code4Ever-Platform', Accept: 'application/vnd.github+json' },
        allowedHosts: ['api.github.com'],
        timeoutMs: 10000,
        maxResponseBytes: 512 * 1024
      }
    );
    if (!response.ok) {
      res.status(response.status === 404 ? 404 : 502).json({ error: 'GitHub kullanıcısı veya depoları bulunamadı.' });
      return;
    }
    res.json({ success: true, username, repos: JSON.parse(response.text || '[]') });
  } catch {
    res.status(502).json({ error: 'GitHub sunucusuna bağlanırken hata oluştu.' });
  }
});

// -------------------------------------------------------------
// EVERYCHAT (LLM PROXY)
// -------------------------------------------------------------
// Authenticated + tightly rate limited: this endpoint spends money on every call, and an
// open proxy in front of a paid LLM API is abused within hours of going live.

const MAX_CHAT_MESSAGES = 20;
const MAX_CHAT_CHARS = 6000;

app.post(
  '/api/everychat',
  requireAuth,
  rateLimit({ scope: 'everychat', windowMs: 5 * 60000, max: 25, perUser: true }),
  async (req: Request, res: Response) => {
    const groqKey = env('GROQ_API_KEY');
    if (!groqKey) {
      res.status(503).json({ error: 'Groq API Key henüz ayarlanmamış. Lütfen sunucunuza GROQ_API_KEY ekleyin.' });
      return;
    }

    const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    if (rawMessages.length === 0) {
      res.status(400).json({ error: 'Geçerli bir sohbet mesaj listesi gerekli.' });
      return;
    }

    const messages = rawMessages
      .slice(-MAX_CHAT_MESSAGES)
      .filter((entry: unknown) => isPlainObject(entry) && typeof entry.content === 'string')
      .map((entry: any) => ({
        role: ['user', 'assistant'].includes(entry.role) ? entry.role : 'user',
        content: asString(entry.content, 4000)
      }))
      .filter((entry: { content: string }) => entry.content.length > 0);

    const totalChars = messages.reduce((sum: number, entry: { content: string }) => sum + entry.content.length, 0);
    if (messages.length === 0 || totalChars > MAX_CHAT_CHARS) {
      res.status(400).json({ error: 'Sohbet içeriği çok uzun veya geçersiz.' });
      return;
    }

    try {
      const groqRes = await safeFetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
        body: JSON.stringify({
          model: env('GROQ_MODEL', 'llama-3.3-70b-versatile'),
          messages: [
            {
              role: 'system',
              content:
                'Sen Code4Ever platformunun "EveryChat (Beta)" yapay zeka asistanısın. Yazılım, mimari, kodlama ve teknoloji alanlarında son derece uzman, nazik ve hızlı yanıtlar verirsin.'
            },
            ...messages
          ],
          temperature: 0.7,
          max_tokens: 2048
        }),
        allowedHosts: ['api.groq.com'],
        timeoutMs: 45000,
        maxResponseBytes: 256 * 1024
      });

      if (!groqRes.ok) {
        // Upstream error text can contain provider internals — log it, don't echo it.
        console.warn('Groq API error:', groqRes.status, groqRes.text.slice(0, 300));
        res.status(502).json({ error: `EveryChat sağlayıcısı yanıt veremedi (${groqRes.status}).` });
        return;
      }

      const data = JSON.parse(groqRes.text || '{}');
      res.json({ success: true, reply: data.choices?.[0]?.message?.content || 'Yanıt alınamadı.', model: data.model });
    } catch (err: any) {
      console.warn('EveryChat error:', err?.message);
      res.status(502).json({ error: 'EveryChat sunucu hatası.' });
    }
  }
);

app.post('/api/rate-limit-test', rateLimit({ scope: 'rate-limit-test', windowMs: 60000, max: 60 }), (req: Request, res: Response) => {
  res.json({ status: 'allowed', timestamp: new Date().toISOString() });
});

app.post('/api/license/validate', rateLimit({ scope: 'license', windowMs: 60000, max: 20 }), (req: Request, res: Response) => {
  const licenseKey = asString(req.body?.licenseKey, 64);
  if (!licenseKey) {
    res.status(400).json({ valid: false, error: 'License key string is required' });
    return;
  }

  if (!/^C4E-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(licenseKey)) {
    res.status(400).json({ valid: false, error: 'Invalid license format' });
    return;
  }

  res.json({
    valid: true,
    tier: licenseKey.toUpperCase().includes('PRO') ? 'Pro' : 'Developer',
    rate_limit: licenseKey.toUpperCase().includes('PRO') ? 5000 : 1000,
    expires_at: '2027-12-31T23:59:59Z'
  });
});

// -------------------------------------------------------------
// BYNOGAME STREAM DONATION INTEGRATION & VERIFICATION
// -------------------------------------------------------------
// Donations grant the paid "Spark" role, so every endpoint that can CREATE or VERIFY a
// donation record is either administrator-only or protected by an HMAC signature.
// Previously any anonymous caller could POST a username and receive the Spark perks.

const BYNOGAME_STREAM_ID = env('BYNOGAME_STREAM_ID', '5595ad22-dd5a-47c2-93ba-d7bf9a3f85ed');
const BYNOGAME_DONATE_URL = env('BYNOGAME_DONATE_URL', 'https://donate.bynogame.com/nylithra');
const BYNOGAME_WEBHOOK_SECRET = env('BYNOGAME_WEBHOOK_SECRET');
const DATA_DIR = env(
  'DATA_DIR',
  // Serverless: everything outside /tmp is read-only and /tmp is wiped between invocations,
  // so the ledger degrades to a per-invocation cache rather than crashing on every write.
  isServerless() ? path.join(os.tmpdir(), 'c4e-data') : path.join(process.cwd(), 'data')
);
const BYNOGAME_DONATIONS_FILE = path.join(DATA_DIR, 'bynogame_donations.json');
const MAX_DONATION_RECORDS = 5000;

interface ByNoGameDonationRecord {
  id: string;
  streamId: string;
  username: string;
  usernameNormalized: string;
  amount?: number | string;
  currency?: string;
  message?: string;
  timestamp: string;
  verified: boolean;
  claimedAt?: string;
}

function loadByNoGameDonations(): ByNoGameDonationRecord[] {
  try {
    if (fs.existsSync(BYNOGAME_DONATIONS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(BYNOGAME_DONATIONS_FILE, 'utf-8'));
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (e) {
    console.error('ByNoGame donations load error:', e);
  }
  return [];
}

function saveByNoGameDonations(donations: ByNoGameDonationRecord[]) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const trimmed = donations.slice(0, MAX_DONATION_RECORDS);
    // Write to a temporary file first so a crash mid-write cannot truncate the ledger.
    const tempFile = `${BYNOGAME_DONATIONS_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(trimmed, null, 2), { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(tempFile, BYNOGAME_DONATIONS_FILE);
  } catch (e) {
    console.error('ByNoGame donations save error:', e);
  }
}

function publicDonationView(record: ByNoGameDonationRecord) {
  return {
    id: record.id,
    username: record.username,
    amount: record.amount,
    currency: record.currency,
    timestamp: record.timestamp,
    verified: record.verified,
    claimedAt: record.claimedAt
  };
}

/** The username a caller is allowed to act on: their own, unless they are an administrator. */
function resolveActingUsername(req: Request, requested: unknown): string | null {
  const sessionUsername = normalizeUsername(req.auth?.username);
  const requestedUsername = normalizeUsername(requested);

  if (req.auth?.isAdmin) {
    return requestedUsername || sessionUsername || null;
  }
  if (sessionUsername) {
    // Ignore whatever the body claims: a user may only act on their own account.
    return sessionUsername;
  }
  // No profile lookup available (service role key not configured) — fall back to the
  // requested username, which is still gated behind a valid session + rate limit.
  return requestedUsername || null;
}

// 1. ByNoGame Public Configuration
app.get('/api/bynogame/config', (_req: Request, res: Response) => {
  res.json({
    streamId: BYNOGAME_STREAM_ID,
    donateUrl: BYNOGAME_DONATE_URL,
    streamer: 'nylithra',
    rewardRole: 'Spark',
    rewardBadge: 'Spark Destekçi',
    storageMaxMB: 250
  });
});

// 2. Check whether the signed-in user has a verified donation
app.post(
  '/api/bynogame/check-donation',
  requireAuth,
  rateLimit({ scope: 'donation-check', windowMs: 60000, max: 15, perUser: true }),
  async (req: Request, res: Response) => {
    const username = resolveActingUsername(req, req.body?.username);
    if (!username) {
      res.status(400).json({ success: false, error: 'Kullanıcı adı belirlenemedi.' });
      return;
    }

    const donations = loadByNoGameDonations();
    const matched = donations.find(
      (d) =>
        d.streamId.toLowerCase() === BYNOGAME_STREAM_ID.toLowerCase() &&
        d.verified === true &&
        (d.usernameNormalized === username || d.username.trim().toLowerCase() === username)
    );

    if (matched) {
      if (!matched.claimedAt) {
        matched.claimedAt = new Date().toISOString();
        saveByNoGameDonations(donations);
      }

      res.json({
        success: true,
        hasDonation: true,
        donation: publicDonationView(matched),
        streamId: BYNOGAME_STREAM_ID,
        message: 'Bağışınız doğrulandı! Spark Destekçisi rozetiniz ve 250MB yükleme yetkiniz tanımlandı.'
      });
      return;
    }

    res.json({
      success: true,
      hasDonation: false,
      streamId: BYNOGAME_STREAM_ID,
      username,
      message: `Henüz @${username} adına doğrulanmış bir bağış bulunamadı. Bağış yaptıysanız referans/işlem numaranızı girerek bildirimde bulunabilirsiniz.`
    });
  }
);

// 2.1 Claim: the user *reports* a donation. It stays unverified until an admin approves it.
app.post(
  '/api/bynogame/claim-donation',
  requireAuth,
  rateLimit({ scope: 'donation-claim', windowMs: 60 * 60000, max: 5, perUser: true }),
  (req: Request, res: Response) => {
    const username = resolveActingUsername(req, req.body?.username);
    if (!username) {
      res.status(400).json({ success: false, error: 'Kullanıcı adı belirlenemedi.' });
      return;
    }

    const donations = loadByNoGameDonations();
    const referenceCode = asString(req.body?.reference_code, 120);
    const newRecord: ByNoGameDonationRecord = {
      id: `bng_claim_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      streamId: BYNOGAME_STREAM_ID,
      username,
      usernameNormalized: username,
      amount: asString(req.body?.amount, 40) || 'Destek',
      currency: 'TL',
      message: asString(req.body?.message, 400) || (referenceCode ? `Referans: ${referenceCode}` : 'Bağış Bildirimi'),
      timestamp: new Date().toISOString(),
      // NEVER verified on creation: verification is an administrator decision.
      verified: false
    };

    donations.unshift(newRecord);
    saveByNoGameDonations(donations);

    res.json({ success: true, recorded: publicDonationView(newRecord) });
  }
);

// 2.2 Admin approval
app.post('/api/bynogame/approve-donation', requireAdmin, async (req: Request, res: Response) => {
  const claimId = asString(req.body?.claimId, 80);
  const username = normalizeUsername(req.body?.username);
  const adminUsername = normalizeUsername(req.auth?.username) || 'admin';

  if (!claimId && !username) {
    res.status(400).json({ success: false, error: 'claimId veya username gereklidir.' });
    return;
  }

  const donations = loadByNoGameDonations();
  let matched = donations.find((d) => (claimId && d.id === claimId) || (username && d.usernameNormalized === username));

  if (!matched && username) {
    matched = {
      id: `bng_manual_${Date.now()}`,
      streamId: BYNOGAME_STREAM_ID,
      username,
      usernameNormalized: username,
      amount: 'Destek',
      currency: 'TL',
      message: `Yönetici (@${adminUsername}) tarafından onaylandı`,
      timestamp: new Date().toISOString(),
      verified: true,
      claimedAt: new Date().toISOString()
    };
    donations.unshift(matched);
  } else if (matched) {
    matched.verified = true;
    matched.claimedAt = new Date().toISOString();
  }

  if (!matched) {
    res.status(404).json({ success: false, error: 'Bağış kaydı bulunamadı.' });
    return;
  }

  saveByNoGameDonations(donations);

  // Approving a donation immediately grants the protected supporter tier.
  const tierApplied = await setSupporterTier(matched.usernameNormalized, 'spark');

  res.json({ success: true, approved: publicDonationView(matched), supporter_tier_applied: tierApplied });
});

// 3. External notification handler — must carry a valid HMAC signature.
app.post('/api/bynogame/webhook', rateLimit({ scope: 'donation-webhook', windowMs: 60000, max: 60 }), (req: Request, res: Response) => {
  if (!BYNOGAME_WEBHOOK_SECRET) {
    res.status(503).json({ error: 'Webhook devre dışı: BYNOGAME_WEBHOOK_SECRET tanımlı değil.' });
    return;
  }

  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  const signature = String(req.headers['x-c4e-signature'] || req.headers['x-signature'] || '').replace(/^sha256=/i, '');
  const expected = rawBody ? hmacHex(BYNOGAME_WEBHOOK_SECRET, rawBody.toString('utf8')) : '';

  if (!rawBody || !signature || !safeEquals(signature, expected)) {
    res.status(401).json({ error: 'Geçersiz webhook imzası.' });
    return;
  }

  const payload = req.body || {};
  const donor = normalizeUsername(payload.username || payload.donor || payload.user_name || payload.name);
  if (!donor) {
    res.status(400).json({ error: 'Donor username is required' });
    return;
  }

  const donations = loadByNoGameDonations();
  const newDonation: ByNoGameDonationRecord = {
    id: `bng_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    streamId: asString(payload.streamId || payload.stream_id, 80) || BYNOGAME_STREAM_ID,
    username: donor,
    usernameNormalized: donor,
    amount: asString(payload.amount ?? payload.total, 40) || '0',
    currency: asString(payload.currency, 10) || 'TL',
    message: asString(payload.message ?? payload.note, 400),
    timestamp: new Date().toISOString(),
    verified: true
  };

  donations.unshift(newDonation);
  saveByNoGameDonations(donations);

  res.json({ success: true, recorded: publicDonationView(newDonation) });
});

// 4. Manual administrator registration of a donation
app.post('/api/bynogame/register-donation', requireAdmin, (req: Request, res: Response) => {
  const username = normalizeUsername(req.body?.username);
  if (!username) {
    res.status(400).json({ error: 'Username is required' });
    return;
  }

  const donations = loadByNoGameDonations();
  const record: ByNoGameDonationRecord = {
    id: `bng_reg_${Date.now()}`,
    streamId: BYNOGAME_STREAM_ID,
    username,
    usernameNormalized: username,
    amount: asString(req.body?.amount, 40) || 'Destek',
    currency: 'TL',
    message: asString(req.body?.message, 400) || 'ByNoGame Bağışı',
    timestamp: new Date().toISOString(),
    verified: true
  };

  donations.unshift(record);
  saveByNoGameDonations(donations);

  res.json({ success: true, donation: publicDonationView(record) });
});

// 5. Donation ledger (administrators only — it is a list of paying supporters)
app.get('/api/bynogame/donations', requireAdmin, (_req: Request, res: Response) => {
  const donations = loadByNoGameDonations();
  res.json({
    streamId: BYNOGAME_STREAM_ID,
    total: donations.length,
    donations: donations.slice(0, 50).map(publicDonationView)
  });
});

/**
 * Writes the protected `supporter_tier` column with the service role key.
 * Returns false when the deployment has no service role key configured.
 */
async function setSupporterTier(username: string, tier: 'spark' | 'none'): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return false;
  try {
    const response = await safeFetch(
      `${SUPABASE_URL}/rest/v1/profiles?username=eq.${encodeURIComponent(username)}`,
      {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({ supporter_tier: tier, updated_at: new Date().toISOString() }),
        timeoutMs: 10000
      }
    );
    return response.ok;
  } catch (err: any) {
    console.warn('setSupporterTier error:', err?.message);
    return false;
  }
}

/**
 * Grants the Spark perks to the signed-in user — but only when the donation ledger holds an
 * administrator-verified donation for that account (administrators may grant directly).
 * The browser can no longer award the paid tier to itself.
 */
app.post(
  '/api/bynogame/claim-perks',
  requireAuth,
  rateLimit({ scope: 'donation-perks', windowMs: 60000, max: 10, perUser: true }),
  async (req: Request, res: Response) => {
    const username = resolveActingUsername(req, req.body?.username);
    if (!username) {
      res.status(400).json({ success: false, message: 'Kullanıcı adı belirlenemedi.' });
      return;
    }

    const verified =
      req.auth?.isAdmin === true ||
      loadByNoGameDonations().some((donation) => donation.verified === true && donation.usernameNormalized === username);

    if (!verified) {
      res.status(403).json({
        success: false,
        message: 'Doğrulanmış bir bağış kaydı bulunamadı. Bağışınız yönetici onayından sonra otomatik tanımlanır.'
      });
      return;
    }

    const applied = await setSupporterTier(username, 'spark');
    if (!applied) {
      res.status(503).json({
        success: false,
        message: 'Spark ayrıcalıkları şu anda tanımlanamadı (SUPABASE_SERVICE_ROLE_KEY eksik). Lütfen yöneticiyle iletişime geçin.'
      });
      return;
    }

    res.json({ success: true, username, supporter_tier: 'spark', message: 'Spark Destekçi ayrıcalıkları tanımlandı!' });
  }
);

// 5.1 The signed-in user's own donation records
app.get('/api/bynogame/my-donations', requireAuth, (req: Request, res: Response) => {
  const username = resolveActingUsername(req, undefined);
  const donations = username
    ? loadByNoGameDonations().filter((d) => d.usernameNormalized === username)
    : [];
  res.json({ success: true, total: donations.length, donations: donations.slice(0, 50).map(publicDonationView) });
});

// -------------------------------------------------------------
// ADMIN MAIL CONSOLE (IMAP read / SMTP send)
// -------------------------------------------------------------
//
// Every route here is behind requireAdmin. This is the most privileged surface in the app:
// it reads the operator's mailbox and can send mail as the platform, so it is deliberately
// unreachable by ordinary members even when they know the URL.
//
// Connection details are never accepted from the request — they come from environment
// variables only (see src/server/mail.ts).

/** Mailbox names are echoed into IMAP commands, so keep them to a boring character set. */
function safeMailbox(value: unknown): string {
  const raw = asString(value, 80);
  return /^[A-Za-z0-9 _./-]{1,80}$/.test(raw) ? raw : 'INBOX';
}

app.get('/api/admin/mail/status', requireAdmin, (_req: Request, res: Response) => {
  res.json({ success: true, ...describeMailConfig() });
});

/** Opens real SMTP/IMAP connections to prove the credentials work. */
app.post(
  '/api/admin/mail/verify',
  requireAdmin,
  rateLimit({ scope: 'mail-verify', windowMs: 60000, max: 6, perUser: true }),
  async (_req: Request, res: Response) => {
    const [smtp, imap] = await Promise.all([verifySmtp(), verifyImap()]);
    res.json({ success: true, smtp, imap });
  }
);

/**
 * Pulls the mailbox from IMAP once and caches it. This is the ONLY endpoint that reaches the
 * mail server on its own, which is what makes the inbox work on serverless: a single
 * connect → fetch → logout inside one request, rather than a socket held open between them.
 *
 * Capped tightly because each call is a real outbound login against the mail provider, and
 * providers throttle (or lock) accounts that reconnect in a loop.
 */
app.post(
  '/api/admin/mail/sync',
  requireAdmin,
  rateLimit({ scope: 'mail-sync', windowMs: 60000, max: 6, perUser: true }),
  async (req: Request, res: Response) => {
    if (!getImapConfig()) {
      res.status(503).json({
        success: false,
        error: imapUnavailableReason() || 'IMAP kullanılamıyor.',
        serverless: isServerless()
      });
      return;
    }

    try {
      const result = await syncInbox({
        mailbox: safeMailbox(req.body?.mailbox ?? req.query.mailbox),
        limit: Number(req.body?.limit ?? req.query.limit) || 40
      });
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(502).json({
        success: false,
        error: `IMAP hatası: ${String(error?.message || error).slice(0, 300)}`
      });
    }
  }
);

/** Forgets everything synced for a mailbox. The mail itself is untouched on the server. */
app.delete(
  '/api/admin/mail/cache',
  requireAdmin,
  rateLimit({ scope: 'mail-cache-clear', windowMs: 60000, max: 10, perUser: true }),
  async (req: Request, res: Response) => {
    const mailbox = safeMailbox(req.query.mailbox);
    await clearMailbox(mailbox);
    res.json({ success: true, mailbox });
  }
);

/**
 * Reads the inbox WITHOUT touching the mail server: the list comes from the last sync.
 *
 * On a persistent host, where holding a connection costs nothing, an empty cache falls back
 * to a live read so the inbox is never blank on a first visit.
 */
app.get(
  '/api/admin/mail/inbox',
  requireAdmin,
  rateLimit({ scope: 'mail-inbox', windowMs: 60000, max: 30, perUser: true }),
  async (req: Request, res: Response) => {
    if (!getImapConfig()) {
      res.status(503).json({
        success: false,
        error: imapUnavailableReason() || 'IMAP kullanılamıyor.',
        serverless: isServerless()
      });
      return;
    }

    const mailbox = safeMailbox(req.query.mailbox);
    const limit = Number(req.query.limit) || 25;

    try {
      const cached = await readInboxSnapshot(mailbox, limit);
      if (cached.messages.length > 0 || !supportsLiveImap()) {
        res.json({
          success: true,
          source: 'cache',
          mode: imapMode(),
          count: cached.messages.length,
          messages: cached.messages,
          lastSyncedAt: cached.state.lastSyncedAt,
          bodiesCached: cached.state.bodiesCached,
          truncated: cached.state.truncated,
          warning: storeWarning()
        });
        return;
      }

      const messages = await fetchInbox({ mailbox, limit });
      res.json({
        success: true,
        source: 'live',
        mode: imapMode(),
        count: messages.length,
        messages,
        lastSyncedAt: null,
        warning: storeWarning()
      });
    } catch (error: any) {
      res.status(502).json({ success: false, error: `IMAP hatası: ${String(error?.message || error).slice(0, 300)}` });
    }
  }
);

app.get(
  '/api/admin/mail/message/:uid',
  requireAdmin,
  rateLimit({ scope: 'mail-message', windowMs: 60000, max: 60, perUser: true }),
  async (req: Request, res: Response) => {
    if (!getImapConfig()) {
      res.status(503).json({
        success: false,
        error: imapUnavailableReason() || 'IMAP kullanılamıyor.',
        serverless: isServerless()
      });
      return;
    }

    const uid = Number(req.params.uid);
    if (!Number.isInteger(uid) || uid <= 0) {
      res.status(400).json({ success: false, error: 'Geçersiz mesaj kimliği.' });
      return;
    }

    try {
      // Served from the sync when it cached this body; otherwise one short download that is
      // cached on the way out, so opening the same message again is free.
      const { message, source } = await readMessage(uid, safeMailbox(req.query.mailbox));
      if (!message) {
        res.status(404).json({ success: false, error: 'Mesaj bulunamadı.' });
        return;
      }
      res.json({ success: true, source, message });
    } catch (error: any) {
      res.status(502).json({ success: false, error: `IMAP hatası: ${String(error?.message || error).slice(0, 300)}` });
    }
  }
);

/** Looks up the address behind a username so the UI can confirm before sending. */
app.get(
  '/api/admin/mail/resolve/:username',
  requireAdmin,
  rateLimit({ scope: 'mail-resolve', windowMs: 60000, max: 60, perUser: true }),
  async (req: Request, res: Response) => {
    const recipient = await resolveRecipientByUsername(asString(req.params.username, 40));
    if (!recipient) {
      res.status(404).json({
        success: false,
        error: 'Bu kullanıcı adına ait bir e-posta adresi bulunamadı.'
      });
      return;
    }
    res.json({ success: true, recipient });
  }
);

app.post(
  '/api/admin/mail/send',
  requireAdmin,
  rateLimit({ scope: 'mail-send', windowMs: 60000, max: 20, perUser: true }),
  async (req: Request, res: Response) => {
    if (!getSmtpConfig()) {
      res.status(503).json({
        success: false,
        error: 'SMTP yapılandırılmamış. MAIL_SMTP_HOST / MAIL_SMTP_USER / MAIL_SMTP_PASS tanımlayın.'
      });
      return;
    }

    const body = isPlainObject(req.body) ? (req.body as Record<string, unknown>) : {};

    // Addressing by username is the primary path; a raw address is allowed as a fallback
    // so the console can answer an inbound mail from a non-member.
    let toAddress = '';
    let recipientName = asString(body.recipient_name, 80);

    const username = asString(body.username, 40);
    if (username) {
      const recipient = await resolveRecipientByUsername(username);
      if (!recipient) {
        res.status(404).json({
          success: false,
          error: `"${username}" kullanıcısına ait bir e-posta adresi bulunamadı.`
        });
        return;
      }
      toAddress = recipient.email;
      recipientName = recipientName || recipient.displayName;
    } else {
      toAddress = asString(body.to, 254);
    }

    const subject = asString(body.subject, 180);
    const message = asString(body.body ?? body.message, 20000);

    if (!subject.trim()) {
      res.status(422).json({ success: false, field: 'subject', error: 'Konu zorunludur.' });
      return;
    }
    if (!message.trim()) {
      res.status(422).json({ success: false, field: 'body', error: 'Mesaj gövdesi zorunludur.' });
      return;
    }

    // A call to action is optional, but a malformed one must not silently produce a dead
    // button, so reject it rather than dropping it.
    let callToAction: { label: string; url: string } | undefined;
    const ctaLabel = asString(body.cta_label, 60);
    const ctaUrl = asString(body.cta_url, 500);
    if (ctaLabel || ctaUrl) {
      if (!ctaLabel || !ctaUrl) {
        res.status(422).json({
          success: false,
          field: 'cta',
          error: 'Buton için hem etiket hem bağlantı gereklidir.'
        });
        return;
      }
      if (!/^https?:\/\//i.test(ctaUrl)) {
        res.status(422).json({
          success: false,
          field: 'cta_url',
          error: 'Buton bağlantısı http:// veya https:// ile başlamalıdır.'
        });
        return;
      }
      callToAction = { label: ctaLabel, url: ctaUrl };
    }

    const result = await sendMail({
      to: toAddress,
      subject,
      heading: asString(body.heading, 160) || subject,
      body: message,
      recipientName: recipientName || undefined,
      callToAction,
      footnote: asString(body.footnote, 300) || undefined
    });

    if (!result.ok) {
      res.status(502).json({ success: false, error: result.error });
      return;
    }

    res.json({
      success: true,
      message: `E-posta ${toAddress} adresine gönderildi.`,
      to: toAddress,
      messageId: result.messageId
    });
  }
);

/** Renders the template without sending, so the admin can see the design first. */
app.post(
  '/api/admin/mail/preview',
  requireAdmin,
  rateLimit({ scope: 'mail-preview', windowMs: 60000, max: 60, perUser: true }),
  (req: Request, res: Response) => {
    const body = isPlainObject(req.body) ? (req.body as Record<string, unknown>) : {};
    const subject = asString(body.subject, 180) || 'Konu';
    const text = asString(body.body ?? body.message, 20000) || 'Mesaj gövdesi burada görünür.';

    const ctaLabel = asString(body.cta_label, 60);
    const ctaUrl = asString(body.cta_url, 500);

    const html = renderMailHtml({
      heading: asString(body.heading, 160) || subject,
      preheader: text.replace(/\s+/g, ' ').slice(0, 120),
      paragraphs: text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean),
      recipientName: asString(body.recipient_name, 80) || undefined,
      callToAction: ctaLabel && /^https?:\/\//i.test(ctaUrl) ? { label: ctaLabel, url: ctaUrl } : undefined,
      footnote: asString(body.footnote, 300) || undefined,
      // The preview runs in the browser, where cid: cannot resolve; point at the served file.
      logoCid: 'PREVIEW'
    }).replace('src="cid:PREVIEW"', 'src="/email-logo.png"');

    res.json({ success: true, html });
  }
);

// -------------------------------------------------------------
// BİLDİRİM E-POSTALARI
// -------------------------------------------------------------

/**
 * Bekleyen bildirimleri e-postaya çevirir.
 *
 * İKİ TÜRLÜ ÇAĞRILABİLİR ve ikisi de bilinçli:
 *   - zamanlayıcı (cron): oturum açamaz, bu yüzden paylaşılan bir sır sunar;
 *   - yönetici: panelden elle tetiklemek için.
 *
 * Başka kimse çağıramaz. Bu uç, platformun kendi alan adından posta gönderir; açık bırakmak
 * doğrudan bir kimlik avı aracı üretmek olurdu. Sır tanımlı değilse cron yolu tamamen kapalı
 * kalır — eksik yapılandırmayı "herkese açık"a çevirmek yerine erişimi daraltır.
 */
app.all(
  '/api/notifications/email/dispatch',
  rateLimit({ scope: 'notify-dispatch', windowMs: 60000, max: 12 }),
  async (req: Request, res: Response) => {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.status(405).json({ success: false, error: 'method_not_allowed' });
      return;
    }

    // Zamanlayıcılar sırrı iki farklı şekilde taşıyor: Vercel Cron `Authorization: Bearer`
    // kullanıyor, kendi kurduğumuz bir cron ise `X-Cron-Secret` gönderebilir. Bearer başlığı
    // aynı zamanda kullanıcı oturumlarının taşıyıcısı olduğu için önce sır SABİT SÜREDE
    // karşılaştırılır; tutmazsa başlık normal bir oturum jetonu gibi değerlendirilir.
    const bearer = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ''))?.[1] || '';
    const viaCron =
      cronSecretMatches(String(req.headers['x-cron-secret'] || '')) || cronSecretMatches(bearer);

    if (!viaCron) {
      // Sır yoksa/yanlışsa yönetici oturumu şart. requireAdmin'i burada elle çağırıyoruz,
      // çünkü middleware olarak eklenirse cron yolu da oturum isterdi.
      await new Promise<void>((resolve) => requireAdmin(req, res, () => resolve()));
      if (res.headersSent) return;
    }

    if (!dispatcherConfigured()) {
      res.status(503).json({
        success: false,
        error: 'not_configured',
        message:
          'Bildirim e-postaları için SUPABASE_SERVICE_ROLE_KEY ve MAIL_SMTP_* değişkenleri gerekli.'
      });
      return;
    }

    try {
      const result = await dispatchNotificationEmails({
        limit: Number(req.body?.limit) || undefined,
        dryRun: req.body?.dryRun === true
      });
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(502).json({
        success: false,
        error: `Dağıtım hatası: ${String(error?.message || error).slice(0, 300)}`
      });
    }
  }
);

/**
 * Abonelikten çıkma. Oturum GEREKTİRMEZ ve gerektirmemeli: bağlantıya tıklayan kişi çoğu
 * zaman oturum açmamıştır ve zaten bütün mesele "giriş yapmadan bu postaları durdurabilmek".
 * Güvenliği imzalı jeton sağlıyor — sahtesi üretilemez, başka bir üyeye çevrilemez.
 *
 * GET üzerinden durum değiştiriyor olması bilinçli bir ödün: e-posta istemcileri yalnızca
 * bağlantı açabilir. Riski sınırlı, çünkü yapabildiği tek şey jetonun sahibinin kendi
 * bildirim e-postalarını kapatmak.
 */
app.all(
  '/api/email/unsubscribe',
  rateLimit({ scope: 'notify-unsub', windowMs: 60000, max: 30 }),
  async (req: Request, res: Response) => {
    // GET: kullanıcı e-postadaki bağlantıya tıkladı, onay sayfası döner.
    // POST: sağlayıcının tek tık aboneliği (RFC 8058) — Gmail/Outlook kendi "Abonelikten
    // çık" düğmesinden bunu çağırır ve bir sayfa göstermez, sade bir 200 bekler.
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.status(405).json({ success: false, error: 'method_not_allowed' });
      return;
    }
    const oneClick = req.method === 'POST';
    const userId = verifyUnsubscribeToken(req.query.token);
    const page = (title: string, message: string) =>
      `<!doctype html><html lang="tr"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${escapeHtml(title)}</title><style>` +
      `body{margin:0;min-height:100vh;display:grid;place-items:center;background:#09090b;color:#fafafa;` +
      `font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:24px}` +
      `.c{max-width:28rem;text-align:center}h1{font-size:1.25rem;margin:0 0 .75rem}` +
      `p{color:#a1a1aa;line-height:1.6;font-size:.9rem;margin:0 0 1.5rem}` +
      `a{display:inline-block;padding:.7rem 1.2rem;border-radius:.75rem;background:#4f46e5;color:#fff;` +
      `text-decoration:none;font-weight:600;font-size:.85rem}</style></head>` +
      `<body><div class="c"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>` +
      `<a href="/settings">Bildirim Tercihleri</a></div></body></html>`;

    if (!userId) {
      if (oneClick) {
        res.status(400).json({ success: false, error: 'invalid_token' });
        return;
      }
      res.status(400).type('html').send(
        page('Bağlantı geçersiz', 'Bu abonelikten çıkma bağlantısı geçersiz veya eksik. Tercihlerini hesabından da kapatabilirsin.')
      );
      return;
    }

    const current = (await readEmailPrefs(userId)) || DEFAULT_EMAIL_PREFS;
    const ok = await writeEmailPrefs(userId, { ...current, enabled: false });

    if (oneClick) {
      res.status(ok ? 200 : 502).json({ success: ok });
      return;
    }

    res
      .status(ok ? 200 : 502)
      .type('html')
      .send(
        ok
          ? page('Bildirim e-postaları kapatıldı', 'Bundan sonra Code4Ever sana bildirim e-postası göndermeyecek. İstediğin zaman ayarlardan yeniden açabilirsin.')
          : page('İşlem tamamlanamadı', 'Tercihin şu anda kaydedilemedi. Lütfen biraz sonra tekrar dene veya ayarlardan kapat.')
      );
  }
);

/** Oturum sahibinin kendi bildirim e-postası tercihleri. */
app.get('/api/me/email-prefs', requireAuth, async (req: Request, res: Response) => {
  const userId = req.auth?.userId || '';
  const prefs = (await readEmailPrefs(userId)) || DEFAULT_EMAIL_PREFS;
  res.json({ success: true, prefs, defaults: DEFAULT_EMAIL_PREFS });
});

app.put(
  '/api/me/email-prefs',
  requireAuth,
  rateLimit({ scope: 'email-prefs', windowMs: 60000, max: 30, perUser: true }),
  async (req: Request, res: Response) => {
    const userId = req.auth?.userId || '';
    // Gövde temizlenerek yazılır: bilinmeyen anahtarlar düşer, tipler zorlanır. Böylece
    // istemci profile rastgele JSON yazdıramaz.
    const prefs = sanitizeEmailPrefs(req.body);
    const ok = await writeEmailPrefs(userId, prefs);
    if (!ok) {
      res.status(502).json({ success: false, error: 'save_failed', message: 'Tercihler kaydedilemedi.' });
      return;
    }
    res.json({ success: true, prefs });
  }
);

// -------------------------------------------------------------
// BAĞLI HESAPLAR (GitHub, Jubbio)
// -------------------------------------------------------------

/** Ham `Cookie` başlığından tek bir çerezi okur (cookie-parser bağımlılığı eklemeden). */
function readCookie(req: Request, name: string): string {
  const header = String(req.headers.cookie || '');
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return '';
      }
    }
  }
  return '';
}

/**
 * Akış çerezi. `httpOnly` şart: içinde PKCE doğrulayıcısı var ve tarayıcı JavaScript'ine
 * görünmesi, kodu ele geçiren bir saldırganın belirteç alabilmesi demek olur.
 * `sameSite: 'lax'` gerekiyor çünkü çerez, sağlayıcıdan gelen üst düzey yönlendirmede geri
 * gönderilmeli — 'strict' olsaydı callback çerezi hiç görmezdi.
 */
function flowCookieOptions() {
  return {
    httpOnly: true as const,
    sameSite: 'lax' as const,
    secure: IS_PRODUCTION,
    path: '/',
    maxAge: 10 * 60 * 1000
  };
}

/**
 * Yönlendirmeli bir akış yarıda kalınca gösterilen sayfa.
 *
 * Neden JSON değil HTML: buraya tarayıcı ADRES ÇUBUĞUYLA geliyor (sağlayıcının
 * yönlendirmesi), yani yanıtı okuyacak bir fetch yok. Ham JSON göstermek kullanıcıyı
 * anlamsız bir metinle baş başa bırakırdı.
 */
function linkFailurePage(res: Response, title: string, message: string, status = 400): void {
  res
    .status(status)
    .type('html')
    .send(
      `<!doctype html><html lang="tr"><head><meta charset="utf-8">` +
        `<meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<title>${escapeHtml(title)}</title><style>` +
        `body{margin:0;min-height:100vh;display:grid;place-items:center;background:#09090b;color:#fafafa;` +
        `font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:24px}` +
        `.c{max-width:28rem;text-align:center}h1{font-size:1.15rem;margin:0 0 .75rem}` +
        `p{color:#a1a1aa;line-height:1.6;font-size:.9rem;margin:0 0 1.5rem}` +
        `a{display:inline-block;padding:.7rem 1.2rem;border-radius:.75rem;background:#4f46e5;color:#fff;` +
        `text-decoration:none;font-weight:600;font-size:.85rem}</style></head>` +
        `<body><div class="c"><h1>${escapeHtml(title)}</h1>` +
        `<p>${escapeHtml(message)}</p><a href="/settings">Code4Ever'e dön</a></div></body></html>`
    );
}

/** Üyenin bağlı hesapları: hangi yollardan giriyor, nelere erişiyor. */
app.get('/api/auth/links/status', requireAuth, async (req: Request, res: Response) => {
  const profile = await findById(req.auth?.userId || '');
  res.json({
    success: true,
    github: profile?.github_username ? { linked: true, username: profile.github_username } : { linked: false },
    jubbio: profile?.jubbio_user_id
      ? { linked: true, username: profile.jubbio_username || null }
      : { linked: false },
    jubbioConfigured: Boolean(getJubbioConfig()),
    jubbioReason: jubbioUnavailableReason()
  });
});

/**
 * GitHub bağlantısını kaydeder.
 *
 * İSTEĞİN GÖVDESİ YOK, BİLİNÇLİ OLARAK. Kullanıcı adı tarayıcıdan gelmiyor; üye GitHub
 * yetkilendirmesini (giriştekiyle aynı akış) tamamladıktan sonra Supabase auth kaydına
 * düşen kimlikten, servis rolüyle okunuyor. Önceki sürüm kullanıcı adını elle alıyor ve
 * yalnızca "böyle biri var mı" diye soruyordu; o hâliyle herhangi bir üye, başkasının
 * GitHub adını kendi profiline bağlayıp onun depolarını kendi profilinde gösterebiliyordu.
 *
 * Bu uç akıştan ÖNCE de çağrılabilir: GitHub ile giriş yapmış birinin kimliği zaten auth
 * kaydında durur, dolayısıyla hiçbir yönlendirmeye gerek kalmadan bağlanır. Kimlik yoksa
 * `needs_authorization` döner ve istemci yetkilendirmeyi başlatır.
 */
app.post(
  '/api/auth/github/link',
  requireAuth,
  rateLimit({ scope: 'github-link', windowMs: 60000, max: 10, perUser: true }),
  async (req: Request, res: Response) => {
    const userId = req.auth?.userId || '';

    const identity = await readGithubIdentity(userId);
    if (!identity) {
      res.status(409).json({
        success: false,
        error: 'needs_authorization',
        message: 'Önce GitHub hesabınızla yetkilendirme yapmanız gerekiyor.'
      });
      return;
    }

    // Aynı GitHub hesabı iki C4E profiline bağlanamaz: bağlanabilseydi ikisi de aynı
    // depoları "kendi" depoları gibi gösterirdi ve hangisinin doğru olduğu anlaşılmazdı.
    const owner = await findByGithubUsername(identity.username);
    if (owner && owner.id !== userId) {
      res.status(409).json({
        success: false,
        error: 'github_already_linked',
        message: 'Bu GitHub hesabı başka bir Code4Ever hesabına bağlı.'
      });
      return;
    }

    const saved = await writeGithubLink(userId, identity.username);
    res.status(saved ? 200 : 502).json({ success: saved, username: identity.username });
  }
);

/**
 * GitHub bağlantısını kaldırır.
 *
 * ARTIK ENGEL YOK. Eskiden burada "başka kimliğin yoksa kaldıramazsın" koruması vardı ve
 * gerekçesi üyeyi hesabının dışında bırakmamaktı. Gerekçe yanlıştı: bu uç yalnızca
 * `profiles.github_username` sütununu temizliyor, Supabase auth kaydındaki GitHub kimliğine
 * — yani asıl giriş yoluna — hiç dokunmuyor. Dolayısıyla bağlantıyı kaldıran biri GitHub ile
 * girmeye devam ediyor; kaybettiği tek şey depolarının profilinde gösterilmesi. Engel,
 * olmayan bir riske karşı gerçek bir işlevi kilitliyordu.
 */
app.post(
  '/api/auth/github/unlink',
  requireAuth,
  rateLimit({ scope: 'github-unlink', windowMs: 60000, max: 10, perUser: true }),
  async (req: Request, res: Response) => {
    const userId = req.auth?.userId || '';
    const profile = await findById(userId);

    if (!profile?.github_username) {
      res.status(400).json({ success: false, error: 'not_linked', message: 'Bağlı bir GitHub hesabı yok.' });
      return;
    }

    const cleared = await clearGithubLink(userId);
    res.status(cleared ? 200 : 502).json({ success: cleared });
  }
);

// -------------------------------------------------------------
// JUBBIO BAĞLAMA (OAuth2 + PKCE)
// -------------------------------------------------------------

const JUBBIO_FLOW_COOKIE = 'c4e_jubbio_oauth';

interface JubbioFlow {
  state: string;
  verifier: string;
  userId: string;
}

/**
 * Akışı başlatır ve yetkilendirme adresini DÖNER (yönlendirmez).
 *
 * Neden JSON: bağlamanın kimin hesabına yapılacağını bilmek gerekiyor ve oturum Supabase
 * belirteci olarak `Authorization` başlığında taşınıyor. Üst düzey bir yönlendirme o başlığı
 * taşımaz; bu yüzden istemci bu ucu fetch ile çağırıp dönen adrese kendisi gidiyor.
 */
app.get(
  '/api/auth/jubbio/start',
  requireAuth,
  rateLimit({ scope: 'jubbio-start', windowMs: 60000, max: 20, perUser: true }),
  (req: Request, res: Response) => {
    const config = getJubbioConfig();
    if (!config) {
      res.status(503).json({ success: false, error: 'not_configured', message: jubbioUnavailableReason() });
      return;
    }

    const { verifier, challenge } = createPkce();
    const state = crypto.randomBytes(24).toString('base64url');
    const flow: JubbioFlow = { state, verifier, userId: req.auth?.userId || '' };

    res.cookie(JUBBIO_FLOW_COOKIE, sealFlow(flow), flowCookieOptions());
    res.json({ success: true, url: buildJubbioAuthorizeUrl(config, { state, challenge }) });
  }
);

/**
 * Jubbio'dan dönüş. Hiçbir adım atlanmıyor: state → kod takası → `@me` ile kimlik okuma.
 *
 * Kimliği ÖĞRENDİĞİMİZ tek yer Jubbio'nun kendi yanıtı. Tarayıcının adres çubuğundan gelen
 * hiçbir değer kimlik olarak kabul edilmiyor.
 */
app.get(
  '/api/auth/jubbio/callback',
  rateLimit({ scope: 'jubbio-callback', windowMs: 60000, max: 30 }),
  async (req: Request, res: Response) => {
    const fail = (message: string, status = 400) => {
      res.clearCookie(JUBBIO_FLOW_COOKIE, { path: '/' });
      linkFailurePage(res, 'Jubbio bağlantısı tamamlanamadı', message, status);
    };

    const config = getJubbioConfig();
    if (!config) return fail(jubbioUnavailableReason() || 'Jubbio bağlantısı yapılandırılmamış.', 503);
    if (!accountsConfigured()) return fail('Sunucu Supabase ile yapılandırılmamış.', 503);

    const providerError = typeof req.query.error === 'string' ? req.query.error : '';
    if (providerError) {
      const description = typeof req.query.error_description === 'string' ? req.query.error_description : '';
      return fail(
        providerError === 'access_denied'
          ? 'Jubbio hesabınıza erişim izni verilmedi. İsterseniz tekrar deneyebilirsiniz.'
          : description || providerError
      );
    }

    const flow = openFlow<JubbioFlow>(readCookie(req, JUBBIO_FLOW_COOKIE));
    if (!flow?.userId) return fail('Bağlama akışı bulunamadı veya süresi doldu. Lütfen baştan deneyin.');

    // CSRF: saldırganın başlattığı bir akışın kurbanın tarayıcısında tamamlanmasını engeller.
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (!state || !safeEquals(state, flow.state)) return fail('Güvenlik doğrulaması başarısız (state).');

    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!code) return fail('Yetkilendirme kodu alınamadı.');

    const exchanged = await exchangeJubbioCode(config, code, flow.verifier);
    if (!exchanged.ok || !exchanged.tokens) return fail(exchanged.error || 'Belirteç alınamadı.');

    const me = await fetchJubbioUser(config, exchanged.tokens.access_token);
    if (!me.ok || !me.identity) return fail(me.error || 'Jubbio kimliği okunamadı.');

    // Aynı Jubbio hesabı iki C4E profiline bağlanamaz: bağlanabilseydi ikisi de aynı hesabı
    // "doğrulanmış" gibi gösterirdi ve işaretin hiçbir anlamı kalmazdı.
    const owner = await findByJubbioId(me.identity.id);
    if (owner && owner.id !== flow.userId) {
      return fail('Bu Jubbio hesabı başka bir Code4Ever hesabına bağlı.', 409);
    }

    const saved = await writeJubbioLink(flow.userId, {
      id: me.identity.id,
      username: me.identity.username,
      avatarUrl: me.identity.avatarUrl
    });
    if (!saved) return fail('Jubbio bağlantısı kaydedilemedi.', 502);

    res.clearCookie(JUBBIO_FLOW_COOKIE, { path: '/' });
    res.redirect('/settings?jubbio=linked');
  }
);

app.post(
  '/api/auth/jubbio/unlink',
  requireAuth,
  rateLimit({ scope: 'jubbio-unlink', windowMs: 60000, max: 10, perUser: true }),
  async (req: Request, res: Response) => {
    const userId = req.auth?.userId || '';
    const profile = await findById(userId);
    if (!profile?.jubbio_user_id) {
      res.status(400).json({ success: false, error: 'not_linked', message: 'Bağlı bir Jubbio hesabı yok.' });
      return;
    }

    const cleared = await clearJubbioLink(userId);
    res.status(cleared ? 200 : 502).json({ success: cleared });
  }
);

// -------------------------------------------------------------
// PROJELER
// -------------------------------------------------------------

/**
 * Proje vitrini. Oturumsuz ziyaretçi de görebilir; oturum varsa "ben beğendim mi / takip
 * ediyor muyum" bilgisi de eklenir.
 */
app.get(
  '/api/projects',
  rateLimit({ scope: 'projects-list', windowMs: 60000, max: 60 }),
  async (req: Request, res: Response) => {
    if (!projectsConfigured()) {
      res.status(503).json({ success: false, error: 'not_configured' });
      return;
    }

    const sortParam = asString(req.query.sort, 10);
    const sort: ProjectSort = sortParam === 'top' ? 'top' : sortParam === 'mine' ? 'mine' : 'new';
    const userId = req.auth?.userId || '';

    // "Benim projelerim" oturum ister; oturumsuz istekte boş liste dönmek sessizce yanıltıcı
    // olurdu ("hiç projem yok" gibi görünürdü).
    if (sort === 'mine' && !userId) {
      res.status(401).json({ success: false, error: 'auth_required' });
      return;
    }

    const limit = Math.min(Math.max(toPositiveInt(req.query.limit, 30), 1), 50);
    const projects = await listProjects({ sort, ownerId: userId, limit });
    const ids = projects.map((p: any) => String(p.id));

    const [liked, followed] = userId
      ? await Promise.all([readRelations('like', userId, ids), readRelations('follow', userId, ids)])
      : [{}, {}];

    res.json({
      success: true,
      projects: projects.map((p: any) => ({
        ...p,
        liked_by_me: Boolean(liked[p.id]),
        followed_by_me: Boolean(followed[p.id])
      }))
    });
  }
);

/** Liderlik tabloları: haftanın projesi ve tüm zamanların en çok beğenileni. */
app.get(
  '/api/projects/highlights',
  rateLimit({ scope: 'projects-highlights', windowMs: 60000, max: 60 }),
  async (_req: Request, res: Response) => {
    if (!projectsConfigured()) {
      res.status(503).json({ success: false, error: 'not_configured' });
      return;
    }

    const [week, allTime] = await Promise.all([projectOfTheWeek(), allTimeTop()]);
    res.json({
      success: true,
      week: week ? { ...week.project, weekly_likes: week.weeklyLikes } : null,
      all_time: allTime
    });
  }
);

/**
 * Yeni proje.
 *
 * GITHUB GEREKMİYOR. Proje paylaşmak için GitHub bağlamak zorunda olmak yanlıştı: her proje
 * GitHub'da değil (kapalı kaynak, başka platform, henüz yayımlanmamış) ve GitHub kullanmayan
 * birinin hiçbir şey paylaşamaması anlamına geliyordu.
 *
 * Depo EKLENİRSE sahipliği doğrulanır — işte o zaman GitHub bağlantısı gerekir. Yani
 * doğrulama, iddianın kendisiyle orantılı: "şu depo benim" demiyorsan kanıt da istenmiyor.
 */
const projectBody = express.json({ limit: PROJECT_BODY_LIMIT });

app.post(
  '/api/projects',
  requireAuth,
  projectBody,
  // Sınır REDDEDİLEN denemeleri de sayıyor (doğru davranış: hammering'i o durdurur). Ama
  // 10 fazla düşüktü: depo adını birkaç kez yanlış yazan biri kendini bir dakika dışarıda
  // bırakıyordu. 30, insan kullanımı için rahat, kötüye kullanım için hâlâ dar.
  rateLimit({ scope: 'projects-create', windowMs: 60000, max: 30, perUser: true }),
  async (req: Request, res: Response) => {
    if (!projectsConfigured()) {
      res.status(503).json({ success: false, error: 'not_configured' });
      return;
    }

    const userId = req.auth?.userId || '';
    const profile = await findById(userId);
    if (!profile) {
      res.status(404).json({ success: false, error: 'profile_not_found' });
      return;
    }

    // Depo isteğe bağlı: gönderilmediyse proje deposuz açılır.
    const wantsRepo = req.body?.repo !== undefined && String(req.body.repo || '').trim() !== '';
    let repo: RepoFacts | null = null;

    if (wantsRepo) {
      const check = await verifyOwnRepo(profile.github_username, req.body.repo);
      if (!check.ok || !check.repo) {
        res.status(check.status).json({ success: false, error: check.error, message: check.message });
        return;
      }
      repo = check.repo;
    }

    // Deposuz projede ad ZORUNLU: depodan türetilecek bir ad yok ve adsız proje listede
    // hiçbir şey ifade etmez.
    const name = cleanText(req.body?.name, 80) || (repo ? repo.fullName.split('/')[1] : '');
    if (!name) {
      res.status(400).json({ success: false, error: 'name_required', message: 'Proje adı gerekli.' });
      return;
    }

    const about = cleanText(req.body?.about, 600) || repo?.description || '';

    const created = await insertProject({
      id: newProjectId(),
      slug: await allocateSlug(name),
      owner_id: userId,
      owner_username: profile.username,
      name,
      about,
      description: cleanText(req.body?.description, 4000),
      cover_url: cleanImage(req.body?.cover_url),
      gallery: cleanGallery(req.body?.gallery),
      repo_full_name: repo ? repo.fullName : null,
      repo_url: repo ? repo.htmlUrl : null,
      repo_default_branch: repo ? repo.defaultBranch : null,
      language: repo ? repo.language : null
    });

    if (!created) {
      res.status(502).json({ success: false, error: 'create_failed' });
      return;
    }

    res.status(201).json({ success: true, project: { ...created, liked_by_me: false, followed_by_me: false } });
  }
);

/**
 * Commit tarayıcısı: takipçisi olan projelerde yeni commit arar ve bildirim bırakır.
 *
 * Yetki mantığı bildirim e-postası dağıtımıyla aynı: zamanlayıcı sırrı ya da yönetici
 * oturumu. Herkese açık olsaydı, GitHub'a giden istekleri istediği sıklıkta tetikleyen biri
 * hem kotayı tüketir hem de takipçilere bildirim akışı yarattırırdı.
 */
app.all(
  '/api/projects/watch',
  rateLimit({ scope: 'projects-watch', windowMs: 60000, max: 12 }),
  async (req: Request, res: Response) => {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.status(405).json({ success: false, error: 'method_not_allowed' });
      return;
    }

    const bearer = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ''))?.[1] || '';
    const viaCron =
      cronSecretMatches(String(req.headers['x-cron-secret'] || '')) || cronSecretMatches(bearer);

    if (!viaCron) {
      await new Promise<void>((resolve) => requireAdmin(req, res, () => resolve()));
      if (res.headersSent) return;
    }

    if (!projectsConfigured()) {
      res.status(503).json({ success: false, error: 'not_configured' });
      return;
    }

    const result = await runCommitWatch({
      budgetMs: toPositiveInt(req.body?.budgetMs, 20000),
      maxProjects: toPositiveInt(req.body?.maxProjects, 25)
    });
    res.json({ success: true, ...result });
  }
);

/**
 * Proje sayfası — /project/<slug> adresinin veri kaynağı.
 *
 * OTURUM ARANMIYOR. Sayfanın amacı paylaşılabilir olması: bağlantıyı alan biri, hesabı
 * olmasa bile projeyi görebilmeli. `requireAuth` eklenseydi paylaşılan her bağlantı giriş
 * ekranına düşerdi ve özellik anlamını yitirirdi.
 *
 * `:id` rotasından ÖNCE tanımlı: sonra gelseydi "slug" bir proje kimliği sanılır ve her
 * adres 404 dönerdi.
 */
app.get(
  '/api/projects/slug/:slug',
  rateLimit({ scope: 'projects-slug', windowMs: 60000, max: 90 }),
  async (req: Request, res: Response) => {
    if (!projectsConfigured()) {
      res.status(503).json({ success: false, error: 'not_configured' });
      return;
    }

    const project = await findProjectBySlug(asString(req.params.slug, 90));
    if (!project) {
      res.status(404).json({ success: false, error: 'not_found' });
      return;
    }

    const userId = req.auth?.userId || '';
    const [liked, followed] = userId
      ? await Promise.all([
          readRelations('like', userId, [project.id]),
          readRelations('follow', userId, [project.id])
        ])
      : [{}, {}];

    res.json({
      success: true,
      project: {
        ...project,
        liked_by_me: Boolean(liked[project.id]),
        followed_by_me: Boolean(followed[project.id])
      }
    });
  }
);

/** Tek proje (kimliğe göre). */
app.get(
  '/api/projects/:id',
  rateLimit({ scope: 'projects-detail', windowMs: 60000, max: 60 }),
  async (req: Request, res: Response) => {
    if (!projectsConfigured()) {
      res.status(503).json({ success: false, error: 'not_configured' });
      return;
    }

    const project = await findProjectDetail(asString(req.params.id, 60));
    if (!project) {
      res.status(404).json({ success: false, error: 'not_found' });
      return;
    }

    const userId = req.auth?.userId || '';
    const [liked, followed] = userId
      ? await Promise.all([
          readRelations('like', userId, [project.id]),
          readRelations('follow', userId, [project.id])
        ])
      : [{}, {}];

    res.json({
      success: true,
      project: {
        ...project,
        liked_by_me: Boolean(liked[project.id]),
        followed_by_me: Boolean(followed[project.id])
      }
    });
  }
);

/**
 * Ad, tanıtım yazısı ve — henüz bağlı değilse — GitHub deposu (yalnızca sahibi).
 *
 * Depo SONRADAN eklenebilir: proje deposuz açılabildiği için, sonradan GitHub'a taşınan
 * bir projenin deposunu bağlayamamak keyfi bir kısıt olurdu. Bağlandıktan sonra
 * DEĞİŞTİRİLEMEZ (şemadaki tetikleyici de ayrıca engelliyor): değiştirilebilseydi,
 * beğenileri toplanmış bir projenin deposu bambaşka bir şeyle takas edilip o beğeniler
 * devralınabilirdi.
 */
app.patch(
  '/api/projects/:id',
  requireAuth,
  projectBody,
  rateLimit({ scope: 'projects-update', windowMs: 60000, max: 20, perUser: true }),
  async (req: Request, res: Response) => {
    const project = await findProjectById(asString(req.params.id, 60));
    if (!project) {
      res.status(404).json({ success: false, error: 'not_found' });
      return;
    }
    if (project.owner_id !== req.auth?.userId && !req.auth?.isAdmin) {
      res.status(403).json({ success: false, error: 'forbidden' });
      return;
    }

    // Sahiplik ve sayaçlar burada hiç geçmiyor; şemadaki tetikleyici de onları ayrıca
    // koruyor (iki katman bilinçli).
    const patch: Record<string, unknown> = {};
    if (req.body?.name !== undefined) {
      const name = cleanText(req.body.name, 80);
      if (!name) {
        res.status(400).json({ success: false, error: 'invalid_name' });
        return;
      }
      patch.name = name;
    }
    if (req.body?.about !== undefined) patch.about = cleanText(req.body.about, 600);
    if (req.body?.description !== undefined) patch.description = cleanText(req.body.description, 4000);

    // Görseller. `null` gönderilmesi "kaldır" demek; sessizce yok saymak, kapağı silmek
    // isteyen üyenin bunu hiç yapamaması anlamına gelirdi.
    if (req.body?.cover_url !== undefined) patch.cover_url = cleanImage(req.body.cover_url);
    if (req.body?.gallery !== undefined) patch.gallery = cleanGallery(req.body.gallery);

    if (req.body?.repo !== undefined && String(req.body.repo || '').trim() !== '') {
      // Zaten bağlıysa reddediyoruz. Sessizce yok saymak, üyenin "değiştirdim" sanıp
      // eskisiyle devam ettiğini fark etmemesine yol açardı.
      if (project.repo_full_name) {
        res.status(409).json({
          success: false,
          error: 'repo_already_set',
          message: 'Bu projenin deposu zaten bağlı ve değiştirilemez.'
        });
        return;
      }

      const profile = await findById(req.auth?.userId || '');
      const check = await verifyOwnRepo(profile?.github_username, req.body.repo);
      if (!check.ok || !check.repo) {
        res.status(check.status).json({ success: false, error: check.error, message: check.message });
        return;
      }

      patch.repo_full_name = check.repo.fullName;
      patch.repo_url = check.repo.htmlUrl;
      patch.repo_default_branch = check.repo.defaultBranch;
      patch.language = check.repo.language;
    }

    if (Object.keys(patch).length === 0) {
      res.status(400).json({ success: false, error: 'nothing_to_update' });
      return;
    }

    const saved = await updateProject(project.id, patch);
    res.status(saved ? 200 : 502).json({ success: saved });
  }
);

app.delete(
  '/api/projects/:id',
  requireAuth,
  rateLimit({ scope: 'projects-delete', windowMs: 60000, max: 20, perUser: true }),
  async (req: Request, res: Response) => {
    const project = await findProjectById(asString(req.params.id, 60));
    if (!project) {
      res.status(404).json({ success: false, error: 'not_found' });
      return;
    }
    if (project.owner_id !== req.auth?.userId && !req.auth?.isAdmin) {
      res.status(403).json({ success: false, error: 'forbidden' });
      return;
    }

    const removed = await softDeleteProject(project.id);
    res.status(removed ? 200 : 502).json({ success: removed });
  }
);

/**
 * Beğeni ve takip.
 *
 * Tek bir gövde alanıyla açık durum gönderiliyor (`on: true/false`), aç/kapa değil. Aç/kapa
 * olsaydı iki sekmeden aynı anda basmak veya bir isteğin yeniden denenmesi durumu ters
 * çevirirdi: kullanıcı beğendiğini sanırken beğenisi geri alınmış olurdu.
 *
 * Beğeni bir vitrin, takip ise bir ABONELİK: yalnızca takip edenler commit bildirimi alır.
 */
for (const relation of ['like', 'follow'] as const) {
  app.post(
    `/api/projects/:id/${relation}`,
    requireAuth,
    rateLimit({ scope: `projects-${relation}`, windowMs: 60000, max: 60, perUser: true }),
    async (req: Request, res: Response) => {
      if (!projectsConfigured()) {
        res.status(503).json({ success: false, error: 'not_configured' });
        return;
      }

      const project = await findProjectById(asString(req.params.id, 60));
      if (!project) {
        res.status(404).json({ success: false, error: 'not_found' });
        return;
      }

      const on = req.body?.on !== false;
      const done = await setRelation(relation, project.id, req.auth?.userId || '', on);
      if (!done) {
        res.status(502).json({ success: false, error: 'update_failed' });
        return;
      }

      // Sayaç tetikleyiciyle güncellendiği için taze satırı geri okuyoruz: istemcinin
      // kendi kendine +1 yapması, iki sekme arasında tutarsız sayı gösterirdi.
      const fresh = await findProjectById(project.id);
      res.json({
        success: true,
        on,
        likes_count: Number(fresh?.likes_count ?? project.likes_count),
        followers_count: Number(fresh?.followers_count ?? project.followers_count)
      });
    }
  );
}

// -------------------------------------------------------------
// TOPLULUK PROJELERİ
// -------------------------------------------------------------



/**
 * Topluluğu ya kimliğinden ya adresinden çözer.
 *
 * İstemci bazı ekranlarda kimliği, bazılarında `@adres`i biliyor. İkisini de kabul
 * etmek, çağrı yerinde "önce kimliği bul" turu attırmaktan iyi.
 */
async function resolveCommunity(raw: string) {
  const value = asString(raw, 80);
  if (!value) return null;
  return value.startsWith('@')
    ? findCommunityByHandle(value)
    : (await findCommunityById(value)) || findCommunityByHandle(value);
}

/** Bir topluluğa paylaşılmış projeler. Gizli toplulukta yalnızca üyeler görür. */
app.get(
  '/api/communities/:id/projects',
  attachOptionalAuth,
  rateLimit({ scope: 'community-projects-list', windowMs: 60000, max: 60 }),
  async (req: Request, res: Response) => {
    if (!communityProjectsConfigured() || !projectsConfigured()) {
      res.status(503).json({ success: false, error: 'not_configured' });
      return;
    }

    const community = await resolveCommunity(req.params.id);
    if (!community) {
      res.status(404).json({ success: false, error: 'community_not_found' });
      return;
    }

    if (!(await canSeeCommunity(community, req.auth?.userId, req.auth?.isAdmin))) {
      // 404, 403 değil: gizli bir topluluğun VARLIĞINI bile doğrulamıyoruz.
      res.status(404).json({ success: false, error: 'community_not_found' });
      return;
    }

    const limit = toPositiveInt(req.query.limit, 40);
    const links = await listCommunityProjectLinks(community.id, Math.min(limit, 100));

    // Bağlar yalnızca kimlik taşıyor; proje kartı için satırların kendisi gerekiyor.
    // Silinmiş projeler listeden düşüyor: bağ kalmış olabilir ama proje gösterilmemeli.
    const projects: any[] = [];
    for (const link of links) {
      const project = await findProjectById(link.project_id);
      if (!project || project.is_deleted) continue;
      projects.push({
        ...project,
        added_by: link.added_by,
        added_by_username: link.added_by_username,
        added_at: link.created_at
      });
    }

    res.json({
      success: true,
      community: { id: community.id, name: community.name, handle: community.handle },
      projects,
      count: projects.length
    });
  }
);

/** Bir projenin paylaşıldığı toplulukların kimlikleri — seçicinin mevcut durumu. */
app.get(
  '/api/projects/:id/communities',
  requireAuth,
  rateLimit({ scope: 'project-communities', windowMs: 60000, max: 60, perUser: true }),
  async (req: Request, res: Response) => {
    if (!communityProjectsConfigured()) {
      res.status(503).json({ success: false, error: 'not_configured' });
      return;
    }

    const project = await findProjectById(asString(req.params.id, 60));
    if (!project) {
      res.status(404).json({ success: false, error: 'not_found' });
      return;
    }

    res.json({ success: true, community_ids: await listProjectCommunityIds(project.id) });
  }
);

/**
 * Projeyi topluluğa ekle.
 *
 * İki kontrol de SUNUCUDA: istemci "ben sahibim" ya da "ben üyeyim" diyemez. Bu uç
 * servis anahtarıyla yazdığı için RLS devreye girmiyor — kural burada yazılmazsa
 * hiçbir yerde yazılmamış olur.
 */
app.post(
  '/api/communities/:id/projects',
  requireAuth,
  rateLimit({ scope: 'community-projects-add', windowMs: 60000, max: 30, perUser: true }),
  async (req: Request, res: Response) => {
    if (!communityProjectsConfigured() || !projectsConfigured()) {
      res.status(503).json({ success: false, error: 'not_configured' });
      return;
    }

    const community = await resolveCommunity(req.params.id);
    if (!community) {
      res.status(404).json({ success: false, error: 'community_not_found' });
      return;
    }

    const project = await findProjectById(asString(req.body?.project_id, 60));
    if (!project || project.is_deleted) {
      res.status(404).json({ success: false, error: 'project_not_found' });
      return;
    }

    const userId = req.auth?.userId || '';

    if (String(project.owner_id) !== userId) {
      res.status(403).json({
        success: false,
        error: 'not_project_owner',
        message: 'Bir projeyi topluluğa yalnızca sahibi ekleyebilir.'
      });
      return;
    }

    if (!(await isMemberOf(userId, community.id))) {
      res.status(403).json({
        success: false,
        error: 'not_a_member',
        message: 'Projeni yalnızca üyesi olduğun bir topluluğa ekleyebilirsin.'
      });
      return;
    }

    const added = await addProjectToCommunity(
      community.id,
      project.id,
      userId,
      req.auth?.username
    );
    if (!added) {
      res.status(502).json({ success: false, error: 'write_failed' });
      return;
    }

    // Sayaç tetikleyiciyle güncelleniyor; taze satırı geri okuyoruz ki istemci kendi
    // kendine +1 yapmak zorunda kalmasın (iki sekme arasında tutarsız sayı demekti).
    const fresh = await findCommunityById(community.id);
    res.json({
      success: true,
      on: true,
      projects_count: Number(fresh?.projects_count ?? community.projects_count ?? 0)
    });
  }
);

/**
 * Projeyi topluluktan kaldır.
 *
 * Projenin sahibi kendi girdisini geri alabilir; topluluğun kurucusu ise
 * topluluğundaki HERHANGİ bir girdiyi kaldırabilir — moderasyon bunsuz olmaz.
 */
app.delete(
  '/api/communities/:id/projects/:projectId',
  requireAuth,
  rateLimit({ scope: 'community-projects-remove', windowMs: 60000, max: 30, perUser: true }),
  async (req: Request, res: Response) => {
    if (!communityProjectsConfigured() || !projectsConfigured()) {
      res.status(503).json({ success: false, error: 'not_configured' });
      return;
    }

    const community = await resolveCommunity(req.params.id);
    if (!community) {
      res.status(404).json({ success: false, error: 'community_not_found' });
      return;
    }

    const projectId = asString(req.params.projectId, 60);
    if (!(await linkExists(community.id, projectId))) {
      res.status(404).json({ success: false, error: 'not_linked' });
      return;
    }

    const userId = req.auth?.userId || '';
    const project = await findProjectById(projectId);
    const isOwnerOfProject = Boolean(project && String(project.owner_id) === userId);
    const isOwnerOfCommunity = isCommunityOwner(community, userId, req.auth?.username);

    if (!isOwnerOfProject && !isOwnerOfCommunity && !req.auth?.isAdmin) {
      res.status(403).json({
        success: false,
        error: 'not_allowed',
        message: 'Bu girdiyi yalnızca projenin sahibi ya da topluluğun kurucusu kaldırabilir.'
      });
      return;
    }

    if (!(await removeProjectFromCommunity(community.id, projectId))) {
      res.status(502).json({ success: false, error: 'write_failed' });
      return;
    }

    const fresh = await findCommunityById(community.id);
    res.json({
      success: true,
      on: false,
      projects_count: Number(fresh?.projects_count ?? 0)
    });
  }
);

// -------------------------------------------------------------
// ERROR HANDLING & STATIC HOSTING
// -------------------------------------------------------------

app.use('/api', (_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'not_found' });
});

app.use('/api', (err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ success: false, error: 'payload_too_large' });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ success: false, error: 'invalid_json' });
    return;
  }
  console.error('Unhandled API error:', err?.message || err);
  // Never leak stack traces or internal messages to the client.
  res.status(500).json({ success: false, error: 'internal_error' });
});

/**
 * The configured Express application, without any listener attached.
 *
 * `api/index.ts` hands this straight to Vercel as a serverless handler, so everything above
 * this line must stay free of side effects that assume a long-running process.
 */
export default app;
export { app };

async function startServer() {
  if (!IS_PRODUCTION) {
    // Imported lazily AND through a variable specifier: vite is a dev dependency, and a
    // literal `import('vite')` would make bundlers (Vercel's included) try to trace and
    // bundle it into a function that never executes this branch.
    const viteSpecifier = 'vite';
    const { createServer: createViteServer } = await import(/* @vite-ignore */ viteSpecifier);
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(
      express.static(distPath, {
        index: false,
        maxAge: '1h',
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('sw.js') || filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        }
      })
    );
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  /*
   * SON SAVUNMA HATTI.
   *
   * Rotaların ve ara katmanların tamamı yukarıdaki `installAsyncGuard` ile zaten
   * korunuyor; bir istekte fırlayan hata `/api` hata ara katmanına gidiyor ve
   * yalnızca o isteği etkiliyor.
   *
   * Bu kanca İSTEK YOLUNUN DIŞINDAKİ reddedilen sözler için: zamanlayıcılar,
   * `app.listen` geri çağrısı, bir isteğe bağlı olmadan başlatılan arka plan
   * işleri. Oralarda `next` yok, dolayısıyla korumanın tutamayacağı tek yer orası.
   * Süreci canlı tutmak, tek bir başarısız arka plan işini herkesin kesintisine
   * çevirmekten kesinlikle daha iyi.
   */
  process.on('unhandledRejection', (reason: unknown) => {
    console.error('[c4e] yakalanmamış söz reddi:', reason);
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Code4Ever server running on http://0.0.0.0:${PORT}`);
    if (!supabaseConfigured()) {
      console.warn('[c4e] SUPABASE_URL / SUPABASE_ANON_KEY missing: authenticated endpoints will return 503.');
    }
    if (!BYNOGAME_WEBHOOK_SECRET) {
      console.warn('[c4e] BYNOGAME_WEBHOOK_SECRET missing: the donation webhook is disabled.');
    }
  });
}

// On Vercel the platform owns the request lifecycle and imports `app` through
// api/index.ts; binding a port there would be meaningless and would keep the function alive.
if (!isServerless()) {
  startServer();
}
