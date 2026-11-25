import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileCode2,
  FileText,
  Globe,
  Link2,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import type { BatchFetchItemResult, BilingualArticle } from '../types/corpus';
import { makeId, normalizeUrlPreview, parseRawBilingualText } from '../utils/corpusEngine';

interface AcquisitionPanelProps {
  loadedCount: number;
  onArticlesAdded: (articles: BilingualArticle[]) => void;
  onLoadSamples: () => void;
  onClearAllLoaded: () => void;
  onNavigateToAlign: () => void;
}

type AcquisitionTab = 'url' | 'html' | 'text';

const EXAMPLE_URL =
  'https://cn.nytimes.com/china/20261125/shanghai-party-leader-investigation-china-xi/dual/';

export const AcquisitionPanel: React.FC<AcquisitionPanelProps> = ({
  loadedCount,
  onArticlesAdded,
  onLoadSamples,
  onClearAllLoaded,
  onNavigateToAlign,
}) => {
  const [activeTab, setActiveTab] = useState<AcquisitionTab>('url');
  const [clearFeedback, setClearFeedback] = useState<string | null>(null);

  // URL acquisition state
  const [urlInput, setUrlInput] = useState<string>(EXAMPLE_URL);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchLogs, setFetchLogs] = useState<BatchFetchItemResult[]>([]);
  const [urlError, setUrlError] = useState<string | null>(null);

  // HTML import state
  const [htmlSourceUrl, setHtmlSourceUrl] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [isParsingHtml, setIsParsingHtml] = useState(false);
  const [htmlStatus, setHtmlStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Raw text import state
  const [rawTitleEn, setRawTitleEn] = useState('');
  const [rawTitleZh, setRawTitleZh] = useState('');
  const [rawBody, setRawBody] = useState('');
  const [textStatus, setTextStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const parsedUrls = useMemo(() => {
    return Array.from(
      new Set(
        urlInput
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
      )
    );
  }, [urlInput]);

  const handleFetchUrls = async () => {
    if (parsedUrls.length === 0) {
      setUrlError('请至少输入一个 cn.nytimes.com 文章链接');
      return;
    }

    setIsFetching(true);
    setUrlError(null);
    setFetchLogs([]);

    try {
      const response = await fetch('/api/fetch-nyt-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: parsedUrls }),
      });

      const data = await response.json();
      if (!response.ok || !Array.isArray(data.results)) {
        setUrlError(data.error || '批量抓取请求失败');
        setIsFetching(false);
        return;
      }

      const results: BatchFetchItemResult[] = data.results;
      setFetchLogs(results);

      const newArticles: BilingualArticle[] = [];
      for (const item of results) {
        if (item.ok && item.article) {
          const pairs = item.article.pairs.map((p, idx) => ({
            id: makeId('pair'),
            index: idx + 1,
            isTitle: Boolean(p.isTitle) || idx === 0,
            en: p.en,
            zh: p.zh,
          }));
          newArticles.push({
            id: makeId('art'),
            titleEn: item.article.titleEn,
            titleZh: item.article.titleZh,
            pairs,
            rawPairs: pairs.map((p) => ({ ...p })),
            metadata: item.article.metadata,
            status: 'ready',
          });
        }
      }

      if (newArticles.length > 0) {
        onArticlesAdded(newArticles);
      }
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : '网络请求异常');
    } finally {
      setIsFetching(false);
    }
  };

  const handleParseHtml = async (overrideHtml?: string) => {
    const payloadHtml = overrideHtml ?? htmlContent;
    if (!payloadHtml.trim()) {
      setHtmlStatus({ ok: false, msg: '请先粘贴网页 HTML 源码或选择本地 .html 文件' });
      return;
    }

    setIsParsingHtml(true);
    setHtmlStatus(null);
    try {
      const response = await fetch('/api/parse-html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: payloadHtml,
          sourceUrl: htmlSourceUrl.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok || !data.article) {
        setHtmlStatus({ ok: false, msg: data.error || 'HTML 解析失败' });
        return;
      }

      const pairs = data.article.pairs.map(
        (p: { isTitle?: boolean; en: string; zh: string }, idx: number) => ({
          id: makeId('pair'),
          index: idx + 1,
          isTitle: Boolean(p.isTitle) || idx === 0,
          en: p.en,
          zh: p.zh,
        })
      );

      const article: BilingualArticle = {
        id: makeId('art'),
        titleEn: data.article.titleEn,
        titleZh: data.article.titleZh,
        pairs,
        rawPairs: pairs.map((p: { id: string; index: number; isTitle?: boolean; en: string; zh: string }) => ({ ...p })),
        metadata: data.article.metadata,
        status: 'ready',
      };

      onArticlesAdded([article]);
      setHtmlStatus({
        ok: true,
        msg: `已成功解析并加入队列：${article.titleZh}（共 ${pairs.length} 行对齐）`,
      });
      setHtmlContent('');
    } catch (err) {
      setHtmlStatus({
        ok: false,
        msg: err instanceof Error ? err.message : '解析请求失败',
      });
    } finally {
      setIsParsingHtml(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    if (fileList.length === 1) {
      const text = await fileList[0].text();
      setHtmlContent(text);
      await handleParseHtml(text);
    } else {
      setIsParsingHtml(true);
      const parsedBatch: BilingualArticle[] = [];
      let failCount = 0;

      for (const file of fileList) {
        try {
          const text = await file.text();
          const res = await fetch('/api/parse-html', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ html: text, sourceUrl: '' }),
          });
          const data = await res.json();
          if (res.ok && data.ok && data.article) {
            const pairs = data.article.pairs.map(
              (p: { isTitle?: boolean; en: string; zh: string }, idx: number) => ({
                id: makeId('pair'),
                index: idx + 1,
                isTitle: Boolean(p.isTitle) || idx === 0,
                en: p.en,
                zh: p.zh,
              })
            );
            parsedBatch.push({
              id: makeId('art'),
              titleEn: data.article.titleEn,
              titleZh: data.article.titleZh,
              pairs,
              rawPairs: pairs.map((p: { id: string; index: number; isTitle?: boolean; en: string; zh: string }) => ({ ...p })),
              metadata: data.article.metadata,
              status: 'ready',
            });
          } else {
            failCount++;
          }
        } catch {
          failCount++;
        }
      }

      if (parsedBatch.length > 0) {
        onArticlesAdded(parsedBatch);
      }
      setHtmlStatus({
        ok: parsedBatch.length > 0,
        msg: `批量 HTML 解析完成：成功 ${parsedBatch.length} 篇，失败 ${failCount} 篇`,
      });
      setIsParsingHtml(false);
    }
    e.target.value = '';
  };

  const handleImportRawText = () => {
    if (!rawBody.trim() && !rawTitleEn.trim() && !rawTitleZh.trim()) {
      setTextStatus({ ok: false, msg: '请输入标题或双语正文内容' });
      return;
    }

    const parsed = parseRawBilingualText(rawBody, rawTitleEn, rawTitleZh);
    if (parsed.length === 0) {
      setTextStatus({ ok: false, msg: '未能识别到有效段落' });
      return;
    }

    const pairs = parsed.map((p, idx) => ({
      id: makeId('pair'),
      index: idx + 1,
      isTitle: Boolean(p.isTitle) || idx === 0,
      en: p.en,
      zh: p.zh,
    }));

    const titleEn = rawTitleEn.trim() || pairs[0]?.en || 'Imported Bilingual Text';
    const titleZh = rawTitleZh.trim() || pairs[0]?.zh || '导入的双语文本';

    const article: BilingualArticle = {
      id: makeId('art'),
      titleEn,
      titleZh,
      pairs,
      rawPairs: pairs.map((p) => ({ ...p })),
      metadata: {
        url: 'local://text-import',
        canonicalDualUrl: 'local://text-import',
        section: '自定义导入',
        date: new Date().toISOString().slice(0, 10),
        fetchedAt: new Date().toISOString(),
        sourceType: 'text-import',
      },
      status: 'ready',
    };

    onArticlesAdded([article]);
    setTextStatus({ ok: true, msg: `已导入「${titleZh}」，共生成 ${pairs.length} 行左右对齐` });
    setRawTitleEn('');
    setRawTitleZh('');
    setRawBody('');
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-6 space-y-8">
      {/* Intro Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#E5E5E3] pb-6">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-[#6B6B66] tracking-wide">
            cn.nytimes.com 双语页面获取与批量导入
          </p>
          <h1 className="font-editorial text-2xl md:text-3xl font-semibold text-[#141413] text-balance">
            采集《纽约时报》英汉双语原文
          </h1>
          <p className="text-sm text-[#575752] max-w-2xl leading-relaxed">
            支持单篇或批量粘贴 <span className="font-mono text-xs text-[#141413]">cn.nytimes.com</span> 文章链接（自动补全{' '}
            <span className="font-mono text-xs text-[#141413]">/dual/</span> 双语版路径），并将英汉标题置于对齐结果首行。若目标链接受网络或付费墙限制，可切换至本地 HTML 源码批量导入。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {loadedCount > 0 && (
            <button
              type="button"
              onClick={() => {
                onClearAllLoaded();
                setFetchLogs([]);
                setUrlError(null);
                setHtmlStatus(null);
                setTextStatus(null);
                setClearFeedback(`已清除工具当前所载的 ${loadedCount} 篇文本信息`);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-lg hover:bg-[#FEE2E2] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              清除所载文本 ({loadedCount})
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setClearFeedback(null);
              onLoadSamples();
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-[#141413] bg-white border border-[#D8D8D4] rounded-lg hover:bg-[#F3F3F0] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#1E3A5F]" />
            载入双语示例语料
          </button>
          <button
            type="button"
            onClick={onNavigateToAlign}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-[#1E3A5F] bg-[#1E3A5F]/8 rounded-lg hover:bg-[#1E3A5F]/15 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            前往对齐工作台
          </button>
        </div>
      </div>

      {clearFeedback && (
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 rounded-lg bg-[#F0FDF4] border border-[#BBF7D0] text-xs text-[#166534]">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{clearFeedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setClearFeedback(null)}
            className="text-[11px] underline cursor-pointer"
          >
            关闭
          </button>
        </div>
      )}

      {/* Mode Selector Tabs */}
      <div className="inline-flex items-center gap-1 p-1 bg-[#EFEFEB] rounded-lg border border-[#E5E5E3]">
        <button
          type="button"
          onClick={() => setActiveTab('url')}
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'url'
              ? 'bg-white text-[#141413] shadow-xs'
              : 'text-[#575752] hover:text-[#141413]'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          在线链接批量抓取
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('html')}
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'html'
              ? 'bg-white text-[#141413] shadow-xs'
              : 'text-[#575752] hover:text-[#141413]'
          }`}
        >
          <FileCode2 className="w-3.5 h-3.5" />
          HTML 源码 / 网页文件导入
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('text')}
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'text'
              ? 'bg-white text-[#141413] shadow-xs'
              : 'text-[#575752] hover:text-[#141413]'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          双语纯文本粘贴
        </button>
      </div>

      {/* Tab 1: URL Fetch */}
      {activeTab === 'url' && (
        <div className="bg-white border border-[#E5E5E3] rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="nyt-urls" className="text-sm font-semibold text-[#141413]">
              输入文章 URL（每行一个，单次最多支持 25 篇批量抓取）
            </label>
            <span className="text-xs font-mono tabular-nums text-[#6B6B66]">
              已识别 {parsedUrls.length} 条链接
            </span>
          </div>

          <textarea
            id="nyt-urls"
            rows={5}
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://cn.nytimes.com/china/20261125/shanghai-party-leader-investigation-china-xi/dual/"
            className="w-full font-mono text-xs leading-relaxed p-3.5 bg-[#FAFAF8] border border-[#D8D8D4] rounded-lg text-[#141413] placeholder:text-[#9A9A94] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F]"
          />

          {/* Normalized Preview */}
          {parsedUrls.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-[#6B6B66]">双语目标地址预览（自动规范为 /dual/）</p>
              <div className="max-h-28 overflow-y-auto border border-[#ECECE8] rounded-lg divide-y divide-[#ECECE8] bg-[#FAFAF8]">
                {parsedUrls.map((u, i) => (
                  <div
                    key={u}
                    className="flex items-center gap-2.5 px-3 py-1.5 text-xs font-mono text-[#4A4A46]"
                  >
                    <span className="text-[#8A8A84] tabular-nums w-5">{i + 1}.</span>
                    <Link2 className="w-3.5 h-3.5 text-[#1E3A5F] shrink-0" />
                    <span className="truncate">{normalizeUrlPreview(u)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {urlError && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#991B1B]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{urlError}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
            <p className="text-xs text-[#6B6B66]">
              自动提取英文与中文标题并放置于首行，按段落自动左右配对。
            </p>
            <div className="flex items-center gap-2.5">
              {(urlInput.trim() || fetchLogs.length > 0 || urlError) && (
                <button
                  type="button"
                  onClick={() => {
                    setUrlInput('');
                    setFetchLogs([]);
                    setUrlError(null);
                  }}
                  className="px-3.5 py-2.5 text-xs font-medium text-[#575752] bg-[#FAFAF8] border border-[#D8D8D4] rounded-lg hover:bg-[#F0F0EC] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  清空链接输入
                </button>
              )}
              <button
                type="button"
                onClick={handleFetchUrls}
                disabled={isFetching || parsedUrls.length === 0}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-[#1E3A5F] rounded-lg hover:bg-[#162D4A] disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isFetching ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    正在抓取并解析...
                  </>
                ) : (
                  <>
                    开始获取并对齐 ({parsedUrls.length})
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Fetch Results Log */}
          {fetchLogs.length > 0 && (
            <div className="pt-4 border-t border-[#E5E5E3] space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-[#141413]">抓取结果明细</h3>
                <span className="text-xs font-mono tabular-nums text-[#6B6B66]">
                  成功 {fetchLogs.filter((r) => r.ok).length} / 共 {fetchLogs.length}
                </span>
              </div>
              <div className="space-y-2">
                {fetchLogs.map((log, i) => (
                  <div
                    key={`${log.inputUrl}-${i}`}
                    className={`p-3 rounded-lg border text-xs space-y-1 ${
                      log.ok
                        ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#166534]'
                        : 'bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2 min-w-0">
                        {log.ok ? (
                          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#16A34A]" />
                        ) : (
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#D97706]" />
                        )}
                        <div className="min-w-0">
                          <div className="font-medium truncate">
                            {log.ok && log.article
                              ? `${log.article.titleZh} · ${log.article.titleEn}`
                              : log.canonicalDualUrl}
                          </div>
                          <div className="text-[11px] opacity-90 mt-0.5">
                            {log.ok && log.article
                              ? `已加入左侧语料队列 · 共 ${log.article.pairs.length} 行（含首行标题）`
                              : log.error}
                          </div>
                          {!log.ok && log.hint && (
                            <div className="text-[11px] opacity-85 mt-1 leading-relaxed">
                              建议：{log.hint}
                            </div>
                          )}
                        </div>
                      </div>
                      {!log.ok && (
                        <button
                          type="button"
                          onClick={() => {
                            setHtmlSourceUrl(log.canonicalDualUrl);
                            setActiveTab('html');
                          }}
                          className="px-2.5 py-1 text-[11px] font-medium bg-white border border-[#FCD34D] text-[#92400E] rounded hover:bg-[#FEF3C7] whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          改用 HTML 导入
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: HTML Upload / Paste */}
      {activeTab === 'html' && (
        <div className="bg-white border border-[#E5E5E3] rounded-xl p-6 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#ECECE8] pb-4">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-[#141413]">
                从本地保存的 /dual/ 网页文件或源码提取
              </h2>
              <p className="text-xs text-[#6B6B66]">
                在浏览器打开 <span className="font-mono">cn.nytimes.com/.../dual/</span> 后按 Ctrl+S 保存网页，支持同时多选多个 <span className="font-mono">.html</span> 文件批量导入。
              </p>
            </div>
            <div className="shrink-0">
              <input
                ref={fileInputRef}
                type="file"
                accept=".html,.htm,.xhtml"
                multiple
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isParsingHtml}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-[#141413] bg-[#FAFAF8] border border-[#D8D8D4] rounded-lg hover:bg-[#F0F0EC] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                批量选择本地 HTML 文件
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor="html-source-url" className="block text-xs font-medium text-[#4A4A46] mb-1.5">
                原始文章链接（选填，用于自动记录日期与栏目元数据）
              </label>
              <input
                id="html-source-url"
                type="text"
                value={htmlSourceUrl}
                onChange={(e) => setHtmlSourceUrl(e.target.value)}
                placeholder="https://cn.nytimes.com/china/20261125/.../dual/"
                className="w-full font-mono text-xs px-3.5 py-2 bg-[#FAFAF8] border border-[#D8D8D4] rounded-lg text-[#141413] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F]"
              />
            </div>

            <div>
              <label htmlFor="html-raw-input" className="block text-xs font-medium text-[#4A4A46] mb-1.5">
                或直接粘贴网页源代码（View Source）
              </label>
              <textarea
                id="html-raw-input"
                rows={7}
                value={htmlContent}
                onChange={(e) => setHtmlContent(e.target.value)}
                placeholder="<!DOCTYPE html>..."
                className="w-full font-mono text-xs p-3.5 bg-[#FAFAF8] border border-[#D8D8D4] rounded-lg text-[#141413] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F]"
              />
            </div>
          </div>

          {htmlStatus && (
            <div
              className={`flex items-start gap-2 p-3 rounded-lg border text-xs ${
                htmlStatus.ok
                  ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#166534]'
                  : 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]'
              }`}
            >
              {htmlStatus.ok ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <span>{htmlStatus.msg}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5">
            {(htmlContent.trim() || htmlSourceUrl.trim() || htmlStatus) && (
              <button
                type="button"
                onClick={() => {
                  setHtmlContent('');
                  setHtmlSourceUrl('');
                  setHtmlStatus(null);
                }}
                className="px-3.5 py-2.5 text-xs font-medium text-[#575752] bg-[#FAFAF8] border border-[#D8D8D4] rounded-lg hover:bg-[#F0F0EC] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                清空源码输入
              </button>
            )}
            <button
              type="button"
              onClick={() => handleParseHtml()}
              disabled={isParsingHtml || !htmlContent.trim()}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-[#1E3A5F] rounded-lg hover:bg-[#162D4A] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isParsingHtml ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  正在解析...
                </>
              ) : (
                '解析 HTML 并加入对齐队列'
              )}
            </button>
          </div>
        </div>
      )}

      {/* Tab 3: Raw Bilingual Text */}
      {activeTab === 'text' && (
        <div className="bg-white border border-[#E5E5E3] rounded-xl p-6 space-y-5">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-[#141413]">双语纯文本快速对齐导入</h2>
            <p className="text-xs text-[#6B6B66]">
              支持直接从双语阅读页复制文本粘贴（自动按英汉交替段落配对，或识别 Tab 制表符分隔文本），标题将自动放在首行。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="raw-title-en" className="block text-xs font-medium text-[#4A4A46] mb-1.5">
                英文标题（置于首行左侧）
              </label>
              <input
                id="raw-title-en"
                type="text"
                value={rawTitleEn}
                onChange={(e) => setRawTitleEn(e.target.value)}
                placeholder="English Headline..."
                className="w-full text-sm px-3.5 py-2 bg-[#FAFAF8] border border-[#D8D8D4] rounded-lg text-[#141413] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F]"
              />
            </div>
            <div>
              <label htmlFor="raw-title-zh" className="block text-xs font-medium text-[#4A4A46] mb-1.5">
                中文标题（置于首行右侧）
              </label>
              <input
                id="raw-title-zh"
                type="text"
                value={rawTitleZh}
                onChange={(e) => setRawTitleZh(e.target.value)}
                placeholder="中文标题..."
                className="w-full text-sm px-3.5 py-2 bg-[#FAFAF8] border border-[#D8D8D4] rounded-lg text-[#141413] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="raw-body-text" className="block text-xs font-medium text-[#4A4A46] mb-1.5">
              双语正文内容（英汉交替段落，或每行以 Tab 分隔）
            </label>
            <textarea
              id="raw-body-text"
              rows={8}
              value={rawBody}
              onChange={(e) => setRawBody(e.target.value)}
              placeholder={'English paragraph 1...\n中文第一段...\n\nEnglish paragraph 2...\n中文第二段...'}
              className="w-full text-sm leading-relaxed p-3.5 bg-[#FAFAF8] border border-[#D8D8D4] rounded-lg text-[#141413] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F]"
            />
          </div>

          {textStatus && (
            <div
              className={`flex items-start gap-2 p-3 rounded-lg border text-xs ${
                textStatus.ok
                  ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#166534]'
                  : 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]'
              }`}
            >
              {textStatus.ok ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <span>{textStatus.msg}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5">
            {(rawBody.trim() || rawTitleEn.trim() || rawTitleZh.trim() || textStatus) && (
              <button
                type="button"
                onClick={() => {
                  setRawTitleEn('');
                  setRawTitleZh('');
                  setRawBody('');
                  setTextStatus(null);
                }}
                className="px-3.5 py-2.5 text-xs font-medium text-[#575752] bg-[#FAFAF8] border border-[#D8D8D4] rounded-lg hover:bg-[#F0F0EC] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                清空文本输入
              </button>
            )}
            <button
              type="button"
              onClick={handleImportRawText}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-[#1E3A5F] rounded-lg hover:bg-[#162D4A] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              生成左右对齐并加入队列
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
