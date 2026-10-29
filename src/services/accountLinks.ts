/**
 * Tarayıcı tarafındaki hesap bağlama akışları: GitHub ve Jubbio.
 *
 * Burada hiçbir sır yok ve olmamalı. PKCE doğrulayıcısı, istemci sırrı ve belirteçler
 * sunucuda kalıyor; bu dosyanın yaptığı tek şey akışı başlatmak ve sonucu okumak.
 *
 * Aynı kural ikisinde de geçerli: BAĞLANAN HESABIN KİM OLDUĞUNU TARAYICI SÖYLEMİYOR.
 * Kullanıcı adı hiçbir istekte gövdeye yazılmıyor; sunucu onu karşı tarafın kendi
 * yanıtından okuyor. Aksi hâlde isteği elle kuran biri istediği hesabı kendi profiline
 * yazabilirdi.
 */

import { apiFetchJson } from './apiClient';
import { getSupabaseClient } from './supabaseClient';

export interface AccountLinkState {
  linked: boolean;
  username?: string | null;
}

export interface AccountLinks {
  github: AccountLinkState;
  jubbio: AccountLinkState;
  jubbioConfigured: boolean;
  jubbioReason: string | null;
}

export async function fetchAccountLinks(): Promise<AccountLinks | null> {
  const { ok, data } = await apiFetchJson<AccountLinks>('/api/auth/links/status');
  return ok && data ? data : null;
}

// -------------------------------------------------------------
// GITHUB
// -------------------------------------------------------------

/**
 * GitHub hesabını bağlar — girişteki akışın aynısı.
 *
 * İki adım var ve sırası önemli:
 *   1. Önce sunucuya sorulur. GitHub ile giriş yapmış birinin kimliği auth kaydında zaten
 *      durur, dolayısıyla hiçbir yönlendirmeye gerek kalmadan bağlanır.
 *   2. Kimlik yoksa yetkilendirme başlatılır ve kullanıcı GitHub'a gider.
 */
export async function linkGithub(): Promise<{ ok: boolean; error?: string; redirecting?: boolean }> {
  const { ok, data } = await apiFetchJson<{ error?: string; message?: string }>('/api/auth/github/link', {
    method: 'POST'
  });

  if (ok) return { ok: true };

  if (data?.error === 'github_already_linked') {
    return { ok: false, error: data.message || 'Bu GitHub hesabı başka bir hesaba bağlı.' };
  }

  if (data?.error !== 'needs_authorization') {
    return { ok: false, error: data?.message || 'GitHub hesabı bağlanamadı.' };
  }

  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'GitHub bağlantısı şu anda kullanılamıyor.' };

  // Girişle aynı sağlayıcı ve aynı tam sayfa yönlendirmesi; dönüşteki işareti
  // AccountLinksSettings okuyup bağlamayı tamamlıyor.
  const redirectTo = new URL(window.location.href);
  redirectTo.searchParams.set('github', 'linking');

  const { error } = await client.auth.linkIdentity({
    provider: 'github',
    options: { redirectTo: redirectTo.toString(), scopes: 'read:user' }
  });

  if (error) {
    /*
     * "Identity is already linked": hesapta GitHub kimliği ZATEN var demek — yani üye
     * GitHub ile kayıt olmuş. Bu durumda sunucunun kullanıcı adını kimlikten okuyup
     * bitirmiş olması gerekirdi; okuyamadıysa sebebi genelde yapılandırmadır
     * (SUPABASE_SERVICE_ROLE_KEY eksikse yönetici API'sine hiç ulaşılamaz).
     *
     * Bir kez daha deniyoruz: geçici bir aksaklıksa bu onu çözer. Hâlâ olmuyorsa
     * kullanıcıya İNGİLİZCE ham hata yerine ne olduğunu söylüyoruz — "hata veriyor"
     * diye geri bildirilen şey tam olarak o ham hataydı.
     */
    if (/already linked/i.test(error.message)) {
      const healed = await reconcileGithubLink({ force: true });
      if (healed) return { ok: true };
      return {
        ok: false,
        error:
          'GitHub hesabın bu hesapta zaten bağlı görünüyor ama kaydedilemedi. ' +
          'Sunucu yapılandırması eksik olabilir; yöneticiye bildir.'
      };
    }

    // Supabase projesinde "Manual linking" kapalıysa buraya düşülür; sebebi gizlemek
    // kullanıcıyı da yöneticiyi de boşuna uğraştırır.
    return {
      ok: false,
      error: /manual linking/i.test(error.message)
        ? 'GitHub bağlama kapalı görünüyor (Supabase > Authentication > Manual linking).'
        : error.message
    };
  }

  return { ok: true, redirecting: true };
}

/**
 * GitHub ile kayıt olmuş üyelerin bağlantısını sessizce onarır.
 *
 * SORUN: GitHub ile kayıt olan birinin auth kaydında GitHub kimliği ZATEN vardır, ama
 * `profiles.github_username` sütununu hiçbir şey doldurmuyordu — o sütun sonradan eklendi.
 * Sonuç, üyeye zaten yaptığı bağlamayı yeniden yapmasını söylemekti: "GitHub hesabını bağla",
 * oysa hesabı o zaten GitHub'dı.
 *
 * ÇÖZÜM: bağlama ucu kullanıcı adını auth kaydındaki kimlikten okuyor, yani yetkilendirmeye
 * hiç gitmeden çalışabiliyor. Burada tam olarak o çağrılıyor. Kimlik yoksa uç
 * `needs_authorization` döner ve hiçbir şey olmaz — üye Ayarlar'dan kendisi bağlar.
 *
 * Oturum başına EN FAZLA BİR KEZ denenir: kimliği olmayan üyede her açılışta boşuna istek
 * göndermek, düzeltmeye çalıştığımız sorundan daha pahalı olurdu.
 */
const RECONCILE_FLAG = 'c4e_github_reconciled';

export async function reconcileGithubLink(options: { force?: boolean } = {}): Promise<string | null> {
  // `force`: üye proje oluşturmaya çalışıyor, yani onarımın önemli olduğu tek an. Oturum
  // bayrağı yüzünden bu denemeyi atlamak, kullanıcıyı çözülebilir bir engelin önünde
  // bırakırdı.
  if (!options.force) {
    try {
      if (sessionStorage.getItem(RECONCILE_FLAG)) return null;
      sessionStorage.setItem(RECONCILE_FLAG, '1');
    } catch {
      // Gizli sekmede sessionStorage erişimi hata verebilir; bayrak tutulamazsa da akış
      // çalışmalı, yalnızca tekrar denenir.
    }
  }

  const { ok, data } = await apiFetchJson<{ username?: string }>('/api/auth/github/link', {
    method: 'POST'
  });
  return ok && data?.username ? data.username : null;
}

export async function unlinkGithub(): Promise<{ ok: boolean; error?: string }> {
  const { ok, data } = await apiFetchJson<{ message?: string }>('/api/auth/github/unlink', {
    method: 'POST'
  });
  return ok ? { ok: true } : { ok: false, error: data?.message || 'Bağlantı kaldırılamadı.' };
}

// -------------------------------------------------------------
// JUBBIO
// -------------------------------------------------------------

/**
 * Jubbio akışını başlatır ve kullanıcıyı onay sayfasına gönderir.
 *
 * Neden önce fetch, sonra yönlendirme: sunucunun kimin hesabına bağlanacağını bilmesi
 * gerekiyor ve oturum `Authorization` başlığında taşınıyor. Üst düzey bir yönlendirme o
 * başlığı taşımaz, bu yüzden adresi önce fetch ile alıp oraya kendimiz gidiyoruz.
 */
export async function startJubbioLink(): Promise<{ ok: boolean; error?: string }> {
  const { ok, data } = await apiFetchJson<{ url?: string; message?: string }>('/api/auth/jubbio/start');

  if (!ok || !data?.url) {
    return { ok: false, error: data?.message || 'Jubbio bağlantısı şu anda kullanılamıyor.' };
  }

  window.location.href = data.url;
  return { ok: true };
}

export async function unlinkJubbio(): Promise<{ ok: boolean; error?: string }> {
  const { ok, data } = await apiFetchJson<{ message?: string }>('/api/auth/jubbio/unlink', {
    method: 'POST'
  });
  return ok ? { ok: true } : { ok: false, error: data?.message || 'Bağlantı kaldırılamadı.' };
}
