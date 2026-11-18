# Güvenlik testleri

Bu klasördeki testler, kapatılan açıkların **kapalı kaldığını** gösteriyor. Her biri
gerçek bir saldırı denemesini kurup sonucun engellendiğini doğruluyor; taklit edilen
tek şey altyapı (veritabanı sunucusu, PostgREST), sınanan şey projenin kendi kodu.

İkisi de bağımlılık kurulumu istemiyor: `psql` ve `node` yeterli.

---

## 1. `rls_yetki.sql` — veritabanı yetki katmanı (29 senaryo)

**Neden veritabanında sınanıyor:** istemci Supabase'e anon anahtarla **doğrudan**
yazıyor. Yani "kim neyi değiştirebilir" sorusunun tek gerçek yanıtı RLS politikaları
ve `BEFORE UPDATE` tetikleyicileri — sunucu bu yolu hiç görmüyor. Sunucuya karşı
yazılmış bir test bu katmanı hiç sınamaz.

Kapsadığı başlıklar:

| Bölüm | Ne sınanıyor |
|---|---|
| A | Profil avatar/kapak görsellerinde boyut sınırı (üye, servis rolü, INSERT ve UPDATE yolları) |
| B | Gönderi yorumları ve beğenileri: uydurma, silme, düzenleme, sayaç şişirme |
| C | İş ilanı başvuruları: başkasının adına başvuru, başvuru silme, özgeçmiş değiştirme |
| D | Grup üyeliği: üye olmayanın listeyi baştan yazması, son mesaj uydurması |
| E | Topluluk üye sayacı |
| F | Ayrıcalık yükseltme (`is_admin`, `verified`, kimlik bağlantıları) |

Her senaryoda aynı üç oyuncu var: **sahip** (içeriğin sahibi), **saldirgan** (giriş
yapmış ama sahibi değil), **ucuncu** (etkileşimi depoda duran üçüncü kişi). Testin
sorduğu soru hep aynı: *saldirgan, sahibi olmadığı bir şeye ne yapabiliyor?*

### Çalıştırma

Boş bir Postgres veritabanı gerekiyor (yerel bir örnek yeterli, Supabase'e bağlanmaya
gerek yok):

```bash
createdb c4e_test

# 1. Supabase'in şemada varsaydığı parçaların asgari taklidi (auth.uid(), auth.role(), roller).
#    profiles.id'yi UUID olarak önceden yaratıyor: canlı kurulum böyle ve
#    `CREATE TABLE IF NOT EXISTS` var olan bir tabloyu asla değiştirmiyor.
psql -d c4e_test -f tests/guvenlik/supabase_taklit.sql

# 2. Şemanın kendisi. İki kez çalıştırmak da hatasız olmalı (idempotent).
psql -d c4e_test -f supabase_schema.sql

# 3. Testler.
psql -d c4e_test -f tests/guvenlik/rls_yetki.sql
```

Son satır `29/29 senaryo geçti` yazmalı. Kalan bir senaryo varsa altında beklenen ve
bulunan değerle birlikte listelenir.

**Oturum taklidi nasıl çalışıyor:** `supabase_taklit.sql`, `auth.uid()` ve
`auth.role()` fonksiyonlarını `current_setting('test.uid')` / `current_setting('test.role')`
okuyacak biçimde tanımlıyor. Test de `SET test.uid = '...'` ile "şimdi şu kişi istek
yapıyor" diyor. Politikalar ve tetikleyiciler bu iki fonksiyonu çağırdığı için, canlı
ortamdaki akışın aynısı çalışıyor.

---

## 2. `oauth_yenileme.mjs` — OAuth belirteç ucu (7 senaryo)

`/api/oauth/token` ucunu **gerçek Express sunucusuna** karşı sınıyor. Asıl konu: bir
yenileme belirteci, **istemci sırrı sunulmadan** yeni erişim belirteci üretebiliyor
muydu. Kayıtta her uygulamaya bir `client_secret` verildiği için platformda açık
istemci yok; yani sızan tek bir yenileme belirteci, sır hiç bilinmeden 30 gün boyunca
erişim üretmeye yetiyordu.

Ayrıca lisans ucunun artık uydurma onay dönmediğini ve tanılama ucunun üretimde kapalı
olduğunu doğruluyor.

Sınanan senaryolar:

1. Sırsız yenileme reddediliyor
2. Doğru sırla yenileme çalışıyor — *ve reddedilen istek belirteci yakmamış oluyor*
3. Yanlış sırla yenileme reddediliyor
4. Boş dizge "sır gönderildi" sayılıp denetim atlanmıyor
5. Yenileme belirteci tek kullanımlık (atomik `DELETE ... RETURNING`)
6. `/api/license/validate` uydurma `valid: true` dönmüyor
7. `/api/rate-limit-test` üretimde 404

### Çalıştırma

```bash
npm run test:guvenlik
# ya da doğrudan:
node tests/guvenlik/oauth_yenileme.mjs
```

Başka hiçbir hazırlık gerekmiyor: test taklit PostgREST katmanını, DNS yönlendirmesini
ve sunucuyu kendisi ayağa kaldırıyor, `dist/server.cjs` yoksa kendisi derliyor. Son
satır `7/7 geçti` yazmalı.

**Taklit edilen tek şey veritabanı.** Express rotası, imza doğrulaması ve belirteç
üretimi projenin gerçek kodu. DNS yaması gerekiyor çünkü `safeFetch` özel/yerel
adresleri SSRF denetimiyle reddediyor; yama yalnızca `mock.supabase.test` adını
yerel taklide yönlendiriyor, sunucu kodu değişmiyor.
