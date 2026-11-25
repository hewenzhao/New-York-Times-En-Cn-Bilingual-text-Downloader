import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
} from 'lucide-react';
import type { BilingualArticle, CorpusStats, ExportOptions } from '../types/corpus';
import {
  buildTmxContent,
  buildTsvContent,
  computeCorpusStats,
} from '../utils/corpusEngine';

interface ExportStudioProps {
  articles: BilingualArticle[];
  selectedIds: string[];
  activeArticle: BilingualArticle | null;
  exportOptions: ExportOptions;
  onChangeOptions: (next: ExportOptions) => void;
}

export const ExportStudio: React.FC<ExportStudioProps> = ({
  articles,
  selectedIds,
  activeArticle,
  exportOptions,
  onChangeOptions,
}) => {
  const [filename, setFilename] = useState('nytimes_en_cn_aligned');
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<{ ok: boolean; msg: string } | null>(
    null
  );

  const exportArticles = useMemo(() => {
    if (exportOptions.mode === 'single') {
      return activeArticle ? [activeArticle] : articles.slice(0, 1);
    }
    const selSet = new Set(selectedIds);
    const chosen = articles.filter((a) => selSet.has(a.id));
    return chosen.length > 0 ? chosen : articles;
  }, [exportOptions.mode, activeArticle, articles, selectedIds]);

  const aggregateStats = useMemo(
    () => computeCorpusStats(exportArticles),
    [exportArticles]
  );

  const perArticleStats = useMemo(() => {
    const map: Record<string, CorpusStats> = {};
    for (const a of exportArticles) {
      map[a.id] = computeCorpusStats([a]);
    }
    return map;
  }, [exportArticles]);

  const previewRows = useMemo(() => {
    const first = exportArticles[0];
    if (!first) return [];
    const rows: Array<{
      excelRow: number;
      type: 'header' | 'title' | 'body';
      en: string;
      zh: string;
      idxVal: string | number;
    }> = [];

    let r = 1;
    if (exportOptions.titlePlacement === 'header-plus-title-row') {
      rows.push({
        excelRow: r++,
        type: 'header',
        idxVal: '#',
        en: exportOptions.enColumnLabel || 'English',
        zh: exportOptions.zhColumnLabel || '中文',
      });
    }

    first.pairs.slice(0, 5).forEach((p, idx) => {
      const isTitle = Boolean(p.isTitle) || idx === 0;
      rows.push({
        excelRow: r++,
        type: isTitle ? 'title' : 'body',
        idxVal: isTitle ? 'Title' : idx + 1,
        en: p.en,
        zh: p.zh,
      });
    });
    return rows;
  }, [exportArticles, exportOptions]);

  const handleDownloadXlsx = async () => {
    if (exportArticles.length === 0) {
      setExportStatus({ ok: false, msg: '当前没有可导出的双语文章' });
      return;
    }

    setIsExporting(true);
    setExportStatus(null);
    try {
      const res = await fetch('/api/export-xlsx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articles: exportArticles,
          options: exportOptions,
          aggregateStats,
          perArticleStats,
          filename: filename.trim() || 'nytimes_en_cn_aligned',
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename.trim() || 'nytimes_en_cn_aligned'}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setExportStatus({
        ok: true,
        msg: `已成功导出 ${exportArticles.length} 篇文章（共 ${aggregateStats.pairCount} 行对齐）至 Excel 工作簿 (.xlsx)`,
      });
    } catch (err) {
      setExportStatus({
        ok: false,
        msg: err instanceof Error ? err.message : 'XLSX 导出失败',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const triggerTextDownload = (content: string, ext: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename.trim() || 'nytimes_en_cn_aligned'}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#E5E5E3] pb-5">
        <div className="space-y-1">
          <p className="text-xs font-medium text-[#6B6B66]">
            Excel 工作簿排版 · 批量多表交付 · 语料库格式导出
          </p>
          <h1 className="font-editorial text-2xl font-semibold text-[#141413]">
            导出英汉左右对齐 XLSX 文件
          </h1>
        </div>

        <div className="text-xs font-mono tabular-nums text-[#4A4A46]">
          待导出：{exportArticles.length} 篇文章 · {aggregateStats.pairCount} 行对齐
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Configuration Column */}
        <div className="lg:col-span-5 bg-white border border-[#E5E5E3] rounded-xl p-5 space-y-5">
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-[#141413]">
              1. 导出模式（单篇 / 批量）
            </label>
            <div className="space-y-2 text-xs">
              <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-[#ECECE8] hover:bg-[#FAFAF8] cursor-pointer">
                <input
                  type="radio"
                  name="exportMode"
                  checked={exportOptions.mode === 'single'}
                  onChange={() =>
                    onChangeOptions({ ...exportOptions, mode: 'single' })
                  }
                  className="mt-0.5 accent-[#1E3A5F]"
                />
                <div>
                  <div className="font-medium text-[#141413]">仅导出当前文章</div>
                  <div className="text-[11px] text-[#6B6B66] mt-0.5">
                    生成单个 Aligned_Text 工作表
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-[#ECECE8] hover:bg-[#FAFAF8] cursor-pointer">
                <input
                  type="radio"
                  name="exportMode"
                  checked={exportOptions.mode === 'multi-sheet'}
                  onChange={() =>
                    onChangeOptions({ ...exportOptions, mode: 'multi-sheet' })
                  }
                  className="mt-0.5 accent-[#1E3A5F]"
                />
                <div>
                  <div className="font-medium text-[#141413]">
                    批量导出：每篇文章独立工作表 (Multi-Sheet)
                  </div>
                  <div className="text-[11px] text-[#6B6B66] mt-0.5">
                    含首页 Summary_Index 索引表，每篇单独一个 Sheet
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-[#ECECE8] hover:bg-[#FAFAF8] cursor-pointer">
                <input
                  type="radio"
                  name="exportMode"
                  checked={exportOptions.mode === 'merged'}
                  onChange={() =>
                    onChangeOptions({ ...exportOptions, mode: 'merged' })
                  }
                  className="mt-0.5 accent-[#1E3A5F]"
                />
                <div>
                  <div className="font-medium text-[#141413]">
                    批量导出：合并为单一平行语料表 (Merged Sheet)
                  </div>
                  <div className="text-[11px] text-[#6B6B66] mt-0.5">
                    多篇文章依次上下拼接至同一张表，适合语料库构建
                  </div>
                </div>
              </label>
            </div>
          </div>

          <div className="space-y-2 border-t border-[#ECECE8] pt-4">
            <label className="block text-xs font-semibold text-[#141413]">
              2. 首行标题规则
            </label>
            <div className="space-y-2 text-xs">
              <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-[#ECECE8] hover:bg-[#FAFAF8] cursor-pointer">
                <input
                  type="radio"
                  name="titlePlacement"
                  checked={exportOptions.titlePlacement === 'first-row-no-header'}
                  onChange={() =>
                    onChangeOptions({
                      ...exportOptions,
                      titlePlacement: 'first-row-no-header',
                    })
                  }
                  className="mt-0.5 accent-[#1E3A5F]"
                />
                <div>
                  <div className="font-medium text-[#141413]">
                    标题直接置于第 1 行（无列名表头）
                  </div>
                  <div className="text-[11px] text-[#6B6B66] mt-0.5">
                    第 1 行即「英文标题 | 中文标题」，加粗高亮并冻结首行
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-[#ECECE8] hover:bg-[#FAFAF8] cursor-pointer">
                <input
                  type="radio"
                  name="titlePlacement"
                  checked={exportOptions.titlePlacement === 'header-plus-title-row'}
                  onChange={() =>
                    onChangeOptions({
                      ...exportOptions,
                      titlePlacement: 'header-plus-title-row',
                    })
                  }
                  className="mt-0.5 accent-[#1E3A5F]"
                />
                <div>
                  <div className="font-medium text-[#141413]">
                    第 1 行为表头 + 第 2 行为文章标题
                  </div>
                  <div className="text-[11px] text-[#6B6B66] mt-0.5">
                    第 1 行为 English / 中文表头，紧接双语标题行
                  </div>
                </div>
              </label>
            </div>
          </div>

          <div className="space-y-2 border-t border-[#ECECE8] pt-4 text-xs">
            <label className="block font-semibold text-[#141413]">
              3. 附加列与语料报告页
            </label>
            <label className="flex items-center gap-2 py-1 cursor-pointer">
              <input
                type="checkbox"
                checked={exportOptions.includeIndexColumn}
                onChange={(e) =>
                  onChangeOptions({
                    ...exportOptions,
                    includeIndexColumn: e.target.checked,
                  })
                }
                className="accent-[#1E3A5F]"
              />
              <span>在最左侧增加行序号列（默认仅保留英文/中文两列）</span>
            </label>
            <label className="flex items-center gap-2 py-1 cursor-pointer">
              <input
                type="checkbox"
                checked={exportOptions.includeMetadataSheet}
                onChange={(e) =>
                  onChangeOptions({
                    ...exportOptions,
                    includeMetadataSheet: e.target.checked,
                  })
                }
                className="accent-[#1E3A5F]"
              />
              <span>附带 Metadata 元数据工作表（链接/日期/栏目）</span>
            </label>
            <label className="flex items-center gap-2 py-1 cursor-pointer">
              <input
                type="checkbox"
                checked={exportOptions.includeStatsSheet}
                onChange={(e) =>
                  onChangeOptions({
                    ...exportOptions,
                    includeStatsSheet: e.target.checked,
                  })
                }
                className="accent-[#1E3A5F]"
              />
              <span>附带 Corpus_Stats 语料词频与统计工作表</span>
            </label>
            {exportOptions.mode === 'merged' && (
              <label className="flex items-center gap-2 py-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={exportOptions.includeArticleSeparatorInMerged}
                  onChange={(e) =>
                    onChangeOptions({
                      ...exportOptions,
                      includeArticleSeparatorInMerged: e.target.checked,
                    })
                  }
                  className="accent-[#1E3A5F]"
                />
                <span>合并导出时在文章之间插入来源分隔行</span>
              </label>
            )}
          </div>

          <div className="space-y-2 border-t border-[#ECECE8] pt-4">
            <label htmlFor="xlsx-filename" className="block text-xs font-semibold text-[#141413]">
              导出文件名
            </label>
            <div className="flex items-center gap-2">
              <input
                id="xlsx-filename"
                type="text"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                className="flex-1 text-xs font-mono px-3 py-2 bg-[#FAFAF8] border border-[#D8D8D4] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F]"
              />
              <span className="text-xs font-mono text-[#6B6B66]">.xlsx</span>
            </div>
          </div>
        </div>

        {/* Preview & Action Column */}
        <div className="lg:col-span-7 space-y-5">
          <div className="bg-white border border-[#E5E5E3] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#ECECE8] pb-3">
              <h2 className="text-sm font-semibold text-[#141413]">
                Excel 单元格排版预览（前 {previewRows.length} 行）
              </h2>
              <span className="text-xs text-[#6B6B66]">
                自动换行 · 顶部对齐 · 宽列自适应
              </span>
            </div>

            {previewRows.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#8A8A84]">
                暂无数据可供预览，请先采集或导入文章
              </div>
            ) : (
              <div className="border border-[#D8D8D4] rounded-lg overflow-hidden text-xs">
                {/* Simulated Excel Column Letters */}
                <div
                  className={`grid ${
                    exportOptions.includeIndexColumn
                      ? 'grid-cols-[36px_48px_1fr_1fr]'
                      : 'grid-cols-[36px_1fr_1fr]'
                  } bg-[#F3F3F0] border-b border-[#D8D8D4] text-[11px] font-mono text-[#6B6B66] text-center`}
                >
                  <div className="py-1 border-r border-[#D8D8D4]" />
                  {exportOptions.includeIndexColumn && (
                    <div className="py-1 border-r border-[#D8D8D4]">A</div>
                  )}
                  <div className="py-1 border-r border-[#D8D8D4]">
                    {exportOptions.includeIndexColumn ? 'B' : 'A'}
                  </div>
                  <div className="py-1">
                    {exportOptions.includeIndexColumn ? 'C' : 'B'}
                  </div>
                </div>

                {previewRows.map((row) => (
                  <div
                    key={row.excelRow}
                    className={`grid ${
                      exportOptions.includeIndexColumn
                        ? 'grid-cols-[36px_48px_1fr_1fr]'
                        : 'grid-cols-[36px_1fr_1fr]'
                    } border-b last:border-b-0 border-[#ECECE8] ${
                      row.type === 'header'
                        ? 'bg-[#1E3A5F] text-white font-semibold'
                        : row.type === 'title'
                        ? 'bg-[#EEF2F7] text-[#141413] font-semibold'
                        : 'bg-white text-[#1F2937]'
                    }`}
                  >
                    <div className="py-2 px-1 text-center font-mono tabular-nums text-[11px] bg-[#F3F3F0] text-[#6B6B66] border-r border-[#D8D8D4] font-normal">
                      {row.excelRow}
                    </div>
                    {exportOptions.includeIndexColumn && (
                      <div className="p-2 text-center font-mono tabular-nums border-r border-[#E5E5E3]/50">
                        {row.idxVal}
                      </div>
                    )}
                    <div className="p-2.5 border-r border-[#E5E5E3]/50 leading-relaxed">
                      {row.en}
                    </div>
                    <div className="p-2.5 leading-relaxed">{row.zh}</div>
                  </div>
                ))}
              </div>
            )}

            {exportStatus && (
              <div
                className={`flex items-start gap-2 p-3 rounded-lg border text-xs ${
                  exportStatus.ok
                    ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#166534]'
                    : 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]'
                }`}
              >
                {exportStatus.ok ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{exportStatus.msg}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={exportArticles.length === 0}
                  onClick={() =>
                    triggerTextDownload(
                      buildTsvContent(
                        exportArticles,
                        exportOptions.titlePlacement === 'header-plus-title-row'
                      ),
                      'tsv',
                      'text/tab-separated-values;charset=utf-8'
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#4A4A46] bg-[#FAFAF8] border border-[#D8D8D4] rounded-lg hover:bg-[#F0F0EC] disabled:opacity-40 transition-colors cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  下载 TSV 语料
                </button>
                <button
                  type="button"
                  disabled={exportArticles.length === 0}
                  onClick={() =>
                    triggerTextDownload(
                      buildTmxContent(exportArticles),
                      'tmx',
                      'application/xml;charset=utf-8'
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#4A4A46] bg-[#FAFAF8] border border-[#D8D8D4] rounded-lg hover:bg-[#F0F0EC] disabled:opacity-40 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  下载 TMX 记忆库
                </button>
              </div>

              <button
                type="button"
                onClick={handleDownloadXlsx}
                disabled={isExporting || exportArticles.length === 0}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-[#1E3A5F] rounded-lg hover:bg-[#162D4A] disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    正在生成 XLSX...
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-4 h-4" />
                    生成并下载 .xlsx 文件
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
