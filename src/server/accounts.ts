/**
 * Profil tablosuna servis rolüyle erişen hesap/kimlik işlemleri.
 *
 * NEDEN AYRI BİR DOSYA VE NEDEN SERVİS ROLÜ
 *
 * Kimlik sütunları (`github_username`, `jubbio_user_id`, …) şemadaki koruma tetikleyicisi
 * tarafından kilitli: üyenin kendi oturumuyla bunları yazması ENGELLENİYOR. Sebebi basit —
 * yazabilseydi herkes başkasının GitHub adını kendi profiline yazıp onun depolarını kendi
 * vitrininde gösterebilirdi. Dolayısıyla bu sütunlara yalnızca sunucu, yalnızca kimliği
 * karşı taraf kanıtladıktan sonra dokunuyor.
 */

import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, safeFetch } from './security';

export function accountsConfigured(): boolean {
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

async function call(
  path: string,
  init: { method?: string; body?: string } = {}
): Promise<{ ok: boolean; status: number; json: any }> {
  const response = await safeFetch(`${SUPABASE_URL}${path}`, {
    method: init.method || 'GET',
    headers: adminHeaders(),
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

const rest = (pathAndQuery: string, init?: { method?: string; body?: string }) =>
  call(`/rest/v1/${pathAndQuery}`, init);

// -------------------------------------------------------------
// PROFİL ARAMA
// -------------------------------------------------------------

export interface C4EProfile {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  github_username: string | null;
  jubbio_user_id: string | null;
  jubbio_username: string | null;
}

const PROFILE_FIELDS =
  'id,username,display_name,email,github_username,jubbio_user_id,jubbio_username';

async function findProfile(filter: string): Promise<C4EProfile | null> {
  const { ok, json } = await rest(`profiles?${filter}&select=${PROFILE_FIELDS}&limit=1`);
  if (!ok || !Array.isArray(json) || json.length === 0) return null;
  return json[0] as C4EProfile;
}

export const findById = (id: string) => findProfile(`id=eq.${encodeURIComponent(id)}`);

export const findByEmail = (email: string) =>
  findProfile(`email=eq.${encodeURIComponent(email)}`);

// -------------------------------------------------------------
// GITHUB
// -------------------------------------------------------------

/**
 * Üyenin Supabase auth kaydındaki GitHub kimliğini okur.
 *
 * BU FONKSİYON, GİTHUB BAĞLAMANIN TEK DOĞRULUK KAYNAĞI. Tarayıcıdan gelen hiçbir iddia
 * kabul edilmiyor: kullanıcı adı, OAuth akışını Supabase'in kendisi tamamladıktan sonra
 * auth kaydına yazdığı kimlikten okunuyor. Eskiden bu alan elle yazılıyordu ve yalnızca
 * "böyle bir GitHub kullanıcısı var mı" diye sorulduğu için, üye başkasının kullanıcı adını
 * kendi profiline bağlayıp onun depolarını kendi profilinde gösterebiliyordu.
 */
export async function readGithubIdentity(
  userId: string
): Promise<{ username: string; avatarUrl: string | null } | null> {
  const { ok, json } = await call(`/auth/v1/admin/users/${encodeURIComponent(userId)}`);
  if (!ok) return null;

  const identities = Array.isArray(json?.identities) ? json.identities : [];
  const github = identities.find((i: any) => String(i?.provider || '') === 'github');
  if (!github) return null;

  const data = github.identity_data || {};
  // Supabase sağlayıcıya göre farklı adlar kullanıyor; GitHub'da `user_name` asıl giriş adı.
  const username = String(data.user_name || data.preferred_username || data.user_login || '');

  // KIRPMADAN doğrula. Önce 39 karaktere kırpıp sonra bakmak, geçersiz bir değeri geçerli
  // GÖRÜNEN başka birinin adına çevirir: "cok-cok-...-cok" 80 karakterken reddedilmeli,
  // kırpıldığında ise kusursuz bir GitHub kullanıcı adı olur ve kimseye ait olmayan (ya da
  // bambaşka birine ait) bir hesap profile yazılır. GitHub'ın kendi sınırı zaten 39 karakter.
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(username)) return null;

  return { username, avatarUrl: data.avatar_url ? String(data.avatar_url).slice(0, 500) : null };
}

/**
 * Bu GitHub kullanıcı adı başka bir profile bağlı mı?
 *
 * GitHub kullanıcı adları büyük/küçük harf duyarsız, bu yüzden karşılaştırma da öyle olmalı;
 * aksi hâlde "Owner" ve "owner" iki ayrı kayıt gibi görünür ve iki üye aynı depoları
 * kendi profilinde gösterir.
 */
export const findByGithubUsername = (username: string) =>
  findProfile(`github_username=ilike.${encodeURIComponent(username)}`);

export async function writeGithubLink(profileId: string, githubUsername: string): Promise<boolean> {
  const { ok } = await rest(`profiles?id=eq.${encodeURIComponent(profileId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      github_username: githubUsername,
      github_linked_at: new Date().toISOString()
    })
  });
  return ok;
}

export async function clearGithubLink(profileId: string): Promise<boolean> {
  const { ok } = await rest(`profiles?id=eq.${encodeURIComponent(profileId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ github_username: null, github_linked_at: null })
  });
  return ok;
}

// -------------------------------------------------------------
// JUBBIO
// -------------------------------------------------------------

/**
 * Jubbio hesabı için kalıcı anahtar `jubbio_user_id`. KULLANICI ADI DEĞİL.
 *
 * Kullanıcı adları karşı tarafta değişebiliyor; değiştiğinde bağ kopmamalı, yalnızca
 * gösterilen ad güncellenmeli. Tekillik de id üzerinden kuruluyor: aynı Jubbio hesabının iki
 * Code4Ever profiline bağlanması, ikisinin de "doğrulanmış" görünmesi demek olurdu.
 */
export const findByJubbioId = (jubbioUserId: string) =>
  findProfile(`jubbio_user_id=eq.${encodeURIComponent(jubbioUserId)}`);

export async function writeJubbioLink(
  profileId: string,
  identity: { id: string; username: string; avatarUrl?: string | null }
): Promise<boolean> {
  const { ok } = await rest(`profiles?id=eq.${encodeURIComponent(profileId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      jubbio_user_id: identity.id,
      jubbio_username: identity.username || null,
      jubbio_avatar_url: identity.avatarUrl ? String(identity.avatarUrl).slice(0, 500) : null,
      jubbio_linked_at: new Date().toISOString()
    })
  });
  return ok;
}

export async function clearJubbioLink(profileId: string): Promise<boolean> {
  const { ok } = await rest(`profiles?id=eq.${encodeURIComponent(profileId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      jubbio_user_id: null,
      jubbio_username: null,
      jubbio_avatar_url: null,
      jubbio_linked_at: null
    })
  });
  return ok;
}
