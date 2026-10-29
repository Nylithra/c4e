import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  DownloadCloud,
  Inbox,
  Loader2,
  Mail,
  Paperclip,
  Plug,
  RefreshCw,
  Search,
  Send,
  ServerCog,
  ShieldAlert,
  Sparkles,
  User as UserIcon
} from 'lucide-react';
import { apiFetchJson } from '../services/apiClient';
import { UserAvatar } from './ui/avatar';

interface MailStatus {
  smtp: { configured: boolean; host?: string; port?: number; secure?: boolean; from?: string };
  imap: {
    configured: boolean;
    host?: string;
    port?: number;
    secure?: boolean;
    user?: string;
    reason?: string | null;
    /** 'live' reads IMAP on every load; 'sync' reads the cache and refreshes on request. */
    mode?: 'live' | 'sync';
    note?: string | null;
  };
  /** True on Vercel/Lambda, where the inbox is served from the last sync. */
  serverless?: boolean;
}

interface SyncResult {
  syncedAt: string;
  messageCount: number;
  bodiesCached: number;
  truncated: boolean;
  durationMs: number;
  warning: string | null;
}

interface InboxMessage {
  uid: number;
  subject: string;
  fromName: string;
  fromAddress: string;
  to: string;
  date: string | null;
  seen: boolean;
  flagged: boolean;
  hasAttachments: boolean;
  preview: string;
}

interface MessageDetail extends InboxMessage {
  text: string;
  html: string;
  imagesBlocked: boolean;
  attachments: Array<{ filename: string; contentType: string; size: number }>;
}

interface ResolvedRecipient {
  username: string;
  displayName: string;
  email: string;
  source: 'profile' | 'auth';
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: '2-digit' });
}

/** Relative for anything recent, absolute once "3 hours ago" stops being useful. */
function formatSyncTime(iso: string, tr: boolean): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const minutes = Math.floor((Date.now() - d.getTime()) / 60000);
  if (minutes < 1) return tr ? 'az önce' : 'just now';
  if (minutes < 60) return tr ? `${minutes} dk önce` : `${minutes} min ago`;
  if (minutes < 240) {
    const hours = Math.floor(minutes / 60);
    return tr ? `${hours} sa önce` : `${hours} h ago`;
  }
  return d.toLocaleString(tr ? 'tr-TR' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function errorText(data: { error?: string; message?: string } | null, fallback: string): string {
  if (data?.message) return data.message;
  if (data?.error && /\s/.test(data.error)) return data.error;
  return fallback;
}

/** Masks an address for display so a shoulder-surfer does not read a member's e-mail. */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const head = local.slice(0, 2);
  return `${head}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`;
}

export const AdminMailSection: React.FC<{ language: 'tr' | 'en' }> = ({ language }) => {
  const tr = language === 'tr';
  const [pane, setPane] = useState<'inbox' | 'compose'>('inbox');

  // Connection
  const [status, setStatus] = useState<MailStatus | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ smtp: any; imap: any } | null>(null);

  // Inbox
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MessageDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showRemoteImages, setShowRemoteImages] = useState(false);
  const [filter, setFilter] = useState('');

  // Sync
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [storeWarning, setStoreWarning] = useState<string | null>(null);

  // Compose
  const [username, setUsername] = useState('');
  const [resolved, setResolved] = useState<ResolvedRecipient | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [rawTo, setRawTo] = useState('');
  const [useRawAddress, setUseRawAddress] = useState(false);
  const [subject, setSubject] = useState('');
  const [heading, setHeading] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [footnote, setFootnote] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    const { ok, data } = await apiFetchJson<MailStatus & { error?: string }>('/api/admin/mail/status');
    if (ok && data) setStatus({ smtp: data.smtp, imap: data.imap, serverless: data.serverless });
  }, []);

  /** Reads the stored copy. Never contacts the mail server — only `runSync` does that. */
  const loadInbox = useCallback(async () => {
    setInboxLoading(true);
    setInboxError(null);
    const { ok, data } = await apiFetchJson<{
      messages: InboxMessage[];
      lastSyncedAt?: string | null;
      warning?: string | null;
      error?: string;
      message?: string;
    }>('/api/admin/mail/inbox?limit=40');
    if (ok && data?.messages) {
      setMessages(data.messages);
      setLastSyncedAt(data.lastSyncedAt || null);
      setStoreWarning(data.warning || null);
    } else {
      setInboxError(errorText(data, tr ? 'Gelen kutusu okunamadı.' : 'Could not read the inbox.'));
    }
    setInboxLoading(false);
  }, [tr]);

  /**
   * The one action that reaches the mail server: pulls the mailbox in a single pass and
   * stores it, so every later view is instant and costs no IMAP connection.
   */
  const runSync = useCallback(async () => {
    setSyncing(true);
    setInboxError(null);
    setSyncNote(null);
    const { ok, data } = await apiFetchJson<SyncResult & { error?: string; message?: string }>(
      '/api/admin/mail/sync',
      // A sync downloads real message bodies, so it is allowed far longer than the 30s
      // default — otherwise the browser gives up on work the server is about to finish.
      { method: 'POST', json: { limit: 40 }, timeoutMs: 120000 }
    );

    if (ok && data) {
      setLastSyncedAt(data.syncedAt);
      setStoreWarning(data.warning || null);
      const seconds = Math.max(data.durationMs / 1000, 0.1).toFixed(1);
      setSyncNote(
        data.truncated
          ? tr
            ? `${data.messageCount} mesaj eşitlendi (${seconds} sn). ${data.bodiesCached} tanesinin içeriği indirildi; kalanlar açtığınızda indirilecek.`
            : `Synced ${data.messageCount} messages in ${seconds}s. ${data.bodiesCached} bodies cached; the rest download when opened.`
          : tr
          ? `${data.messageCount} mesaj eşitlendi (${seconds} sn). Tümü çevrimdışı okunabilir.`
          : `Synced ${data.messageCount} messages in ${seconds}s. All readable offline.`
      );
      await loadInbox();
    } else {
      setInboxError(errorText(data as any, tr ? 'Eşitleme başarısız oldu.' : 'Sync failed.'));
    }
    setSyncing(false);
  }, [tr, loadInbox]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // Only when IMAP is genuinely not set up does the inbox have nothing to show; open on
  // Compose then, rather than on an empty list that looks broken. A serverless host is no
  // longer such a case — there the inbox works, it is just synced on demand.
  useEffect(() => {
    if (status && !status.imap.configured && status.smtp.configured) setPane('compose');
  }, [status]);

  useEffect(() => {
    if (pane === 'inbox' && status?.imap.configured && messages.length === 0 && !inboxError) {
      void loadInbox();
    }
    // Only re-run when the pane or configuration changes, never on every message update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane, status?.imap.configured]);

  const openMessage = async (uid: number) => {
    setDetailLoading(true);
    setShowRemoteImages(false);
    const { ok, data } = await apiFetchJson<{ message: MessageDetail; error?: string; message_?: string }>(
      `/api/admin/mail/message/${uid}`
    );
    if (ok && data?.message) {
      setSelected(data.message);
    } else {
      setInboxError(errorText(data as any, tr ? 'Mesaj açılamadı.' : 'Could not open the message.'));
    }
    setDetailLoading(false);
  };

  const handleVerify = async () => {
    setIsVerifying(true);
    setVerifyResult(null);
    const { data } = await apiFetchJson<{ smtp: any; imap: any }>('/api/admin/mail/verify', { method: 'POST' });
    setVerifyResult(data ? { smtp: data.smtp, imap: data.imap } : null);
    setIsVerifying(false);
    void loadStatus();
  };

  const handleResolve = async () => {
    const clean = username.trim().replace(/^@/, '');
    if (!clean) return;
    setResolving(true);
    setResolveError(null);
    setResolved(null);
    const { ok, data } = await apiFetchJson<{ recipient: ResolvedRecipient; error?: string; message?: string }>(
      `/api/admin/mail/resolve/${encodeURIComponent(clean)}`
    );
    if (ok && data?.recipient) {
      setResolved(data.recipient);
    } else {
      setResolveError(errorText(data, tr ? 'Kullanıcı bulunamadı.' : 'User not found.'));
    }
    setResolving(false);
  };

  const handlePreview = async () => {
    setPreviewLoading(true);
    const { ok, data } = await apiFetchJson<{ html: string }>('/api/admin/mail/preview', {
      method: 'POST',
      json: {
        subject,
        heading,
        body: bodyText,
        recipient_name: resolved?.displayName,
        cta_label: ctaLabel,
        cta_url: ctaUrl,
        footnote
      }
    });
    setPreviewHtml(ok && data?.html ? data.html : null);
    setPreviewLoading(false);
  };

  const canSend = useMemo(() => {
    const hasRecipient = useRawAddress ? rawTo.trim().includes('@') : Boolean(resolved);
    return hasRecipient && subject.trim().length > 0 && bodyText.trim().length > 0 && !sending;
  }, [useRawAddress, rawTo, resolved, subject, bodyText, sending]);

  const handleSend = async () => {
    setSending(true);
    setSendResult(null);
    const { ok, data } = await apiFetchJson<{ message: string; error?: string }>('/api/admin/mail/send', {
      method: 'POST',
      json: {
        ...(useRawAddress ? { to: rawTo.trim() } : { username: resolved?.username }),
        subject,
        heading,
        body: bodyText,
        recipient_name: resolved?.displayName,
        cta_label: ctaLabel,
        cta_url: ctaUrl,
        footnote
      }
    });

    if (ok && data?.message) {
      setSendResult({ ok: true, message: data.message });
      setSubject('');
      setHeading('');
      setBodyText('');
      setCtaLabel('');
      setCtaUrl('');
      setFootnote('');
      setPreviewHtml(null);
    } else {
      setSendResult({ ok: false, message: errorText(data, tr ? 'E-posta gönderilemedi.' : 'Could not send the e-mail.') });
    }
    setSending(false);
  };

  const filteredMessages = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter(
      (m) =>
        m.subject.toLowerCase().includes(q) ||
        m.fromAddress.toLowerCase().includes(q) ||
        m.fromName.toLowerCase().includes(q)
    );
  }, [messages, filter]);

  /**
   * Incoming mail is rendered inside a sandboxed iframe with NO allow-scripts and NO
   * allow-same-origin. Even if the server-side sanitiser missed something, the content
   * cannot run script, read this page, or reach the admin's session.
   */
  const messageFrame = (message: MessageDetail) => {
    const html = showRemoteImages
      ? message.html.replace(/data-blocked-src="1"/g, '')
      : message.html;

    if (!html.trim()) {
      return (
        <pre className="c4e-well user-text whitespace-pre-wrap break-words p-4 text-[13px] leading-relaxed text-zinc-300">
          {message.text || (tr ? '(Boş mesaj)' : '(Empty message)')}
        </pre>
      );
    }

    return (
      <iframe
        title={tr ? 'E-posta içeriği' : 'E-mail content'}
        sandbox=""
        srcDoc={`<!doctype html><meta charset="utf-8"><base target="_blank"><style>
          body{margin:0;padding:14px;background:#fff;color:#18181b;
               font:14px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}
          img{max-width:100%;height:auto}table{max-width:100%}
        </style>${html}`}
        className="h-[460px] w-full rounded-xl border border-white/[0.07] bg-white"
      />
    );
  };

  const smtpReady = status?.smtp.configured;
  const imapReady = status?.imap.configured;

  return (
    <div className="space-y-5 p-6">
      {/* Connection status */}
      <div className="c4e-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-bold text-white">
            <ServerCog className="h-4 w-4 text-blue-400" />
            <span>{tr ? 'Posta Sunucusu Bağlantısı' : 'Mail Server Connection'}</span>
          </h3>
          <button
            type="button"
            onClick={handleVerify}
            disabled={isVerifying || (!smtpReady && !imapReady)}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 text-xs font-semibold text-zinc-300 transition-colors hover:text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {isVerifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
            <span>{tr ? 'Bağlantıyı test et' : 'Test connection'}</span>
          </button>
        </div>

        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          {[
            { key: 'smtp' as const, label: tr ? 'SMTP (gönderme)' : 'SMTP (sending)', cfg: status?.smtp },
            { key: 'imap' as const, label: tr ? 'IMAP (okuma)' : 'IMAP (reading)', cfg: status?.imap }
          ].map(({ key, label, cfg }) => {
            const verified = verifyResult?.[key];
            return (
              <div key={key} className="c4e-well p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-zinc-200">{label}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${
                      cfg?.configured
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-white/[0.07] text-zinc-400'
                    }`}
                  >
                    {cfg?.configured ? (tr ? 'tanımlı' : 'configured') : tr ? 'eksik' : 'missing'}
                  </span>
                </div>
                <p className="user-text mt-1 font-mono text-[11px] text-zinc-500">
                  {cfg?.configured
                    ? `${cfg.host}:${cfg.port}${cfg.secure ? ' · TLS' : ''}`
                    : tr
                    ? 'Kullanılamıyor'
                    : 'Unavailable'}
                </p>
                {!cfg?.configured && (cfg as { reason?: string | null })?.reason && (
                  <p className="user-text mt-1.5 text-[11px] leading-relaxed text-amber-300/90">
                    {(cfg as { reason?: string | null }).reason}
                  </p>
                )}
                {verified && (
                  <p
                    className={`user-text mt-1.5 text-[11px] ${
                      verified.ok ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {verified.ok
                      ? tr
                        ? '✓ Bağlantı ve kimlik doğrulama başarılı'
                        : '✓ Connected and authenticated'
                      : verified.error}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {!smtpReady && !imapReady && (
          <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-700/40 bg-amber-950/25 p-3 text-[11px] leading-relaxed text-amber-200/90">
            <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
            <span>
              {tr
                ? 'Posta özelliği için sunucuda MAIL_SMTP_HOST, MAIL_SMTP_USER, MAIL_SMTP_PASS (ve okuma için MAIL_IMAP_HOST) ortam değişkenlerini tanımlayın. Kimlik bilgileri yalnızca sunucuda tutulur, tarayıcıya hiç gönderilmez.'
                : 'Set MAIL_SMTP_HOST, MAIL_SMTP_USER, MAIL_SMTP_PASS (and MAIL_IMAP_HOST for reading) on the server. Credentials stay server-side and never reach the browser.'}
            </span>
          </div>
        )}
      </div>

      {/* Pane switch */}
      <div className="flex items-center gap-2">
        {[
          { id: 'inbox' as const, label: tr ? 'Gelen Kutusu' : 'Inbox', icon: Inbox },
          { id: 'compose' as const, label: tr ? 'Yeni E-posta' : 'Compose', icon: Send }
        ].map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPane(p.id)}
            className={`flex h-9 items-center gap-2 rounded-xl px-3.5 text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              pane === p.id
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                : 'border border-white/[0.07] bg-white/[0.04] text-zinc-400 hover:text-white'
            }`}
          >
            <p.icon className="h-4 w-4" />
            <span>{p.label}</span>
          </button>
        ))}
      </div>

      {/* ---------------- INBOX ---------------- */}
      {pane === 'inbox' && (
        <div className="c4e-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] p-3.5">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={tr ? 'Konu veya gönderen ara...' : 'Search subject or sender...'}
                aria-label={tr ? 'Mesajlarda ara' : 'Search messages'}
                className="c4e-input w-full py-2 pl-9 pr-3 text-xs text-white placeholder-zinc-600 focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadInbox}
                disabled={inboxLoading || syncing || !imapReady}
                title={tr ? 'Saklanan kopyayı yeniden okur' : 'Re-reads the stored copy'}
                className="flex h-9 items-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 text-xs font-semibold text-zinc-300 transition-colors hover:text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {inboxLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                <span>{tr ? 'Yenile' : 'Refresh'}</span>
              </button>
              <button
                type="button"
                onClick={runSync}
                disabled={syncing || !imapReady}
                title={
                  tr
                    ? 'Posta sunucusuna bağlanıp mesajları bir kerede indirir'
                    : 'Connects to the mail server and pulls messages in one pass'
                }
                className="flex h-9 items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 text-xs font-bold text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-500 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {syncing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <DownloadCloud className="h-3.5 w-3.5" />
                )}
                <span>
                  {syncing
                    ? tr
                      ? 'Eşitleniyor...'
                      : 'Syncing...'
                    : tr
                    ? 'Gelen kutusunu eşitle'
                    : 'Sync inbox'}
                </span>
              </button>
            </div>
          </div>

          {/* Sync state: what is stored, and when it was last refreshed. */}
          {imapReady && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-white/[0.07] px-3.5 py-2.5 text-[11px] text-zinc-500">
              <span className="flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                {lastSyncedAt
                  ? tr
                    ? `Son eşitleme: ${formatSyncTime(lastSyncedAt, tr)}`
                    : `Last synced: ${formatSyncTime(lastSyncedAt, tr)}`
                  : tr
                  ? 'Henüz eşitlenmedi'
                  : 'Not synced yet'}
              </span>
              {status?.imap.mode === 'sync' && (
                <span className="rounded-md bg-white/[0.07] px-1.5 py-0.5 font-semibold text-zinc-400">
                  {tr ? 'isteğe bağlı eşitleme' : 'on-demand sync'}
                </span>
              )}
              {syncNote && <span className="user-text text-emerald-400">{syncNote}</span>}
            </div>
          )}

          {storeWarning && (
            <div className="m-3.5 flex items-start gap-2 rounded-xl border border-amber-700/40 bg-amber-950/25 p-3 text-[11px] leading-relaxed text-amber-200/90">
              <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
              <span className="user-text">{storeWarning}</span>
            </div>
          )}

          {inboxError && (
            <div className="m-3.5 flex items-start gap-2 rounded-xl border border-red-700/40 bg-red-950/30 p-3 text-xs text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
              <span className="user-text">{inboxError}</span>
            </div>
          )}

          <div className="grid gap-0 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
            {/* List */}
            <ul className="max-h-[560px] divide-y divide-white/[0.06] overflow-y-auto border-b border-white/[0.07] lg:border-b-0 lg:border-r">
              {inboxLoading && messages.length === 0 ? (
                <li className="flex items-center justify-center gap-2 p-10 text-xs text-zinc-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{tr ? 'Yükleniyor...' : 'Loading...'}</span>
                </li>
              ) : filteredMessages.length === 0 ? (
                <li className="px-6 py-10 text-center text-xs text-zinc-500">
                  {!imapReady ? (
                    tr ? (
                      'IMAP yapılandırılmamış.'
                    ) : (
                      'IMAP not configured.'
                    )
                  ) : filter ? (
                    tr ? (
                      'Aramanızla eşleşen mesaj yok.'
                    ) : (
                      'No messages match your search.'
                    )
                  ) : lastSyncedAt ? (
                    tr ? (
                      'Gelen kutusu boş.'
                    ) : (
                      'The inbox is empty.'
                    )
                  ) : (
                    // Nothing has been pulled yet, so point at the button that pulls it
                    // rather than implying the mailbox is empty.
                    <span className="flex flex-col items-center gap-2">
                      <DownloadCloud className="h-6 w-6 text-zinc-600" />
                      <span className="user-text leading-relaxed">
                        {tr
                          ? 'Mesajlar henüz indirilmedi. "Gelen kutusunu eşitle" ile bir kerede çekin; sonrasında açmak anlık olur.'
                          : 'Nothing downloaded yet. Use "Sync inbox" to pull it once; opening messages is instant afterwards.'}
                      </span>
                    </span>
                  )}
                </li>
              ) : (
                filteredMessages.map((m) => (
                  <li key={m.uid}>
                    <button
                      type="button"
                      onClick={() => openMessage(m.uid)}
                      className={`w-full px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                        selected?.uid === m.uid ? 'bg-white/[0.04]' : 'hover:bg-white/[0.06]'
                      } ${m.seen ? '' : 'bg-blue-500/5'}`}
                    >
                      <div className="flex items-start gap-3">
                        <UserAvatar
                          src=""
                          name={m.fromName || m.fromAddress || '?'}
                          className="mt-0.5 h-8 w-8 flex-shrink-0 text-[10px]"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className={`user-text truncate text-xs ${m.seen ? 'text-zinc-300' : 'font-bold text-white'}`}>
                              {m.fromName || m.fromAddress}
                            </span>
                            <span className="flex-shrink-0 font-mono text-[10px] text-zinc-500">
                              {formatDate(m.date)}
                            </span>
                          </div>
                          <p className={`user-text mt-0.5 truncate text-[12px] ${m.seen ? 'text-zinc-400' : 'text-zinc-200'}`}>
                            {m.subject}
                          </p>
                          <p className="user-text mt-0.5 truncate text-[11px] text-zinc-600">{m.preview}</p>
                        </div>
                        {m.hasAttachments && <Paperclip className="mt-1 h-3 w-3 flex-shrink-0 text-zinc-500" />}
                      </div>
                    </button>
                  </li>
                ))
              )}
            </ul>

            {/* Reader */}
            <div className="min-w-0 p-4">
              {detailLoading ? (
                <div className="flex items-center justify-center gap-2 py-20 text-xs text-zinc-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{tr ? 'Mesaj açılıyor...' : 'Opening...'}</span>
                </div>
              ) : !selected ? (
                <div className="py-20 text-center">
                  <Mail className="mx-auto mb-3 h-8 w-8 text-zinc-700" />
                  <p className="text-xs text-zinc-500">
                    {tr ? 'Okumak için soldan bir mesaj seçin.' : 'Pick a message on the left to read it.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <h4 className="user-text text-sm font-bold text-white">{selected.subject}</h4>
                    <p className="user-text mt-1 font-mono text-[11px] text-zinc-400">
                      {selected.fromName ? `${selected.fromName} · ` : ''}
                      {selected.fromAddress}
                    </p>
                    <p className="font-mono text-[11px] text-zinc-600">
                      {selected.date ? new Date(selected.date).toLocaleString('tr-TR') : ''}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPane('compose');
                        setUseRawAddress(true);
                        setRawTo(selected.fromAddress);
                        setSubject(selected.subject.startsWith('Re:') ? selected.subject : `Re: ${selected.subject}`);
                      }}
                      className="flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.04] px-2.5 text-[11px] font-semibold text-zinc-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>{tr ? 'Yanıtla' : 'Reply'}</span>
                    </button>

                    {selected.imagesBlocked && !showRemoteImages && (
                      <button
                        type="button"
                        onClick={() => setShowRemoteImages(true)}
                        className="flex h-8 items-center gap-1.5 rounded-lg border border-amber-700/40 bg-amber-950/25 px-2.5 text-[11px] font-semibold text-amber-300 transition-colors hover:text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        title={
                          tr
                            ? 'Uzak görseller IP adresinizi gönderene açar'
                            : 'Remote images reveal your IP to the sender'
                        }
                      >
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span>{tr ? 'Görselleri yükle' : 'Load images'}</span>
                      </button>
                    )}

                    {selected.attachments.length > 0 && (
                      <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                        <Paperclip className="h-3 w-3" />
                        {selected.attachments.length} {tr ? 'ek' : 'attachments'}
                      </span>
                    )}
                  </div>

                  {messageFrame(selected)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------------- COMPOSE ---------------- */}
      {pane === 'compose' && (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="c4e-card space-y-4 p-4">
            {/* Recipient */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="mail-username" className="text-xs font-bold text-zinc-200">
                  {tr ? 'Alıcı' : 'Recipient'}
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setUseRawAddress((v) => !v);
                    setResolved(null);
                    setResolveError(null);
                  }}
                  className="text-[11px] text-blue-400 hover:text-blue-300"
                >
                  {useRawAddress
                    ? tr ? 'Kullanıcı adıyla seç' : 'Pick by username'
                    : tr ? 'Doğrudan adres gir' : 'Enter address directly'}
                </button>
              </div>

              {useRawAddress ? (
                <input
                  id="mail-username"
                  type="email"
                  value={rawTo}
                  onChange={(e) => setRawTo(e.target.value)}
                  placeholder="ornek@alanadi.com"
                  className="c4e-input w-full px-3.5 py-2 text-xs text-white placeholder-zinc-600 focus-visible:ring-2 focus-visible:ring-ring"
                />
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-0 flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-zinc-500">@</span>
                    <input
                      id="mail-username"
                      type="text"
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value);
                        setResolved(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void handleResolve();
                        }
                      }}
                      placeholder={tr ? 'kullanici_adi' : 'username'}
                      className="c4e-input w-full py-2 pl-7 pr-3 text-xs text-white placeholder-zinc-600 focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleResolve}
                    disabled={resolving || !username.trim()}
                    className="flex h-9 items-center gap-1.5 rounded-xl bg-zinc-100 px-3.5 text-xs font-bold text-zinc-950 transition-colors hover:bg-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {resolving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserIcon className="h-3.5 w-3.5" />}
                    <span>{tr ? 'Bul' : 'Find'}</span>
                  </button>
                </div>
              )}

              {resolveError && (
                <p className="user-text text-[11px] text-red-400">{resolveError}</p>
              )}

              {resolved && (
                <div className="flex items-center gap-2.5 rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-2.5">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-400" />
                  <div className="min-w-0">
                    <p className="user-text text-xs font-bold text-white">{resolved.displayName}</p>
                    <p className="user-text font-mono text-[11px] text-emerald-300/80">
                      @{resolved.username} · {maskEmail(resolved.email)}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Subject + heading */}
            <div className="space-y-1">
              <label htmlFor="mail-subject" className="text-xs font-bold text-zinc-200">
                {tr ? 'Konu' : 'Subject'}
              </label>
              <input
                id="mail-subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={180}
                className="c4e-input w-full px-3.5 py-2 text-xs text-white placeholder-zinc-600 focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="mail-heading" className="text-xs font-bold text-zinc-200">
                {tr ? 'Başlık (boşsa konu kullanılır)' : 'Heading (defaults to subject)'}
              </label>
              <input
                id="mail-heading"
                type="text"
                value={heading}
                onChange={(e) => setHeading(e.target.value)}
                maxLength={160}
                className="c4e-input w-full px-3.5 py-2 text-xs text-white placeholder-zinc-600 focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="mail-body" className="text-xs font-bold text-zinc-200">
                {tr ? 'Mesaj' : 'Message'}
              </label>
              <textarea
                id="mail-body"
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                rows={8}
                maxLength={20000}
                placeholder={tr ? 'Paragrafları boş satırla ayırın.' : 'Separate paragraphs with a blank line.'}
                className="c4e-input w-full resize-y p-3 text-xs leading-relaxed text-white placeholder-zinc-600 focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            {/* Optional button */}
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="mail-cta-label" className="text-xs font-bold text-zinc-200">
                  {tr ? 'Buton etiketi' : 'Button label'}
                </label>
                <input
                  id="mail-cta-label"
                  type="text"
                  value={ctaLabel}
                  onChange={(e) => setCtaLabel(e.target.value)}
                  maxLength={60}
                  placeholder={tr ? 'isteğe bağlı' : 'optional'}
                  className="c4e-input w-full px-3.5 py-2 text-xs text-white placeholder-zinc-600 focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="mail-cta-url" className="text-xs font-bold text-zinc-200">
                  {tr ? 'Buton bağlantısı' : 'Button link'}
                </label>
                <input
                  id="mail-cta-url"
                  type="url"
                  value={ctaUrl}
                  onChange={(e) => setCtaUrl(e.target.value)}
                  maxLength={500}
                  placeholder="https://app.lanux.online/..."
                  className="c4e-input w-full px-3.5 py-2 text-xs text-white placeholder-zinc-600 focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="mail-footnote" className="text-xs font-bold text-zinc-200">
                {tr ? 'Dipnot' : 'Footnote'}
              </label>
              <input
                id="mail-footnote"
                type="text"
                value={footnote}
                onChange={(e) => setFootnote(e.target.value)}
                maxLength={300}
                placeholder={tr ? 'Bu e-postayı neden aldığı vb.' : 'Why they received this, etc.'}
                className="c4e-input w-full px-3.5 py-2 text-xs text-white placeholder-zinc-600 focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.07] pt-3">
              <button
                type="button"
                onClick={handlePreview}
                disabled={previewLoading || !bodyText.trim()}
                className="flex h-9 items-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.04] px-3.5 text-xs font-semibold text-zinc-300 transition-colors hover:text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {previewLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                <span>{tr ? 'Önizle' : 'Preview'}</span>
              </button>

              <button
                type="button"
                onClick={handleSend}
                disabled={!canSend || !smtpReady}
                className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-zinc-100 px-4 text-xs font-bold text-zinc-950 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                <span>{tr ? 'Gönder' : 'Send'}</span>
              </button>
            </div>

            {sendResult && (
              <div
                className={`flex items-start gap-2.5 rounded-xl border p-3 text-xs leading-relaxed ${
                  sendResult.ok
                    ? 'border-emerald-700/40 bg-emerald-950/30 text-emerald-300'
                    : 'border-red-700/40 bg-red-950/30 text-red-300'
                }`}
              >
                {sendResult.ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" />
                ) : (
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
                )}
                <span className="user-text">{sendResult.message}</span>
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="c4e-card p-4">
            <h4 className="mb-3 flex items-center gap-2 text-xs font-bold text-zinc-200">
              <Mail className="h-4 w-4 text-zinc-400" />
              <span>{tr ? 'E-posta Önizlemesi' : 'E-mail Preview'}</span>
            </h4>
            {previewHtml ? (
              <iframe
                title={tr ? 'E-posta önizlemesi' : 'E-mail preview'}
                sandbox=""
                srcDoc={previewHtml}
                className="h-[620px] w-full rounded-xl border border-white/[0.07] bg-white"
              />
            ) : (
              <div className="flex h-[620px] flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.07] text-center">
                <Sparkles className="mb-2 h-6 w-6 text-zinc-700" />
                <p className="max-w-xs px-6 text-xs leading-relaxed text-zinc-500">
                  {tr
                    ? 'Mesajı yazıp "Önizle"ye basın; e-posta tam olarak alıcıya gideceği gibi burada görünür.'
                    : 'Write the message and hit Preview; the e-mail appears exactly as the recipient will see it.'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
