-- ================================================================
-- Code4Ever — Supabase PostgreSQL Schema & Security Architecture
-- ================================================================
-- Run this whole script in the Supabase SQL editor. It is idempotent: you can run it as
-- many times as you like, on a fresh project or on an existing database.
--
-- WHAT CHANGED (security hardening)
-- --------------------------------
-- The previous version of this script granted ALL privileges to the `anon` role and created
-- `USING (true) WITH CHECK (true)` policies on every table. With the anon key that ships in
-- the browser bundle, ANY visitor could:
--   * rewrite or delete any other member's profile (including `is_admin`),
--   * edit or delete any post, job listing or community,
--   * read and delete every private message in the database.
--
-- The policies below restrict every table to its legitimate owner, while keeping the social
-- interactions the app needs (likes, reposts, bookmarks, comments, community joins and job
-- applications) working. Those "engagement" writes are allowed for everyone but constrained
-- to the engagement columns by BEFORE UPDATE triggers, so a like can never rewrite content.
-- ================================================================

-- ================================================================
-- 1. TABLES
-- ================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  banner_url TEXT,
  bio TEXT,
  role TEXT DEFAULT 'Geliştirici',
  verified BOOLEAN DEFAULT false,
  email TEXT,
  website TEXT,
  theme_color TEXT DEFAULT '#09090b',
  accent_color TEXT DEFAULT '#3b82f6',
  joined_communities JSONB DEFAULT '[]'::jsonb,
  custom_fields JSONB DEFAULT '{"github": "github.com", "location": "Türkiye"}'::jsonb,
  pinned_repos JSONB DEFAULT '[]'::jsonb,
  badges JSONB DEFAULT '[]'::jsonb,
  integrations JSONB,
  is_admin BOOLEAN DEFAULT false,
  supporter_tier TEXT DEFAULT 'none',
  profile_theme JSONB,
  saved_post_ids JSONB DEFAULT '[]'::jsonb,
  allow_group_invites BOOLEAN DEFAULT true,
  show_liked_posts BOOLEAN DEFAULT true,
  is_online BOOLEAN DEFAULT false,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.posts (
  id TEXT PRIMARY KEY,
  author JSONB NOT NULL,
  author_id TEXT,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  category_name TEXT DEFAULT 'Genel & Sohbet',
  code_snippet TEXT,
  code_language TEXT,
  media_url TEXT,
  media_type TEXT,
  project_card JSONB,
  community_id TEXT,
  community_name TEXT,
  community_handle TEXT,
  likes_count INTEGER DEFAULT 0,
  liked_by JSONB DEFAULT '[]'::jsonb,
  comments_count INTEGER DEFAULT 0,
  comments JSONB DEFAULT '[]'::jsonb,
  reposts_count INTEGER DEFAULT 0,
  reposted_by JSONB DEFAULT '[]'::jsonb,
  bookmarked_by JSONB DEFAULT '[]'::jsonb,
  is_pinned BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.communities (
  id TEXT PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  handle VARCHAR(40) UNIQUE NOT NULL,
  avatar_url TEXT,
  banner_url TEXT,
  description VARCHAR(500),
  members_count INTEGER DEFAULT 0,
  is_private BOOLEAN DEFAULT false,
  created_by TEXT,
  creator_username TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Community HTTP publishing API keys.
--
-- Only the SHA-256 hash of a key is stored, so a database leak cannot be replayed against
-- the API and the plaintext key genuinely exists only in the moment it is generated. The
-- prefix is kept separately so the owner can recognise a key in a list without it being
-- usable. The table carries NO client-facing RLS policy on purpose: keys are read and
-- written exclusively by the backend with the service role key.
CREATE TABLE IF NOT EXISTS public.community_api_keys (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL,
  community_handle TEXT NOT NULL,
  name VARCHAR(60) NOT NULL DEFAULT 'default',
  key_prefix VARCHAR(24) NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['posts:write'],
  created_by TEXT,
  created_by_username TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  request_count BIGINT NOT NULL DEFAULT 0,
  revoked_at TIMESTAMPTZ
);

-- Cached copy of the admin mailbox, written by the "sync inbox" action.
--
-- WHY A CACHE EXISTS AT ALL. Reading mail used to need a live IMAP connection on every page
-- load, which ruled the inbox out in a serverless deployment. A frozen function cannot hold a
-- socket open BETWEEN requests, but a single connect → fetch → logout inside one request is
-- ordinary outbound I/O. So one sync pulls the messages here and every later view reads this
-- table without touching the mail server.
--
-- This holds the administrator's private correspondence, so like community_api_keys it
-- carries no client-facing policy and no anon/authenticated grant (section 6): it is reached
-- only by the backend with the service role key, behind requireAdmin.
--
-- body_html is stored ALREADY SANITISED by sanitizeIncomingHtml() — scripts, event handlers
-- and remote image sources are stripped before the row is written, so a hostile email cannot
-- become stored XSS. The UI still renders it inside a sandboxed iframe.
-- Attachment BYTES are never stored, only their names, types and sizes.
CREATE TABLE IF NOT EXISTS public.admin_mail_cache (
  mailbox VARCHAR(80) NOT NULL DEFAULT 'INBOX',
  uid BIGINT NOT NULL,
  subject VARCHAR(250),
  from_name VARCHAR(120),
  from_address VARCHAR(254),
  to_address VARCHAR(254),
  sent_at TIMESTAMPTZ,
  seen BOOLEAN NOT NULL DEFAULT FALSE,
  flagged BOOLEAN NOT NULL DEFAULT FALSE,
  has_attachments BOOLEAN NOT NULL DEFAULT FALSE,
  preview VARCHAR(400),
  -- NULL until the body is downloaded: the sync stores headers first and fills these in
  -- while its time budget lasts, so a large mailbox is never lost to a function timeout.
  body_text TEXT,
  body_html TEXT,
  images_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  body_synced_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (mailbox, uid)
);

-- One row per mailbox: when it was last synced and how complete that sync was.
CREATE TABLE IF NOT EXISTS public.admin_mail_sync_state (
  mailbox VARCHAR(80) PRIMARY KEY,
  last_synced_at TIMESTAMPTZ,
  message_count INTEGER NOT NULL DEFAULT 0,
  bodies_cached INTEGER NOT NULL DEFAULT 0,
  truncated BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS public.job_listings (
  id TEXT PRIMARY KEY,
  type VARCHAR(10) NOT NULL CHECK (type IN ('job', 'team')),
  title VARCHAR(120) NOT NULL,
  description VARCHAR(4000) NOT NULL,
  quota INTEGER NOT NULL DEFAULT 1 CHECK (quota >= 1 AND quota <= 500),
  author JSONB NOT NULL,
  author_id TEXT,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  applications JSONB DEFAULT '[]'::jsonb,
  applied_by JSONB DEFAULT '[]'::jsonb,
  applications_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.job_applications (
  id TEXT PRIMARY KEY,
  job_id TEXT,
  job_title TEXT,
  applicant_id TEXT,
  applicant_username TEXT NOT NULL,
  applicant_avatar TEXT,
  applicant_display_name TEXT,
  name VARCHAR(60) NOT NULL,
  age INTEGER NOT NULL CHECK (age >= 13 AND age <= 100),
  experience VARCHAR(250) NOT NULL,
  languages VARCHAR(250) NOT NULL,
  description VARCHAR(3000) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL,
  type VARCHAR(30) NOT NULL,
  actor JSONB NOT NULL,
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  target_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.groups (
  id TEXT PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  avatar_url TEXT NOT NULL,
  description VARCHAR(500),
  creator_id TEXT NOT NULL,
  creator_username TEXT NOT NULL,
  admins JSONB DEFAULT '[]'::jsonb,
  members JSONB DEFAULT '[]'::jsonb,
  last_message JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  is_group BOOLEAN DEFAULT false,
  sender_id TEXT NOT NULL,
  sender_username TEXT NOT NULL,
  sender_display_name TEXT NOT NULL,
  sender_avatar TEXT,
  content TEXT NOT NULL, -- AES-GCM ciphertext produced in the browser
  media_url TEXT,
  media_type VARCHAR(20),
  media_name TEXT,
  status VARCHAR(20) DEFAULT 'delivered',
  is_edited BOOLEAN DEFAULT false,
  encryption_duration_ms NUMERIC DEFAULT 0,
  reply_to JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.group_invites (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  group_name VARCHAR(60) NOT NULL,
  group_avatar TEXT,
  group_description VARCHAR(500),
  invited_by_username TEXT NOT NULL,
  invited_by_name TEXT NOT NULL,
  invited_by_avatar TEXT,
  target_username TEXT NOT NULL,
  target_user_id TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.system_error_reports (
  id TEXT PRIMARY KEY,
  error_type TEXT NOT NULL DEFAULT 'general_issue',
  location TEXT NOT NULL,
  description TEXT NOT NULL,
  logs TEXT,
  reporter_username TEXT NOT NULL,
  reporter_display_name TEXT,
  reporter_avatar TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.post_reports (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  post_author_username TEXT NOT NULL,
  post_content TEXT NOT NULL,
  reporter_username TEXT NOT NULL,
  reporter_display_name TEXT,
  reason TEXT NOT NULL DEFAULT 'other',
  reason_label TEXT DEFAULT 'İhlal / Şikayet',
  details TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- PROJELER
-- ----------------------------------------------------------------
--
-- Bir proje, bir üyenin kendi GitHub deposunu platforma tanıtmasıdır: ad, tanıtım yazısı
-- ve deponun kendisi. Üyeler projeyi BEĞENEBİLİR (vitrin) ve TAKİP EDEBİLİR (bildirim).
-- İkisi ayrı şeyler ve bilinçli olarak ayrı tutuluyor: beğeni "güzelmiş" demektir,
-- takip ise "her commit'te bana haber ver" demektir.
CREATE TABLE IF NOT EXISTS public.projects (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  owner_username TEXT NOT NULL,
  name VARCHAR(80) NOT NULL,
  about VARCHAR(600),

  -- /project/<slug> adresinin kendisi. Addan türetilir, tekildir ve bir kez verildikten
  -- sonra DEĞİŞMEZ: değişseydi paylaşılmış her bağlantı kırılırdı.
  slug VARCHAR(90),

  -- Proje sayfasındaki uzun anlatım. `about` listedeki tek satırlık tanıtım, bu ise
  -- sayfanın gövdesi; ikisi ayrı çünkü liste kartına 4000 karakter sığmaz.
  description TEXT,

  -- Kapak görseli ve galeri.
  --
  -- Görseller data URL olarak saklanıyor (uygulamanın başka yerlerdeki medya düzeniyle
  -- aynı). BU YÜZDEN LİSTE SORGULARINDA OKUNMUYORLAR: tek bir kapak birkaç yüz kilobayt
  -- tutabilir ve 30 projelik bir liste onlarca megabayta çıkardı. Sunucudaki alan listesi
  -- (PROJECT_FIELDS) bunları dışarıda bırakır, yalnızca detay sorgusu okur.
  cover_url TEXT,
  gallery JSONB DEFAULT '[]'::jsonb,
  -- "kullanici/depo" — GitHub'daki tam ad. İSTEĞE BAĞLI.
  --
  -- Depo zorunlu değil: bir proje GitHub'da olmayabilir (kapalı kaynak, başka bir platform,
  -- ya da henüz yayımlanmamış). Depoyu zorunlu tutmak, GitHub bağlamayı da zorunlu kılıyordu
  -- — proje paylaşmanın önkoşulu olmaması gereken bir şey. Depo EKLENDİĞİNDE sahiplik
  -- sunucuda doğrulanır; işte o zaman GitHub bağlantısı gerekir.
  repo_full_name TEXT,
  repo_url TEXT,
  repo_default_branch TEXT,
  language TEXT,

  -- SAYAÇLAR TÜRETİLMİŞ VERİDİR ve tetikleyiciyle yönetilir (bkz. 4.7).
  --
  -- Liderlik tabloları bu iki sayıya bakıyor, yani bunlar bir YARIŞMANIN PUANI. İstemciye
  -- açık bırakılsaydı herhangi bir üye kendi satırında likes_count = 999999 yazıp "tüm
  -- zamanların en çok beğenilen projesi" olurdu. Gerçek kayıt project_likes /
  -- project_follows tablolarında; bu sütunlar yalnızca hızlı sıralama için var.
  likes_count INTEGER DEFAULT 0,
  followers_count INTEGER DEFAULT 0,

  -- Commit takibi. last_commit_sha "bu commit için bildirim gönderildi" demektir; bildirim
  -- gönderildikten SONRA yazılır, böylece yarıda kalan bir tur sessizce commit atlamaz.
  last_commit_sha TEXT,
  last_commit_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ,
  check_failures INTEGER DEFAULT 0,

  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Beğeni ve takip ayrı satırlar: JSONB dizisi yerine birleşim tablosu, çünkü "haftanın
-- projesi" son 7 günde gelen beğenileri saymak zorunda — dizi içindeki elemanın ne zaman
-- eklendiği bilgisi yoktur. Birincil anahtar aynı zamanda tekilliği sağlıyor: aynı üye bir
-- projeyi iki kez beğenemez, dolayısıyla sayaç şişirilemez.
CREATE TABLE IF NOT EXISTS public.project_likes (
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.project_follows (
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);

-- Bir projenin hangi topluluklarda paylaşıldığı.
--
-- NEDEN AYRI TABLO, projects'te bir community_id SÜTUNU DEĞİL: bir proje birden fazla
-- topluluğa ait olabilir — bir React kütüphanesi hem "React Türkiye"ye hem "Frontend"e
-- gider. Tek sütun bunu imkânsız kılar ve ilk çoklu paylaşım isteğinde veri taşımak
-- gerekirdi. Birleşim tablosu beğeni/takip ile de aynı desen.
--
-- Birincil anahtar tekilliği sağlıyor: aynı proje bir topluluğa iki kez eklenemez,
-- dolayısıyla sayaç şişirilemez ve liste tekrar göstermez.
--
-- added_by "kim ekledi" sorusunun cevabı ve moderasyon için gerekli: topluluk sahibi
-- bir girdiyi kaldırırken kimin eklediğini görebilmeli.
CREATE TABLE IF NOT EXISTS public.community_projects (
  community_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  added_by TEXT NOT NULL,
  added_by_username TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (community_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_community_projects_community ON public.community_projects(community_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_projects_project ON public.community_projects(project_id);

-- ================================================================
-- 2. COLUMN MIGRATIONS (safe to re-run)
-- ================================================================

-- Topluluktaki proje sayısı TÜRETİLMİŞ veridir; aşağıdaki tetikleyici yazar. İstemciye
-- bırakılsaydı bir topluluk kendi sayısını şişirip listelerde öne çıkabilirdi.
ALTER TABLE public.communities ADD COLUMN IF NOT EXISTS projects_count INTEGER DEFAULT 0;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pinned_repos JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS badges JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS integrations JSONB;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS supporter_tier TEXT DEFAULT 'none';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS profile_theme JSONB;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS saved_post_ids JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS allow_group_invites BOOLEAN DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS show_liked_posts BOOLEAN DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- E-posta bildirim tercihleri. Varsayılan bilinçli olarak AÇIK değil "seçmeli": üyenin
-- doğrudan muhatap olduğu olaylar (yanıt, bahsetme, mesaj, başvuru) açık gelir; beğeni ve
-- repost gibi yüksek hacimli, düşük değerli olaylar kapalı gelir. Aksi hâlde ilk popüler
-- gönderi bir kutu dolusu e-posta üretir ve üye topluca aboneliği bırakır.
-- ================================================================
-- BAĞLI KİMLİKLER (GitHub, Jubbio)
-- ================================================================
--
-- ORTAK KURAL: her bağ, karşı tarafın KALICI kimliğine dayanır ve her bağ TEKİLDİR.
-- Kullanıcı adları karşı tarafta değişebilir; kalıcı anahtar değişmez. Tekillik
-- veritabanında zorlanıyor, uygulamada değil — iki eşzamanlı bağlama isteği uygulama
-- katmanındaki "başkasına bağlı mı" kontrolünü atlatabilir, benzersiz indeksi atlatamaz.
--
-- Bu sütunlara yalnızca arka uç (servis rolü) yazar; aşağıdaki koruma tetikleyicileri
-- istemciden gelen her yazmayı geri alıyor.

-- GitHub bağlantısı: depoların profilde gösterilmesi ve projelere depo bağlanması buna bakıyor.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS github_username TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS github_linked_at TIMESTAMPTZ;

-- Jubbio bağlantısı. Kalıcı anahtar `jubbio_user_id` (Jubbio'nun `@me` yanıtındaki `id`),
-- kullanıcı adı DEĞİL: ad değiştiğinde bağ kopmamalı, yalnızca gösterilen değer güncellenmeli.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS jubbio_user_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS jubbio_username TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS jubbio_avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS jubbio_linked_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_jubbio_user_id
  ON public.profiles(jubbio_user_id) WHERE jubbio_user_id IS NOT NULL;

-- ----------------------------------------------------------------
-- LANUX GİRİŞİ KALDIRILDI — SÜTUNLARI DURUYOR
-- ----------------------------------------------------------------
--
-- "Lanux ile giriş" akışı (OpenID Connect) uygulamadan çıkarıldı. Sütunlar BİLEREK
-- düşürülmüyor: DROP COLUMN geri alınamaz ve halihazırda bağlanmış hesapların kaydını
-- siler. Aşağıdaki tanımlar, şemayı sıfırdan kuran bir ortamda koruma tetikleyicilerinin
-- var olmayan bir sütuna atıfta bulunup patlamaması için duruyor; hiçbir kod bunları
-- artık okumuyor ya da yazmıyor.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS lanux_user_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS lanux_username TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS lanux_linked_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS lanux_refresh_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_lanux_user_id
  ON public.profiles(lanux_user_id) WHERE lanux_user_id IS NOT NULL;

-- Bir GitHub hesabı da yalnızca bir profile bağlanabilir.
--
-- Sunucu bağlamadan önce zaten "başkasına bağlı mı" diye bakıyor, ama önce-oku-sonra-yaz
-- bir yarış penceresi bırakır; iki istek aynı anda gelirse ikisi de boş görür. Asıl garanti
-- burada. lower() ŞART: GitHub kullanıcı adları büyük/küçük harf duyarsızdır, aksi hâlde
-- "Owner" ve "owner" iki ayrı kayıt olur ve iki üye aynı depoları kendi profilinde gösterir.
--
-- ÖNCE TEMİZLİK. Eski akışta kullanıcı adı elle yazılıyor ve sahipliği doğrulanmıyordu,
-- dolayısıyla mevcut veride aynı adın birden fazla profile yazılmış olması MÜMKÜN. Böyle
-- satırlar kalırsa indeks oluşturulamaz ve betiğin tamamı yarıda kesilir. En erken bağlanan
-- kayıt korunuyor (bağlanma anı yoksa profilin kendi oluşturulma anı), diğerleri boşaltılıyor:
-- bu üyeler bağlantıyı yeniden kurduğunda artık sahiplik GitHub tarafından doğrulanacak.
--
-- TETİKLEYİCİYİ GEÇİCİ OLARAK KAPATMAK ZORUNDAYIZ. trg_protect_profile_privileges kimlik
-- sütunlarını sabitliyor (`NEW.github_username := OLD.github_username`) ve yalnızca
-- service_role ile platform yöneticisini muaf tutuyor. Bu betik SQL Editor'de `postgres`
-- olarak çalışır, yani muaf değildir: temizlik UPDATE'i sessizce geri alınır, ardından
-- indeks oluşturma hata verir ve betik yarıda kalır. Kapatmayı DO bloğunun içinde yapmak
-- şart — blok tek bir ifade, dolayısıyla tek bir işlem: temizlik hata verse bile tetikleyici
-- açık kalmadan geri alınır, yani koruma hiçbir durumda kapalı unutulmaz.
DO $$
DECLARE
  -- Bu blok tetikleyici OLUŞTURULMADAN önce çalışıyor (tetikleyici bölüm 4'te). İlk
  -- kurulumda henüz yoktur; koşulsuz bir DISABLE orada "trigger does not exist" ile patlar.
  korunuyor BOOLEAN := EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.profiles'::regclass
      AND tgname = 'trg_protect_profile_privileges'
      AND NOT tgisinternal
  );
BEGIN
  IF korunuyor THEN
    ALTER TABLE public.profiles DISABLE TRIGGER trg_protect_profile_privileges;
  END IF;

  WITH sirali AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY lower(github_username)
        ORDER BY COALESCE(github_linked_at, created_at, now()) ASC, id ASC
      ) AS sira
    FROM public.profiles
    WHERE github_username IS NOT NULL
  )
  UPDATE public.profiles p
  SET github_username = NULL,
      github_linked_at = NULL
  FROM sirali s
  WHERE p.id = s.id AND s.sira > 1;

  IF korunuyor THEN
    ALTER TABLE public.profiles ENABLE TRIGGER trg_protect_profile_privileges;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_github_username
  ON public.profiles(lower(github_username)) WHERE github_username IS NOT NULL;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_prefs JSONB;

-- Proje deposu artık isteğe bağlı. İlk sürümde NOT NULL idi ve bu, proje paylaşmayı
-- GitHub bağlamaya mecbur bırakıyordu. Mevcut kurulumlarda kısıtı düşürmek gerekiyor;
-- CREATE TABLE IF NOT EXISTS var olan bir tabloyu değiştirmez.
ALTER TABLE public.projects ALTER COLUMN repo_full_name DROP NOT NULL;
ALTER TABLE public.projects ALTER COLUMN repo_url DROP NOT NULL;

-- Proje sayfası: adres, uzun anlatım ve görseller.
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS slug VARCHAR(90);
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS cover_url TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS gallery JSONB DEFAULT '[]'::jsonb;

-- Mevcut projelere adres üret.
--
-- Slug olmadan proje sayfası açılamaz, yani bu güncellemeden ÖNCE açılmış her proje
-- adressiz kalırdı. Türkçe harfler çevriliyor (ı→i, ş→s, ğ→g, ü→u, ö→o, ç→c): aksi hâlde
-- "Şahane Proje" → "ahane-proje" gibi harf yiyen adresler çıkar.
--
-- Çakışma olursa sonuna kısa bir ek geliyor. `id`'nin son 6 hanesi kullanılıyor çünkü
-- satır başına zaten tekil ve ek bir sorgu gerektirmiyor.
DO $$
DECLARE
  korunuyor BOOLEAN := EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.projects'::regclass
      AND tgname = 'trg_protect_project_columns'
      AND NOT tgisinternal
  );
BEGIN
  IF korunuyor THEN
    ALTER TABLE public.projects DISABLE TRIGGER trg_protect_project_columns;
  END IF;

  WITH temel AS (
    SELECT
      id,
      nullif(
        trim(both '-' from regexp_replace(
          lower(translate(name, 'ıİşŞğĞüÜöÖçÇ', 'iisSgGuUoOcC')),
          '[^a-z0-9]+', '-', 'g'
        )),
        ''
      ) AS taban
    FROM public.projects
    WHERE slug IS NULL
  ),
  numarali AS (
    SELECT
      id,
      COALESCE(taban, 'proje') AS taban,
      ROW_NUMBER() OVER (PARTITION BY COALESCE(taban, 'proje') ORDER BY id) AS sira
    FROM temel
  )
  UPDATE public.projects p
  SET slug = CASE
        WHEN n.sira = 1 THEN left(n.taban, 90)
        ELSE left(n.taban, 82) || '-' || right(replace(p.id, '-', ''), 6)
      END
  FROM numarali n
  WHERE p.id = n.id;

  IF korunuyor THEN
    ALTER TABLE public.projects ENABLE TRIGGER trg_protect_project_columns;
  END IF;
END;
$$;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS joined_communities JSONB DEFAULT '[]'::jsonb;

ALTER TABLE public.communities ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT false;
ALTER TABLE public.communities ADD COLUMN IF NOT EXISTS members_count INTEGER DEFAULT 0;
ALTER TABLE public.communities ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS liked_by JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS comments JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS comments_count INTEGER DEFAULT 0;

ALTER TABLE public.job_listings ADD COLUMN IF NOT EXISTS applications JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.job_listings ADD COLUMN IF NOT EXISTS applied_by JSONB DEFAULT '[]'::jsonb;

-- E-posta gönderimi bu bildirim için tamamlandığında damgalanır. NULL = henüz gönderilmedi.
-- Gönderici bu sütunu tek doğruluk kaynağı olarak kullanır: aynı bildirim iki kez e-posta
-- üretemez, sunucu yeniden başlasa veya iki dağıtım üst üste binse bile.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;

-- ================================================================
-- KOD ARAMASI
-- ================================================================
--
-- code_snippet, {"title":..,"language":..,"code":..} biçiminde bir JSON METNİ olarak
-- saklanıyor. Aramanın içine girmesi gereken şey yalnızca `code` alanı; JSON anahtarları
-- indekse girerse "code" veya "title" aramak her gönderiyi getirirdi.
--
-- Doğrudan `code_snippet::jsonb ->> 'code'` yazılamaz: eski veya bozuk bir satırda cast
-- hata fırlatır ve üretilmiş (generated) sütun TÜM tabloyu yazılamaz hâle getirir. Bu
-- yüzden ayrıştırma denenir, başarısız olursa ham metne düşülür.
CREATE OR REPLACE FUNCTION public.post_snippet_code(raw TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
BEGIN
  IF raw IS NULL OR raw = '' THEN
    RETURN '';
  END IF;
  BEGIN
    RETURN coalesce(raw::jsonb ->> 'code', raw);
  EXCEPTION WHEN others THEN
    -- JSON değilse (eski kayıtlar düz metin tutuyordu) metnin kendisi aranabilir kalsın.
    RETURN raw;
  END;
END;
$$;

-- Türkçe ve kod için diyakritikleri katlar: "gonderi" yazan biri "Gönderi" bulsun.
-- translate() IMMUTABLE olduğu için üretilmiş sütunda kullanılabilir; unaccent eklentisi
-- değildir ve orada çalışmaz. İ/ı ayrımı da burada çözülür.
CREATE OR REPLACE FUNCTION public.search_fold(raw TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT translate(lower(coalesce(raw, '')), 'çğıöşüâîûİ', 'cgiosuaiui');
$$;

-- Kodu arama için parçalara ayırır.
--
-- NEDEN GEREKLİ: PostgreSQL'in varsayılan çözümleyicisi düzyazı için tasarlanmış ve noktalı
-- ifadeleri ALAN ADI sanıyor. Ölçüldü: `f.read()` tek bir "host" token'ı olarak `f.read`
-- hâline geliyor, dolayısıyla `read` araması onu BULAMIYOR — önek eşlemesi token'ın başından
-- başlar. Aynı şey `np.array`, `obj.method`, `std::vector` için de geçerli; yani kod
-- aramasının en sık kullanılacağı biçim sessizce çalışmıyordu.
--
-- Harf, rakam ve alt çizgi dışındaki her şeyi boşluğa çevirmek bunu çözer: `f.read()` iki
-- token olur (`f`, `read`) ve ikisi de aranabilir. Alt çizgi korunur, çünkü tanımlayıcıların
-- parçasıdır (`my_var`, `__init__`).
CREATE OR REPLACE FUNCTION public.search_code_tokens(raw TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT regexp_replace(public.search_fold(raw), '[^a-z0-9_]+', ' ', 'g');
$$;

-- Arama vektörü.
--
-- NEDEN 'turkish' DEĞİL 'simple': Snowball Türkçe köklendiricisi tutarsız. Ölçüldü —
-- belgedeki "Gönderilerimdeki" sözcüğü 'gönderi' köküne, sorgudaki "gönderi" sözcüğü ise
-- 'gönder' köküne iniyor; ikisi ASLA eşleşmiyor. Yani köklendirme, gözle görülür biçimde
-- orada olan bir kelimeyi bulunamaz hâle getiriyordu. Türkçenin eklemeli yapısı bunun
-- yerine ÖNEK sorgusuyla çözülüyor (`gonderi:*`), ki bu hem daha öngörülebilir hem de
-- arama kutusundan beklenen davranış.
--
-- Kod zaten köklendirilmemeli: bir çözümleyici useEffect/useState/useRef sözcüklerini aynı
-- köke indirip üçünü birbirine karıştırabilir. Kod aramasında istenen, yazılan tanımlayıcının
-- aynısını bulmaktır.
--
-- Ağırlıklar sıralamayı belirler: içerik (A), kod (B), dil ve yazar (C).
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', public.search_fold(content)), 'A') ||
    -- Düzyazının parçalanmış kopyası: metin içine gömülü `dizi.map()` gibi ifadeler de
    -- aranabilsin diye, ama kod ağırlığında (B) — asıl içerik eşleşmesi önde kalsın.
    setweight(to_tsvector('simple', public.search_code_tokens(content)), 'B') ||
    setweight(to_tsvector('simple', public.search_code_tokens(public.post_snippet_code(code_snippet))), 'B') ||
    setweight(to_tsvector('simple', public.search_fold(code_language)), 'C') ||
    setweight(to_tsvector('simple', public.search_fold(author->>'username')), 'C')
  ) STORED;

ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS members JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS admins JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS last_message JSONB;
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS author_id TEXT;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS bookmarked_by JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS reposted_by JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS reposts_count INTEGER DEFAULT 0;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS code_language TEXT;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS category_name TEXT DEFAULT 'Genel & Sohbet';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;

ALTER TABLE public.job_listings ADD COLUMN IF NOT EXISTS author_id TEXT;
ALTER TABLE public.job_listings ADD COLUMN IF NOT EXISTS applications_count INTEGER DEFAULT 0;
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS job_title TEXT;
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS applicant_avatar TEXT;
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS applicant_display_name TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT false;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Backfill the post author id from the JSON author blob where possible.
UPDATE public.posts p
SET author_id = pr.id::text
FROM public.profiles pr
WHERE p.author_id IS NULL
  AND lower(pr.username) = lower(p.author->>'username');

-- Backfill the protected supporter tier from the legacy (user editable) markers, so existing
-- Spark supporters keep their perks after the switch to the protected column.
UPDATE public.profiles
SET supporter_tier = 'spark'
WHERE coalesce(supporter_tier, 'none') <> 'spark'
  AND (
    lower(coalesce(role, '')) LIKE '%spark%'
    OR lower(coalesce(custom_fields->'subscription'->>'planId', '')) = 'spark'
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(coalesce(badges, custom_fields->'badges', '[]'::jsonb)) = 'array'
             THEN coalesce(badges, custom_fields->'badges', '[]'::jsonb)
             ELSE '[]'::jsonb END
      ) b
      WHERE lower(coalesce(b->>'id', '')) IN ('spark', 'c4e_spark')
    )
  );

-- ================================================================
-- 3. SECURITY HELPER FUNCTIONS
-- ================================================================
-- SECURITY DEFINER so they can read `profiles` without re-entering RLS (which would recurse
-- when the helper is used inside a policy on `profiles` itself).

CREATE OR REPLACE FUNCTION public.current_username()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(username) FROM public.profiles WHERE id::text = auth.uid()::text LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT is_admin FROM public.profiles WHERE id::text = auth.uid()::text LIMIT 1),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.owns_profile(profile_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT auth.uid() IS NOT NULL AND profile_id::text = auth.uid()::text;
$$;

-- Membership in a community is stored on the member's own profile
-- (profiles.joined_communities is a JSONB array of community ids).
CREATE OR REPLACE FUNCTION public.is_community_member(community_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (
      SELECT
        (CASE WHEN jsonb_typeof(p.joined_communities) = 'array' THEN p.joined_communities ELSE '[]'::jsonb END) ? community_id
        OR EXISTS (
          SELECT 1 FROM public.communities c
          WHERE c.id = community_id
            AND (c.created_by::text = p.id::text OR lower(coalesce(c.creator_username, '')) = lower(p.username))
        )
      FROM public.profiles p
      WHERE p.id::text = auth.uid()::text
      LIMIT 1
    ),
    false
  );
$$;

-- True when a post belongs to a private ("gizli") community the caller has not joined.
CREATE OR REPLACE FUNCTION public.is_hidden_community_post(community_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN community_id IS NULL THEN false
    WHEN NOT EXISTS (
      SELECT 1 FROM public.communities c WHERE c.id = community_id AND c.is_private = true
    ) THEN false
    ELSE NOT public.is_community_member(community_id)
  END;
$$;

-- Direct-message conversation ids are built as `dm_<userA>_<userB>` with both usernames
-- lowercased and sorted. A member is a participant when the id splits exactly into their own
-- username and another EXISTING username — a plain substring match would let "alice" read
-- "dm_alice_bob"-style ids belonging to someone whose name merely starts the same way.
CREATE OR REPLACE FUNCTION public.is_conversation_participant(conversation TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me TEXT := public.current_username();
  body TEXT;
  peer TEXT;
BEGIN
  IF me IS NULL OR conversation IS NULL THEN
    RETURN false;
  END IF;

  IF conversation LIKE 'dm\_%' THEN
    body := substring(conversation FROM 4);

    -- me is the first half
    IF body LIKE me || '\_%' THEN
      peer := substring(body FROM length(me) + 2);
      IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = peer) THEN
        RETURN true;
      END IF;
    END IF;

    -- me is the second half
    IF body LIKE '%\_' || me THEN
      peer := left(body, length(body) - length(me) - 1);
      IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = peer) THEN
        RETURN true;
      END IF;
    END IF;

    RETURN false;
  END IF;

  -- Otherwise the conversation id is a group id.
  RETURN EXISTS (
    SELECT 1
    FROM public.groups g
    WHERE g.id = conversation
      AND (
        lower(g.creator_username) = me
        OR g.admins ? me
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(g.members) = 'array' THEN g.members ELSE '[]'::jsonb END
          ) m
          WHERE lower(m->>'username') = me
        )
      )
  );
END;
$$;

-- ================================================================
-- 4. TRIGGERS THAT PROTECT PRIVILEGED COLUMNS
-- ================================================================

-- 4.1 Profiles: a member may edit their own profile, but never grant themselves
-- administrator rights, the verified tick, the paid supporter tier, a ban lift or beta
-- approval — and never claim a reserved system username.
CREATE OR REPLACE FUNCTION public.protect_profile_privileges()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reserved TEXT[] := ARRAY[
    'admin', 'administrator', 'nylithra', 'c4e_admin', 'code4ever', 'system', 'root',
    'support', 'staff', 'moderator', 'security', 'official', 'api', 'bot'
  ];
  old_custom JSONB := coalesce(OLD.custom_fields, '{}'::jsonb);
  new_custom JSONB := coalesce(NEW.custom_fields, '{}'::jsonb);
  protected_key TEXT;
BEGIN
  -- The service role (backend with the service key) and administrators are unrestricted.
  IF auth.role() = 'service_role' OR public.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  NEW.id := OLD.id;
  NEW.is_admin := OLD.is_admin;
  NEW.verified := OLD.verified;
  NEW.supporter_tier := OLD.supporter_tier;
  NEW.created_at := OLD.created_at;

  -- KİMLİK BAĞLANTILARI İSTEMCİDEN YAZILAMAZ.
  --
  -- Bunlar "kim olduğunu" belirleyen alanlar ve profilde doğrulanmış işaret olarak
  -- görünüyor. Serbest bırakılsaydı herhangi bir üye kendi profiline bir BAŞKASININ
  -- github_username'ini yazıp onun depolarını kendi vitrininde gösterebilir, ya da
  -- başkasının Jubbio hesabını kendi profilinde doğrulanmış gibi sunabilirdi.
  --
  -- Bu alanları yalnızca arka uç yazar, o da ancak karşı taraf kimliği kanıtladıktan
  -- SONRA (servis rolü yukarıda muaf tutuluyor).
  NEW.github_username := OLD.github_username;
  NEW.github_linked_at := OLD.github_linked_at;
  NEW.jubbio_user_id := OLD.jubbio_user_id;
  NEW.jubbio_username := OLD.jubbio_username;
  NEW.jubbio_avatar_url := OLD.jubbio_avatar_url;
  NEW.jubbio_linked_at := OLD.jubbio_linked_at;
  -- Lanux girişi kaldırıldı ama sütunlar duruyor; sabitlemeye devam ediyoruz ki elde kalan
  -- kayıtlar istemciden kurcalanamasın.
  NEW.lanux_user_id := OLD.lanux_user_id;
  NEW.lanux_username := OLD.lanux_username;
  NEW.lanux_linked_at := OLD.lanux_linked_at;
  NEW.lanux_refresh_token := OLD.lanux_refresh_token;

  -- Reserved usernames may not be claimed by regular members.
  IF lower(coalesce(NEW.username, '')) <> lower(coalesce(OLD.username, ''))
     AND lower(NEW.username) = ANY (reserved) THEN
    RAISE EXCEPTION 'Bu kullanıcı adı sistem tarafından ayrılmıştır.';
  END IF;

  -- Moderation and entitlement state stored inside custom_fields is preserved as-is.
  FOREACH protected_key IN ARRAY ARRAY['isBanned', 'banReason', 'suspendedUntil', 'betaStatus', 'supporter_tier', 'subscription'] LOOP
    IF old_custom ? protected_key THEN
      new_custom := jsonb_set(new_custom, ARRAY[protected_key], old_custom -> protected_key, true);
    ELSE
      new_custom := new_custom - protected_key;
    END IF;
  END LOOP;

  NEW.custom_fields := new_custom;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_privileges ON public.profiles;
CREATE TRIGGER trg_protect_profile_privileges
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileges();

-- New profiles must belong to the caller and start without privileges.
CREATE OR REPLACE FUNCTION public.protect_profile_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reserved TEXT[] := ARRAY[
    'admin', 'administrator', 'nylithra', 'c4e_admin', 'code4ever', 'system', 'root',
    'support', 'staff', 'moderator', 'security', 'official', 'api', 'bot'
  ];
BEGIN
  -- auth.uid() IS NULL means there is no end-user session behind this insert: the SQL
  -- editor, a migration or the service key. Those callers already had to get past the
  -- profiles_insert_self policy, which a signed-out client cannot, so seeding the founder
  -- account by hand stays possible while sign-up stays restricted.
  IF auth.role() = 'service_role' OR auth.uid() IS NULL OR public.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  -- Reserved system usernames may not be claimed on sign-up either. The UPDATE trigger
  -- already blocked renaming into one, but registering straight into one was open, and
  -- the client grants the admin UI to a fixed list of these names.
  IF lower(coalesce(NEW.username, '')) = ANY (reserved) THEN
    RAISE EXCEPTION 'Bu kullanıcı adı sistem tarafından ayrılmıştır.';
  END IF;

  NEW.is_admin := false;
  NEW.verified := false;
  NEW.supporter_tier := 'none';

  -- Yeni bir profil ASLA bağlı gelmez. Kayıt sırasında bu alanları doldurabilmek, doğrulama
  -- yapılmadan bir kimliği sahiplenmek demek olurdu; bağlantıyı yalnızca arka uç, karşı
  -- taraf kimliği kanıtladıktan sonra kurar.
  NEW.github_username := NULL;
  NEW.github_linked_at := NULL;
  NEW.jubbio_user_id := NULL;
  NEW.jubbio_username := NULL;
  NEW.jubbio_avatar_url := NULL;
  NEW.jubbio_linked_at := NULL;
  NEW.lanux_user_id := NULL;
  NEW.lanux_username := NULL;
  NEW.lanux_linked_at := NULL;
  NEW.lanux_refresh_token := NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_insert ON public.profiles;
CREATE TRIGGER trg_protect_profile_insert
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_insert();

-- 4.2 Posts: everybody may like / repost / bookmark / comment, nobody but the author (or an
-- administrator) may change the content of a post.
CREATE OR REPLACE FUNCTION public.restrict_post_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me TEXT := public.current_username();
  merged public.posts;
BEGIN
  IF auth.role() = 'service_role' OR public.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  IF (OLD.author_id IS NOT NULL AND OLD.author_id::text = auth.uid()::text)
     OR (me IS NOT NULL AND lower(OLD.author->>'username') = me) THEN
    NEW.author_id := OLD.author_id;
    NEW.created_at := OLD.created_at;
    RETURN NEW;
  END IF;

  -- Engagement-only update. Start from the stored row and copy ONLY the interaction
  -- columns across, so any column that is not explicitly listed here (today's content
  -- columns and any added later) simply cannot be changed by a non-author.
  merged := OLD;
  merged.likes_count := NEW.likes_count;
  merged.liked_by := NEW.liked_by;
  merged.comments := NEW.comments;
  merged.comments_count := NEW.comments_count;
  merged.reposts_count := NEW.reposts_count;
  merged.reposted_by := NEW.reposted_by;
  merged.bookmarked_by := NEW.bookmarked_by;
  RETURN merged;
END;
$$;

DROP TRIGGER IF EXISTS trg_restrict_post_updates ON public.posts;
CREATE TRIGGER trg_restrict_post_updates
BEFORE UPDATE ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.restrict_post_updates();

-- Stamp the author id on insert so ownership survives username changes.
CREATE OR REPLACE FUNCTION public.stamp_post_author()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.author_id := auth.uid()::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_post_author ON public.posts;
CREATE TRIGGER trg_stamp_post_author
BEFORE INSERT ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.stamp_post_author();

-- 4.3 Communities: joining updates the member counter, everything else is owner-only.
CREATE OR REPLACE FUNCTION public.restrict_community_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me TEXT := public.current_username();
  merged public.communities;
  gercek_proje INTEGER;
BEGIN
  /*
   * PROJE SAYACI HER YOLDA BİRLEŞİM TABLOSUNDAN YENİDEN HESAPLANIR.
   *
   * İki ayrı sorunu birden çözüyor:
   *
   * 1. Bu tetikleyici sahibi olmayan biri güncelleme yaptığında satırı OLD'a geri
   *    sarıyor. Sayaç tetikleyicisinin (sync_community_projects_counter) yazdığı
   *    değer de o sarmada düşüyordu — sonuç: topluluğa proje eklense bile sayaç
   *    kalıcı olarak 0 kalıyordu. Testte tam olarak bu çıktı.
   *
   * 2. Sahip ya da yönetici yükte projects_count = 9999 gönderebilirdi. Değer
   *    yükten değil tablodan okunduğu için bu da imkânsız.
   *
   * Artırma/azaltma yerine yeniden sayma: kaçan tek bir tetikleme sayacı kalıcı
   * olarak kaydırmaz, bir sonraki değişiklikte kendini düzeltir.
   */
  SELECT count(*) INTO gercek_proje
    FROM public.community_projects cp
    JOIN public.projects p ON p.id = cp.project_id
   WHERE cp.community_id = OLD.id AND p.is_deleted = false;

  IF auth.role() = 'service_role' OR public.is_platform_admin() THEN
    NEW.projects_count := gercek_proje;
    RETURN NEW;
  END IF;

  IF (OLD.created_by IS NOT NULL AND OLD.created_by::text = auth.uid()::text)
     OR (me IS NOT NULL AND lower(coalesce(OLD.creator_username, '')) = me) THEN
    NEW.projects_count := gercek_proje;
    RETURN NEW;
  END IF;

  -- Non-owners may only move the member counter (join / leave).
  merged := OLD;
  merged.members_count := NEW.members_count;
  merged.projects_count := gercek_proje;
  merged.updated_at := NOW();
  RETURN merged;
END;
$$;

DROP TRIGGER IF EXISTS trg_restrict_community_updates ON public.communities;
CREATE TRIGGER trg_restrict_community_updates
BEFORE UPDATE ON public.communities
FOR EACH ROW EXECUTE FUNCTION public.restrict_community_updates();

-- 4.4 Job listings: applicants may only append to the application arrays.
CREATE OR REPLACE FUNCTION public.restrict_job_listing_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me TEXT := public.current_username();
  merged public.job_listings;
BEGIN
  IF auth.role() = 'service_role' OR public.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  IF (OLD.author_id IS NOT NULL AND OLD.author_id::text = auth.uid()::text)
     OR (me IS NOT NULL AND lower(OLD.author->>'username') = me) THEN
    RETURN NEW;
  END IF;

  -- Applicants may only append to the application arrays.
  merged := OLD;
  merged.applications := NEW.applications;
  merged.applied_by := NEW.applied_by;
  merged.applications_count := NEW.applications_count;
  RETURN merged;
END;
$$;

DROP TRIGGER IF EXISTS trg_restrict_job_listing_updates ON public.job_listings;
CREATE TRIGGER trg_restrict_job_listing_updates
BEFORE UPDATE ON public.job_listings
FOR EACH ROW EXECUTE FUNCTION public.restrict_job_listing_updates();

CREATE OR REPLACE FUNCTION public.stamp_job_listing_author()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.author_id := auth.uid()::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_job_listing_author ON public.job_listings;
CREATE TRIGGER trg_stamp_job_listing_author
BEFORE INSERT ON public.job_listings
FOR EACH ROW EXECUTE FUNCTION public.stamp_job_listing_author();

-- 4.5 Groups: members may join/leave and post the "last message" preview; renaming,
-- re-avataring and changing the admin list stays with the group owner/admins.
CREATE OR REPLACE FUNCTION public.restrict_group_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me TEXT := public.current_username();
  merged public.groups;
BEGIN
  IF auth.role() = 'service_role' OR public.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  IF me IS NOT NULL AND (lower(OLD.creator_username) = me OR OLD.admins ? me) THEN
    RETURN NEW;
  END IF;

  -- Members may join / leave and refresh the last-message preview; renaming, re-avataring
  -- and changing the admin list stays with the group owner and its admins.
  merged := OLD;
  merged.members := NEW.members;
  merged.last_message := NEW.last_message;
  merged.updated_at := NOW();
  RETURN merged;
END;
$$;

DROP TRIGGER IF EXISTS trg_restrict_group_updates ON public.groups;
CREATE TRIGGER trg_restrict_group_updates
BEFORE UPDATE ON public.groups
FOR EACH ROW EXECUTE FUNCTION public.restrict_group_updates();

-- 4.6 Bildirimler: e-posta gönderim damgasını yalnızca arka uç yazabilir.
--
-- NEDEN: bildirimleri istemci oluşturuyor (anon anahtarla, RLS altında). email_sent_at
-- serbest bırakılsaydı, kötü niyetli bir istemci bildirimi oluştururken damgayı doldurup
-- karşı tarafın e-postasını SESSİZCE engelleyebilirdi — kurbanın fark edebileceği hiçbir iz
-- bırakmadan. Damga bu yüzden istemci yazmalarında her zaman NULL'a zorlanır; yalnızca
-- servis rolü (gönderimi fiilen yapan arka uç) gerçek bir değer yazabilir.
CREATE OR REPLACE FUNCTION public.protect_notification_email_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.email_sent_at := NULL;
  ELSE
    -- Güncellemede mevcut değer korunur: istemci ne silebilir ne de uydurabilir.
    NEW.email_sent_at := OLD.email_sent_at;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_notification_email_state ON public.notifications;
CREATE TRIGGER trg_protect_notification_email_state
BEFORE INSERT OR UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.protect_notification_email_state();

-- 4.7 Projeler: puan istemciden yazılamaz, sayaçlar beğeni/takip satırlarından türetilir.
--
-- BU BİR YARIŞMA. "Haftanın projesi" ve "tüm zamanların en çok beğenileni" bu sayılara
-- bakıyor. Sayaçlar serbest bırakılsaydı üyenin kendi projesinde tek bir UPDATE ile birinci
-- olması yeterdi — liderlik tablosu da, beğeni de anlamsızlaşırdı. Bu yüzden:
--   * sayaçları YALNIZCA aşağıdaki tetikleyiciler yazar (beğeni/takip satırı eklenip
--     silindikçe),
--   * projenin kendi UPDATE'inde sayaçlar ve sahiplik alanları eski değerlerine sabitlenir,
--   * commit takip alanları da aynı şekilde korunur, aksi hâlde üye last_commit_sha'yı
--     silip takipçilerine istediği zaman bildirim yağdırabilirdi.
CREATE OR REPLACE FUNCTION public.protect_project_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Yeni proje her zaman sıfırdan başlar; "1000 beğeniyle doğan" proje olmaz.
    -- Bu, servis rolü için de geçerli: puanın tek kaynağı beğeni satırlarıdır.
    NEW.likes_count := 0;
    NEW.followers_count := 0;
    RETURN NEW;
  END IF;

  -- SAYAÇLAR HER GÜNCELLEMEDE GERÇEK SATIRLARDAN YENİDEN HESAPLANIR.
  --
  -- "Eski değeri koru" yaklaşımı denendi ve YANLIŞTI: sayaçları besleyen tetikleyicinin
  -- kendi UPDATE'ini de engelliyordu, yani beğeniler hiç sayılmıyordu. Buradaki biçim hem
  -- o sorunu çözüyor hem de daha güçlü: sayaç ne yazılırsa yazılsın, kimin tarafından
  -- yazılırsa yazılsın, sonuç her zaman project_likes / project_follows tablolarındaki
  -- gerçek satır sayısı olur. Puanı uydurmanın yolu yok; beğeni satırı eklemek gerekir,
  -- onu da RLS yalnızca kişinin kendi adına yapmasına izin veriyor.
  NEW.likes_count := (SELECT count(*) FROM public.project_likes WHERE project_id = OLD.id);
  NEW.followers_count := (SELECT count(*) FROM public.project_follows WHERE project_id = OLD.id);

  -- Commit takip alanlarını yalnızca arka uç yazar. Serbest bırakılsaydı üye
  -- last_commit_sha'yı silip takipçilerine istediği zaman bildirim yağdırabilirdi.
  IF auth.role() = 'service_role' OR public.is_platform_admin() THEN
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  NEW.id := OLD.id;
  NEW.owner_id := OLD.owner_id;
  NEW.owner_username := OLD.owner_username;
  NEW.created_at := OLD.created_at;

  -- ADRES SABİT. /project/<slug> paylaşılabilir bir bağlantı; değişmesine izin vermek,
  -- daha önce paylaşılmış her bağlantıyı sessizce kırmak demek. Proje adı değiştirilebilir
  -- ama adres ilk hâliyle kalır.
  NEW.slug := OLD.slug;

  -- DEPO BİR KEZ BAĞLANIR, SONRA DEĞİŞTİRİLEMEZ.
  --
  -- Depo isteğe bağlı olduğu için "hiç değiştirilemez" demek yanlış olurdu: deposuz açılmış
  -- bir projeye sonradan depo eklenebilmeli. Ama bir kez bağlandıktan sonra değiştirilebilseydi,
  -- üye beğenileri toplanmış bir projenin deposunu bambaşka bir şeyle değiştirip o beğenileri
  -- devralırdı. Bu yüzden yalnızca BOŞTAN DOLUYA geçişe izin var.
  --
  -- Sahiplik doğrulaması sunucuda yapılıyor (üye yalnızca kendi GitHub hesabındaki bir depoyu
  -- bağlayabilir); buradaki kural onun üzerine binen ikinci katman.
  IF OLD.repo_full_name IS NOT NULL THEN
    NEW.repo_full_name := OLD.repo_full_name;
    NEW.repo_url := OLD.repo_url;
  END IF;

  NEW.last_commit_sha := OLD.last_commit_sha;
  NEW.last_commit_at := OLD.last_commit_at;
  NEW.last_checked_at := OLD.last_checked_at;
  NEW.check_failures := OLD.check_failures;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_project_columns ON public.projects;
CREATE TRIGGER trg_protect_project_columns
BEFORE INSERT OR UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.protect_project_columns();

-- Sayaçları beğeni/takip satırlarından türeten tetikleyici.
--
-- Tek bir fonksiyon iki tabloya da hizmet ediyor; hangi sütunu güncelleyeceğini
-- TG_ARGV[0] söylüyor. Sayım her seferinde tablodan YENİDEN yapılıyor (+1/-1 yerine):
-- artırma/azaltma, yarıda kalan bir işlem ya da elle silinen bir satırdan sonra sayacı
-- kalıcı olarak yanlış bırakır ve bir daha kendini düzeltmez.
CREATE OR REPLACE FUNCTION public.sync_project_counter()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hedef TEXT := COALESCE(NEW.project_id, OLD.project_id);
BEGIN
  IF TG_ARGV[0] = 'likes' THEN
    UPDATE public.projects
       SET likes_count = (SELECT count(*) FROM public.project_likes WHERE project_id = hedef)
     WHERE id = hedef;
  ELSE
    UPDATE public.projects
       SET followers_count = (SELECT count(*) FROM public.project_follows WHERE project_id = hedef)
     WHERE id = hedef;
  END IF;

  RETURN NULL; -- AFTER tetikleyici; dönüş değeri yok sayılır.
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_project_likes ON public.project_likes;
CREATE TRIGGER trg_sync_project_likes
AFTER INSERT OR DELETE ON public.project_likes
FOR EACH ROW EXECUTE FUNCTION public.sync_project_counter('likes');

DROP TRIGGER IF EXISTS trg_sync_project_follows ON public.project_follows;
CREATE TRIGGER trg_sync_project_follows
AFTER INSERT OR DELETE ON public.project_follows
FOR EACH ROW EXECUTE FUNCTION public.sync_project_counter('follows');

-- Topluluğun proje sayacı. Beğeni/takip sayaçlarıyla aynı mantık: sayı HER DEĞİŞİKLİKTE
-- birleşim tablosundan yeniden sayılıyor, artırılıp azaltılmıyor. Artırma/azaltma, kaçan
-- tek bir tetikleme yüzünden sayacın kalıcı olarak kaymasına yol açar; yeniden sayma
-- kendini düzeltir.
CREATE OR REPLACE FUNCTION public.sync_community_projects_counter()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hedef TEXT := COALESCE(NEW.community_id, OLD.community_id);
BEGIN
  UPDATE public.communities
     SET projects_count = (
           SELECT count(*)
             FROM public.community_projects cp
             JOIN public.projects p ON p.id = cp.project_id
            WHERE cp.community_id = hedef
              AND p.is_deleted = false
         )
   WHERE id = hedef;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_community_projects ON public.community_projects;
CREATE TRIGGER trg_sync_community_projects
AFTER INSERT OR DELETE ON public.community_projects
FOR EACH ROW EXECUTE FUNCTION public.sync_community_projects_counter();

-- ================================================================
-- 5. ROW LEVEL SECURITY
-- ================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_error_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_reports ENABLE ROW LEVEL SECURITY;
-- RLS on, and deliberately no policy: with the anon/authenticated grants withheld below,
-- API key material is unreachable from any browser session. Only the service role reads it.
ALTER TABLE public.community_api_keys ENABLE ROW LEVEL SECURITY;
-- Same reasoning: the admin's cached mail is backend-only, reachable by no browser session.
ALTER TABLE public.admin_mail_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_mail_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_follows ENABLE ROW LEVEL SECURITY;

-- Drop every existing policy on the tables this script manages, so the CREATE POLICY
-- statements below are re-runnable. Without this the script fails on a second run with
-- "policy ... already exists" (42710).
--
-- IMPORTANT: a table added to this schema must also be added to the list below, otherwise
-- its policies survive the cleanup and re-running the script breaks. Tables that are not
-- listed are left completely untouched, so policies you created by hand are never dropped.
DO $$
DECLARE
  pol RECORD;
  managed TEXT[] := ARRAY[
    'profiles', 'posts', 'communities', 'community_api_keys', 'job_listings',
    'job_applications', 'notifications', 'groups', 'messages', 'group_invites',
    'system_error_reports', 'post_reports', 'admin_mail_cache', 'admin_mail_sync_state',
    'projects', 'project_likes', 'project_follows'
  ];
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (managed)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

-- 5.1 Profiles ---------------------------------------------------
CREATE POLICY "profiles_select_public" ON public.profiles
  FOR SELECT USING (true);
CREATE POLICY "profiles_insert_self" ON public.profiles
  FOR INSERT WITH CHECK (public.owns_profile(id::text) OR public.is_platform_admin());
CREATE POLICY "profiles_update_self" ON public.profiles
  FOR UPDATE USING (public.owns_profile(id::text) OR public.is_platform_admin())
  WITH CHECK (public.owns_profile(id::text) OR public.is_platform_admin());
CREATE POLICY "profiles_delete_self" ON public.profiles
  FOR DELETE USING (public.owns_profile(id::text) OR public.is_platform_admin());

-- 5.2 Posts ------------------------------------------------------
-- Private communities: their posts are only selectable by members (or administrators).
CREATE POLICY "posts_select_public" ON public.posts
  FOR SELECT USING (
    public.is_platform_admin()
    OR (
      coalesce(is_deleted, false) = false
      AND NOT public.is_hidden_community_post(community_id)
    )
  );
CREATE POLICY "posts_insert_own" ON public.posts
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND lower(author->>'username') = public.current_username()
  );
-- Any signed-in member may update (likes/comments); the trigger above limits WHICH columns.
CREATE POLICY "posts_update_authenticated" ON public.posts
  FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "posts_delete_own" ON public.posts
  FOR DELETE USING (
    public.is_platform_admin()
    OR (author_id IS NOT NULL AND author_id::text = auth.uid()::text)
    OR lower(author->>'username') = public.current_username()
  );

-- 5.3 Communities ------------------------------------------------
CREATE POLICY "communities_select_public" ON public.communities
  FOR SELECT USING (true);
CREATE POLICY "communities_insert_own" ON public.communities
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND (created_by IS NULL OR created_by::text = auth.uid()::text)
  );
CREATE POLICY "communities_update_authenticated" ON public.communities
  FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "communities_delete_owner" ON public.communities
  FOR DELETE USING (
    public.is_platform_admin()
    OR created_by::text = auth.uid()::text
    OR lower(coalesce(creator_username, '')) = public.current_username()
  );

-- 5.4 Job listings -----------------------------------------------
CREATE POLICY "job_listings_select_public" ON public.job_listings
  FOR SELECT USING (true);
CREATE POLICY "job_listings_insert_own" ON public.job_listings
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND lower(author->>'username') = public.current_username()
  );
CREATE POLICY "job_listings_update_authenticated" ON public.job_listings
  FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "job_listings_delete_own" ON public.job_listings
  FOR DELETE USING (
    public.is_platform_admin()
    OR (author_id IS NOT NULL AND author_id::text = auth.uid()::text)
    OR lower(author->>'username') = public.current_username()
  );

-- 5.5 Job applications -------------------------------------------
-- Applications carry personal data (name, age, experience): only the applicant, the listing
-- owner and administrators can read them.
CREATE POLICY "job_applications_select_involved" ON public.job_applications
  FOR SELECT USING (
    public.is_platform_admin()
    OR lower(applicant_username) = public.current_username()
    OR EXISTS (
      SELECT 1 FROM public.job_listings j
      WHERE j.id = job_id
        AND (j.author_id::text = auth.uid()::text OR lower(j.author->>'username') = public.current_username())
    )
  );
CREATE POLICY "job_applications_insert_own" ON public.job_applications
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND lower(applicant_username) = public.current_username()
  );
CREATE POLICY "job_applications_update_involved" ON public.job_applications
  FOR UPDATE USING (
    public.is_platform_admin()
    OR lower(applicant_username) = public.current_username()
    OR EXISTS (
      SELECT 1 FROM public.job_listings j
      WHERE j.id = job_id
        AND (j.author_id::text = auth.uid()::text OR lower(j.author->>'username') = public.current_username())
    )
  );
CREATE POLICY "job_applications_delete_involved" ON public.job_applications
  FOR DELETE USING (
    public.is_platform_admin()
    OR lower(applicant_username) = public.current_username()
    OR EXISTS (
      SELECT 1 FROM public.job_listings j
      WHERE j.id = job_id
        AND (j.author_id::text = auth.uid()::text OR lower(j.author->>'username') = public.current_username())
    )
  );

-- 5.6 Notifications ----------------------------------------------
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT USING (
    public.is_platform_admin()
    OR lower(recipient_id) = public.current_username()
    OR recipient_id::text = auth.uid()::text
  );
CREATE POLICY "notifications_insert_as_self" ON public.notifications
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      lower(coalesce(actor->>'username', '')) = public.current_username()
      OR lower(coalesce(actor->>'username', '')) IN ('code4ever', 'system')
    )
  );
CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE USING (
    public.is_platform_admin()
    OR lower(recipient_id) = public.current_username()
    OR recipient_id::text = auth.uid()::text
  );
CREATE POLICY "notifications_delete_own" ON public.notifications
  FOR DELETE USING (
    public.is_platform_admin()
    OR lower(recipient_id) = public.current_username()
    OR recipient_id::text = auth.uid()::text
  );

-- 5.7 Groups -----------------------------------------------------
CREATE POLICY "groups_select_members" ON public.groups
  FOR SELECT USING (
    public.is_platform_admin()
    OR public.is_conversation_participant(id)
    OR EXISTS (
      SELECT 1 FROM public.group_invites gi
      WHERE gi.group_id = groups.id AND lower(gi.target_username) = public.current_username()
    )
  );
CREATE POLICY "groups_insert_own" ON public.groups
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND lower(creator_username) = public.current_username()
  );
CREATE POLICY "groups_update_members" ON public.groups
  FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "groups_delete_owner" ON public.groups
  FOR DELETE USING (
    public.is_platform_admin() OR lower(creator_username) = public.current_username()
  );

-- 5.8 Messages ---------------------------------------------------
-- The heart of the privacy model: only conversation participants may read a message.
CREATE POLICY "messages_select_participants" ON public.messages
  FOR SELECT USING (
    public.is_platform_admin()
    OR lower(sender_username) = public.current_username()
    OR public.is_conversation_participant(conversation_id)
  );
CREATE POLICY "messages_insert_own" ON public.messages
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND lower(sender_username) = public.current_username()
    AND public.is_conversation_participant(conversation_id)
  );
CREATE POLICY "messages_update_sender" ON public.messages
  FOR UPDATE USING (
    public.is_platform_admin()
    OR lower(sender_username) = public.current_username()
    OR public.is_conversation_participant(conversation_id)
  );
CREATE POLICY "messages_delete_sender" ON public.messages
  FOR DELETE USING (
    public.is_platform_admin() OR lower(sender_username) = public.current_username()
  );

-- 5.9 Group invites ----------------------------------------------
CREATE POLICY "group_invites_select_involved" ON public.group_invites
  FOR SELECT USING (
    public.is_platform_admin()
    OR lower(target_username) = public.current_username()
    OR lower(invited_by_username) = public.current_username()
  );
CREATE POLICY "group_invites_insert_own" ON public.group_invites
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND lower(invited_by_username) = public.current_username()
  );
CREATE POLICY "group_invites_update_involved" ON public.group_invites
  FOR UPDATE USING (
    public.is_platform_admin()
    OR lower(target_username) = public.current_username()
    OR lower(invited_by_username) = public.current_username()
  );
CREATE POLICY "group_invites_delete_involved" ON public.group_invites
  FOR DELETE USING (
    public.is_platform_admin()
    OR lower(target_username) = public.current_username()
    OR lower(invited_by_username) = public.current_username()
  );

-- 5.10 Reports ---------------------------------------------------
CREATE POLICY "system_error_reports_select_own" ON public.system_error_reports
  FOR SELECT USING (
    public.is_platform_admin() OR lower(reporter_username) = public.current_username()
  );
CREATE POLICY "system_error_reports_insert_own" ON public.system_error_reports
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND lower(reporter_username) = public.current_username()
  );
CREATE POLICY "system_error_reports_update_admin" ON public.system_error_reports
  FOR UPDATE USING (public.is_platform_admin());
CREATE POLICY "system_error_reports_delete_admin" ON public.system_error_reports
  FOR DELETE USING (public.is_platform_admin());

CREATE POLICY "post_reports_select_own" ON public.post_reports
  FOR SELECT USING (
    public.is_platform_admin() OR lower(reporter_username) = public.current_username()
  );
CREATE POLICY "post_reports_insert_own" ON public.post_reports
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND lower(reporter_username) = public.current_username()
  );
CREATE POLICY "post_reports_update_admin" ON public.post_reports
  FOR UPDATE USING (public.is_platform_admin());
CREATE POLICY "post_reports_delete_admin" ON public.post_reports
  FOR DELETE USING (public.is_platform_admin());

-- 5.12 Community API keys ----------------------------------------
-- The backend reaches this table with the service role key. Supabase's service_role is
-- normally BYPASSRLS, but stating the policy explicitly means the API keeps working on a
-- cluster where it is not — instead of every key silently failing to resolve. anon and
-- authenticated hold no grant at all (section 6), so no browser can reach key material.
CREATE POLICY "community_api_keys_service_role" ON public.community_api_keys
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5.13 Cached admin mail -----------------------------------------
-- Identical reasoning to 5.12: stated explicitly so the console keeps working on a cluster
-- where service_role is not BYPASSRLS, while anon and authenticated hold no grant at all.
CREATE POLICY "admin_mail_cache_service_role" ON public.admin_mail_cache
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "admin_mail_sync_state_service_role" ON public.admin_mail_sync_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5.14 Projeler ---------------------------------------------------
-- Projeler bir vitrin: silinmemiş olanı herkes görür (oturumsuz ziyaretçi dahil).
CREATE POLICY "projects_select_public" ON public.projects
  FOR SELECT USING (is_deleted = false);

-- Üye yalnızca KENDİ adına proje açabilir. owner_id başkasının olsaydı, üye başkasının
-- hesabına proje ekleyip onun profilinde gösterebilirdi.
CREATE POLICY "projects_insert_own" ON public.projects
  FOR INSERT TO authenticated WITH CHECK (public.owns_profile(owner_id));

-- Düzenleme ve silme sahibinin (veya yöneticinin). Hangi SÜTUNLARIN değişebileceğini
-- yukarıdaki 4.7 tetikleyicisi sınırlıyor; RLS yalnızca HANGİ SATIR sorusunu yanıtlar.
CREATE POLICY "projects_update_own" ON public.projects
  FOR UPDATE TO authenticated
  USING (public.owns_profile(owner_id) OR public.is_platform_admin())
  WITH CHECK (public.owns_profile(owner_id) OR public.is_platform_admin());

CREATE POLICY "projects_delete_own" ON public.projects
  FOR DELETE TO authenticated
  USING (public.owns_profile(owner_id) OR public.is_platform_admin());

-- Beğeni ve takip satırları herkese açık okunur (GitHub'da yıldız ve izleyici listesi de
-- öyledir), ama üye YALNIZCA KENDİ satırını ekleyip silebilir. Bu, sayaç tetikleyicisiyle
-- birlikte beğeni sayısını gerçekten kazanılması gereken bir şey yapıyor: başkası adına
-- beğeni satırı eklenemez, aynı üye iki kez beğenemez (birincil anahtar), sayacı da
-- doğrudan yazmak mümkün değil.
CREATE POLICY "project_likes_select_public" ON public.project_likes FOR SELECT USING (true);
CREATE POLICY "project_likes_insert_own" ON public.project_likes
  FOR INSERT TO authenticated WITH CHECK (public.owns_profile(user_id));
CREATE POLICY "project_likes_delete_own" ON public.project_likes
  FOR DELETE TO authenticated USING (public.owns_profile(user_id));

-- Commit tarayıcısı projeleri servis rolüyle güncelliyor (last_commit_sha, last_checked_at).
-- Supabase'in service_role'ü normalde BYPASSRLS'tir, ama 5.12'deki gerekçenin aynısı burada
-- da geçerli: politikayı açıkça yazmak, service_role'ün BYPASSRLS OLMADIĞI bir kümede
-- tarayıcının çalışmaya devam etmesini sağlıyor. Aksi hâlde güncelleme hiçbir politikayla
-- eşleşmez, sessizce 0 satır etkiler ve bildirimler hiç gitmez — hata da vermez.
CREATE POLICY "projects_service_role" ON public.projects
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "project_likes_service_role" ON public.project_likes
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "project_follows_service_role" ON public.project_follows
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- --- Topluluk projeleri --------------------------------------------------------
--
-- OKUMA, topluluğun görünürlüğüne bağlı. Açık bir topluluğun proje listesi herkese
-- açıktır (gönderileri de öyle); GİZLİ bir topluluğunki yalnızca üyelerine. Bunu
-- yazmazsak gizli bir topluluğun hangi projeleri barındırdığı dışarıdan okunabilirdi
-- — topluluğun kendisi gizliyken içeriğinin sızması.
CREATE POLICY "community_projects_select_visible" ON public.community_projects
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.communities c
       WHERE c.id = community_id
         AND (c.is_private = false OR public.is_community_member(c.id))
    )
    OR public.is_platform_admin()
  );

-- YAZMA yalnızca projenin SAHİBİ tarafından ve yalnızca ÜYESİ OLDUĞU topluluğa.
--
-- İki ayrı koruma, ikisi de gerekli:
--   1. Sahiplik — olmasaydı herhangi bir üye başkasının projesini istediği topluluğa
--      sokabilirdi; proje sahibinin adı o toplulukta görünürdü.
--   2. Üyelik — olmasaydı bir üye hiç katılmadığı topluluklara projesini serpiştirip
--      reklam yapabilirdi.
CREATE POLICY "community_projects_insert_own" ON public.community_projects
  FOR INSERT TO authenticated WITH CHECK (
    public.owns_profile(added_by)
    AND EXISTS (
      SELECT 1 FROM public.projects p
       WHERE p.id = project_id AND public.owns_profile(p.owner_id)
    )
    AND public.is_community_member(community_id)
  );

-- SİLME: projenin sahibi kendi girdisini geri alabilir, topluluğun kurucusu ise
-- topluluğundaki herhangi bir girdiyi kaldırabilir. İkincisi moderasyon için şart —
-- yoksa topluluk sahibi, kendi topluluğuna konan alakasız bir projeyi kaldıramazdı.
CREATE POLICY "community_projects_delete_own_or_mod" ON public.community_projects
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.projects p
       WHERE p.id = project_id AND public.owns_profile(p.owner_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.communities c
       WHERE c.id = community_id AND public.owns_profile(c.created_by)
    )
    OR public.is_platform_admin()
  );

CREATE POLICY "community_projects_service_role" ON public.community_projects
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "project_follows_select_public" ON public.project_follows FOR SELECT USING (true);
CREATE POLICY "project_follows_insert_own" ON public.project_follows
  FOR INSERT TO authenticated WITH CHECK (public.owns_profile(user_id));
CREATE POLICY "project_follows_delete_own" ON public.project_follows
  FOR DELETE TO authenticated USING (public.owns_profile(user_id));

-- ================================================================
-- 6. GRANTS
-- ================================================================
-- Anonymous visitors get read-only access to the public tables (feed, profiles,
-- communities, job listings). Everything else requires a signed-in session, and RLS decides
-- the rest. The previous `GRANT ALL ... TO anon` made the anon key a master key.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT ON
  public.posts, public.communities, public.job_listings,
  public.projects, public.project_likes, public.project_follows,
  public.community_projects
TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.posts, public.communities, public.job_listings,
  public.job_applications, public.notifications, public.groups, public.messages,
  public.group_invites, public.system_error_reports, public.post_reports,
  public.projects
TO authenticated;

-- Beğeni ve takip satırlarında UPDATE'e gerek yok: bir beğeni ya vardır ya yoktur.
-- Vermemek, "başkasının beğenisini kendi üstüne alma" gibi bir hamleyi baştan imkânsız kılar.
GRANT SELECT, INSERT, DELETE ON public.project_likes, public.project_follows TO authenticated;

-- Topluluk–proje bağları da aynı şekilde: UPDATE yok. Bir proje bir toplulukta ya
-- vardır ya yoktur; satırı güncellemek "başkasının girdisini kendi üstüme alma"
-- hamlesine kapı açardı, eklemek-silmek ise yeterli.
GRANT SELECT, INSERT, DELETE ON public.community_projects TO authenticated;

-- profiles: everything EXCEPT the e-mail address is world-readable.
--
-- Row Level Security is row-scoped, not column-scoped, so the previous table-wide
-- `GRANT SELECT ON public.profiles TO anon` let anybody holding the public anon key run
-- `select=username,email` and harvest every address on the platform. Column-level grants
-- are the only mechanism in PostgreSQL that closes this.
--
-- The column list is derived from the live table so a column added later is readable by
-- default and only `email` stays withheld. Writes stay table-level: a member must be able to
-- record their own address on sign-up, and RLS already confines that to their own row.
DO $$
DECLARE
  readable TEXT;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO readable
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'profiles'
     -- E-posta gizlidir; lanux_refresh_token ise ŞİFRELİ DE OLSA bir sırdır ve tarayıcıya
     -- hiç gitmemelidir. Buradan dışlanmasaydı anon anahtarıyla herkes tarafından okunabilir
     -- olurdu — daha önce `email` sütununda kapatılan sızıntının birebir aynısı.
     AND column_name NOT IN ('email', 'lanux_refresh_token');

  EXECUTE format('GRANT SELECT (%s) ON public.profiles TO anon, authenticated', readable);
END $$;

GRANT INSERT, UPDATE, DELETE ON public.profiles TO authenticated;

-- public.community_api_keys is intentionally absent from both grant lists above: browsers
-- never touch key material, the backend reaches it with the service role key only.
--
-- public.admin_mail_cache and public.admin_mail_sync_state are absent for the same reason.
-- They hold the administrator's private correspondence; it reaches the browser only through
-- the requireAdmin-protected /api/admin/mail/* endpoints, never through the anon key.

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

GRANT EXECUTE ON FUNCTION public.current_username() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owns_profile(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_community_member(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_hidden_community_post(TEXT) TO anon, authenticated;

-- ================================================================
-- 7. REALTIME
-- ================================================================

ALTER TABLE public.posts REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.job_listings REPLICA IDENTITY FULL;
ALTER TABLE public.communities REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER TABLE public.system_error_reports REPLICA IDENTITY FULL;
ALTER TABLE public.post_reports REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE
      public.posts, public.messages, public.job_listings, public.communities,
      public.notifications, public.profiles, public.system_error_reports, public.post_reports;
  EXCEPTION WHEN OTHERS THEN
    -- Already published (or the publication does not exist): safe to ignore.
    NULL;
  END;
END $$;

-- ================================================================
-- 8. INDEXES
-- ================================================================

CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_category ON public.posts(category);
CREATE INDEX IF NOT EXISTS idx_posts_is_deleted ON public.posts(is_deleted);
CREATE INDEX IF NOT EXISTS idx_posts_author_id ON public.posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_community_id ON public.posts(community_id);
CREATE INDEX IF NOT EXISTS idx_communities_private ON public.communities(is_private);
CREATE INDEX IF NOT EXISTS idx_job_listings_created_at ON public.job_listings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_username_lower ON public.profiles(lower(username));
CREATE INDEX IF NOT EXISTS idx_messages_conv ON public.messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_group_invites_target ON public.group_invites(target_username, status);
CREATE INDEX IF NOT EXISTS idx_system_error_reports_created_at ON public.system_error_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_reports_created_at ON public.post_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_api_keys_hash ON public.community_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_community_api_keys_community ON public.community_api_keys(community_id, revoked_at);

-- Projeler.
--
-- Bir depo için YALNIZCA BİR proje. Sunucu eklemeden önce zaten bakıyor ama
-- önce-oku-sonra-yaz bir yarış penceresi bırakır; asıl garanti burada. Aksi hâlde aynı depo
-- liderlik tablosunda üç kez görünür ve beğenileri bölünürdü. lower(): GitHub depo adları
-- büyük/küçük harf duyarsızdır. Silinmiş projeler kapsam dışı, böylece bir projeyi silip
-- aynı depoyla yeniden açmak mümkün kalıyor.
-- `repo_full_name IS NOT NULL` açıkça yazılı: deposuz projeler indekse hiç girmesin.
-- (Postgres NULL'ları zaten benzersiz saymaz, ama kuralı okuyanın "deposuz iki proje
-- çakışır mı" diye düşünmesine gerek kalmıyor.)
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_repo
  ON public.projects(lower(repo_full_name))
  WHERE is_deleted = false AND repo_full_name IS NOT NULL;

-- Proje sayfasının adresi tekil olmalı, yoksa iki proje aynı bağlantıyı paylaşır ve
-- ziyaretçi hangisini göreceğini sıraya bırakmış olur. Silinmiş projeler kapsam dışı:
-- bir projeyi silip aynı adı yeniden kullanmak mümkün kalıyor.
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_slug
  ON public.projects(lower(slug)) WHERE is_deleted = false AND slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_projects_likes ON public.projects(likes_count DESC) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_projects_created ON public.projects(created_at DESC) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_projects_owner ON public.projects(owner_id) WHERE is_deleted = false;
-- Commit tarayıcısı "en uzun süredir bakılmamış" projeleri seçiyor; NULLS FIRST sayesinde
-- hiç bakılmamış yeni projeler sıranın başına geçiyor.
CREATE INDEX IF NOT EXISTS idx_projects_checked ON public.projects(last_checked_at ASC NULLS FIRST)
  WHERE is_deleted = false;

-- "Haftanın projesi" son 7 günün beğenilerini sayıyor: tarih sırası olmadan bu her seferinde
-- tam tarama olurdu.
CREATE INDEX IF NOT EXISTS idx_project_likes_recent ON public.project_likes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_likes_user ON public.project_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_project_follows_user ON public.project_follows(user_id);
-- Bildirim turu her proje için takipçileri okuyor.
CREATE INDEX IF NOT EXISTS idx_project_follows_project ON public.project_follows(project_id);
-- The inbox list is always "this mailbox, newest UID first", which is exactly this index.
CREATE INDEX IF NOT EXISTS idx_admin_mail_cache_mailbox ON public.admin_mail_cache(mailbox, uid DESC);
-- Gönderici sorgusu tam olarak şudur: "e-postası gönderilmemiş, yeni bildirimler".
-- Kısmi indeks yalnızca bekleyen satırları taşır; gönderilenler indeksten düşer, yani
-- indeks tablo büyüdükçe değil kuyruk büyüdükçe büyür.
-- Arama sorgusunun tamamı bu indeksten karşılanır. GIN, tsvector için doğru tür:
-- her token'ı ayrı ayrı indeksler, yani "içinde şu kelime geçen satırlar" sorgusu
-- tabloyu taramadan yanıtlanır.
CREATE INDEX IF NOT EXISTS idx_posts_search ON public.posts USING GIN (search_vector);
-- Dile göre daraltma (yalnızca TypeScript parçacıkları) çok sık kullanılıyor.
CREATE INDEX IF NOT EXISTS idx_posts_code_language ON public.posts(code_language) WHERE code_language IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_email_pending
  ON public.notifications(created_at)
  WHERE email_sent_at IS NULL;

-- ================================================================
-- 9. BOOTSTRAP THE PLATFORM ADMINISTRATOR
-- ================================================================
-- Grant the founder account the administrator flag (idempotent).
--
-- This is the ONLY way a profile becomes an administrator: is_platform_admin() reads this
-- flag and nothing else, and both profile triggers refuse to let a member set it. Regular
-- sign-up can no longer claim a reserved system username either, so if a new administrator
-- account is ever needed it must be created with the service role key (or seeded here).
UPDATE public.profiles SET is_admin = true WHERE lower(username) = 'nylithra';
