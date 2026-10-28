/**
 * Topluluk–proje bağları.
 *
 * Bir projenin hangi topluluklarda paylaşıldığını yöneten sunucu tarafı. Üç kural
 * burada zorunlu tutuluyor ve ÜÇÜ DE veritabanındaki RLS politikalarıyla ikinci kez
 * korunuyor — ikisi birden olmasının sebebi, bu uçların servis anahtarıyla çalışması:
 * servis rolü RLS'i atladığı için kuralı burada da yazmazsak hiçbir yerde yazmamış
 * oluruz.
 *
 *   1. Projeyi topluluğa yalnızca SAHİBİ ekleyebilir. Olmasaydı herkes başkasının
 *      projesini istediği topluluğa sokar, sahibinin adı orada görünürdü.
 *   2. Yalnızca ÜYESİ OLDUĞU topluluğa ekleyebilir. Olmasaydı bir üye hiç katılmadığı
 *      topluluklara projesini serpiştirip reklam yapardı.
 *   3. Kaldırmayı projenin sahibi VEYA topluluğun kurucusu yapabilir. İkincisi
 *      moderasyon için şart: yoksa topluluk sahibi, topluluğuna konan alakasız bir
 *      projeyi kaldıramazdı.
 */
import { safeFetch } from './security';
import type { CommunityRow } from './communityApi';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function adminHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

async function rest(
  pathAndQuery: string,
  init: { method?: string; body?: string; headers?: Record<string, string> } = {}
): Promise<{ ok: boolean; status: number; rows: any[] }> {
  const response = await safeFetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method: init.method || 'GET',
    headers: adminHeaders(init.headers),
    body: init.body,
    timeoutMs: 15000,
    maxResponseBytes: 4 * 1024 * 1024
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

export function communityProjectsConfigured(): boolean {
  return Boolean(SUPABASE_URL && SERVICE_KEY);
}

/**
 * Topluluk satırının bu modülde kullanılan şekli.
 *
 * Sorgunun kendisi `communityApi` içinde; burada yeniden yazmak aynı select'i iki
 * yerde tutmak ve biri değişince diğerinin sessizce eskimesi demekti.
 */
export type CommunityFacts = CommunityRow;

/**
 * Üyelik, üyenin KENDİ profilindeki joined_communities dizisinde tutuluyor.
 *
 * İstemcinin "ben üyeyim" demesine güvenilmiyor: dizinin kendisi sunucudan okunuyor.
 */
export async function isMemberOf(userId: string, communityId: string): Promise<boolean> {
  if (!userId || !communityId) return false;
  const { ok, rows } = await rest(
    `profiles?id=eq.${encodeURIComponent(userId)}&select=joined_communities&limit=1`
  );
  if (!ok || !rows[0]) return false;
  const raw = rows[0].joined_communities;
  const list = Array.isArray(raw) ? raw : [];
  return list.map(String).includes(communityId);
}

/** Topluluğun kurucusu mu? Moderasyon yetkisi buna bakıyor. */
export function isCommunityOwner(community: CommunityFacts, userId: string, username?: string): boolean {
  if (!userId) return false;
  if (community.created_by && String(community.created_by) === userId) return true;
  if (username && community.creator_username) {
    return String(community.creator_username).toLowerCase() === username.toLowerCase();
  }
  return false;
}

/**
 * Gizli bir topluluğun içeriğini kim görebilir?
 *
 * Topluluğun kendisi gizliyken proje listesinin dışarıdan okunabilmesi, gizliliğin
 * yarısını boşa çıkarırdı: hangi projeleri barındırdığı da bir bilgidir.
 */
export async function canSeeCommunity(
  community: CommunityFacts,
  userId?: string,
  isAdmin?: boolean
): Promise<boolean> {
  if (!community.is_private) return true;
  if (isAdmin) return true;
  if (!userId) return false;
  return isMemberOf(userId, community.id);
}

/** Bir topluluğa bağlı projelerin kimlikleri (en yeni önce). */
export async function listCommunityProjectLinks(
  communityId: string,
  limit: number
): Promise<Array<{ project_id: string; added_by: string; added_by_username: string | null; created_at: string }>> {
  const { ok, rows } = await rest(
    `community_projects?community_id=eq.${encodeURIComponent(communityId)}` +
      `&select=project_id,added_by,added_by_username,created_at` +
      `&order=created_at.desc&limit=${limit}`
  );
  return ok ? (rows as any[]) : [];
}

/** Bir projenin bağlı olduğu toplulukların kimlikleri. */
export async function listProjectCommunityIds(projectId: string): Promise<string[]> {
  const { ok, rows } = await rest(
    `community_projects?project_id=eq.${encodeURIComponent(projectId)}&select=community_id`
  );
  return ok ? rows.map((r: any) => String(r.community_id)) : [];
}

export async function linkExists(communityId: string, projectId: string): Promise<boolean> {
  const { ok, rows } = await rest(
    `community_projects?community_id=eq.${encodeURIComponent(communityId)}` +
      `&project_id=eq.${encodeURIComponent(projectId)}&select=project_id&limit=1`
  );
  return ok && rows.length > 0;
}

export async function addProjectToCommunity(
  communityId: string,
  projectId: string,
  addedBy: string,
  addedByUsername?: string
): Promise<boolean> {
  const { ok } = await rest('community_projects', {
    method: 'POST',
    // Aynı bağ ikinci kez gönderildiğinde hata değil sessiz geçiş: kullanıcı iki kez
    // tıkladığında ekrana hata basmanın bir anlamı yok, sonuç zaten istenen durum.
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
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

export async function removeProjectFromCommunity(communityId: string, projectId: string): Promise<boolean> {
  const { ok } = await rest(
    `community_projects?community_id=eq.${encodeURIComponent(communityId)}` +
      `&project_id=eq.${encodeURIComponent(projectId)}`,
    { method: 'DELETE', headers: { Prefer: 'return=minimal' } }
  );
  return ok;
}

/**
 * Bir projenin silinmesi, bağlarını da götürmeli.
 *
 * Bırakılsaydı topluluk listesinde "ölü" bağlar kalırdı ve sayaç gerçek olmayan bir
 * sayıyı gösterirdi. Proje silme akışı bunu çağırıyor.
 */
export async function removeAllLinksForProject(projectId: string): Promise<void> {
  await rest(`community_projects?project_id=eq.${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' }
  });
}
