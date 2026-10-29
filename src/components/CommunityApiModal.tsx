import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Code2,
  Copy,
  Check,
  Send,
  Terminal,
  Key,
  Globe,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Plus,
  Trash2,
  ShieldAlert
} from 'lucide-react';
import { Community, UserProfile } from '../types';
import { apiFetchJson } from '../services/apiClient';

interface CommunityApiModalProps {
  isOpen: boolean;
  community: Community | null;
  currentUser?: UserProfile;
  language: 'tr' | 'en';
  canManage?: boolean;
  onClose: () => void;
  onPostPublished?: () => void;
}

interface ApiKeySummary {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  created_at: string;
  created_by_username: string | null;
  last_used_at: string | null;
  request_count: number;
  revoked_at: string | null;
}

const CODE_LANGUAGES = [
  'typescript', 'javascript', 'python', 'rust', 'go', 'sql',
  'html', 'css', 'csharp', 'cpp', 'java', 'bash', 'yaml', 'json'
];

/**
 * The API answers auth failures with a machine code in `error` and the readable sentence in
 * `message`, and its own errors with the sentence in `error`. Show a sentence either way,
 * never a bare code like "auth_unavailable".
 */
function errorText(data: { error?: string; message?: string } | null, fallback: string): string {
  if (data?.message) return data.message;
  if (data?.error && /\s/.test(data.error)) return data.error;
  return fallback;
}

export const CommunityApiModal: React.FC<CommunityApiModalProps> = ({
  isOpen,
  community,
  currentUser,
  language,
  canManage = false,
  onClose,
  onPostPublished
}) => {
  const [activeTab, setActiveTab] = useState<'docs' | 'playground' | 'keys'>('docs');
  const [copied, setCopied] = useState<string | null>(null);

  // Key management
  const [keys, setKeys] = useState<ApiKeySummary[]>([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [keysError, setKeysError] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState('');
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  /** Shown exactly once, right after creation — the server never returns it again. */
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Playground
  const [testKey, setTestKey] = useState('');
  const [testContent, setTestContent] = useState('Topluluk API testi: bu gönderi HTTP isteğiyle yayınlandı.');
  const [testCode, setTestCode] = useState(
    `export async function handleRequest(req, res) {\n  const data = await fetchCommunityData();\n  res.json({ success: true, count: data.length });\n}`
  );
  const [testLanguage, setTestLanguage] = useState('typescript');
  const [testAuthorName, setTestAuthorName] = useState(currentUser?.display_name || 'API Bot');
  const [isSending, setIsSending] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; url?: string } | null>(null);

  const tr = language === 'tr';
  const commHandle = (community?.handle || '').replace(/^@/, '');
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://app.lanux.online';
  const endpointUrl = `${baseUrl}/api/v1/communities/@${commHandle}/posts`;
  const keysUrl = `/api/v1/communities/@${commHandle}/keys`;

  const loadKeys = useCallback(async () => {
    if (!commHandle || !canManage) return;
    setKeysLoading(true);
    setKeysError(null);
    const { ok, data } = await apiFetchJson<{ keys: ApiKeySummary[]; error?: string; message?: string }>(keysUrl);
    if (ok && data?.keys) {
      setKeys(data.keys);
    } else {
      setKeysError(errorText(data, tr ? 'Anahtarlar yüklenemedi.' : 'Could not load keys.'));
    }
    setKeysLoading(false);
  }, [commHandle, canManage, keysUrl, tr]);

  useEffect(() => {
    if (isOpen && activeTab === 'keys') void loadKeys();
  }, [isOpen, activeTab, loadKeys]);

  // Reset per-community state so a key from one community never leaks into another's view.
  useEffect(() => {
    setFreshKey(null);
    setKeys([]);
    setTestResult(null);
    setKeysError(null);
  }, [community?.id]);

  if (!isOpen || !community) return null;

  const handleCopy = (text: string, token: string) => {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(token);
        setTimeout(() => setCopied(null), 2000);
      },
      () => undefined
    );
  };

  const handleCreateKey = async () => {
    setIsCreatingKey(true);
    setKeysError(null);
    setFreshKey(null);

    const { ok, data } = await apiFetchJson<{ api_key?: string; error?: string; message?: string }>(keysUrl, {
      method: 'POST',
      json: { name: newKeyName.trim() || 'default' }
    });

    if (ok && data?.api_key) {
      setFreshKey(data.api_key);
      setTestKey(data.api_key);
      setNewKeyName('');
      await loadKeys();
    } else {
      setKeysError(errorText(data, tr ? 'Anahtar oluşturulamadı.' : 'Could not create the key.'));
    }
    setIsCreatingKey(false);
  };

  const handleRevokeKey = async (keyId: string) => {
    setRevokingId(keyId);
    setKeysError(null);
    const { ok, data } = await apiFetchJson<{ error?: string; message?: string }>(`${keysUrl}/${keyId}`, {
      method: 'DELETE'
    });
    if (ok) {
      await loadKeys();
    } else {
      setKeysError(errorText(data, tr ? 'Anahtar iptal edilemedi.' : 'Could not revoke the key.'));
    }
    setRevokingId(null);
  };

  const handleSendTestRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testKey.trim()) {
      setTestResult({
        success: false,
        message: tr ? 'Önce bir API anahtarı girin veya oluşturun.' : 'Enter or create an API key first.'
      });
      return;
    }

    setIsSending(true);
    setTestResult(null);

    try {
      // Sent without a session token on purpose: this is the exact request an external
      // client makes, so the playground exercises the real API key path.
      const res = await fetch(endpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': testKey.trim() },
        body: JSON.stringify({
          content: testContent,
          code_snippet: testCode,
          code_language: testLanguage,
          author_name: testAuthorName,
          author_username: currentUser?.username
        })
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data?.success) {
        setTestResult({
          success: true,
          message: data.message || (tr ? 'Gönderi yayınlandı.' : 'Post published.'),
          url: data.post?.url
        });
        onPostPublished?.();
      } else {
        setTestResult({
          success: false,
          message: errorText(data, `HTTP ${res.status}`)
        });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err?.message || (tr ? 'Ağ hatası.' : 'Network error.') });
    } finally {
      setIsSending(false);
    }
  };

  const sampleKey = testKey.trim() || 'lnx_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

  const curlExample = `curl -X POST "${endpointUrl}" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${sampleKey}" \\
  -d '{
    "content": "Performansli debounce hook",
    "code_snippet": "export const useDebounce = (v, ms) => { /* ... */ };",
    "code_language": "typescript",
    "author_name": "${testAuthorName || 'API Bot'}"
  }'`;

  const jsExample = `const res = await fetch('${endpointUrl}', {
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

  const pythonExample = `import os, requests

res = requests.post(
    "${endpointUrl}",
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

  const CopyButton: React.FC<{ text: string; token: string }> = ({ text, token }) => (
    <button
      type="button"
      onClick={() => handleCopy(text, token)}
      className="flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] text-zinc-400 transition-colors hover:bg-white/[0.09] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {copied === token ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
      <span>{copied === token ? (tr ? 'Kopyalandı' : 'Copied') : (tr ? 'Kopyala' : 'Copy')}</span>
    </button>
  );

  const Snippet: React.FC<{ title: string; icon: React.ReactNode; code: string; token: string }> = ({
    title,
    icon,
    code,
    token
  }) => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-bold text-zinc-300">
          {icon}
          <span>{title}</span>
        </span>
        <CopyButton text={code} token={token} />
      </div>
      <pre className="overflow-x-auto rounded-xl border border-white/[0.07] bg-black/25 p-3 text-[11px] leading-relaxed text-zinc-300">
        {code}
      </pre>
    </div>
  );

  const tabs: Array<{ id: typeof activeTab; label: string; icon: React.ReactNode }> = [
    { id: 'docs', label: tr ? 'Dokümantasyon' : 'Docs', icon: <Terminal className="h-3.5 w-3.5" /> },
    { id: 'playground', label: tr ? 'Canlı test' : 'Playground', icon: <Send className="h-3.5 w-3.5" /> },
    { id: 'keys', label: tr ? 'Anahtarlar' : 'Keys', icon: <Key className="h-3.5 w-3.5" /> }
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="c4e-sheet flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] bg-black/25 p-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-amber-800/40 bg-amber-950/40">
              <Code2 className="h-5 w-5 text-amber-400" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-bold text-white">
                {tr ? 'Topluluk Paylaşım API' : 'Community Publishing API'}
              </h3>
              <p className="truncate font-mono text-xs text-zinc-400">
                {community.name} ({community.handle})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label={tr ? 'Kapat' : 'Close'}
            className="flex-shrink-0 rounded-xl p-2 text-zinc-400 transition-colors hover:bg-white/[0.09] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-white/[0.07] px-4 pt-3">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 rounded-t-xl border-b-2 px-3 py-2 text-xs font-semibold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                activeTab === tab.id
                  ? 'border-blue-500 bg-white/[0.04] text-white'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* ---------------- DOCS ---------------- */}
          {activeTab === 'docs' && (
            <div className="space-y-4">
              <div className="c4e-well space-y-2 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    Endpoint
                  </span>
                  <CopyButton text={endpointUrl} token="url" />
                </div>
                <div className="flex select-all items-center gap-2 overflow-x-auto rounded-lg bg-black p-2.5 font-mono text-xs text-emerald-400">
                  <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
                    POST
                  </span>
                  <span>{endpointUrl}</span>
                </div>
              </div>

              <Snippet
                title="cURL"
                icon={<Terminal className="h-3.5 w-3.5 text-amber-400" />}
                code={curlExample}
                token="curl"
              />
              <Snippet
                title="JavaScript / TypeScript"
                icon={<Globe className="h-3.5 w-3.5 text-blue-400" />}
                code={jsExample}
                token="js"
              />
              <Snippet
                title="Python 3"
                icon={<Code2 className="h-3.5 w-3.5 text-emerald-400" />}
                code={pythonExample}
                token="py"
              />

              <a
                href="/dev/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="c4e-ghost flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-zinc-300 hover:text-white"
              >
                <span>{tr ? 'Tam dokümantasyon' : 'Full documentation'}</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          )}

          {/* ---------------- PLAYGROUND ---------------- */}
          {activeTab === 'playground' && (
            <form onSubmit={handleSendTestRequest} className="space-y-4">
              <p className="text-[11px] leading-relaxed text-zinc-500">
                {tr
                  ? 'Bu form gerçek bir HTTP isteği gönderir ve başarılı olursa topluluk akışına gerçek bir gönderi düşer.'
                  : 'This form sends a real HTTP request; on success a real post lands in the community feed.'}
              </p>

              <div className="space-y-1">
                <label htmlFor="api-test-key" className="text-xs font-bold text-zinc-300">
                  {tr ? 'API Anahtarı' : 'API Key'}
                </label>
                <input
                  id="api-test-key"
                  type="password"
                  autoComplete="off"
                  value={testKey}
                  onChange={(e) => setTestKey(e.target.value)}
                  placeholder="lnx_live_..."
                  className="c4e-input w-full px-3.5 py-2 font-mono text-xs text-white placeholder-zinc-600 focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="api-test-content" className="text-xs font-bold text-zinc-300">
                  {tr ? 'Gönderi açıklaması' : 'Post description'}
                </label>
                <input
                  id="api-test-content"
                  type="text"
                  value={testContent}
                  onChange={(e) => setTestContent(e.target.value)}
                  maxLength={2000}
                  className="c4e-input w-full px-3.5 py-2 text-xs text-white placeholder-zinc-600 focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor="api-test-lang" className="text-xs font-bold text-zinc-300">
                    {tr ? 'Kodlama dili' : 'Code language'}
                  </label>
                  <select
                    id="api-test-lang"
                    value={testLanguage}
                    onChange={(e) => setTestLanguage(e.target.value)}
                    className="c4e-input w-full px-3 py-2 text-xs text-white focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {CODE_LANGUAGES.map((lang) => (
                      <option key={lang} value={lang}>
                        {lang}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="api-test-author" className="text-xs font-bold text-zinc-300">
                    {tr ? 'Görünen isim' : 'Author name'}
                  </label>
                  <input
                    id="api-test-author"
                    type="text"
                    value={testAuthorName}
                    onChange={(e) => setTestAuthorName(e.target.value)}
                    maxLength={60}
                    className="c4e-input w-full px-3.5 py-2 text-xs text-white focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="api-test-code" className="text-xs font-bold text-zinc-300">
                  {tr ? 'Kod parçacığı' : 'Code snippet'}
                </label>
                <textarea
                  id="api-test-code"
                  value={testCode}
                  onChange={(e) => setTestCode(e.target.value)}
                  rows={6}
                  maxLength={10000}
                  className="c4e-input w-full resize-none p-3 font-mono text-xs leading-relaxed text-emerald-400 focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              <button
                type="submit"
                disabled={isSending}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-100 py-2.5 text-xs font-bold text-zinc-950 transition-all hover:bg-white active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {isSending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{tr ? 'Gönderiliyor...' : 'Sending...'}</span>
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    <span>{tr ? 'İsteği Gönder' : 'Send Request'}</span>
                  </>
                )}
              </button>

              {testResult && (
                <div
                  className={`flex items-start gap-2.5 rounded-xl border p-3 text-xs leading-relaxed ${
                    testResult.success
                      ? 'border-emerald-700/40 bg-emerald-950/30 text-emerald-300'
                      : 'border-red-700/40 bg-red-950/30 text-red-300'
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" />
                  ) : (
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
                  )}
                  <div className="min-w-0 space-y-1">
                    <p className="user-text">{testResult.message}</p>
                    {testResult.url && (
                      <a
                        href={testResult.url}
                        className="user-text inline-flex items-center gap-1 font-mono text-[11px] underline"
                      >
                        {testResult.url}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </form>
          )}

          {/* ---------------- KEYS ---------------- */}
          {activeTab === 'keys' && (
            <div className="space-y-4">
              {!canManage ? (
                <div className="c4e-card flex items-start gap-2.5 p-3.5 text-xs leading-relaxed text-zinc-400">
                  <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-zinc-500" />
                  <span>
                    {tr
                      ? 'API anahtarlarını yalnızca topluluğun kurucusu yönetebilir. Anahtar almak için topluluk kurucusuyla iletişime geçin.'
                      : 'Only the community founder can manage API keys. Contact the founder to obtain one.'}
                  </span>
                </div>
              ) : (
                <>
                  {freshKey && (
                    <div className="space-y-2 rounded-xl border border-emerald-700/40 bg-emerald-950/25 p-3.5">
                      <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        <span>{tr ? 'Anahtar oluşturuldu' : 'Key created'}</span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-emerald-200/80">
                        {tr
                          ? 'Bu anahtar bir daha gösterilmeyecek. Şimdi kopyalayın ve sunucu tarafında bir ortam değişkeninde saklayın.'
                          : 'This key will not be shown again. Copy it now and store it in a server-side environment variable.'}
                      </p>
                      <div className="flex items-center gap-2">
                        <input
                          readOnly
                          value={freshKey}
                          aria-label={tr ? 'Yeni API anahtarı' : 'New API key'}
                          className="min-w-0 flex-1 select-all rounded-xl border border-emerald-800/50 bg-black px-3 py-2 font-mono text-[11px] text-emerald-300"
                        />
                        <CopyButton text={freshKey} token="fresh" />
                      </div>
                    </div>
                  )}

                  <div className="c4e-well space-y-2 p-3.5">
                    <label htmlFor="new-key-name" className="text-xs font-bold text-white">
                      {tr ? 'Yeni anahtar' : 'New key'}
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        id="new-key-name"
                        type="text"
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                        maxLength={60}
                        placeholder={tr ? 'Etiket (ör. ci-bot)' : 'Label (e.g. ci-bot)'}
                        className="c4e-input min-w-0 flex-1 px-3 py-2 text-xs text-white placeholder-zinc-600 focus-visible:ring-2 focus-visible:ring-ring"
                      />
                      <button
                        type="button"
                        onClick={handleCreateKey}
                        disabled={isCreatingKey}
                        className="flex items-center gap-1.5 rounded-xl bg-zinc-100 px-3.5 py-2 text-xs font-bold text-zinc-950 transition-colors hover:bg-white disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {isCreatingKey ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" />
                        )}
                        <span>{tr ? 'Oluştur' : 'Create'}</span>
                      </button>
                    </div>
                  </div>

                  {keysError && (
                    <div className="flex items-start gap-2 rounded-xl border border-red-700/40 bg-red-950/30 p-3 text-xs text-red-300">
                      <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
                      <span className="user-text">{keysError}</span>
                    </div>
                  )}

                  {keysLoading ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-xs text-zinc-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{tr ? 'Yükleniyor...' : 'Loading...'}</span>
                    </div>
                  ) : keys.length === 0 ? (
                    <p className="py-6 text-center text-xs text-zinc-500">
                      {tr ? 'Henüz anahtar yok.' : 'No keys yet.'}
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {keys.map((key) => (
                        <li
                          key={key.id}
                          className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${
                            key.revoked_at
                              ? 'border-white/[0.07] bg-black/25 opacity-60'
                              : 'border-white/[0.07] bg-black/25'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-bold text-white">{key.name}</span>
                              {key.revoked_at ? (
                                <span className="rounded-full bg-white/[0.07] px-2 py-0.5 font-mono text-[10px] text-zinc-400">
                                  {tr ? 'iptal' : 'revoked'}
                                </span>
                              ) : (
                                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] text-emerald-400">
                                  {tr ? 'etkin' : 'active'}
                                </span>
                              )}
                            </div>
                            <p className="user-text mt-0.5 font-mono text-[11px] text-zinc-500">
                              {key.key_prefix}… · {key.request_count} {tr ? 'istek' : 'requests'}
                              {key.last_used_at
                                ? ` · ${tr ? 'son' : 'last'} ${new Date(key.last_used_at).toLocaleDateString(tr ? 'tr-TR' : 'en-US')}`
                                : ''}
                            </p>
                          </div>

                          {!key.revoked_at && (
                            <button
                              type="button"
                              onClick={() => handleRevokeKey(key.id)}
                              disabled={revokingId === key.id}
                              aria-label={tr ? 'Anahtarı iptal et' : 'Revoke key'}
                              className="flex h-9 items-center gap-1.5 rounded-xl border border-white/[0.07] px-3 text-[11px] font-semibold text-zinc-400 transition-colors hover:border-red-500/40 hover:text-red-400 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {revokingId === key.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                              <span>{tr ? 'İptal et' : 'Revoke'}</span>
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  <p className="text-[11px] leading-relaxed text-zinc-500">
                    {tr
                      ? 'Anahtarlar veritabanında yalnızca SHA-256 özeti olarak tutulur; düz metni yalnızca oluşturulduğu anda görebilirsiniz. Sızdığından şüphelendiğiniz anahtarı iptal edin.'
                      : 'Keys are stored only as SHA-256 hashes; the plaintext is visible only at creation. Revoke any key you suspect has leaked.'}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
