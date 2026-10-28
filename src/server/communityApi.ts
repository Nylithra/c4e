/**
 * Community HTTP publishing API — storage and authentication layer.
 *
 * A community owner mints an API key; an external script (CI job, bot, scraper, IDE plugin)
 * then posts code snippets into that community over plain HTTP. Design rules:
 *
 *  - Only the SHA-256 hash of a key ever reaches the database. The plaintext exists for the
 *    duration of one HTTP response and is never recoverable afterwards, so neither a leaked
 *    backup nor an operator with database access can replay a key.
 *  - Key lookup is by hash, which is a constant-width index probe: no prefix scan, no
 *    timing signal that leaks which prefixes exist.
 *  - Every write goes through the service role key, which lives only on the server. Browsers
 *    hold no grant on `community_api_keys` at all (see supabase_schema.sql).
 */

import crypto from 'node:crypto';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, safeFetch } from './security';

export const API_KEY_PREFIX = 'lnx_live_';

/** Scopes a key may carry. `posts:write` is the only one the publish endpoint requires. */
export const VALID_SCOPES = ['posts:write'] as const;
export type CommunityApiScope = (typeof VALID_SCOPES)[number];

export interface CommunityApiKeyRow {
  id: string;
  community_id: string;
  community_handle: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  scopes: string[];
  created_by: string | null;
  created_by_username: string | null;
  created_at: string;
  last_used_at: string | null;
  request_count: number;
  revoked_at: string | null;
}

/** The shape handed back to the owner — never includes `key_hash`. */
export interface PublicCommunityApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  created_at: string;
  created_by_username: string | null;
  last_used_at: string | null;
  request_count: number;
  revoked_at: string | null;
}

export function toPublicKey(row: CommunityApiKeyRow): PublicCommunityApiKey {
  return {
    id: row.id,
    name: row.name,
    key_prefix: row.key_prefix,
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    created_at: row.created_at,
    created_by_username: row.created_by_username,
    last_used_at: row.last_used_at,
    request_count: Number(row.request_count || 0),
    revoked_at: row.revoked_at
  };
}

export function serviceRoleConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function adminHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

export function hashApiKey(plaintext: string): string {
  return crypto.createHash('sha256').update(plaintext, 'utf8').digest('hex');
}

/**
 * Generates a new key. 32 random bytes in base64url gives ~256 bits of entropy, far beyond
 * anything brute-forceable through a rate-limited HTTP endpoint.
 */
export function generateApiKey(): { plaintext: string; hash: string; prefix: string } {
  const secret = crypto.randomBytes(32).toString('base64url');
  const plaintext = `${API_KEY_PREFIX}${secret}`;
  return {
    plaintext,
    hash: hashApiKey(plaintext),
    // Enough to recognise a key in a list, far too little to reconstruct it.
    prefix: plaintext.slice(0, 16)
  };
}

/** Strips the key out of anything we might log or echo back. */
export function redactKey(value: string): string {
  if (!value) return '';
  return `${value.slice(0, 16)}${'.'.repeat(8)}`;
}

// -------------------------------------------------------------
// SUPABASE ACCESS
// -------------------------------------------------------------

async function restRequest(
  pathAndQuery: string,
  init: { method?: string; body?: string; headers?: Record<string, string> } = {}
): Promise<{ ok: boolean; status: number; rows: any[] }> {
  const response = await safeFetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method: init.method || 'GET',
    headers: adminHeaders(init.headers),
    body: init.body,
    timeoutMs: 10000,
    maxResponseBytes: 1024 * 1024
  });

  let rows: any[] = [];
  if (response.text) {
    try {
      const parsed = JSON.parse(response.text);
      rows = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      rows = [];
    }
  }
  return { ok: response.ok, status: response.status, rows };
}

export interface CommunityRow {
  id: string;
  name: string;
  handle: string;
  description: string | null;
  is_private: boolean | null;
  created_by: string | null;
  creator_username: string | null;
  members_count: number | null;
  /** Topluluğa paylaşılmış proje sayısı — tetikleyici yazar, istemci yazamaz. */
  projects_count?: number | null;
}

/** Resolves a community by its handle, with or without the leading `@`. */
export async function findCommunityByHandle(handle: string): Promise<CommunityRow | null> {
  const clean = handle.replace(/^@/, '').toLowerCase();
  if (!clean) return null;

  const { ok, rows } = await restRequest(
    `communities?handle=in.(${encodeURIComponent(`"@${clean}","${clean}"`)})` +
      `&select=id,name,handle,description,is_private,created_by,creator_username,members_count,projects_count&limit=1`
  );
  if (!ok || rows.length === 0) return null;
  return rows[0] as CommunityRow;
}

export async function findCommunityById(id: string): Promise<CommunityRow | null> {
  if (!id) return null;
  const { ok, rows } = await restRequest(
    `communities?id=eq.${encodeURIComponent(id)}` +
      `&select=id,name,handle,description,is_private,created_by,creator_username,members_count,projects_count&limit=1`
  );
  if (!ok || rows.length === 0) return null;
  return rows[0] as CommunityRow;
}

/**
 * Whether a signed-in caller may manage this community's keys: the founder (by id or by
 * username) or a platform administrator. Deliberately the same rule the database trigger
 * `restrict_community_updates` enforces for settings.
 */
export function canManageCommunity(
  community: CommunityRow,
  auth: { userId?: string; username?: string; isAdmin?: boolean } | undefined
): boolean {
  if (!auth?.userId) return false;
  if (auth.isAdmin) return true;
  if (community.created_by && community.created_by === auth.userId) return true;
  const me = (auth.username || '').toLowerCase().replace(/^@/, '');
  const owner = (community.creator_username || '').toLowerCase().replace(/^@/, '');
  return Boolean(me && owner && me === owner);
}

export async function listKeysForCommunity(communityId: string): Promise<CommunityApiKeyRow[]> {
  const { ok, rows } = await restRequest(
    `community_api_keys?community_id=eq.${encodeURIComponent(communityId)}&order=created_at.desc&limit=50`
  );
  return ok ? (rows as CommunityApiKeyRow[]) : [];
}

export async function countActiveKeys(communityId: string): Promise<number> {
  const keys = await listKeysForCommunity(communityId);
  return keys.filter((k) => !k.revoked_at).length;
}

export async function insertKey(row: {
  id: string;
  community_id: string;
  community_handle: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  scopes: string[];
  created_by: string | null;
  created_by_username: string | null;
}): Promise<CommunityApiKeyRow | null> {
  const { ok, rows } = await restRequest('community_api_keys', {
    method: 'POST',
    body: JSON.stringify(row),
    headers: { Prefer: 'return=representation' }
  });
  return ok && rows.length > 0 ? (rows[0] as CommunityApiKeyRow) : null;
}

export async function revokeKey(keyId: string, communityId: string): Promise<boolean> {
  const { ok, rows } = await restRequest(
    `community_api_keys?id=eq.${encodeURIComponent(keyId)}&community_id=eq.${encodeURIComponent(communityId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ revoked_at: new Date().toISOString() }),
      headers: { Prefer: 'return=representation' }
    }
  );
  return ok && rows.length > 0;
}

/**
 * Looks a key up by hash and returns it only when it is live. Revoked keys resolve to null
 * so a leaked-then-revoked key behaves exactly like one that never existed.
 */
export async function resolveApiKey(plaintext: string): Promise<CommunityApiKeyRow | null> {
  if (!plaintext || !plaintext.startsWith(API_KEY_PREFIX)) return null;
  const hash = hashApiKey(plaintext);
  const { ok, rows } = await restRequest(
    `community_api_keys?key_hash=eq.${encodeURIComponent(hash)}&limit=1`
  );
  if (!ok || rows.length === 0) return null;
  const row = rows[0] as CommunityApiKeyRow;
  if (row.revoked_at) return null;
  return row;
}

/** Best-effort usage bookkeeping; a failure here must never fail the caller's request. */
export async function touchApiKey(row: CommunityApiKeyRow): Promise<void> {
  try {
    await restRequest(`community_api_keys?id=eq.${encodeURIComponent(row.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        last_used_at: new Date().toISOString(),
        request_count: Number(row.request_count || 0) + 1
      }),
      headers: { Prefer: 'return=minimal' }
    });
  } catch {
    /* ignore */
  }
}

export interface InsertPostInput {
  id: string;
  author: Record<string, unknown>;
  author_id: string | null;
  content: string;
  category: string;
  category_name: string;
  code_snippet: string | null;
  code_language: string | null;
  community_id: string;
  community_name: string;
  community_handle: string;
}

export async function insertCommunityPost(post: InsertPostInput): Promise<any | null> {
  const { ok, rows } = await restRequest('posts', {
    method: 'POST',
    body: JSON.stringify({
      ...post,
      likes_count: 0,
      liked_by: [],
      comments_count: 0,
      comments: [],
      reposts_count: 0,
      reposted_by: [],
      bookmarked_by: [],
      is_pinned: false,
      is_deleted: false,
      created_at: new Date().toISOString()
    }),
    headers: { Prefer: 'return=representation' }
  });
  return ok && rows.length > 0 ? rows[0] : null;
}

export async function listCommunityPosts(
  communityHandle: string,
  limit: number
): Promise<any[]> {
  const { ok, rows } = await restRequest(
    `posts?community_handle=eq.${encodeURIComponent(communityHandle)}` +
      `&is_deleted=eq.false&order=created_at.desc&limit=${limit}` +
      `&select=id,content,code_snippet,code_language,category,category_name,author,community_id,community_name,community_handle,likes_count,comments_count,reposts_count,created_at`
  );
  return ok ? rows : [];
}

export async function listPublicCommunities(limit: number): Promise<CommunityRow[]> {
  const { ok, rows } = await restRequest(
    `communities?is_private=eq.false&order=members_count.desc&limit=${limit}` +
      `&select=id,name,handle,description,is_private,created_by,creator_username,members_count,projects_count`
  );
  return ok ? (rows as CommunityRow[]) : [];
}

// -------------------------------------------------------------
// PAYLOAD VALIDATION
// -------------------------------------------------------------

export const LIMITS = {
  content: 2000,
  codeSnippet: 10000,
  codeLanguage: 32,
  authorName: 60,
  category: 40,
  keyName: 60,
  maxActiveKeysPerCommunity: 10
} as const;

/**
 * Languages the snippet renderer knows. An unknown value is coerced to `plaintext` rather
 * than rejected, so a caller is never blocked by our list being out of date.
 */
const KNOWN_LANGUAGES = new Set([
  'typescript', 'javascript', 'python', 'rust', 'go', 'sql', 'html', 'css',
  'csharp', 'cpp', 'c', 'java', 'kotlin', 'swift', 'php', 'ruby', 'bash',
  'shell', 'yaml', 'json', 'dockerfile', 'plaintext'
]);

/**
 * Strips characters that have no business in a post body. Control characters (other than
 * tab and newline) and the bidirectional overrides used for "Trojan Source" attacks are
 * removed, so a snippet cannot render as something other than what it contains.
 */
export function sanitizeText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[\u202A-\u202E\u2066-\u2069\u200E\u200F]/g, '')
    .slice(0, maxLength)
    .trim();
}

export function normalizeLanguage(value: unknown): string {
  const raw = sanitizeText(value, LIMITS.codeLanguage).toLowerCase();
  if (!raw) return 'plaintext';
  const alias: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rs: 'rust', golang: 'go', 'c++': 'cpp', 'c#': 'csharp',
    sh: 'bash', postgres: 'sql', postgresql: 'sql', yml: 'yaml'
  };
  const mapped = alias[raw] || raw;
  return KNOWN_LANGUAGES.has(mapped) ? mapped : 'plaintext';
}

export interface ValidatedPostPayload {
  content: string;
  codeSnippet: string | null;
  codeLanguage: string | null;
  category: string;
  authorName: string;
}

/**
 * Flat rather than a discriminated union: this project compiles without `strictNullChecks`,
 * where `ok: true | false` does not narrow the union at the call site.
 */
export interface PostPayloadResult {
  ok: boolean;
  value?: ValidatedPostPayload;
  error?: string;
  field?: string;
}

export function validatePostPayload(body: Record<string, unknown>): PostPayloadResult {
  const content = sanitizeText(body.content, LIMITS.content);
  const codeSnippet = sanitizeText(body.code_snippet ?? body.codeSnippet, LIMITS.codeSnippet);

  if (!content && !codeSnippet) {
    return {
      ok: false,
      field: 'content',
      error: '`content` veya `code_snippet` alanlarından en az biri dolu olmalıdır. / Provide at least one of `content` or `code_snippet`.'
    };
  }

  if (typeof body.content === 'string' && body.content.length > LIMITS.content) {
    return {
      ok: false,
      field: 'content',
      error: `\`content\` en fazla ${LIMITS.content} karakter olabilir. / \`content\` may be at most ${LIMITS.content} characters.`
    };
  }

  const rawSnippet = body.code_snippet ?? body.codeSnippet;
  if (typeof rawSnippet === 'string' && rawSnippet.length > LIMITS.codeSnippet) {
    return {
      ok: false,
      field: 'code_snippet',
      error: `\`code_snippet\` en fazla ${LIMITS.codeSnippet} karakter olabilir. / \`code_snippet\` may be at most ${LIMITS.codeSnippet} characters.`
    };
  }

  const category = sanitizeText(body.category, LIMITS.category).toLowerCase() || 'general';
  const authorName = sanitizeText(body.author_name ?? body.authorName, LIMITS.authorName) || 'API';

  return {
    ok: true,
    value: {
      content: content || `\`${normalizeLanguage(body.code_language ?? body.codeLanguage)}\` kod parçacığı`,
      codeSnippet: codeSnippet || null,
      codeLanguage: codeSnippet ? normalizeLanguage(body.code_language ?? body.codeLanguage) : null,
      category,
      authorName
    }
  };
}

/** Reads the API key from the header first, then the JSON body, then a bearer token. */
export function extractApiKey(req: {
  headers: Record<string, unknown>;
  body?: Record<string, unknown>;
}): string {
  const header = req.headers['x-api-key'];
  if (typeof header === 'string' && header.trim()) return header.trim();

  const authorization = req.headers.authorization;
  if (typeof authorization === 'string') {
    const match = /^Bearer\s+(lnx_live_[A-Za-z0-9_-]+)$/i.exec(authorization.trim());
    if (match) return match[1];
  }

  const fromBody = req.body?.api_key;
  if (typeof fromBody === 'string' && fromBody.trim()) return fromBody.trim();

  return '';
}
