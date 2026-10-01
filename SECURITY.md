# Code4Ever — Güvenlik Notları / Security Notes

Bu belge, projede yapılan güvenlik sertleştirmesini, dağıtım (deployment) adımlarını ve
bilinen sınırlamaları özetler.

---

## 1. Yapılan düzeltmeler

### 1.1 Kritik — Veritabanı erişim kontrolü (Supabase RLS)

**Önce:** Tüm tablolarda `USING (true) WITH CHECK (true)` politikaları vardı ve `anon`
rolüne `GRANT ALL` verilmişti. Tarayıcı paketinde açıkça görünen anon anahtarıyla herkes:

- başka bir üyenin profilini (ve `is_admin` alanını) değiştirebiliyor veya silebiliyor,
- herhangi bir gönderiyi, ilanı veya topluluğu düzenleyip silebiliyor,
- **veritabanındaki tüm özel mesajları okuyabiliyordu.**

**Sonra:** `supabase_schema.sql` tamamen yeniden yazıldı:

- Her tablo için sahip bazlı `SELECT / INSERT / UPDATE / DELETE` politikaları.
- `anon` rolü yalnızca herkese açık tablolarda **salt okunur**; yazma işlemleri oturum ister.
- Mesajlar yalnızca konuşmanın taraflarına görünür (`is_conversation_participant`).
- İş başvuruları (ad, yaş, deneyim gibi kişisel veriler) yalnızca başvuran, ilan sahibi ve
  yöneticiler tarafından okunabilir.
- Beğeni/repost/yer imi/yorum ve topluluğa katılma gibi etkileşimler herkese açık kalır;
  `BEFORE UPDATE` tetikleyicileri bu yazmaları **yalnızca etkileşim sütunlarıyla** sınırlar,
  böylece bir beğeni gönderi içeriğini değiştiremez.
- `protect_profile_privileges` tetikleyicisi `is_admin`, `verified`, `supporter_tier`,
  ban/askı ve kapalı beta onayı alanlarını korur; ayrılmış kullanıcı adları alınamaz.

> `src/utils/supabaseSql.ts` artık bu dosyayı doğrudan içe aktarır: Ayarlar → Veritabanı
> ekranında gösterilen kurulum betiği ile depodaki şema her zaman aynıdır.

### 1.2 Kritik — Yetki yükseltme (client)

`verifyAdminAccess()` daha önce serbest metin `role` alanına, e-postaya ve `rifat`,
`atesrifail` gibi **rezerve olmayan** kullanıcı adlarına bakıyordu. Herhangi biri profilinde
rolüne "admin" yazarak veya bu kullanıcı adlarını alarak yönetici oluyordu.
Artık yalnızca veritabanı kaynaklı `is_admin` bayrağı ve rezerve sistem hesapları geçerlidir.
Aynı hata `CommunitySettingsModal` (topluluk sahipliği) ve `deletePostInSupabase` içinde de
düzeltildi.

### 1.3 Kritik — Bağış / Spark ayrıcalıklarının taklit edilmesi

`/api/bynogame/register-donation`, `/approve-donation` ve `/webhook` uç noktaları kimlik
doğrulaması olmadan çalışıyordu; `secretKey` parametresi okunuyor ama **hiç
doğrulanmıyordu**. Herkes kendine "Spark Destekçi" rozeti ve 250MB yükleme hakkı
tanımlayabiliyordu.

- `register-donation`, `approve-donation`, `donations` → yalnızca yönetici.
- `webhook` → gövdenin HMAC-SHA256 imzası (`X-C4E-Signature`) zorunlu.
- `claim-donation` → oturum zorunlu, saatte 5 istek, kayıt **doğrulanmamış** olarak açılır.
- Ayrıcalıklar artık `profiles.supporter_tier` (yalnızca backend/yönetici yazabilir)
  sütunundan okunur. `isUserSpark()` artık kullanıcının düzenleyebildiği `role`, `badges`
  ve `subscription` alanlarına bakmaz.

### 1.4 Yüksek — SSRF (Server Side Request Forgery)

`/api/integrations/webhook/*` uç noktaları, gövdede gelen herhangi bir URL'ye istek
gönderiyordu; `/api/posts/delete` ise tarayıcıdan gelen Supabase URL + anahtarını kullanıyordu.
Bu, sunucunun iç ağa veya bulut metadata servisine (169.254.169.254) istek atmasına izin verir.

`src/server/security.ts` içindeki `safeFetch`:

- yalnızca `https://`,
- yalnızca izin listesindeki alan adları (Discord / Telegram / Jubbio / GitHub / Groq / Supabase),
- DNS çözümlemesi sonrası özel/loopback/link-local IP reddi,
- yönlendirme takibi kapalı (`redirect: 'manual'`), zaman aşımı ve yanıt boyutu sınırı.

`/api/posts/delete` artık tarayıcıdan Supabase kimlik bilgisi almaz; silme işlemi **çağıranın
kendi oturum belirteciyle** yapılır, yetkiyi RLS verir.

### 1.5 Yüksek — GitHub OAuth akışı

- `state` parametresi artık HMAC ile imzalanır ve 10 dakika içinde doğrulanır (CSRF).
- Geri dönüş sayfası `postMessage(..., '*')` yerine **tam origin** hedefi kullanır.
- GitHub yanıtı HTML'e `JSON.stringify` ile gömülüyordu → `</script>` kaçışı ile XSS.
  Artık `jsonForScript()` ile kaçışlanır ve yalnızca gerekli alanlar döner.
- Bozuk `<!Process HTML>` doctype düzeltildi, istenen kapsam `repo` → `public_repo`.

### 1.6 Orta — Kimlik doğrulama, hız sınırı ve genel sertleştirme

- `/api/everychat` (ücretli LLM) artık oturum ister; mesaj sayısı/uzunluğu sınırlı, kullanıcı
  başına 5 dakikada 25 istek. Sağlayıcı hata metni istemciye sızdırılmaz.
- Hız sınırlayıcı: `trust proxy` ayarına saygı duyar, kayıtları temizler (bellek sızıntısı yok),
  uç nokta bazlı limitler.
- `express.json` 256 kB ile sınırlandı; 413/400 için düzgün hata yanıtları.
- Güvenlik başlıkları: sıkılaştırılmış CSP (`unsafe-eval` ve joker `https:` kaldırıldı),
  `frame-ancestors 'none'`, `X-Frame-Options`, `Permissions-Policy`, COOP/CORP.
  Kullanımdan kalkmış `X-XSS-Protection` kaldırıldı.
- Depoya işlenmiş canlı topluluk API anahtarları (`c4e_comm_*_live`) kaldırıldı.
- Bağış defteri atomik olarak (`tmp` + `rename`) ve `0600` izinle yazılır, kayıt sayısı sınırlı.
- `sanitizeUrl()`: kontrol karakteriyle gizlenmiş `java\nscript:` şemaları, `data:image/svg+xml`
  (script taşıyabilir), protokole bağlı `//evil.tld` adresleri ve bilinmeyen şemalar reddedilir.

### 1.7 Gizli topluluklar (özel gönderi görünürlüğü)

`communities.is_private` işaretli bir topluluğun gönderileri yalnızca üyelerine gösterilir.
Zorlama veritabanı seviyesindedir: `posts` SELECT politikası
`is_hidden_community_post(community_id)` fonksiyonuyla, üyeliği `profiles.joined_communities`
üzerinden kontrol eder — yani anon anahtarla doğrudan PostgREST'e gidilse bile satırlar
dönmez. Arayüz tarafında `utils/communityVisibility.ts` aynı kuralı uygular (akış, keşfet,
yer imleri, profil). Topluluğun kendisi keşfedilebilir kalır; herkes katılabilir.
`is_private` alanını yalnızca topluluk sahibi/yöneticisi değiştirebilir (tetikleyici korur).

### 1.8 Hata düzeltmeleri

- **`index.html` mevcut olmayan `/src/bakim.tsx` dosyasını yüklüyordu** → uygulama hiç
  açılmıyordu (beyaz ekran). `/src/main.tsx` geri getirildi.
- `CommunitySettingsModal` hook'ları erken `return null`'dan sonra çağırıyordu ve farklı bir
  topluluk açıldığında form eski değerlerde kalıyordu.
- Mobilde yakınlaştırmayı engelleyen `user-scalable=no` kaldırıldı (erişilebilirlik).
- Spark teması seçildiğinde profil banner görselinin kaybolması düzeltildi: gradyan banner
  artık yalnızca kullanıcı açıkça istediğinde (veya yüklü banner yoksa) kullanılır.

---

## 2. Dağıtım adımları (ÖNEMLİ)

1. **SQL'i çalıştırın:** `supabase_schema.sql` dosyasının tamamını Supabase SQL Editor'de
   çalıştırın. Betik idempotenttir (tekrar tekrar çalıştırılabilir) ve mevcut verileri korur;
   eski "her şeye izin ver" politikalarını siler, eksik sütunları ekler, mevcut Spark
   destekçilerini `supporter_tier = 'spark'` olarak işaretler ve `nylithra` hesabına
   `is_admin` verir.
2. **Ortam değişkenlerini ayarlayın:** `.env.example` dosyasındaki tüm değerleri doldurun.
   En kritikleri: `SUPABASE_SERVICE_ROLE_KEY`, `OAUTH_STATE_SECRET`,
   `BYNOGAME_WEBHOOK_SECRET`, `APP_URL`, `TRUST_PROXY`.
   `SUPABASE_SERVICE_ROLE_KEY` olmadan sunucu oturumların yönetici olup olmadığını
   doğrulayamaz ve Spark ayrıcalıklarını tanımlayamaz.
3. **Anahtarları yenileyin:** Depo geçmişinde bulunan tüm canlı anahtarları (Supabase anon
   anahtarı dahil değilse de, sızmış olabilecek servis anahtarları, bot tokenları, topluluk
   API anahtarları) iptal edip yeniden oluşturun.
4. **Firestore kullanılıyorsa** `firestore.rules` dosyasını dağıtın.
5. **Lanux girişini açmak istiyorsanız** Lanux Developer Console'da bir uygulama oluşturup
   `LANUX_ISSUER`, `LANUX_CLIENT_ID`, `LANUX_CLIENT_SECRET`, `LANUX_REDIRECT_URI` ve
   `LANUX_STATE_SECRET` değerlerini ayarlayın (ayrıntı: bölüm 2.4). Bu adım atlanırsa Lanux
   girişi kapalı kalır; GitHub girişi ve uygulamanın geri kalanı etkilenmez.
6. **Proje commit bildirimleri için** `MAIL_NOTIFY_CRON_SECRET` tanımlı olmalı (tarama onu
   kullanıyor) ve tercihen `GITHUB_TOKEN` verilmeli — kimliksiz GitHub isteği saatte 60 ile
   sınırlı ve bu birkaç projede tükenir. Ayrıntı: bölüm 2.5.

> Topluluk API'si `SUPABASE_SERVICE_ROLE_KEY` olmadan çalışmaz; anahtar yoksa tüm uçlar
> dürüstçe 503 döner. `community_api_keys` tablosu şemayla birlikte gelir.

---

## 2.1 Topluluk HTTP Paylaşım API'si

Kamuya açık dokümantasyon: `/dev/docs`. Güvenlik tasarımı:

- **Anahtarlar düz metin olarak saklanmaz.** Veritabanında yalnızca SHA-256 özeti tutulur;
  düz metin yalnızca oluşturulma yanıtında bir kez döner. Sızan bir yedek tekrar oynatılamaz.
- **Arama özet üzerinden yapılır** (`key_hash` üzerinde benzersiz indeks). Ön ek taraması
  yoktur, dolayısıyla hangi ön eklerin var olduğunu sızdıran bir zamanlama kanalı da yoktur.
- **Tarayıcı anahtar materyaline erişemez.** `community_api_keys` tablosunda RLS açıktır ve
  `anon` / `authenticated` rollerine hiçbir GRANT verilmemiştir; yalnızca servis rolü okur.
  (Yerel PostgreSQL 16 üzerinde doğrulandı: her iki rol de `permission denied` alıyor.)
- **Hedef topluluk anahtardan belirlenir**, adresteki handle'dan değil. Bir topluluğun
  anahtarıyla başka bir topluluğa gönderi atılamaz (403).
- **İptal anında geçerlidir.** İptal edilmiş anahtar, hiç var olmamış gibi 401 döner.
- **Anahtar yönetimi oturum ister,** API anahtarı kabul edilmez: anahtarla anahtar
  yönetilemez. Yalnızca topluluğun kurucusu veya platform yöneticisi yönetebilir.
- **Girdi temizlenir:** kontrol karakterleri ve "Trojan Source" saldırılarında kullanılan
  çift yönlü (bidi) yazım geçersiz kılma karakterleri silinir; uzunluk sınırları uygulanır.
- **Hız sınırı:** yayınlama dakikada 30, okuma dakikada 60, genel API tavanı dakikada 120.
  Topluluk başına en fazla 10 etkin anahtar.

Bu davranışların tamamı gerçek Express rotaları üzerinden uçtan uca test edilmiştir
(35 doğrulama, tamamı geçti).

---

## 2.1 Dağıtım biçimi: Vercel mi, kalıcı sunucu mu?

Proje iki şekilde çalışabilir ve **yetenekleri farklıdır**:

| | Vercel (sunucusuz) | Kalıcı Node süreci (Railway / Render / Fly.io / VPS) |
|---|---|---|
| Frontend | ✅ | ✅ |
| Topluluk API, OAuth, admin uçları | ✅ | ✅ |
| E-posta **gönderme** (SMTP) | ✅ | ✅ |
| E-posta **okuma** (IMAP) | ✅ isteğe bağlı eşitleme | ✅ anlık |
| Kalıcı yerel dosya (bağış defteri) | ❌ geçici | ✅ |

**Gelen kutusu sunucusuz ortamda nasıl çalışıyor?** Dondurulmuş bir fonksiyonun yapamadığı
şey, bir soketi **istekler arasında** açık tutmaktır — yani yeni posta beklemek için IDLE'da
bekleyen bir bağlantı. Tek bir istek içinde başlayıp biten `bağlan → çek → çık` turu ise
sıradan bir dışa bağlantıdır ve sorunsuz çalışır.

Bu yüzden posta sunucusuna giden **tek** uç `POST /api/admin/mail/sync`'tir. Yönetici
"Gelen kutusunu eşitle" dediğinde tek bir bağlantı açılır, başlıklar ve gövdeler çekilir,
bağlantı kapatılır ve her şey `admin_mail_cache` tablosuna yazılır. Sonraki her listeleme ve
okuma bu tablodan gelir; posta sunucusuna **hiç** bağlanılmaz. (Bu, testlerde varsayılmaz:
sahte IMAP sunucusu bağlantılarını sayar ve takım eşitleme sonrası okumaların bağlantı
sayısını artırmadığını doğrular.)

İki kip arasındaki fark bilinçlidir ve `imapMode()` ile ayrılır:

- **`sync` (sunucusuz).** Boş önbellek boş kalır; IMAP yalnızca eşitleme ile açılır. Aksi
  hâlde her sayfa yüklemesi fonksiyonun süre sınırına karşı yeni bir TLS el sıkışması ve
  LOGIN öderdi.
- **`live` (kalıcı sunucu).** Bağlantı ucuz olduğundan boş önbellek anlık okumaya düşer,
  böylece gelen kutusu ilk ziyarette boş görünmez. Eşitleme yine de çalışır ve önbelleği
  doldurur.

**Süre bütçesi.** Sunucusuz bir fonksiyon süre sınırında öldürülür ve elindekini kaydetme
şansı bulamaz; taşan bir eşitleme **hiçbir şey** saklamaz ve dışarıdan bozuk görünür. Bu
yüzden `syncInbox()` önce başlıkları yazar, sonra bütçesi (varsayılan 45 sn,
`MAIL_SYNC_BUDGET_MS` ile değişir) tükenene kadar gövdeleri indirir. Bütçe dolarsa
`truncated: true` döner, başlıklar yine de saklanmıştır ve kalan gövdeler açıldıkları anda
tek seferlik indirilip önbelleğe alınır. Gövdeler **en yeniden eskiye** indirilir: bütçe
biterse açılma olasılığı en yüksek mesajlar zaten saklanmış olur.

**Önbellek gizliliği.** `admin_mail_cache` ve `admin_mail_sync_state`, `community_api_keys`
gibi davranır: RLS açık, yalnızca `service_role` politikası var ve `anon`/`authenticated`
rollerine **hiçbir** GRANT verilmemiştir. Yani yöneticinin yazışmaları tarayıcıya yalnızca
`requireAdmin` korumalı `/api/admin/mail/*` uçlarından ulaşır, anon anahtarıyla asla. Bu,
gerçek PostgreSQL üzerinde doğrulanmıştır: her iki rol de `permission denied` alır.
`body_html` sütunu **zaten temizlenmiş** olarak saklanır (`sanitizeIncomingHtml`), böylece
düşmanca bir e-posta kalıcı XSS'e dönüşemez; arayüz yine de sandbox'lı iframe kullanır.
Eklerin **baytları hiç saklanmaz**, yalnızca ad/tür/boyut bilgisi tutulur.

`SUPABASE_SERVICE_ROLE_KEY` tanımlı değilse önbellek belleğe düşer; bu durumda arayüz
"sunucu yeniden başlarsa yeniden eşitlemeniz gerekir" uyarısını gösterir.

**Vercel kurulumu.** `vercel.json` içinde `/api/*` istekleri `api/index.js` fonksiyonuna,
diğer her şey `index.html`'e yönlenir. Yapı komutu `npm run build:vercel`'dir: Vite
frontend'i `dist/`e derler, ardından esbuild `src/server/vercelEntry.ts`'i **tek parça
CommonJS dosyası** olarak `api/index.js`'e paketler.

**Fonksiyon neden önceden paketleniyor?** Vercel, her TypeScript dosyasını *ayrı ayrı*
derleyip yan yana bırakır: `server.ts` → `/var/task/server.js`, fonksiyon →
`/var/task/api/index.js`. Depo kökü Vite için `"type": "module"` dediğinden `server.js`
bir ES modülüdür ve CommonJS bir fonksiyon onu `require()` edemez:

```
require() of ES Module /var/task/server.js from /var/task/api/index.js not supported
```

Fonksiyonu ESM'e çevirmek sorunu yalnızca taşır: Express'in bağımlılık ağacı CommonJS'tir
ve uzantısız göreli import'lar Node'un ESM yükleyicisinde çözülmez (`Dynamic require of
"path" is not supported`). İkisi de dışarıya `500 FUNCTION_INVOCATION_FAILED` olarak yansır.

Paketleme bu hata sınıfının tamamını ortadan kaldırır: çözülecek dosyalar arası import,
modül biçimi sınırı ve platformun TypeScript'i o ay nasıl derlediğine bağımlılık kalmaz.
Yalnızca `node_modules` dışarıda tutulur; onu Node normal şekilde çözer. `api/package.json`
(`"type": "commonjs"`) paketlenmiş çıktının kök `"type": "module"` tarafından ESM sanılmasını
engeller. `server.ts` ise sunucusuz ortamı algılayınca kendi `app.listen()` çağrısını atlar
(`isServerless`).

> `vercel.json` daha önce **her** isteği `index.html`'e yönlendiriyordu; bu yüzden `/api/*`
> dahil hiçbir arka uç ucu Vercel'de çalışmıyordu. Yalnızca posta değil, Topluluk API'si,
> OAuth geri dönüşü ve bağış webhook'u da etkileniyordu.

> Paketlenmiş `api/index.js`, Vercel'in `/var/task` yerleşimi birebir taklit edilerek ve
> gerçek SMTP/IMAP sunucularına karşı doğrulandı: üç gerileme takımı da (Topluluk API 35,
> e-posta konsolu 68, eşitleme 52 doğrulama) hem `live` hem `sync` kipinde hatasız geçti,
> SMTP gönderimi çalıştı ve fonksiyon hiçbir port dinlemedi.

Kalıcı bir süreçte hiçbir kod değişikliği gerekmez: `npm run build && npm start`.

---

## 2.1b Kod araması

Keşfet ekranı zaten kod parçacıklarında arıyordu — ama yalnızca **o an belleğe yüklenmiş**
gönderiler içinde. Yani "useEffect" araması akıştaki son birkaç düzine gönderiyi tarıyordu,
arşivin tamamını değil. Arama artık PostgreSQL'in tam metin indeksine gidiyor
(`posts.search_vector`, GIN).

**Yeni bir sunucu ucu yok ve bu bilinçli.** Sorgu, çağıranın kendi oturum belirteciyle
PostgREST'e gidiyor, dolayısıyla `posts` SELECT politikası aynen uygulanıyor: gizli topluluk
gönderileri üyesi olmayana dönmüyor. Gerçek PostgreSQL üzerinde doğrulandı — yabancı ve anon
2 sonuç, üye 3 sonuç görüyor. Servis rolüyle çalışan bir arama ucu yazmak bu güvenceyi elle
yeniden kurmayı gerektirir ve sızıntı için yeni bir yüzey açardı.

**Türkçe köklendirme kullanılmıyor, önek eşlemesi kullanılıyor.** Ölçüm: Snowball Türkçe
köklendiricisi belgedeki "Gönderilerimdeki" sözcüğünü `gönderi`, sorgudaki "gönderi"
sözcüğünü ise `gönder` köküne indiriyor — ikisi **asla eşleşmiyor**. Yani köklendirme, gözle
görülür biçimde orada olan bir kelimeyi bulunamaz hâle getiriyordu. Bunun yerine her kelimeye
önek operatörü (`gonderi:*`) ekleniyor; Türkçenin eklemeli yapısını çözüyor ve arama
kutusundan beklenen davranış bu.

**Diyakritikler katlanıyor.** Hem indeks hem sorgu `ç→c, ğ→g, ı→i, ö→o, ş→s, ü→u` dönüşümünden
geçiyor, böylece "gonderi" yazan biri "Gönderilerimdeki" bulur — Türkiye'de diyakritiksiz
yazmak çok yaygın. `unaccent` eklentisi yerine `translate()` kullanılıyor, çünkü `unaccent`
IMMUTABLE değil ve üretilmiş sütunda çalışmaz.

> **Bulunan ve düzeltilen hata:** PostgreSQL'in varsayılan çözümleyicisi düzyazı için
> tasarlanmış ve noktalı ifadeleri **alan adı** sanıyor. `f.read()` tek bir "host" token'ı
> (`f.read`) hâline geliyordu; önek eşlemesi token'ın başından başladığı için `read` araması
> onu **bulamıyordu**. Aynı sorun `np.array`, `obj.method`, `std::vector` için de geçerliydi —
> yani kod aramasının en sık kullanılacağı biçim sessizce çalışmıyordu.
> `search_code_tokens()` artık harf/rakam/alt çizgi dışını boşluğa çeviriyor; `f.read()` iki
> token oluyor ve ikisi de aranabiliyor. Bir gerileme nöbetçisi testi bu davranışı kilitliyor.

`code_snippet` sütunu JSON metni olarak saklandığı için yalnızca `code` alanı indeksleniyor;
JSON anahtarları sızsaydı "title" aramak her gönderiyi getirirdi (test bunu doğruluyor).
Ayrıştırma başarısız olursa ham metne düşülür — eski kayıtlar düz metin tutuyordu ve
doğrudan cast, üretilmiş sütunu tüm tablo için yazılamaz hâle getirirdi.

Sunucu araması kullanılamıyorsa (yapılandırılmamış veya çevrimdışı) arayüz yerel aramaya
düşer ve **hangisine baktığınızı açıkça yazar** — "tüm arşivde N sonuç" ile "yalnızca
yüklenmiş gönderilerde arandı" çok farklı iki şey.

Uçtan uca test edildi: 36 doğrulama, tamamı geçti. Tarayıcıda çalışan sorgu üreticisinin
ürettiği tsquery, gerçek şema üzerinde gerçek PostgreSQL'e verilerek sınandı — yani halka
kapalı, yalnızca fonksiyonun "bir metin ürettiği" değil, o metnin doğru satırları bulduğu
doğrulandı.

---

## 2.2a Bildirim e-postaları

Bekleyen bildirimler üyeye **tek bir özet e-postası** olarak gönderilir.

**Gönderime istemci karar veremez.** Bildirimleri istemci oluşturuyor (anon anahtarla, RLS
altında). "Şimdi şu kişiye posta at" demeyi de istemciye bıraksaydık, herhangi biri istediği
üyeye istediği içerikte, platformun kendi alan adından posta yollatabilirdi — doğrudan bir
kimlik avı aracı. Bu yüzden sunucu `notifications` tablosunu servis rolüyle **kendisi** okur;
istemciden gelen hiçbir şey gönderime girdi değildir.

| Uç | Kim çağırabilir |
|---|---|
| `POST/GET /api/notifications/email/dispatch` | Zamanlayıcı (`MAIL_NOTIFY_CRON_SECRET`) veya yönetici — başka kimse |
| `GET/POST /api/email/unsubscribe` | Herkes, ama yalnızca imzalı jetonuyla ve yalnızca kendi aboneliği için |
| `GET/PUT /api/me/email-prefs` | Yalnızca oturum sahibi, kendi tercihleri |

**Neden özet.** Popüler bir gönderi dakikalar içinde onlarca beğeni alır; her biri için ayrı
e-posta gelen kutusunu doldurur ve toplu abonelikten çıkışa yol açar. Dağıtım alıcı başına
tek posta üretir ve **aynı şeye gelen bildirimleri tek satırda toplar** ("ayşe ve 4 kişi daha
gönderini beğendi"), böylece 11 bildirim 4 satır olur.

**Yineleme koruması.** `notifications.email_sent_at` tek doğruluk kaynağıdır; gönderim biter
bitmez damgalanır. İki dağıtım üst üste binse veya sunucu ortada yeniden başlasa bile aynı
bildirim ikinci kez e-posta üretmez. Damgayı **istemci ne uydurabilir ne silebilir**: bunu
`protect_notification_email_state` tetikleyicisi garanti eder (şema 4.6) — aksi hâlde kötü
niyetli bir istemci damgayı doldurup karşı tarafın e-postasını sessizce engelleyebilirdi.
Gerçek PostgreSQL üzerinde üç dalı da doğrulandı.

**Varsayılanlar bilinçli olarak asimetrik.** Üyenin doğrudan muhatap olduğu olaylar (yanıt,
mesaj, takip, başvuru, davet) açık; beğeni / repost / yıldız kapalı gelir. Açık gelselerdi
ilk popüler gönderi bir kutu dolusu posta üretir ve üye topluca aboneliği bırakırdı.

**Abonelikten çıkma oturum gerektirmez** ve gerektirmemeli: bağlantıya tıklayan çoğunlukla
oturum açmamıştır, zaten bütün mesele "giriş yapmadan bu postaları durdurabilmek". Güvenliği
HMAC imzalı jeton sağlar — sahtesi üretilemez, başka bir üyeye çevrilemez. Ayrıca
`List-Unsubscribe` ve `List-Unsubscribe-Post` başlıkları gönderilir; Gmail ve Outlook'un
kendi tek tık "Abonelikten çık" düğmesini gösteren mekanizma budur ve yokluğu kullanıcıları
bunun yerine spam düğmesine iter.

> **Düzeltilen hata:** abonelikten çıkma bağlantısı önce dipnotun içine konmuştu; `sendMail`
> dipnotu 300 karaktere kırpıyor ve jetonu tam ortasından kesiyordu — yani opt-out bağlantısı
> **kalıcı olarak bozuk** gidiyordu. Artık ayrı bir alan (uzunluk sınırı yok) ve ayrıca bir
> mail başlığı. Test bunu nöbetçiye bağladı: imza SHA-256 HMAC olduğu için tam 64 onaltılık
> karakter olmak zorunda; kısalırsa test kırılır.

Adresi olmayan, profili bulunamayan veya tercihi kapalı alıcıların bildirimleri **yine de
damgalanır** — aksi hâlde kuyruğun başında kalıcı olarak birikir ve her dağıtımı yavaşlatırdı.
Gönderim hatasında damgalanmaz, bir sonraki turda yeniden denenir.

Bu davranışların tamamı gerçek bir SMTP sunucusuna karşı, gerçek Express rotaları üzerinden
uçtan uca test edildi (58 doğrulama, tamamı geçti).

---

## 2.2 E-posta konsolu (IMAP / SMTP)

Admin panelindeki **E-postalar** sekmesi; gelen kutusunu IMAP ile eşitleyip okur, kullanıcı
adından adres çözerek SMTP ile e-posta gönderir. Yapılandırma `.env` içindeki `MAIL_*`
değişkenleridir.

Uçlar:

| Uç | Ne yapar | Posta sunucusuna bağlanır mı? |
|---|---|---|
| `POST /api/admin/mail/sync` | Gelen kutusunu bir kerede çekip önbelleğe yazar | **Evet** — tek bağlantı |
| `GET /api/admin/mail/inbox` | Önbellekteki listeyi döner | Hayır (`live` kipinde boş önbellekte evet) |
| `GET /api/admin/mail/message/:uid` | Mesajı açar | Yalnızca gövde önbellekte yoksa |
| `DELETE /api/admin/mail/cache` | Eşitlenen kopyayı unutur (postaya dokunmaz) | Hayır |
| `POST /api/admin/mail/send` | Kullanıcı adına e-posta gönderir | Evet (SMTP) |

- **Tüm uçlar `requireAdmin` arkasındadır.** Normal üye 403 alır; oturumsuz çağrı da 403 alır
  (401 ile ayrılmaz, böylece ucun varlığı sızdırılmaz).
- **Bağlantı hedefi istekten alınmaz.** Sunucu, port ve kimlik bilgileri yalnızca ortam
  değişkenlerinden okunur. Aksi halde bu uç bir SSRF ve kimlik bilgisi sızdırma aracı olurdu.
- **Başlık enjeksiyonu engellenir.** Konu, görünen ad ve alıcı alanlarındaki CR/LF karakterleri
  temizlenir. Doğrulandı: konuya `\r\nBcc: ...` yazmak ek başlık üretmiyor, zarfta yalnızca
  tek alıcı kalıyor.
- **Gelen posta güvenilmez kabul edilir.** Sunucu tarafında `<script>`, `<iframe>`, olay
  öznitelikleri (`onerror` vb.), `javascript:` bağları ve uzak görseller temizlenir; istemci
  bunu ayrıca **`sandbox` özniteliği boş bir iframe** içinde gösterir (script çalıştırma ve
  same-origin erişimi kapalı). İki bağımsız katman.
- **Uzak görseller varsayılan olarak engellidir**; yüklemek açık bir tıklama ister, çünkü
  uzak görsel yöneticinin IP adresini gönderene açar ve adresin canlı olduğunu doğrular.
- **Parola hiçbir yanıtta, hiçbir logda geçmez.** Durum ucu yalnızca sunucu/port/güvenli mi
  bilgisini döndürür.
- **Eşitleme sıkı sınırlıdır: dakikada 6.** Her çağrı posta sağlayıcısına gerçek bir dış
  LOGIN'dir ve sağlayıcılar döngüye giren hesapları kısıtlar veya kilitler.
- Diğer hız sınırları: gönderme dakikada 20, bağlantı testi 6, gelen kutusu 30, mesaj açma 60,
  önbellek temizleme 10 (yönetici başına).
- **Posta kutusu adı komuta gömülür**, bu yüzden `safeMailboxName()` ile sıkı bir karakter
  kümesine indirgenir; tanınmayan her değer `INBOX`'a düşer.

Logo, e-posta istemcileri SVG göstermediği için `public/logo.svg` dosyasından üretilmiş
`public/email-logo.png` olarak CID ile gömülür (`node scripts/build-email-logo.mjs`).

Bu davranışların tamamı gerçek bir SMTP ve IMAP sunucusuna karşı, gerçek Express rotaları
üzerinden uçtan uca test edildi: posta konsolu 68 doğrulama, eşitleme akışı 52 doğrulama
(hem `live` hem `sync` kipinde), süre bütçesi 11 doğrulama — tamamı geçti.

---

## 2.3 Kapatılan gizlilik açığı: e-posta adresleri herkese açıktı

`profiles` tablosunda `GRANT SELECT` tablo genelindeydi ve `profiles_select_public` politikası
`USING (true)` olduğundan, **herkese açık anon anahtarını** eline geçiren biri şunu çalıştırıp
platformdaki tüm e-posta adreslerini toplayabiliyordu:

```
GET /rest/v1/profiles?select=username,email
```

RLS satır bazlıdır, sütun bazlı değildir; bu yüzden politika bunu engelleyemez. Çözüm sütun
seviyesinde yetkilendirmedir: `email` dışındaki sütunlar `anon` ve `authenticated` rollerine
açık, `email` hiçbirine açık değil. Sütun listesi canlı tablodan türetilir, böylece sonradan
eklenen bir sütun otomatik okunabilir kalır ve yalnızca `email` kapalı olur.

Yazma yetkisi tablo seviyesinde kalır (üye kendi adresini kaydedebilmeli); hangi satırı
yazabileceğini RLS zaten sınırlıyor. İstemci, oturum sahibinin kendi adresini Supabase auth
oturumundan (`user.email`) aldığı için hiçbir arayüz bu sütuna ihtiyaç duymuyor.

Yerel PostgreSQL 16 üzerinde doğrulandı: `anon` ve `authenticated` için hem `SELECT email`
hem `SELECT *` "permission denied" veriyor, diğer sütunlar okunabiliyor, servis rolü
okuyabiliyor.

---

## 2.4 Lanux ile giriş (OIDC)

Lanux, Code4Ever'e ikinci bir giriş yolu ve mevcut hesaplara bağlanabilen bir kimlik.
Bu akışın tek işi şu soruyu yanıtlamak: **"bu kişi gerçekten bu hesabın sahibi mi?"**
Aşağıdakilerin her biri o sorunun yanlış yanıtlanabileceği somut bir yolu kapatıyor.

### Akışın kendisi

- **PKCE (S256) zorunlu.** Yetkilendirme kodu ağda veya kayıtlarda görülse bile, doğrulayıcıyı
  bilmeyen biri onu jetona çeviremez.
- **`state` ve `nonce` birlikte.** `state` CSRF'i, `nonce` yeniden oynatmayı kapatır; ikisi de
  akış paketinde taşınır ve dönüşte karşılaştırılır.
- **Akış paketi HMAC ile mühürlü ve 10 dakika ömürlü.** Sunucusuz ortamda iki çağrı arasında
  paylaşılan bellek yok; durumu sunucuda tutmak yerine imzalı bir paket olarak taşımak, kurcalamayı
  imkânsız bırakırken çağrılar arası durum ihtiyacını tamamen ortadan kaldırıyor.
- **`id_token` JWKS ile doğrulanır** (`jose`): imza, `iss`, `aud`, süre ve `nonce`. Doğrulanmamış
  hiçbir alan kullanılmaz.

### Hesap eşleme

- **`lanux_user_id` kısmi UNIQUE indeksle korunur.** Bir Lanux hesabı en fazla bir Code4Ever
  hesabına bağlanabilir; ikinci bağlama veritabanı seviyesinde reddedilir.
- **Otomatik eşleme yalnızca `email_verified === true` ise yapılır.** Alan hiç gelmezse
  DOĞRULANMAMIŞ sayılır. `true` varsayılsaydı, sağlayıcıda doğrulanmamış bir adresi olan biri
  aynı adrese sahip bir Code4Ever hesabını devralabilirdi.
- **Kimlik sütunları profil tetikleyicilerinde sabitlenir**, yani üye kendi satırını güncelleyerek
  `lanux_user_id` veya `github_username` yazamaz; bu alanları yalnızca sunucu servis rolüyle
  değiştirir.
- **`lanux_refresh_token` sütun seviyesinde kapalıdır** — 2.3'teki e-posta sızıntısıyla aynı sınıf
  bir açık olurdu; `anon` ve `authenticated` rolleri bu sütunu okuyamaz.
- **Yenileme belirteçleri AES-256-GCM ile şifreli saklanır.** GCM seçildi çünkü bütünlüğü de
  doğruluyor; yalnızca şifreleyen bir kip saldırganın şifreli metni kurcalamasına izin verirdi.

### Oturum köprüsü

Lanux doğrulandıktan sonra Supabase oturumu, `admin/generate_link` ile üretilen `hashed_token`'ın
istemcide `verifyOtp` ile tüketilmesiyle kurulur. **Supabase'in JWT sırrıyla kendi jetonumuzu
imzalamak bilinçli olarak reddedildi**: o yol, oturum üretme yetkisini Supabase'in iptal ve süre
yönetiminin dışına taşır ve sızan tek bir sır sınırsız oturum üretimine dönüşürdü. Jeton adres
çubuğuna hiç yazılmaz; dönüşte yalnızca bir işaret bırakılır ve oturum POST ile teslim alınır.

### Sadece Lanux ile girenler ve depo erişimi

Lanux ile açılan bir hesapta GitHub kimliği yoktur, dolayısıyla depolar görünmez. Bu durum
**Ayarlar > Bağlı Hesaplar** ekranında amber renkli bir kartla açıkça söylenir ve GitHub hesabı
oradan bağlanır.

### Kapatılan açık: GitHub kullanıcı adı elle yazılıyordu

İlk sürümde üye GitHub **kullanıcı adını bir kutuya yazıyordu** ve sunucu yalnızca "böyle bir
GitHub kullanıcısı var mı" diye soruyordu. Varlık sahiplik değildir: bu hâliyle herhangi bir üye
tanınmış birinin kullanıcı adını kendi profiline bağlayıp **onun depolarını kendi profilinde**
gösterebilirdi.

Artık kullanıcı adı hiçbir yerde yazılmıyor. Bağlama, girişteki akışın aynısı: üye GitHub'a gidip
yetkilendirmeyi tamamlar, kullanıcı adı sunucu tarafından **Supabase auth kaydındaki GitHub
kimliğinden** servis rolüyle okunur. `POST /api/auth/github/link` isteğinin gövdesi yoktur ve
gövdeye yazılan herhangi bir kullanıcı adı yok sayılır — uçtan uca test bunu ayrıca ölçüyor.

Buna eşlik eden iki koruma:

- **`lower(github_username)` üzerinde kısmi UNIQUE indeks.** Sunucu yazmadan önce "başkasına bağlı
  mı" diye bakıyor, ama önce-oku-sonra-yaz bir yarış penceresi bırakır; asıl garanti indekste.
  `lower()` şart, çünkü GitHub kullanıcı adları büyük/küçük harf duyarsızdır — aksi hâlde `Owner`
  ve `owner` iki ayrı kayıt olur ve iki üye aynı depoları kendi profilinde gösterir.
- **Kullanıcı adı kırpılmadan doğrulanır.** Önce 39 karaktere kırpıp sonra biçim kontrolü yapmak,
  geçersiz bir değeri geçerli *görünen* başka birinin adına çevirir. (Bu, daha önce abonelikten
  çıkma bağlantısını bozan `headerSafe` kırpmasıyla aynı sınıf hata; test yakaladı.)

Bağlantıyı kaldırma, Lanux tarafındaki korumanın aynısını taşır: GitHub üyenin tek kimliğiyse
kaldırma reddedilir, aksi hâlde üye kendi hesabının kapısını kilitlemiş olurdu.

Şemanın bu indeksi eklerken mevcut veriyi bozmaması ayrıca doğrulandı: eski akıştan kalmış
çift kayıtlar (farklı harflerle yazılmış olanlar dahil) en erken bağlanan korunacak şekilde
temizleniyor, ardından indeks kuruluyor. Temizliğin `trg_protect_profile_privileges`
tetikleyicisini geçici olarak kapatması gerekiyor — tetikleyici kimlik sütunlarını sabitler ve
betik SQL Editor'de `postgres` olarak çalıştığı için muaf değildir; kapatma tek bir `DO` bloğu
(tek işlem) içinde yapılır, böylece koruma hiçbir durumda kapalı kalamaz.

### Yapılandırma

`LANUX_ISSUER`, `LANUX_CLIENT_ID`, `LANUX_CLIENT_SECRET`, `LANUX_REDIRECT_URI` ve
`LANUX_STATE_SECRET` için `.env.example` dosyasına bakın. Dördü eksikse Lanux girişi tamamen
kapalıdır ve GitHub girişi etkilenmez. `LANUX_STATE_SECRET` üretimde MUTLAKA sabitlenmelidir;
tanımsızsa süreç başına rastgele üretilir ve sunucusuz ortamda akış yarıda kopar.

### Doğrulama

Uçtan uca 70 doğrulama (gerçek Express rotaları ve RS256 imzalayan gerçek bir sahte sağlayıcıya
karşı) ve `id_token` saldırı takımında 19 doğrulama geçti. Saldırı takımı yalnızca reddedildiğini
değil, **geçerli bir jetonun aynı çalıştırmada kabul edildiğini** de ölçer — aksi hâlde JWKS'e
ulaşamamak da "her saldırı reddedildi" gibi görünürdü. Kapsanan saldırılar: yayımlanmamış anahtarla
imza, `alg=none`, yanlış `aud`, yanlış `iss`, yeniden oynatılan `nonce`, süresi dolmuş jeton, bozuk
girdi.

---

## 2.5 Projeler (vitrin, beğeni, takip, commit bildirimi)

Bir üye kendi GitHub deposunu platforma tanıtır; diğerleri **beğenir** (vitrin) ya da
**takip eder** (abonelik). Takip edenler her yeni commit'te bildirim alır, etmeyenler almaz.
Ayrıca iki liderlik tablosu var: *haftanın projesi* ve *tüm zamanların en çok beğenileni*.

### Bu bir yarışma, dolayısıyla puan korunmalı

Liderlik tabloları puana bakıyor. Puanın uydurulabildiği bir tablo, "kim daha çok istek
gönderdi" tablosundan ibaret olurdu. Bu yüzden:

- **Sayaçlar türetilmiş veridir.** `likes_count` / `followers_count` her güncellemede
  `project_likes` / `project_follows` tablolarındaki **gerçek satır sayısından yeniden
  hesaplanır** (tetikleyici 4.7). Kim ne yazarsa yazsın — üye, yönetici, hatta servis rolü —
  sonuç her zaman gerçek sayıdır.
- **Aynı üye bir projeyi iki kez beğenemez:** birleşim tablosunun birincil anahtarı
  `(project_id, user_id)`. İsteği tekrarlamak sayacı artırmaz.
- **Üye yalnızca kendi adına beğeni/takip satırı ekleyebilir** (RLS), ve bu tablolarda
  `UPDATE` yetkisi hiç verilmemiştir — bir beğeni ya vardır ya yoktur.
- **Depo ve sahiplik değiştirilemez.** Değiştirilebilseydi, beğenileri toplanmış bir projenin
  deposu bambaşka bir şeyle değiştirilip o beğeniler devralınabilirdi.

İlk tasarımda sayaçlar "eski değeri koru" biçiminde korunuyordu; bu YANLIŞTI, çünkü sayaçları
besleyen tetikleyicinin kendi güncellemesini de engelliyordu — beğeniler hiç sayılmıyordu.
Gerçek PostgreSQL üzerindeki test bunu yakaladı.

### Depo İSTEĞE BAĞLI, ama eklenirse sahipliği GitHub'a sorulur

**Proje paylaşmak GitHub gerektirmiyor.** İlk sürümde depo zorunluydu ve bu, GitHub bağlamayı
da zorunlu kılıyordu — yani GitHub kullanmayan biri hiçbir şey paylaşamıyordu. Her proje
GitHub'da değil: kapalı kaynak olabilir, başka bir platformda olabilir, henüz yayımlanmamış
olabilir.

Depo **eklenirse** sahipliği doğrulanır: sunucu depoyu GitHub'dan okuyup `owner.login` ile
üyenin doğrulanmış `github_username` alanını karşılaştırır. Yani doğrulama iddiayla orantılı —
"şu depo benim" demiyorsan kanıt da istenmiyor. Aynı doğrulama hem proje açılırken hem
sonradan depo eklenirken **tek bir fonksiyondan** geçiyor; iki ayrı kopya, birinin gevşek
kalması için açık davetiye olurdu.

Depo **sonradan eklenebilir** ama **bir kez bağlandıktan sonra değiştirilemez**: değişebilseydi
beğenileri toplanmış bir projenin deposu bambaşka bir şeyle takas edilip o beğeniler
devralınırdı. Şemadaki tetikleyici yalnızca BOŞTAN DOLUYA geçişe izin veriyor; sunucu da
zaten bağlı bir depoyu değiştirmeyi 409 ile reddediyor (sessizce yok saymak, üyenin
"değiştirdim" sanıp eskisiyle devam ettiğini fark etmemesine yol açardı).

Bir depo için yalnızca bir proje olabilir; garanti `lower(repo_full_name)` üzerindeki kısmi
UNIQUE indekste (sunucunun ön kontrolü önce-oku-sonra-yaz yarışı bırakır). Deposuz projeler
indekse hiç girmiyor, dolayısıyla birbirleriyle çakışmıyorlar. Commit tarayıcısı da deposuz
projeleri **sorguda** süzüyor: döngüde süzseydi, deposuz projeler tarama kotasını doldurur ve
depolu projelerin sırası hiç gelmezdi.

### Proje sayfası: /project/&lt;slug&gt;

Her projenin paylaşılabilir bir adresi var ve bu sayfa **oturum gerektirmiyor**. Bağlantıyı
alan biri, hesabı olmasa bile projeyi görebilmeli — `requireAuth` eklenseydi paylaşılan her
bağlantı giriş ekranına düşer ve özellik anlamını yitirirdi. Sayfa, kimlik doğrulama
kapısının ÖNÜNDE çözülüyor (aynı `/dev/docs` ve yasal sayfalar gibi).

Adres proje adından üretiliyor ve **Türkçe harfler çevriliyor, atılmıyor**: yalnızca
`[^a-z0-9]` süzgecinden geçirmek "Şahane Proje" → "ahane-proje" gibi harf yiyen adresler
üretirdi. Çakışma beklenen bir durum (iki üye aynı adı verebilir), sonuna artan bir sayı
ekleniyor.

**Adres bir kez verilir ve DEĞİŞMEZ.** Proje adı düzenlenebilir ama adres ilk hâliyle kalır;
değişmesine izin vermek, daha önce paylaşılmış her bağlantıyı sessizce kırmak demekti.
Şemadaki tetikleyici `slug`'ı sabitliyor, yani gövdeye `slug` yazmak da işe yaramıyor.

### Görseller

Kapak ve galeri data URL olarak saklanıyor (uygulamanın başka yerlerdeki medya düzeniyle
aynı). Üç şey bilinçli:

- **Liste sorguları görselleri okumuyor.** Tek bir kapak birkaç yüz kilobayt tutabilir; liste
  alanlarına eklenselerdi 30 projelik bir vitrin onlarca megabayta çıkardı. Yalnızca detay
  sorgusu okuyor, ve uçtan uca test listede gerçekten bulunmadıklarını ölçüyor.
- **SVG kabul edilmiyor.** Satır içi SVG `<script>` taşıyabilir ve doğrudan açıldığında ya da
  `<object>`/`<iframe>` içine alındığında XSS taşıyıcısına dönüşür — `sanitizeUrl` de aynı
  sebeple `data:image/svg+xml`'i dışarıda bırakıyor. `http:` de kabul edilmiyor, yalnızca
  `https:` ve raster `data:image`.
- **Boyut sınırları birlikte seçildi, ayrı ayrı değil.** Görsel başına 500KB, galeride 6
  görsel, rota gövde sınırı 4MB: en kötü durum (500KB × 7 = 3,5MB) hem rotanın hem Vercel'in
  4,5MB istek sınırının altında. Bağımsız seçilselerdi "kabul edilir" denen bir görsel gövde
  ayrıştırıcısı tarafından 413 ile reddedilir ve kullanıcı sebebini anlamazdı. İstemci
  göndermeden önce görselleri küçültüyor; bu kolaylık, **sınır sunucudaki**.

Düzenleme sahibine ait: oturumsuz istek 401, başkası 403. Bu kontrol hem ad/açıklama hem
görseller için aynı yerde.

### Bildirim yalnızca takip edenlere

Commit tarayıcısı zamanlayıcı sırrı ya da yönetici oturumu ister; herkese açık olsaydı, onu
istediği sıklıkta tetikleyen biri hem GitHub kotasını tüketir hem de takipçilere bildirim
akışı yarattırırdı. Tarayıcının üç davranışı bilinçli:

- **Sıra önemli:** `last_commit_sha` bildirimler GÖNDERİLDİKTEN SONRA yazılır. Tersi olsaydı,
  damgalama ile bildirim arasında düşen bir çağrı o commit'i sonsuza dek "bildirilmiş" sayar
  ve takipçiler onu hiç görmezdi.
- **İlk kontrol bildirim üretmez.** Proje eklendiği anda mevcut son commit "yeni" görünür;
  bildirim gönderilseydi her yeni proje, olmamış bir olay için posta atardı.
- **Ulaşılamayan depo turu durdurmaz.** Silinmiş/özelleştirilmiş depo sayaçla işaretlenir, tur
  devam eder. Süre bütçesi dolarsa tur temiz kesilir; sıralama `last_checked_at` alanına göre
  olduğu için sıradaki tur kaldığı yerden devam eder ve hiçbir proje aç kalmaz.

`project_commit` bildirimi e-posta özetine de giriyor ve varsayılanı **açık**: takip, üyenin
kendi eliyle kurduğu bir aboneliktir, kapalı gelseydi açıkça istediği şey yok sayılmış olurdu.
Üye bunu Ayarlar > E-posta bildirimleri bölümünden kapatabilir.

### Haftanın projesi gerçekten haftaya bakar

Toplam beğeniye bakmak kolay olurdu ama yanlış: birkaç hafta sonra "haftanın projesi" kalıcı
olarak "tüm zamanların projesi" ile aynı şeye dönüşür ve yeni projelerin hiç şansı kalmazdı.
Bu yüzden son 7 günün beğeni SATIRLARI sayılıyor — şemadaki ayrı birleşim tablosu tam olarak
bunu mümkün kılmak için var (JSONB dizisinde "ne zaman beğenildi" bilgisi yoktur). Hiç beğeni
almamış bir proje de ödül almaz.

### Doğrulama

Uçtan uca 85 doğrulama (gerçek Express rotaları, sahte GitHub'a gerçek HTTP) ve arayüzde 41
doğrulama geçti. Proje sayfası ayrıca 31 sunucu + 28 tarayıcı doğrulamasıyla ölçüldü;
tarayıcı testinin ilk bölümü TAMAMEN OTURUMSUZ bir bağlamda (localStorage boş, hiçbir jeton
yok) sayfanın açıldığını doğruluyor. Kapsanan saldırılar: başkasının deposunu kendi projesi gibi eklemek (hem
açarken hem sonradan), aynı depoyu iki kez eklemek (farklı harflerle dahil), bağlı bir depoyu
takas etmek, beğeni isteğini tekrarlayarak sayacı şişirmek, düzenleme gövdesiyle
depo/puan/sahiplik yazmak, takip etmeyene bildirim gitmesi, aynı commit için ikinci kez
bildirim, takibi bıraktıktan sonra bildirim almaya devam etmek, tarayıcıyı yetkisiz
tetiklemek. Ayrıca deposuz projelerin tarama kotasını tıkamadığı ölçülüyor. Şema güvenceleri
gerçek PostgreSQL üzerinde ayrıca doğrulandı: eski (NOT NULL'lu) şemadan yükseltme yolu dahil,
deposuz proje açma, sonradan depo bağlama, bağlandıktan sonra takas edememe.

---

## 2.6 Kapatılan hata: GitHub ile kayıt olanlar "bağlı değil" görünüyordu

GitHub ile kayıt olmuş bir üye, uygulamada "GitHub hesabını bağla" uyarısı alıyor ve proje
oluşturamıyordu. Bağlamayı yapsa bile uyarı geçmiyordu. **İki ayrı hata üst üste binmişti:**

1. **İstemci profil sorgusu `github_username` sütununu hiç istemiyordu.** `email` sızıntısı
   kapatılırken sütunlar tek tek sayılmıştı (bkz. 2.3); sonradan eklenen kimlik sütunları o
   listeye yazılmadı. Sonuç: bağlama sunucuda BAŞARIYLA yazılıyor, ama tarayıcı sütunu hiç
   okumadığı için `user.github_username` herkeste boş kalıyor ve proje oluşturma kapısı
   herkese kapalı duruyordu. Açıkça sayılan bir sütun listesi bu hatayı sessiz yapar:
   eksik sütun hata vermez, yalnızca hiç gelmez.
2. **Sütunu dolduran bir şey yoktu.** GitHub ile kayıt olan üyenin GitHub kimliği auth
   kaydında zaten var, ama `profiles.github_username` sütununu yalnızca açık bağlama ucu
   yazıyordu. Yani üyeye, zaten yaptığı bağlamayı yeniden yapması söyleniyordu.

Düzeltme üç parçalı:

- Kimlik sütunları istemci sorgusuna eklendi.
- **Sessiz onarım:** oturum açılışında `github_username` boşsa, bağlama ucu bir kez
  çağrılıyor. Uç kullanıcı adını auth kaydındaki kimlikten okuduğu için bu, yetkilendirmeye
  hiç gitmeden tamamlanıyor. Kimlik yoksa uç `needs_authorization` döner ve hiçbir şey olmaz.
- **Kapı artık sunucuya soruluyor.** Proje oluşturma kuralını sunucu zorunlu tutuyor;
  istemcideki önbelleğe bakarak karar vermek, eskimiş bir alanın aslında izinli olan bir
  üyeyi sessizce engellemesi demekti — ve tam olarak öyle oldu.

Ders: **sunucunun zorunlu tuttuğu bir kuralın arayüzdeki karşılığı da sunucudan gelmeli.**
İstemci önbelleğinden okunan bir "izin var mı" yanıtı, veri modeli değiştiğinde sessizce
yanlışa döner.

Doğrulama: hatayı birebir canlandıran 11 sunucu ve 7 tarayıcı doğrulaması eklendi (GitHub ile
kayıt olmuş, profil sütunu boş bir üyeyle başlayıp proje oluşturmaya kadar).

### Yan bulgular

- **PWA simgesi hiç çalışmıyordu.** `public/logo.png` aslında `.png` uzantılı bir SVG
  dosyasıydı; manifest onu `"type": "image/png"` diye tanıttığı için tarayıcı reddediyordu.
  Gerçek 192/512 PNG'ler `scripts/build-email-logo.mjs` ile üretiliyor, dosya gerçek türüyle
  (`logo-mark.svg`) yeniden adlandırıldı ve servis çalışanı önbellek sürümü yükseltildi —
  aksi hâlde kurulu uygulamalar bozuk dosyayı sunmaya devam ederdi.
- **Konsoldaki kalıcı "Status: VULNERABLE" yanlış alarmdı.** İstemci içi denetim,
  `sanitizeText`in HTML etiketlerini SÖKMESİNİ bekliyordu; oysa uygulamada hiçbir yerde
  `dangerouslySetInnerHTML` kullanılmıyor ve React metni zaten kaçışlıyor — etiket sökmek
  güvenlik kazandırmaz, yalnızca "a < b" gibi meşru içeriği bozar. Sürekli yanlış alarm veren
  bir gösterge gösterge olmaktan çıkar, bu yüzden ölçüt savunmanın gerçekten dayandığı iki
  özelliğe çevrildi (HTML bağlamında `escapeHtml`, URL bağlamında `sanitizeUrl`).
- **`sanitizeUrl` gerçekten gevşekti:** "içinde nokta var" gören her dizeye `https://`
  ekliyordu, yani `<script>alert(document.cookie)</script>` → `https://<script>...`. Şema
  https olduğu için XSS değildi ama olmayan bir adresi varmış gibi göstermek kendi başına bir
  hata kaynağı. Artık yalnızca başlangıcı gerçek bir konak adı olan dizeler tamamlanıyor.
  Aynı düzeltme, şemasız `konak:port` adreslerinin (`ornek.com:8443/yol`) yanlışlıkla
  reddedilmesini de gideriyor. 24 doğrulama her iki yönü de ölçüyor: meşru adresler geçiyor,
  tehlikeli ve anlamsız girdiler reddediliyor.

---

## 2.7 Kapatılan açık: bir üyenin profil satırına başka bir üyenin verisi yazılıyordu

**Bildirim:** "Başkasının profillerinde neden benim `nylithra` vitrinim görünüyor?"

Bu ekranda geçici bir karışıklık değil, **veritabanında kalıcı veri bozulmasıydı.**

### Sebep

`updateUserProfileInSupabase` (`src/services/supabaseClient.ts`) yalnızca kendi profilin için
değil, yönetici panelinden **başka üyeler** için de çağrılıyor (`handleAdminUpdateUser`:
yasaklama, abonelik atama, rozet verme). Yönetici panelinden gelen yük küçüktür — örneğin
`{ isBanned: true }`. İşlev, yükte olmayan alanları "kaybetmemek" için sırayla yedeklere
düşüyordu:

```
pinned_repos = yük → yükün custom_fields'ı → hedefin custom_fields'ı → hedef → local
```

Bu zincirin son halkası, **oturum sahibinin tarayıcıda saklı profili**. Hedef üyenin vitrini
hiç kurulmamışsa (çok yaygın) zincir oraya kadar iniyor ve yöneticinin `pinned_repos` değeri
hedefin satırına PATCH ediliyordu. Aynı zincir `website`, `badges` ve `subscription` için de
vardı. Hedef yerel önbellekte hiç yoksa taban nesnenin kendisi (`{...targetUser || local}`)
oturum sahibinin **tüm** profili oluyordu.

İki ek kapı aynı işlevde açıktı:

- Hedef satır **kullanıcı adıyla da** eşleştiriliyordu. Yükteki ad oturum sahibinin adıyla
  tutuyorsa farklı kimlikteki bir satır "benim satırım" sayılıyor, yük oturum sahibinin
  profilinden kuruluyordu — ve `saveStoredProfile` ile kendi saklı profilim başkasının
  verisiyle eziliyordu.
- `userId` boş gelirse hiçbir şey engellemiyordu; PATCH filtresi `id=eq.` olarak çıkıyordu.

### Düzeltme

Kural tek cümle: **`userId` oturum sahibinin kimliği değilse, oturum sahibinin hiçbir verisi
o yükün parçası olamaz.**

- Hedef **yalnızca kimlikle** bulunuyor; kullanıcı adı eşleşmesi kaldırıldı.
- `local` yedekleri (`pinned_repos`, `website`, `badges`, `subscription`) kaldırıldı. Meşru
  bir kaynak yoksa değer `undefined` kalıyor ve **o kolona hiç dokunulmuyor** — boşluğu
  başkasının verisiyle doldurmaktan iyisi boş bırakmaktır. Boş dizi yazmak da seçenek değil:
  o, hedefin mevcut vitrinini silmek olurdu.
- Hedef yerel önbellekte yoksa satır **veritabanından okunuyor**, çünkü `custom_fields` her
  güncellemede yazılıyor ve hedefin mevcut alanlarını bilmeden yazmak onları `{}` ile silmek
  demek. Okuma da başarısız olursa `custom_fields` kolonuna hiç dokunulmuyor.
- `saveStoredProfile` yalnızca gerçekten kendi satırım güncellendiğinde çağrılıyor.
- Kimliksiz çağrı en başta reddediliyor.

Ders: **bir "veri kaybetmeyelim" yedeği, yanlış kişinin verisini kaynak gösterdiği anda veri
sızıntısına dönüşür.** Eksik alanın doğru yedeği hedefin kendisidir; kaynak bulunamıyorsa
doğru davranış yazmamaktır.

### Zaten bozulmuş satırlar: `supabase_profile_repair.sql`

İstemci düzeltmesi geçmişi geri almaz. Sızan değer, kaynağın değerinin **birebir** kopyası
olduğu için ölçüt tahmin değil eşitlik: bir yönetici satırının `pinned_repos` / `website` /
`badges` / `subscription` değeriyle tıpatıp aynı olan yönetici olmayan satırlar. Betik önce
rapor veriyor (hiçbir şeyi değiştirmeden), onaydan sonra temizliyor, ikinci çalıştırmada
zararsız. Her alan ayrı ayrı ölçülüyor: yalnızca sitesi sızmış bir üyenin kendi kurduğu
vitrini silinmiyor.

Testte yakalanan nokta: `trg_protect_profile_privileges`, `custom_fields` içindeki
`subscription` anahtarını her UPDATE'te eski değerine geri yazıyor (normalde doğru davranış).
Onarım tam o alanı düzeltmek istediği için tetikleyici işlem boyunca devre dışı bırakılıyor;
DDL de işlem içinde olduğundan betik ortada başarısız olursa koruma kendiliğinden geri açılır.

### Yan bulgu: `ProfileView` ekranı düzenleme formundan okuyordu

`src/components/ProfileView.tsx` afişi, avatarı, adı, biyografiyi, rozetleri ve **vitrini**
`formData`dan basıyordu. `formData` düzenleme formunun durumu; görüntülenen profil ise başkası
olabilir. Bir effect `user` değiştiğinde `formData`yı yenilediği için bu, bildirilen hatanın
sebebi *değildi* — ölçüm bunu doğruladı, kırık sürümde bile vitrin sızmıyor. Yine de yanlış
kaynak yanlış kaynaktır: görüntüleme artık ayrı bir `view` nesnesinden okuyor, düzenleme
alanları `formData`dan. Aynı dosyada iki somut hata da çıktı: "Mesaj Gönder" sohbeti
`formData` ile açıyordu (yani kendinle), `UserBadges` başkasının profilinde oturum sahibinin
yönetici/destekçi rozetlerini gösteriyordu. `isOwnProfile` ise oturum sahibi bilinmediğinde
TRUE'ya düşüyordu — yanlış tarafa açılan bir kapı, bugün erişilemese de kapatıldı.

Ayrıca kaydetme yükü artık görüntülenen üyeden değil oturum sahibinden kuruluyor, ve
`App.tsx`'teki `handleUpdateProfile` başka bir üyenin satırını hedefleyen bir yükü reddediyor
— aynı hatanın ikinci bir yoldan tekrarlamaması için.

### Doğrulama

- **34 tarayıcı doğrulaması** (`capraz-yazim`): gerçek `updateUserProfileInSupabase`, gerçek
  `supabase-js` istemcisi ve `profiles` tablosunun PostgREST taklidi. Ölçüm noktası ekran
  değil **sunucuya giden PATCH gövdesi**, çünkü ekrandaki yanlış veri bir sonraki yüklemede
  önbellekten geri gelir ve test kendi kendini yanıltır. Kırık sürümde 8 doğrulama düşüyor:
  hedefin satırında `YONETICININ-DEPOSU` ve yöneticinin sitesi görünüyor, hedefin kendi
  `location` alanı siliniyor, saklı kendi profilim başkasının adını alıyor.
- **22 veritabanı doğrulaması** (`onarim`): onarım betiği gerçek PostgreSQL üzerinde gerçek
  şemaya karşı. Kurban temizleniyor, **masum üyenin kendi vitrini ve sitesi duruyor**,
  yönetici satırlarına dokunulmuyor, ikinci çalıştırma hiçbir şeyi değiştirmiyor.
- **23 tarayıcı doğrulaması** (`profil-leak`): başkasının profilinde oturum sahibinin
  verisinin hiçbiri görünmüyor, kendi profiline dönünce geri geliyor.

---

## 3. Bilinen sınırlamalar

- **Mesajlaşma gerçek anlamda E2EE değildir.** AES anahtarı, herkese açık istemci paketindeki
  sabit bir değer ve konuşma kimliğinden türetilir; satırı okuyabilen anahtarı da türetebilir.
  Gizliliği bugün sağlayan şey RLS politikasıdır. Ayrıntı ve önerilen ECDH tabanlı çözüm için
  `src/utils/e2eeHelper.ts` başındaki nota bakın. Bu düzeltilene kadar arayüzde/pazarlamada
  "uçtan uca şifreli" ifadesi kullanılmamalıdır.
- **CSP `'unsafe-inline'` içerir** (Vite geliştirme sunucusunun react-refresh betiği için).
  Üretimde nonce tabanlı bir CSP daha güçlü olur.
- **Yönetici kontrolü hâlâ istemcide görsel olarak yapılır.** Asıl yetki RLS'tedir; arayüzdeki
  kontroller yalnızca kullanıcı deneyimi içindir.
- **Moderasyon durumu (`isBanned`) `custom_fields` JSONB alanında tutulur.** Tetikleyici bu
  anahtarları korur, ancak uzun vadede ayrı ve tip güvenli sütunlar tercih edilmelidir.

---

## 4. Güvenlik açığı bildirimi

Bir güvenlik açığı bulursanız lütfen herkese açık bir issue açmadan önce proje
sorumlusuyla iletişime geçin.
