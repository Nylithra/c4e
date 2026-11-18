-- =============================================================
-- RLS / TETİKLEYİCİ YETKİ TESTLERİ
-- =============================================================
--
-- NE SINANIYOR: istemci Supabase'e anon anahtarla DOĞRUDAN yazdığı için, "kim neyi
-- değiştirebilir" sorusunun tek gerçek yanıtı RLS politikaları ve BEFORE UPDATE
-- tetikleyicileri. Bu dosya o katmanı, sunucuyu hiç işin içine katmadan sınıyor.
--
-- NASIL ÇALIŞTIRILIR (ayrıntı: tests/guvenlik/README.md):
--   psql -d <veritabani> -f tests/guvenlik/supabase_taklit.sql
--   psql -d <veritabani> -f supabase_schema.sql
--   psql -d <veritabani> -f tests/guvenlik/rls_yetki.sql
--
-- Çıktı her senaryo için GECTI / KALDI yazar ve sonunda özet verir; bir senaryo
-- kalırsa dosya sıfırdan farklı bir durumla değil, sayılan bir "KALDI" ile biter,
-- bu yüzden özete bakın.

\set ON_ERROR_STOP off
\pset pager off
\t on
\a

CREATE TEMP TABLE IF NOT EXISTS _sonuc (ad TEXT, gecti BOOLEAN, beklenen TEXT, bulunan TEXT);

CREATE OR REPLACE FUNCTION pg_temp.kontrol(ad TEXT, beklenen TEXT, bulunan TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE ok BOOLEAN := coalesce(beklenen, '<null>') = coalesce(bulunan, '<null>');
BEGIN
  INSERT INTO _sonuc VALUES (ad, ok, beklenen, bulunan);
  IF ok THEN
    RAISE NOTICE 'GECTI  %', ad;
  ELSE
    RAISE WARNING 'KALDI  %  (beklenen: %, bulunan: %)', ad, beklenen, bulunan;
  END IF;
END; $$;

-- -------------------------------------------------------------
-- Oyuncular: sahip (içeriğin sahibi), saldirgan (giriş yapmış ama sahibi değil),
-- ucuncu (etkileşimi depoda duran üçüncü kişi).
-- -------------------------------------------------------------
SET test.role = 'service_role';

INSERT INTO auth.users (id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002'),
  ('cccccccc-0000-0000-0000-000000000003')
ON CONFLICT DO NOTHING;

INSERT INTO public.profiles (id, username) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'sahip'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'saldirgan'),
  ('cccccccc-0000-0000-0000-000000000003', 'ucuncu')
ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username;

-- =============================================================
-- A. PROFİL GÖRSEL BOYUTU
-- =============================================================
\echo ''
\echo '--- A. Profil görsel boyutu ---'

SET test.role = 'authenticated';
SET test.uid  = 'aaaaaaaa-0000-0000-0000-000000000001';

UPDATE public.profiles SET avatar_url = 'data:image/png;base64,' || repeat('A', 100000)
WHERE username = 'sahip';
SELECT pg_temp.kontrol('makul boyutlu avatar kabul edildi', '100022',
  (SELECT length(avatar_url)::text FROM public.profiles WHERE username = 'sahip'));

DO $$
BEGIN
  UPDATE public.profiles SET avatar_url = repeat('A', 13000000) WHERE username = 'sahip';
  PERFORM pg_temp.kontrol('13MB avatar reddedildi', 'hata', 'gecti');
EXCEPTION WHEN others THEN
  PERFORM pg_temp.kontrol('13MB avatar reddedildi', 'hata', 'hata');
END $$;

DO $$
BEGIN
  UPDATE public.profiles SET banner_url = repeat('B', 13000000) WHERE username = 'sahip';
  PERFORM pg_temp.kontrol('13MB kapak reddedildi', 'hata', 'gecti');
EXCEPTION WHEN others THEN
  PERFORM pg_temp.kontrol('13MB kapak reddedildi', 'hata', 'hata');
END $$;

DO $$
BEGIN
  SET LOCAL test.role = 'service_role';
  UPDATE public.profiles SET avatar_url = repeat('C', 13000000) WHERE username = 'sahip';
  PERFORM pg_temp.kontrol('13MB avatar servis rolünde de reddedildi', 'hata', 'gecti');
EXCEPTION WHEN others THEN
  PERFORM pg_temp.kontrol('13MB avatar servis rolünde de reddedildi', 'hata', 'hata');
END $$;

SELECT pg_temp.kontrol('reddedilen yazma satırı bozmadı', '100022',
  (SELECT length(avatar_url)::text FROM public.profiles WHERE username = 'sahip'));

-- =============================================================
-- B. GÖNDERİ ETKİLEŞİMİ
-- =============================================================
\echo ''
\echo '--- B. Gönderi etkileşimi ---'

SET test.role = 'service_role';
DELETE FROM public.posts WHERE id = 'post_test';
INSERT INTO public.posts (id, author_id, author, content, comments, liked_by, likes_count, comments_count)
VALUES ('post_test', 'aaaaaaaa-0000-0000-0000-000000000001',
  '{"username":"sahip","display_name":"Sahip","avatar_url":""}'::jsonb,
  'Sahibin özgün gönderisi.',
  '[{"id":"c1","author":{"username":"ucuncu","display_name":"Üçüncü","avatar_url":""},"content":"Üçüncünün yorumu","created_at":"2026-01-01T00:00:00Z"}]'::jsonb,
  '["ucuncu"]'::jsonb, 7, 1);

-- Buradan sonra isteği yapan: giriş yapmış ama gönderinin sahibi OLMAYAN üye.
SET test.role = 'authenticated';
SET test.uid  = 'bbbbbbbb-0000-0000-0000-000000000002';

UPDATE public.posts SET comments = comments ||
  '[{"id":"sahte","author":{"username":"sahip","display_name":"Sahip","avatar_url":""},"content":"Bu yorumu ben yazmadim","created_at":"2026-02-02T00:00:00Z"}]'::jsonb
WHERE id = 'post_test';
SELECT pg_temp.kontrol('başkasının adına yorum uydurulamıyor', 'false',
  (SELECT (comments @> '[{"id":"sahte"}]'::jsonb)::text FROM public.posts WHERE id = 'post_test'));

UPDATE public.posts SET comments = '[]'::jsonb WHERE id = 'post_test';
SELECT pg_temp.kontrol('başkasının yorumu silinemiyor', 'ucuncu',
  (SELECT comments->0->'author'->>'username' FROM public.posts WHERE id = 'post_test'));

UPDATE public.posts SET comments =
  '[{"id":"c1","author":{"username":"ucuncu","display_name":"Üçüncü","avatar_url":""},"content":"DEGISTIRILDI","created_at":"2026-01-01T00:00:00Z"}]'::jsonb
WHERE id = 'post_test';
SELECT pg_temp.kontrol('başkasının yorumu düzenlenemiyor', 'Üçüncünün yorumu',
  (SELECT comments->0->>'content' FROM public.posts WHERE id = 'post_test'));

UPDATE public.posts SET liked_by = '["sahip","ucuncu","saldirgan","olmayan"]'::jsonb,
                        likes_count = 9999 WHERE id = 'post_test';
SELECT pg_temp.kontrol('sahte beğeni eklenemiyor', '["ucuncu", "saldirgan"]',
  (SELECT liked_by::text FROM public.posts WHERE id = 'post_test'));
SELECT pg_temp.kontrol('beğeni sayacı istemciden belirlenemiyor', '8',
  (SELECT likes_count::text FROM public.posts WHERE id = 'post_test'));

UPDATE public.posts SET liked_by = '[]'::jsonb WHERE id = 'post_test';
SELECT pg_temp.kontrol('başkasının beğenisi kaldırılamıyor', '["ucuncu"]',
  (SELECT liked_by::text FROM public.posts WHERE id = 'post_test'));

UPDATE public.posts SET comments = comments ||
  '[{"id":"c2","author":{"username":"saldirgan","display_name":"Saldırgan","avatar_url":""},"content":"Kendi yorumum","created_at":"2026-03-03T00:00:00Z"}]'::jsonb
WHERE id = 'post_test';
SELECT pg_temp.kontrol('üye kendi yorumunu ekleyebiliyor', '2|2',
  (SELECT jsonb_array_length(comments) || '|' || comments_count FROM public.posts WHERE id = 'post_test'));

UPDATE public.posts SET comments =
  (SELECT coalesce(jsonb_agg(e), '[]'::jsonb) FROM jsonb_array_elements(comments) e WHERE e->>'id' <> 'c2')
WHERE id = 'post_test';
SELECT pg_temp.kontrol('üye kendi yorumunu silebiliyor', '1|1',
  (SELECT jsonb_array_length(comments) || '|' || comments_count FROM public.posts WHERE id = 'post_test'));

UPDATE public.posts SET content = 'ELE GECIRILDI' WHERE id = 'post_test';
SELECT pg_temp.kontrol('gönderi içeriği ele geçirilemiyor', 'Sahibin özgün gönderisi.',
  (SELECT content FROM public.posts WHERE id = 'post_test'));

SET test.uid = 'aaaaaaaa-0000-0000-0000-000000000001';
UPDATE public.posts SET content = 'Sahip düzenledi.' WHERE id = 'post_test';
SELECT pg_temp.kontrol('sahip kendi gönderisini düzenleyebiliyor', 'Sahip düzenledi.',
  (SELECT content FROM public.posts WHERE id = 'post_test'));

-- =============================================================
-- C. İŞ İLANI BAŞVURULARI
-- =============================================================
\echo ''
\echo '--- C. İş ilanı başvuruları ---'

SET test.role = 'service_role';
DELETE FROM public.job_listings WHERE id = 'ilan_test';
INSERT INTO public.job_listings
  (id, author_id, author, title, type, description, applications, applied_by, applications_count)
VALUES ('ilan_test', 'aaaaaaaa-0000-0000-0000-000000000001', '{"username":"sahip"}'::jsonb,
  'React geliştirici', 'job', 'İlan metni',
  '[{"id":"b1","applicant_username":"ucuncu","name":"Üçüncü Kişi","age":28,"experience":"5 yıl","languages":"TR,EN","description":"Özgeçmişim","created_at":"2026-01-01T00:00:00Z"}]'::jsonb,
  '["ucuncu"]'::jsonb, 1);

SET test.role = 'authenticated';
SET test.uid  = 'bbbbbbbb-0000-0000-0000-000000000002';

UPDATE public.job_listings SET applications = applications ||
  '[{"id":"sahte","applicant_username":"ucuncu","name":"Uydurma","age":1,"experience":"x","languages":"x","description":"x","created_at":"2026-02-02T00:00:00Z"}]'::jsonb
WHERE id = 'ilan_test';
SELECT pg_temp.kontrol('başkasının adına başvuru uydurulamıyor', 'false',
  (SELECT (applications @> '[{"id":"sahte"}]'::jsonb)::text FROM public.job_listings WHERE id = 'ilan_test'));

UPDATE public.job_listings SET applications = '[]'::jsonb, applications_count = 0 WHERE id = 'ilan_test';
SELECT pg_temp.kontrol('başkasının başvurusu silinemiyor', 'ucuncu',
  (SELECT applications->0->>'applicant_username' FROM public.job_listings WHERE id = 'ilan_test'));

UPDATE public.job_listings SET applications =
  '[{"id":"b1","applicant_username":"ucuncu","name":"DEGISTI","age":99,"experience":"x","languages":"x","description":"x","created_at":"2026-01-01T00:00:00Z"}]'::jsonb
WHERE id = 'ilan_test';
SELECT pg_temp.kontrol('başkasının başvurusu düzenlenemiyor', 'Üçüncü Kişi',
  (SELECT applications->0->>'name' FROM public.job_listings WHERE id = 'ilan_test'));

UPDATE public.job_listings SET applications = applications ||
  '[{"id":"b2","applicant_username":"saldirgan","name":"Benim","age":30,"experience":"3 yıl","languages":"TR","description":"Benim özgeçmişim","created_at":"2026-03-03T00:00:00Z"}]'::jsonb,
  applied_by = applied_by || '["saldirgan"]'::jsonb
WHERE id = 'ilan_test';
SELECT pg_temp.kontrol('üye kendi başvurusunu ekleyebiliyor', '2|2|["ucuncu", "saldirgan"]',
  (SELECT jsonb_array_length(applications) || '|' || applications_count || '|' || applied_by::text
     FROM public.job_listings WHERE id = 'ilan_test'));

-- =============================================================
-- D. GRUP ÜYELİĞİ
-- =============================================================
\echo ''
\echo '--- D. Grup üyeliği ---'

SET test.role = 'service_role';
DELETE FROM public.groups WHERE id = 'grup_test';
INSERT INTO public.groups (id, name, avatar_url, creator_id, creator_username, admins, members, last_message)
VALUES ('grup_test', 'Ekip', '', 'aaaaaaaa-0000-0000-0000-000000000001', 'sahip',
  '["sahip"]'::jsonb, '["sahip","ucuncu"]'::jsonb, '{"content":"gerçek mesaj"}'::jsonb);

SET test.role = 'authenticated';
SET test.uid  = 'bbbbbbbb-0000-0000-0000-000000000002';

UPDATE public.groups SET members = '[]'::jsonb WHERE id = 'grup_test';
SELECT pg_temp.kontrol('üye olmayan grubu boşaltamıyor', '["sahip", "ucuncu"]',
  (SELECT members::text FROM public.groups WHERE id = 'grup_test'));

UPDATE public.groups SET members = '["sahip","ucuncu","yabanci"]'::jsonb WHERE id = 'grup_test';
SELECT pg_temp.kontrol('üye olmayan gruba başkasını ekleyemiyor', '["sahip", "ucuncu"]',
  (SELECT members::text FROM public.groups WHERE id = 'grup_test'));

UPDATE public.groups SET last_message = '{"content":"UYDURMA"}'::jsonb WHERE id = 'grup_test';
SELECT pg_temp.kontrol('üye olmayan son mesajı uyduramıyor', 'gerçek mesaj',
  (SELECT last_message->>'content' FROM public.groups WHERE id = 'grup_test'));

UPDATE public.groups SET members = members || '["saldirgan"]'::jsonb WHERE id = 'grup_test';
SELECT pg_temp.kontrol('üye kendini gruba ekleyebiliyor', '["sahip", "ucuncu", "saldirgan"]',
  (SELECT members::text FROM public.groups WHERE id = 'grup_test'));

UPDATE public.groups SET last_message = '{"content":"üye olarak yazdım"}'::jsonb WHERE id = 'grup_test';
SELECT pg_temp.kontrol('üye son mesajı tazeleyebiliyor', 'üye olarak yazdım',
  (SELECT last_message->>'content' FROM public.groups WHERE id = 'grup_test'));

UPDATE public.groups SET members = '["sahip","ucuncu"]'::jsonb WHERE id = 'grup_test';
SELECT pg_temp.kontrol('üye gruptan ayrılabiliyor', '["sahip", "ucuncu"]',
  (SELECT members::text FROM public.groups WHERE id = 'grup_test'));

-- =============================================================
-- E. TOPLULUK ÜYE SAYACI
-- =============================================================
\echo ''
\echo '--- E. Topluluk üye sayacı ---'

SET test.role = 'service_role';
DELETE FROM public.communities WHERE id = 'top_test';
INSERT INTO public.communities (id, name, handle, created_by, creator_username, members_count)
VALUES ('top_test', 'Topluluk', '@top', 'aaaaaaaa-0000-0000-0000-000000000001', 'sahip', 0);
UPDATE public.profiles SET joined_communities = '["top_test"]'::jsonb
WHERE username IN ('sahip', 'ucuncu');

SET test.role = 'authenticated';
SET test.uid  = 'bbbbbbbb-0000-0000-0000-000000000002';
UPDATE public.communities SET members_count = 999999 WHERE id = 'top_test';
SELECT pg_temp.kontrol('üye sayacı istemciden şişirilemiyor (üye değil)', '2',
  (SELECT members_count::text FROM public.communities WHERE id = 'top_test'));

SET test.uid = 'aaaaaaaa-0000-0000-0000-000000000001';
UPDATE public.communities SET members_count = 999999 WHERE id = 'top_test';
SELECT pg_temp.kontrol('üye sayacı sahibi tarafından da şişirilemiyor', '2',
  (SELECT members_count::text FROM public.communities WHERE id = 'top_test'));

-- =============================================================
-- F. AYRICALIK YÜKSELTME
-- =============================================================
\echo ''
\echo '--- F. Ayrıcalık yükseltme ---'

SET test.role = 'authenticated';
SET test.uid  = 'bbbbbbbb-0000-0000-0000-000000000002';
UPDATE public.profiles SET is_admin = true, verified = true, supporter_tier = 'spark'
WHERE username = 'saldirgan';
SELECT pg_temp.kontrol('üye kendini yönetici yapamıyor', 'false|false|none',
  (SELECT coalesce(is_admin, false) || '|' || coalesce(verified, false) || '|' || coalesce(supporter_tier, 'none')
     FROM public.profiles WHERE username = 'saldirgan'));

UPDATE public.profiles SET github_username = 'baskasinin-hesabi' WHERE username = 'saldirgan';
SELECT pg_temp.kontrol('üye kimlik bağlantısı uyduramıyor', '<null>',
  (SELECT coalesce(github_username, '<null>') FROM public.profiles WHERE username = 'saldirgan'));

-- =============================================================
-- G. SÜTUN DÜZEYİNDE OKUMA YETKİSİ
-- =============================================================
--
-- RLS satır düzeyinde çalışıyor, yani "bu satırı görebilir misin" sorusunu
-- yanıtlıyor; "bu satırın şu sütununu görebilir misin" sorusunu yanıtlayan tek
-- mekanizma sütun düzeyinde yetki. Herkese açık satırlarda duran hassas sütunlar
-- bu yüzden burada sınanıyor.
\echo ''
\echo '--- G. Sütun düzeyinde okuma yetkisi ---'

SELECT pg_temp.kontrol('job_listings.applications anon tarafindan okunamiyor', 'false',
  has_column_privilege('anon', 'public.job_listings', 'applications', 'SELECT')::text);
SELECT pg_temp.kontrol('job_listings.applications uyeler tarafindan okunamiyor', 'false',
  has_column_privilege('authenticated', 'public.job_listings', 'applications', 'SELECT')::text);
SELECT pg_temp.kontrol('ilanin kendisi hala herkese acik', 'true',
  has_column_privilege('anon', 'public.job_listings', 'title', 'SELECT')::text);
SELECT pg_temp.kontrol('basvuran kendi kaydini yazabilmek icin UPDATE yetkisini koruyor', 'true',
  has_column_privilege('authenticated', 'public.job_listings', 'applications', 'UPDATE')::text);

SELECT pg_temp.kontrol('profiles.email anon tarafindan okunamiyor', 'false',
  has_column_privilege('anon', 'public.profiles', 'email', 'SELECT')::text);
SELECT pg_temp.kontrol('profiles.lanux_refresh_token okunamiyor', 'false',
  has_column_privilege('authenticated', 'public.profiles', 'lanux_refresh_token', 'SELECT')::text);
SELECT pg_temp.kontrol('kullanici adi hala herkese acik', 'true',
  has_column_privilege('anon', 'public.profiles', 'username', 'SELECT')::text);

-- Anahtar malzemesi ve belirteçler tarayıcıya hiç gitmiyor: bu tablolara
-- hiçbir yetki verilmemiş olmalı.
SELECT pg_temp.kontrol('community_api_keys tarayiciya kapali', 'false',
  has_table_privilege('authenticated', 'public.community_api_keys', 'SELECT')::text);
SELECT pg_temp.kontrol('oauth_tokens tarayiciya kapali', 'false',
  has_table_privilege('authenticated', 'public.oauth_tokens', 'SELECT')::text);
SELECT pg_temp.kontrol('oauth_apps tarayiciya kapali', 'false',
  has_table_privilege('authenticated', 'public.oauth_apps', 'SELECT')::text);

-- =============================================================
-- ÖZET
-- =============================================================
\echo ''
\echo '============================================'
SELECT count(*) FILTER (WHERE gecti) || '/' || count(*) || ' senaryo geçti' FROM _sonuc;
SELECT 'KALAN: ' || ad || '  (beklenen: ' || beklenen || ', bulunan: ' || bulunan || ')'
FROM _sonuc WHERE NOT gecti;
\echo '============================================'
