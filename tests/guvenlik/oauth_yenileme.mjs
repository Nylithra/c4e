/**
 * OAuth BELİRTEÇ UCU GÜVENLİK TESTLERİ
 *
 * Asıl konu: `/api/oauth/token` ucunda `grant_type=refresh_token`, istemci sırrı
 * SUNULMADAN yeni erişim belirteci üretiyordu. Kayıtta her uygulamaya bir
 * `client_secret` verildiği için platformda açık istemci yok; yani sızan tek bir
 * yenileme belirteci, sır hiç bilinmeden 30 gün boyunca erişim üretmeye yetiyordu.
 *
 * NE TAKLİT EDİLİYOR: yalnızca veritabanı (PostgREST). Express rotası, imza
 * doğrulaması, belirteç üretimi — hepsi projenin gerçek kodu.
 *
 * ÇALIŞTIRMA (ayrıntı: tests/guvenlik/README.md):
 *   node tests/guvenlik/oauth_yenileme.mjs
 *
 * Test gereken her şeyi kendisi ayağa kaldırıyor: taklit PostgREST, DNS yönlendirmesi
 * ve derlenmiş sunucu. Elde derlenmiş sunucu yoksa kendisi derliyor.
 */
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MOCK_PORT = 5641;
const SRV_PORT  = 3422;
const SERVIS_ANAHTARI = 'svc_role_test_key';
const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');

// -------------------------------------------------------------
// 1. TAKLİT POSTGREST
// -------------------------------------------------------------
// Yalnızca bu testin dokunduğu iki tablo var. PostgREST'in burada kullanılan
// davranışları: `?kolon=eq.deger` süzgeci, `Prefer: return=representation` ile
// DELETE'in silinen satırları döndürmesi, POST'un eklenen satırları döndürmesi.
const db = { oauth_apps: [], oauth_tokens: [] };

function suzgecler(qs) {
  const out = {};
  for (const [k, raw] of qs.entries()) {
    if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
    if (raw.startsWith('eq.')) out[k] = { op: 'eq', value: raw.slice(3) };
    else if (raw.startsWith('is.')) out[k] = { op: 'is', value: raw.slice(3) };
    else if (raw.startsWith('lt.')) out[k] = { op: 'lt', value: raw.slice(3) };
  }
  return out;
}

function uyuyor(row, f) {
  return Object.entries(f).every(([k, s]) => {
    const v = row[k];
    if (s.op === 'eq') return String(v) === s.value;
    if (s.op === 'is') return s.value === 'null' ? v === null || v === undefined : !(v == null);
    if (s.op === 'lt') return String(v ?? '') < s.value;
    return true;
  });
}

const mock = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const gonder = (s, p) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(p)); };

  if (url.pathname === '/__seed') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const { table, rows, reset } = JSON.parse(body || '{}');
      if (reset) { db.oauth_apps = []; db.oauth_tokens = []; }
      if (table) db[table].push(...rows);
      gonder(200, { ok: true });
    });
    return;
  }

  const table = url.pathname.replace(/^\/rest\/v1\//, '');
  if (req.headers.apikey !== SERVIS_ANAHTARI) return gonder(401, { message: 'servis anahtari yok' });
  if (!(table in db)) return gonder(404, { message: `bilinmeyen tablo: ${table}` });

  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const f = suzgecler(url.searchParams);
    if (req.method === 'GET') return gonder(200, db[table].filter((r) => uyuyor(r, f)));
    if (req.method === 'POST') {
      const gelen = JSON.parse(body || '[]');
      const satirlar = (Array.isArray(gelen) ? gelen : [gelen])
        .map((r) => ({ ...r, created_at: r.created_at || new Date().toISOString() }));
      db[table].push(...satirlar);
      return gonder(201, satirlar);
    }
    if (req.method === 'DELETE') {
      const giden = db[table].filter((r) => uyuyor(r, f));
      db[table] = db[table].filter((r) => !uyuyor(r, f));
      return gonder(200, giden);
    }
    if (req.method === 'PATCH') {
      const yama = JSON.parse(body || '{}');
      const hedef = db[table].filter((r) => uyuyor(r, f));
      hedef.forEach((r) => Object.assign(r, yama));
      return gonder(200, hedef);
    }
    return gonder(405, { message: 'yontem yok' });
  });
});

// -------------------------------------------------------------
// 2. DNS YÖNLENDİRMESİ
// -------------------------------------------------------------
// Sunucu SUPABASE_URL'e https ile gidiyor ve `safeFetch` özel adresleri reddediyor;
// bu yüzden 127.0.0.1'i doğrudan veremiyoruz. Çözüm: alan adını çözümleyen katmanı
// yamalayıp isteği yerel taklide yönlendirmek. Sunucu kodu değişmiyor.
const YAMA = `
const dns = require('node:dns');
const ALAN = 'mock.supabase.test';
const asil = { lookup: dns.lookup, promises: dns.promises.lookup };
dns.lookup = (host, opts, cb) => {
  if (host === ALAN) {
    const tek = { address: '93.184.216.34', family: 4 };  // genel görünen bir adres: SSRF denetimini geçer
    if (typeof opts === 'function') return opts(null, tek.address, 4);
    if (opts && opts.all) return cb(null, [tek]);
    return cb(null, tek.address, 4);
  }
  return asil.lookup(host, opts, cb);
};
dns.promises.lookup = async (host, opts) => {
  if (host === ALAN) {
    const tek = { address: '93.184.216.34', family: 4 };
    return opts && opts.all ? [tek] : tek;
  }
  return asil.promises(host, opts);
};
// Çözümleme denetimi geçtikten sonra istek gerçekten yerel taklide gitmeli:
// fetch'in gördüğü adresi burada değiştiriyoruz.
const asilFetch = globalThis.fetch;
globalThis.fetch = (girdi, init) => {
  const adres = typeof girdi === 'string' ? girdi : (girdi && girdi.url) || String(girdi);
  if (adres.startsWith('https://' + ALAN)) {
    return asilFetch(adres.replace('https://' + ALAN, 'http://127.0.0.1:${MOCK_PORT}'), init);
  }
  return asilFetch(girdi, init);
};
`;

// -------------------------------------------------------------
// 3. TEST GÖVDESİ
// -------------------------------------------------------------
const sonuclar = [];
const kontrol = (ad, kosul, ayrinti) => {
  sonuclar.push({ ad, gecti: Boolean(kosul) });
  console.log(`${kosul ? 'GECTI ' : 'KALDI '} ${ad}${ayrinti ? '  — ' + ayrinti : ''}`);
};

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

async function calistir(komut, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(komut, args, { cwd: KOK, stdio: 'inherit', ...opts });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${komut} ${code} ile bitti`))));
    p.on('error', reject);
  });
}

async function seed(govde) {
  const r = await fetch(`http://127.0.0.1:${MOCK_PORT}/__seed`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(govde)
  });
  if (!r.ok) throw new Error(`tohumlama basarisiz: ${r.status}`);
}

async function belirtecIstegi(govde) {
  const r = await fetch(`http://127.0.0.1:${SRV_PORT}/api/oauth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(govde)
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

let sunucu;
try {
  await new Promise((r) => mock.listen(MOCK_PORT, '127.0.0.1', r));

  const paket = path.join(KOK, 'dist', 'server.cjs');
  if (!existsSync(paket)) {
    console.log('dist/server.cjs yok, derleniyor...');
    await calistir('npx', ['esbuild', 'server.ts', '--bundle', '--platform=node',
      '--format=cjs', '--packages=external', '--outfile=dist/server.cjs']);
  }

  const yamaYolu = path.join(os.tmpdir(), `c4e-dnsyama-${process.pid}.cjs`);
  writeFileSync(yamaYolu, YAMA);

  sunucu = spawn(process.execPath, ['--require', yamaYolu, paket], {
    cwd: KOK,
    stdio: 'ignore',
    env: {
      ...process.env,
      SUPABASE_URL: 'https://mock.supabase.test',
      SUPABASE_ANON_KEY: 'anon_test_key',
      SUPABASE_SERVICE_ROLE_KEY: SERVIS_ANAHTARI,
      PORT: String(SRV_PORT),
      NODE_ENV: 'production',           // tanılama ucunun kapalı olduğunu sınamak için
      OAUTH_STATE_SECRET: 'test_state_secret_0123456789abcdef'
    }
  });

  // Sunucu dinlemeye başlayana kadar bekle.
  for (let i = 0; i < 40; i++) {
    try { await fetch(`http://127.0.0.1:${SRV_PORT}/`); break; } catch { await bekle(250); }
  }

  const CLIENT_ID = 'c4e_cli_test';
  const CLIENT_SECRET = 'c4e_sec_dogru_sir_0123456789';
  const REFRESH = 'c4e_rt_' + crypto.randomBytes(24).toString('hex');

  await seed({ reset: true, table: 'oauth_apps', rows: [{
    id: 'app_test', owner_id: 'usr_test', name: 'Test App', client_id: CLIENT_ID,
    client_secret_hash: sha256(CLIENT_SECRET), client_secret_prefix: CLIENT_SECRET.slice(0, 16),
    redirect_uris: ['https://ornek.test/cb'], scopes: ['profile'], revoked_at: null,
    created_at: new Date().toISOString(), last_used_at: null
  }] });

  // Her senaryo temiz bir yenileme belirteciyle başlıyor: bir senaryonun belirteci
  // tüketmesi sonrakini yanıltmasın.
  const yeniBelirtec = async () => {
    await fetch(`http://127.0.0.1:${MOCK_PORT}/rest/v1/oauth_tokens?id=eq.tok_test`,
      { method: 'DELETE', headers: { apikey: SERVIS_ANAHTARI } });
    await seed({ table: 'oauth_tokens', rows: [{
      id: 'tok_test', access_token_hash: sha256('c4e_at_eski'), refresh_token_hash: sha256(REFRESH),
      app_id: 'app_test', user_id: 'usr_test', scopes: ['profile'], revoked_at: null,
      expires_at: new Date(Date.now() + 3600e3).toISOString(), created_at: new Date().toISOString()
    }] });
  };

  // 1) Sır OLMADAN yenileme: reddedilmeli. Düzeltmenin asıl konusu bu.
  await yeniBelirtec();
  let r = await belirtecIstegi({ grant_type: 'refresh_token', client_id: CLIENT_ID, refresh_token: REFRESH });
  kontrol('sırsız yenileme reddedildi', r.status === 401 && r.json.error === 'invalid_client',
    `durum=${r.status} hata=${r.json.error}`);

  // 2) Reddedilen istek belirteci YAKMAMIŞ olmalı: aynı belirteç doğru sırla çalışmalı.
  r = await belirtecIstegi({ grant_type: 'refresh_token', client_id: CLIENT_ID,
    refresh_token: REFRESH, client_secret: CLIENT_SECRET });
  kontrol('doğru sırla yenileme çalışıyor', r.status === 200 && typeof r.json.access_token === 'string',
    `durum=${r.status}`);

  // 3) Yanlış sır.
  await yeniBelirtec();
  r = await belirtecIstegi({ grant_type: 'refresh_token', client_id: CLIENT_ID,
    refresh_token: REFRESH, client_secret: 'c4e_sec_yanlis_sir_0000000000' });
  kontrol('yanlış sırla yenileme reddedildi', r.status === 401 && r.json.error === 'invalid_client',
    `durum=${r.status} hata=${r.json.error}`);

  // 4) Boş dizge: "sır gönderildi" sayılıp denetim atlanmamalı.
  await yeniBelirtec();
  r = await belirtecIstegi({ grant_type: 'refresh_token', client_id: CLIENT_ID,
    refresh_token: REFRESH, client_secret: '' });
  kontrol('boş sır reddedildi', r.status === 401, `durum=${r.status}`);

  // 5) Yenileme belirteci tek kullanımlık.
  await yeniBelirtec();
  const ilk = await belirtecIstegi({ grant_type: 'refresh_token', client_id: CLIENT_ID,
    refresh_token: REFRESH, client_secret: CLIENT_SECRET });
  const ikinci = await belirtecIstegi({ grant_type: 'refresh_token', client_id: CLIENT_ID,
    refresh_token: REFRESH, client_secret: CLIENT_SECRET });
  kontrol('yenileme belirteci tek kullanımlık', ilk.status === 200 && ikinci.status === 400,
    `ilk=${ilk.status} ikinci=${ikinci.status}`);

  // 6) Lisans ucu artık uydurma onay dönmüyor.
  const lic = await fetch(`http://127.0.0.1:${SRV_PORT}/api/license/validate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ licenseKey: 'C4E-PRO1-AAAA-AAAA' })
  });
  const licJson = await lic.json().catch(() => ({}));
  kontrol('sahte Pro lisans onayı kalktı', lic.status === 501 && licJson.valid === false,
    `durum=${lic.status} valid=${licJson.valid}`);

  // 7) Tanılama ucu üretimde kapalı.
  const rl = await fetch(`http://127.0.0.1:${SRV_PORT}/api/rate-limit-test`, { method: 'POST' });
  kontrol('rate-limit-test üretimde kapalı', rl.status === 404, `durum=${rl.status}`);

} finally {
  if (sunucu) sunucu.kill();
  mock.close();
}

const kaldi = sonuclar.filter((s) => !s.gecti);
console.log(`\n${sonuclar.length - kaldi.length}/${sonuclar.length} geçti`);
process.exit(kaldi.length ? 1 : 0);
