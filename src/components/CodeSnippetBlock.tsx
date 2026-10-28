import React, { useState } from 'react';
import { Copy, Check, ChevronDown, ChevronUp, Code2 } from 'lucide-react';
import { CodeSnippet } from '../types';

interface CodeSnippetBlockProps {
  snippet: CodeSnippet | string | { title?: string; language?: string; code?: string };
  language?: 'tr' | 'en';
  postAuthor?: string;
}

export const CodeSnippetBlock: React.FC<CodeSnippetBlockProps> = ({ snippet, language = 'tr' }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  let title = 'Snippet';
  let lang = 'Code';
  let rawCode = '';

  if (typeof snippet === 'string') {
    const trimmed = snippet.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object') {
          title = parsed.title || 'Snippet';
          lang = parsed.language || 'Code';
          rawCode = typeof parsed.code === 'string' ? parsed.code : (typeof parsed === 'string' ? parsed : '');
        } else {
          rawCode = trimmed;
        }
      } catch {
        rawCode = trimmed;
      }
    } else {
      rawCode = trimmed;
    }
  } else if (snippet && typeof snippet === 'object') {
    title = snippet.title || 'Snippet';
    lang = snippet.language || 'Code';
    rawCode = typeof snippet.code === 'string' ? snippet.code : '';
  }

  if (!rawCode || !rawCode.trim()) {
    return null;
  }

  const lines = rawCode.split('\n');
  const lineCount = lines.length;
  const isTruncatable = rawCode.length > 280 || lineCount > 10;
  
  const displayedCode = !isTruncatable || isExpanded 
    ? rawCode 
    : lines.slice(0, 8).join('\n') + (lineCount > 8 ? '\n...' : '');

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(rawCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-3.5 bg-black/25 border border-white/[0.07] rounded-2xl space-y-2.5 font-mono relative overflow-hidden group shadow-inner">
      <div className="flex items-center justify-between text-[11px] text-zinc-400 border-b border-white/[0.07] pb-2">
        <div className="flex items-center gap-2 truncate">
          <Code2 className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
          <span className="font-semibold text-zinc-200 truncate">{title}</span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.07] text-[10px] text-emerald-400 font-mono font-semibold">
            {lang}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            title={language === 'tr' ? 'Kodu Kopyala' : 'Copy Code'}
            className="h-7 w-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <div className="relative">
        <pre className="text-xs text-emerald-400/95 overflow-x-auto no-scrollbar p-1.5 leading-relaxed whitespace-pre font-mono select-text bg-[#0a0a14]/80 rounded-xl border border-zinc-900 [-webkit-overflow-scrolling:touch]">
          <code>{displayedCode}</code>
        </pre>
      </div>

      {isTruncatable && (
        <div className="pt-1.5 border-t border-white/[0.07] flex items-center justify-between">
          <span className="text-[10px] text-zinc-500 font-mono">
            {isExpanded
              ? `${lineCount} ${language === 'tr' ? 'satır gösteriliyor' : 'lines displayed'}`
              : `${Math.min(8, lineCount)} / ${lineCount} ${language === 'tr' ? 'satır' : 'lines'}`}
          </span>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.07] text-[11px] text-zinc-300 hover:text-white font-mono flex items-center gap-1 transition-all cursor-pointer shadow-sm active:scale-95"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-3 h-3 text-zinc-400" />
                <span>{language === 'tr' ? 'Daha Az Göster' : 'Show Less'}</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3 text-zinc-400" />
                <span>
                  {language === 'tr'
                    ? `Dahasını Göster (+${Math.max(1, lineCount - 8)} satır)`
                    : `Show More (+${Math.max(1, lineCount - 8)} lines)`}
                </span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
