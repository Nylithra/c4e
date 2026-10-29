/**
 * Code4Ever API — geliştirici uygulamaları ve bağlı uygulamalar, tarayıcı tarafı.
 *
 * Buradaki hiçbir çağrı sır TAŞIMIYOR. İstemci sırrı sunucuda yalnızca özet olarak duruyor
 * ve düz metin hâli tek bir yanıtta, bir kez geçiyor; bu dosya onu alıp ekrana veriyor ve
 * hiçbir yere kaydetmiyor. Saklamak (localStorage, çerez) sırrı her XSS'e açık hâle
 * getirirdi; kaybeden geliştirici yenisini üretiyor.
 */

import { apiFetchJson } from './apiClient';

export interface ScopeInfo {
  key: string;
  tr: string;
  en: string;
}

export interface DevApp {
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

export interface AppFacts {
  client_id: string;
  name: string;
  description: string | null;
  website_url: string | null;
  logo_url: string | null;
  owner_username: string | null;
}

export interface Authorization {
  app: AppFacts;
  scopes: string[];
  granted_at: string;
  updated_at: string;
}

export async function fetchScopes(): Promise<ScopeInfo[]> {
  const { ok, data } = await apiFetchJson<{ scopes: ScopeInfo[] }>('/api/dev/scopes', { auth: false });
  return ok && data?.scopes ? data.scopes : [];
}

export async function fetchApps(): Promise<{ apps: DevApp[]; limit: number } | null> {
  const { ok, data } = await apiFetchJson<{ apps: DevApp[]; limit: number }>('/api/dev/apps');
  return ok && data ? { apps: data.apps || [], limit: data.limit || 10 } : null;
}

export interface AppDraft {
  name: string;
  description?: string;
  website_url?: string;
  redirect_uris: string[];
  scopes: string[];
}

export async function createApp(
  draft: AppDraft
): Promise<{ ok: boolean; app?: DevApp; clientSecret?: string; error?: string }> {
  const { ok, data } = await apiFetchJson<{ app: DevApp; client_secret: string; message?: string }>(
    '/api/dev/apps',
    { method: 'POST', json: draft }
  );
  return ok && data?.app
    ? { ok: true, app: data.app, clientSecret: data.client_secret }
    : { ok: false, error: data?.message || 'Uygulama oluşturulamadı.' };
}

export async function updateApp(
  id: string,
  patch: Partial<AppDraft>
): Promise<{ ok: boolean; app?: DevApp; error?: string }> {
  const { ok, data } = await apiFetchJson<{ app: DevApp; message?: string }>(`/api/dev/apps/${id}`, {
    method: 'PATCH',
    json: patch
  });
  return ok && data?.app ? { ok: true, app: data.app } : { ok: false, error: data?.message || 'Kaydedilemedi.' };
}

export async function rotateSecret(id: string): Promise<{ ok: boolean; clientSecret?: string; error?: string }> {
  const { ok, data } = await apiFetchJson<{ client_secret: string; message?: string }>(
    `/api/dev/apps/${id}/rotate`,
    { method: 'POST' }
  );
  return ok && data?.client_secret
    ? { ok: true, clientSecret: data.client_secret }
    : { ok: false, error: data?.message || 'Sır yenilenemedi.' };
}

export async function deleteApp(id: string): Promise<boolean> {
  const { ok } = await apiFetchJson(`/api/dev/apps/${id}`, { method: 'DELETE' });
  return ok;
}

// -------------------------------------------------------------
// ONAY EKRANI
// -------------------------------------------------------------

export interface ConsentInfo {
  app: AppFacts;
  scopes: ScopeInfo[];
}

/**
 * Onay ekranının verisi.
 *
 * Doğrulamanın TAMAMI sunucuda; bu çağrı yalnızca sonucu okuyor. Hata durumunda mesaj
 * olduğu gibi gösteriliyor, çünkü hatayı görecek olan genelde kullanıcı değil, uygulamayı
 * yanlış yapılandırmış geliştirici.
 */
export async function fetchConsentInfo(params: {
  clientId: string;
  redirectUri: string;
  scope: string;
}): Promise<{ ok: boolean; info?: ConsentInfo; error?: string }> {
  const query = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    scope: params.scope
  });
  const { ok, data } = await apiFetchJson<ConsentInfo & { message?: string }>(
    `/api/oauth/app-info?${query.toString()}`,
    { auth: false }
  );
  return ok && data?.app
    ? { ok: true, info: { app: data.app, scopes: data.scopes || [] } }
    : { ok: false, error: data?.message || 'Uygulama bilgisi alınamadı.' };
}

export async function approveAuthorization(params: {
  clientId: string;
  redirectUri: string;
  scope: string;
  state?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
}): Promise<{ ok: boolean; redirect?: string; error?: string }> {
  const { ok, data } = await apiFetchJson<{ redirect: string; message?: string }>('/api/oauth/authorize', {
    method: 'POST',
    json: {
      client_id: params.clientId,
      redirect_uri: params.redirectUri,
      scope: params.scope,
      state: params.state,
      code_challenge: params.codeChallenge,
      code_challenge_method: params.codeChallengeMethod
    }
  });
  return ok && data?.redirect
    ? { ok: true, redirect: data.redirect }
    : { ok: false, error: data?.message || 'İzin verilemedi.' };
}

// -------------------------------------------------------------
// BAĞLI UYGULAMALAR
// -------------------------------------------------------------

export async function fetchAuthorizations(): Promise<Authorization[]> {
  const { ok, data } = await apiFetchJson<{ authorizations: Authorization[] }>('/api/oauth/authorizations');
  return ok && data?.authorizations ? data.authorizations : [];
}

export async function revokeAuthorization(clientId: string): Promise<boolean> {
  const { ok } = await apiFetchJson(`/api/oauth/authorizations/${clientId}`, { method: 'DELETE' });
  return ok;
}
