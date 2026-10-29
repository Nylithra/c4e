/**
 * Jubbio hesabı bağlama — OAuth2 + PKCE istemcisi.
 *
 * Jubbio'nun kendi SDK'sı (jubbio-sdk) akışın TAMAMINI tarayıcıda yürütüyor: kodu tarayıcı
 * takas ediyor, belirteçleri localStorage'a koyuyor ve kullanıcı bilgisini oradan okuyor. Burada
 * bilinçli olarak bunu yapmıyoruz.
 *
 * NEDEN AKIŞ SUNUCUDA
 *
 * Bağlama, "bu Code4Ever profili şu Jubbio hesabına ait" diye bir İDDİAYI kaydediyor ve o kayıt
 * profilde doğrulanmış bir işaret olarak görünüyor. İddianın kanıtı tarayıcıdan gelemez: kodu
 * tarayıcı takas edip sonuçta çıkan kullanıcı adını bize gönderseydi, isteği elle kurup
 * istediği Jubbio hesabını kendi profiline yazmak önüne hiçbir engel kalmazdı. Bu yüzden kodu
 * sunucu takas ediyor, kullanıcıyı sunucu okuyor ve profile yalnızca sunucunun okuduğu değer
 * yazılıyor. Tarayıcı akışta yalnızca yönlendirmeyi taşıyor.
 *
 * İstemci sırrı yok — Jubbio uygulamaları açık istemci (public client) ve koruma PKCE'den
 * geliyor: kod ele geçirilse bile doğrulayıcı olmadan belirteçle takas edilemez.
 */

import { env, safeFetch } from './security';

const DEFAULT_API_BASE = 'https://gateway.jubbio.com';
const DEFAULT_AUTHORIZE_BASE = 'https://jubbio.com';

export interface JubbioConfig {
  clientId: string;
  redirectUri: string;
  /** Yetkilendirme (onay) sayfasının bulunduğu kök adres. */
  authorizeBase: string;
  /** Belirteç ve kaynak uçlarının bulunduğu kök adres. */
  apiBase: string;
  scopes: string;
}

export function getJubbioConfig(): JubbioConfig | null {
  const clientId = env('JUBBIO_CLIENT_ID');
  const redirectUri = env('JUBBIO_REDIRECT_URI');
  if (!clientId || !redirectUri) return null;

  return {
    clientId,
    redirectUri,
    authorizeBase: (env('JUBBIO_AUTHORIZE_URL') || DEFAULT_AUTHORIZE_BASE).replace(/\/+$/, ''),
    apiBase: (env('JUBBIO_API_BASE') || DEFAULT_API_BASE).replace(/\/+$/, ''),
    // `identify` SDK'nın da varsayılanı: kimliği okumaya yetiyor, fazlasını istemek
    // kullanıcıdan gereksiz izin istemek olurdu.
    scopes: env('JUBBIO_SCOPES') || 'identify'
  };
}

export function jubbioUnavailableReason(): string | null {
  return getJubbioConfig()
    ? null
    : 'Jubbio bağlantısı yapılandırılmamış (JUBBIO_CLIENT_ID / JUBBIO_REDIRECT_URI eksik).';
}

/**
 * SSRF koruması için izin verilen konaklar.
 *
 * safeFetch zaten özel/loopback adresleri reddediyor, ama hedef konağı da daraltmak gerekiyor:
 * JUBBIO_API_BASE bir yapılandırma değeri ve yanlış (ya da kötü niyetle değiştirilmiş) bir
 * değer, kullanıcının yetkilendirme kodunu başkasının sunucusuna göndermek demek olurdu.
 */
function apiHosts(config: JubbioConfig): string[] {
  try {
    return [new URL(config.apiBase).hostname];
  } catch {
    return [];
  }
}

export function buildJubbioAuthorizeUrl(
  config: JubbioConfig,
  params: { state: string; challenge: string }
): string {
  const url = new URL(`${config.authorizeBase}/oauth2/authorize`);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', config.scopes);
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', params.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export interface JubbioTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

export async function exchangeJubbioCode(
  config: JubbioConfig,
  code: string,
  verifier: string
): Promise<{ ok: boolean; tokens?: JubbioTokens; error?: string }> {
  // Gövde JSON — Jubbio'nun belirteç ucu form kodlaması değil JSON bekliyor.
  // safeFetch zaman aşımında ve bağlantı hatasında FIRLATIYOR; yakalanmazsa akış 500 ile
  // düşer ve kullanıcı sebebini göremez.
  let response: Awaited<ReturnType<typeof safeFetch>>;
  try {
    response = await safeFetch(`${config.apiBase}/api/v1/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        code_verifier: verifier
      }),
      allowedHosts: apiHosts(config),
      timeoutMs: 15000,
      maxResponseBytes: 256 * 1024
    });
  } catch (err: any) {
    return { ok: false, error: String(err?.message || 'Jubbio sunucusuna ulaşılamadı.').slice(0, 200) };
  }

  let parsed: any = null;
  try {
    parsed = JSON.parse(response.text || '{}');
  } catch {
    parsed = null;
  }

  if (!response.ok || !parsed?.access_token) {
    // RFC 6749 biçimindeki hata teşhis için taşınır; belirteçler ASLA taşınmaz.
    const code = String(parsed?.error || `http_${response.status}`);
    const detail = String(parsed?.error_description || '').slice(0, 200);
    return { ok: false, error: detail ? `${code}: ${detail}` : code };
  }

  return { ok: true, tokens: parsed as JubbioTokens };
}

export interface JubbioIdentity {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

/** Kimliğin TEK kaynağı: belirteçle Jubbio'nun kendisine sorulan `@me` yanıtı. */
export async function fetchJubbioUser(
  config: JubbioConfig,
  accessToken: string
): Promise<{ ok: boolean; identity?: JubbioIdentity; error?: string }> {
  let response: Awaited<ReturnType<typeof safeFetch>>;
  try {
    response = await safeFetch(`${config.apiBase}/api/v1/oauth2/users/@me`, {
      headers: { authorization: `Bearer ${accessToken}` },
      allowedHosts: apiHosts(config),
      timeoutMs: 15000,
      maxResponseBytes: 256 * 1024
    });
  } catch (err: any) {
    return { ok: false, error: String(err?.message || 'Jubbio sunucusuna ulaşılamadı.').slice(0, 200) };
  }

  let parsed: any = null;
  try {
    parsed = JSON.parse(response.text || 'null');
  } catch {
    parsed = null;
  }

  const id = String(parsed?.id || '');
  if (!response.ok || !id) {
    return { ok: false, error: `Jubbio hesap bilgisi alınamadı (http_${response.status}).` };
  }

  return {
    ok: true,
    identity: {
      id: id.slice(0, 80),
      username: String(parsed.username || '').slice(0, 80),
      displayName: String(parsed.display_name || parsed.username || '').slice(0, 120),
      avatarUrl: parsed.avatar_url ? String(parsed.avatar_url).slice(0, 500) : null
    }
  };
}
