-- =====================================================================================
-- VİTRİN SIZINTISI ONARIMI — bir kez elle çalıştırılır.
-- =====================================================================================
--
-- NE OLDU: `updateUserProfileInSupabase` eksik alanları doldururken oturum sahibinin
-- tarayıcıda saklı profiline düşüyordu. Yönetici panelinden bir üye güncellendiğinde
-- (yasaklama, abonelik atama, rozet verme) o üyenin satırına YÖNETİCİNİN `pinned_repos`,
-- `website`, `badges` ve `subscription` değerleri yazıldı. Hata istemci tarafında
-- düzeltildi; ancak yazılan satırlar veritabanında kaldı, çünkü düzeltme geçmişi geri
-- almıyor. Bu betik o satırları temizler.
--
-- İMZA: sızan değer, kaynağın değerinin BİREBİR aynısıdır (kopyalandı, üretilmedi). Bu
-- yüzden ölçüt "başka bir üyenin değerine tıpatıp eşit olmak"tır — tahmin değil, eşitlik.
-- Kaynak olarak yalnızca yönetici satırları aranıyor: sızıntı yalnızca başkasının satırını
-- yazabilen hesaplardan, yani yöneticilerden çıkabiliyordu.
--
-- NASIL ÇALIŞTIRILIR: önce 1. bölümü çalıştırıp raporu okuyun. Listeyi onaylamadan
-- 2. bölümü çalıştırmayın. İkinci kez çalıştırmak zararsızdır (temizlenen satır artık
-- ölçüte uymaz).
--
-- NE YAPMAZ: bir üyenin KENDİ kurduğu vitrini silmez. Yalnızca bir yöneticinin
-- vitrininin tıpatıp kopyası olan satırlar temizlenir.
-- =====================================================================================


-- =====================================================================================
-- 1. BÖLÜM — RAPOR. Hiçbir şeyi değiştirmez; neyin temizleneceğini gösterir.
-- =====================================================================================

WITH yoneticiler AS (
  SELECT
    p.id,
    p.username,
    p.pinned_repos,
    p.website,
    p.custom_fields -> 'pinned_repos' AS cf_pinned,
    p.custom_fields -> 'badges'       AS cf_badges,
    p.custom_fields -> 'subscription' AS cf_subscription
  FROM public.profiles p
  WHERE p.is_admin IS TRUE
)
SELECT
  u.id                AS etkilenen_id,
  u.username          AS etkilenen_kullanici,
  y.username          AS sizinti_kaynagi,
  (u.pinned_repos IS NOT NULL AND u.pinned_repos = y.pinned_repos
     AND jsonb_array_length(COALESCE(y.pinned_repos, '[]'::jsonb)) > 0)      AS vitrin_sizdi,
  (u.website IS NOT NULL AND u.website <> '' AND u.website = y.website)      AS site_sizdi,
  (u.custom_fields -> 'pinned_repos' = y.cf_pinned
     AND jsonb_array_length(COALESCE(y.cf_pinned, '[]'::jsonb)) > 0)         AS cf_vitrin_sizdi,
  (u.custom_fields -> 'badges' = y.cf_badges
     AND jsonb_array_length(COALESCE(y.cf_badges, '[]'::jsonb)) > 0)         AS rozet_sizdi,
  (u.custom_fields -> 'subscription' = y.cf_subscription
     AND COALESCE((y.cf_subscription ->> 'isActive')::boolean, false))       AS abonelik_sizdi
FROM public.profiles u
JOIN yoneticiler y ON y.id <> u.id
WHERE u.is_admin IS NOT TRUE
  AND (
    (u.pinned_repos IS NOT NULL AND u.pinned_repos = y.pinned_repos
       AND jsonb_array_length(COALESCE(y.pinned_repos, '[]'::jsonb)) > 0)
    OR (u.website IS NOT NULL AND u.website <> '' AND u.website = y.website)
    OR (u.custom_fields -> 'pinned_repos' = y.cf_pinned
       AND jsonb_array_length(COALESCE(y.cf_pinned, '[]'::jsonb)) > 0)
    OR (u.custom_fields -> 'badges' = y.cf_badges
       AND jsonb_array_length(COALESCE(y.cf_badges, '[]'::jsonb)) > 0)
    OR (u.custom_fields -> 'subscription' = y.cf_subscription
       AND COALESCE((y.cf_subscription ->> 'isActive')::boolean, false))
  )
ORDER BY u.username;


-- =====================================================================================
-- 2. BÖLÜM — TEMİZLİK. Raporu onayladıktan sonra çalıştırın.
-- =====================================================================================
--
-- Her alan AYRI AYRI ölçülüyor. Toplu bir "bu satır bozuk" kararı, yalnızca sitesi sızmış
-- bir üyenin kendi kurduğu vitrini de silerdi.
--
-- Sütun koruma tetikleyicisi (`trg_protect_profile_privileges`) bu güncellemeye karışmıyor:
-- burada yalnızca vitrin, site, rozet ve abonelik alanları değişiyor; rol, yönetici bayrağı
-- ve kimlik sütunlarına dokunulmuyor.

BEGIN;

-- KORUMA TETİKLEYİCİSİ BU ONARIM BOYUNCA DEVRE DIŞI.
--
-- `trg_protect_profile_privileges`, custom_fields içindeki `subscription` ve moderasyon
-- alanlarını her UPDATE'te ESKİ değerine geri yazıyor (haklı olarak: normalde bunlar
-- istemciden değiştirilemez). Onarım tam olarak o alanlardan birini düzeltmek istediği
-- için tetikleyici açıkken 2.4 sessizce hiçbir şey yapmaz — testte böyle yakalandı.
--
-- DDL de işlem içinde olduğundan, betik ortada başarısız olursa tetikleyici kendiliğinden
-- geri açılır; tabloyu korumasız bırakacak bir ara durum yok.
ALTER TABLE public.profiles DISABLE TRIGGER trg_protect_profile_privileges;

-- 2.1 — Sızan vitrin: hem sütun hem custom_fields kopyası.
WITH yoneticiler AS (
  SELECT id, pinned_repos, custom_fields -> 'pinned_repos' AS cf_pinned
  FROM public.profiles WHERE is_admin IS TRUE
),
hedefler AS (
  SELECT DISTINCT u.id
  FROM public.profiles u
  JOIN yoneticiler y ON y.id <> u.id
  WHERE u.is_admin IS NOT TRUE
    AND (
      (u.pinned_repos IS NOT NULL AND u.pinned_repos = y.pinned_repos
         AND jsonb_array_length(COALESCE(y.pinned_repos, '[]'::jsonb)) > 0)
      OR (u.custom_fields -> 'pinned_repos' = y.cf_pinned
         AND jsonb_array_length(COALESCE(y.cf_pinned, '[]'::jsonb)) > 0)
    )
)
UPDATE public.profiles p
SET pinned_repos = '[]'::jsonb,
    custom_fields = jsonb_set(COALESCE(p.custom_fields, '{}'::jsonb), '{pinned_repos}', '[]'::jsonb),
    updated_at = now()
FROM hedefler h
WHERE p.id = h.id;

-- 2.2 — Sızan site adresi.
WITH yoneticiler AS (
  SELECT id, website FROM public.profiles WHERE is_admin IS TRUE AND website IS NOT NULL AND website <> ''
),
hedefler AS (
  SELECT DISTINCT u.id
  FROM public.profiles u
  JOIN yoneticiler y ON y.id <> u.id AND u.website = y.website
  WHERE u.is_admin IS NOT TRUE
)
UPDATE public.profiles p
SET website = NULL,
    custom_fields = COALESCE(p.custom_fields, '{}'::jsonb) - 'website',
    updated_at = now()
FROM hedefler h
WHERE p.id = h.id;

-- 2.3 — Sızan rozetler. Üyenin kendi rozetleri silinmez: yalnızca bir yöneticinin rozet
-- dizisinin tıpatıp kopyası olanlar boşaltılır.
WITH yoneticiler AS (
  SELECT id, custom_fields -> 'badges' AS cf_badges
  FROM public.profiles
  WHERE is_admin IS TRUE AND jsonb_array_length(COALESCE(custom_fields -> 'badges', '[]'::jsonb)) > 0
),
hedefler AS (
  SELECT DISTINCT u.id
  FROM public.profiles u
  JOIN yoneticiler y ON y.id <> u.id AND u.custom_fields -> 'badges' = y.cf_badges
  WHERE u.is_admin IS NOT TRUE
)
UPDATE public.profiles p
SET custom_fields = jsonb_set(COALESCE(p.custom_fields, '{}'::jsonb), '{badges}', '[]'::jsonb),
    badges = '[]'::jsonb,
    updated_at = now()
FROM hedefler h
WHERE p.id = h.id;

-- 2.4 — Sızan abonelik. Devralınan ETKİN abonelik, ücretli bir planı bedava dağıtmak
-- demektir; bu yüzden boş plana çevriliyor.
WITH yoneticiler AS (
  SELECT id, custom_fields -> 'subscription' AS cf_sub
  FROM public.profiles
  WHERE is_admin IS TRUE
    AND COALESCE((custom_fields -> 'subscription' ->> 'isActive')::boolean, false)
),
hedefler AS (
  SELECT DISTINCT u.id
  FROM public.profiles u
  JOIN yoneticiler y ON y.id <> u.id AND u.custom_fields -> 'subscription' = y.cf_sub
  WHERE u.is_admin IS NOT TRUE
)
UPDATE public.profiles p
SET custom_fields = jsonb_set(
      COALESCE(p.custom_fields, '{}'::jsonb),
      '{subscription}',
      '{"planId":"","planName":"","isActive":false,"assignedAt":"","expiresAt":""}'::jsonb
    ),
    updated_at = now()
FROM hedefler h
WHERE p.id = h.id;

ALTER TABLE public.profiles ENABLE TRIGGER trg_protect_profile_privileges;

COMMIT;


-- =====================================================================================
-- 3. BÖLÜM — DOĞRULAMA. Temizlikten sonra 1. bölümü yeniden çalıştırın: sıfır satır
-- dönmeli. Dönen satır kalırsa, o değer gerçekten o üyeye ait olabilir (örneğin iki
-- yönetici aynı siteyi paylaşıyor) — elle bakılmalı.
-- =====================================================================================
