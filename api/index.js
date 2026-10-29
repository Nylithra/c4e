/* OLUSTURULMUS DOSYA - ELLE DUZENLEMEYIN. Kaynak: src/server/vercelEntry.ts. Yeniden uretmek icin: npm run build:fn */
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/server/security.ts
function env(name, fallback = "") {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
function isServerless() {
  return Boolean(
    process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT || process.env.FUNCTION_TARGET
  );
}
function safeEquals(a, b) {
  const bufA = Buffer.from(String(a ?? ""), "utf8");
  const bufB = Buffer.from(String(b ?? ""), "utf8");
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return import_node_crypto.default.timingSafeEqual(bufA, bufB);
}
function hmacHex(secret2, payload) {
  return import_node_crypto.default.createHmac("sha256", secret2).update(payload).digest("hex");
}
function createSignedState(ttlMs = 10 * 60 * 1e3) {
  const nonce = import_node_crypto.default.randomBytes(16).toString("hex");
  const expiresAt = Date.now() + ttlMs;
  const payload = `${nonce}.${expiresAt}`;
  return `${payload}.${hmacHex(OAUTH_STATE_SECRET, payload)}`;
}
function verifySignedState(state) {
  if (!state || typeof state !== "string") return false;
  const parts = state.split(".");
  if (parts.length !== 3) return false;
  const [nonce, expiresAt, signature] = parts;
  if (!/^[a-f0-9]{32}$/.test(nonce)) return false;
  const expiry = Number(expiresAt);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return false;
  return safeEquals(signature, hmacHex(OAUTH_STATE_SECRET, `${nonce}.${expiresAt}`));
}
function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function jsonForScript(value) {
  return JSON.stringify(value ?? null).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
function isPrivateAddress(address) {
  const version = import_node_net.default.isIP(address);
  if (version === 4) {
    const parts = address.split(".").map(Number);
    return PRIVATE_IPV4_PATTERNS.some((test) => test(parts));
  }
  if (version === 6) {
    const lower = address.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    if (lower.startsWith("fe80") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
    const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }
  return true;
}
function hostMatches(hostname, allowed) {
  const host = hostname.toLowerCase();
  const pattern = allowed.toLowerCase().trim();
  if (!pattern) return false;
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(1);
    return host.endsWith(suffix) && host.length > suffix.length;
  }
  return host === pattern;
}
async function assertSafeOutboundUrl(rawUrl, options = {}) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || "").trim());
  } catch {
    throw new Error("Ge\xE7ersiz URL bi\xE7imi.");
  }
  const allowedProtocols = options.allowInsecure ? ["https:", "http:"] : ["https:"];
  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new Error("Yaln\u0131zca https:// adresleri desteklenir.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("URL i\xE7inde kimlik bilgisi ta\u015F\u0131namaz.");
  }
  if (options.allowedHosts && options.allowedHosts.length > 0) {
    const permitted = options.allowedHosts.some((allowed) => hostMatches(parsed.hostname, allowed));
    if (!permitted) {
      throw new Error(`\u0130zin verilmeyen hedef alan ad\u0131: ${parsed.hostname}`);
    }
  }
  if (import_node_net.default.isIP(parsed.hostname)) {
    if (isPrivateAddress(parsed.hostname)) {
      throw new Error("\xD6zel/i\xE7 a\u011F adreslerine istek g\xF6nderilemez.");
    }
    return parsed;
  }
  let records;
  try {
    records = await import_promises.default.lookup(parsed.hostname, { all: true });
  } catch {
    throw new Error(`Alan ad\u0131 \xE7\xF6z\xFCmlenemedi: ${parsed.hostname}`);
  }
  if (records.length === 0 || records.some((record) => isPrivateAddress(record.address))) {
    throw new Error("\xD6zel/i\xE7 a\u011F adreslerine istek g\xF6nderilemez.");
  }
  return parsed;
}
async function safeFetch(rawUrl, options = {}) {
  const url = await assertSafeOutboundUrl(rawUrl, options);
  const timeoutMs = options.timeoutMs ?? 1e4;
  const maxResponseBytes = options.maxResponseBytes ?? 64 * 1024;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: options.headers,
      body: options.body,
      signal: controller.signal,
      // Never follow redirects automatically: a 302 to http://169.254.169.254 would
      // otherwise bypass every check performed above.
      redirect: "manual"
    });
    const raw = await response.text().catch(() => "");
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      text: raw.slice(0, maxResponseBytes)
    };
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error(`Hedef sunucu ${Math.round(timeoutMs / 1e3)} saniye i\xE7inde yan\u0131t vermedi.`);
    }
    throw new Error(err?.message || "Ba\u011Flant\u0131 hatas\u0131.");
  } finally {
    clearTimeout(timeout);
  }
}
function pruneRateLimitBuckets(now, windowMs) {
  for (const [key, bucket] of rateLimitBuckets) {
    if (now - bucket.lastSeen > windowMs * 4) {
      rateLimitBuckets.delete(key);
    }
  }
  if (rateLimitBuckets.size > MAX_TRACKED_KEYS) {
    const excess = rateLimitBuckets.size - MAX_TRACKED_KEYS;
    let removed = 0;
    for (const key of rateLimitBuckets.keys()) {
      rateLimitBuckets.delete(key);
      if (++removed >= excess) break;
    }
  }
}
function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || "unknown";
}
function rateLimit(options = {}) {
  const windowMs = options.windowMs ?? 6e4;
  const max = options.max ?? 60;
  const scope = options.scope ?? "global";
  return (req, res, next) => {
    const now = Date.now();
    if (now - lastPrune > windowMs) {
      pruneRateLimitBuckets(now, windowMs);
      lastPrune = now;
    }
    const identity = options.perUser && req.auth?.userId ? `u:${req.auth.userId}` : `ip:${clientIp(req)}`;
    const key = `${scope}|${identity}`;
    const bucket = rateLimitBuckets.get(key) || { hits: [], lastSeen: now };
    bucket.hits = bucket.hits.filter((timestamp) => now - timestamp < windowMs);
    bucket.lastSeen = now;
    if (bucket.hits.length >= max) {
      rateLimitBuckets.set(key, bucket);
      const retryAfter = Math.ceil((windowMs - (now - bucket.hits[0])) / 1e3);
      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", "0");
      res.setHeader("Retry-After", String(Math.max(1, retryAfter)));
      res.status(429).json({
        success: false,
        error: "Too Many Requests",
        message: `Rate limit exceeded. Please wait ${Math.max(1, retryAfter)} seconds.`
      });
      return;
    }
    bucket.hits.push(now);
    rateLimitBuckets.set(key, bucket);
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - bucket.hits.length)));
    next();
  };
}
function bearerToken(req) {
  const header = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(String(header).trim());
  return match ? match[1].trim() : "";
}
function supabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
function supabaseAdminHeaders() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json"
  };
}
async function fetchSupabaseProfile(userId) {
  const headers = supabaseAdminHeaders();
  if (!headers) return null;
  try {
    const response = await safeFetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=username,is_admin`,
      { headers, timeoutMs: 8e3 }
    );
    if (!response.ok) return null;
    const rows2 = JSON.parse(response.text || "[]");
    return Array.isArray(rows2) && rows2.length > 0 ? rows2[0] : null;
  } catch {
    return null;
  }
}
async function verifySupabaseToken(token) {
  if (!supabaseConfigured() || !token) return null;
  const cacheKey = import_node_crypto.default.createHash("sha256").update(token).digest("hex");
  const cached = sessionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.context;
  }
  try {
    const response = await safeFetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`
      },
      timeoutMs: 8e3
    });
    if (!response.ok) return null;
    const user = JSON.parse(response.text || "{}");
    if (!user?.id) return null;
    const profile = await fetchSupabaseProfile(user.id);
    const context = {
      userId: String(user.id),
      email: user.email ? String(user.email) : void 0,
      username: profile?.username ? String(profile.username) : void 0,
      isAdmin: profile?.is_admin === true
    };
    if (sessionCache.size > 5e3) sessionCache.clear();
    sessionCache.set(cacheKey, { context, expiresAt: Date.now() + SESSION_CACHE_TTL_MS });
    return context;
  } catch {
    return null;
  }
}
async function attachOptionalAuth(req, _res, next) {
  const token = bearerToken(req);
  if (token) {
    const context = await verifySupabaseToken(token);
    if (context) req.auth = context;
  }
  next();
}
async function requireAuth(req, res, next) {
  if (!supabaseConfigured()) {
    res.status(503).json({
      success: false,
      error: "auth_unavailable",
      message: "Kimlik do\u011Frulama servisi yap\u0131land\u0131r\u0131lmam\u0131\u015F (SUPABASE_URL / SUPABASE_ANON_KEY)."
    });
    return;
  }
  const token = bearerToken(req);
  const context = token ? await verifySupabaseToken(token) : null;
  if (!context) {
    res.status(401).json({
      success: false,
      error: "unauthorized",
      message: "Bu i\u015Flem i\xE7in ge\xE7erli bir oturum gereklidir."
    });
    return;
  }
  req.auth = context;
  next();
}
async function requireAdmin(req, res, next) {
  const adminToken = env("ADMIN_API_TOKEN");
  const presented = String(req.headers["x-admin-token"] || "");
  if (adminToken && presented && safeEquals(presented, adminToken)) {
    req.auth = { userId: "service-account", isAdmin: true };
    next();
    return;
  }
  const token = bearerToken(req);
  const context = token ? await verifySupabaseToken(token) : null;
  if (!context || !context.isAdmin) {
    res.status(403).json({
      success: false,
      error: "forbidden",
      message: "Bu i\u015Flem yaln\u0131zca y\xF6neticiler taraf\u0131ndan ger\xE7ekle\u015Ftirilebilir."
    });
    return;
  }
  req.auth = context;
  next();
}
function asString(value, maxLength = 500) {
  if (typeof value !== "string") return "";
  return value.replace(/\0/g, "").trim().slice(0, maxLength);
}
function normalizeUsername(value) {
  return asString(value, 40).replace(/^@/, "").toLowerCase().replace(/[^a-z0-9_.-]/g, "");
}
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
var import_node_crypto, import_promises, import_node_net, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, OAUTH_STATE_SECRET, PRIVATE_IPV4_PATTERNS, rateLimitBuckets, MAX_TRACKED_KEYS, lastPrune, sessionCache, SESSION_CACHE_TTL_MS;
var init_security = __esm({
  "src/server/security.ts"() {
    import_node_crypto = __toESM(require("node:crypto"), 1);
    import_promises = __toESM(require("node:dns/promises"), 1);
    import_node_net = __toESM(require("node:net"), 1);
    SUPABASE_URL = env("SUPABASE_URL", env("VITE_SUPABASE_URL")).replace(/\/+$/, "");
    SUPABASE_ANON_KEY = env("SUPABASE_ANON_KEY", env("VITE_SUPABASE_ANON_KEY"));
    SUPABASE_SERVICE_ROLE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
    OAUTH_STATE_SECRET = env("OAUTH_STATE_SECRET") || import_node_crypto.default.randomBytes(32).toString("hex");
    PRIVATE_IPV4_PATTERNS = [
      (p) => p[0] === 0,
      (p) => p[0] === 10,
      (p) => p[0] === 127,
      (p) => p[0] === 169 && p[1] === 254,
      // link-local + cloud metadata (169.254.169.254)
      (p) => p[0] === 172 && p[1] >= 16 && p[1] <= 31,
      (p) => p[0] === 192 && p[1] === 168,
      (p) => p[0] === 192 && p[1] === 0 && p[2] === 0,
      (p) => p[0] === 100 && p[1] >= 64 && p[1] <= 127,
      // CGNAT
      (p) => p[0] >= 224
      // multicast + reserved
    ];
    rateLimitBuckets = /* @__PURE__ */ new Map();
    MAX_TRACKED_KEYS = 2e4;
    lastPrune = Date.now();
    sessionCache = /* @__PURE__ */ new Map();
    SESSION_CACHE_TTL_MS = 3e4;
  }
});

// src/server/mailStore.ts
var mailStore_exports = {};
__export(mailStore_exports, {
  clearMailbox: () => clearMailbox,
  readCachedMessage: () => readCachedMessage,
  readInboxSnapshot: () => readInboxSnapshot,
  readSyncState: () => readSyncState,
  saveInboxSnapshot: () => saveInboxSnapshot,
  saveMessageBody: () => saveMessageBody,
  storeIsDurable: () => storeIsDurable,
  storeWarning: () => storeWarning
});
function storeIsDurable() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}
function storeWarning() {
  if (storeIsDurable()) return null;
  return "E\u015Fitlenen mesajlar yaln\u0131zca bellekte tutuluyor (SUPABASE_SERVICE_ROLE_KEY tan\u0131ml\u0131 de\u011Fil). Sunucu yeniden ba\u015Flarsa yeniden e\u015Fitlemeniz gerekir.";
}
function adminHeaders2(extra = {}) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...extra
  };
}
async function rest(pathAndQuery, init = {}) {
  const response = await safeFetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method: init.method || "GET",
    headers: adminHeaders2(init.headers),
    body: init.body,
    timeoutMs: 15e3,
    // Bodies are capped per message, but a whole page of them still adds up.
    maxResponseBytes: 8 * 1024 * 1024
  });
  let rows2 = [];
  if (response.text) {
    try {
      const parsed = JSON.parse(response.text);
      rows2 = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      rows2 = [];
    }
  }
  return { ok: response.ok, status: response.status, rows: rows2 };
}
function memoryBox(mailbox) {
  let box = memoryMessages.get(mailbox);
  if (!box) {
    box = /* @__PURE__ */ new Map();
    memoryMessages.set(mailbox, box);
  }
  return box;
}
function clip(value, max) {
  return String(value || "").slice(0, max);
}
function rowFromHeader(mailbox, message, syncedAt) {
  return {
    mailbox,
    uid: message.uid,
    subject: clip(message.subject, 250),
    from_name: clip(message.fromName, 120),
    from_address: clip(message.fromAddress, 254),
    to_address: clip(message.to, 254),
    sent_at: message.date,
    seen: Boolean(message.seen),
    flagged: Boolean(message.flagged),
    has_attachments: Boolean(message.hasAttachments),
    preview: clip(message.preview, 400),
    synced_at: syncedAt
  };
}
function bodyFields(detail) {
  return {
    body_text: clip(detail.text, MAX_TEXT_BYTES),
    body_html: clip(detail.html, MAX_HTML_BYTES),
    images_blocked: Boolean(detail.imagesBlocked),
    attachments: detail.attachments || [],
    body_synced_at: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function headerFromRow(row) {
  return {
    uid: Number(row.uid),
    seq: 0,
    subject: String(row.subject || "(konu yok)"),
    fromName: String(row.from_name || ""),
    fromAddress: String(row.from_address || ""),
    to: String(row.to_address || ""),
    date: row.sent_at ? new Date(row.sent_at).toISOString() : null,
    seen: Boolean(row.seen),
    flagged: Boolean(row.flagged),
    hasAttachments: Boolean(row.has_attachments),
    preview: String(row.preview || "")
  };
}
function detailFromRow(row) {
  if (!row.body_synced_at) return null;
  return {
    ...headerFromRow(row),
    text: String(row.body_text || ""),
    html: String(row.body_html || ""),
    imagesBlocked: Boolean(row.images_blocked),
    attachments: Array.isArray(row.attachments) ? row.attachments : []
  };
}
async function saveInboxSnapshot(mailbox, messages, details, meta) {
  const syncedAt = (/* @__PURE__ */ new Date()).toISOString();
  const keptUids = messages.map((m) => m.uid);
  const state = {
    mailbox,
    lastSyncedAt: syncedAt,
    messageCount: messages.length,
    bodiesCached: details.size,
    truncated: meta.truncated
  };
  if (!storeIsDurable()) {
    const box = memoryBox(mailbox);
    const keep = new Set(keptUids);
    for (const uid of [...box.keys()]) if (!keep.has(uid)) box.delete(uid);
    for (const message of messages) {
      const existing = box.get(message.uid);
      box.set(message.uid, {
        header: message,
        // A sync that ran out of time leaves older bodies alone rather than dropping them.
        detail: details.get(message.uid) || existing?.detail || null
      });
    }
    memoryState.set(mailbox, state);
    return state;
  }
  const rows2 = messages.map((message) => {
    const row = rowFromHeader(mailbox, message, syncedAt);
    const detail = details.get(message.uid);
    return detail ? { ...row, ...bodyFields(detail) } : row;
  });
  if (rows2.length > 0) {
    await rest(`${CACHE_TABLE}?on_conflict=mailbox,uid`, {
      method: "POST",
      body: JSON.stringify(rows2),
      // merge-duplicates keeps a body cached by an earlier sync when this row carries none.
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" }
    });
  }
  const gone = keptUids.length > 0 ? `uid=not.in.(${keptUids.join(",")})` : (
    // An empty mailbox clears every row rather than matching nothing.
    "uid=gt.0"
  );
  await rest(`${CACHE_TABLE}?mailbox=eq.${encodeURIComponent(mailbox)}&${gone}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  });
  await rest(`${STATE_TABLE}?on_conflict=mailbox`, {
    method: "POST",
    body: JSON.stringify([
      {
        mailbox,
        last_synced_at: syncedAt,
        message_count: state.messageCount,
        bodies_cached: state.bodiesCached,
        truncated: state.truncated
      }
    ]),
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" }
  });
  return state;
}
async function saveMessageBody(mailbox, detail) {
  if (!storeIsDurable()) {
    const box = memoryBox(mailbox);
    const existing = box.get(detail.uid);
    box.set(detail.uid, { header: existing?.header || detail, detail });
    return;
  }
  await rest(`${CACHE_TABLE}?mailbox=eq.${encodeURIComponent(mailbox)}&uid=eq.${detail.uid}`, {
    method: "PATCH",
    body: JSON.stringify(bodyFields(detail)),
    headers: { Prefer: "return=minimal" }
  });
}
function emptyState(mailbox) {
  return { mailbox, lastSyncedAt: null, messageCount: 0, bodiesCached: 0, truncated: false };
}
async function readInboxSnapshot(mailbox, limit = 50) {
  const capped = Math.min(Math.max(limit, 1), 200);
  if (!storeIsDurable()) {
    const box = memoryBox(mailbox);
    const messages = [...box.values()].map((e) => e.header).sort((a, b) => b.uid - a.uid).slice(0, capped);
    return { messages, state: memoryState.get(mailbox) || emptyState(mailbox) };
  }
  const columns = "uid,subject,from_name,from_address,to_address,sent_at,seen,flagged,has_attachments,preview";
  const [cache, state] = await Promise.all([
    rest(
      `${CACHE_TABLE}?mailbox=eq.${encodeURIComponent(mailbox)}&select=${columns}&order=uid.desc&limit=${capped}`
    ),
    rest(`${STATE_TABLE}?mailbox=eq.${encodeURIComponent(mailbox)}&select=*&limit=1`)
  ]);
  const row = state.rows[0];
  return {
    messages: cache.ok ? cache.rows.map(headerFromRow) : [],
    state: row ? {
      mailbox,
      lastSyncedAt: row.last_synced_at || null,
      messageCount: Number(row.message_count || 0),
      bodiesCached: Number(row.bodies_cached || 0),
      truncated: Boolean(row.truncated)
    } : emptyState(mailbox)
  };
}
async function readCachedMessage(mailbox, uid) {
  if (!storeIsDurable()) {
    return memoryBox(mailbox).get(uid)?.detail || null;
  }
  const { ok, rows: rows2 } = await rest(
    `${CACHE_TABLE}?mailbox=eq.${encodeURIComponent(mailbox)}&uid=eq.${uid}&select=*&limit=1`
  );
  if (!ok || rows2.length === 0) return null;
  return detailFromRow(rows2[0]);
}
async function readSyncState(mailbox) {
  if (!storeIsDurable()) return memoryState.get(mailbox) || emptyState(mailbox);
  const { ok, rows: rows2 } = await rest(
    `${STATE_TABLE}?mailbox=eq.${encodeURIComponent(mailbox)}&select=*&limit=1`
  );
  if (!ok || rows2.length === 0) return emptyState(mailbox);
  const row = rows2[0];
  return {
    mailbox,
    lastSyncedAt: row.last_synced_at || null,
    messageCount: Number(row.message_count || 0),
    bodiesCached: Number(row.bodies_cached || 0),
    truncated: Boolean(row.truncated)
  };
}
async function clearMailbox(mailbox) {
  if (!storeIsDurable()) {
    memoryMessages.delete(mailbox);
    memoryState.delete(mailbox);
    return;
  }
  await Promise.all([
    rest(`${CACHE_TABLE}?mailbox=eq.${encodeURIComponent(mailbox)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" }
    }),
    rest(`${STATE_TABLE}?mailbox=eq.${encodeURIComponent(mailbox)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" }
    })
  ]);
}
var CACHE_TABLE, STATE_TABLE, MAX_TEXT_BYTES, MAX_HTML_BYTES, memoryMessages, memoryState;
var init_mailStore = __esm({
  "src/server/mailStore.ts"() {
    init_security();
    CACHE_TABLE = "admin_mail_cache";
    STATE_TABLE = "admin_mail_sync_state";
    MAX_TEXT_BYTES = 2e5;
    MAX_HTML_BYTES = 4e5;
    memoryMessages = /* @__PURE__ */ new Map();
    memoryState = /* @__PURE__ */ new Map();
  }
});

// src/server/vercelEntry.ts
var vercelEntry_exports = {};
__export(vercelEntry_exports, {
  default: () => handler
});
module.exports = __toCommonJS(vercelEntry_exports);

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_node_os = __toESM(require("node:os"), 1);
var import_node_crypto6 = __toESM(require("node:crypto"), 1);
init_security();

// src/server/communityApi.ts
var import_node_crypto2 = __toESM(require("node:crypto"), 1);
init_security();
var API_KEY_PREFIX = "lnx_live_";
function toPublicKey(row) {
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
function serviceRoleConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}
function adminHeaders(extra = {}) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...extra
  };
}
function hashApiKey(plaintext) {
  return import_node_crypto2.default.createHash("sha256").update(plaintext, "utf8").digest("hex");
}
function generateApiKey() {
  const secret2 = import_node_crypto2.default.randomBytes(32).toString("base64url");
  const plaintext = `${API_KEY_PREFIX}${secret2}`;
  return {
    plaintext,
    hash: hashApiKey(plaintext),
    // Enough to recognise a key in a list, far too little to reconstruct it.
    prefix: plaintext.slice(0, 16)
  };
}
async function restRequest(pathAndQuery, init = {}) {
  const response = await safeFetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method: init.method || "GET",
    headers: adminHeaders(init.headers),
    body: init.body,
    timeoutMs: 1e4,
    maxResponseBytes: 1024 * 1024
  });
  let rows2 = [];
  if (response.text) {
    try {
      const parsed = JSON.parse(response.text);
      rows2 = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      rows2 = [];
    }
  }
  return { ok: response.ok, status: response.status, rows: rows2 };
}
async function findCommunityByHandle(handle) {
  const clean = handle.replace(/^@/, "").toLowerCase();
  if (!clean) return null;
  const { ok, rows: rows2 } = await restRequest(
    `communities?handle=in.(${encodeURIComponent(`"@${clean}","${clean}"`)})&select=id,name,handle,description,is_private,created_by,creator_username,members_count,projects_count&limit=1`
  );
  if (!ok || rows2.length === 0) return null;
  return rows2[0];
}
async function findCommunityById(id) {
  if (!id) return null;
  const { ok, rows: rows2 } = await restRequest(
    `communities?id=eq.${encodeURIComponent(id)}&select=id,name,handle,description,is_private,created_by,creator_username,members_count,projects_count&limit=1`
  );
  if (!ok || rows2.length === 0) return null;
  return rows2[0];
}
function canManageCommunity(community, auth) {
  if (!auth?.userId) return false;
  if (auth.isAdmin) return true;
  if (community.created_by && community.created_by === auth.userId) return true;
  const me = (auth.username || "").toLowerCase().replace(/^@/, "");
  const owner = (community.creator_username || "").toLowerCase().replace(/^@/, "");
  return Boolean(me && owner && me === owner);
}
async function listKeysForCommunity(communityId) {
  const { ok, rows: rows2 } = await restRequest(
    `community_api_keys?community_id=eq.${encodeURIComponent(communityId)}&order=created_at.desc&limit=50`
  );
  return ok ? rows2 : [];
}
async function countActiveKeys(communityId) {
  const keys = await listKeysForCommunity(communityId);
  return keys.filter((k) => !k.revoked_at).length;
}
async function insertKey(row) {
  const { ok, rows: rows2 } = await restRequest("community_api_keys", {
    method: "POST",
    body: JSON.stringify(row),
    headers: { Prefer: "return=representation" }
  });
  return ok && rows2.length > 0 ? rows2[0] : null;
}
async function revokeKey(keyId, communityId) {
  const { ok, rows: rows2 } = await restRequest(
    `community_api_keys?id=eq.${encodeURIComponent(keyId)}&community_id=eq.${encodeURIComponent(communityId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ revoked_at: (/* @__PURE__ */ new Date()).toISOString() }),
      headers: { Prefer: "return=representation" }
    }
  );
  return ok && rows2.length > 0;
}
async function resolveApiKey(plaintext) {
  if (!plaintext || !plaintext.startsWith(API_KEY_PREFIX)) return null;
  const hash = hashApiKey(plaintext);
  const { ok, rows: rows2 } = await restRequest(
    `community_api_keys?key_hash=eq.${encodeURIComponent(hash)}&limit=1`
  );
  if (!ok || rows2.length === 0) return null;
  const row = rows2[0];
  if (row.revoked_at) return null;
  return row;
}
async function touchApiKey(row) {
  try {
    await restRequest(`community_api_keys?id=eq.${encodeURIComponent(row.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        last_used_at: (/* @__PURE__ */ new Date()).toISOString(),
        request_count: Number(row.request_count || 0) + 1
      }),
      headers: { Prefer: "return=minimal" }
    });
  } catch {
  }
}
async function insertCommunityPost(post) {
  const { ok, rows: rows2 } = await restRequest("posts", {
    method: "POST",
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
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    }),
    headers: { Prefer: "return=representation" }
  });
  return ok && rows2.length > 0 ? rows2[0] : null;
}
async function listCommunityPosts(communityHandle, limit) {
  const { ok, rows: rows2 } = await restRequest(
    `posts?community_handle=eq.${encodeURIComponent(communityHandle)}&is_deleted=eq.false&order=created_at.desc&limit=${limit}&select=id,content,code_snippet,code_language,category,category_name,author,community_id,community_name,community_handle,likes_count,comments_count,reposts_count,created_at`
  );
  return ok ? rows2 : [];
}
async function listPublicCommunities(limit) {
  const { ok, rows: rows2 } = await restRequest(
    `communities?is_private=eq.false&order=members_count.desc&limit=${limit}&select=id,name,handle,description,is_private,created_by,creator_username,members_count,projects_count`
  );
  return ok ? rows2 : [];
}
var LIMITS = {
  content: 2e3,
  codeSnippet: 1e4,
  codeLanguage: 32,
  authorName: 60,
  category: 40,
  keyName: 60,
  maxActiveKeysPerCommunity: 10
};
var KNOWN_LANGUAGES = /* @__PURE__ */ new Set([
  "typescript",
  "javascript",
  "python",
  "rust",
  "go",
  "sql",
  "html",
  "css",
  "csharp",
  "cpp",
  "c",
  "java",
  "kotlin",
  "swift",
  "php",
  "ruby",
  "bash",
  "shell",
  "yaml",
  "json",
  "dockerfile",
  "plaintext"
]);
function sanitizeText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/[\u202A-\u202E\u2066-\u2069\u200E\u200F]/g, "").slice(0, maxLength).trim();
}
function normalizeLanguage(value) {
  const raw = sanitizeText(value, LIMITS.codeLanguage).toLowerCase();
  if (!raw) return "plaintext";
  const alias = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rs: "rust",
    golang: "go",
    "c++": "cpp",
    "c#": "csharp",
    sh: "bash",
    postgres: "sql",
    postgresql: "sql",
    yml: "yaml"
  };
  const mapped = alias[raw] || raw;
  return KNOWN_LANGUAGES.has(mapped) ? mapped : "plaintext";
}
function validatePostPayload(body) {
  const content = sanitizeText(body.content, LIMITS.content);
  const codeSnippet = sanitizeText(body.code_snippet ?? body.codeSnippet, LIMITS.codeSnippet);
  if (!content && !codeSnippet) {
    return {
      ok: false,
      field: "content",
      error: "`content` veya `code_snippet` alanlar\u0131ndan en az biri dolu olmal\u0131d\u0131r. / Provide at least one of `content` or `code_snippet`."
    };
  }
  if (typeof body.content === "string" && body.content.length > LIMITS.content) {
    return {
      ok: false,
      field: "content",
      error: `\`content\` en fazla ${LIMITS.content} karakter olabilir. / \`content\` may be at most ${LIMITS.content} characters.`
    };
  }
  const rawSnippet = body.code_snippet ?? body.codeSnippet;
  if (typeof rawSnippet === "string" && rawSnippet.length > LIMITS.codeSnippet) {
    return {
      ok: false,
      field: "code_snippet",
      error: `\`code_snippet\` en fazla ${LIMITS.codeSnippet} karakter olabilir. / \`code_snippet\` may be at most ${LIMITS.codeSnippet} characters.`
    };
  }
  const category = sanitizeText(body.category, LIMITS.category).toLowerCase() || "general";
  const authorName = sanitizeText(body.author_name ?? body.authorName, LIMITS.authorName) || "API";
  return {
    ok: true,
    value: {
      content: content || `\`${normalizeLanguage(body.code_language ?? body.codeLanguage)}\` kod par\xE7ac\u0131\u011F\u0131`,
      codeSnippet: codeSnippet || null,
      codeLanguage: codeSnippet ? normalizeLanguage(body.code_language ?? body.codeLanguage) : null,
      category,
      authorName
    }
  };
}
function extractApiKey(req) {
  const header = req.headers["x-api-key"];
  if (typeof header === "string" && header.trim()) return header.trim();
  const authorization = req.headers.authorization;
  if (typeof authorization === "string") {
    const match = /^Bearer\s+(lnx_live_[A-Za-z0-9_-]+)$/i.exec(authorization.trim());
    if (match) return match[1];
  }
  const fromBody = req.body?.api_key;
  if (typeof fromBody === "string" && fromBody.trim()) return fromBody.trim();
  return "";
}
async function findCommunitiesByIds(ids) {
  if (ids.length === 0) return [];
  const list = ids.slice(0, 100).map((id) => `"${String(id).replace(/"/g, "")}"`).join(",");
  const { ok, rows: rows2 } = await restRequest(
    `communities?id=in.(${encodeURIComponent(list)})&limit=100`
  );
  return ok ? rows2 : [];
}

// src/server/mail.ts
var import_node_fs = __toESM(require("node:fs"), 1);
var import_node_path = __toESM(require("node:path"), 1);
init_security();

// src/server/mailTemplate.ts
var COLORS = {
  pageBg: "#f4f4f5",
  cardBg: "#ffffff",
  headerBg: "#09090b",
  headerBorder: "#27272a",
  text: "#18181b",
  muted: "#52525b",
  faint: "#a1a1aa",
  border: "#e4e4e7",
  accent: "#18181b",
  accentText: "#ffffff"
};
function escapeHtml2(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function safeUrl(url) {
  try {
    const parsed = new URL(String(url));
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}
function renderMailHtml(input) {
  const brandName = input.brandName || "Code4Ever";
  const brandDomain = input.brandDomain || "lanux.online";
  const logoCid = input.logoCid || "c4elogo";
  const cta = input.callToAction ? { ...input.callToAction, url: safeUrl(input.callToAction.url) } : null;
  const paragraphs = input.paragraphs.filter((p) => String(p || "").trim()).map(
    (p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${COLORS.text};">${escapeHtml2(p).replace(/\n/g, "<br />")}</p>`
  ).join("");
  const greeting = input.recipientName ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${COLORS.text};">Merhaba <strong>${escapeHtml2(input.recipientName)}</strong>,</p>` : "";
  const ctaBlock = cta && cta.url ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 6px;">
           <tr>
             <td align="center" bgcolor="${COLORS.accent}" style="border-radius:10px;">
               <a href="${escapeHtml2(cta.url)}"
                  style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:700;
                         color:${COLORS.accentText};text-decoration:none;border-radius:10px;
                         font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                 ${escapeHtml2(cta.label)}
               </a>
             </td>
           </tr>
         </table>` : "";
  const unsubUrl = input.unsubscribeUrl ? safeUrl(input.unsubscribeUrl) : null;
  const unsubscribe = unsubUrl ? `<p class="c4e-note" style="margin:0;font-size:12px;line-height:1.6;color:${COLORS.faint};"><a href="${escapeHtml2(unsubUrl)}" style="color:${COLORS.muted};">Bildirim e-postalar\u0131n\u0131 durdur</a></p>` : "";
  const footnote = input.footnote ? `<p class="c4e-note" style="margin:0 0 10px;font-size:12px;line-height:1.6;color:${COLORS.muted};">${escapeHtml2(input.footnote)}</p>` : "";
  const preheader = input.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">
         ${escapeHtml2(input.preheader)}${"&#8203;&nbsp;".repeat(60)}
       </div>` : "";
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>${escapeHtml2(input.heading)}</title>
<style>
  /* Stripped by some clients; every rule here is an enhancement, never a requirement. */
  @media (max-width:600px){
    .c4e-card{width:100% !important;border-radius:0 !important;}
    .c4e-pad{padding-left:22px !important;padding-right:22px !important;}
    .c4e-h1{font-size:21px !important;}
  }
  @media (prefers-color-scheme:dark){
    .c4e-page{background:#09090b !important;}
    .c4e-card{background:#0c0c0e !important;border-color:#27272a !important;}
    /* Paragraphs carry their own inline colour (required for clients that drop this
       block), so the dark override has to target them directly \u2014 an inherited rule on the
       cell alone loses to the inline declaration and left the body near-invisible. */
    .c4e-text,.c4e-h1,.c4e-text p,.c4e-text strong{color:#f4f4f5 !important;}
    .c4e-muted,.c4e-note{color:#a1a1aa !important;}
    .c4e-divider{border-color:#27272a !important;}
    .c4e-cta a{background:#f4f4f5 !important;color:#09090b !important;}
    .c4e-cta td{background:#f4f4f5 !important;}
    .c4e-sent{color:#71717a !important;}
  }
  a{color:#2563eb;}
</style>
</head>
<body class="c4e-page" style="margin:0;padding:0;background:${COLORS.pageBg};
      -webkit-font-smoothing:antialiased;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
${preheader}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
       style="background:${COLORS.pageBg};padding:32px 12px;">
  <tr>
    <td align="center">

      <table role="presentation" class="c4e-card" cellpadding="0" cellspacing="0" border="0" width="600"
             style="width:600px;max-width:600px;background:${COLORS.cardBg};border:1px solid ${COLORS.border};
                    border-radius:16px;overflow:hidden;">

        <!-- Header band -->
        <tr>
          <td class="c4e-pad" align="left"
              style="background:${COLORS.headerBg};padding:26px 34px;border-bottom:1px solid ${COLORS.headerBorder};">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="middle" style="padding-right:13px;">
                  <img src="cid:${escapeHtml2(logoCid)}" width="44" height="44" alt="${escapeHtml2(brandName)}"
                       style="display:block;width:44px;height:44px;border-radius:11px;border:0;outline:none;" />
                </td>
                <td valign="middle">
                  <div style="font-size:17px;font-weight:800;color:#ffffff;letter-spacing:-0.3px;line-height:1.2;">
                    ${escapeHtml2(brandName)}
                  </div>
                  <div style="font-size:12px;color:#a1a1aa;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;line-height:1.5;">
                    ${escapeHtml2(brandDomain)}
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td class="c4e-pad c4e-text" align="left" style="padding:34px;color:${COLORS.text};">
            <h1 class="c4e-h1" style="margin:0 0 18px;font-size:24px;line-height:1.3;font-weight:800;
                       letter-spacing:-0.5px;color:${COLORS.text};">
              ${escapeHtml2(input.heading)}
            </h1>
            ${greeting}
            ${paragraphs}
            <div class="c4e-cta">${ctaBlock}</div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td class="c4e-pad" align="left" style="padding:0 34px 30px;">
            <hr class="c4e-divider" style="border:0;border-top:1px solid ${COLORS.border};margin:0 0 18px;" />
            ${footnote}
            ${unsubscribe}
            <p class="c4e-muted" style="margin:0;font-size:12px;line-height:1.6;color:${COLORS.faint};">
              ${escapeHtml2(brandName)} \xB7
              <a href="https://${escapeHtml2(brandDomain)}" style="color:${COLORS.muted};text-decoration:none;">${escapeHtml2(brandDomain)}</a> \xB7
              <a href="https://app.${escapeHtml2(brandDomain)}/tos" style="color:${COLORS.muted};text-decoration:none;">Kullan\u0131m \u015Eartlar\u0131</a> \xB7
              <a href="https://app.${escapeHtml2(brandDomain)}/privacy" style="color:${COLORS.muted};text-decoration:none;">Gizlilik</a>
            </p>
          </td>
        </tr>
      </table>

      <p class="c4e-sent" style="margin:18px 0 0;font-size:11px;color:${COLORS.faint};">
        Bu e-posta ${escapeHtml2(brandDomain)} taraf\u0131ndan g\xF6nderildi.
      </p>

    </td>
  </tr>
</table>
</body>
</html>`;
}
function renderMailText(input) {
  const brandName = input.brandName || "Code4Ever";
  const brandDomain = input.brandDomain || "lanux.online";
  const lines = [brandName.toUpperCase(), "=".repeat(brandName.length), "", input.heading, ""];
  if (input.recipientName) lines.push(`Merhaba ${input.recipientName},`, "");
  for (const p of input.paragraphs) {
    if (String(p || "").trim()) lines.push(p, "");
  }
  const url = input.callToAction ? safeUrl(input.callToAction.url) : null;
  if (input.callToAction && url) lines.push(`${input.callToAction.label}: ${url}`, "");
  if (input.footnote) lines.push("--", input.footnote, "");
  if (input.unsubscribeUrl) lines.push(`Bildirim e-postalar\u0131n\u0131 durdur: ${input.unsubscribeUrl}`, "");
  lines.push("--", `${brandName} \xB7 ${brandDomain}`);
  return lines.join("\n");
}

// src/server/mail.ts
function toPort(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : fallback;
}
function toPositiveInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}
function toSecureFlag(value, fallback) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return fallback;
  if (/^(1|true|yes|on|tls|ssl|ssl\/tls|implicit|secure)$/.test(raw)) return true;
  if (/^(0|false|no|off|none|plain|starttls|insecure)$/.test(raw)) return false;
  return fallback;
}
function getSmtpConfig() {
  const host = env("MAIL_SMTP_HOST");
  const user = env("MAIL_SMTP_USER");
  const pass = env("MAIL_SMTP_PASS");
  if (!host || !user || !pass) return null;
  const port = toPort(env("MAIL_SMTP_PORT"), 465);
  return {
    host,
    port,
    // Implicit TLS on 465; STARTTLS upgrade on 587 and friends.
    secure: toSecureFlag(env("MAIL_SMTP_SECURE"), port === 465),
    user,
    pass,
    fromAddress: env("MAIL_FROM_ADDRESS", user),
    fromName: env("MAIL_FROM_NAME", "Code4Ever")
  };
}
function imapUnavailableReason() {
  if (!env("MAIL_IMAP_HOST") || !env("MAIL_IMAP_USER", env("MAIL_SMTP_USER")) || !env("MAIL_IMAP_PASS", env("MAIL_SMTP_PASS"))) {
    return "IMAP yap\u0131land\u0131r\u0131lmam\u0131\u015F (MAIL_IMAP_HOST / MAIL_IMAP_USER / MAIL_IMAP_PASS eksik).";
  }
  return null;
}
function getImapConfig() {
  const host = env("MAIL_IMAP_HOST");
  const user = env("MAIL_IMAP_USER", env("MAIL_SMTP_USER"));
  const pass = env("MAIL_IMAP_PASS", env("MAIL_SMTP_PASS"));
  if (!host || !user || !pass) return null;
  const port = toPort(env("MAIL_IMAP_PORT"), 993);
  return { host, port, secure: toSecureFlag(env("MAIL_IMAP_SECURE"), port === 993), user, pass };
}
function supportsLiveImap() {
  return !isServerless();
}
function imapMode() {
  return supportsLiveImap() ? "live" : "sync";
}
function describeMailConfig() {
  const smtp = getSmtpConfig();
  const imap = getImapConfig();
  return {
    smtp: smtp ? { configured: true, host: smtp.host, port: smtp.port, secure: smtp.secure, from: smtp.fromAddress } : { configured: false },
    imap: imap ? {
      configured: true,
      host: imap.host,
      port: imap.port,
      secure: imap.secure,
      user: imap.user,
      mode: imapMode(),
      note: imapMode() === "sync" ? 'Bu ortamda gelen kutusu iste\u011Fe ba\u011Fl\u0131 e\u015Fitlenir: "Gelen kutusunu e\u015Fitle" dedi\u011Finizde mesajlar bir kerede \xE7ekilip saklan\u0131r, sonraki g\xF6r\xFCnt\xFClemeler posta sunucusuna hi\xE7 ba\u011Flanmaz.' : null
    } : { configured: false, reason: imapUnavailableReason(), mode: imapMode() },
    // Lets the admin UI tell "not set up yet" apart from "reads from the cache here".
    serverless: isServerless()
  };
}
function headerSafe(value, maxLength = 200) {
  return String(value ?? "").replace(/[\r\n\u2028\u2029\u0000]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
var EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;.]+(\.[^\s@<>"',;.]+)+$/;
function normalizeEmail(value) {
  const raw = headerSafe(value, 254).toLowerCase();
  if (!raw || raw.length > 254) return null;
  return EMAIL_RE.test(raw) ? raw : null;
}
function sanitizeIncomingHtml(html) {
  if (!html) return "";
  let out = String(html);
  out = out.replace(
    /<\s*(script|style|iframe|frame|frameset|object|embed|applet|link|meta|base|form|input|button|textarea|select|svg|math)\b[\s\S]*?<\s*\/\s*\1\s*>/gi,
    ""
  );
  out = out.replace(
    /<\s*(script|style|iframe|frame|frameset|object|embed|applet|link|meta|base|form|input|button|textarea|select|svg|math)\b[^>]*>/gi,
    ""
  );
  out = out.replace(/\son[a-z-]+\s*=\s*"[^"]*"/gi, "");
  out = out.replace(/\son[a-z-]+\s*=\s*'[^']*'/gi, "");
  out = out.replace(/\son[a-z-]+\s*=\s*[^\s>]+/gi, "");
  out = out.replace(/(href|src|action|formaction|background|poster|data)\s*=\s*"\s*(javascript|vbscript|data|file)\s*:[^"]*"/gi, '$1="#"');
  out = out.replace(/(href|src|action|formaction|background|poster|data)\s*=\s*'\s*(javascript|vbscript|data|file)\s*:[^']*'/gi, "$1='#'");
  out = out.replace(/\ssrc\s*=\s*"(https?:)?\/\/[^"]*"/gi, ' data-blocked-src="1"');
  out = out.replace(/\ssrc\s*=\s*'(https?:)?\/\/[^']*'/gi, " data-blocked-src='1'");
  out = out.replace(/style\s*=\s*"[^"]*(expression|javascript:|@import|behavior:)[^"]*"/gi, "");
  out = out.replace(/style\s*=\s*'[^']*(expression|javascript:|@import|behavior:)[^']*'/gi, "");
  return out;
}
async function resolveRecipientByUsername(rawUsername) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  const username = String(rawUsername || "").trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_.-]{1,40}$/.test(username)) return null;
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json"
  };
  let profile = null;
  try {
    const response = await safeFetch(
      `${SUPABASE_URL}/rest/v1/profiles?username=eq.${encodeURIComponent(username)}&select=id,username,display_name,email&limit=1`,
      { headers, timeoutMs: 1e4 }
    );
    if (response.ok) {
      const rows2 = JSON.parse(response.text || "[]");
      profile = Array.isArray(rows2) ? rows2[0] : null;
    }
  } catch {
    return null;
  }
  if (!profile) return null;
  const fromProfile = normalizeEmail(profile.email);
  if (fromProfile) {
    return {
      username: String(profile.username || username),
      displayName: String(profile.display_name || profile.username || username),
      email: fromProfile,
      source: "profile"
    };
  }
  try {
    const response = await safeFetch(
      `${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(String(profile.id))}`,
      { headers, timeoutMs: 1e4 }
    );
    if (response.ok) {
      const user = JSON.parse(response.text || "{}");
      const fromAuth = normalizeEmail(user?.email);
      if (fromAuth) {
        return {
          username: String(profile.username || username),
          displayName: String(profile.display_name || profile.username || username),
          email: fromAuth,
          source: "auth"
        };
      }
    }
  } catch {
  }
  return null;
}
var LOGO_CID = "c4elogo";
function findLogoFile() {
  const override = env("MAIL_LOGO_PATH");
  if (override) {
    try {
      if (import_node_fs.default.existsSync(override)) return override;
    } catch {
    }
  }
  const roots = [];
  try {
    if (typeof __dirname === "string" && __dirname) {
      roots.push(__dirname, import_node_path.default.join(__dirname, ".."));
    }
  } catch {
  }
  roots.push(process.cwd());
  for (const root of roots) {
    for (const relative of ["email-logo.png", import_node_path.default.join("dist", "email-logo.png"), import_node_path.default.join("public", "email-logo.png")]) {
      const file = import_node_path.default.resolve(root, relative);
      try {
        if (import_node_fs.default.existsSync(file)) return file;
      } catch {
      }
    }
  }
  return null;
}
function logoAttachment() {
  const file = findLogoFile();
  if (file) {
    return [{ filename: "logo.png", path: file, cid: LOGO_CID, contentDisposition: "inline" }];
  }
  return [];
}
async function sendMail(input) {
  const config = getSmtpConfig();
  if (!config) {
    return { ok: false, error: "SMTP yap\u0131land\u0131r\u0131lmam\u0131\u015F (MAIL_SMTP_HOST / USER / PASS eksik)." };
  }
  const to = normalizeEmail(input.to);
  if (!to) return { ok: false, error: "Ge\xE7ersiz al\u0131c\u0131 e-posta adresi." };
  const subject = headerSafe(input.subject, 180);
  const unsubscribeUrl = /^https?:\/\/[^\s<>"]+$/.test(String(input.unsubscribeUrl || "").trim()) ? headerSafe(String(input.unsubscribeUrl).trim(), 500) : "";
  if (!subject) return { ok: false, error: "Konu bo\u015F olamaz." };
  const bodyText = String(input.body || "").trim();
  if (!bodyText) return { ok: false, error: "Mesaj g\xF6vdesi bo\u015F olamaz." };
  const replyTo = input.replyTo ? normalizeEmail(input.replyTo) : null;
  const templateInput = {
    heading: headerSafe(input.heading || subject, 160),
    preheader: bodyText.replace(/\s+/g, " ").slice(0, 120),
    // Blank line separates paragraphs, matching how people actually type.
    paragraphs: bodyText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean),
    recipientName: input.recipientName ? headerSafe(input.recipientName, 80) : void 0,
    callToAction: input.callToAction,
    footnote: input.footnote ? headerSafe(input.footnote, 300) : void 0,
    // NOT length-capped: truncating this is what silently breaks the opt-out.
    unsubscribeUrl: unsubscribeUrl || void 0,
    logoCid: LOGO_CID
  };
  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
      // Modern TLS floor; refuses to silently downgrade on a hostile network.
      tls: { minVersion: "TLSv1.2" },
      connectionTimeout: 15e3,
      greetingTimeout: 15e3,
      socketTimeout: 3e4
    });
    const info = await transporter.sendMail({
      from: { name: headerSafe(config.fromName, 80), address: config.fromAddress },
      to,
      subject,
      ...replyTo ? { replyTo } : {},
      // RFC 2369 / RFC 8058. The One-Click variant tells the provider it may POST the URL
      // directly, so the member never has to land on a page to opt out.
      ...unsubscribeUrl ? {
        headers: {
          "List-Unsubscribe": `<${unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
        }
      } : {},
      text: renderMailText(templateInput),
      html: renderMailHtml(templateInput),
      attachments: logoAttachment()
    });
    transporter.close();
    return {
      ok: true,
      messageId: String(info.messageId || ""),
      accepted: (info.accepted || []).map((a) => String(a))
    };
  } catch (error) {
    return { ok: false, error: `SMTP hatas\u0131: ${String(error?.message || error).slice(0, 300)}` };
  }
}
async function verifySmtp() {
  const config = getSmtpConfig();
  if (!config) return { ok: false, error: "SMTP yap\u0131land\u0131r\u0131lmam\u0131\u015F." };
  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
      tls: { minVersion: "TLSv1.2" },
      connectionTimeout: 15e3
    });
    await transporter.verify();
    transporter.close();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error?.message || error).slice(0, 300) };
  }
}
async function withImap(handler2) {
  const config = getImapConfig();
  if (!config) throw new Error("IMAP yap\u0131land\u0131r\u0131lmam\u0131\u015F (MAIL_IMAP_HOST / USER / PASS eksik).");
  const { ImapFlow } = await import("imapflow");
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    tls: { minVersion: "TLSv1.2" },
    // imapflow logs the full IMAP dialogue at info level; that includes envelopes.
    logger: false
  });
  await client.connect();
  try {
    return await handler2(client);
  } finally {
    try {
      await client.logout();
    } catch {
      try {
        client.close();
      } catch {
      }
    }
  }
}
function addressOf(source) {
  const first = source?.value?.[0] || source?.[0] || {};
  return {
    name: headerSafe(first.name || "", 120),
    address: headerSafe(first.address || "", 254)
  };
}
function safeMailboxName(value) {
  const raw = String(value || "");
  return /^[A-Za-z0-9 _./-]{1,80}$/.test(raw) ? raw : "INBOX";
}
async function readHeaders(client, limit) {
  const total = client.mailbox?.exists || 0;
  if (total === 0) return [];
  const start = Math.max(1, total - limit + 1);
  const messages = [];
  for await (const msg of client.fetch(`${start}:*`, {
    uid: true,
    envelope: true,
    flags: true,
    bodyStructure: true,
    // Enough of the body for a preview without pulling whole attachments.
    bodyParts: ["1"]
  })) {
    const env_ = msg.envelope || {};
    const from = addressOf(env_.from);
    const to = addressOf(env_.to);
    const flags = msg.flags || /* @__PURE__ */ new Set();
    let preview = "";
    try {
      const part = msg.bodyParts?.get("1");
      if (part) preview = part.toString("utf8").replace(/\s+/g, " ").slice(0, 200);
    } catch {
    }
    messages.push({
      uid: Number(msg.uid),
      seq: Number(msg.seq),
      subject: headerSafe(env_.subject || "(konu yok)", 250),
      fromName: from.name,
      fromAddress: from.address,
      to: to.address,
      date: env_.date ? new Date(env_.date).toISOString() : null,
      seen: flags.has("\\Seen"),
      flagged: flags.has("\\Flagged"),
      hasAttachments: Boolean(msg.bodyStructure?.childNodes?.some((n) => n.disposition === "attachment")),
      preview
    });
  }
  return messages.reverse();
}
async function fetchInbox(options = {}) {
  const mailbox = safeMailboxName(options.mailbox);
  const limit = Math.min(Math.max(Number(options.limit) || 25, 1), 100);
  return withImap(async (client) => {
    const lock = await client.getMailboxLock(mailbox);
    try {
      return await readHeaders(client, limit);
    } finally {
      lock.release();
    }
  });
}
async function downloadDetail(client, uid) {
  const raw = await client.download(String(uid), void 0, { uid: true });
  if (!raw?.content) return null;
  const { simpleParser } = await import("mailparser");
  const parsed = await simpleParser(raw.content);
  const from = {
    name: headerSafe(parsed.from?.value?.[0]?.name || "", 120),
    address: headerSafe(parsed.from?.value?.[0]?.address || "", 254)
  };
  const originalHtml = String(parsed.html || "");
  const sanitized = sanitizeIncomingHtml(originalHtml);
  return {
    uid,
    seq: 0,
    subject: headerSafe(parsed.subject || "(konu yok)", 250),
    fromName: from.name,
    fromAddress: from.address,
    to: headerSafe(parsed.to?.value?.[0]?.address || "", 254),
    date: parsed.date ? new Date(parsed.date).toISOString() : null,
    seen: true,
    flagged: false,
    hasAttachments: Array.isArray(parsed.attachments) && parsed.attachments.length > 0,
    preview: "",
    text: String(parsed.text || "").slice(0, 2e5),
    html: sanitized.slice(0, 4e5),
    imagesBlocked: sanitized.includes("data-blocked-src"),
    attachments: (parsed.attachments || []).map((a) => ({
      filename: headerSafe(a.filename || "ek", 200),
      contentType: headerSafe(a.contentType || "application/octet-stream", 100),
      size: Number(a.size) || 0
    }))
  };
}
async function fetchMessage(uid, mailboxName = "INBOX") {
  const mailbox = safeMailboxName(mailboxName);
  if (!Number.isInteger(uid) || uid <= 0) return null;
  return withImap(async (client) => {
    const lock = await client.getMailboxLock(mailbox);
    try {
      return await downloadDetail(client, uid);
    } finally {
      lock.release();
    }
  });
}
async function syncInbox(options = {}) {
  const mailbox = safeMailboxName(options.mailbox);
  const limit = Math.min(Math.max(Number(options.limit) || 40, 1), 200);
  const budgetMs = options.budgetMs === void 0 ? Math.min(Math.max(toPositiveInt(env("MAIL_SYNC_BUDGET_MS"), 45e3), 3e3), 28e4) : Math.max(Number(options.budgetMs) || 0, 0);
  const startedAt = Date.now();
  const { saveInboxSnapshot: saveInboxSnapshot2, storeWarning: storeWarning2 } = await Promise.resolve().then(() => (init_mailStore(), mailStore_exports));
  const { headers, details, truncated } = await withImap(async (client) => {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const fetched = await readHeaders(client, limit);
      const bodies = /* @__PURE__ */ new Map();
      let ranOut = false;
      for (const message of fetched) {
        if (Date.now() - startedAt > budgetMs) {
          ranOut = true;
          break;
        }
        try {
          const detail = await downloadDetail(client, message.uid);
          if (detail) bodies.set(message.uid, detail);
        } catch {
        }
      }
      return { headers: fetched, details: bodies, truncated: ranOut };
    } finally {
      lock.release();
    }
  });
  const state = await saveInboxSnapshot2(mailbox, headers, details, { truncated });
  return {
    mailbox,
    syncedAt: state.lastSyncedAt || (/* @__PURE__ */ new Date()).toISOString(),
    messageCount: state.messageCount,
    bodiesCached: state.bodiesCached,
    truncated,
    durationMs: Date.now() - startedAt,
    warning: storeWarning2()
  };
}
async function readMessage(uid, mailboxName = "INBOX") {
  const mailbox = safeMailboxName(mailboxName);
  const { readCachedMessage: readCachedMessage2, saveMessageBody: saveMessageBody2 } = await Promise.resolve().then(() => (init_mailStore(), mailStore_exports));
  const cached = await readCachedMessage2(mailbox, uid);
  if (cached) return { message: cached, source: "cache" };
  const fresh = await fetchMessage(uid, mailbox);
  if (fresh) {
    try {
      await saveMessageBody2(mailbox, fresh);
    } catch {
    }
  }
  return { message: fresh, source: "imap" };
}
async function verifyImap() {
  try {
    const mailboxes = await withImap(async (client) => {
      const list = await client.list();
      return list.map((m) => String(m.path)).slice(0, 50);
    });
    return { ok: true, mailboxes };
  } catch (error) {
    return { ok: false, error: String(error?.message || error).slice(0, 300) };
  }
}

// server.ts
init_mailStore();

// src/server/oauthFlow.ts
var import_node_crypto3 = __toESM(require("node:crypto"), 1);
init_security();
function createPkce() {
  const verifier = import_node_crypto3.default.randomBytes(32).toString("base64url");
  return { verifier, challenge: sha256Base64Url(verifier) };
}
function pkceMatches(verifier, challenge, method) {
  if (!verifier || !challenge) return false;
  if (method !== "S256") return false;
  return safeEquals(sha256Base64Url(verifier), challenge);
}
function sha256Base64Url(input) {
  return import_node_crypto3.default.createHash("sha256").update(input).digest("base64url");
}
function sealFlow(payload) {
  const body = Buffer.from(JSON.stringify({ ...payload, issuedAt: Date.now() }), "utf8").toString("base64url");
  return `${body}.${hmacHex(flowSecret(), body)}`;
}
function openFlow(sealed, maxAgeMs = 10 * 60 * 1e3) {
  const raw = String(sealed || "");
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = raw.slice(0, dot);
  if (!safeEquals(raw.slice(dot + 1), hmacHex(flowSecret(), body))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    if (!Number.isFinite(parsed.issuedAt) || Date.now() - parsed.issuedAt > maxAgeMs) return null;
    return parsed;
  } catch {
    return null;
  }
}
var fallbackSecret = "";
function flowSecret() {
  const configured = env("OAUTH_STATE_SECRET") || env("LANUX_STATE_SECRET");
  if (configured) return configured;
  if (!fallbackSecret) fallbackSecret = import_node_crypto3.default.randomBytes(32).toString("hex");
  return fallbackSecret;
}

// src/server/jubbio.ts
init_security();
var DEFAULT_API_BASE = "https://gateway.jubbio.com";
var DEFAULT_AUTHORIZE_BASE = "https://jubbio.com";
function getJubbioConfig() {
  const clientId = env("JUBBIO_CLIENT_ID");
  const redirectUri = env("JUBBIO_REDIRECT_URI");
  if (!clientId || !redirectUri) return null;
  return {
    clientId,
    redirectUri,
    authorizeBase: (env("JUBBIO_AUTHORIZE_URL") || DEFAULT_AUTHORIZE_BASE).replace(/\/+$/, ""),
    apiBase: (env("JUBBIO_API_BASE") || DEFAULT_API_BASE).replace(/\/+$/, ""),
    // `identify` SDK'nın da varsayılanı: kimliği okumaya yetiyor, fazlasını istemek
    // kullanıcıdan gereksiz izin istemek olurdu.
    scopes: env("JUBBIO_SCOPES") || "identify"
  };
}
function jubbioUnavailableReason() {
  return getJubbioConfig() ? null : "Jubbio ba\u011Flant\u0131s\u0131 yap\u0131land\u0131r\u0131lmam\u0131\u015F (JUBBIO_CLIENT_ID / JUBBIO_REDIRECT_URI eksik).";
}
function apiHosts(config) {
  try {
    return [new URL(config.apiBase).hostname];
  } catch {
    return [];
  }
}
function buildJubbioAuthorizeUrl(config, params) {
  const url = new URL(`${config.authorizeBase}/oauth2/authorize`);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scopes);
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}
async function exchangeJubbioCode(config, code, verifier) {
  let response;
  try {
    response = await safeFetch(`${config.apiBase}/api/v1/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        code_verifier: verifier
      }),
      allowedHosts: apiHosts(config),
      timeoutMs: 15e3,
      maxResponseBytes: 256 * 1024
    });
  } catch (err) {
    return { ok: false, error: String(err?.message || "Jubbio sunucusuna ula\u015F\u0131lamad\u0131.").slice(0, 200) };
  }
  let parsed = null;
  try {
    parsed = JSON.parse(response.text || "{}");
  } catch {
    parsed = null;
  }
  if (!response.ok || !parsed?.access_token) {
    const code2 = String(parsed?.error || `http_${response.status}`);
    const detail = String(parsed?.error_description || "").slice(0, 200);
    return { ok: false, error: detail ? `${code2}: ${detail}` : code2 };
  }
  return { ok: true, tokens: parsed };
}
async function fetchJubbioUser(config, accessToken) {
  let response;
  try {
    response = await safeFetch(`${config.apiBase}/api/v1/oauth2/users/@me`, {
      headers: { authorization: `Bearer ${accessToken}` },
      allowedHosts: apiHosts(config),
      timeoutMs: 15e3,
      maxResponseBytes: 256 * 1024
    });
  } catch (err) {
    return { ok: false, error: String(err?.message || "Jubbio sunucusuna ula\u015F\u0131lamad\u0131.").slice(0, 200) };
  }
  let parsed = null;
  try {
    parsed = JSON.parse(response.text || "null");
  } catch {
    parsed = null;
  }
  const id = String(parsed?.id || "");
  if (!response.ok || !id) {
    return { ok: false, error: `Jubbio hesap bilgisi al\u0131namad\u0131 (http_${response.status}).` };
  }
  return {
    ok: true,
    identity: {
      id: id.slice(0, 80),
      username: String(parsed.username || "").slice(0, 80),
      displayName: String(parsed.display_name || parsed.username || "").slice(0, 120),
      avatarUrl: parsed.avatar_url ? String(parsed.avatar_url).slice(0, 500) : null
    }
  };
}

// src/server/accounts.ts
init_security();
function accountsConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}
function adminHeaders3(extra = {}) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...extra
  };
}
async function call(path3, init = {}) {
  const response = await safeFetch(`${SUPABASE_URL}${path3}`, {
    method: init.method || "GET",
    headers: adminHeaders3(),
    body: init.body,
    timeoutMs: 15e3,
    maxResponseBytes: 1024 * 1024
  });
  let json = null;
  try {
    json = JSON.parse(response.text || "null");
  } catch {
    json = null;
  }
  return { ok: response.ok, status: response.status, json };
}
var rest2 = (pathAndQuery, init) => call(`/rest/v1/${pathAndQuery}`, init);
var PROFILE_FIELDS = "id,username,display_name,email,github_username,jubbio_user_id,jubbio_username";
async function findProfile(filter) {
  const { ok, json } = await rest2(`profiles?${filter}&select=${PROFILE_FIELDS}&limit=1`);
  if (!ok || !Array.isArray(json) || json.length === 0) return null;
  return json[0];
}
var findById = (id) => findProfile(`id=eq.${encodeURIComponent(id)}`);
async function readGithubIdentity(userId) {
  const { ok, json } = await call(`/auth/v1/admin/users/${encodeURIComponent(userId)}`);
  if (!ok) return null;
  const identities = Array.isArray(json?.identities) ? json.identities : [];
  const github = identities.find((i) => String(i?.provider || "") === "github");
  if (!github) return null;
  const data = github.identity_data || {};
  const username = String(data.user_name || data.preferred_username || data.user_login || "");
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(username)) return null;
  return { username, avatarUrl: data.avatar_url ? String(data.avatar_url).slice(0, 500) : null };
}
var findByGithubUsername = (username) => findProfile(`github_username=ilike.${encodeURIComponent(username)}`);
async function writeGithubLink(profileId, githubUsername) {
  const { ok } = await rest2(`profiles?id=eq.${encodeURIComponent(profileId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      github_username: githubUsername,
      github_linked_at: (/* @__PURE__ */ new Date()).toISOString()
    })
  });
  return ok;
}
async function clearGithubLink(profileId) {
  const { ok } = await rest2(`profiles?id=eq.${encodeURIComponent(profileId)}`, {
    method: "PATCH",
    body: JSON.stringify({ github_username: null, github_linked_at: null })
  });
  return ok;
}
var findByJubbioId = (jubbioUserId) => findProfile(`jubbio_user_id=eq.${encodeURIComponent(jubbioUserId)}`);
async function writeJubbioLink(profileId, identity) {
  const { ok } = await rest2(`profiles?id=eq.${encodeURIComponent(profileId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      jubbio_user_id: identity.id,
      jubbio_username: identity.username || null,
      jubbio_avatar_url: identity.avatarUrl ? String(identity.avatarUrl).slice(0, 500) : null,
      jubbio_linked_at: (/* @__PURE__ */ new Date()).toISOString()
    })
  });
  return ok;
}
async function clearJubbioLink(profileId) {
  const { ok } = await rest2(`profiles?id=eq.${encodeURIComponent(profileId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      jubbio_user_id: null,
      jubbio_username: null,
      jubbio_avatar_url: null,
      jubbio_linked_at: null
    })
  });
  return ok;
}
async function readApiProfile(userId) {
  const fields = "id,username,display_name,avatar_url,bio,role,email,created_at,joined_communities,github_username,jubbio_username";
  const { ok, json } = await rest2(
    `profiles?id=eq.${encodeURIComponent(userId)}&select=${fields}&limit=1`
  );
  if (!ok || !Array.isArray(json) || json.length === 0) return null;
  return json[0];
}

// src/server/oauthProvider.ts
var import_node_crypto4 = __toESM(require("node:crypto"), 1);
init_security();
function oauthProviderConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}
var SCOPES = {
  identify: {
    tr: "Kullan\u0131c\u0131 ad\u0131n\u0131, g\xF6r\xFCnen ad\u0131n\u0131 ve profil resmini g\xF6r\xFCr",
    en: "See your username, display name and avatar"
  },
  email: {
    tr: "E-posta adresini g\xF6r\xFCr",
    en: "See your e-mail address"
  },
  "projects:read": {
    tr: "Projelerini listeler",
    en: "List your projects"
  },
  "communities:read": {
    tr: "\xDCyesi oldu\u011Fun topluluklar\u0131 listeler",
    en: "List the communities you belong to"
  }
};
var ALL_SCOPES = Object.keys(SCOPES);
function parseScopes(raw) {
  const parts = String(raw || "").split(/[\s,+]+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return ["identify"];
  const out = [];
  for (const part of parts) {
    if (!(part in SCOPES)) return null;
    if (!out.includes(part)) out.push(part);
  }
  return out;
}
async function rest3(pathAndQuery, init = {}) {
  const response = await safeFetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method: init.method || "GET",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...init.prefer ? { Prefer: init.prefer } : {}
    },
    body: init.body,
    timeoutMs: 15e3,
    maxResponseBytes: 1024 * 1024
  });
  let json = null;
  try {
    json = JSON.parse(response.text || "null");
  } catch {
    json = null;
  }
  return { ok: response.ok, status: response.status, json };
}
var rows = (json) => Array.isArray(json) ? json : [];
var CLIENT_ID_PREFIX = "c4e_app_";
var CLIENT_SECRET_PREFIX = "c4e_sec_";
var ACCESS_PREFIX = "c4e_at_";
var REFRESH_PREFIX = "c4e_rt_";
function sha256(value) {
  return import_node_crypto4.default.createHash("sha256").update(value).digest("hex");
}
function secret(prefix, bytes = 32) {
  return prefix + import_node_crypto4.default.randomBytes(bytes).toString("base64url");
}
function toPublicApp(row) {
  return {
    id: row.id,
    client_id: row.client_id,
    client_secret_prefix: row.client_secret_prefix,
    name: row.name,
    description: row.description,
    website_url: row.website_url,
    logo_url: row.logo_url,
    redirect_uris: Array.isArray(row.redirect_uris) ? row.redirect_uris : [],
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    owner_username: row.owner_username,
    created_at: row.created_at,
    last_used_at: row.last_used_at,
    request_count: Number(row.request_count || 0)
  };
}
function toAppFacts(row) {
  return {
    client_id: row.client_id,
    name: row.name,
    description: row.description,
    website_url: row.website_url,
    logo_url: row.logo_url,
    owner_username: row.owner_username
  };
}
function redirectUriAllowed(app2, candidate) {
  const list = Array.isArray(app2.redirect_uris) ? app2.redirect_uris : [];
  return list.some((uri) => uri === candidate);
}
function validateRedirectUri(raw) {
  const value = String(raw || "").trim();
  if (!value || value.length > 500) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.hash) return null;
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol === "https:") return url.toString();
  if (url.protocol === "http:" && isLocal) return url.toString();
  return null;
}
async function getAppByClientId(clientId) {
  const { ok, json } = await rest3(
    `oauth_apps?client_id=eq.${encodeURIComponent(clientId)}&revoked_at=is.null&limit=1`
  );
  return ok && rows(json).length ? rows(json)[0] : null;
}
async function getAppById(id) {
  const { ok, json } = await rest3(`oauth_apps?id=eq.${encodeURIComponent(id)}&limit=1`);
  return ok && rows(json).length ? rows(json)[0] : null;
}
async function listAppsByOwner(ownerId) {
  const { ok, json } = await rest3(
    `oauth_apps?owner_id=eq.${encodeURIComponent(ownerId)}&revoked_at=is.null&order=created_at.desc&limit=50`
  );
  return ok ? rows(json) : [];
}
async function countAppsByOwner(ownerId) {
  return (await listAppsByOwner(ownerId)).length;
}
async function createApp(input) {
  const clientSecret = secret(CLIENT_SECRET_PREFIX);
  const row = {
    id: `app_${import_node_crypto4.default.randomBytes(12).toString("hex")}`,
    client_id: CLIENT_ID_PREFIX + import_node_crypto4.default.randomBytes(12).toString("hex"),
    client_secret_hash: sha256(clientSecret),
    client_secret_prefix: clientSecret.slice(0, 16),
    name: input.name,
    description: input.description || null,
    website_url: input.website_url || null,
    redirect_uris: input.redirect_uris,
    scopes: input.scopes,
    owner_id: input.owner_id,
    owner_username: input.owner_username
  };
  const { ok, json } = await rest3("oauth_apps", {
    method: "POST",
    body: JSON.stringify([row]),
    prefer: "return=representation"
  });
  if (!ok || !rows(json).length) return { ok: false, error: "Uygulama kaydedilemedi." };
  return { ok: true, app: rows(json)[0], clientSecret };
}
async function updateApp(id, patch) {
  const { ok, json } = await rest3(`oauth_apps?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ ...patch, updated_at: (/* @__PURE__ */ new Date()).toISOString() }),
    prefer: "return=representation"
  });
  return ok && rows(json).length ? rows(json)[0] : null;
}
async function rotateSecret(id) {
  const clientSecret = secret(CLIENT_SECRET_PREFIX);
  const { ok } = await rest3(`oauth_apps?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      client_secret_hash: sha256(clientSecret),
      client_secret_prefix: clientSecret.slice(0, 16),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    })
  });
  return ok ? clientSecret : null;
}
async function revokeApp(id) {
  await rest3(`oauth_tokens?app_id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
  await rest3(`oauth_grants?app_id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
  await rest3(`oauth_codes?app_id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
  const { ok } = await rest3(`oauth_apps?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ revoked_at: (/* @__PURE__ */ new Date()).toISOString() })
  });
  return ok;
}
function clientSecretMatches(app2, candidate) {
  if (!candidate) return false;
  const a = Buffer.from(sha256(candidate), "utf8");
  const b = Buffer.from(String(app2.client_secret_hash || ""), "utf8");
  return a.length === b.length && import_node_crypto4.default.timingSafeEqual(a, b);
}
var CODE_TTL_MS = 10 * 60 * 1e3;
async function issueCode(input) {
  const code = `c4e_code_${import_node_crypto4.default.randomBytes(32).toString("base64url")}`;
  const { ok } = await rest3("oauth_codes", {
    method: "POST",
    body: JSON.stringify([
      {
        code_hash: sha256(code),
        app_id: input.appId,
        user_id: input.userId,
        scopes: input.scopes,
        redirect_uri: input.redirectUri,
        code_challenge: input.codeChallenge || null,
        code_challenge_method: input.codeChallengeMethod || null,
        expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString()
      }
    ])
  });
  return ok ? code : null;
}
async function peekCode(code) {
  const { ok, json } = await rest3(
    `oauth_codes?code_hash=eq.${encodeURIComponent(sha256(code))}&limit=1`
  );
  if (!ok || !rows(json).length) return null;
  const record = rows(json)[0];
  if (new Date(record.expires_at).getTime() < Date.now()) return null;
  return record;
}
async function consumeCode(code) {
  const { ok, json } = await rest3(`oauth_codes?code_hash=eq.${encodeURIComponent(sha256(code))}`, {
    method: "DELETE",
    prefer: "return=representation"
  });
  if (!ok || !rows(json).length) return null;
  const record = rows(json)[0];
  if (new Date(record.expires_at).getTime() < Date.now()) return null;
  return record;
}
async function pruneExpiredCodes() {
  await rest3(`oauth_codes?expires_at=lt.${encodeURIComponent((/* @__PURE__ */ new Date()).toISOString())}`, {
    method: "DELETE"
  });
}
var ACCESS_TTL_MS = 60 * 60 * 1e3;
var REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1e3;
async function issueTokens(input) {
  const accessToken = secret(ACCESS_PREFIX);
  const refreshToken = secret(REFRESH_PREFIX);
  const { ok } = await rest3("oauth_tokens", {
    method: "POST",
    body: JSON.stringify([
      {
        id: `tok_${import_node_crypto4.default.randomBytes(12).toString("hex")}`,
        access_token_hash: sha256(accessToken),
        refresh_token_hash: sha256(refreshToken),
        app_id: input.appId,
        user_id: input.userId,
        scopes: input.scopes,
        expires_at: new Date(Date.now() + ACCESS_TTL_MS).toISOString()
      }
    ])
  });
  if (!ok) return null;
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "Bearer",
    expires_in: Math.floor(ACCESS_TTL_MS / 1e3),
    scope: input.scopes.join(" ")
  };
}
async function resolveAccessToken(token) {
  if (!token || !token.startsWith(ACCESS_PREFIX)) return null;
  const { ok, json } = await rest3(
    `oauth_tokens?access_token_hash=eq.${encodeURIComponent(sha256(token))}&revoked_at=is.null&limit=1`
  );
  if (!ok || !rows(json).length) return null;
  const record = rows(json)[0];
  if (new Date(record.expires_at).getTime() < Date.now()) return null;
  return record;
}
async function refreshTokens(refreshToken, appId) {
  if (!refreshToken || !refreshToken.startsWith(REFRESH_PREFIX)) return null;
  const { ok, json } = await rest3(
    `oauth_tokens?refresh_token_hash=eq.${encodeURIComponent(sha256(refreshToken))}&revoked_at=is.null`,
    { method: "DELETE", prefer: "return=representation" }
  );
  if (!ok || !rows(json).length) return null;
  const record = rows(json)[0];
  if (record.app_id !== appId) return null;
  const age = Date.now() - new Date(record.created_at).getTime();
  if (!Number.isFinite(age) || age > REFRESH_TTL_MS) return null;
  return issueTokens({ appId: record.app_id, userId: record.user_id, scopes: record.scopes });
}
async function revokeToken(token) {
  const hash = sha256(token);
  const column = token.startsWith(REFRESH_PREFIX) ? "refresh_token_hash" : "access_token_hash";
  const { ok } = await rest3(`oauth_tokens?${column}=eq.${encodeURIComponent(hash)}`, {
    method: "DELETE"
  });
  return ok;
}
async function touchToken(id) {
  await rest3(`oauth_tokens?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ last_used_at: (/* @__PURE__ */ new Date()).toISOString() })
  });
}
async function touchApp(id) {
  const app2 = await getAppById(id);
  if (!app2) return;
  await rest3(`oauth_apps?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      last_used_at: (/* @__PURE__ */ new Date()).toISOString(),
      request_count: Number(app2.request_count || 0) + 1
    })
  });
}
async function writeGrant(appId, userId, scopes) {
  const { ok } = await rest3("oauth_grants?on_conflict=app_id,user_id", {
    method: "POST",
    body: JSON.stringify([
      { app_id: appId, user_id: userId, scopes, updated_at: (/* @__PURE__ */ new Date()).toISOString() }
    ]),
    prefer: "resolution=merge-duplicates"
  });
  return ok;
}
async function listGrants(userId) {
  const { ok, json } = await rest3(
    `oauth_grants?user_id=eq.${encodeURIComponent(userId)}&order=updated_at.desc&limit=100`
  );
  return ok ? rows(json) : [];
}
async function revokeGrant(appId, userId) {
  await rest3(
    `oauth_tokens?app_id=eq.${encodeURIComponent(appId)}&user_id=eq.${encodeURIComponent(userId)}`,
    { method: "DELETE" }
  );
  const { ok } = await rest3(
    `oauth_grants?app_id=eq.${encodeURIComponent(appId)}&user_id=eq.${encodeURIComponent(userId)}`,
    { method: "DELETE" }
  );
  return ok;
}
async function getAppsByIds(ids) {
  if (ids.length === 0) return [];
  const list = ids.map((id) => `"${id.replace(/"/g, "")}"`).join(",");
  const { ok, json } = await rest3(`oauth_apps?id=in.(${encodeURIComponent(list)})&limit=100`);
  return ok ? rows(json) : [];
}

// src/server/notificationMail.ts
init_security();
var DEFAULT_EMAIL_PREFS = {
  enabled: true,
  types: {
    comment: true,
    message: true,
    follow: true,
    job_application: true,
    group_invite: true,
    community: true,
    like: false,
    repost: false,
    star: false,
    job_listing: false,
    // Takip, üyenin kendi eliyle kurduğu bir ABONELİK: "bu projeden haberim olsun".
    // Beğeni/repost gibi kendiliğinden gelen olaylardan farklı, bu yüzden açık geliyor —
    // kapalı gelseydi üyenin açıkça istediği şey sessizce yok sayılmış olurdu.
    project_commit: true
  }
};
var ALL_TYPES = Object.keys(DEFAULT_EMAIL_PREFS.types);
function sanitizeEmailPrefs(raw) {
  let source = raw;
  if (typeof raw === "string") {
    try {
      source = JSON.parse(raw);
    } catch {
      source = null;
    }
  }
  if (!source || typeof source !== "object") return { ...DEFAULT_EMAIL_PREFS, types: { ...DEFAULT_EMAIL_PREFS.types } };
  const types = {};
  for (const type of ALL_TYPES) {
    const value = source.types?.[type];
    types[type] = typeof value === "boolean" ? value : DEFAULT_EMAIL_PREFS.types[type];
  }
  return { enabled: source.enabled !== false, types };
}
function unsubscribeToken(userId) {
  const id = String(userId || "");
  return `${Buffer.from(id, "utf8").toString("base64url")}.${hmacHex(OAUTH_STATE_SECRET, `unsub:${id}`)}`;
}
function verifyUnsubscribeToken(token) {
  const raw = String(token || "");
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const encoded = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);
  let userId;
  try {
    userId = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!userId) return null;
  return safeEquals(signature, hmacHex(OAUTH_STATE_SECRET, `unsub:${userId}`)) ? userId : null;
}
function dispatcherConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && getSmtpConfig());
}
function adminHeaders4(extra = {}) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...extra
  };
}
async function rest4(pathAndQuery, init = {}) {
  const response = await safeFetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method: init.method || "GET",
    headers: adminHeaders4(init.headers),
    body: init.body,
    timeoutMs: 15e3,
    maxResponseBytes: 4 * 1024 * 1024
  });
  let rows2 = [];
  if (response.text) {
    try {
      const parsed = JSON.parse(response.text);
      rows2 = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      rows2 = [];
    }
  }
  return { ok: response.ok, status: response.status, rows: rows2 };
}
var TYPE_LABELS = {
  comment: "g\xF6nderine yan\u0131t verdi",
  message: "sana mesaj g\xF6nderdi",
  follow: "seni takip etmeye ba\u015Flad\u0131",
  job_application: "ilan\u0131na ba\u015Fvurdu",
  group_invite: "seni bir gruba davet etti",
  community: "toplulu\u011Funla ilgili bir i\u015Flem yapt\u0131",
  like: "g\xF6nderini be\u011Fendi",
  repost: "g\xF6nderini yeniden payla\u015Ft\u0131",
  star: "g\xF6nderine y\u0131ld\u0131z verdi",
  job_listing: "yeni bir ilan payla\u015Ft\u0131",
  project_commit: "takip etti\u011Fin projeye yeni commit att\u0131"
};
function actorName(row) {
  return String(row?.actor?.display_name || row?.actor?.username || "Bir \xFCye").slice(0, 60);
}
function describe(row) {
  const label = TYPE_LABELS[String(row?.type)] || "seninle ilgili bir i\u015Flem yapt\u0131";
  const content = String(row?.content || "").replace(/\s+/g, " ").trim().slice(0, 140);
  return content ? `${actorName(row)} ${label}: \u201C${content}\u201D` : `${actorName(row)} ${label}.`;
}
function summarize(rows2) {
  const groups = /* @__PURE__ */ new Map();
  for (const row of rows2) {
    const key = `${row?.type}|${row?.target_id ?? ""}`;
    const list = groups.get(key) || [];
    list.push(row);
    groups.set(key, list);
  }
  const lines = [];
  for (const items of groups.values()) {
    if (items.length === 1) {
      lines.push(describe(items[0]));
      continue;
    }
    const names = [];
    for (const item of items) {
      const name = actorName(item);
      if (!names.includes(name)) names.push(name);
    }
    const label = TYPE_LABELS[String(items[0]?.type)] || "seninle ilgili bir i\u015Flem yapt\u0131";
    const who = names.length === 1 ? `${names[0]} (${items.length} kez)` : names.length === 2 ? `${names[0]} ve ${names[1]}` : `${names[0]} ve ${names.length - 1} ki\u015Fi daha`;
    const content = String(items[0]?.content || "").replace(/\s+/g, " ").trim().slice(0, 120);
    lines.push(content ? `${who} ${label}: \u201C${content}\u201D` : `${who} ${label}.`);
  }
  return lines;
}
function toPositiveInt2(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}
async function dispatchNotificationEmails(options = {}) {
  const startedAt = Date.now();
  const limit = Math.min(toPositiveInt2(options.limit, 200), 500);
  const perRecipient = Math.min(toPositiveInt2(options.perRecipient, 12), 50);
  const maxAgeHours = Math.min(toPositiveInt2(options.maxAgeHours ?? toPositiveInt2(env("MAIL_NOTIFY_MAX_AGE_HOURS"), 48), 48), 720);
  const dryRun = options.dryRun === true;
  const appUrl = String(options.appUrl || env("APP_URL", "https://app.lanux.online")).replace(/\/+$/, "");
  const skipped = {};
  const skip = (reason, n = 1) => {
    skipped[reason] = (skipped[reason] || 0) + n;
  };
  const { ok, rows: rows2 } = await rest4(
    `notifications?email_sent_at=is.null&is_read=eq.false&select=id,recipient_id,type,actor,content,target_id,created_at&order=created_at.asc&limit=${limit}`
  );
  if (!ok) {
    return { pending: 0, recipients: 0, sent: 0, skipped: { supabase_okunamadi: 1 }, durationMs: Date.now() - startedAt, dryRun };
  }
  const pending = rows2.length;
  if (pending === 0) {
    return { pending: 0, recipients: 0, sent: 0, skipped, durationMs: Date.now() - startedAt, dryRun };
  }
  const cutoff = Date.now() - maxAgeHours * 3600 * 1e3;
  const stale = [];
  const fresh = [];
  for (const row of rows2) {
    const at = Date.parse(row.created_at || "");
    if (Number.isFinite(at) && at < cutoff) stale.push(row.id);
    else fresh.push(row);
  }
  if (stale.length) {
    skip("cok_eski", stale.length);
    if (!dryRun) await markSent(stale);
  }
  const byRecipient = /* @__PURE__ */ new Map();
  for (const row of fresh) {
    const id = String(row.recipient_id || "");
    if (!id) {
      skip("alici_yok");
      continue;
    }
    const list = byRecipient.get(id) || [];
    list.push(row);
    byRecipient.set(id, list);
  }
  let sent = 0;
  let recipients = 0;
  for (const [recipientId, items] of byRecipient) {
    const profile = await loadRecipient(recipientId);
    if (!profile || !profile.email) {
      skip(profile ? "adres_yok" : "profil_yok", items.length);
      if (!dryRun) await markSent(items.map((i) => i.id));
      continue;
    }
    const prefs = sanitizeEmailPrefs(profile.email_prefs);
    if (!prefs.enabled) {
      skip("abonelik_kapali", items.length);
      if (!dryRun) await markSent(items.map((i) => i.id));
      continue;
    }
    const wanted = items.filter((i) => prefs.types[String(i.type)] === true);
    const unwanted = items.filter((i) => !wanted.includes(i));
    if (unwanted.length) {
      skip("tur_kapali", unwanted.length);
      if (!dryRun) await markSent(unwanted.map((i) => i.id));
    }
    if (wanted.length === 0) continue;
    recipients++;
    if (dryRun) continue;
    const token = unsubscribeToken(recipientId);
    const allLines = summarize(wanted);
    const paragraphs = allLines.slice(0, perRecipient);
    const extra = allLines.length - paragraphs.length;
    if (extra > 0) paragraphs.push(`\u2026ve ${extra} bildirim daha.`);
    const result = await sendMail({
      to: profile.email,
      recipientName: profile.display_name || profile.username,
      subject: wanted.length === 1 ? `Code4Ever: ${describe(wanted[0]).slice(0, 90)}` : `Code4Ever: ${wanted.length} yeni bildirim`,
      heading: wanted.length === 1 ? "Yeni bir bildirimin var" : `${wanted.length} yeni bildirimin var`,
      // sendMail gövdeyi düz metin alır ve boş satırları paragrafa çevirir.
      body: paragraphs.join("\n\n"),
      callToAction: { label: "Bildirimleri A\xE7", url: `${appUrl}/notifications` },
      footnote: `Bu e-postay\u0131 Code4Ever hesab\u0131ndaki bildirim tercihlerin a\xE7\u0131k oldu\u011Fu i\xE7in al\u0131yorsun. Hangi bildirimlerin e-postayla gelece\u011Fini buradan se\xE7ebilirsin: ${appUrl}/settings`,
      // Ayrı alan: dipnot uzunluk sınırına takılıyor ve jetonu ortadan kesiyordu, yani
      // abonelikten çıkma bağlantısı kalıcı olarak bozuk gidiyordu.
      unsubscribeUrl: `${appUrl}/api/email/unsubscribe?token=${token}`
    });
    if (result.ok) {
      sent++;
      await markSent(wanted.map((i) => i.id));
    } else {
      skip("gonderim_hatasi", wanted.length);
    }
  }
  return { pending, recipients, sent, skipped, durationMs: Date.now() - startedAt, dryRun };
}
async function markSent(ids) {
  if (ids.length === 0) return;
  const list = ids.map((id) => `"${String(id).replace(/"/g, "")}"`).join(",");
  await rest4(`notifications?id=in.(${encodeURIComponent(list)})`, {
    method: "PATCH",
    body: JSON.stringify({ email_sent_at: (/* @__PURE__ */ new Date()).toISOString() }),
    headers: { Prefer: "return=minimal" }
  });
}
async function loadRecipient(recipientId) {
  const encoded = encodeURIComponent(recipientId);
  for (const filter of [`id=eq.${encoded}`, `username=eq.${encoded}`]) {
    const { ok, rows: rows2 } = await rest4(`profiles?${filter}&select=id,username,display_name,email,email_prefs&limit=1`);
    if (ok && rows2.length > 0) {
      const row = rows2[0];
      return {
        id: String(row.id),
        username: String(row.username || ""),
        display_name: String(row.display_name || ""),
        email: normalizeEmail(row.email),
        email_prefs: row.email_prefs
      };
    }
  }
  return null;
}
async function readEmailPrefs(userId) {
  const { ok, rows: rows2 } = await rest4(`profiles?id=eq.${encodeURIComponent(userId)}&select=email_prefs&limit=1`);
  if (!ok || rows2.length === 0) return null;
  return sanitizeEmailPrefs(rows2[0].email_prefs);
}
async function writeEmailPrefs(userId, prefs) {
  const { ok } = await rest4(`profiles?id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify({ email_prefs: prefs }),
    headers: { Prefer: "return=minimal" }
  });
  return ok;
}
function cronSecretMatches(presented) {
  const secret2 = env("MAIL_NOTIFY_CRON_SECRET");
  if (!secret2) return false;
  return safeEquals(String(presented || ""), secret2);
}

// src/server/projects.ts
var import_node_crypto5 = __toESM(require("node:crypto"), 1);
init_security();
function adminHeaders5(extra = {}) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...extra
  };
}
async function rest5(pathAndQuery, init = {}) {
  const response = await safeFetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method: init.method || "GET",
    headers: adminHeaders5(init.headers),
    body: init.body,
    timeoutMs: 15e3,
    maxResponseBytes: 4 * 1024 * 1024
  });
  let rows2 = [];
  if (response.text) {
    try {
      const parsed = JSON.parse(response.text);
      rows2 = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      rows2 = [];
    }
  }
  return { ok: response.ok, status: response.status, rows: rows2 };
}
function projectsConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}
var REPO_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}\/[A-Za-z0-9._-]{1,100}$/;
function normalizeRepoFullName(raw) {
  const value = String(raw ?? "").trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "").replace(/\/+$/, "");
  return REPO_PATTERN.test(value) ? value : null;
}
function cleanText(raw, max) {
  return String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}
function newProjectId() {
  return `prj_${import_node_crypto5.default.randomBytes(9).toString("hex")}`;
}
var TR_MAP = {
  \u0131: "i",
  \u0130: "i",
  \u015F: "s",
  \u015E: "s",
  \u011F: "g",
  \u011E: "g",
  \u00FC: "u",
  \u00DC: "u",
  \u00F6: "o",
  \u00D6: "o",
  \u00E7: "c",
  \u00C7: "c"
};
function slugify(raw) {
  const latin = String(raw || "").replace(/[ıİşŞğĞüÜöÖçÇ]/g, (ch) => TR_MAP[ch] || ch);
  const base = latin.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90).replace(/-+$/g, "");
  return base || "proje";
}
async function allocateSlug(name) {
  const base = slugify(name);
  for (let attempt = 0; attempt < 12; attempt++) {
    const candidate = attempt === 0 ? base : `${base.slice(0, 84)}-${attempt + 1}`;
    if (!await findProjectBySlug(candidate)) return candidate;
  }
  return `${base.slice(0, 80)}-${import_node_crypto5.default.randomBytes(3).toString("hex")}`;
}
var MAX_IMAGE_CHARS = 500 * 1e3;
var MAX_GALLERY = 6;
var PROJECT_BODY_LIMIT = "4mb";
function cleanImage(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (value.length > MAX_IMAGE_CHARS) return null;
  if (/^data:image\/(png|jpe?g|gif|webp|avif)[;,]/i.test(value)) return value;
  if (/^https:\/\/[^\s<>"']+$/i.test(value)) return value;
  return null;
}
function cleanGallery(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    const candidate = cleanImage(typeof item === "string" ? item : item?.url);
    if (candidate) out.push(candidate);
    if (out.length >= MAX_GALLERY) break;
  }
  return out;
}
function toPositiveInt3(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
function githubHeaders() {
  const token = env("GITHUB_TOKEN");
  return {
    "User-Agent": "Code4Ever-Platform",
    Accept: "application/vnd.github+json",
    ...token ? { Authorization: `Bearer ${token}` } : {}
  };
}
async function readRepo(fullName) {
  const [owner, repo] = fullName.split("/");
  const response = await safeFetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    { headers: githubHeaders(), allowedHosts: ["api.github.com"], timeoutMs: 1e4, maxResponseBytes: 512 * 1024 }
  );
  if (!response.ok) return null;
  try {
    const data = JSON.parse(response.text || "{}");
    if (!data?.full_name) return null;
    return {
      fullName: String(data.full_name),
      htmlUrl: String(data.html_url || `https://github.com/${data.full_name}`).slice(0, 300),
      defaultBranch: String(data.default_branch || "main").slice(0, 100),
      language: data.language ? String(data.language).slice(0, 40) : null,
      description: data.description ? String(data.description).slice(0, 600) : null,
      ownerLogin: String(data.owner?.login || "").slice(0, 39)
    };
  } catch {
    return null;
  }
}
async function readLatestCommit(fullName, branch) {
  const [owner, repo] = fullName.split("/");
  const response = await safeFetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(branch)}`,
    { headers: githubHeaders(), allowedHosts: ["api.github.com"], timeoutMs: 1e4, maxResponseBytes: 1024 * 1024 }
  );
  if (!response.ok) return null;
  try {
    const data = JSON.parse(response.text || "{}");
    if (!data?.sha) return null;
    return {
      sha: String(data.sha).slice(0, 40),
      // Yalnızca ilk satır: commit gövdeleri sayfalarca olabiliyor ve bildirimde tek satır
      // gösteriliyor.
      message: String(data.commit?.message || "").split("\n")[0].slice(0, 200),
      authorName: String(data.commit?.author?.name || data.author?.login || "").slice(0, 80),
      committedAt: data.commit?.author?.date ? String(data.commit.author.date) : null,
      url: String(data.html_url || "").slice(0, 300)
    };
  } catch {
    return null;
  }
}
var PROJECT_FIELDS = "id,slug,owner_id,owner_username,name,about,repo_full_name,repo_url,repo_default_branch,language,likes_count,followers_count,last_commit_sha,last_commit_at,last_checked_at,created_at";
var PROJECT_DETAIL_FIELDS = `${PROJECT_FIELDS},description,cover_url,gallery`;
async function findProjectBySlug(slug) {
  if (!slug) return null;
  const { ok, rows: rows2 } = await rest5(
    `projects?slug=ilike.${encodeURIComponent(slug)}&is_deleted=eq.false&select=${PROJECT_DETAIL_FIELDS}&limit=1`
  );
  return ok && rows2.length ? rows2[0] : null;
}
async function findProjectDetail(id) {
  const { ok, rows: rows2 } = await rest5(
    `projects?id=eq.${encodeURIComponent(id)}&is_deleted=eq.false&select=${PROJECT_DETAIL_FIELDS}&limit=1`
  );
  return ok && rows2.length ? rows2[0] : null;
}
async function findProjectById(id) {
  const { ok, rows: rows2 } = await rest5(
    `projects?id=eq.${encodeURIComponent(id)}&is_deleted=eq.false&select=${PROJECT_FIELDS}&limit=1`
  );
  return ok && rows2.length ? rows2[0] : null;
}
async function findProjectByRepo(fullName) {
  const { ok, rows: rows2 } = await rest5(
    `projects?repo_full_name=ilike.${encodeURIComponent(fullName)}&is_deleted=eq.false&select=${PROJECT_FIELDS}&limit=1`
  );
  return ok && rows2.length ? rows2[0] : null;
}
async function insertProject(row) {
  const { ok, rows: rows2 } = await rest5(`projects?select=${PROJECT_DETAIL_FIELDS}`, {
    method: "POST",
    body: JSON.stringify(row),
    headers: { Prefer: "return=representation" }
  });
  return ok && rows2.length ? rows2[0] : null;
}
async function updateProject(id, patch) {
  const { ok } = await rest5(`projects?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch)
  });
  return ok;
}
async function softDeleteProject(id) {
  return updateProject(id, { is_deleted: true });
}
async function verifyOwnRepo(githubUsername, rawRepo) {
  const repoFullName = normalizeRepoFullName(rawRepo);
  if (!repoFullName) {
    return { ok: false, status: 400, error: "invalid_repo", message: 'Depo ad\u0131 "kullan\u0131c\u0131/depo" bi\xE7iminde olmal\u0131.' };
  }
  if (!githubUsername) {
    return {
      ok: false,
      status: 409,
      error: "github_required",
      message: "GitHub deposu eklemek i\xE7in \xF6nce GitHub hesab\u0131n\u0131z\u0131 ba\u011Flay\u0131n."
    };
  }
  const repo = await readRepo(repoFullName);
  if (!repo) {
    return { ok: false, status: 404, error: "repo_not_found", message: "Depo bulunamad\u0131. Herkese a\xE7\u0131k bir depo olmal\u0131." };
  }
  if (repo.ownerLogin.toLowerCase() !== String(githubUsername).toLowerCase()) {
    return {
      ok: false,
      status: 403,
      error: "not_your_repo",
      message: "Yaln\u0131zca kendi GitHub hesab\u0131n\u0131zdaki depolar\u0131 ekleyebilirsiniz."
    };
  }
  const existing = await findProjectByRepo(repo.fullName);
  if (existing) {
    return { ok: false, status: 409, error: "repo_already_added", message: "Bu depo i\xE7in zaten bir proje var." };
  }
  return { ok: true, status: 200, repo };
}
var TABLE = {
  like: "project_likes",
  follow: "project_follows"
};
async function setRelation(relation, projectId, userId, on) {
  const table = TABLE[relation];
  if (!on) {
    const { ok: ok2 } = await rest5(
      `${table}?project_id=eq.${encodeURIComponent(projectId)}&user_id=eq.${encodeURIComponent(userId)}`,
      { method: "DELETE" }
    );
    return ok2;
  }
  const { ok } = await rest5(table, {
    method: "POST",
    body: JSON.stringify({ project_id: projectId, user_id: userId }),
    headers: { Prefer: "resolution=ignore-duplicates" }
  });
  return ok;
}
async function readRelations(relation, userId, projectIds) {
  if (!userId || projectIds.length === 0) return {};
  const list = projectIds.map((id) => `"${id}"`).join(",");
  const { ok, rows: rows2 } = await rest5(
    `${TABLE[relation]}?user_id=eq.${encodeURIComponent(userId)}&project_id=in.(${encodeURIComponent(list)})&select=project_id`
  );
  if (!ok) return {};
  const map = {};
  for (const row of rows2) map[String(row.project_id)] = true;
  return map;
}
async function readFollowerIds(projectId) {
  const { ok, rows: rows2 } = await rest5(
    `project_follows?project_id=eq.${encodeURIComponent(projectId)}&select=user_id`
  );
  return ok ? rows2.map((r) => String(r.user_id)).filter(Boolean) : [];
}
async function listProjects(options) {
  const order = options.sort === "top" ? "likes_count.desc,created_at.desc" : "created_at.desc";
  const ownerFilter = options.sort === "mine" && options.ownerId ? `&owner_id=eq.${encodeURIComponent(options.ownerId)}` : "";
  const { ok, rows: rows2 } = await rest5(
    `projects?is_deleted=eq.false${ownerFilter}&select=${PROJECT_FIELDS}&order=${order}&limit=${options.limit}`
  );
  return ok ? rows2 : [];
}
async function projectOfTheWeek() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1e3).toISOString();
  const { ok, rows: rows2 } = await rest5(
    `project_likes?created_at=gte.${encodeURIComponent(since)}&select=project_id&limit=5000`
  );
  if (!ok || rows2.length === 0) return null;
  const tally = /* @__PURE__ */ new Map();
  for (const row of rows2) {
    const id = String(row.project_id);
    tally.set(id, (tally.get(id) || 0) + 1);
  }
  const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  for (const [id, weeklyLikes] of ranked) {
    const project = await findProjectById(id);
    if (project) return { project, weeklyLikes };
  }
  return null;
}
async function allTimeTop() {
  const rows2 = await listProjects({ sort: "top", limit: 1 });
  return rows2.length && Number(rows2[0].likes_count) > 0 ? rows2[0] : null;
}
async function notifyFollowers(project, commit, followerIds) {
  const recipients = followerIds.filter((id) => id && id !== project.owner_id);
  if (recipients.length === 0) return 0;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const rows2 = recipients.map((recipientId) => ({
    id: `ntf_${import_node_crypto5.default.randomBytes(9).toString("hex")}`,
    recipient_id: recipientId,
    type: "project_commit",
    actor: {
      username: project.owner_username,
      display_name: project.owner_username,
      avatar_url: ""
    },
    content: `"${project.name}" projesine yeni commit: ${commit.message}`,
    target_id: project.id,
    is_read: false,
    created_at: now
  }));
  const { ok } = await rest5("notifications", { method: "POST", body: JSON.stringify(rows2) });
  return ok ? rows2.length : 0;
}
async function runCommitWatch(options = {}) {
  const budgetMs = options.budgetMs === void 0 ? 2e4 : Math.max(1e3, options.budgetMs);
  const maxProjects = options.maxProjects === void 0 ? 25 : Math.max(1, options.maxProjects);
  const deadline = Date.now() + budgetMs;
  const result = { checked: 0, newCommits: 0, notified: 0, failed: 0, timedOut: false };
  const { ok, rows: rows2 } = await rest5(
    `projects?is_deleted=eq.false&repo_full_name=not.is.null&select=${PROJECT_FIELDS}&order=last_checked_at.asc.nullsfirst&limit=${maxProjects}`
  );
  if (!ok) return result;
  for (const project of rows2) {
    if (Date.now() >= deadline) {
      result.timedOut = true;
      break;
    }
    const branch = project.repo_default_branch || "main";
    const commit = await readLatestCommit(project.repo_full_name, branch);
    result.checked++;
    if (!commit) {
      result.failed++;
      await updateProject(project.id, {
        last_checked_at: (/* @__PURE__ */ new Date()).toISOString(),
        check_failures: Number(project.check_failures || 0) + 1
      });
      continue;
    }
    const isNew = commit.sha !== project.last_commit_sha;
    const firstEverCheck = !project.last_commit_sha;
    if (isNew && !firstEverCheck) {
      const followers = await readFollowerIds(project.id);
      result.notified += await notifyFollowers(project, commit, followers);
      result.newCommits++;
    }
    await updateProject(project.id, {
      last_commit_sha: commit.sha,
      last_commit_at: commit.committedAt,
      last_checked_at: (/* @__PURE__ */ new Date()).toISOString(),
      check_failures: 0
    });
  }
  return result;
}

// src/server/communityProjects.ts
init_security();
var SUPABASE_URL2 = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
var SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
function adminHeaders6(extra = {}) {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
    ...extra
  };
}
async function rest6(pathAndQuery, init = {}) {
  const response = await safeFetch(`${SUPABASE_URL2}/rest/v1/${pathAndQuery}`, {
    method: init.method || "GET",
    headers: adminHeaders6(init.headers),
    body: init.body,
    timeoutMs: 15e3,
    maxResponseBytes: 4 * 1024 * 1024
  });
  let rows2 = [];
  if (response.text) {
    try {
      const parsed = JSON.parse(response.text);
      rows2 = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      rows2 = [];
    }
  }
  return { ok: response.ok, status: response.status, rows: rows2 };
}
function communityProjectsConfigured() {
  return Boolean(SUPABASE_URL2 && SERVICE_KEY);
}
async function isMemberOf(userId, communityId) {
  if (!userId || !communityId) return false;
  const { ok, rows: rows2 } = await rest6(
    `profiles?id=eq.${encodeURIComponent(userId)}&select=joined_communities&limit=1`
  );
  if (!ok || !rows2[0]) return false;
  const raw = rows2[0].joined_communities;
  const list = Array.isArray(raw) ? raw : [];
  return list.map(String).includes(communityId);
}
function isCommunityOwner(community, userId, username) {
  if (!userId) return false;
  if (community.created_by && String(community.created_by) === userId) return true;
  if (username && community.creator_username) {
    return String(community.creator_username).toLowerCase() === username.toLowerCase();
  }
  return false;
}
async function canSeeCommunity(community, userId, isAdmin) {
  if (!community.is_private) return true;
  if (isAdmin) return true;
  if (!userId) return false;
  return isMemberOf(userId, community.id);
}
async function listCommunityProjectLinks(communityId, limit) {
  const { ok, rows: rows2 } = await rest6(
    `community_projects?community_id=eq.${encodeURIComponent(communityId)}&select=project_id,added_by,added_by_username,created_at&order=created_at.desc&limit=${limit}`
  );
  return ok ? rows2 : [];
}
async function listProjectCommunityIds(projectId) {
  const { ok, rows: rows2 } = await rest6(
    `community_projects?project_id=eq.${encodeURIComponent(projectId)}&select=community_id`
  );
  return ok ? rows2.map((r) => String(r.community_id)) : [];
}
async function linkExists(communityId, projectId) {
  const { ok, rows: rows2 } = await rest6(
    `community_projects?community_id=eq.${encodeURIComponent(communityId)}&project_id=eq.${encodeURIComponent(projectId)}&select=project_id&limit=1`
  );
  return ok && rows2.length > 0;
}
async function addProjectToCommunity(communityId, projectId, addedBy, addedByUsername) {
  const { ok } = await rest6("community_projects", {
    method: "POST",
    // Aynı bağ ikinci kez gönderildiğinde hata değil sessiz geçiş: kullanıcı iki kez
    // tıkladığında ekrana hata basmanın bir anlamı yok, sonuç zaten istenen durum.
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify([
      {
        community_id: communityId,
        project_id: projectId,
        added_by: addedBy,
        added_by_username: addedByUsername || null
      }
    ])
  });
  return ok;
}
async function removeProjectFromCommunity(communityId, projectId) {
  const { ok } = await rest6(
    `community_projects?community_id=eq.${encodeURIComponent(communityId)}&project_id=eq.${encodeURIComponent(projectId)}`,
    { method: "DELETE", headers: { Prefer: "return=minimal" } }
  );
  return ok;
}

// server.ts
function guardHandler(fn) {
  if (typeof fn !== "function" || fn.length >= 4) return fn;
  return function guarded(req, res, next) {
    let out;
    try {
      out = fn.call(this, req, res, next);
    } catch (err) {
      next(err);
      return;
    }
    if (out && typeof out.then === "function") {
      out.catch(next);
    }
    return out;
  };
}
function installAsyncGuard(target) {
  for (const method of ["get", "post", "put", "patch", "delete", "all", "use"]) {
    const original = target[method].bind(target);
    target[method] = (...args) => original(...args.map((a) => guardHandler(a)));
  }
}
var app = (0, import_express.default)();
installAsyncGuard(app);
var PORT = Number(env("PORT", "3000"));
var IS_PRODUCTION = process.env.NODE_ENV === "production";
app.set("trust proxy", env("TRUST_PROXY", IS_PRODUCTION ? "1" : "loopback"));
app.disable("x-powered-by");
app.use(
  import_express.default.json({
    limit: "256kb",
    verify: (req, _res, buf) => {
      req.rawBody = Buffer.from(buf);
    }
  })
);
var CSP_DIRECTIVES = [
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
].join("; ");
app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", CSP_DIRECTIVES);
  if (IS_PRODUCTION) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=(), usb=(), interest-cohort=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  next();
});
app.use("/api", attachOptionalAuth);
app.use("/api", rateLimit({ scope: "api", windowMs: 6e4, max: 120 }));
app.get("/api/health", (_req, res) => {
  res.json({
    status: "healthy",
    platform: "Code4Ever",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    auth: supabaseConfigured() ? "supabase" : "unconfigured",
    webhooks_supported: true,
    rate_limiter: "sliding_window_active"
  });
});
var DISCORD_HOSTS = ["discord.com", "discordapp.com", "ptb.discord.com", "canary.discord.com"];
var TELEGRAM_HOSTS = ["api.telegram.org"];
var JUBBIO_HOSTS = env("JUBBIO_ALLOWED_HOSTS", "jubbio.com,*.jubbio.com").split(",").map((host) => host.trim()).filter(Boolean);
var MAX_WEBHOOK_MESSAGE_LENGTH = 3500;
async function sendDiscordWebhook(webhookUrl, message, botName, avatarUrl) {
  const payload = {
    content: message,
    username: asString(botName, 80) || "Code4Ever Bot",
    avatar_url: asString(avatarUrl, 500) || void 0
  };
  const response = await safeFetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    allowedHosts: DISCORD_HOSTS,
    timeoutMs: 12e3
  });
  if (!response.ok) {
    throw new Error(`Discord Webhook hatas\u0131 (${response.status}): ${response.text || response.statusText}`);
  }
  return true;
}
async function sendJubbioWebhook(config, message) {
  const cleanUrl = asString(config.webhook_url, 500);
  const cleanToken = asString(config.bot_token, 300);
  const cleanChannelId = asString(config.channel_id, 100).replace(/[^a-zA-Z0-9_-]/g, "");
  if (cleanUrl) {
    const response = await safeFetch(cleanUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Code4Ever-Webhook/1.0",
        Accept: "application/json, text/plain, */*"
      },
      body: JSON.stringify({
        content: message,
        text: message,
        message,
        username: "Code4Ever Bot",
        name: "Code4Ever Bot",
        platform: "Code4Ever"
      }),
      allowedHosts: JUBBIO_HOSTS,
      timeoutMs: 12e3
    });
    if (!response.ok) {
      throw new Error(`Jubbio Webhook hatas\u0131 (${response.status}): ${response.text || response.statusText || "Bilinmeyen yan\u0131t"}`);
    }
    return true;
  }
  if (cleanToken && cleanChannelId) {
    const response = await safeFetch(`https://jubbio.com/api/v1/channels/${encodeURIComponent(cleanChannelId)}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bot ${cleanToken.replace(/^Bot\s+/i, "")}`,
        "User-Agent": "Code4Ever-Webhook/1.0",
        Accept: "application/json, text/plain, */*"
      },
      body: JSON.stringify({ content: message, message }),
      allowedHosts: JUBBIO_HOSTS,
      timeoutMs: 12e3
    });
    if (!response.ok) {
      throw new Error(`Jubbio Bot API hatas\u0131 (${response.status}): ${response.text || response.statusText || "Bilinmeyen yan\u0131t"}`);
    }
    return true;
  }
  throw new Error("Jubbio i\xE7in l\xFCtfen ge\xE7erli bir Webhook URL veya Bot Token + Kanal ID girin.");
}
async function sendTelegramWebhook(botToken, chatId, message) {
  const cleanToken = asString(botToken, 200).replace(/^bot/i, "");
  const cleanChatId = asString(chatId, 100);
  if (!/^[A-Za-z0-9:_-]+$/.test(cleanToken)) {
    throw new Error("Ge\xE7ersiz Telegram Bot Token bi\xE7imi.");
  }
  const url = `https://api.telegram.org/bot${cleanToken}/sendMessage`;
  let response = await safeFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: cleanChatId,
      text: message,
      parse_mode: "Markdown",
      disable_web_page_preview: false
    }),
    allowedHosts: TELEGRAM_HOSTS,
    timeoutMs: 12e3
  });
  if (!response.ok) {
    response = await safeFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: cleanChatId,
        text: message.replace(/[*_`[\]()]/g, ""),
        disable_web_page_preview: false
      }),
      allowedHosts: TELEGRAM_HOSTS,
      timeoutMs: 12e3
    });
  }
  if (!response.ok) {
    let description = "";
    try {
      description = JSON.parse(response.text || "{}").description || "";
    } catch {
    }
    throw new Error(`Telegram API hatas\u0131 (${response.status}): ${description || "Ge\xE7ersiz Bot Token veya Chat ID"}`);
  }
  return true;
}
var MAX_TRACKED_DELETIONS = 5e3;
var globalDeletedPostIds = /* @__PURE__ */ new Set();
function trackDeletedPost(postId) {
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
app.get("/api/posts/deleted", (_req, res) => {
  res.json({ success: true, deleted_ids: Array.from(globalDeletedPostIds) });
});
app.post(
  "/api/posts/delete",
  requireAuth,
  rateLimit({ scope: "post-delete", windowMs: 6e4, max: 30, perUser: true }),
  async (req, res) => {
    const postId = asString(req.body?.postId, 120);
    if (!postId) {
      res.status(400).json({ success: false, error: "postId gereklidir." });
      return;
    }
    const accessToken = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    let supabaseDeleted = false;
    let supabaseError = null;
    if (SUPABASE_URL && SUPABASE_ANON_KEY && accessToken) {
      const endpoint = `${SUPABASE_URL}/rest/v1/posts?id=eq.${encodeURIComponent(postId)}`;
      const headers = {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      };
      try {
        const deleteRes = await safeFetch(endpoint, {
          method: "DELETE",
          headers: { ...headers, Prefer: "return=representation" },
          timeoutMs: 1e4
        });
        if (deleteRes.ok) {
          supabaseDeleted = true;
        } else {
          const patchRes = await safeFetch(endpoint, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ is_deleted: true, content: "[DELETED]" }),
            timeoutMs: 1e4
          });
          if (patchRes.ok) {
            supabaseDeleted = true;
          } else {
            supabaseError = "Bu g\xF6nderiyi silme yetkiniz yok.";
          }
        }
      } catch (err) {
        supabaseError = err?.message || "Network error";
      }
    } else {
      supabaseError = "Supabase yap\u0131land\u0131r\u0131lmam\u0131\u015F.";
    }
    if (!supabaseDeleted) {
      res.status(403).json({ success: false, postId, error: supabaseError || "Silme i\u015Flemi reddedildi." });
      return;
    }
    trackDeletedPost(postId);
    res.json({
      success: true,
      postId,
      supabaseDeleted,
      message: "G\xF6nderi ba\u015Far\u0131yla silindi ve t\xFCm cihazlarda senkronize edildi."
    });
  }
);
function publicCommunityShape(c) {
  return {
    id: c.id,
    name: c.name,
    handle: c.handle,
    description: c.description,
    members_count: c.members_count ?? 0,
    posts_url: `/api/v1/communities/${encodeURIComponent(c.handle)}/posts`
  };
}
function apiKeysUnavailable(res) {
  if (serviceRoleConfigured()) return false;
  res.status(503).json({
    success: false,
    error: "Topluluk API sunucu taraf\u0131nda yap\u0131land\u0131r\u0131lmam\u0131\u015F (SUPABASE_SERVICE_ROLE_KEY eksik). / Community API is not configured on this deployment."
  });
  return true;
}
app.get(["/api/v1/communities", "/api/communities"], async (_req, res) => {
  const communities = serviceRoleConfigured() ? await listPublicCommunities(50) : [];
  res.json({
    success: true,
    api_version: "v1",
    documentation: "/dev/docs",
    endpoints: {
      list_communities: "GET /api/v1/communities",
      get_community: "GET /api/v1/communities/:handle",
      list_posts: "GET /api/v1/communities/:handle/posts?limit=50",
      publish_post: "POST /api/v1/communities/:handle/posts  (X-API-Key required)",
      list_keys: "GET /api/v1/communities/:handle/keys  (session required, founder only)",
      create_key: "POST /api/v1/communities/:handle/keys  (session required, founder only)",
      revoke_key: "DELETE /api/v1/communities/:handle/keys/:keyId  (session required, founder only)"
    },
    limits: {
      content_max_chars: LIMITS.content,
      code_snippet_max_chars: LIMITS.codeSnippet,
      publish_requests_per_minute: 30,
      active_keys_per_community: LIMITS.maxActiveKeysPerCommunity
    },
    payload_example: {
      content: "Performansl\u0131 debounce hook \xF6rne\u011Fi",
      code_snippet: "export const sum = (a: number, b: number) => a + b;",
      code_language: "typescript",
      category: "frontend",
      author_name: "CI Bot"
    },
    count: communities.length,
    communities: communities.map(publicCommunityShape)
  });
});
app.get(
  ["/api/v1/communities/:handle", "/api/communities/:handle"],
  rateLimit({ scope: "community-read", windowMs: 6e4, max: 60 }),
  async (req, res) => {
    if (apiKeysUnavailable(res)) return;
    const community = await findCommunityByHandle(String(req.params.handle || ""));
    if (!community) {
      res.status(404).json({ success: false, error: "Topluluk bulunamad\u0131. / Community not found." });
      return;
    }
    if (community.is_private) {
      res.status(404).json({ success: false, error: "Topluluk bulunamad\u0131. / Community not found." });
      return;
    }
    res.json({ success: true, community: publicCommunityShape(community) });
  }
);
app.get(
  ["/api/v1/communities/:handle/posts", "/api/communities/:handle/posts"],
  rateLimit({ scope: "community-posts", windowMs: 6e4, max: 60 }),
  async (req, res) => {
    if (apiKeysUnavailable(res)) return;
    const community = await findCommunityByHandle(String(req.params.handle || ""));
    if (!community || community.is_private) {
      res.status(404).json({ success: false, error: "Topluluk bulunamad\u0131. / Community not found." });
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
app.post(
  [
    "/api/v1/communities/:handle/posts",
    "/api/communities/:handle/posts",
    "/api/v1/community/post",
    "/api/v1/community/publish",
    "/api/community/post"
  ],
  rateLimit({ scope: "community-publish", windowMs: 6e4, max: 30 }),
  async (req, res) => {
    if (apiKeysUnavailable(res)) return;
    const body = isPlainObject(req.body) ? req.body : {};
    const presentedKey = extractApiKey({ headers: req.headers, body });
    if (!presentedKey) {
      res.status(401).json({
        success: false,
        error: "API anahtar\u0131 eksik. `X-API-Key` ba\u015Fl\u0131\u011F\u0131n\u0131 g\xF6nderin. / Missing API key: send the `X-API-Key` header.",
        documentation: "/dev/docs"
      });
      return;
    }
    const keyRow = await resolveApiKey(presentedKey);
    if (!keyRow) {
      res.status(401).json({
        success: false,
        error: "API anahtar\u0131 ge\xE7ersiz veya iptal edilmi\u015F. / API key is invalid or revoked."
      });
      return;
    }
    if (!keyRow.scopes?.includes("posts:write")) {
      res.status(403).json({
        success: false,
        error: "Bu anahtar `posts:write` yetkisine sahip de\u011Fil. / This key lacks the `posts:write` scope."
      });
      return;
    }
    const community = await findCommunityById(keyRow.community_id);
    if (!community) {
      res.status(404).json({ success: false, error: "Topluluk bulunamad\u0131. / Community not found." });
      return;
    }
    const routeHandle = String(req.params.handle || body.community_handle || "").replace(/^@/, "").toLowerCase();
    const keyHandle = community.handle.replace(/^@/, "").toLowerCase();
    if (routeHandle && routeHandle !== keyHandle) {
      res.status(403).json({
        success: false,
        error: `Bu anahtar yaln\u0131zca @${keyHandle} toplulu\u011Funda ge\xE7erli. / This key is only valid for @${keyHandle}.`
      });
      return;
    }
    const validation = validatePostPayload(body);
    if (!validation.ok || !validation.value) {
      res.status(422).json({ success: false, field: validation.field, error: validation.error });
      return;
    }
    const payload = validation.value;
    const authorUsername = normalizeUsername(asString(body.author_username ?? body.authorUsername)) || keyRow.created_by_username || "api";
    const post = await insertCommunityPost({
      id: `post_api_${Date.now()}_${import_node_crypto6.default.randomBytes(6).toString("hex")}`,
      author: {
        username: authorUsername,
        display_name: payload.authorName,
        avatar_url: "",
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
        error: "G\xF6nderi veritaban\u0131na yaz\u0131lamad\u0131. / Could not write the post to the database."
      });
      return;
    }
    void touchApiKey(keyRow);
    res.status(201).json({
      success: true,
      message: `G\xF6nderi ${community.handle} toplulu\u011Funa iletildi. / Post published to ${community.handle}.`,
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
async function requireCommunityOwner(req, res) {
  if (apiKeysUnavailable(res)) return null;
  const community = await findCommunityByHandle(String(req.params.handle || ""));
  if (!community) {
    res.status(404).json({ success: false, error: "Topluluk bulunamad\u0131. / Community not found." });
    return null;
  }
  if (!canManageCommunity(community, req.auth)) {
    res.status(403).json({
      success: false,
      error: "Yaln\u0131zca toplulu\u011Fun kurucusu API anahtar\u0131 y\xF6netebilir. / Only the community founder can manage API keys."
    });
    return null;
  }
  return community;
}
app.get(
  "/api/v1/communities/:handle/keys",
  requireAuth,
  rateLimit({ scope: "community-keys-read", windowMs: 6e4, max: 60, perUser: true }),
  async (req, res) => {
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
  "/api/v1/communities/:handle/keys",
  requireAuth,
  rateLimit({ scope: "community-keys-create", windowMs: 6e4, max: 10, perUser: true }),
  async (req, res) => {
    const community = await requireCommunityOwner(req, res);
    if (!community) return;
    const active = await countActiveKeys(community.id);
    if (active >= LIMITS.maxActiveKeysPerCommunity) {
      res.status(409).json({
        success: false,
        error: `Bir toplulukta en fazla ${LIMITS.maxActiveKeysPerCommunity} etkin anahtar olabilir. \xD6nce birini iptal edin. / At most ${LIMITS.maxActiveKeysPerCommunity} active keys per community; revoke one first.`
      });
      return;
    }
    const body = isPlainObject(req.body) ? req.body : {};
    const name = sanitizeText(body.name, LIMITS.keyName) || "default";
    const generated = generateApiKey();
    const row = await insertKey({
      id: `cak_${Date.now()}_${import_node_crypto6.default.randomBytes(6).toString("hex")}`,
      community_id: community.id,
      community_handle: community.handle,
      name,
      key_prefix: generated.prefix,
      key_hash: generated.hash,
      scopes: ["posts:write"],
      created_by: req.auth?.userId || null,
      created_by_username: req.auth?.username || null
    });
    if (!row) {
      res.status(502).json({
        success: false,
        error: "Anahtar olu\u015Fturulamad\u0131. / Could not create the key."
      });
      return;
    }
    res.status(201).json({
      success: true,
      // The ONLY time the plaintext is ever transmitted.
      api_key: generated.plaintext,
      warning: "Bu anahtar bir daha g\xF6sterilmeyecek. \u015Eimdi kaydedin. / This key will not be shown again. Store it now.",
      key: toPublicKey(row)
    });
  }
);
app.delete(
  "/api/v1/communities/:handle/keys/:keyId",
  requireAuth,
  rateLimit({ scope: "community-keys-revoke", windowMs: 6e4, max: 20, perUser: true }),
  async (req, res) => {
    const community = await requireCommunityOwner(req, res);
    if (!community) return;
    const keyId = asString(req.params.keyId);
    if (!/^cak_[A-Za-z0-9_]+$/.test(keyId)) {
      res.status(400).json({ success: false, error: "Ge\xE7ersiz anahtar kimli\u011Fi. / Invalid key id." });
      return;
    }
    const revoked = await revokeKey(keyId, community.id);
    if (!revoked) {
      res.status(404).json({ success: false, error: "Anahtar bulunamad\u0131. / Key not found." });
      return;
    }
    res.json({ success: true, message: "Anahtar iptal edildi. / Key revoked." });
  }
);
app.post(
  "/api/integrations/webhook/test",
  requireAuth,
  rateLimit({ scope: "webhook-test", windowMs: 6e4, max: 10, perUser: true }),
  async (req, res) => {
    const platform = asString(req.body?.platform, 20).toLowerCase();
    const message = asString(req.body?.message, MAX_WEBHOOK_MESSAGE_LENGTH);
    const config = isPlainObject(req.body?.config) ? req.body.config : {};
    if (!platform || !message) {
      res.status(400).json({ success: false, error: "Platform ve mesaj parametresi zorunludur." });
      return;
    }
    try {
      if (platform === "discord") {
        if (!config.webhook_url) {
          res.status(400).json({ success: false, error: "L\xFCtfen ge\xE7erli bir Discord Webhook URL adresi girin." });
          return;
        }
        await sendDiscordWebhook(config.webhook_url, message, config.bot_name, config.avatar_url);
        res.json({ success: true, platform, message: "Discord test mesaj\u0131 ba\u015Far\u0131yla g\xF6nderildi!" });
        return;
      }
      if (platform === "jubbio") {
        await sendJubbioWebhook(config, message);
        res.json({ success: true, platform, message: "Jubbio test mesaj\u0131 ba\u015Far\u0131yla iletildi!" });
        return;
      }
      if (platform === "telegram") {
        if (!config.bot_token || !config.chat_id) {
          res.status(400).json({ success: false, error: "L\xFCtfen Telegram Bot Token ve Chat ID bilgilerini eksiksiz girin." });
          return;
        }
        await sendTelegramWebhook(config.bot_token, config.chat_id, message);
        res.json({ success: true, platform, message: "Telegram test bildirimi ba\u015Far\u0131yla g\xF6nderildi!" });
        return;
      }
      res.status(400).json({ success: false, error: "Desteklenmeyen platform tipi." });
    } catch (err) {
      res.status(502).json({ success: false, error: err?.message || "Webhook g\xF6nderilirken beklenmeyen bir hata olu\u015Ftu." });
    }
  }
);
app.post(
  "/api/integrations/webhook/send",
  requireAuth,
  rateLimit({ scope: "webhook-send", windowMs: 6e4, max: 20, perUser: true }),
  async (req, res) => {
    const settings = isPlainObject(req.body?.settings) ? req.body.settings : null;
    const message = asString(req.body?.message, MAX_WEBHOOK_MESSAGE_LENGTH);
    if (!settings || !message) {
      res.status(400).json({ success: false, error: "Eksik parametreler." });
      return;
    }
    const results = [];
    if (settings.discord?.enabled && settings.discord?.webhook_url) {
      try {
        await sendDiscordWebhook(settings.discord.webhook_url, message, settings.discord.bot_name, settings.discord.avatar_url);
        results.push({ platform: "discord", success: true });
      } catch (e) {
        results.push({ platform: "discord", success: false, error: e?.message });
      }
    }
    if (settings.jubbio?.enabled && (settings.jubbio?.webhook_url || settings.jubbio?.bot_token && settings.jubbio?.channel_id)) {
      try {
        await sendJubbioWebhook(settings.jubbio, message);
        results.push({ platform: "jubbio", success: true });
      } catch (e) {
        results.push({ platform: "jubbio", success: false, error: e?.message });
      }
    }
    if (settings.telegram?.enabled && settings.telegram?.bot_token && settings.telegram?.chat_id) {
      try {
        await sendTelegramWebhook(settings.telegram.bot_token, settings.telegram.chat_id, message);
        results.push({ platform: "telegram", success: true });
      } catch (e) {
        results.push({ platform: "telegram", success: false, error: e?.message });
      }
    }
    res.json({ success: true, results });
  }
);
function appOrigin() {
  const configured = env("APP_URL");
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
    }
  }
  return `http://localhost:${PORT}`;
}
app.get("/api/auth/github/url", rateLimit({ scope: "oauth-url", windowMs: 6e4, max: 30 }), (_req, res) => {
  const clientId = env("GITHUB_CLIENT_ID");
  if (!clientId) {
    res.status(503).json({ error: "GitHub OAuth yap\u0131land\u0131r\u0131lmam\u0131\u015F (GITHUB_CLIENT_ID eksik)." });
    return;
  }
  const redirectUri = `${appOrigin()}/api/auth/github/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    // Least privilege: repository *write* access is never needed to list public repos.
    scope: "read:user user:email public_repo",
    // Signed, expiring state so the callback can detect CSRF / replayed authorizations.
    state: createSignedState()
  });
  res.json({ url: `https://github.com/login/oauth/authorize?${params.toString()}`, redirect_uri: redirectUri });
});
app.get(
  ["/api/auth/github/callback", "/api/auth/github/callback/"],
  rateLimit({ scope: "oauth-callback", windowMs: 6e4, max: 30 }),
  async (req, res) => {
    const code = asString(req.query.code, 200);
    const state = asString(req.query.state, 200);
    const clientId = env("GITHUB_CLIENT_ID");
    const clientSecret = env("GITHUB_CLIENT_SECRET");
    const renderBridge = (payload) => {
      const targetOrigin = appOrigin();
      res.setHeader("Content-Type", "text/html; charset=utf-8");
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
      <h2>${payload.ok ? "Code4Ever GitHub E\u015Fle\u015Fmesi Ba\u015Far\u0131l\u0131!" : "GitHub Ba\u011Flant\u0131s\u0131 Tamamlanamad\u0131"}</h2>
      <p>${escapeHtml(payload.ok ? "Y\xF6nlendiriliyorsunuz..." : payload.error || "L\xFCtfen tekrar deneyin.")}</p>
      <script>
        (function () {
          var payload = ${jsonForScript(payload)};
          if (window.opener) {
            // SECURITY: never postMessage to "*" \u2014 that hands the GitHub profile (and any
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
      renderBridge({ ok: false, error: "G\xFCvenlik do\u011Frulamas\u0131 ba\u015Far\u0131s\u0131z (ge\xE7ersiz veya s\xFCresi dolmu\u015F state)." });
      return;
    }
    if (!code || !clientId || !clientSecret) {
      renderBridge({ ok: false, error: "GitHub OAuth yap\u0131land\u0131rmas\u0131 eksik." });
      return;
    }
    try {
      const tokenRes = await safeFetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
        allowedHosts: ["github.com"],
        timeoutMs: 1e4
      });
      const tokenData = JSON.parse(tokenRes.text || "{}");
      if (!tokenData.access_token) {
        renderBridge({ ok: false, error: "GitHub yetkilendirme kodu do\u011Frulanamad\u0131." });
        return;
      }
      const userRes = await safeFetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "User-Agent": "Code4Ever-Platform",
          Accept: "application/vnd.github+json"
        },
        allowedHosts: ["api.github.com"],
        timeoutMs: 1e4
      });
      const githubUser = JSON.parse(userRes.text || "{}");
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
    } catch (err) {
      console.error("GitHub token exchange error:", err?.message);
      renderBridge({ ok: false, error: "GitHub ile ileti\u015Fim kurulamad\u0131." });
    }
  }
);
app.get("/api/github/repos", rateLimit({ scope: "github-repos", windowMs: 6e4, max: 30 }), async (req, res) => {
  const username = asString(req.query.username, 40) || "octocat";
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(username)) {
    res.status(400).json({ error: "Ge\xE7ersiz GitHub kullan\u0131c\u0131 ad\u0131." });
    return;
  }
  try {
    const perPage = Math.min(Math.max(Number(req.query.per_page) || 15, 1), 100);
    const response = await safeFetch(
      `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=${perPage}`,
      {
        headers: { "User-Agent": "Code4Ever-Platform", Accept: "application/vnd.github+json" },
        allowedHosts: ["api.github.com"],
        timeoutMs: 1e4,
        maxResponseBytes: 512 * 1024
      }
    );
    if (!response.ok) {
      res.status(response.status === 404 ? 404 : 502).json({ error: "GitHub kullan\u0131c\u0131s\u0131 veya depolar\u0131 bulunamad\u0131." });
      return;
    }
    res.json({ success: true, username, repos: JSON.parse(response.text || "[]") });
  } catch {
    res.status(502).json({ error: "GitHub sunucusuna ba\u011Flan\u0131rken hata olu\u015Ftu." });
  }
});
var MAX_CHAT_MESSAGES = 20;
var MAX_CHAT_CHARS = 6e3;
app.post(
  "/api/everychat",
  requireAuth,
  rateLimit({ scope: "everychat", windowMs: 5 * 6e4, max: 25, perUser: true }),
  async (req, res) => {
    const groqKey = env("GROQ_API_KEY");
    if (!groqKey) {
      res.status(503).json({ error: "Groq API Key hen\xFCz ayarlanmam\u0131\u015F. L\xFCtfen sunucunuza GROQ_API_KEY ekleyin." });
      return;
    }
    const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    if (rawMessages.length === 0) {
      res.status(400).json({ error: "Ge\xE7erli bir sohbet mesaj listesi gerekli." });
      return;
    }
    const messages = rawMessages.slice(-MAX_CHAT_MESSAGES).filter((entry) => isPlainObject(entry) && typeof entry.content === "string").map((entry) => ({
      role: ["user", "assistant"].includes(entry.role) ? entry.role : "user",
      content: asString(entry.content, 4e3)
    })).filter((entry) => entry.content.length > 0);
    const totalChars = messages.reduce((sum, entry) => sum + entry.content.length, 0);
    if (messages.length === 0 || totalChars > MAX_CHAT_CHARS) {
      res.status(400).json({ error: "Sohbet i\xE7eri\u011Fi \xE7ok uzun veya ge\xE7ersiz." });
      return;
    }
    try {
      const groqRes = await safeFetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
        body: JSON.stringify({
          model: env("GROQ_MODEL", "llama-3.3-70b-versatile"),
          messages: [
            {
              role: "system",
              content: 'Sen Code4Ever platformunun "EveryChat (Beta)" yapay zeka asistan\u0131s\u0131n. Yaz\u0131l\u0131m, mimari, kodlama ve teknoloji alanlar\u0131nda son derece uzman, nazik ve h\u0131zl\u0131 yan\u0131tlar verirsin.'
            },
            ...messages
          ],
          temperature: 0.7,
          max_tokens: 2048
        }),
        allowedHosts: ["api.groq.com"],
        timeoutMs: 45e3,
        maxResponseBytes: 256 * 1024
      });
      if (!groqRes.ok) {
        console.warn("Groq API error:", groqRes.status, groqRes.text.slice(0, 300));
        res.status(502).json({ error: `EveryChat sa\u011Flay\u0131c\u0131s\u0131 yan\u0131t veremedi (${groqRes.status}).` });
        return;
      }
      const data = JSON.parse(groqRes.text || "{}");
      res.json({ success: true, reply: data.choices?.[0]?.message?.content || "Yan\u0131t al\u0131namad\u0131.", model: data.model });
    } catch (err) {
      console.warn("EveryChat error:", err?.message);
      res.status(502).json({ error: "EveryChat sunucu hatas\u0131." });
    }
  }
);
app.post("/api/rate-limit-test", rateLimit({ scope: "rate-limit-test", windowMs: 6e4, max: 60 }), (req, res) => {
  res.json({ status: "allowed", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
});
app.post("/api/license/validate", rateLimit({ scope: "license", windowMs: 6e4, max: 20 }), (req, res) => {
  const licenseKey = asString(req.body?.licenseKey, 64);
  if (!licenseKey) {
    res.status(400).json({ valid: false, error: "License key string is required" });
    return;
  }
  if (!/^C4E-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(licenseKey)) {
    res.status(400).json({ valid: false, error: "Invalid license format" });
    return;
  }
  res.json({
    valid: true,
    tier: licenseKey.toUpperCase().includes("PRO") ? "Pro" : "Developer",
    rate_limit: licenseKey.toUpperCase().includes("PRO") ? 5e3 : 1e3,
    expires_at: "2027-12-31T23:59:59Z"
  });
});
var BYNOGAME_STREAM_ID = env("BYNOGAME_STREAM_ID", "5595ad22-dd5a-47c2-93ba-d7bf9a3f85ed");
var BYNOGAME_DONATE_URL = env("BYNOGAME_DONATE_URL", "https://donate.bynogame.com/nylithra");
var BYNOGAME_WEBHOOK_SECRET = env("BYNOGAME_WEBHOOK_SECRET");
var DATA_DIR = env(
  "DATA_DIR",
  // Serverless: everything outside /tmp is read-only and /tmp is wiped between invocations,
  // so the ledger degrades to a per-invocation cache rather than crashing on every write.
  isServerless() ? import_path.default.join(import_node_os.default.tmpdir(), "c4e-data") : import_path.default.join(process.cwd(), "data")
);
var BYNOGAME_DONATIONS_FILE = import_path.default.join(DATA_DIR, "bynogame_donations.json");
var MAX_DONATION_RECORDS = 5e3;
function loadByNoGameDonations() {
  try {
    if (import_fs.default.existsSync(BYNOGAME_DONATIONS_FILE)) {
      const parsed = JSON.parse(import_fs.default.readFileSync(BYNOGAME_DONATIONS_FILE, "utf-8"));
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (e) {
    console.error("ByNoGame donations load error:", e);
  }
  return [];
}
function saveByNoGameDonations(donations) {
  try {
    import_fs.default.mkdirSync(DATA_DIR, { recursive: true });
    const trimmed = donations.slice(0, MAX_DONATION_RECORDS);
    const tempFile = `${BYNOGAME_DONATIONS_FILE}.${process.pid}.tmp`;
    import_fs.default.writeFileSync(tempFile, JSON.stringify(trimmed, null, 2), { encoding: "utf-8", mode: 384 });
    import_fs.default.renameSync(tempFile, BYNOGAME_DONATIONS_FILE);
  } catch (e) {
    console.error("ByNoGame donations save error:", e);
  }
}
function publicDonationView(record) {
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
function resolveActingUsername(req, requested) {
  const sessionUsername = normalizeUsername(req.auth?.username);
  const requestedUsername = normalizeUsername(requested);
  if (req.auth?.isAdmin) {
    return requestedUsername || sessionUsername || null;
  }
  if (sessionUsername) {
    return sessionUsername;
  }
  return requestedUsername || null;
}
app.get("/api/bynogame/config", (_req, res) => {
  res.json({
    streamId: BYNOGAME_STREAM_ID,
    donateUrl: BYNOGAME_DONATE_URL,
    streamer: "nylithra",
    rewardRole: "Spark",
    rewardBadge: "Spark Destek\xE7i",
    storageMaxMB: 250
  });
});
app.post(
  "/api/bynogame/check-donation",
  requireAuth,
  rateLimit({ scope: "donation-check", windowMs: 6e4, max: 15, perUser: true }),
  async (req, res) => {
    const username = resolveActingUsername(req, req.body?.username);
    if (!username) {
      res.status(400).json({ success: false, error: "Kullan\u0131c\u0131 ad\u0131 belirlenemedi." });
      return;
    }
    const donations = loadByNoGameDonations();
    const matched = donations.find(
      (d) => d.streamId.toLowerCase() === BYNOGAME_STREAM_ID.toLowerCase() && d.verified === true && (d.usernameNormalized === username || d.username.trim().toLowerCase() === username)
    );
    if (matched) {
      if (!matched.claimedAt) {
        matched.claimedAt = (/* @__PURE__ */ new Date()).toISOString();
        saveByNoGameDonations(donations);
      }
      res.json({
        success: true,
        hasDonation: true,
        donation: publicDonationView(matched),
        streamId: BYNOGAME_STREAM_ID,
        message: "Ba\u011F\u0131\u015F\u0131n\u0131z do\u011Fruland\u0131! Spark Destek\xE7isi rozetiniz ve 250MB y\xFCkleme yetkiniz tan\u0131mland\u0131."
      });
      return;
    }
    res.json({
      success: true,
      hasDonation: false,
      streamId: BYNOGAME_STREAM_ID,
      username,
      message: `Hen\xFCz @${username} ad\u0131na do\u011Frulanm\u0131\u015F bir ba\u011F\u0131\u015F bulunamad\u0131. Ba\u011F\u0131\u015F yapt\u0131ysan\u0131z referans/i\u015Flem numaran\u0131z\u0131 girerek bildirimde bulunabilirsiniz.`
    });
  }
);
app.post(
  "/api/bynogame/claim-donation",
  requireAuth,
  rateLimit({ scope: "donation-claim", windowMs: 60 * 6e4, max: 5, perUser: true }),
  (req, res) => {
    const username = resolveActingUsername(req, req.body?.username);
    if (!username) {
      res.status(400).json({ success: false, error: "Kullan\u0131c\u0131 ad\u0131 belirlenemedi." });
      return;
    }
    const donations = loadByNoGameDonations();
    const referenceCode = asString(req.body?.reference_code, 120);
    const newRecord = {
      id: `bng_claim_${Date.now()}_${import_node_crypto6.default.randomBytes(3).toString("hex")}`,
      streamId: BYNOGAME_STREAM_ID,
      username,
      usernameNormalized: username,
      amount: asString(req.body?.amount, 40) || "Destek",
      currency: "TL",
      message: asString(req.body?.message, 400) || (referenceCode ? `Referans: ${referenceCode}` : "Ba\u011F\u0131\u015F Bildirimi"),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      // NEVER verified on creation: verification is an administrator decision.
      verified: false
    };
    donations.unshift(newRecord);
    saveByNoGameDonations(donations);
    res.json({ success: true, recorded: publicDonationView(newRecord) });
  }
);
app.post("/api/bynogame/approve-donation", requireAdmin, async (req, res) => {
  const claimId = asString(req.body?.claimId, 80);
  const username = normalizeUsername(req.body?.username);
  const adminUsername = normalizeUsername(req.auth?.username) || "admin";
  if (!claimId && !username) {
    res.status(400).json({ success: false, error: "claimId veya username gereklidir." });
    return;
  }
  const donations = loadByNoGameDonations();
  let matched = donations.find((d) => claimId && d.id === claimId || username && d.usernameNormalized === username);
  if (!matched && username) {
    matched = {
      id: `bng_manual_${Date.now()}`,
      streamId: BYNOGAME_STREAM_ID,
      username,
      usernameNormalized: username,
      amount: "Destek",
      currency: "TL",
      message: `Y\xF6netici (@${adminUsername}) taraf\u0131ndan onayland\u0131`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      verified: true,
      claimedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    donations.unshift(matched);
  } else if (matched) {
    matched.verified = true;
    matched.claimedAt = (/* @__PURE__ */ new Date()).toISOString();
  }
  if (!matched) {
    res.status(404).json({ success: false, error: "Ba\u011F\u0131\u015F kayd\u0131 bulunamad\u0131." });
    return;
  }
  saveByNoGameDonations(donations);
  const tierApplied = await setSupporterTier(matched.usernameNormalized, "spark");
  res.json({ success: true, approved: publicDonationView(matched), supporter_tier_applied: tierApplied });
});
app.post("/api/bynogame/webhook", rateLimit({ scope: "donation-webhook", windowMs: 6e4, max: 60 }), (req, res) => {
  if (!BYNOGAME_WEBHOOK_SECRET) {
    res.status(503).json({ error: "Webhook devre d\u0131\u015F\u0131: BYNOGAME_WEBHOOK_SECRET tan\u0131ml\u0131 de\u011Fil." });
    return;
  }
  const rawBody = req.rawBody;
  const signature = String(req.headers["x-c4e-signature"] || req.headers["x-signature"] || "").replace(/^sha256=/i, "");
  const expected = rawBody ? hmacHex(BYNOGAME_WEBHOOK_SECRET, rawBody.toString("utf8")) : "";
  if (!rawBody || !signature || !safeEquals(signature, expected)) {
    res.status(401).json({ error: "Ge\xE7ersiz webhook imzas\u0131." });
    return;
  }
  const payload = req.body || {};
  const donor = normalizeUsername(payload.username || payload.donor || payload.user_name || payload.name);
  if (!donor) {
    res.status(400).json({ error: "Donor username is required" });
    return;
  }
  const donations = loadByNoGameDonations();
  const newDonation = {
    id: `bng_${Date.now()}_${import_node_crypto6.default.randomBytes(3).toString("hex")}`,
    streamId: asString(payload.streamId || payload.stream_id, 80) || BYNOGAME_STREAM_ID,
    username: donor,
    usernameNormalized: donor,
    amount: asString(payload.amount ?? payload.total, 40) || "0",
    currency: asString(payload.currency, 10) || "TL",
    message: asString(payload.message ?? payload.note, 400),
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    verified: true
  };
  donations.unshift(newDonation);
  saveByNoGameDonations(donations);
  res.json({ success: true, recorded: publicDonationView(newDonation) });
});
app.post("/api/bynogame/register-donation", requireAdmin, (req, res) => {
  const username = normalizeUsername(req.body?.username);
  if (!username) {
    res.status(400).json({ error: "Username is required" });
    return;
  }
  const donations = loadByNoGameDonations();
  const record = {
    id: `bng_reg_${Date.now()}`,
    streamId: BYNOGAME_STREAM_ID,
    username,
    usernameNormalized: username,
    amount: asString(req.body?.amount, 40) || "Destek",
    currency: "TL",
    message: asString(req.body?.message, 400) || "ByNoGame Ba\u011F\u0131\u015F\u0131",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    verified: true
  };
  donations.unshift(record);
  saveByNoGameDonations(donations);
  res.json({ success: true, donation: publicDonationView(record) });
});
app.get("/api/bynogame/donations", requireAdmin, (_req, res) => {
  const donations = loadByNoGameDonations();
  res.json({
    streamId: BYNOGAME_STREAM_ID,
    total: donations.length,
    donations: donations.slice(0, 50).map(publicDonationView)
  });
});
async function setSupporterTier(username, tier) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return false;
  try {
    const response = await safeFetch(
      `${SUPABASE_URL}/rest/v1/profiles?username=eq.${encodeURIComponent(username)}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify({ supporter_tier: tier, updated_at: (/* @__PURE__ */ new Date()).toISOString() }),
        timeoutMs: 1e4
      }
    );
    return response.ok;
  } catch (err) {
    console.warn("setSupporterTier error:", err?.message);
    return false;
  }
}
app.post(
  "/api/bynogame/claim-perks",
  requireAuth,
  rateLimit({ scope: "donation-perks", windowMs: 6e4, max: 10, perUser: true }),
  async (req, res) => {
    const username = resolveActingUsername(req, req.body?.username);
    if (!username) {
      res.status(400).json({ success: false, message: "Kullan\u0131c\u0131 ad\u0131 belirlenemedi." });
      return;
    }
    const verified = req.auth?.isAdmin === true || loadByNoGameDonations().some((donation) => donation.verified === true && donation.usernameNormalized === username);
    if (!verified) {
      res.status(403).json({
        success: false,
        message: "Do\u011Frulanm\u0131\u015F bir ba\u011F\u0131\u015F kayd\u0131 bulunamad\u0131. Ba\u011F\u0131\u015F\u0131n\u0131z y\xF6netici onay\u0131ndan sonra otomatik tan\u0131mlan\u0131r."
      });
      return;
    }
    const applied = await setSupporterTier(username, "spark");
    if (!applied) {
      res.status(503).json({
        success: false,
        message: "Spark ayr\u0131cal\u0131klar\u0131 \u015Fu anda tan\u0131mlanamad\u0131 (SUPABASE_SERVICE_ROLE_KEY eksik). L\xFCtfen y\xF6neticiyle ileti\u015Fime ge\xE7in."
      });
      return;
    }
    res.json({ success: true, username, supporter_tier: "spark", message: "Spark Destek\xE7i ayr\u0131cal\u0131klar\u0131 tan\u0131mland\u0131!" });
  }
);
app.get("/api/bynogame/my-donations", requireAuth, (req, res) => {
  const username = resolveActingUsername(req, void 0);
  const donations = username ? loadByNoGameDonations().filter((d) => d.usernameNormalized === username) : [];
  res.json({ success: true, total: donations.length, donations: donations.slice(0, 50).map(publicDonationView) });
});
function safeMailbox(value) {
  const raw = asString(value, 80);
  return /^[A-Za-z0-9 _./-]{1,80}$/.test(raw) ? raw : "INBOX";
}
app.get("/api/admin/mail/status", requireAdmin, (_req, res) => {
  res.json({ success: true, ...describeMailConfig() });
});
app.post(
  "/api/admin/mail/verify",
  requireAdmin,
  rateLimit({ scope: "mail-verify", windowMs: 6e4, max: 6, perUser: true }),
  async (_req, res) => {
    const [smtp, imap] = await Promise.all([verifySmtp(), verifyImap()]);
    res.json({ success: true, smtp, imap });
  }
);
app.post(
  "/api/admin/mail/sync",
  requireAdmin,
  rateLimit({ scope: "mail-sync", windowMs: 6e4, max: 6, perUser: true }),
  async (req, res) => {
    if (!getImapConfig()) {
      res.status(503).json({
        success: false,
        error: imapUnavailableReason() || "IMAP kullan\u0131lam\u0131yor.",
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
    } catch (error) {
      res.status(502).json({
        success: false,
        error: `IMAP hatas\u0131: ${String(error?.message || error).slice(0, 300)}`
      });
    }
  }
);
app.delete(
  "/api/admin/mail/cache",
  requireAdmin,
  rateLimit({ scope: "mail-cache-clear", windowMs: 6e4, max: 10, perUser: true }),
  async (req, res) => {
    const mailbox = safeMailbox(req.query.mailbox);
    await clearMailbox(mailbox);
    res.json({ success: true, mailbox });
  }
);
app.get(
  "/api/admin/mail/inbox",
  requireAdmin,
  rateLimit({ scope: "mail-inbox", windowMs: 6e4, max: 30, perUser: true }),
  async (req, res) => {
    if (!getImapConfig()) {
      res.status(503).json({
        success: false,
        error: imapUnavailableReason() || "IMAP kullan\u0131lam\u0131yor.",
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
          source: "cache",
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
        source: "live",
        mode: imapMode(),
        count: messages.length,
        messages,
        lastSyncedAt: null,
        warning: storeWarning()
      });
    } catch (error) {
      res.status(502).json({ success: false, error: `IMAP hatas\u0131: ${String(error?.message || error).slice(0, 300)}` });
    }
  }
);
app.get(
  "/api/admin/mail/message/:uid",
  requireAdmin,
  rateLimit({ scope: "mail-message", windowMs: 6e4, max: 60, perUser: true }),
  async (req, res) => {
    if (!getImapConfig()) {
      res.status(503).json({
        success: false,
        error: imapUnavailableReason() || "IMAP kullan\u0131lam\u0131yor.",
        serverless: isServerless()
      });
      return;
    }
    const uid = Number(req.params.uid);
    if (!Number.isInteger(uid) || uid <= 0) {
      res.status(400).json({ success: false, error: "Ge\xE7ersiz mesaj kimli\u011Fi." });
      return;
    }
    try {
      const { message, source } = await readMessage(uid, safeMailbox(req.query.mailbox));
      if (!message) {
        res.status(404).json({ success: false, error: "Mesaj bulunamad\u0131." });
        return;
      }
      res.json({ success: true, source, message });
    } catch (error) {
      res.status(502).json({ success: false, error: `IMAP hatas\u0131: ${String(error?.message || error).slice(0, 300)}` });
    }
  }
);
app.get(
  "/api/admin/mail/resolve/:username",
  requireAdmin,
  rateLimit({ scope: "mail-resolve", windowMs: 6e4, max: 60, perUser: true }),
  async (req, res) => {
    const recipient = await resolveRecipientByUsername(asString(req.params.username, 40));
    if (!recipient) {
      res.status(404).json({
        success: false,
        error: "Bu kullan\u0131c\u0131 ad\u0131na ait bir e-posta adresi bulunamad\u0131."
      });
      return;
    }
    res.json({ success: true, recipient });
  }
);
app.post(
  "/api/admin/mail/send",
  requireAdmin,
  rateLimit({ scope: "mail-send", windowMs: 6e4, max: 20, perUser: true }),
  async (req, res) => {
    if (!getSmtpConfig()) {
      res.status(503).json({
        success: false,
        error: "SMTP yap\u0131land\u0131r\u0131lmam\u0131\u015F. MAIL_SMTP_HOST / MAIL_SMTP_USER / MAIL_SMTP_PASS tan\u0131mlay\u0131n."
      });
      return;
    }
    const body = isPlainObject(req.body) ? req.body : {};
    let toAddress = "";
    let recipientName = asString(body.recipient_name, 80);
    const username = asString(body.username, 40);
    if (username) {
      const recipient = await resolveRecipientByUsername(username);
      if (!recipient) {
        res.status(404).json({
          success: false,
          error: `"${username}" kullan\u0131c\u0131s\u0131na ait bir e-posta adresi bulunamad\u0131.`
        });
        return;
      }
      toAddress = recipient.email;
      recipientName = recipientName || recipient.displayName;
    } else {
      toAddress = asString(body.to, 254);
    }
    const subject = asString(body.subject, 180);
    const message = asString(body.body ?? body.message, 2e4);
    if (!subject.trim()) {
      res.status(422).json({ success: false, field: "subject", error: "Konu zorunludur." });
      return;
    }
    if (!message.trim()) {
      res.status(422).json({ success: false, field: "body", error: "Mesaj g\xF6vdesi zorunludur." });
      return;
    }
    let callToAction;
    const ctaLabel = asString(body.cta_label, 60);
    const ctaUrl = asString(body.cta_url, 500);
    if (ctaLabel || ctaUrl) {
      if (!ctaLabel || !ctaUrl) {
        res.status(422).json({
          success: false,
          field: "cta",
          error: "Buton i\xE7in hem etiket hem ba\u011Flant\u0131 gereklidir."
        });
        return;
      }
      if (!/^https?:\/\//i.test(ctaUrl)) {
        res.status(422).json({
          success: false,
          field: "cta_url",
          error: "Buton ba\u011Flant\u0131s\u0131 http:// veya https:// ile ba\u015Flamal\u0131d\u0131r."
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
      recipientName: recipientName || void 0,
      callToAction,
      footnote: asString(body.footnote, 300) || void 0
    });
    if (!result.ok) {
      res.status(502).json({ success: false, error: result.error });
      return;
    }
    res.json({
      success: true,
      message: `E-posta ${toAddress} adresine g\xF6nderildi.`,
      to: toAddress,
      messageId: result.messageId
    });
  }
);
app.post(
  "/api/admin/mail/preview",
  requireAdmin,
  rateLimit({ scope: "mail-preview", windowMs: 6e4, max: 60, perUser: true }),
  (req, res) => {
    const body = isPlainObject(req.body) ? req.body : {};
    const subject = asString(body.subject, 180) || "Konu";
    const text = asString(body.body ?? body.message, 2e4) || "Mesaj g\xF6vdesi burada g\xF6r\xFCn\xFCr.";
    const ctaLabel = asString(body.cta_label, 60);
    const ctaUrl = asString(body.cta_url, 500);
    const html = renderMailHtml({
      heading: asString(body.heading, 160) || subject,
      preheader: text.replace(/\s+/g, " ").slice(0, 120),
      paragraphs: text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean),
      recipientName: asString(body.recipient_name, 80) || void 0,
      callToAction: ctaLabel && /^https?:\/\//i.test(ctaUrl) ? { label: ctaLabel, url: ctaUrl } : void 0,
      footnote: asString(body.footnote, 300) || void 0,
      // The preview runs in the browser, where cid: cannot resolve; point at the served file.
      logoCid: "PREVIEW"
    }).replace('src="cid:PREVIEW"', 'src="/email-logo.png"');
    res.json({ success: true, html });
  }
);
app.all(
  "/api/notifications/email/dispatch",
  rateLimit({ scope: "notify-dispatch", windowMs: 6e4, max: 12 }),
  async (req, res) => {
    if (req.method !== "GET" && req.method !== "POST") {
      res.status(405).json({ success: false, error: "method_not_allowed" });
      return;
    }
    const bearer = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ""))?.[1] || "";
    const viaCron = cronSecretMatches(String(req.headers["x-cron-secret"] || "")) || cronSecretMatches(bearer);
    if (!viaCron) {
      await new Promise((resolve) => requireAdmin(req, res, () => resolve()));
      if (res.headersSent) return;
    }
    if (!dispatcherConfigured()) {
      res.status(503).json({
        success: false,
        error: "not_configured",
        message: "Bildirim e-postalar\u0131 i\xE7in SUPABASE_SERVICE_ROLE_KEY ve MAIL_SMTP_* de\u011Fi\u015Fkenleri gerekli."
      });
      return;
    }
    try {
      const result = await dispatchNotificationEmails({
        limit: Number(req.body?.limit) || void 0,
        dryRun: req.body?.dryRun === true
      });
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(502).json({
        success: false,
        error: `Da\u011F\u0131t\u0131m hatas\u0131: ${String(error?.message || error).slice(0, 300)}`
      });
    }
  }
);
app.all(
  "/api/email/unsubscribe",
  rateLimit({ scope: "notify-unsub", windowMs: 6e4, max: 30 }),
  async (req, res) => {
    if (req.method !== "GET" && req.method !== "POST") {
      res.status(405).json({ success: false, error: "method_not_allowed" });
      return;
    }
    const oneClick = req.method === "POST";
    const userId = verifyUnsubscribeToken(req.query.token);
    const page = (title, message) => `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#09090b;color:#fafafa;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:24px}.c{max-width:28rem;text-align:center}h1{font-size:1.25rem;margin:0 0 .75rem}p{color:#a1a1aa;line-height:1.6;font-size:.9rem;margin:0 0 1.5rem}a{display:inline-block;padding:.7rem 1.2rem;border-radius:.75rem;background:#4f46e5;color:#fff;text-decoration:none;font-weight:600;font-size:.85rem}</style></head><body><div class="c"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><a href="/settings">Bildirim Tercihleri</a></div></body></html>`;
    if (!userId) {
      if (oneClick) {
        res.status(400).json({ success: false, error: "invalid_token" });
        return;
      }
      res.status(400).type("html").send(
        page("Ba\u011Flant\u0131 ge\xE7ersiz", "Bu abonelikten \xE7\u0131kma ba\u011Flant\u0131s\u0131 ge\xE7ersiz veya eksik. Tercihlerini hesab\u0131ndan da kapatabilirsin.")
      );
      return;
    }
    const current = await readEmailPrefs(userId) || DEFAULT_EMAIL_PREFS;
    const ok = await writeEmailPrefs(userId, { ...current, enabled: false });
    if (oneClick) {
      res.status(ok ? 200 : 502).json({ success: ok });
      return;
    }
    res.status(ok ? 200 : 502).type("html").send(
      ok ? page("Bildirim e-postalar\u0131 kapat\u0131ld\u0131", "Bundan sonra Code4Ever sana bildirim e-postas\u0131 g\xF6ndermeyecek. \u0130stedi\u011Fin zaman ayarlardan yeniden a\xE7abilirsin.") : page("\u0130\u015Flem tamamlanamad\u0131", "Tercihin \u015Fu anda kaydedilemedi. L\xFCtfen biraz sonra tekrar dene veya ayarlardan kapat.")
    );
  }
);
app.get("/api/me/email-prefs", requireAuth, async (req, res) => {
  const userId = req.auth?.userId || "";
  const prefs = await readEmailPrefs(userId) || DEFAULT_EMAIL_PREFS;
  res.json({ success: true, prefs, defaults: DEFAULT_EMAIL_PREFS });
});
app.put(
  "/api/me/email-prefs",
  requireAuth,
  rateLimit({ scope: "email-prefs", windowMs: 6e4, max: 30, perUser: true }),
  async (req, res) => {
    const userId = req.auth?.userId || "";
    const prefs = sanitizeEmailPrefs(req.body);
    const ok = await writeEmailPrefs(userId, prefs);
    if (!ok) {
      res.status(502).json({ success: false, error: "save_failed", message: "Tercihler kaydedilemedi." });
      return;
    }
    res.json({ success: true, prefs });
  }
);
function readCookie(req, name) {
  const header = String(req.headers.cookie || "");
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return "";
      }
    }
  }
  return "";
}
function flowCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PRODUCTION,
    path: "/",
    maxAge: 10 * 60 * 1e3
  };
}
function linkFailurePage(res, title, message, status = 400) {
  res.status(status).type("html").send(
    `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#09090b;color:#fafafa;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:24px}.c{max-width:28rem;text-align:center}h1{font-size:1.15rem;margin:0 0 .75rem}p{color:#a1a1aa;line-height:1.6;font-size:.9rem;margin:0 0 1.5rem}a{display:inline-block;padding:.7rem 1.2rem;border-radius:.75rem;background:#4f46e5;color:#fff;text-decoration:none;font-weight:600;font-size:.85rem}</style></head><body><div class="c"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><a href="/settings">Code4Ever'e d\xF6n</a></div></body></html>`
  );
}
app.get("/api/auth/links/status", requireAuth, async (req, res) => {
  const profile = await findById(req.auth?.userId || "");
  res.json({
    success: true,
    github: profile?.github_username ? { linked: true, username: profile.github_username } : { linked: false },
    jubbio: profile?.jubbio_user_id ? { linked: true, username: profile.jubbio_username || null } : { linked: false },
    jubbioConfigured: Boolean(getJubbioConfig()),
    jubbioReason: jubbioUnavailableReason()
  });
});
app.post(
  "/api/auth/github/link",
  requireAuth,
  rateLimit({ scope: "github-link", windowMs: 6e4, max: 10, perUser: true }),
  async (req, res) => {
    const userId = req.auth?.userId || "";
    const identity = await readGithubIdentity(userId);
    if (!identity) {
      res.status(409).json({
        success: false,
        error: "needs_authorization",
        message: "\xD6nce GitHub hesab\u0131n\u0131zla yetkilendirme yapman\u0131z gerekiyor."
      });
      return;
    }
    const owner = await findByGithubUsername(identity.username);
    if (owner && owner.id !== userId) {
      res.status(409).json({
        success: false,
        error: "github_already_linked",
        message: "Bu GitHub hesab\u0131 ba\u015Fka bir Code4Ever hesab\u0131na ba\u011Fl\u0131."
      });
      return;
    }
    const saved = await writeGithubLink(userId, identity.username);
    res.status(saved ? 200 : 502).json({ success: saved, username: identity.username });
  }
);
app.post(
  "/api/auth/github/unlink",
  requireAuth,
  rateLimit({ scope: "github-unlink", windowMs: 6e4, max: 10, perUser: true }),
  async (req, res) => {
    const userId = req.auth?.userId || "";
    const profile = await findById(userId);
    if (!profile?.github_username) {
      res.status(400).json({ success: false, error: "not_linked", message: "Ba\u011Fl\u0131 bir GitHub hesab\u0131 yok." });
      return;
    }
    const cleared = await clearGithubLink(userId);
    res.status(cleared ? 200 : 502).json({ success: cleared });
  }
);
var JUBBIO_FLOW_COOKIE = "c4e_jubbio_oauth";
app.get(
  "/api/auth/jubbio/start",
  requireAuth,
  rateLimit({ scope: "jubbio-start", windowMs: 6e4, max: 20, perUser: true }),
  (req, res) => {
    const config = getJubbioConfig();
    if (!config) {
      res.status(503).json({ success: false, error: "not_configured", message: jubbioUnavailableReason() });
      return;
    }
    const { verifier, challenge } = createPkce();
    const state = import_node_crypto6.default.randomBytes(24).toString("base64url");
    const flow = { state, verifier, userId: req.auth?.userId || "" };
    res.cookie(JUBBIO_FLOW_COOKIE, sealFlow(flow), flowCookieOptions());
    res.json({ success: true, url: buildJubbioAuthorizeUrl(config, { state, challenge }) });
  }
);
app.get(
  "/api/auth/jubbio/callback",
  rateLimit({ scope: "jubbio-callback", windowMs: 6e4, max: 30 }),
  async (req, res) => {
    const fail = (message, status = 400) => {
      res.clearCookie(JUBBIO_FLOW_COOKIE, { path: "/" });
      linkFailurePage(res, "Jubbio ba\u011Flant\u0131s\u0131 tamamlanamad\u0131", message, status);
    };
    const config = getJubbioConfig();
    if (!config) return fail(jubbioUnavailableReason() || "Jubbio ba\u011Flant\u0131s\u0131 yap\u0131land\u0131r\u0131lmam\u0131\u015F.", 503);
    if (!accountsConfigured()) return fail("Sunucu Supabase ile yap\u0131land\u0131r\u0131lmam\u0131\u015F.", 503);
    const providerError = typeof req.query.error === "string" ? req.query.error : "";
    if (providerError) {
      const description = typeof req.query.error_description === "string" ? req.query.error_description : "";
      return fail(
        providerError === "access_denied" ? "Jubbio hesab\u0131n\u0131za eri\u015Fim izni verilmedi. \u0130sterseniz tekrar deneyebilirsiniz." : description || providerError
      );
    }
    const flow = openFlow(readCookie(req, JUBBIO_FLOW_COOKIE));
    if (!flow?.userId) return fail("Ba\u011Flama ak\u0131\u015F\u0131 bulunamad\u0131 veya s\xFCresi doldu. L\xFCtfen ba\u015Ftan deneyin.");
    const state = typeof req.query.state === "string" ? req.query.state : "";
    if (!state || !safeEquals(state, flow.state)) return fail("G\xFCvenlik do\u011Frulamas\u0131 ba\u015Far\u0131s\u0131z (state).");
    const code = typeof req.query.code === "string" ? req.query.code : "";
    if (!code) return fail("Yetkilendirme kodu al\u0131namad\u0131.");
    const exchanged = await exchangeJubbioCode(config, code, flow.verifier);
    if (!exchanged.ok || !exchanged.tokens) return fail(exchanged.error || "Belirte\xE7 al\u0131namad\u0131.");
    const me = await fetchJubbioUser(config, exchanged.tokens.access_token);
    if (!me.ok || !me.identity) return fail(me.error || "Jubbio kimli\u011Fi okunamad\u0131.");
    const owner = await findByJubbioId(me.identity.id);
    if (owner && owner.id !== flow.userId) {
      return fail("Bu Jubbio hesab\u0131 ba\u015Fka bir Code4Ever hesab\u0131na ba\u011Fl\u0131.", 409);
    }
    const saved = await writeJubbioLink(flow.userId, {
      id: me.identity.id,
      username: me.identity.username,
      avatarUrl: me.identity.avatarUrl
    });
    if (!saved) return fail("Jubbio ba\u011Flant\u0131s\u0131 kaydedilemedi.", 502);
    res.clearCookie(JUBBIO_FLOW_COOKIE, { path: "/" });
    res.redirect("/settings?jubbio=linked");
  }
);
app.post(
  "/api/auth/jubbio/unlink",
  requireAuth,
  rateLimit({ scope: "jubbio-unlink", windowMs: 6e4, max: 10, perUser: true }),
  async (req, res) => {
    const userId = req.auth?.userId || "";
    const profile = await findById(userId);
    if (!profile?.jubbio_user_id) {
      res.status(400).json({ success: false, error: "not_linked", message: "Ba\u011Fl\u0131 bir Jubbio hesab\u0131 yok." });
      return;
    }
    const cleared = await clearJubbioLink(userId);
    res.status(cleared ? 200 : 502).json({ success: cleared });
  }
);
var MAX_APPS_PER_OWNER = 10;
function oauthUnavailable(res) {
  if (oauthProviderConfigured()) return false;
  res.status(503).json({
    success: false,
    error: "not_configured",
    message: "Geli\u015Ftirici API'si yap\u0131land\u0131r\u0131lmam\u0131\u015F (SUPABASE_SERVICE_ROLE_KEY eksik)."
  });
  return true;
}
function readRedirectUris(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const uris = [];
  for (const candidate of list.slice(0, 10)) {
    const valid = validateRedirectUri(candidate);
    if (!valid) return { ok: false, uris: [], bad: String(candidate).slice(0, 120) };
    if (!uris.includes(valid)) uris.push(valid);
  }
  return { ok: true, uris, bad: "" };
}
app.get("/api/dev/scopes", (_req, res) => {
  res.json({
    success: true,
    scopes: ALL_SCOPES.map((key) => ({ key, ...SCOPES[key] }))
  });
});
app.get("/api/dev/apps", requireAuth, async (req, res) => {
  if (oauthUnavailable(res)) return;
  const apps = await listAppsByOwner(req.auth?.userId || "");
  res.json({ success: true, apps: apps.map(toPublicApp), limit: MAX_APPS_PER_OWNER });
});
app.post(
  "/api/dev/apps",
  requireAuth,
  rateLimit({ scope: "dev-apps-create", windowMs: 6e4, max: 10, perUser: true }),
  async (req, res) => {
    if (oauthUnavailable(res)) return;
    const userId = req.auth?.userId || "";
    const name = cleanText(req.body?.name, 60);
    if (!name) {
      res.status(400).json({ success: false, error: "invalid_name", message: "Uygulama ad\u0131 gerekli." });
      return;
    }
    const redirects = readRedirectUris(req.body?.redirect_uris);
    if (!redirects.ok) {
      res.status(400).json({
        success: false,
        error: "invalid_redirect_uri",
        message: `Ge\xE7ersiz y\xF6nlendirme adresi: ${redirects.bad}. Yaln\u0131zca https (ya da yerel geli\u015Ftirmede http://localhost) kabul ediliyor ve adres # i\xE7eremez.`
      });
      return;
    }
    if (redirects.uris.length === 0) {
      res.status(400).json({
        success: false,
        error: "redirect_uri_required",
        message: "En az bir y\xF6nlendirme adresi gerekli."
      });
      return;
    }
    const scopes = parseScopes(req.body?.scopes);
    if (!scopes) {
      res.status(400).json({
        success: false,
        error: "invalid_scope",
        message: `Bilinmeyen kapsam. Ge\xE7erli olanlar: ${ALL_SCOPES.join(", ")}.`
      });
      return;
    }
    if (await countAppsByOwner(userId) >= MAX_APPS_PER_OWNER) {
      res.status(409).json({
        success: false,
        error: "limit_reached",
        message: `En fazla ${MAX_APPS_PER_OWNER} uygulama olu\u015Fturabilirsin.`
      });
      return;
    }
    const created = await createApp({
      name,
      description: cleanText(req.body?.description, 300) || null,
      website_url: validateRedirectUri(req.body?.website_url) || null,
      redirect_uris: redirects.uris,
      scopes,
      owner_id: userId,
      owner_username: req.auth?.username || null
    });
    if (!created.ok || !created.app) {
      res.status(502).json({ success: false, error: "save_failed", message: created.error });
      return;
    }
    res.status(201).json({
      success: true,
      app: toPublicApp(created.app),
      client_secret: created.clientSecret,
      notice: "\u0130stemci s\u0131rr\u0131 yaln\u0131zca B\u0130R KEZ g\xF6steriliyor. Kaybedersen yenisini \xFCretmen gerekir."
    });
  }
);
async function ownedApp(req, res) {
  const app2 = await getAppById(String(req.params.id || ""));
  if (!app2 || app2.revoked_at) {
    res.status(404).json({ success: false, error: "not_found", message: "Uygulama bulunamad\u0131." });
    return null;
  }
  if (app2.owner_id !== (req.auth?.userId || "")) {
    res.status(403).json({ success: false, error: "forbidden", message: "Bu uygulama senin de\u011Fil." });
    return null;
  }
  return app2;
}
app.patch(
  "/api/dev/apps/:id",
  requireAuth,
  rateLimit({ scope: "dev-apps-update", windowMs: 6e4, max: 30, perUser: true }),
  async (req, res) => {
    if (oauthUnavailable(res)) return;
    const app2 = await ownedApp(req, res);
    if (!app2) return;
    const patch = {};
    if (req.body?.name !== void 0) {
      const name = cleanText(req.body.name, 60);
      if (!name) {
        res.status(400).json({ success: false, error: "invalid_name", message: "Uygulama ad\u0131 gerekli." });
        return;
      }
      patch.name = name;
    }
    if (req.body?.description !== void 0) patch.description = cleanText(req.body.description, 300) || null;
    if (req.body?.website_url !== void 0) {
      patch.website_url = req.body.website_url ? validateRedirectUri(req.body.website_url) : null;
    }
    if (req.body?.redirect_uris !== void 0) {
      const redirects = readRedirectUris(req.body.redirect_uris);
      if (!redirects.ok || redirects.uris.length === 0) {
        res.status(400).json({
          success: false,
          error: "invalid_redirect_uri",
          message: redirects.ok ? "En az bir y\xF6nlendirme adresi gerekli." : `Ge\xE7ersiz y\xF6nlendirme adresi: ${redirects.bad}.`
        });
        return;
      }
      patch.redirect_uris = redirects.uris;
    }
    if (req.body?.scopes !== void 0) {
      const scopes = parseScopes(req.body.scopes);
      if (!scopes) {
        res.status(400).json({ success: false, error: "invalid_scope", message: "Bilinmeyen kapsam." });
        return;
      }
      patch.scopes = scopes;
    }
    const updated = await updateApp(app2.id, patch);
    if (!updated) {
      res.status(502).json({ success: false, error: "save_failed" });
      return;
    }
    res.json({ success: true, app: toPublicApp(updated) });
  }
);
app.post(
  "/api/dev/apps/:id/rotate",
  requireAuth,
  rateLimit({ scope: "dev-apps-rotate", windowMs: 6e4, max: 10, perUser: true }),
  async (req, res) => {
    if (oauthUnavailable(res)) return;
    const app2 = await ownedApp(req, res);
    if (!app2) return;
    const clientSecret = await rotateSecret(app2.id);
    if (!clientSecret) {
      res.status(502).json({ success: false, error: "rotate_failed" });
      return;
    }
    res.json({
      success: true,
      client_secret: clientSecret,
      notice: "Eski s\u0131r bu andan itibaren ge\xE7ersiz. Yeni s\u0131rr\u0131 kaydet; bir daha g\xF6sterilmeyecek."
    });
  }
);
app.delete(
  "/api/dev/apps/:id",
  requireAuth,
  rateLimit({ scope: "dev-apps-delete", windowMs: 6e4, max: 10, perUser: true }),
  async (req, res) => {
    if (oauthUnavailable(res)) return;
    const app2 = await ownedApp(req, res);
    if (!app2) return;
    const done = await revokeApp(app2.id);
    res.status(done ? 200 : 502).json({ success: done });
  }
);
app.get(
  "/api/oauth/app-info",
  rateLimit({ scope: "oauth-info", windowMs: 6e4, max: 60 }),
  async (req, res) => {
    if (oauthUnavailable(res)) return;
    const app2 = await getAppByClientId(asString(req.query.client_id, 120));
    if (!app2) {
      res.status(404).json({ success: false, error: "unknown_client", message: "Uygulama bulunamad\u0131." });
      return;
    }
    const redirectUri = asString(req.query.redirect_uri, 500);
    if (!redirectUriAllowed(app2, redirectUri)) {
      res.status(400).json({
        success: false,
        error: "invalid_redirect_uri",
        message: "Y\xF6nlendirme adresi uygulamada kay\u0131tl\u0131 de\u011Fil."
      });
      return;
    }
    const requested = parseScopes(req.query.scope);
    if (!requested) {
      res.status(400).json({ success: false, error: "invalid_scope", message: "Bilinmeyen kapsam istendi." });
      return;
    }
    const extra = requested.filter((s) => !app2.scopes.includes(s));
    if (extra.length) {
      res.status(400).json({
        success: false,
        error: "scope_not_allowed",
        message: `Uygulama \u015Fu kapsam(lar) i\xE7in kay\u0131tl\u0131 de\u011Fil: ${extra.join(", ")}.`
      });
      return;
    }
    res.json({
      success: true,
      app: toAppFacts(app2),
      scopes: requested.map((key) => ({ key, ...SCOPES[key] }))
    });
  }
);
app.post(
  "/api/oauth/authorize",
  requireAuth,
  rateLimit({ scope: "oauth-authorize", windowMs: 6e4, max: 30, perUser: true }),
  async (req, res) => {
    if (oauthUnavailable(res)) return;
    const userId = req.auth?.userId || "";
    const app2 = await getAppByClientId(asString(req.body?.client_id, 120));
    if (!app2) {
      res.status(404).json({ success: false, error: "unknown_client" });
      return;
    }
    const redirectUri = asString(req.body?.redirect_uri, 500);
    if (!redirectUriAllowed(app2, redirectUri)) {
      res.status(400).json({ success: false, error: "invalid_redirect_uri" });
      return;
    }
    const requested = parseScopes(req.body?.scope);
    if (!requested || requested.some((s) => !app2.scopes.includes(s))) {
      res.status(400).json({ success: false, error: "invalid_scope" });
      return;
    }
    const challenge = asString(req.body?.code_challenge, 200);
    const method = asString(req.body?.code_challenge_method, 10);
    if (challenge && method !== "S256") {
      res.status(400).json({
        success: false,
        error: "invalid_request",
        message: "code_challenge_method yaln\u0131zca S256 olabilir."
      });
      return;
    }
    const code = await issueCode({
      appId: app2.id,
      userId,
      scopes: requested,
      redirectUri,
      codeChallenge: challenge || null,
      codeChallengeMethod: challenge ? "S256" : null
    });
    if (!code) {
      res.status(502).json({ success: false, error: "code_failed" });
      return;
    }
    await writeGrant(app2.id, userId, requested);
    const target = new URL(redirectUri);
    target.searchParams.set("code", code);
    const state = asString(req.body?.state, 500);
    if (state) target.searchParams.set("state", state);
    res.json({ success: true, redirect: target.toString() });
  }
);
app.post(
  "/api/oauth/token",
  rateLimit({ scope: "oauth-token", windowMs: 6e4, max: 60 }),
  async (req, res) => {
    if (oauthUnavailable(res)) return;
    const fail = (error, description, status = 400) => res.status(status).json({ error, error_description: description });
    const body = isPlainObject(req.body) ? req.body : {};
    const grantType = asString(body.grant_type, 40);
    const app2 = await getAppByClientId(asString(body.client_id, 120));
    if (!app2) return fail("invalid_client", "Uygulama bulunamad\u0131.", 401);
    const clientSecret = asString(body.client_secret, 200);
    const verifier = asString(body.code_verifier, 200);
    if (grantType === "authorization_code") {
      const record = await peekCode(asString(body.code, 200));
      if (!record) return fail("invalid_grant", "Kod ge\xE7ersiz, kullan\u0131lm\u0131\u015F ya da s\xFCresi dolmu\u015F.");
      if (record.app_id !== app2.id) return fail("invalid_grant", "Kod bu uygulamaya ait de\u011Fil.");
      if (asString(body.redirect_uri, 500) !== record.redirect_uri) {
        return fail("invalid_grant", "redirect_uri, yetkilendirmedekiyle ayn\u0131 olmal\u0131.");
      }
      if (record.code_challenge) {
        if (!pkceMatches(verifier, record.code_challenge, record.code_challenge_method || "")) {
          return fail("invalid_grant", "code_verifier do\u011Frulanamad\u0131.");
        }
      } else if (!clientSecretMatches(app2, clientSecret)) {
        return fail("invalid_client", "client_secret do\u011Frulanamad\u0131.", 401);
      }
      const consumed = await consumeCode(asString(body.code, 200));
      if (!consumed) return fail("invalid_grant", "Kod bu s\u0131rada ba\u015Fka bir istek taraf\u0131ndan kullan\u0131ld\u0131.");
      const tokens = await issueTokens({ appId: app2.id, userId: consumed.user_id, scopes: consumed.scopes });
      if (!tokens) return fail("server_error", "Belirte\xE7 \xFCretilemedi.", 502);
      void pruneExpiredCodes();
      void touchApp(app2.id);
      return res.json(tokens);
    }
    if (grantType === "refresh_token") {
      if (clientSecret && !clientSecretMatches(app2, clientSecret)) {
        return fail("invalid_client", "client_secret do\u011Frulanamad\u0131.", 401);
      }
      const tokens = await refreshTokens(asString(body.refresh_token, 200), app2.id);
      if (!tokens) return fail("invalid_grant", "Yenileme belirteci ge\xE7ersiz ya da s\xFCresi dolmu\u015F.");
      void touchApp(app2.id);
      return res.json(tokens);
    }
    return fail("unsupported_grant_type", "authorization_code ya da refresh_token kullan\u0131n.");
  }
);
app.post(
  "/api/oauth/revoke",
  rateLimit({ scope: "oauth-revoke", windowMs: 6e4, max: 60 }),
  async (req, res) => {
    if (oauthUnavailable(res)) return;
    const token = asString(req.body?.token, 200);
    if (token) await revokeToken(token);
    res.json({ success: true });
  }
);
app.get("/api/oauth/authorizations", requireAuth, async (req, res) => {
  if (oauthUnavailable(res)) return;
  const grants = await listGrants(req.auth?.userId || "");
  const apps = await getAppsByIds(grants.map((g) => g.app_id));
  const byId = new Map(apps.map((a) => [a.id, a]));
  res.json({
    success: true,
    authorizations: grants.map((grant) => {
      const app2 = byId.get(grant.app_id);
      if (!app2 || app2.revoked_at) return null;
      return {
        app: toAppFacts(app2),
        scopes: Array.isArray(grant.scopes) ? grant.scopes : [],
        granted_at: grant.created_at,
        updated_at: grant.updated_at
      };
    }).filter(Boolean)
  });
});
app.delete(
  "/api/oauth/authorizations/:clientId",
  requireAuth,
  rateLimit({ scope: "oauth-revoke-grant", windowMs: 6e4, max: 30, perUser: true }),
  async (req, res) => {
    if (oauthUnavailable(res)) return;
    const app2 = await getAppByClientId(String(req.params.clientId || ""));
    if (!app2) {
      res.status(404).json({ success: false, error: "not_found" });
      return;
    }
    const done = await revokeGrant(app2.id, req.auth?.userId || "");
    res.status(done ? 200 : 502).json({ success: done });
  }
);
function requireScope(scope) {
  return async (req, res, next) => {
    if (oauthUnavailable(res)) return;
    const header = String(req.headers.authorization || "");
    const token = /^Bearer\s+(.+)$/i.exec(header)?.[1] || "";
    const record = await resolveAccessToken(token);
    if (!record) {
      res.setHeader("WWW-Authenticate", 'Bearer error="invalid_token"');
      res.status(401).json({ error: "invalid_token", error_description: "Belirte\xE7 ge\xE7ersiz ya da s\xFCresi dolmu\u015F." });
      return;
    }
    if (!record.scopes.includes(scope)) {
      res.setHeader("WWW-Authenticate", `Bearer error="insufficient_scope", scope="${scope}"`);
      res.status(403).json({
        error: "insufficient_scope",
        error_description: `Bu u\xE7 "${scope}" kapsam\u0131n\u0131 gerektiriyor.`
      });
      return;
    }
    req.oauth = record;
    void touchToken(record.id);
    next();
  };
}
app.get(
  "/api/v1/users/@me",
  rateLimit({ scope: "api-me", windowMs: 6e4, max: 120 }),
  requireScope("identify"),
  async (req, res) => {
    const record = req.oauth;
    const profile = await readApiProfile(record.user_id);
    if (!profile) {
      res.status(404).json({ error: "not_found", error_description: "Profil bulunamad\u0131." });
      return;
    }
    res.json({
      id: profile.id,
      username: profile.username,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url || null,
      bio: profile.bio || null,
      role: profile.role || null,
      github_username: profile.github_username || null,
      jubbio_username: profile.jubbio_username || null,
      created_at: profile.created_at,
      // E-posta YALNIZCA `email` kapsamıyla. Kapsam yoksa alan hiç bulunmuyor —
      // `null` göndermek "bu üyenin e-postası yok" demek olurdu ve yanlış bilgi verirdi.
      ...record.scopes.includes("email") ? { email: profile.email || null } : {}
    });
  }
);
app.get(
  "/api/v1/users/@me/projects",
  rateLimit({ scope: "api-me-projects", windowMs: 6e4, max: 120 }),
  requireScope("projects:read"),
  async (req, res) => {
    const record = req.oauth;
    const list = await listProjects({ sort: "mine", ownerId: record.user_id, limit: 100 });
    res.json({
      projects: list.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        about: p.about || null,
        repo_full_name: p.repo_full_name || null,
        repo_url: p.repo_url || null,
        language: p.language || null,
        likes_count: p.likes_count ?? 0,
        followers_count: p.followers_count ?? 0,
        created_at: p.created_at
      }))
    });
  }
);
app.get(
  "/api/v1/users/@me/communities",
  rateLimit({ scope: "api-me-communities", windowMs: 6e4, max: 120 }),
  requireScope("communities:read"),
  async (req, res) => {
    const record = req.oauth;
    const profile = await readApiProfile(record.user_id);
    const joined = Array.isArray(profile?.joined_communities) ? profile.joined_communities.map(String) : [];
    const communities = await findCommunitiesByIds(joined);
    res.json({
      communities: communities.map((c) => ({
        id: c.id,
        name: c.name,
        handle: c.handle,
        description: c.description || null,
        is_private: c.is_private === true,
        members_count: c.members_count ?? 0
      }))
    });
  }
);
app.get(
  "/api/projects",
  rateLimit({ scope: "projects-list", windowMs: 6e4, max: 60 }),
  async (req, res) => {
    if (!projectsConfigured()) {
      res.status(503).json({ success: false, error: "not_configured" });
      return;
    }
    const sortParam = asString(req.query.sort, 10);
    const sort = sortParam === "top" ? "top" : sortParam === "mine" ? "mine" : "new";
    const userId = req.auth?.userId || "";
    if (sort === "mine" && !userId) {
      res.status(401).json({ success: false, error: "auth_required" });
      return;
    }
    const limit = Math.min(Math.max(toPositiveInt3(req.query.limit, 30), 1), 50);
    const projects = await listProjects({ sort, ownerId: userId, limit });
    const ids = projects.map((p) => String(p.id));
    const [liked, followed] = userId ? await Promise.all([readRelations("like", userId, ids), readRelations("follow", userId, ids)]) : [{}, {}];
    res.json({
      success: true,
      projects: projects.map((p) => ({
        ...p,
        liked_by_me: Boolean(liked[p.id]),
        followed_by_me: Boolean(followed[p.id])
      }))
    });
  }
);
app.get(
  "/api/projects/highlights",
  rateLimit({ scope: "projects-highlights", windowMs: 6e4, max: 60 }),
  async (_req, res) => {
    if (!projectsConfigured()) {
      res.status(503).json({ success: false, error: "not_configured" });
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
var projectBody = import_express.default.json({ limit: PROJECT_BODY_LIMIT });
app.post(
  "/api/projects",
  requireAuth,
  projectBody,
  // Sınır REDDEDİLEN denemeleri de sayıyor (doğru davranış: hammering'i o durdurur). Ama
  // 10 fazla düşüktü: depo adını birkaç kez yanlış yazan biri kendini bir dakika dışarıda
  // bırakıyordu. 30, insan kullanımı için rahat, kötüye kullanım için hâlâ dar.
  rateLimit({ scope: "projects-create", windowMs: 6e4, max: 30, perUser: true }),
  async (req, res) => {
    if (!projectsConfigured()) {
      res.status(503).json({ success: false, error: "not_configured" });
      return;
    }
    const userId = req.auth?.userId || "";
    const profile = await findById(userId);
    if (!profile) {
      res.status(404).json({ success: false, error: "profile_not_found" });
      return;
    }
    const wantsRepo = req.body?.repo !== void 0 && String(req.body.repo || "").trim() !== "";
    let repo = null;
    if (wantsRepo) {
      const check = await verifyOwnRepo(profile.github_username, req.body.repo);
      if (!check.ok || !check.repo) {
        res.status(check.status).json({ success: false, error: check.error, message: check.message });
        return;
      }
      repo = check.repo;
    }
    const name = cleanText(req.body?.name, 80) || (repo ? repo.fullName.split("/")[1] : "");
    if (!name) {
      res.status(400).json({ success: false, error: "name_required", message: "Proje ad\u0131 gerekli." });
      return;
    }
    const about = cleanText(req.body?.about, 600) || repo?.description || "";
    const created = await insertProject({
      id: newProjectId(),
      slug: await allocateSlug(name),
      owner_id: userId,
      owner_username: profile.username,
      name,
      about,
      description: cleanText(req.body?.description, 4e3),
      cover_url: cleanImage(req.body?.cover_url),
      gallery: cleanGallery(req.body?.gallery),
      repo_full_name: repo ? repo.fullName : null,
      repo_url: repo ? repo.htmlUrl : null,
      repo_default_branch: repo ? repo.defaultBranch : null,
      language: repo ? repo.language : null
    });
    if (!created) {
      res.status(502).json({ success: false, error: "create_failed" });
      return;
    }
    res.status(201).json({ success: true, project: { ...created, liked_by_me: false, followed_by_me: false } });
  }
);
app.all(
  "/api/projects/watch",
  rateLimit({ scope: "projects-watch", windowMs: 6e4, max: 12 }),
  async (req, res) => {
    if (req.method !== "GET" && req.method !== "POST") {
      res.status(405).json({ success: false, error: "method_not_allowed" });
      return;
    }
    const bearer = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ""))?.[1] || "";
    const viaCron = cronSecretMatches(String(req.headers["x-cron-secret"] || "")) || cronSecretMatches(bearer);
    if (!viaCron) {
      await new Promise((resolve) => requireAdmin(req, res, () => resolve()));
      if (res.headersSent) return;
    }
    if (!projectsConfigured()) {
      res.status(503).json({ success: false, error: "not_configured" });
      return;
    }
    const result = await runCommitWatch({
      budgetMs: toPositiveInt3(req.body?.budgetMs, 2e4),
      maxProjects: toPositiveInt3(req.body?.maxProjects, 25)
    });
    res.json({ success: true, ...result });
  }
);
app.get(
  "/api/projects/slug/:slug",
  rateLimit({ scope: "projects-slug", windowMs: 6e4, max: 90 }),
  async (req, res) => {
    if (!projectsConfigured()) {
      res.status(503).json({ success: false, error: "not_configured" });
      return;
    }
    const project = await findProjectBySlug(asString(req.params.slug, 90));
    if (!project) {
      res.status(404).json({ success: false, error: "not_found" });
      return;
    }
    const userId = req.auth?.userId || "";
    const [liked, followed] = userId ? await Promise.all([
      readRelations("like", userId, [project.id]),
      readRelations("follow", userId, [project.id])
    ]) : [{}, {}];
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
app.get(
  "/api/projects/:id",
  rateLimit({ scope: "projects-detail", windowMs: 6e4, max: 60 }),
  async (req, res) => {
    if (!projectsConfigured()) {
      res.status(503).json({ success: false, error: "not_configured" });
      return;
    }
    const project = await findProjectDetail(asString(req.params.id, 60));
    if (!project) {
      res.status(404).json({ success: false, error: "not_found" });
      return;
    }
    const userId = req.auth?.userId || "";
    const [liked, followed] = userId ? await Promise.all([
      readRelations("like", userId, [project.id]),
      readRelations("follow", userId, [project.id])
    ]) : [{}, {}];
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
app.patch(
  "/api/projects/:id",
  requireAuth,
  projectBody,
  rateLimit({ scope: "projects-update", windowMs: 6e4, max: 20, perUser: true }),
  async (req, res) => {
    const project = await findProjectById(asString(req.params.id, 60));
    if (!project) {
      res.status(404).json({ success: false, error: "not_found" });
      return;
    }
    if (project.owner_id !== req.auth?.userId && !req.auth?.isAdmin) {
      res.status(403).json({ success: false, error: "forbidden" });
      return;
    }
    const patch = {};
    if (req.body?.name !== void 0) {
      const name = cleanText(req.body.name, 80);
      if (!name) {
        res.status(400).json({ success: false, error: "invalid_name" });
        return;
      }
      patch.name = name;
    }
    if (req.body?.about !== void 0) patch.about = cleanText(req.body.about, 600);
    if (req.body?.description !== void 0) patch.description = cleanText(req.body.description, 4e3);
    if (req.body?.cover_url !== void 0) patch.cover_url = cleanImage(req.body.cover_url);
    if (req.body?.gallery !== void 0) patch.gallery = cleanGallery(req.body.gallery);
    if (req.body?.repo !== void 0 && String(req.body.repo || "").trim() !== "") {
      if (project.repo_full_name) {
        res.status(409).json({
          success: false,
          error: "repo_already_set",
          message: "Bu projenin deposu zaten ba\u011Fl\u0131 ve de\u011Fi\u015Ftirilemez."
        });
        return;
      }
      const profile = await findById(req.auth?.userId || "");
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
      res.status(400).json({ success: false, error: "nothing_to_update" });
      return;
    }
    const saved = await updateProject(project.id, patch);
    res.status(saved ? 200 : 502).json({ success: saved });
  }
);
app.delete(
  "/api/projects/:id",
  requireAuth,
  rateLimit({ scope: "projects-delete", windowMs: 6e4, max: 20, perUser: true }),
  async (req, res) => {
    const project = await findProjectById(asString(req.params.id, 60));
    if (!project) {
      res.status(404).json({ success: false, error: "not_found" });
      return;
    }
    if (project.owner_id !== req.auth?.userId && !req.auth?.isAdmin) {
      res.status(403).json({ success: false, error: "forbidden" });
      return;
    }
    const removed = await softDeleteProject(project.id);
    res.status(removed ? 200 : 502).json({ success: removed });
  }
);
for (const relation of ["like", "follow"]) {
  app.post(
    `/api/projects/:id/${relation}`,
    requireAuth,
    rateLimit({ scope: `projects-${relation}`, windowMs: 6e4, max: 60, perUser: true }),
    async (req, res) => {
      if (!projectsConfigured()) {
        res.status(503).json({ success: false, error: "not_configured" });
        return;
      }
      const project = await findProjectById(asString(req.params.id, 60));
      if (!project) {
        res.status(404).json({ success: false, error: "not_found" });
        return;
      }
      const on = req.body?.on !== false;
      const done = await setRelation(relation, project.id, req.auth?.userId || "", on);
      if (!done) {
        res.status(502).json({ success: false, error: "update_failed" });
        return;
      }
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
async function resolveCommunity(raw) {
  const value = asString(raw, 80);
  if (!value) return null;
  return value.startsWith("@") ? findCommunityByHandle(value) : await findCommunityById(value) || findCommunityByHandle(value);
}
app.get(
  "/api/communities/:id/projects",
  attachOptionalAuth,
  rateLimit({ scope: "community-projects-list", windowMs: 6e4, max: 60 }),
  async (req, res) => {
    if (!communityProjectsConfigured() || !projectsConfigured()) {
      res.status(503).json({ success: false, error: "not_configured" });
      return;
    }
    const community = await resolveCommunity(req.params.id);
    if (!community) {
      res.status(404).json({ success: false, error: "community_not_found" });
      return;
    }
    if (!await canSeeCommunity(community, req.auth?.userId, req.auth?.isAdmin)) {
      res.status(404).json({ success: false, error: "community_not_found" });
      return;
    }
    const limit = toPositiveInt3(req.query.limit, 40);
    const links = await listCommunityProjectLinks(community.id, Math.min(limit, 100));
    const projects = [];
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
app.get(
  "/api/projects/:id/communities",
  requireAuth,
  rateLimit({ scope: "project-communities", windowMs: 6e4, max: 60, perUser: true }),
  async (req, res) => {
    if (!communityProjectsConfigured()) {
      res.status(503).json({ success: false, error: "not_configured" });
      return;
    }
    const project = await findProjectById(asString(req.params.id, 60));
    if (!project) {
      res.status(404).json({ success: false, error: "not_found" });
      return;
    }
    res.json({ success: true, community_ids: await listProjectCommunityIds(project.id) });
  }
);
app.post(
  "/api/communities/:id/projects",
  requireAuth,
  rateLimit({ scope: "community-projects-add", windowMs: 6e4, max: 30, perUser: true }),
  async (req, res) => {
    if (!communityProjectsConfigured() || !projectsConfigured()) {
      res.status(503).json({ success: false, error: "not_configured" });
      return;
    }
    const community = await resolveCommunity(req.params.id);
    if (!community) {
      res.status(404).json({ success: false, error: "community_not_found" });
      return;
    }
    const project = await findProjectById(asString(req.body?.project_id, 60));
    if (!project || project.is_deleted) {
      res.status(404).json({ success: false, error: "project_not_found" });
      return;
    }
    const userId = req.auth?.userId || "";
    if (String(project.owner_id) !== userId) {
      res.status(403).json({
        success: false,
        error: "not_project_owner",
        message: "Bir projeyi toplulu\u011Fa yaln\u0131zca sahibi ekleyebilir."
      });
      return;
    }
    if (!await isMemberOf(userId, community.id)) {
      res.status(403).json({
        success: false,
        error: "not_a_member",
        message: "Projeni yaln\u0131zca \xFCyesi oldu\u011Fun bir toplulu\u011Fa ekleyebilirsin."
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
      res.status(502).json({ success: false, error: "write_failed" });
      return;
    }
    const fresh = await findCommunityById(community.id);
    res.json({
      success: true,
      on: true,
      projects_count: Number(fresh?.projects_count ?? community.projects_count ?? 0)
    });
  }
);
app.delete(
  "/api/communities/:id/projects/:projectId",
  requireAuth,
  rateLimit({ scope: "community-projects-remove", windowMs: 6e4, max: 30, perUser: true }),
  async (req, res) => {
    if (!communityProjectsConfigured() || !projectsConfigured()) {
      res.status(503).json({ success: false, error: "not_configured" });
      return;
    }
    const community = await resolveCommunity(req.params.id);
    if (!community) {
      res.status(404).json({ success: false, error: "community_not_found" });
      return;
    }
    const projectId = asString(req.params.projectId, 60);
    if (!await linkExists(community.id, projectId)) {
      res.status(404).json({ success: false, error: "not_linked" });
      return;
    }
    const userId = req.auth?.userId || "";
    const project = await findProjectById(projectId);
    const isOwnerOfProject = Boolean(project && String(project.owner_id) === userId);
    const isOwnerOfCommunity = isCommunityOwner(community, userId, req.auth?.username);
    if (!isOwnerOfProject && !isOwnerOfCommunity && !req.auth?.isAdmin) {
      res.status(403).json({
        success: false,
        error: "not_allowed",
        message: "Bu girdiyi yaln\u0131zca projenin sahibi ya da toplulu\u011Fun kurucusu kald\u0131rabilir."
      });
      return;
    }
    if (!await removeProjectFromCommunity(community.id, projectId)) {
      res.status(502).json({ success: false, error: "write_failed" });
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
app.use("/api", (_req, res) => {
  res.status(404).json({ success: false, error: "not_found" });
});
app.use("/api", (err, _req, res, _next) => {
  if (err?.type === "entity.too.large") {
    res.status(413).json({ success: false, error: "payload_too_large" });
    return;
  }
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ success: false, error: "invalid_json" });
    return;
  }
  console.error("Unhandled API error:", err?.message || err);
  res.status(500).json({ success: false, error: "internal_error" });
});
var server_default = app;
async function startServer() {
  if (!IS_PRODUCTION) {
    const viteSpecifier = "vite";
    const { createServer: createViteServer } = await import(
      /* @vite-ignore */
      viteSpecifier
    );
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(
      import_express.default.static(distPath, {
        index: false,
        maxAge: "1h",
        setHeaders: (res, filePath) => {
          if (filePath.endsWith("sw.js") || filePath.endsWith("index.html")) {
            res.setHeader("Cache-Control", "no-cache");
          }
        }
      })
    );
    app.get("*", (_req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  process.on("unhandledRejection", (reason) => {
    console.error("[c4e] yakalanmam\u0131\u015F s\xF6z reddi:", reason);
  });
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Code4Ever server running on http://0.0.0.0:${PORT}`);
    if (!supabaseConfigured()) {
      console.warn("[c4e] SUPABASE_URL / SUPABASE_ANON_KEY missing: authenticated endpoints will return 503.");
    }
    if (!BYNOGAME_WEBHOOK_SECRET) {
      console.warn("[c4e] BYNOGAME_WEBHOOK_SECRET missing: the donation webhook is disabled.");
    }
  });
}
if (!isServerless()) {
  startServer();
}

// src/server/vercelEntry.ts
var handlerError = null;
var resolvedApp = null;
try {
  if (typeof server_default !== "function") {
    throw new Error(`Beklenen Express handler'\u0131 bulunamad\u0131 (tip: ${typeof server_default}).`);
  }
  resolvedApp = server_default;
} catch (error) {
  handlerError = error instanceof Error ? error : new Error(String(error));
  console.error("[c4e] Sunucu uygulamas\u0131 y\xFCklenemedi:", handlerError.stack || handlerError.message);
}
function handler(req, res) {
  if (resolvedApp) {
    resolvedApp(req, res);
    return;
  }
  res.statusCode = 500;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(
    JSON.stringify({
      success: false,
      error: "server_init_failed",
      message: "Sunucu uygulamas\u0131 ba\u015Flat\u0131lamad\u0131. Ayr\u0131nt\u0131l\u0131 y\u0131\u011F\u0131n izi i\xE7in da\u011F\u0131t\u0131m sa\u011Flay\u0131c\u0131s\u0131n\u0131n Runtime Logs b\xF6l\xFCm\xFCne bak\u0131n.",
      detail: handlerError?.message || "bilinmeyen hata"
    })
  );
}
