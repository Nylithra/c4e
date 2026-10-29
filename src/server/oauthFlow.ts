/**
 * OAuth akışlarının paylaşılan parçaları: PKCE, imzalı akış durumu ve sır şifreleme.
 *
 * Bu dosya BİR SAĞLAYICIYA AİT DEĞİL. Aynı üç ihtiyaç her akışta tekrar ediyor — Jubbio
 * hesabı bağlamak, Code4Ever'in kendi uygulama yetkilendirmesi — ve her birinde yeniden
 * yazılması, birinde düzeltilen bir hatanın ötekinde kalması demek olurdu.
 *
 * NEDEN AKIŞ DURUMU SUNUCUDA TUTULMUYOR
 *
 * Uygulama sunucusuz bir fonksiyon olarak da çalışıyor; istekler arasında bellek paylaşmıyor,
 * dolayısıyla "state → sır" sözlüğü orada hiç çalışmaz. Bunun yerine durum, HMAC ile imzalı
 * tek bir dizeye paketlenip httpOnly çerezde taşınıyor: imza paketin bizim ürettiğimizi ve
 * değiştirilmediğini kanıtlıyor, çerezin httpOnly olması da PKCE doğrulayıcısının tarayıcı
 * JavaScript'ine görünmesini engelliyor.
 */

import crypto from 'node:crypto';
import { env, hmacHex, safeEquals } from './security';

// -------------------------------------------------------------
// PKCE
// -------------------------------------------------------------

export function createPkce(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url');
  return { verifier, challenge: sha256Base64Url(verifier) };
}

/** PKCE doğrulaması: istemcinin gönderdiği doğrulayıcı, saklanan meydan okumayı üretiyor mu? */
export function pkceMatches(verifier: string, challenge: string, method: string): boolean {
  if (!verifier || !challenge) return false;
  // `plain` KABUL EDİLMİYOR. Kodu ele geçiren saldırgan doğrulayıcıyı da görmüş olur ve
  // PKCE'nin tek koruması ortadan kalkar; S256 zaten her istemcide mevcut.
  if (method !== 'S256') return false;
  return safeEquals(sha256Base64Url(verifier), challenge);
}

export function sha256Base64Url(input: string): string {
  return crypto.createHash('sha256').update(input).digest('base64url');
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

// -------------------------------------------------------------
// İMZALI AKIŞ DURUMU
// -------------------------------------------------------------

interface Sealed {
  issuedAt: number;
}

export function sealFlow<T extends object>(payload: T): string {
  const body = Buffer.from(JSON.stringify({ ...payload, issuedAt: Date.now() }), 'utf8').toString('base64url');
  return `${body}.${hmacHex(flowSecret(), body)}`;
}

/**
 * Paketi açar. İmzası tutmayan, bozuk ya da süresi dolmuş paket `null` döner — çağıranın
 * ayrıca süre kontrolü yapmasına gerek yok.
 */
export function openFlow<T extends object>(sealed: unknown, maxAgeMs = 10 * 60 * 1000): (T & Sealed) | null {
  const raw = String(sealed || '');
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return null;

  const body = raw.slice(0, dot);
  if (!safeEquals(raw.slice(dot + 1), hmacHex(flowSecret(), body))) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T & Sealed;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Number.isFinite(parsed.issuedAt) || Date.now() - parsed.issuedAt > maxAgeMs) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Akış paketlerini ve saklanan sırları koruyan anahtar.
 *
 * OAUTH_STATE_SECRET verilmezse süreç başına rastgele bir değer üretilir: yerel geliştirmede
 * akış çalışır ama sunucu yeniden başlayınca yarım kalan akışlar düşer ve ŞİFRELİ KAYITLAR
 * OKUNAMAZ HÂLE GELİR. Üretimde değeri sabitlemek zorunlu.
 */
let fallbackSecret = '';
export function flowSecret(): string {
  const configured = env('OAUTH_STATE_SECRET') || env('LANUX_STATE_SECRET');
  if (configured) return configured;
  if (!fallbackSecret) fallbackSecret = crypto.randomBytes(32).toString('hex');
  return fallbackSecret;
}

export function flowSecretConfigured(): boolean {
  return Boolean(env('OAUTH_STATE_SECRET') || env('LANUX_STATE_SECRET'));
}

// -------------------------------------------------------------
// SIR ŞİFRELEME (AES-256-GCM)
// -------------------------------------------------------------

/**
 * Yenileme belirteci gibi değerler veritabanında düz metin durmamalı: onları ele geçiren,
 * kullanıcının karşı taraftaki hesabına süresiz erişir. GCM seçildi çünkü hem şifreliyor hem
 * BÜTÜNLÜK doğruluyor — yalnızca şifreleyen bir kip (CBC gibi) saldırganın şifreli metni
 * kurcalamasına izin verirdi.
 */
function encryptionKey(purpose: string): Buffer {
  return crypto.createHash('sha256').update(`${purpose}:${flowSecret()}`).digest();
}

export function encryptSecret(plaintext: string, purpose = 'oauth-token'): string {
  if (!plaintext) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(purpose), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url')
  ].join('.');
}

export function decryptSecret(stored: unknown, purpose = 'oauth-token'): string | null {
  const parts = String(stored || '').split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      encryptionKey(purpose),
      Buffer.from(parts[1], 'base64url')
    );
    decipher.setAuthTag(Buffer.from(parts[2], 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    // Bozuk, kurcalanmış ya da başka bir sırla şifrelenmiş kayıt: sessizce yok sayılır ve
    // kullanıcı yeniden bağlanır. Hata fırlatmak, tek bozuk satır yüzünden akışı düşürürdü.
    return null;
  }
}
