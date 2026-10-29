import React, { useState } from 'react';
import { Check, Copy, KeyRound, ShieldAlert, Terminal, Zap } from 'lucide-react';
import { PublicPageShell, Section } from './PublicPageShell';

interface DevDocsViewProps {
  language: 'tr' | 'en';
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  POST: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  DELETE: 'bg-rose-500/15 text-rose-300 border-rose-500/30'
};

const CodeBlock: React.FC<{ code: string; label?: string }> = ({ code, label }) => {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard?.writeText(code).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      },
      () => undefined
    );
  };

  return (
    <div className="c4e-well overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-3 py-1.5">
        <span className="font-mono text-[11px] text-zinc-500">{label || 'example'}</span>
        <button
          type="button"
          onClick={copy}
          aria-label="Kopyala"
          className="flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-[11px] text-zinc-400 transition-colors hover:bg-white/[0.09] hover:text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          <span>{copied ? 'Kopyalandı' : 'Kopyala'}</span>
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-[12px] leading-relaxed text-zinc-300">
        <code>{code}</code>
      </pre>
    </div>
  );
};

const Endpoint: React.FC<{
  method: keyof typeof METHOD_COLORS;
  path: string;
  auth: string;
  children: React.ReactNode;
}> = ({ method, path, auth, children }) => (
  <div className="c4e-card space-y-3 p-4">
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={`rounded-md border px-2 py-0.5 font-mono text-[11px] font-bold ${METHOD_COLORS[method]}`}
      >
        {method}
      </span>
      <code className="user-text font-mono text-[13px] text-white">{path}</code>
      <span className="ml-auto rounded-full border border-white/[0.12] bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] text-zinc-400">
        {auth}
      </span>
    </div>
    <div className="space-y-3 text-[13px] leading-relaxed text-zinc-400">{children}</div>
  </div>
);

const Table: React.FC<{ head: string[]; rows: Array<Array<React.ReactNode>> }> = ({ head, rows }) => (
  <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
    <table className="w-full min-w-[420px] border-collapse text-left text-[12px]">
      <thead>
        <tr className="bg-white/[0.04]">
          {head.map((h) => (
            <th key={h} className="px-3 py-2 font-semibold text-zinc-300">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-t border-white/[0.07]">
            {row.map((cell, j) => (
              <td key={j} className="px-3 py-2 align-top text-zinc-400">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const DevDocsView: React.FC<DevDocsViewProps> = ({ language }) => {
  const tr = language === 'tr';
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://app.lanux.online';

  /*
   * Sayfa artık İKİ API anlatıyor ve ikisi farklı soruyu çözüyor:
   *   Code4Ever API  — ÜYENİN İZNİYLE onun verisine erişmek (OAuth2, /dev/apps).
   *   Topluluk API   — bir topluluğa makine olarak gönderi yayınlamak (API anahtarı).
   * Gezinme bu ayrımı taşıyor; tek düz liste, hangi anahtarın nerede kullanıldığını
   * karıştırmanın en kısa yoluydu.
   */
  const nav = [
    { id: 'baslangic', label: tr ? 'Başlangıç' : 'Getting started' },
    { id: 'uygulama', label: tr ? 'Uygulama oluşturma' : 'Creating an app' },
    { id: 'oauth', label: tr ? 'OAuth2 akışı' : 'OAuth2 flow' },
    { id: 'kapsamlar', label: tr ? 'Kapsamlar ve uçlar' : 'Scopes & endpoints' },
    { id: 'kimlik', label: tr ? 'Topluluk API: kimlik' : 'Community API: auth' },
    { id: 'anahtar', label: tr ? 'Anahtar yönetimi' : 'Key management' },
    { id: 'endpointler', label: tr ? 'Topluluk uçları' : 'Community endpoints' },
    { id: 'ornekler', label: tr ? 'Örnekler' : 'Examples' },
    { id: 'hatalar', label: tr ? 'Hata kodları' : 'Error codes' },
    { id: 'limitler', label: tr ? 'Limitler' : 'Limits' },
    { id: 'kurallar', label: tr ? 'Kullanım kuralları' : 'Acceptable use' }
  ];

  const authorizeUrl = `${origin}/oauth/authorize
  ?client_id=c4e_app_XXXXXXXXXXXXXXXX
  &redirect_uri=https%3A%2F%2Fuygulamam.com%2Foauth%2Fcallback
  &response_type=code
  &scope=identify%20projects%3Aread
  &state=RASTGELE_DEGER
  &code_challenge=BASE64URL_SHA256_VERIFIER
  &code_challenge_method=S256`;

  const tokenExchange = `curl -X POST "${origin}/api/oauth/token" \\
  -H "Content-Type: application/json" \\
  -d '{
    "grant_type": "authorization_code",
    "code": "c4e_code_...",
    "client_id": "c4e_app_XXXXXXXXXXXXXXXX",
    "redirect_uri": "https://uygulamam.com/oauth/callback",
    "client_secret": "c4e_sec_...",
    "code_verifier": "PKCE_KULLANIYORSAN_BU"
  }'`;

  const tokenResponse = `{
  "access_token": "c4e_at_...",
  "refresh_token": "c4e_rt_...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "identify projects:read"
}`;

  const refreshExample = `curl -X POST "${origin}/api/oauth/token" \\
  -H "Content-Type: application/json" \\
  -d '{
    "grant_type": "refresh_token",
    "refresh_token": "c4e_rt_...",
    "client_id": "c4e_app_XXXXXXXXXXXXXXXX",
    "client_secret": "c4e_sec_..."
  }'`;

  const meExample = `curl "${origin}/api/v1/users/@me" \\
  -H "Authorization: Bearer c4e_at_..."

{
  "id": "0f2c...",
  "username": "ayse",
  "display_name": "Ayşe Yılmaz",
  "avatar_url": "https://...",
  "bio": "Frontend geliştirici",
  "role": "Geliştirici",
  "github_username": "ayse-dev",
  "jubbio_username": null,
  "created_at": "2026-02-01T10:00:00.000Z"
}`;

  const curlPublish = `curl -X POST "${origin}/api/v1/communities/@react_tr/posts" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: lnx_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" \\
  -d '{
    "content": "Performansli debounce hook",
    "code_snippet": "export const useDebounce = (v, ms) => { /* ... */ };",
    "code_language": "typescript",
    "category": "frontend",
    "author_name": "CI Bot"
  }'`;

  const jsPublish = `// Node 18+ / browser — the key must stay server-side.
const res = await fetch('${origin}/api/v1/communities/@react_tr/posts', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': process.env.LANUX_API_KEY
  },
  body: JSON.stringify({
    content: 'Yeni surum yayinlandi',
    code_snippet: 'npm i @lanux/sdk@latest',
    code_language: 'bash',
    author_name: 'Release Bot'
  })
});

const data = await res.json();
if (!res.ok) throw new Error(data.error);
console.log(data.post.url);`;

  const pyPublish = `# Python 3 — requests
import os, requests

res = requests.post(
    "${origin}/api/v1/communities/@react_tr/posts",
    headers={"X-API-Key": os.environ["LANUX_API_KEY"]},
    json={
        "content": "Gunluk test raporu",
        "code_snippet": "pytest -q --maxfail=1",
        "code_language": "bash",
        "author_name": "CI",
    },
    timeout=15,
)
res.raise_for_status()
print(res.json()["post"]["url"])`;

  const readExample = `# Public read — no key needed
curl "${origin}/api/v1/communities"
curl "${origin}/api/v1/communities/@react_tr"
curl "${origin}/api/v1/communities/@react_tr/posts?limit=20"`;

  const successBody = `HTTP/1.1 201 Created

{
  "success": true,
  "message": "Gonderi @react_tr toplulugunda yayinlandi.",
  "post": {
    "id": "post_api_1757808000000_a1b2c3d4e5f6",
    "content": "Performansli debounce hook",
    "code_language": "typescript",
    "community_handle": "@react_tr",
    "created_at": "2026-09-14T12:00:00.000Z",
    "url": "${origin}/c/@react_tr#post_api_..."
  }
}`;

  return (
    <PublicPageShell
      language={language}
      eyebrow="API v1"
      title={tr ? 'Geliştirici Dokümantasyonu' : 'Developer Documentation'}
      subtitle={
        tr
          ? 'İki API var. Code4Ever API, kendi uygulamanı /dev/apps ekranından açıp üyelerin İZNİYLE onların adına veri okumanı sağlar — "Code4Ever ile giriş yap" bununla yazılır. Topluluk API ise bir CI işinden ya da bottan doğrudan topluluk akışlarına gönderi yayınlamak içindir.'
          : 'There are two APIs. The Code4Ever API lets you create an application on /dev/apps and read a member\'s data WITH THEIR PERMISSION \u2014 this is what "Sign in with Code4Ever" is built on. The Community API is for a CI job or a bot publishing posts straight into a community feed.'
      }
      nav={nav}
    >
      <Section id="baslangic" title={tr ? '1. Başlangıç' : '1. Getting started'}>
        <p className="text-[13px] leading-relaxed text-zinc-400">
          {tr
            ? 'Taban adres aşağıdaki gibidir. Tüm istek ve yanıt gövdeleri UTF-8 JSON’dur ve tüm uçlar HTTPS üzerinden çalışır.'
            : 'The base address is below. Every request and response body is UTF-8 JSON and every endpoint is HTTPS only.'}
        </p>
        <CodeBlock label="base url" code={`${origin}/api/v1`} />
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {
              icon: Terminal,
              title: tr ? 'Okuma açık' : 'Open reads',
              body: tr
                ? 'Herkese açık toplulukları ve gönderilerini anahtarsız listeleyebilirsiniz.'
                : 'List public communities and their posts without any key.'
            },
            {
              icon: KeyRound,
              title: tr ? 'Yazma anahtarlı' : 'Keyed writes',
              body: tr
                ? 'Gönderi yayınlamak için topluluğun kurucusundan bir API anahtarı gerekir.'
                : 'Publishing a post needs an API key minted by the community founder.'
            },
            {
              icon: Zap,
              title: tr ? 'Hazır' : 'Live',
              body: tr
                ? 'Uçlar çalışır durumdadır; kapalı beta kilidi kaldırılmıştır.'
                : 'The endpoints are live; the closed-beta lock has been removed.'
            }
          ].map((card) => (
            <div key={card.title} className="c4e-card p-3.5">
              <card.icon className="mb-2 h-4 w-4 text-zinc-300" />
              <h3 className="text-[13px] font-bold text-white">{card.title}</h3>
              <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">{card.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="uygulama" title={tr ? '2. Uygulama oluşturma' : '2. Creating an application'}>
        <p className="text-[13px] leading-relaxed text-zinc-400">
          {tr
            ? 'Bir uygulama, ÜYENİN İZNİYLE onun adına Code4Ever verisine erişir. "Code4Ever ile giriş yap" ve "Code4Ever hesabını bağla" bu akışın iki yüzüdür. Uygulamanı /dev/apps ekranından açarsın.'
            : 'An application accesses a member’s Code4Ever data WITH THEIR PERMISSION. "Sign in with Code4Ever" and "Connect your Code4Ever account" are the two faces of this flow. You create your application on /dev/apps.'}
        </p>

        <a
          href="/dev/apps"
          className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-4 text-xs font-bold text-zinc-950 transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <KeyRound className="h-3.5 w-3.5" />
          {tr ? 'Uygulamalarıma git' : 'Go to my applications'}
        </a>

        <Table
          head={tr ? ['Alan', 'Açıklama'] : ['Field', 'What it is']}
          rows={[
            [
              <code className="font-mono text-zinc-200">client_id</code>,
              tr
                ? 'Uygulamanın herkese açık kimliği. Tarayıcıda görünmesi sorun değil.'
                : 'The public identity of your application. It is fine for it to be visible in a browser.'
            ],
            [
              <code className="font-mono text-zinc-200">client_secret</code>,
              tr
                ? 'YALNIZCA ÜRETİLDİĞİ ANDA gösterilir; sunucuda sadece SHA-256 özeti saklanır. Tarayıcıda çalışan koda koyma. Kaybedersen /dev/apps ekranından yenisini üret; eskisi anında geçersizleşir.'
                : 'Shown ONLY WHEN GENERATED; the server keeps just a SHA-256 hash. Never put it in browser-side code. If you lose it, rotate it on /dev/apps; the old one dies immediately.'
            ],
            [
              <code className="font-mono text-zinc-200">redirect_uri</code>,
              tr
                ? 'Yetkilendirme kodunun gönderileceği adres. TAM EŞLEŞME aranır, joker yoktur. https zorunlu; yerel geliştirmede http://localhost kabul edilir.'
                : 'Where the authorization code is delivered. Matched EXACTLY, no wildcards. https is required; http://localhost is accepted locally.'
            ],
            [
              <code className="font-mono text-zinc-200">scope</code>,
              tr
                ? 'Uygulamanın isteyebileceği izinler. Uygulama, kayıtlı kapsamlarının dışında bir şey isteyemez.'
                : 'What the application may ask for. It cannot request anything outside its registered scopes.'
            ]
          ]}
        />

        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-3.5">
          <ShieldAlert className="mt-0.5 h-4 w-4 flex-none text-amber-300" />
          <p className="text-[12.5px] leading-relaxed text-amber-200/90">
            {tr
              ? 'Tarayıcıda ya da mobil uygulamada çalışan bir istemci sırrı saklayamaz. Böyle bir istemci yazıyorsan client_secret KULLANMA; PKCE ile çalış (aşağıda). Sırrı istemciye gömmek, sırrın herkese açık olması demektir.'
              : 'A client running in a browser or a mobile app cannot keep a secret. If you are writing one, do NOT use client_secret; use PKCE instead (below). Embedding the secret in a client means publishing it.'}
          </p>
        </div>
      </Section>

      <Section id="oauth" title={tr ? '3. OAuth2 akışı' : '3. The OAuth2 flow'}>
        <p className="text-[13px] leading-relaxed text-zinc-400">
          {tr
            ? 'Standart "authorization code" akışı (RFC 6749) artı PKCE. Üç adım: kullanıcıyı onay ekranına gönder, dönen kodu belirtece çevir, belirteçle API’yi çağır.'
            : 'The standard authorization-code flow (RFC 6749) plus PKCE. Three steps: send the user to the consent screen, exchange the returned code for a token, call the API with the token.'}
        </p>

        <h3 className="pt-2 text-[13px] font-bold text-white">
          {tr ? '3.1 Kullanıcıyı onay ekranına gönder' : '3.1 Send the user to the consent screen'}
        </h3>
        <CodeBlock label="authorize" code={authorizeUrl} />
        <Table
          head={tr ? ['Parametre', 'Zorunlu', 'Açıklama'] : ['Parameter', 'Required', 'What it does']}
          rows={[
            [<code className="font-mono text-zinc-200">client_id</code>, tr ? 'evet' : 'yes', tr ? 'Uygulamanın kimliği.' : 'Your application id.'],
            [<code className="font-mono text-zinc-200">redirect_uri</code>, tr ? 'evet' : 'yes', tr ? 'Uygulamada kayıtlı adreslerden biri, harfi harfine.' : 'One of your registered addresses, character for character.'],
            [<code className="font-mono text-zinc-200">response_type</code>, tr ? 'evet' : 'yes', <code className="font-mono text-zinc-200">code</code>],
            [
              <code className="font-mono text-zinc-200">scope</code>,
              tr ? 'hayır' : 'no',
              tr ? 'Boşlukla ayrılmış izinler. Verilmezse identify.' : 'Space-separated scopes. Defaults to identify.'
            ],
            [
              <code className="font-mono text-zinc-200">state</code>,
              tr ? 'önerilir' : 'recommended',
              tr
                ? 'CSRF koruması. Rastgele üret, oturumda sakla, dönüşte karşılaştır. Olduğu gibi geri verilir.'
                : 'CSRF protection. Generate randomly, keep it in the session, compare on return. Echoed back as is.'
            ],
            [
              <code className="font-mono text-zinc-200">code_challenge</code>,
              tr ? 'açık istemcide evet' : 'yes for public clients',
              <span>
                {tr ? 'base64url(SHA-256(code_verifier)). ' : 'base64url(SHA-256(code_verifier)). '}
                <code className="font-mono text-zinc-200">code_challenge_method=S256</code>
                {tr ? ' ile birlikte gönderilir; plain kabul edilmez.' : ' must accompany it; plain is rejected.'}
              </span>
            ]
          ]}
        />

        <h3 className="pt-2 text-[13px] font-bold text-white">
          {tr ? '3.2 Kodu belirtece çevir' : '3.2 Exchange the code for a token'}
        </h3>
        <p className="text-[13px] leading-relaxed text-zinc-400">
          {tr
            ? 'Kullanıcı izin verince tarayıcı, redirect_uri adresine ?code=...&state=... ile döner. Kod TEK KULLANIMLIK ve 10 dakika ömürlüdür. Takas isteğini SUNUCUNDAN yap.'
            : 'When the user approves, the browser returns to your redirect_uri with ?code=...&state=... The code is SINGLE-USE and lives 10 minutes. Make the exchange request FROM YOUR SERVER.'}
        </p>
        <CodeBlock label="POST /api/oauth/token" code={tokenExchange} />
        <p className="text-[13px] leading-relaxed text-zinc-400">
          {tr
            ? 'Gizli istemci (sunucu) client_secret gönderir; açık istemci (tarayıcı/mobil) onun yerine code_verifier gönderir. Hangisinin isteneceğini yetkilendirme anında code_challenge gönderip göndermediğin belirler.'
            : 'A confidential client (your server) sends client_secret; a public client sends code_verifier instead. Which one is required is decided by whether you sent a code_challenge at authorize time.'}
        </p>
        <CodeBlock label="200 OK" code={tokenResponse} />

        <h3 className="pt-2 text-[13px] font-bold text-white">
          {tr ? '3.3 Belirteci yenile' : '3.3 Refresh the token'}
        </h3>
        <p className="text-[13px] leading-relaxed text-zinc-400">
          {tr
            ? 'Erişim belirteci 1 saat, yenileme belirteci 30 gün yaşar. Yenileme DÖNERLİDİR: her yenilemede yeni bir çift verilir ve eskisi anında geçersizleşir. Yanıttaki yeni refresh_token’ı saklamayı unutma.'
            : 'Access tokens live 1 hour, refresh tokens 30 days. Refresh is ROTATING: each refresh issues a new pair and kills the old one. Remember to store the new refresh_token from the response.'}
        </p>
        <CodeBlock label="refresh_token grant" code={refreshExample} />
      </Section>

      <Section id="kapsamlar" title={tr ? '4. Kapsamlar ve kullanıcı uçları' : '4. Scopes and user endpoints'}>
        <Table
          head={tr ? ['Kapsam', 'Ne görür'] : ['Scope', 'What it sees']}
          rows={[
            [<code className="font-mono text-zinc-200">identify</code>, tr ? 'Kullanıcı adı, görünen ad, profil resmi, biyografi, rol, bağlı hesap adları.' : 'Username, display name, avatar, bio, role, linked account names.'],
            [<code className="font-mono text-zinc-200">email</code>, tr ? 'E-posta adresi. Bu kapsam yoksa yanıtta email alanı HİÇ bulunmaz.' : 'The e-mail address. Without this scope the email field is ABSENT from the response.'],
            [<code className="font-mono text-zinc-200">projects:read</code>, tr ? 'Üyenin projeleri.' : 'The member’s projects.'],
            [<code className="font-mono text-zinc-200">communities:read</code>, tr ? 'Üyenin katıldığı topluluklar.' : 'The communities the member joined.']
          ]}
        />

        <Endpoint method="GET" path="/api/v1/users/@me" auth="Bearer · identify">
          <p>
            {tr
              ? 'Belirtecin sahibi olan üyenin profili. email alanı yalnızca email kapsamı verilmişse bulunur.'
              : 'The profile of the member who owns the token. The email field exists only with the email scope.'}
          </p>
        </Endpoint>

        <Endpoint method="GET" path="/api/v1/users/@me/projects" auth="Bearer · projects:read">
          <p>{tr ? 'Üyenin projeleri (en yeni önce, en fazla 100).' : 'The member’s projects (newest first, up to 100).'}</p>
        </Endpoint>

        <Endpoint method="GET" path="/api/v1/users/@me/communities" auth="Bearer · communities:read">
          <p>{tr ? 'Üyenin katıldığı topluluklar.' : 'The communities the member belongs to.'}</p>
        </Endpoint>

        <CodeBlock label={tr ? 'kullanıcıyı oku' : 'read the user'} code={meExample} />

        <Endpoint method="POST" path="/api/oauth/revoke" auth={tr ? 'anahtarsız' : 'no auth'}>
          <p>
            {tr
              ? 'Bir erişim ya da yenileme belirtecini iptal eder. Gövde: { "token": "..." }. Bilinmeyen bir belirteç için de başarılı döner (RFC 7009) — aksi hâlde "bu belirteç var mıydı" sorusunu yanıtlayan bir sorgulama aracı olurdu.'
              : 'Revokes an access or refresh token. Body: { "token": "..." }. It succeeds for unknown tokens too (RFC 7009) — otherwise it would answer "did this token exist?".'}
          </p>
        </Endpoint>

        <div className="c4e-card flex items-start gap-2.5 p-3.5">
          <ShieldAlert className="mt-0.5 h-4 w-4 flex-none text-indigo-300" />
          <p className="text-[12.5px] leading-relaxed text-zinc-400">
            {tr
              ? 'Üye, verdiği erişimi Ayarlar > Bağlı Hesaplar > Bağlı Uygulamalar bölümünden istediği an kesebilir. Kestiği anda uygulamanın o üyeye ait BÜTÜN belirteçleri silinir; bir sonraki istek 401 invalid_token döner. Uygulaman bunu beklemeli ve kullanıcıyı yeniden yetkilendirmeye yönlendirmelidir.'
              : 'A member can revoke access any time under Settings > Connected Accounts > Connected Applications. ALL of your tokens for that member are deleted immediately and the next request returns 401 invalid_token. Your application should expect this and send the user back through authorization.'}
          </p>
        </div>
      </Section>

      <Section id="kimlik" title={tr ? '5. Topluluk API: kimlik doğrulama' : '5. Community API: authentication'}>
        <p className="text-[13px] leading-relaxed text-zinc-400">
          {tr
            ? 'Yazma isteklerinde anahtarı X-API-Key başlığında gönderin. Anahtarlar lnx_live_ ile başlar.'
            : 'Send the key in the X-API-Key header on write requests. Keys start with lnx_live_.'}
        </p>
        <CodeBlock
          label="header"
          code={`X-API-Key: lnx_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# Alternatif / alternative
Authorization: Bearer lnx_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`}
        />
        <div className="flex items-start gap-3 rounded-xl border border-amber-700/40 bg-amber-950/25 p-3.5">
          <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
          <div className="space-y-1 text-[12px] leading-relaxed text-amber-200/90">
            <p className="font-bold text-amber-200">
              {tr ? 'Anahtarı tarayıcıya koymayın.' : 'Never ship a key to the browser.'}
            </p>
            <p>
              {tr
                ? 'Bir API anahtarı o topluluğa gönderi yayınlama yetkisi taşır. Anahtarı yalnızca sunucu tarafında, ortam değişkeninde saklayın; istemci tarafı JavaScript’e, mobil uygulama paketine veya herkese açık bir depoya koymayın. Sızdığını düşündüğünüzde topluluk ayarlarından iptal edip yenisini üretin.'
                : 'An API key can publish into that community. Keep it server-side in an environment variable; never in client JavaScript, a mobile bundle or a public repository. If you suspect a leak, revoke it in the community settings and mint a new one.'}
            </p>
          </div>
        </div>
        <p className="text-[13px] leading-relaxed text-zinc-400">
          {tr
            ? 'Anahtarın veritabanında yalnızca SHA-256 özeti tutulur. Düz metni yalnızca oluşturulduğu anda, bir kez gösterilir; sonradan kurtarılamaz.'
            : 'Only the SHA-256 hash of a key is stored. The plaintext is shown once, at creation, and cannot be recovered afterwards.'}
        </p>
      </Section>

      <Section id="anahtar" title={tr ? '6. Anahtar yönetimi' : '6. Key management'}>
        <p className="text-[13px] leading-relaxed text-zinc-400">
          {tr
            ? 'Anahtarları yalnızca topluluğun kurucusu (veya platform yöneticisi) yönetebilir. Arayüzden: Topluluklar → ilgili topluluk → API düğmesi → Anahtarlar sekmesi. HTTP üzerinden aşağıdaki uçlar kullanılabilir; bu uçlar oturum belirteci (Supabase Bearer token) ister, API anahtarı değil.'
            : 'Only the community founder (or a platform administrator) can manage keys. In the UI: Communities → the community → API button → Keys tab. Over HTTP the endpoints below apply; they take a session bearer token, not an API key.'}
        </p>

        <Endpoint method="GET" path="/api/v1/communities/:handle/keys" auth={tr ? 'oturum' : 'session'}>
          <p>
            {tr
              ? 'Topluluğun anahtarlarını listeler. Anahtarın düz metni asla dönmez; yalnızca ön eki, adı, kullanım sayısı ve iptal durumu döner.'
              : 'Lists the community keys. Plaintext is never returned — only the prefix, name, usage count and revocation state.'}
          </p>
        </Endpoint>

        <Endpoint method="POST" path="/api/v1/communities/:handle/keys" auth={tr ? 'oturum' : 'session'}>
          <p>
            {tr
              ? 'Yeni anahtar üretir ve düz metni yalnızca bu yanıtta döndürür. İsteğe bağlı gövde: { "name": "ci-bot" }.'
              : 'Mints a new key and returns the plaintext in this response only. Optional body: { "name": "ci-bot" }.'}
          </p>
          <CodeBlock
            label="201 Created"
            code={`{
  "success": true,
  "api_key": "lnx_live_....",
  "warning": "Bu anahtar bir daha gosterilmeyecek.",
  "key": { "id": "cak_...", "name": "ci-bot", "key_prefix": "lnx_live_abcdef" }
}`}
          />
        </Endpoint>

        <Endpoint
          method="DELETE"
          path="/api/v1/communities/:handle/keys/:keyId"
          auth={tr ? 'oturum' : 'session'}
        >
          <p>
            {tr
              ? 'Anahtarı iptal eder. İptal anında geçerliliğini yitirir; iptal edilmiş bir anahtar hiç var olmamış gibi 401 döner.'
              : 'Revokes the key. It stops working immediately; a revoked key returns 401 exactly like one that never existed.'}
          </p>
        </Endpoint>
      </Section>

      <Section id="endpointler" title={tr ? '7. Topluluk uçları' : '7. Community endpoints'}>
        <Endpoint method="GET" path="/api/v1/communities" auth={tr ? 'açık' : 'open'}>
          <p>
            {tr
              ? 'API sürümü, uç listesi, limitler ve herkese açık toplulukların listesi. Gizli topluluklar bu listede yer almaz.'
              : 'API version, endpoint index, limits and the list of public communities. Private communities are excluded.'}
          </p>
        </Endpoint>

        <Endpoint method="GET" path="/api/v1/communities/:handle" auth={tr ? 'açık' : 'open'}>
          <p>
            {tr
              ? 'Tek bir herkese açık topluluğun bilgisi. Gizli bir topluluk için varlığını da ele vermeyecek şekilde 404 döner.'
              : 'A single public community. A private one returns 404 so the endpoint does not confirm its existence.'}
          </p>
        </Endpoint>

        <Endpoint method="GET" path="/api/v1/communities/:handle/posts" auth={tr ? 'açık' : 'open'}>
          <p>
            {tr
              ? 'Topluluğun son gönderileri. limit sorgu parametresi 1–100 arasıdır, varsayılan 50.'
              : 'Recent posts of the community. The limit query parameter is 1–100, default 50.'}
          </p>
        </Endpoint>

        <Endpoint method="POST" path="/api/v1/communities/:handle/posts" auth="X-API-Key">
          <p>{tr ? 'Topluluğa gönderi yayınlar.' : 'Publishes a post into the community.'}</p>
          <Table
            head={[tr ? 'Alan' : 'Field', tr ? 'Tip' : 'Type', tr ? 'Zorunlu' : 'Required', tr ? 'Açıklama' : 'Notes']}
            rows={[
              [
                <code key="c" className="font-mono text-zinc-300">content</code>,
                'string',
                tr ? 'koşullu' : 'conditional',
                tr ? 'En fazla 2000 karakter. code_snippet yoksa zorunlu.' : 'Max 2000 chars. Required when code_snippet is absent.'
              ],
              [
                <code key="s" className="font-mono text-zinc-300">code_snippet</code>,
                'string',
                tr ? 'koşullu' : 'conditional',
                tr ? 'En fazla 10000 karakter. content yoksa zorunlu.' : 'Max 10000 chars. Required when content is absent.'
              ],
              [
                <code key="l" className="font-mono text-zinc-300">code_language</code>,
                'string',
                tr ? 'hayır' : 'no',
                tr ? 'typescript, python, go, rust, sql, bash… Bilinmeyen değer plaintext olur.' : 'typescript, python, go, rust, sql, bash… Unknown values fall back to plaintext.'
              ],
              [
                <code key="cat" className="font-mono text-zinc-300">category</code>,
                'string',
                tr ? 'hayır' : 'no',
                tr ? 'Varsayılan general.' : 'Defaults to general.'
              ],
              [
                <code key="a" className="font-mono text-zinc-300">author_name</code>,
                'string',
                tr ? 'hayır' : 'no',
                tr ? 'Gönderide görünecek isim. Varsayılan API.' : 'Display name on the post. Defaults to API.'
              ],
              [
                <code key="au" className="font-mono text-zinc-300">author_username</code>,
                'string',
                tr ? 'hayır' : 'no',
                tr ? 'Gönderiye iliştirilecek kullanıcı adı.' : 'Username attached to the post.'
              ]
            ]}
          />
          <p className="text-[12px] text-zinc-500">
            {tr
              ? 'Hedef topluluk anahtardan belirlenir; adresteki handle yalnızca doğrulama içindir. Bir topluluğun anahtarı başka bir topluluğa gönderi atmak için kullanılamaz (403).'
              : 'The target community comes from the key; the handle in the path is only cross-checked. A key for one community cannot post into another (403).'}
          </p>
          <CodeBlock label="response" code={successBody} />
        </Endpoint>
      </Section>

      <Section id="ornekler" title={tr ? '8. Örnekler' : '8. Examples'}>
        <CodeBlock label="curl — publish" code={curlPublish} />
        <CodeBlock label="javascript — publish" code={jsPublish} />
        <CodeBlock label="python — publish" code={pyPublish} />
        <CodeBlock label="curl — public reads" code={readExample} />
      </Section>

      <Section id="hatalar" title={tr ? '9. Hata kodları' : '9. Error codes'}>
        <p className="text-[13px] leading-relaxed text-zinc-400">
          {tr
            ? 'Her hata { "success": false, "error": "..." } biçimindedir. Doğrulama hatalarında ayrıca field alanı döner.'
            : 'Every error is { "success": false, "error": "..." }. Validation errors also carry a field key.'}
        </p>
        <Table
          head={['HTTP', tr ? 'Anlamı' : 'Meaning', tr ? 'Ne yapmalı' : 'What to do']}
          rows={[
            ['400', tr ? 'Geçersiz istek' : 'Malformed request', tr ? 'Adresi ve gövdeyi kontrol edin.' : 'Check the path and body.'],
            ['401', tr ? 'Anahtar yok, geçersiz veya iptal edilmiş' : 'Missing, invalid or revoked key', tr ? 'X-API-Key başlığını ve anahtarın iptal edilmediğini doğrulayın.' : 'Verify the X-API-Key header and that the key is not revoked.'],
            ['403', tr ? 'Yetki yok veya yanlış topluluk' : 'Not permitted / wrong community', tr ? 'Anahtarın ait olduğu topluluğa gönderin.' : 'Post to the community the key belongs to.'],
            ['404', tr ? 'Topluluk bulunamadı (gizli topluluklar dahil)' : 'Community not found (private ones included)', tr ? 'Handle’ı doğrulayın.' : 'Check the handle.'],
            ['409', tr ? 'Etkin anahtar sınırı doldu' : 'Active key limit reached', tr ? 'Kullanılmayan bir anahtarı iptal edin.' : 'Revoke an unused key.'],
            ['422', tr ? 'Gövde doğrulaması başarısız' : 'Payload validation failed', tr ? 'Dönen field alanına bakın.' : 'Inspect the returned field.'],
            ['429', tr ? 'Hız sınırı aşıldı' : 'Rate limited', tr ? 'Retry-After süresi kadar bekleyin.' : 'Back off for Retry-After seconds.'],
            ['502 / 503', tr ? 'Arka uç geçici olarak yazamadı' : 'Backend temporarily unavailable', tr ? 'Üstel geri çekilme ile yeniden deneyin.' : 'Retry with exponential backoff.']
          ]}
        />
      </Section>

      <Section id="limitler" title={tr ? '10. Limitler' : '10. Limits'}>
        <Table
          head={[tr ? 'Sınır' : 'Limit', tr ? 'Değer' : 'Value']}
          rows={[
            [tr ? 'Yayınlama isteği' : 'Publish requests', tr ? 'dakikada 30' : '30 per minute'],
            [tr ? 'Okuma isteği' : 'Read requests', tr ? 'dakikada 60' : '60 per minute'],
            [tr ? 'Genel API tavanı' : 'Global API ceiling', tr ? 'dakikada 120' : '120 per minute'],
            [tr ? 'İstek gövdesi' : 'Request body', '256 KB'],
            [tr ? 'content uzunluğu' : 'content length', '2000'],
            [tr ? 'code_snippet uzunluğu' : 'code_snippet length', '10000'],
            [tr ? 'Topluluk başına etkin anahtar' : 'Active keys per community', '10']
          ]}
        />
        <p className="text-[12px] leading-relaxed text-zinc-500">
          {tr
            ? 'Sınır aşıldığında 429 ve Retry-After başlığı döner. İstemcinizin üstel geri çekilme uygulaması beklenir.'
            : 'Exceeding a limit returns 429 with a Retry-After header. Clients are expected to back off exponentially.'}
        </p>
      </Section>

      <Section id="kurallar" title={tr ? '11. Kullanım kuralları' : '11. Acceptable use'}>
        <ul className="space-y-2 text-[13px] leading-relaxed text-zinc-400">
          {(tr
            ? [
                'Yalnızca yönettiğiniz veya açıkça izin aldığınız topluluklara yayın yapın.',
                'Spam, yinelenen içerik ve otomatik reklam gönderileri yasaktır.',
                'Başkasının adıyla gönderi yayınlamayın; author_name alanını yanıltıcı kullanmayın.',
                'Kişisel veri, kimlik bilgisi, gizli anahtar veya token içeren kod parçacıkları paylaşmayın.',
                'Sınırları aşmaya yönelik paralel istek veya anahtar rotasyonu, anahtarın iptaliyle sonuçlanır.',
                'API’yi kullanarak Kullanım Şartları’nı ve Gizlilik İlkeleri’ni kabul etmiş olursunuz.'
              ]
            : [
                'Publish only to communities you own or have explicit permission for.',
                'Spam, duplicate content and automated advertising are prohibited.',
                'Do not publish under someone else’s identity or use author_name deceptively.',
                'Never share snippets containing personal data, credentials, secrets or tokens.',
                'Parallel requests or key rotation aimed at evading limits results in key revocation.',
                'Using the API means accepting the Terms of Service and Privacy Policy.'
              ]
          ).map((item) => (
            <li key={item} className="flex gap-2.5">
              <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-zinc-600" />
              <span className="user-text">{item}</span>
            </li>
          ))}
        </ul>
        <p className="text-[12px] text-zinc-500">
          <a href="/tos" className="text-blue-400 hover:text-blue-300">
            {tr ? 'Kullanım Şartları' : 'Terms of Service'}
          </a>
          {' · '}
          <a href="/privacy" className="text-blue-400 hover:text-blue-300">
            {tr ? 'Gizlilik İlkeleri' : 'Privacy Policy'}
          </a>
        </p>
      </Section>
    </PublicPageShell>
  );
};
