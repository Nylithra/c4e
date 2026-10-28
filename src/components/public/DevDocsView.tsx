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
    <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-black/25">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-3 py-1.5">
        <span className="font-mono text-[11px] text-zinc-500">{label || 'example'}</span>
        <button
          type="button"
          onClick={copy}
          aria-label="Kopyala"
          className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] text-zinc-400 transition-colors hover:bg-white/[0.09] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
  <div className="space-y-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
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

  const nav = [
    { id: 'baslangic', label: tr ? 'Başlangıç' : 'Getting started' },
    { id: 'kimlik', label: tr ? 'Kimlik doğrulama' : 'Authentication' },
    { id: 'anahtar', label: tr ? 'Anahtar yönetimi' : 'Key management' },
    { id: 'endpointler', label: 'Endpoints' },
    { id: 'ornekler', label: tr ? 'Örnekler' : 'Examples' },
    { id: 'hatalar', label: tr ? 'Hata kodları' : 'Error codes' },
    { id: 'limitler', label: tr ? 'Limitler' : 'Limits' },
    { id: 'kurallar', label: tr ? 'Kullanım kuralları' : 'Acceptable use' }
  ];

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
          ? 'Code4Ever Topluluk API ile bir CI işinden, bir bottan veya kendi uygulamanızdan doğrudan topluluk akışlarına kod parçacığı ve gönderi yayınlayabilirsiniz. Okuma uçları herkese açıktır; yazma uçları topluluk API anahtarı ister.'
          : 'The Code4Ever Community API lets a CI job, a bot or your own app publish snippets and posts straight into a community feed. Read endpoints are open; write endpoints need a community API key.'
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
            <div key={card.title} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3.5">
              <card.icon className="mb-2 h-4 w-4 text-zinc-300" />
              <h3 className="text-[13px] font-bold text-white">{card.title}</h3>
              <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">{card.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="kimlik" title={tr ? '2. Kimlik doğrulama' : '2. Authentication'}>
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

      <Section id="anahtar" title={tr ? '3. Anahtar yönetimi' : '3. Key management'}>
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

      <Section id="endpointler" title={tr ? '4. Kamuya açık uçlar' : '4. Public endpoints'}>
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

      <Section id="ornekler" title={tr ? '5. Örnekler' : '5. Examples'}>
        <CodeBlock label="curl — publish" code={curlPublish} />
        <CodeBlock label="javascript — publish" code={jsPublish} />
        <CodeBlock label="python — publish" code={pyPublish} />
        <CodeBlock label="curl — public reads" code={readExample} />
      </Section>

      <Section id="hatalar" title={tr ? '6. Hata kodları' : '6. Error codes'}>
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

      <Section id="limitler" title={tr ? '7. Limitler' : '7. Limits'}>
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

      <Section id="kurallar" title={tr ? '8. Kullanım kuralları' : '8. Acceptable use'}>
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
