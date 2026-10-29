import React from 'react';
import { PublicPageShell, Section } from './PublicPageShell';

interface LegalViewProps {
  language: 'tr' | 'en';
  page: 'tos' | 'privacy';
}

/** Date the current wording took effect. Bump it whenever the text below changes. */
const EFFECTIVE_DATE = '14.09.2026';
const CONTACT_EMAIL = 'destek@lanux.online';

const Paragraph: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="user-text text-[13px] leading-relaxed text-zinc-400">{children}</p>
);

const List: React.FC<{ items: React.ReactNode[] }> = ({ items }) => (
  <ul className="space-y-2">
    {items.map((item, i) => (
      <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-zinc-400">
        <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-zinc-600" />
        <span className="user-text">{item}</span>
      </li>
    ))}
  </ul>
);

const Notice: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="c4e-card p-3.5 text-[12px] leading-relaxed text-zinc-400">
    {children}
  </div>
);

// -------------------------------------------------------------
// TERMS OF SERVICE
// -------------------------------------------------------------

const TermsTr: React.FC = () => (
  <>
    <Section id="kabul" title="1. Şartların Kabulü">
      <Paragraph>
        Code4Ever (“Platform”, “biz”) hizmetlerine erişerek, hesap oluşturarak veya API’yi
        kullanarak bu Kullanım Şartları’nı kabul etmiş olursunuz. Şartları kabul etmiyorsanız
        Platform’u kullanmamalısınız.
      </Paragraph>
      <Paragraph>
        Platform, geliştiricilerin gönderi ve kod parçacığı paylaştığı, topluluk kurduğu, iş
        ilanı yayımladığı ve mesajlaştığı bir sosyal geliştirici ağıdır.
      </Paragraph>
    </Section>

    <Section id="hesap" title="2. Hesap ve Uygunluk">
      <List
        items={[
          'Hesap açmak için en az 13 yaşında olmanız; 18 yaş altındaysanız veli veya vasinizin onayıyla hareket etmeniz gerekir.',
          'Verdiğiniz bilgilerin doğru olmasından ve hesabınızın güvenliğinden siz sorumlusunuz.',
          'Hesap parolanızı, oturum belirteçlerinizi ve API anahtarlarınızı paylaşmamalısınız. Hesabınızdan yapılan işlemler sizin sorumluluğunuzdadır.',
          'Sistem tarafından ayrılmış kullanıcı adlarını (admin, moderator, support gibi) alamaz, başka bir kişi veya kurum gibi görünemezsiniz.',
          'Bir kişi tek hesap açar. Otomasyon için ayrı hesap değil, topluluk API anahtarı kullanılmalıdır.'
        ]}
      />
    </Section>

    <Section id="icerik" title="3. İçeriğiniz ve Haklar">
      <Paragraph>
        Paylaştığınız gönderi, kod, görsel ve yorumların hakları size aittir. Bu içeriği
        Platform’a yüklediğinizde, hizmeti sunabilmemiz için bize dünya çapında, telifsiz,
        devredilebilir bir kullanım, çoğaltma, gösterme ve dağıtma lisansı vermiş olursunuz.
        Bu lisans yalnızca Platform’un işletilmesi, yedeklenmesi ve tanıtımı amacıyla kullanılır.
      </Paragraph>
      <Paragraph>
        İçeriğinizi sildiğinizde lisans sona erer; ancak yedeklerde ve önbelleklerde makul bir
        süre kalabileceğini, başka kullanıcıların aldığı alıntı veya ekran görüntülerini
        kaldıramayacağımızı kabul edersiniz.
      </Paragraph>
      <Paragraph>
        Paylaştığınız kodun lisansını belirtmek sizin sorumluluğunuzdadır. Başkasına ait kodu
        izinsiz paylaşmayın.
      </Paragraph>
    </Section>

    <Section id="yasak" title="4. Yasak Kullanımlar">
      <Paragraph>Platform’da aşağıdakiler kesinlikle yasaktır:</Paragraph>
      <List
        items={[
          'Yasa dışı içerik; nefret söylemi, taciz, tehdit, şiddet övgüsü ve ayrımcılık.',
          'Çocukları istismara yönelik her tür içerik.',
          'Zararlı yazılım, kimlik avı sayfası, yetkisiz erişim aracı veya başkasına zarar vermeyi amaçlayan istismar kodu paylaşımı.',
          'Başkasının kişisel verisini, kimlik bilgisini, parolasını veya API anahtarını rızası olmadan yayınlamak.',
          'Spam, toplu istenmeyen mesaj, sahte etkileşim ve otomatik reklam.',
          'Başka bir kişi, kurum veya Platform yetkilisi gibi davranmak.',
          'Platform’un güvenlik önlemlerini aşmaya, hız sınırlarını atlatmaya veya altyapıyı aşırı yüklemeye çalışmak.',
          'Platform verilerini izinsiz toplu olarak çekmek (scraping) veya yeniden yayımlamak.'
        ]}
      />
    </Section>

    <Section id="api" title="5. API Kullanımı">
      <List
        items={[
          'Topluluk API anahtarları yalnızca yetkili olduğunuz topluluklar için kullanılabilir.',
          'Anahtarlar gizli tutulmalıdır. Sızan bir anahtarı derhal iptal etmeniz gerekir.',
          'Yayımlanan hız sınırlarına uymalı, 429 yanıtında üstel geri çekilme uygulamalısınız.',
          'API üzerinden yayımlanan içerik de bu Şartlar’a tabidir ve sorumluluğu anahtar sahibine aittir.',
          'Kötüye kullanım halinde anahtarınızı önceden bildirmeksizin iptal edebiliriz.'
        ]}
      />
      <Notice>
        Teknik ayrıntılar ve limitler için{' '}
        <a href="/dev/docs" className="text-blue-400 hover:text-blue-300">
          geliştirici dokümantasyonuna
        </a>{' '}
        bakın.
      </Notice>
    </Section>

    <Section id="moderasyon" title="6. Moderasyon ve Hesap Kapatma">
      <Paragraph>
        Bu Şartlar’ı ihlal eden içeriği kaldırabilir, hesabı geçici olarak askıya alabilir veya
        kalıcı olarak kapatabiliriz. Ciddi ihlallerde (yasa dışı içerik, güvenlik saldırısı)
        önceden uyarı yapılmaksızın işlem uygulanabilir.
      </Paragraph>
      <Paragraph>
        Bir moderasyon kararına itiraz etmek için {CONTACT_EMAIL} adresine yazabilirsiniz.
        Hesabınızı dilediğiniz zaman ayarlar üzerinden kapatabilirsiniz.
      </Paragraph>
    </Section>

    <Section id="odeme" title="7. Destekçilik ve Ödemeler">
      <Paragraph>
        Spark destekçiliği gibi isteğe bağlı katkılar, ek arayüz özellikleri (özel tema, daha
        yüksek karakter sınırı gibi) sağlar. Ödemeler üçüncü taraf ödeme sağlayıcıları
        üzerinden alınır; kart bilgileriniz bize ulaşmaz.
      </Paragraph>
      <Paragraph>
        Dijital özellikler anında sunulduğundan, kullanılmaya başlanmış bir destekçilik dönemi
        için iade yapılmaz. Hatalı çekim durumunda {CONTACT_EMAIL} adresine başvurabilirsiniz.
      </Paragraph>
    </Section>

    <Section id="garanti" title="8. Garanti Reddi ve Sorumluluk Sınırı">
      <Paragraph>
        Platform “olduğu gibi” sunulur. Kesintisiz, hatasız veya veri kaybı olmadan çalışacağına
        dair bir garanti verilmez. Beta olarak işaretlenen özellikler önceden haber verilmeksizin
        değişebilir veya kaldırılabilir.
      </Paragraph>
      <Paragraph>
        Yürürlükteki hukukun izin verdiği ölçüde; dolaylı, arızi veya sonuç niteliğindeki
        zararlardan, kâr kaybından ve veri kaybından sorumlu değiliz. Kullanıcıların paylaştığı
        içerik ve kodun doğruluğu, güvenliği ve uygunluğu bize ait değildir; çalıştırmadan önce
        kendiniz denetlemelisiniz.
      </Paragraph>
    </Section>

    <Section id="degisiklik" title="9. Değişiklikler ve Uygulanacak Hukuk">
      <Paragraph>
        Bu Şartlar’ı güncelleyebiliriz. Önemli değişiklikler Platform üzerinden duyurulur ve bu
        sayfadaki yürürlük tarihi güncellenir. Değişiklikten sonra Platform’u kullanmaya devam
        etmeniz yeni Şartlar’ı kabul ettiğiniz anlamına gelir.
      </Paragraph>
      <Paragraph>
        Bu Şartlar Türkiye Cumhuriyeti hukukuna tabidir. Uyuşmazlıklarda Türkiye Cumhuriyeti
        mahkemeleri ve icra daireleri yetkilidir. Tüketici mevzuatından doğan haklarınız saklıdır.
      </Paragraph>
    </Section>

    <Section id="iletisim" title="10. İletişim">
      <Paragraph>
        Sorularınız için: <span className="font-mono text-zinc-300">{CONTACT_EMAIL}</span>
      </Paragraph>
    </Section>
  </>
);

const TermsEn: React.FC = () => (
  <>
    <Section id="acceptance" title="1. Acceptance">
      <Paragraph>
        By accessing Code4Ever (the “Platform”), creating an account or using the API, you agree
        to these Terms of Service. If you do not agree, do not use the Platform.
      </Paragraph>
    </Section>

    <Section id="account" title="2. Accounts and Eligibility">
      <List
        items={[
          'You must be at least 13 years old; under 18 you act with the consent of a parent or guardian.',
          'You are responsible for the accuracy of your information and the security of your account.',
          'Never share your password, session tokens or API keys. Activity from your account is your responsibility.',
          'Reserved system usernames (admin, moderator, support and similar) may not be claimed, and you may not impersonate another person or organisation.',
          'One account per person. Use a community API key for automation rather than a second account.'
        ]}
      />
    </Section>

    <Section id="content" title="3. Your Content and Rights">
      <Paragraph>
        You keep ownership of the posts, code, images and comments you publish. By uploading
        them you grant us a worldwide, royalty-free, transferable licence to host, reproduce,
        display and distribute that content solely to operate, back up and promote the Platform.
      </Paragraph>
      <Paragraph>
        Deleting your content ends the licence, but you accept that copies may persist in
        backups and caches for a reasonable period and that we cannot recall quotes or
        screenshots taken by other users.
      </Paragraph>
    </Section>

    <Section id="prohibited" title="4. Prohibited Use">
      <List
        items={[
          'Illegal content, hate speech, harassment, threats, glorification of violence and discrimination.',
          'Any content that exploits children.',
          'Malware, phishing pages, unauthorised access tooling, or exploit code intended to harm others.',
          'Publishing another person’s personal data, credentials, passwords or API keys without consent.',
          'Spam, bulk unsolicited messages, fake engagement and automated advertising.',
          'Impersonating a person, organisation or Platform staff.',
          'Circumventing security measures or rate limits, or overloading the infrastructure.',
          'Bulk scraping or republishing Platform data without permission.'
        ]}
      />
    </Section>

    <Section id="api-use" title="5. API Use">
      <List
        items={[
          'Community API keys may only be used for communities you are authorised for.',
          'Keys must be kept secret; revoke a leaked key immediately.',
          'Respect published rate limits and back off exponentially on a 429 response.',
          'Content published through the API is subject to these Terms; the key holder is responsible for it.',
          'We may revoke a key without prior notice in case of abuse.'
        ]}
      />
      <Notice>
        See the{' '}
        <a href="/dev/docs" className="text-blue-400 hover:text-blue-300">
          developer documentation
        </a>{' '}
        for technical details and limits.
      </Notice>
    </Section>

    <Section id="moderation" title="6. Moderation and Termination">
      <Paragraph>
        We may remove content, suspend an account temporarily, or close it permanently for
        violations of these Terms. Serious violations (illegal content, security attacks) may be
        actioned without prior warning. To appeal, write to {CONTACT_EMAIL}. You may close your
        account at any time from settings.
      </Paragraph>
    </Section>

    <Section id="payments" title="7. Supporter Tiers and Payments">
      <Paragraph>
        Optional contributions such as Spark supporter status unlock interface features (custom
        themes, higher character limits). Payments are processed by third-party providers; your
        card details never reach us. Because digital features are delivered immediately, a
        supporter period that has begun is non-refundable. Contact {CONTACT_EMAIL} about
        incorrect charges.
      </Paragraph>
    </Section>

    <Section id="warranty" title="8. Disclaimer and Limitation of Liability">
      <Paragraph>
        The Platform is provided “as is”, with no warranty of uninterrupted, error-free or
        loss-free operation. Features marked beta may change or be removed without notice.
      </Paragraph>
      <Paragraph>
        To the extent permitted by law we are not liable for indirect, incidental or
        consequential damages, lost profits or lost data. We do not vouch for the accuracy or
        safety of user-published code — review it yourself before running it.
      </Paragraph>
    </Section>

    <Section id="changes" title="9. Changes and Governing Law">
      <Paragraph>
        We may update these Terms. Material changes are announced on the Platform and the
        effective date on this page is updated. Continued use after a change means acceptance.
        These Terms are governed by the laws of the Republic of Türkiye; the courts of Türkiye
        have jurisdiction. Your statutory consumer rights are unaffected.
      </Paragraph>
    </Section>

    <Section id="contact" title="10. Contact">
      <Paragraph>
        Questions: <span className="font-mono text-zinc-300">{CONTACT_EMAIL}</span>
      </Paragraph>
    </Section>
  </>
);

// -------------------------------------------------------------
// PRIVACY POLICY
// -------------------------------------------------------------

const PrivacyTr: React.FC = () => (
  <>
    <Section id="ozet" title="1. Kısa Özet">
      <List
        items={[
          'Hesabınız için e-posta, kullanıcı adı ve profil bilgilerinizi işleriz.',
          'Verilerinizi satmıyoruz ve reklam amaçlı üçüncü taraflarla paylaşmıyoruz.',
          'Reklam veya takip amaçlı üçüncü taraf çerezi kullanmıyoruz.',
          'Tema tercihi gibi ayarlar cihazınızda yerel olarak saklanır.',
          'Verilerinizi dışa aktarabilir ve hesabınızı silebilirsiniz.'
        ]}
      />
    </Section>

    <Section id="toplanan" title="2. İşlenen Veriler">
      <Paragraph>
        <span className="font-semibold text-zinc-200">Hesap verileri:</span> e-posta adresi,
        kullanıcı adı, görünen ad, profil ve kapak görseli, biyografi, bağlantılar ve rol
        bilgisi.
      </Paragraph>
      <Paragraph>
        <span className="font-semibold text-zinc-200">İçerik verileri:</span> gönderileriniz,
        kod parçacıklarınız, yorumlarınız, beğenileriniz, yer imleriniz, topluluk üyelikleriniz,
        iş ilanı ve başvurularınız, mesajlarınız.
      </Paragraph>
      <Paragraph>
        <span className="font-semibold text-zinc-200">Teknik veriler:</span> IP adresi, tarayıcı
        ve cihaz bilgisi, oturum kayıtları ve hata raporları. IP adresi yalnızca güvenlik ve hız
        sınırlama amacıyla, sınırlı süre tutulur.
      </Paragraph>
      <Paragraph>
        <span className="font-semibold text-zinc-200">Bağlı hesaplar:</span> GitHub bağlantısı
        kurarsanız genel profil bilgileriniz ve seçtiğiniz depolar.
      </Paragraph>
      <Paragraph>
        <span className="font-semibold text-zinc-200">Ödeme:</span> destekçilik ödemelerinde
        yalnızca işlem kimliği ve durumu tutulur. Kart numarası, CVV veya banka bilgisi bize
        ulaşmaz.
      </Paragraph>
    </Section>

    <Section id="amac" title="3. İşleme Amacı ve Hukuki Sebep">
      <List
        items={[
          'Hizmeti sunmak ve hesabınızı yönetmek — sözleşmenin ifası.',
          'Güvenliği sağlamak, kötüye kullanımı ve spam’i engellemek — meşru menfaat.',
          'Yasal yükümlülüklere uymak — hukuki yükümlülük.',
          'Bildirim göndermek ve tercihlerinizi hatırlamak — açık rızanız veya meşru menfaat.'
        ]}
      />
    </Section>

    <Section id="paylasim" title="4. Paylaşım">
      <Paragraph>
        Verilerinizi satmayız. Yalnızca hizmeti çalıştırmak için gereken hizmet sağlayıcılarla
        paylaşırız:
      </Paragraph>
      <List
        items={[
          'Supabase — veritabanı, kimlik doğrulama ve dosya depolama.',
          'GitHub — yalnızca siz bağlamayı seçerseniz.',
          'Ödeme sağlayıcısı — yalnızca destekçilik işlemlerinde.',
          'Barındırma sağlayıcısı — uygulamanın çalıştırılması.'
        ]}
      />
      <Paragraph>
        Ayrıca yasal bir talep, mahkeme kararı veya hayati bir güvenlik tehdidi söz konusu
        olduğunda gerekli asgari veriyi paylaşabiliriz.
      </Paragraph>
    </Section>

    <Section id="gizlilik-icerik" title="5. İçeriğinizin Görünürlüğü">
      <Paragraph>
        Gönderileriniz, profiliniz ve herkese açık topluluklardaki paylaşımlarınız internete
        açıktır ve arama motorlarınca dizinlenebilir. Gizli topluluklardaki gönderiler yalnızca o
        topluluğun üyelerince görülebilir; bu kural hem arayüzde hem veritabanı kurallarında
        uygulanır.
      </Paragraph>
      <Notice>
        <span className="font-bold text-zinc-200">Mesajlar hakkında önemli uyarı:</span> Doğrudan
        mesajlar taşıma sırasında şifrelenir ve veritabanı kuralları yalnızca konuşmanın
        taraflarına okuma izni verir. Ancak mesajlaşma şu an <span className="font-semibold">uçtan
        uca şifreli değildir</span>; sunucu tarafında teknik olarak erişilebilir durumdadır.
        Kritik sırlarınızı, parolalarınızı veya anahtarlarınızı mesaj olarak göndermeyin.
      </Notice>
    </Section>

    <Section id="cerez" title="6. Çerezler ve Yerel Depolama">
      <Paragraph>
        Reklam ve izleme çerezi kullanmıyoruz. Tarayıcınızın yerel depolamasını yalnızca şu
        amaçlarla kullanırız: oturumunuzu açık tutmak, dil ve tema tercihinizi hatırlamak,
        arayüz durumunu (açık sekme, kapatılan şerit) korumak ve çevrimdışı önbellek.
      </Paragraph>
    </Section>

    <Section id="sure" title="7. Saklama Süresi">
      <List
        items={[
          'Hesap ve içerik verileri: hesabınız açık olduğu sürece.',
          'Sildiğiniz içerik: yedeklerden temizlenene kadar en çok 30 gün.',
          'Hesap silme talebi: 30 gün içinde kalıcı silme.',
          'Güvenlik ve hız sınırlama kayıtları: en çok 90 gün.',
          'Yasal saklama yükümlülüğü bulunan kayıtlar (ör. ödeme): mevzuatın öngördüğü süre.'
        ]}
      />
    </Section>

    <Section id="haklar" title="8. Haklarınız (KVKK m.11 / GDPR)">
      <List
        items={[
          'Kişisel verilerinizin işlenip işlenmediğini öğrenme ve bilgi talep etme.',
          'Verilerinize erişme ve taşınabilir bir kopyasını isteme.',
          'Yanlış veya eksik verilerin düzeltilmesini isteme.',
          'Silinmesini veya yok edilmesini isteme.',
          'İşlemeye itiraz etme ve rızanızı geri çekme.',
          'Kanuna aykırı işleme nedeniyle zarara uğramanız hâlinde zararın giderilmesini talep etme.'
        ]}
      />
      <Paragraph>
        Talepleriniz için {CONTACT_EMAIL} adresine yazın. Başvurunuza en geç 30 gün içinde yanıt
        veririz. Türkiye’de Kişisel Verileri Koruma Kurulu’na, AB’de yerel veri koruma
        otoritesine şikâyet hakkınız saklıdır.
      </Paragraph>
    </Section>

    <Section id="guvenlik" title="9. Güvenlik">
      <List
        items={[
          'Tüm trafik HTTPS üzerinden taşınır.',
          'Veritabanında satır seviyesi güvenlik (RLS) kuralları uygulanır; her kayıt yalnızca yetkili kullanıcıya açılır.',
          'API anahtarları düz metin olarak değil, yalnızca SHA-256 özeti olarak saklanır.',
          'Yetki yükseltme girişimleri veritabanı tetikleyicileriyle engellenir.',
          'Sunucu istekleri SSRF korumalı; hız sınırlama tüm uçlarda etkindir.'
        ]}
      />
      <Paragraph>
        Hiçbir sistem tamamen güvenli değildir. Bir güvenlik açığı bulursanız lütfen
        {' '}{CONTACT_EMAIL} adresine bildirin; açığı kamuya duyurmadan önce düzeltmemiz için
        makul süre tanımanızı rica ederiz.
      </Paragraph>
    </Section>

    <Section id="cocuk" title="10. Çocukların Gizliliği">
      <Paragraph>
        Platform 13 yaş altındaki çocuklara yönelik değildir ve bilerek bu yaş grubundan veri
        toplamayız. Böyle bir kaydı öğrenirsek hesabı kapatır ve verileri sileriz.
      </Paragraph>
    </Section>

    <Section id="degisiklik-gizlilik" title="11. Değişiklikler">
      <Paragraph>
        Bu ilkeleri güncelleyebiliriz. Önemli değişiklikleri Platform üzerinden duyurur ve
        yürürlük tarihini güncelleriz.
      </Paragraph>
    </Section>
  </>
);

const PrivacyEn: React.FC = () => (
  <>
    <Section id="summary" title="1. Summary">
      <List
        items={[
          'We process your email, username and profile information for your account.',
          'We do not sell your data or share it with advertisers.',
          'We use no third-party advertising or tracking cookies.',
          'Preferences such as your theme are stored locally on your device.',
          'You can export your data and delete your account.'
        ]}
      />
    </Section>

    <Section id="collected" title="2. Data We Process">
      <Paragraph>
        <span className="font-semibold text-zinc-200">Account data:</span> email address,
        username, display name, avatar and banner, bio, links and role.
      </Paragraph>
      <Paragraph>
        <span className="font-semibold text-zinc-200">Content data:</span> posts, snippets,
        comments, likes, bookmarks, community memberships, job listings and applications,
        messages.
      </Paragraph>
      <Paragraph>
        <span className="font-semibold text-zinc-200">Technical data:</span> IP address, browser
        and device information, session records and error reports. IP addresses are retained
        briefly and only for security and rate limiting.
      </Paragraph>
      <Paragraph>
        <span className="font-semibold text-zinc-200">Payments:</span> only a transaction id and
        status. Card numbers, CVV and bank details never reach us.
      </Paragraph>
    </Section>

    <Section id="purpose" title="3. Purpose and Legal Basis">
      <List
        items={[
          'Providing the service and managing your account — performance of a contract.',
          'Security, abuse and spam prevention — legitimate interest.',
          'Meeting legal obligations — legal obligation.',
          'Sending notifications and remembering preferences — consent or legitimate interest.'
        ]}
      />
    </Section>

    <Section id="sharing" title="4. Sharing">
      <Paragraph>
        We never sell your data. We share it only with the providers needed to run the service:
        Supabase (database, authentication, storage), GitHub (only if you connect it), the
        payment provider (supporter transactions only) and the hosting provider. We may also
        disclose the minimum necessary data in response to a lawful request or a threat to life.
      </Paragraph>
    </Section>

    <Section id="visibility" title="5. Visibility of Your Content">
      <Paragraph>
        Your posts, profile and contributions to public communities are visible on the open
        internet and may be indexed by search engines. Posts in private communities are visible
        only to members — enforced both in the interface and by database policies.
      </Paragraph>
      <Notice>
        <span className="font-bold text-zinc-200">Important note about messages:</span> direct
        messages are encrypted in transit and database policies restrict reads to the
        conversation participants. However, messaging is{' '}
        <span className="font-semibold">not end-to-end encrypted</span> today and is technically
        accessible server-side. Do not send passwords, secrets or keys as messages.
      </Notice>
    </Section>

    <Section id="cookies" title="6. Cookies and Local Storage">
      <Paragraph>
        No advertising or tracking cookies. Browser storage is used only to keep you signed in,
        remember your language and theme, preserve interface state and cache for offline use.
      </Paragraph>
    </Section>

    <Section id="retention" title="7. Retention">
      <List
        items={[
          'Account and content data: while your account is open.',
          'Deleted content: up to 30 days until purged from backups.',
          'Account deletion request: permanent deletion within 30 days.',
          'Security and rate-limit records: up to 90 days.',
          'Records with a statutory retention duty (e.g. payments): as required by law.'
        ]}
      />
    </Section>

    <Section id="rights" title="8. Your Rights (GDPR / KVKK art. 11)">
      <List
        items={[
          'Know whether your data is processed and request information about it.',
          'Access your data and receive a portable copy.',
          'Have inaccurate or incomplete data corrected.',
          'Request erasure.',
          'Object to processing and withdraw consent.',
          'Seek compensation for damage caused by unlawful processing.'
        ]}
      />
      <Paragraph>
        Write to {CONTACT_EMAIL}. We respond within 30 days. You may also complain to your local
        data protection authority, or to the Turkish Personal Data Protection Board.
      </Paragraph>
    </Section>

    <Section id="security" title="9. Security">
      <List
        items={[
          'All traffic travels over HTTPS.',
          'Row Level Security policies gate every database row to the authorised user.',
          'API keys are stored only as SHA-256 hashes, never as plaintext.',
          'Privilege-escalation attempts are blocked by database triggers.',
          'Outbound server requests are SSRF-protected; rate limiting is active on every endpoint.'
        ]}
      />
      <Paragraph>
        No system is perfectly secure. If you find a vulnerability, please report it to{' '}
        {CONTACT_EMAIL} and allow us reasonable time to fix it before public disclosure.
      </Paragraph>
    </Section>

    <Section id="children" title="10. Children’s Privacy">
      <Paragraph>
        The Platform is not directed at children under 13 and we do not knowingly collect their
        data. If we learn of such an account we close it and delete the data.
      </Paragraph>
    </Section>

    <Section id="privacy-changes" title="11. Changes">
      <Paragraph>
        We may update this policy. Material changes are announced on the Platform and the
        effective date is updated.
      </Paragraph>
    </Section>
  </>
);

export const LegalView: React.FC<LegalViewProps> = ({ language, page }) => {
  const tr = language === 'tr';
  const isTos = page === 'tos';

  const navTos = tr
    ? [
        { id: 'kabul', label: 'Kabul' },
        { id: 'hesap', label: 'Hesap' },
        { id: 'icerik', label: 'İçerik ve haklar' },
        { id: 'yasak', label: 'Yasak kullanımlar' },
        { id: 'api', label: 'API kullanımı' },
        { id: 'moderasyon', label: 'Moderasyon' },
        { id: 'odeme', label: 'Ödemeler' },
        { id: 'garanti', label: 'Sorumluluk' },
        { id: 'degisiklik', label: 'Değişiklikler' },
        { id: 'iletisim', label: 'İletişim' }
      ]
    : [
        { id: 'acceptance', label: 'Acceptance' },
        { id: 'account', label: 'Accounts' },
        { id: 'content', label: 'Content' },
        { id: 'prohibited', label: 'Prohibited use' },
        { id: 'api-use', label: 'API use' },
        { id: 'moderation', label: 'Moderation' },
        { id: 'payments', label: 'Payments' },
        { id: 'warranty', label: 'Liability' },
        { id: 'changes', label: 'Changes' },
        { id: 'contact', label: 'Contact' }
      ];

  const navPrivacy = tr
    ? [
        { id: 'ozet', label: 'Özet' },
        { id: 'toplanan', label: 'İşlenen veriler' },
        { id: 'amac', label: 'Amaç' },
        { id: 'paylasim', label: 'Paylaşım' },
        { id: 'gizlilik-icerik', label: 'Görünürlük' },
        { id: 'cerez', label: 'Çerezler' },
        { id: 'sure', label: 'Saklama' },
        { id: 'haklar', label: 'Haklarınız' },
        { id: 'guvenlik', label: 'Güvenlik' },
        { id: 'cocuk', label: 'Çocuklar' },
        { id: 'degisiklik-gizlilik', label: 'Değişiklikler' }
      ]
    : [
        { id: 'summary', label: 'Summary' },
        { id: 'collected', label: 'Data processed' },
        { id: 'purpose', label: 'Purpose' },
        { id: 'sharing', label: 'Sharing' },
        { id: 'visibility', label: 'Visibility' },
        { id: 'cookies', label: 'Cookies' },
        { id: 'retention', label: 'Retention' },
        { id: 'rights', label: 'Your rights' },
        { id: 'security', label: 'Security' },
        { id: 'children', label: 'Children' },
        { id: 'privacy-changes', label: 'Changes' }
      ];

  return (
    <PublicPageShell
      language={language}
      eyebrow={`${tr ? 'Yürürlük' : 'Effective'} ${EFFECTIVE_DATE}`}
      title={
        isTos
          ? tr ? 'Kullanım Şartları' : 'Terms of Service'
          : tr ? 'Gizlilik İlkeleri' : 'Privacy Policy'
      }
      subtitle={
        isTos
          ? tr
            ? 'Code4Ever’i kullanırken geçerli olan kurallar, hak ve yükümlülükler.'
            : 'The rules, rights and obligations that apply when you use Code4Ever.'
          : tr
          ? 'Hangi verileri neden işlediğimiz, kiminle paylaştığımız ve sizin haklarınız.'
          : 'What data we process and why, who we share it with, and what your rights are.'
      }
      nav={isTos ? navTos : navPrivacy}
    >
      {isTos ? (tr ? <TermsTr /> : <TermsEn />) : tr ? <PrivacyTr /> : <PrivacyEn />}

      <Notice>
        {tr
          ? 'Bu metin genel bilgilendirme amaçlıdır ve hukuki danışmanlık yerine geçmez. Ticari bir dağıtımda kendi hukuk danışmanınıza gözden geçirtmeniz önerilir.'
          : 'This text is general information and is not legal advice. For a commercial deployment, have your own counsel review it.'}
      </Notice>
    </PublicPageShell>
  );
};
