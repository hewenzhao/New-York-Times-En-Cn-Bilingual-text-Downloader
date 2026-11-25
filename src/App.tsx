import { useEffect, useMemo, useState } from 'react';
import {
  CheckSquare,
  Download,
  Loader2,
  Plus,
  Square,
  Trash2,
} from 'lucide-react';
import { AcquisitionPanel } from './components/AcquisitionPanel';
import { AlignmentEditor } from './components/AlignmentEditor';
import { CorpusWorkbench } from './components/CorpusWorkbench';
import { ExportStudio } from './components/ExportStudio';
import { createSampleArticles } from './data/sampleArticles';
import type { BilingualArticle, CorpusStats, ExportOptions } from './types/corpus';
import { computeCorpusStats } from './utils/corpusEngine';

type WorkspaceView = 'acquire' | 'align' | 'corpus' | 'export';

const STORAGE_KEY = 'nyt_encn_downloader_articles_v1';

export default function App() {
  const [view, setView] = useState<WorkspaceView>('acquire');
  const [articles, setArticles] = useState<BilingualArticle[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return [];
  });

  const [activeId, setActiveId] = useState<string | null>(() => {
    return articles[0]?.id ?? null;
  });

  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    articles.map((a) => a.id)
  );

  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    mode: 'multi-sheet',
    titlePlacement: 'first-row-no-header',
    enColumnLabel: 'English',
    zhColumnLabel: '中文',
    includeMetadataSheet: true,
    includeStatsSheet: true,
    includeArticleSeparatorInMerged: true,
    includeIndexColumn: false,
  });

  const [isQuickExporting, setIsQuickExporting] = useState(false);

  const [confirmClearSidebar, setConfirmClearSidebar] = useState(false);

  useEffect(() => {
    try {
      if (articles.length === 0) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(articles));
      }
    } catch {
      // ignore quota errors
    }
  }, [articles]);

  useEffect(() => {
    if (articles.length > 0 && (!activeId || !articles.some((a) => a.id === activeId))) {
      setActiveId(articles[0].id);
    } else if (articles.length === 0) {
      setActiveId(null);
    }
  }, [articles, activeId]);

  const activeArticle = useMemo(
    () => articles.find((a) => a.id === activeId) ?? null,
    [articles, activeId]
  );

  const handleArticlesAdded = (incoming: BilingualArticle[]) => {
    setArticles((prev) => [...incoming, ...prev]);
    setSelectedIds((prev) => [
      ...incoming.map((a) => a.id),
      ...prev.filter((id) => !incoming.some((a) => a.id === id)),
    ]);
    if (incoming[0]) {
      setActiveId(incoming[0].id);
      setView('align');
    }
  };

  const handleLoadSamples = () => {
    const samples = createSampleArticles();
    setArticles((prev) => {
      const existingIds = new Set(prev.map((a) => a.id));
      const fresh = samples.filter((s) => !existingIds.has(s.id));
      return [...fresh, ...prev];
    });
    setSelectedIds((prev) => {
      const merged = new Set([...prev, ...samples.map((s) => s.id)]);
      return Array.from(merged);
    });
    setActiveId(samples[0].id);
    setView('align');
  };

  const handleUpdateSingleArticle = (updated: BilingualArticle) => {
    setArticles((prev) =>
      prev.map((a) => (a.id === updated.id ? updated : a))
    );
  };

  const handleDeleteArticle = (id: string) => {
    setArticles((prev) => prev.filter((a) => a.id !== id));
    setSelectedIds((prev) => prev.filter((sid) => sid !== id));
  };

  const handleClearAllLoaded = () => {
    setArticles([]);
    setSelectedIds([]);
    setActiveId(null);
    setConfirmClearSidebar(false);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.length === articles.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(articles.map((a) => a.id));
    }
  };

  const handleQuickExportXlsx = async () => {
    if (articles.length === 0) {
      setView('acquire');
      return;
    }

    const selSet = new Set(selectedIds);
    const chosen = articles.filter((a) => selSet.has(a.id));
    const targetList = chosen.length > 0 ? chosen : articles;

    const effectiveOptions: ExportOptions =
      targetList.length === 1
        ? { ...exportOptions, mode: 'single' }
        : exportOptions.mode === 'single'
        ? { ...exportOptions, mode: 'multi-sheet' }
        : exportOptions;

    const aggregateStats = computeCorpusStats(targetList);
    const perArticleStats: Record<string, CorpusStats> = {};
    for (const a of targetList) {
      perArticleStats[a.id] = computeCorpusStats([a]);
    }

    setIsQuickExporting(true);
    try {
      const res = await fetch('/api/export-xlsx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articles: targetList,
          options: effectiveOptions,
          aggregateStats,
          perArticleStats,
          filename:
            targetList.length === 1
              ? `${targetList[0].metadata.date}_${targetList[0].titleZh.slice(0, 24)}`
              : `nytimes_batch_${targetList.length}_articles`,
        }),
      });
      if (!res.ok) {
        setView('export');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        targetList.length === 1
          ? `${targetList[0].metadata.date || 'nyt'}_aligned.xlsx`
          : `nytimes_en_cn_batch_${targetList.length}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setIsQuickExporting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F8F6] text-[#141413]">
      {/* Strict 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-[#E5E5E3] px-6 h-14 flex items-center justify-between gap-8">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setView('acquire');
          }}
          className="font-editorial text-lg font-semibold tracking-tight text-[#141413] whitespace-nowrap shrink-0"
        >
          New York Times EN-CN Bilingual-text Downloader
        </a>

        <nav className="flex items-center gap-6 text-xs font-medium text-[#575752] overflow-x-auto">
          <button
            type="button"
            onClick={() => setView('acquire')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
              view === 'acquire'
                ? 'text-[#141413] border-[#1E3A5F] font-semibold'
                : 'border-transparent hover:text-[#141413]'
            }`}
          >
            采集导入
          </button>
          <button
            type="button"
            onClick={() => setView('align')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
              view === 'align'
                ? 'text-[#141413] border-[#1E3A5F] font-semibold'
                : 'border-transparent hover:text-[#141413]'
            }`}
          >
            对齐校对
          </button>
          <button
            type="button"
            onClick={() => setView('corpus')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
              view === 'corpus'
                ? 'text-[#141413] border-[#1E3A5F] font-semibold'
                : 'border-transparent hover:text-[#141413]'
            }`}
          >
            语料处理
          </button>
          <button
            type="button"
            onClick={() => setView('export')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
              view === 'export'
                ? 'text-[#141413] border-[#1E3A5F] font-semibold'
                : 'border-transparent hover:text-[#141413]'
            }`}
          >
            导出设置
          </button>
        </nav>

        <div className="shrink-0">
          <button
            type="button"
            onClick={handleQuickExportXlsx}
            disabled={isQuickExporting}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#1E3A5F] rounded-lg hover:bg-[#162D4A] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isQuickExporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            导出 XLSX
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex min-h-0">
        {/* Persistent Queue Sidebar (shown when articles exist and user is in editing/corpus/export views, or on wide screen) */}
        {articles.length > 0 && view !== 'acquire' && (
          <aside className="hidden lg:flex w-[276px] shrink-0 flex-col bg-white border-r border-[#E5E5E3]">
            <div className="px-4 py-3 border-b border-[#ECECE8] flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleToggleSelectAll}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#4A4A46] hover:text-[#141413] cursor-pointer"
              >
                {selectedIds.length === articles.length ? (
                  <CheckSquare className="w-3.5 h-3.5 text-[#1E3A5F]" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-[#8A8A84]" />
                )}
                <span>
                  语料队列 ({selectedIds.length}/{articles.length})
                </span>
              </button>

              <button
                type="button"
                onClick={() => setView('acquire')}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#1E3A5F] hover:underline cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                新增
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[#ECECE8]">
              {articles.map((art) => {
                const isActive = art.id === activeId;
                const isChecked = selectedIds.includes(art.id);
                return (
                  <div
                    key={art.id}
                    className={`group p-3.5 transition-colors flex items-start gap-2.5 ${
                      isActive ? 'bg-[#EEF2F7]/80' : 'hover:bg-[#FAFAF8]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleToggleSelect(art.id)}
                      className="mt-0.5 shrink-0 cursor-pointer"
                      aria-label={`选择 ${art.titleZh}`}
                    >
                      {isChecked ? (
                        <CheckSquare className="w-3.5 h-3.5 text-[#1E3A5F]" />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-[#A0A09A]" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveId(art.id)}
                      className="flex-1 text-left min-w-0 space-y-1 cursor-pointer"
                    >
                      <div
                        className={`text-xs leading-snug line-clamp-2 ${
                          isActive
                            ? 'font-semibold text-[#141413]'
                            : 'font-medium text-[#2A2A27]'
                        }`}
                      >
                        {art.titleZh}
                      </div>
                      <div className="text-[11px] text-[#6B6B66] truncate">
                        {art.titleEn}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-[#8A8A84] font-mono tabular-nums">
                        <span>{art.metadata.date}</span>
                        <span aria-hidden="true">·</span>
                        <span>{art.pairs.length} 行</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      title="移出队列"
                      onClick={() => handleDeleteArticle(art.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-[#8A8A84] hover:text-[#DC2626] rounded transition-opacity cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            {articles.length > 0 && (
              <div className="p-3 border-t border-[#ECECE8] flex items-center justify-between text-[11px] text-[#6B6B66] gap-2">
                <span>已选 {selectedIds.length} 篇</span>
                {confirmClearSidebar ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleClearAllLoaded}
                      className="text-[#DC2626] font-semibold hover:underline cursor-pointer whitespace-nowrap"
                    >
                      确认清除全部
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClearSidebar(false)}
                      className="text-[#6B6B66] hover:text-[#141413] cursor-pointer whitespace-nowrap"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmClearSidebar(true)}
                    className="inline-flex items-center gap-1 hover:text-[#DC2626] cursor-pointer whitespace-nowrap"
                  >
                    <Trash2 className="w-3 h-3" />
                    清除所载文本
                  </button>
                )}
              </div>
            )}
          </aside>
        )}

        {/* Main Content Viewport */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          {/* Compact Article Switcher for mobile/tablet when sidebar hidden */}
          {articles.length > 1 && view === 'align' && (
            <div className="lg:hidden px-6 pt-4">
              <select
                value={activeId ?? ''}
                onChange={(e) => setActiveId(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-white border border-[#D8D8D4] rounded-lg"
              >
                {articles.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.metadata.date} · {a.titleZh}
                  </option>
                ))}
              </select>
            </div>
          )}

          {view === 'acquire' && (
            <AcquisitionPanel
              loadedCount={articles.length}
              onArticlesAdded={handleArticlesAdded}
              onLoadSamples={handleLoadSamples}
              onClearAllLoaded={handleClearAllLoaded}
              onNavigateToAlign={() => setView('align')}
            />
          )}

          {view === 'align' && (
            <AlignmentEditor
              article={activeArticle}
              totalLoadedCount={articles.length}
              onUpdateArticle={handleUpdateSingleArticle}
              onRemoveArticle={handleDeleteArticle}
              onClearAllLoaded={handleClearAllLoaded}
              onGoToAcquire={() => setView('acquire')}
            />
          )}

          {view === 'corpus' && (
            <CorpusWorkbench
              articles={articles}
              selectedIds={selectedIds}
              activeArticle={activeArticle}
              onUpdateArticles={setArticles}
              onSelectArticle={(id) => {
                setActiveId(id);
                setView('align');
              }}
            />
          )}

          {view === 'export' && (
            <ExportStudio
              articles={articles}
              selectedIds={selectedIds}
              activeArticle={activeArticle}
              exportOptions={exportOptions}
              onChangeOptions={setExportOptions}
            />
          )}
        </main>
      </div>
    </div>
  );
}
