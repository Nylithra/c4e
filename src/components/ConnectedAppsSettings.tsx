/**
 * "Bağlı uygulamalar" — üyenin Code4Ever hesabına erişim verdiği üçüncü taraf uygulamalar.
 *
 * NEDEN BU EKRAN ŞART: izin vermek tek tıkla oluyor, geri almak da öyle olmalı. Erişimi
 * kesecek bir yer olmadan verilen her izin kalıcı olurdu ve kullanıcı neyi neye açtığını
 * görmezdi. "Erişimi kes" dediğinde yalnızca kayıt değil, o uygulamanın bu üyeye ait
 * BÜTÜN belirteçleri siliniyor; erişim bir sonraki istekte değil, anında bitiyor.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Loader2, Puzzle, Unlink } from 'lucide-react';
import {
  fetchAuthorizations,
  fetchScopes,
  revokeAuthorization,
  type Authorization,
  type ScopeInfo
} from '../services/devAppsClient';

export const ConnectedAppsSettings: React.FC<{ language: 'tr' | 'en' }> = ({ language }) => {
  const tr = language === 'tr';
  const [list, setList] = useState<Authorization[]>([]);
  const [scopeInfo, setScopeInfo] = useState<Record<string, ScopeInfo>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [authorizations, scopes] = await Promise.all([fetchAuthorizations(), fetchScopes()]);
    setList(authorizations);
    setScopeInfo(Object.fromEntries(scopes.map((s) => [s.key, s])));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = async (clientId: string) => {
    setBusyId(clientId);
    setError(null);
    const done = await revokeAuthorization(clientId);
    setBusyId(null);
    if (!done) {
      setError(tr ? 'Erişim kesilemedi.' : 'Could not revoke access.');
      return;
    }
    await load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-xs text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{tr ? 'Bağlı uygulamalar yükleniyor…' : 'Loading connected applications…'}</span>
      </div>
    );
  }

  if (list.length === 0) {
    return (
      <div className="c4e-empty px-5 py-10 text-center">
        <div className="c4e-card mx-auto mb-3 flex h-11 w-11 items-center justify-center text-zinc-600">
          <Puzzle className="h-5 w-5" />
        </div>
        <p className="text-sm font-bold text-zinc-300">
          {tr ? 'Bağlı uygulama yok' : 'No connected applications'}
        </p>
        <p className="mx-auto mt-1.5 max-w-xs text-xs leading-relaxed text-zinc-500">
          {tr
            ? 'Code4Ever hesabına erişim verdiğin uygulamalar burada listelenir ve erişimlerini buradan kesebilirsin.'
            : 'Applications you grant access to your Code4Ever account appear here, and you can revoke them from here.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {list.map((item) => (
        <div key={item.app.client_id} className="c4e-card p-4 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 gap-3">
              {item.app.logo_url ? (
                <img src={item.app.logo_url} alt="" className="h-9 w-9 flex-none rounded-xl object-cover" />
              ) : (
                <span className="c4e-mono-av h-9 w-9 flex-none rounded-xl text-sm" aria-hidden="true">
                  {(item.app.name || '?').charAt(0).toUpperCase()}
                </span>
              )}
              <div className="min-w-0 space-y-1">
                <p className="truncate text-sm font-bold text-white">{item.app.name}</p>
                <p className="truncate text-[11px] text-zinc-500">
                  {item.app.owner_username
                    ? `${tr ? 'geliştirici' : 'by'} @${item.app.owner_username}`
                    : tr
                    ? 'üçüncü taraf uygulama'
                    : 'third-party application'}
                  {' · '}
                  {tr ? 'izin verildi' : 'granted'}{' '}
                  {new Date(item.granted_at).toLocaleDateString(tr ? 'tr-TR' : 'en-US')}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void revoke(item.app.client_id)}
              disabled={busyId === item.app.client_id}
              className="flex min-h-10 flex-none items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] px-3.5 text-xs font-semibold text-zinc-300 transition-colors hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-200 disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {busyId === item.app.client_id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Unlink className="h-3.5 w-3.5" />
              )}
              <span>{tr ? 'Erişimi kes' : 'Revoke'}</span>
            </button>
          </div>

          {/* Hangi izni verdiği AÇIKÇA yazıyor: "bağlı" demek, neye erişildiğini söylemez. */}
          <ul className="space-y-1 border-t border-white/[0.06] pt-2.5">
            {item.scopes.map((scope) => (
              <li key={scope} className="flex items-start gap-2 text-[11.5px] text-zinc-400">
                <span className="mt-1.5 h-1 w-1 flex-none rounded-full bg-indigo-400" />
                <span>
                  {scopeInfo[scope] ? (tr ? scopeInfo[scope].tr : scopeInfo[scope].en) : scope}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {error && (
        <p className="user-text flex items-center gap-1.5 text-[11px] text-rose-300">
          <AlertCircle className="h-3 w-3 flex-shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
};
