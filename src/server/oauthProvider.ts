/**
 * Code4Ever API — geliştirici uygulamaları ve OAuth2 sağlayıcısı.
 *
 * Bir geliştirici /dev/apps ekranından uygulama açıyor; uygulama, ÜYENİN İZNİYLE onun adına
 * Code4Ever verisine erişiyor. "Code4Ever ile giriş yap" ve "Code4Ever hesabını bağla" bu
 * akışın iki yüzü.
 *
 * NEREDE GÜVEN SINIRI VAR
 *
 * Bu dosyanın yanıtladığı soru şu: "bu istek gerçekten şu üyenin, şu uygulamaya, şu izinle
 * verdiği erişim mi?" Yanıt yalnızca VERİTABANINDAKİ kayıttan gelir. İstemcinin gönderdiği
 * client_id, scope ya da redirect_uri tek başına hiçbir şeyi kanıtlamaz.
 *
 * ÜÇ KARAR VE NEDENLERİ
 *
 *   1. Sır ve belirteçler YALNIZCA SHA-256 ÖZETİ olarak saklanıyor. Veritabanı sızsa bile
 *      hiçbiri tekrar oynatılamaz; düz metin gerçekten yalnızca üretildiği anda var oluyor.
 *      Arama da özet üzerinden, yani sabit genişlikte bir indeks okuması: hangi öneklerin
 *      var olduğunu sızdıran bir zamanlama sinyali yok.
 *
 *   2. Yetkilendirme kodları TABLOYA yazılıyor, imzalı bir pakete değil. Kod tek kullanımlık
 *      olmak zorunda ve "kullanıldı" bilgisi bir yerde durmalı; kendi kendini doğrulayan bir
 *      paket, ele geçirildiğinde süresi dolana kadar defalarca takas edilebilirdi.
 *
 *   3. Erişim belirteçleri de saklanıyor (imzalı jeton değil). Sebebi iptal: üye "bu
 *      uygulamanın erişimini kes" dediğinde belirtecin ANINDA geçersizleşmesi gerekiyor.
 *      İmzalı bir jeton, iptalden sonra da süresi dolana kadar geçerli kalırdı.
 */

import crypto from 'node:crypto';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, safeFetch } from './security';

export function oauthProviderConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

// -------------------------------------------------------------
// KAPSAMLAR
// -------------------------------------------------------------

/**
 * Verilebilecek izinler.
 *
 * Liste KAPALI: istemcinin istediği her kapsam buradan geçmek zorunda. Bilinmeyen bir
 * kapsamı sessizce yok saymak yerine isteği reddetmek, geliştiriciye yazım hatasını hemen
 * söylüyor — sessiz yok sayma, "neden veri gelmiyor" diye saatler harcatır.
 */
export const SCOPES = {
  identify: {
    tr: 'Kullanıcı adını, görünen adını ve profil resmini görür',
    en: 'See your username, display name and avatar'
  },
  email: {
    tr: 'E-posta adresini görür',
    en: 'See your e-mail address'
  },
  'projects:read': {
    tr: 'Projelerini listeler',
    en: 'List your projects'
  },
  'communities:read': {
    tr: 'Üyesi olduğun toplulukları listeler',
    en: 'List the communities you belong to'
  }
} as const;

export type Scope = keyof typeof SCOPES;
export const ALL_SCOPES = Object.keys(SCOPES) as Scope[];

/** Boşlukla ayrılmış kapsam dizesini doğrular. Bilinmeyen kapsam varsa `null`. */
export function parseScopes(raw: unknown): Scope[] | null {
  const parts = String(raw || '')
    .split(/[\s,+]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  // Kapsam verilmediyse en dar izinle devam: kimlik. Varsayılanı geniş tutmak, dikkatsiz
  // bir istemciye istemediği kadar yetki vermek olurdu.
  if (parts.length === 0) return ['identify'];

  const out: Scope[] = [];
  for (const part of parts) {
    if (!(part in SCOPES)) return null;
    if (!out.includes(part as Scope)) out.push(part as Scope);
  }
  return out;
}

// -------------------------------------------------------------
// SUPABASE ERİŞİMİ (yalnızca servis rolü)
// -------------------------------------------------------------

async function rest(
  pathAndQuery: string,
  init: { method?: string; body?: string; prefer?: string } = {}
): Promise<{ ok: boolean; status: number; json: any }> {
  const response = await safeFetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method: init.method || 'GET',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.prefer ? { Prefer: init.prefer } : {})
    },
    body: init.body,
    timeoutMs: 15000,
    maxResponseBytes: 1024 * 1024
  });

  let json: any = null;
  try {
    json = JSON.parse(response.text || 'null');
  } catch {
    json = null;
  }
  return { ok: response.ok, status: response.status, json };
}

const rows = (json: any): any[] => (Array.isArray(json) ? json : []);

// -------------------------------------------------------------
// GİZLİ DEĞER ÜRETİMİ
// -------------------------------------------------------------

export const CLIENT_ID_PREFIX = 'c4e_app_';
export const CLIENT_SECRET_PREFIX = 'c4e_sec_';
const ACCESS_PREFIX = 'c4e_at_';
const REFRESH_PREFIX = 'c4e_rt_';

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function secret(prefix: string, bytes = 32): string {
  return prefix + crypto.randomBytes(bytes).toString('base64url');
}

// -------------------------------------------------------------
// UYGULAMA KAYDI
// -------------------------------------------------------------

export interface OAuthAppRow {
  id: string;
  client_id: string;
  client_secret_hash: string;
  client_secret_prefix: string;
  name: string;
  description: string | null;
  website_url: string | null;
  logo_url: string | null;
  redirect_uris: string[];
  scopes: string[];
  owner_id: string;
  owner_username: string | null;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  request_count: number;
  revoked_at: string | null;
}

/** Sahibine gösterilen biçim — `client_secret_hash` ASLA dönmez. */
export interface PublicOAuthApp {
  id: string;
  client_id: string;
  client_secret_prefix: string;
  name: string;
  description: string | null;
  website_url: string | null;
  logo_url: string | null;
  redirect_uris: string[];
  scopes: string[];
  owner_username: string | null;
  created_at: string;
  last_used_at: string | null;
  request_count: number;
}

export function toPublicApp(row: OAuthAppRow): PublicOAuthApp {
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

/** Onay ekranının gösterdiği, HERKESE açık uygulama bilgisi. */
export interface AppFacts {
  client_id: string;
  name: string;
  description: string | null;
  website_url: string | null;
  logo_url: string | null;
  owner_username: string | null;
}

export function toAppFacts(row: OAuthAppRow): AppFacts {
  return {
    client_id: row.client_id,
    name: row.name,
    description: row.description,
    website_url: row.website_url,
    logo_url: row.logo_url,
    owner_username: row.owner_username
  };
}

/**
 * Yönlendirme adresi doğrulaması.
 *
 * TAM EŞLEŞME, joker yok. Kısmi eşleşmeye (ör. "aynı konakta olsun yeter") izin vermek,
 * uygulamanın barındığı alan adında açık yönlendirme bulan birinin yetkilendirme kodunu
 * kendi sunucusuna aktarabilmesi demek olurdu. Üstelik adres kaydedilirken de
 * doğrulanıyor: yalnızca https (ya da yerel geliştirme için http://localhost / 127.0.0.1)
 * ve parça (#fragment) içermeyen adresler kabul ediliyor.
 */
export function redirectUriAllowed(app: OAuthAppRow, candidate: string): boolean {
  const list = Array.isArray(app.redirect_uris) ? app.redirect_uris : [];
  return list.some((uri) => uri === candidate);
}

export function validateRedirectUri(raw: unknown): string | null {
  const value = String(raw || '').trim();
  if (!value || value.length > 500) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  // Parça, sunucuya HİÇ gönderilmez; yönlendirme adresinde bulunması ya bir yanlış anlama
  // ya da sorgu parametrelerini gizleme denemesidir.
  if (url.hash) return null;

  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (url.protocol === 'https:') return url.toString();
  // Düz http YALNIZCA yerelde. Üretimde http, yetkilendirme kodunu açık ağda taşımak demek.
  if (url.protocol === 'http:' && isLocal) return url.toString();
  return null;
}

export async function getAppByClientId(clientId: string): Promise<OAuthAppRow | null> {
  const { ok, json } = await rest(
    `oauth_apps?client_id=eq.${encodeURIComponent(clientId)}&revoked_at=is.null&limit=1`
  );
  return ok && rows(json).length ? (rows(json)[0] as OAuthAppRow) : null;
}

export async function getAppById(id: string): Promise<OAuthAppRow | null> {
  const { ok, json } = await rest(`oauth_apps?id=eq.${encodeURIComponent(id)}&limit=1`);
  return ok && rows(json).length ? (rows(json)[0] as OAuthAppRow) : null;
}

export async function listAppsByOwner(ownerId: string): Promise<OAuthAppRow[]> {
  const { ok, json } = await rest(
    `oauth_apps?owner_id=eq.${encodeURIComponent(ownerId)}&revoked_at=is.null&order=created_at.desc&limit=50`
  );
  return ok ? (rows(json) as OAuthAppRow[]) : [];
}

export async function countAppsByOwner(ownerId: string): Promise<number> {
  return (await listAppsByOwner(ownerId)).length;
}

export interface CreateAppInput {
  name: string;
  description?: string | null;
  website_url?: string | null;
  redirect_uris: string[];
  scopes: Scope[];
  owner_id: string;
  owner_username: string | null;
}

/** Uygulamayı oluşturur ve DÜZ METİN sırrı BİR KEZ döner; sonrasında geri alınamaz. */
export async function createApp(
  input: CreateAppInput
): Promise<{ ok: boolean; app?: OAuthAppRow; clientSecret?: string; error?: string }> {
  const clientSecret = secret(CLIENT_SECRET_PREFIX);
  const row = {
    id: `app_${crypto.randomBytes(12).toString('hex')}`,
    client_id: CLIENT_ID_PREFIX + crypto.randomBytes(12).toString('hex'),
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

  const { ok, json } = await rest('oauth_apps', {
    method: 'POST',
    body: JSON.stringify([row]),
    prefer: 'return=representation'
  });
  if (!ok || !rows(json).length) return { ok: false, error: 'Uygulama kaydedilemedi.' };
  return { ok: true, app: rows(json)[0] as OAuthAppRow, clientSecret };
}

export async function updateApp(
  id: string,
  patch: Partial<Pick<OAuthAppRow, 'name' | 'description' | 'website_url' | 'logo_url' | 'redirect_uris' | 'scopes'>>
): Promise<OAuthAppRow | null> {
  const { ok, json } = await rest(`oauth_apps?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    prefer: 'return=representation'
  });
  return ok && rows(json).length ? (rows(json)[0] as OAuthAppRow) : null;
}

/**
 * Yeni bir istemci sırrı üretir ve eskisini anında geçersizleştirir.
 *
 * Sırrı sızdığından ŞÜPHELENEN geliştiricinin yapacağı tek şey bu; bu yüzden eski sır
 * döndürme imkânı bilerek yok. Uygulamanın adına verilmiş belirteçler etkilenmiyor —
 * onlar üyenin izni, sır ise uygulamanın kimliği; ikisi ayrı şeyler.
 */
export async function rotateSecret(id: string): Promise<string | null> {
  const clientSecret = secret(CLIENT_SECRET_PREFIX);
  const { ok } = await rest(`oauth_apps?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      client_secret_hash: sha256(clientSecret),
      client_secret_prefix: clientSecret.slice(0, 16),
      updated_at: new Date().toISOString()
    })
  });
  return ok ? clientSecret : null;
}

/**
 * Uygulamayı kapatır.
 *
 * Satır SİLİNMİYOR, `revoked_at` işaretleniyor; ama verdiği bütün belirteçler ve izinler
 * gerçekten siliniyor. Kaydı tutmak, "bu uygulama bir zamanlar neydi" sorusunu
 * yanıtlanabilir bırakıyor; belirteçleri bırakmak ise kapatmayı anlamsız kılardı.
 */
export async function revokeApp(id: string): Promise<boolean> {
  await rest(`oauth_tokens?app_id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  await rest(`oauth_grants?app_id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  await rest(`oauth_codes?app_id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  const { ok } = await rest(`oauth_apps?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ revoked_at: new Date().toISOString() })
  });
  return ok;
}

/** İstemci sırrını SABİT SÜREDE doğrular. */
export function clientSecretMatches(app: OAuthAppRow, candidate: string): boolean {
  if (!candidate) return false;
  const a = Buffer.from(sha256(candidate), 'utf8');
  const b = Buffer.from(String(app.client_secret_hash || ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// -------------------------------------------------------------
// YETKİLENDİRME KODU
// -------------------------------------------------------------

const CODE_TTL_MS = 10 * 60 * 1000;

export async function issueCode(input: {
  appId: string;
  userId: string;
  scopes: Scope[];
  redirectUri: string;
  codeChallenge?: string | null;
  codeChallengeMethod?: string | null;
}): Promise<string | null> {
  const code = `c4e_code_${crypto.randomBytes(32).toString('base64url')}`;
  const { ok } = await rest('oauth_codes', {
    method: 'POST',
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

export interface CodeRecord {
  app_id: string;
  user_id: string;
  scopes: string[];
  redirect_uri: string;
  code_challenge: string | null;
  code_challenge_method: string | null;
  expires_at: string;
}

/**
 * Kodu SİLMEDEN okur.
 *
 * NEDEN AYRI BİR ADIM: doğrulamaların tamamı (hangi uygulamaya ait, redirect_uri aynı mı,
 * PKCE ya da istemci sırrı tutuyor mu) kodun İÇİNDEKİ bilgiye bakıyor, dolayısıyla kodun
 * önce okunması gerekiyor. İlk sürüm okumayı ve silmeyi tek adımda yapıyordu ve sonuç
 * şuydu: sırrını yanlış yazan geliştiricinin kodu yanıyor, hata "invalid_client" yerine
 * "invalid_grant" olarak görünüyor ve tek harflik bir yazım hatası için baştan
 * yetkilendirme gerekiyordu.
 */
export async function peekCode(code: string): Promise<CodeRecord | null> {
  const { ok, json } = await rest(
    `oauth_codes?code_hash=eq.${encodeURIComponent(sha256(code))}&limit=1`
  );
  if (!ok || !rows(json).length) return null;

  const record = rows(json)[0] as CodeRecord;
  if (new Date(record.expires_at).getTime() < Date.now()) return null;
  return record;
}

/**
 * Kodu tüketir — tek kullanımlık olmasının tek garantisi bu.
 *
 * Silme DELETE ... returning ile yapılıyor, yani "oku, sonra sil" iki adımı yok: iki
 * eşzamanlı takas isteği gelirse yalnızca biri satırı alır, öteki boş döner ve belirteç
 * alamaz. Önce okuyup sonra silseydik ikisi de geçerli bir belirteç alırdı.
 *
 * Çağıranın bütün doğrulamaları yaptıktan SONRA, belirteci üretmeden hemen önce çağırması
 * gerekiyor: bu çağrı başarısız olursa kod başka bir istek tarafından kullanılmış demektir.
 */
export async function consumeCode(code: string): Promise<CodeRecord | null> {
  const { ok, json } = await rest(`oauth_codes?code_hash=eq.${encodeURIComponent(sha256(code))}`, {
    method: 'DELETE',
    prefer: 'return=representation'
  });
  if (!ok || !rows(json).length) return null;

  const record = rows(json)[0] as CodeRecord;
  // Süresi dolmuş kod silindi ama KULLANILAMAZ: kaydı almak onu geçerli kılmaz.
  if (new Date(record.expires_at).getTime() < Date.now()) return null;
  return record;
}

/** Süresi geçmiş kodları temizler; belirteç ucundan fırsat buldukça çağrılıyor. */
export async function pruneExpiredCodes(): Promise<void> {
  await rest(`oauth_codes?expires_at=lt.${encodeURIComponent(new Date().toISOString())}`, {
    method: 'DELETE'
  });
}

// -------------------------------------------------------------
// BELİRTEÇLER
// -------------------------------------------------------------

const ACCESS_TTL_MS = 60 * 60 * 1000;        // 1 saat
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;  // 30 gün

export interface IssuedTokens {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
  scope: string;
}

export async function issueTokens(input: {
  appId: string;
  userId: string;
  scopes: Scope[] | string[];
}): Promise<IssuedTokens | null> {
  const accessToken = secret(ACCESS_PREFIX);
  const refreshToken = secret(REFRESH_PREFIX);

  const { ok } = await rest('oauth_tokens', {
    method: 'POST',
    body: JSON.stringify([
      {
        id: `tok_${crypto.randomBytes(12).toString('hex')}`,
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
    token_type: 'Bearer',
    expires_in: Math.floor(ACCESS_TTL_MS / 1000),
    scope: (input.scopes as string[]).join(' ')
  };
}

export interface TokenRecord {
  id: string;
  app_id: string;
  user_id: string;
  scopes: string[];
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
}

/** Erişim belirtecini çözer. Süresi dolmuş, iptal edilmiş ya da bilinmeyen belirteç `null`. */
export async function resolveAccessToken(token: string): Promise<TokenRecord | null> {
  if (!token || !token.startsWith(ACCESS_PREFIX)) return null;
  const { ok, json } = await rest(
    `oauth_tokens?access_token_hash=eq.${encodeURIComponent(sha256(token))}&revoked_at=is.null&limit=1`
  );
  if (!ok || !rows(json).length) return null;

  const record = rows(json)[0] as TokenRecord;
  if (new Date(record.expires_at).getTime() < Date.now()) return null;
  return record;
}

/**
 * Yenileme belirtecini yenisiyle takas eder (dönerli yenileme).
 *
 * Eski yenileme belirteci ANINDA geçersizleşiyor: sızan bir belirtecin süresiz
 * kullanılabilmesi, 30 günlük ömrü sınırsıza çevirirdi.
 */
export async function refreshTokens(
  refreshToken: string,
  appId: string
): Promise<IssuedTokens | null> {
  if (!refreshToken || !refreshToken.startsWith(REFRESH_PREFIX)) return null;

  const { ok, json } = await rest(
    `oauth_tokens?refresh_token_hash=eq.${encodeURIComponent(sha256(refreshToken))}&revoked_at=is.null`,
    { method: 'DELETE', prefer: 'return=representation' }
  );
  if (!ok || !rows(json).length) return null;

  const record = rows(json)[0] as TokenRecord;

  // Belirteç BAŞKA bir uygulamaya aitse reddedilir: kimliğini doğrulamış bir istemci,
  // başkasının belirtecini kendi adına yenileyemez.
  if (record.app_id !== appId) return null;

  // Yenileme belirtecinin ömrü ayrı bir sütunda değil, satırın oluşturulma anından
  // hesaplanıyor: erişim belirtecinin `expires_at`i 1 saat, yenilemeninki 30 gün ve iki
  // ayrı süre sütunu tutmak, ikisinin birbirinden kaymasına açık kapı bırakırdı.
  const age = Date.now() - new Date(record.created_at).getTime();
  if (!Number.isFinite(age) || age > REFRESH_TTL_MS) return null;

  return issueTokens({ appId: record.app_id, userId: record.user_id, scopes: record.scopes });
}

export async function revokeToken(token: string): Promise<boolean> {
  const hash = sha256(token);
  const column = token.startsWith(REFRESH_PREFIX) ? 'refresh_token_hash' : 'access_token_hash';
  const { ok } = await rest(`oauth_tokens?${column}=eq.${encodeURIComponent(hash)}`, {
    method: 'DELETE'
  });
  return ok;
}

export async function touchToken(id: string): Promise<void> {
  await rest(`oauth_tokens?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ last_used_at: new Date().toISOString() })
  });
}

export async function touchApp(id: string): Promise<void> {
  const app = await getAppById(id);
  if (!app) return;
  await rest(`oauth_apps?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      last_used_at: new Date().toISOString(),
      request_count: Number(app.request_count || 0) + 1
    })
  });
}

// -------------------------------------------------------------
// İZİNLER (üyenin bağlı uygulamaları)
// -------------------------------------------------------------

export interface GrantRow {
  app_id: string;
  user_id: string;
  scopes: string[];
  created_at: string;
  updated_at: string;
}

export async function readGrant(appId: string, userId: string): Promise<GrantRow | null> {
  const { ok, json } = await rest(
    `oauth_grants?app_id=eq.${encodeURIComponent(appId)}&user_id=eq.${encodeURIComponent(userId)}&limit=1`
  );
  return ok && rows(json).length ? (rows(json)[0] as GrantRow) : null;
}

export async function writeGrant(appId: string, userId: string, scopes: Scope[] | string[]): Promise<boolean> {
  const { ok } = await rest('oauth_grants?on_conflict=app_id,user_id', {
    method: 'POST',
    body: JSON.stringify([
      { app_id: appId, user_id: userId, scopes, updated_at: new Date().toISOString() }
    ]),
    prefer: 'resolution=merge-duplicates'
  });
  return ok;
}

export async function listGrants(userId: string): Promise<GrantRow[]> {
  const { ok, json } = await rest(
    `oauth_grants?user_id=eq.${encodeURIComponent(userId)}&order=updated_at.desc&limit=100`
  );
  return ok ? (rows(json) as GrantRow[]) : [];
}

/** İzni kaldırır VE o uygulamanın bu üyeye ait bütün belirteçlerini siler. */
export async function revokeGrant(appId: string, userId: string): Promise<boolean> {
  await rest(
    `oauth_tokens?app_id=eq.${encodeURIComponent(appId)}&user_id=eq.${encodeURIComponent(userId)}`,
    { method: 'DELETE' }
  );
  const { ok } = await rest(
    `oauth_grants?app_id=eq.${encodeURIComponent(appId)}&user_id=eq.${encodeURIComponent(userId)}`,
    { method: 'DELETE' }
  );
  return ok;
}

/** Birden fazla uygulamayı tek sorguda okur (bağlı uygulamalar listesi için). */
export async function getAppsByIds(ids: string[]): Promise<OAuthAppRow[]> {
  if (ids.length === 0) return [];
  const list = ids.map((id) => `"${id.replace(/"/g, '')}"`).join(',');
  const { ok, json } = await rest(`oauth_apps?id=in.(${encodeURIComponent(list)})&limit=100`);
  return ok ? (rows(json) as OAuthAppRow[]) : [];
}
