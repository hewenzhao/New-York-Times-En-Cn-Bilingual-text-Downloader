import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Combine,
  ExternalLink,
  Plus,
  RotateCcw,
  Scissors,
  Search,
  SplitSquareVertical,
  Trash2,
} from 'lucide-react';
import type { AlignedPair, BilingualArticle } from '../types/corpus';
import {
  isPotentialMisalignment,
  makeId,
  splitArticleToSentences,
} from '../utils/corpusEngine';

interface AlignmentEditorProps {
  article: BilingualArticle | null;
  totalLoadedCount: number;
  onUpdateArticle: (updated: BilingualArticle) => void;
  onRemoveArticle: (id: string) => void;
  onClearAllLoaded: () => void;
  onGoToAcquire: () => void;
}

export const AlignmentEditor: React.FC<AlignmentEditorProps> = ({
  article,
  totalLoadedCount,
  onUpdateArticle,
  onRemoveArticle,
  onClearAllLoaded,
  onGoToAcquire,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const flaggedCount = useMemo(() => {
    if (!article) return 0;
    return article.pairs.filter((p) => isPotentialMisalignment(p).flagged).length;
  }, [article]);

  const filteredPairs = useMemo(() => {
    if (!article) return [];
    const q = searchQuery.trim().toLowerCase();
    return article.pairs.filter((p) => {
      if (onlyFlagged && !isPotentialMisalignment(p).flagged) return false;
      if (!q) return true;
      return p.en.toLowerCase().includes(q) || p.zh.toLowerCase().includes(q);
    });
  }, [article, searchQuery, onlyFlagged]);

  if (!article) {
    return (
      <div className="max-w-3xl mx-auto my-16 px-6 text-center space-y-4">
        <h2 className="font-editorial text-2xl font-semibold text-[#141413]">
          尚无待校对的双语文章
        </h2>
        <p className="text-sm text-[#575752]">
          请先从 <span className="font-mono text-xs">cn.nytimes.com</span> 抓取双语链接、导入本地 HTML 网页或载入示例语料。
        </p>
        <button
          type="button"
          onClick={onGoToAcquire}
          className="inline-flex items-center px-5 py-2.5 text-xs font-semibold text-white bg-[#1E3A5F] rounded-lg hover:bg-[#162D4A] transition-colors cursor-pointer"
        >
          前往采集双语文章
        </button>
      </div>
    );
  }

  const reindexPairs = (pairs: AlignedPair[]): AlignedPair[] =>
    pairs.map((p, idx) => ({
      ...p,
      index: idx + 1,
      isTitle: idx === 0 ? true : Boolean(p.isTitle && idx === 0),
    }));

  const updatePairs = (nextPairs: AlignedPair[]) => {
    const normalized = reindexPairs(nextPairs);
    const first = normalized[0];
    onUpdateArticle({
      ...article,
      titleEn: first?.isTitle ? first.en : article.titleEn,
      titleZh: first?.isTitle ? first.zh : article.titleZh,
      pairs: normalized,
    });
  };

  const handleCellEdit = (pairId: string, field: 'en' | 'zh', value: string) => {
    const next = article.pairs.map((p) =>
      p.id === pairId ? { ...p, [field]: value } : p
    );
    updatePairs(next);
  };

  const handleShiftColumnCell = (
    idx: number,
    col: 'en' | 'zh',
    direction: 'up' | 'down'
  ) => {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= article.pairs.length) return;
    const next = article.pairs.map((p) => ({ ...p }));
    const tmp = next[idx][col];
    next[idx][col] = next[targetIdx][col];
    next[targetIdx][col] = tmp;
    updatePairs(next);
  };

  const handleMoveRow = (idx: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= article.pairs.length) return;
    const next = [...article.pairs];
    const [moved] = next.splice(idx, 1);
    next.splice(targetIdx, 0, moved);
    updatePairs(next);
  };

  const handleMergeWithNext = (idx: number) => {
    if (idx >= article.pairs.length - 1) return;
    const curr = article.pairs[idx];
    const nextRow = article.pairs[idx + 1];
    const merged: AlignedPair = {
      ...curr,
      en: [curr.en.trim(), nextRow.en.trim()].filter(Boolean).join(' '),
      zh: [curr.zh.trim(), nextRow.zh.trim()].filter(Boolean).join(''),
    };
    const next = [...article.pairs];
    next.splice(idx, 2, merged);
    updatePairs(next);
  };

  const handleSplitRowToSentences = (idx: number) => {
    const target = article.pairs[idx];
    const split = splitArticleToSentences([
      { ...target, isTitle: false },
    ]);
    if (split.length <= 1) return;
    const next = [...article.pairs];
    next.splice(idx, 1, ...split);
    updatePairs(next);
  };

  const handleInsertBelow = (idx: number) => {
    const next = [...article.pairs];
    next.splice(idx + 1, 0, {
      id: makeId('row'),
      index: idx + 2,
      isTitle: false,
      en: '',
      zh: '',
    });
    updatePairs(next);
  };

  const handleDeleteRow = (idx: number) => {
    if (article.pairs.length <= 1) return;
    const next = article.pairs.filter((_, i) => i !== idx);
    updatePairs(next);
  };

  const handleSentenceSplitAll = () => {
    const split = splitArticleToSentences(article.pairs);
    updatePairs(split);
  };

  const handleRestoreRaw = () => {
    updatePairs(article.rawPairs.map((p) => ({ ...p })));
  };

  const handlePinTitleFirstRow = () => {
    const existingTitleIdx = article.pairs.findIndex((p) => p.isTitle);
    if (existingTitleIdx === 0) return;
    if (existingTitleIdx > 0) {
      const next = [...article.pairs];
      const [t] = next.splice(existingTitleIdx, 1);
      next.unshift({ ...t, isTitle: true });
      updatePairs(next);
    } else {
      const next: AlignedPair[] = [
        {
          id: makeId('title'),
          index: 1,
          isTitle: true,
          en: article.titleEn,
          zh: article.titleZh,
        },
        ...article.pairs,
      ];
      updatePairs(next);
    }
  };

  return (
    <div className="p-6 space-y-5 max-w-[1320px] mx-auto">
      {/* Article Header & Controls */}
      <div className="bg-white border border-[#E5E5E3] rounded-xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#6B6B66]">
              <span>{article.metadata.section}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{article.metadata.date}</span>
              {article.metadata.byline && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="truncate max-w-xs">{article.metadata.byline}</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-[#141413]">
                共 {article.pairs.length} 行对齐
              </span>
            </div>
            <h2 className="font-editorial text-xl font-semibold text-[#141413] leading-snug text-balance">
              {article.titleZh}
            </h2>
            <p className="text-sm text-[#4A4A46] leading-snug">{article.titleEn}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {article.metadata.canonicalDualUrl.startsWith('http') && (
              <a
                href={article.metadata.canonicalDualUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#4A4A46] bg-[#FAFAF8] border border-[#D8D8D4] rounded-lg hover:bg-[#F0F0EC] transition-colors whitespace-nowrap shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                查看原网页
              </a>
            )}
            <button
              type="button"
              onClick={handleSentenceSplitAll}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#141413] bg-[#FAFAF8] border border-[#D8D8D4] rounded-lg hover:bg-[#F0F0EC] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <SplitSquareVertical className="w-3.5 h-3.5 text-[#1E3A5F]" />
              拆分为句级对齐
            </button>
            <button
              type="button"
              onClick={handleRestoreRaw}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#4A4A46] bg-[#FAFAF8] border border-[#D8D8D4] rounded-lg hover:bg-[#F0F0EC] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              恢复原始段落
            </button>
            <button
              type="button"
              onClick={() => onRemoveArticle(article.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-lg hover:bg-[#FEE2E2] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              清除当前篇
            </button>
            {totalLoadedCount > 1 && (
              confirmClearAll ? (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 text-xs bg-[#FEF2F2] border border-[#FCA5A5] rounded-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmClearAll(false);
                      onClearAllLoaded();
                    }}
                    className="font-semibold text-[#DC2626] hover:underline whitespace-nowrap cursor-pointer"
                  >
                    确认清空全部 ({totalLoadedCount} 篇)
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearAll(false)}
                    className="text-[#575752] hover:text-[#141413] whitespace-nowrap cursor-pointer"
                  >
                    取消
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#575752] bg-white border border-[#D8D8D4] rounded-lg hover:text-[#B91C1C] hover:border-[#FECACA] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  清除全部 ({totalLoadedCount})
                </button>
              )
            )}
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#ECECE8]">
          <div className="flex items-center gap-3 flex-1 min-w-[240px] max-w-md">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-[#8A8A84] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="筛选当前文章英文或中文行..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#FAFAF8] border border-[#D8D8D4] rounded-lg text-[#141413] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F]"
              />
            </div>
            <button
              type="button"
              onClick={() => setOnlyFlagged(!onlyFlagged)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                onlyFlagged
                  ? 'bg-[#FFFBEB] border-[#F59E0B] text-[#92400E]'
                  : 'bg-white border-[#D8D8D4] text-[#4A4A46] hover:bg-[#FAFAF8]'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              疑似错位 ({flaggedCount})
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs text-[#6B6B66]">
            <span>首行已固定为双语标题，可直接点击单元格编辑或微调错位。</span>
            {!article.pairs[0]?.isTitle && (
              <button
                type="button"
                onClick={handlePinTitleFirstRow}
                className="text-xs font-medium text-[#1E3A5F] underline cursor-pointer"
              >
                置顶标题至首行
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Bilingual Left-Right Aligned Table */}
      <div className="bg-white border border-[#E5E5E3] rounded-xl overflow-hidden">
        <div className="grid grid-cols-[64px_1fr_1fr_132px] bg-[#F5F5F2] border-b border-[#E5E5E3] text-xs font-semibold text-[#4A4A46]">
          <div className="px-3 py-2.5 text-center border-r border-[#E5E5E3]">行号</div>
          <div className="px-4 py-2.5 border-r border-[#E5E5E3]">English（左栏原文）</div>
          <div className="px-4 py-2.5 border-r border-[#E5E5E3]">中文（右栏译文）</div>
          <div className="px-3 py-2.5 text-center">对齐微调</div>
        </div>

        <div className="divide-y divide-[#ECECE8]">
          {filteredPairs.length === 0 ? (
            <div className="py-12 text-center text-sm text-[#6B6B66]">
              没有符合筛选条件的对齐行
            </div>
          ) : (
            filteredPairs.map((pair) => {
              const realIdx = article.pairs.findIndex((p) => p.id === pair.id);
              const isTitleRow = realIdx === 0 || Boolean(pair.isTitle);
              const check = isPotentialMisalignment(pair);

              return (
                <div
                  key={pair.id}
                  className={`grid grid-cols-[64px_1fr_1fr_132px] items-stretch transition-colors ${
                    isTitleRow
                      ? 'bg-[#EEF2F7]/75'
                      : check.flagged
                      ? 'bg-[#FFFBEB]/60'
                      : 'hover:bg-[#FAFAF8]'
                  }`}
                >
                  {/* Row Number & Status */}
                  <div className="px-2 py-3 border-r border-[#ECECE8] flex flex-col items-center justify-start gap-1 text-center">
                    <span className="font-mono tabular-nums text-xs font-semibold text-[#141413]">
                      {realIdx + 1}
                    </span>
                    {isTitleRow && (
                      <span className="text-[10px] font-semibold text-[#1E3A5F]">
                        首行标题
                      </span>
                    )}
                    {!isTitleRow && check.flagged && (
                      <span
                        title={check.reason}
                        className="text-[10px] font-medium text-[#B45309] leading-tight"
                      >
                        待核对
                      </span>
                    )}
                  </div>

                  {/* English Column */}
                  <div className="p-2.5 border-r border-[#ECECE8] flex flex-col gap-1.5">
                    <div className="flex items-start gap-1.5">
                      <textarea
                        value={pair.en}
                        onChange={(e) => handleCellEdit(pair.id, 'en', e.target.value)}
                        rows={Math.max(2, Math.min(8, Math.ceil(pair.en.length / 72)))}
                        className={`w-full resize-y bg-transparent text-sm leading-relaxed text-[#141413] px-1.5 py-1 rounded focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#1E3A5F] ${
                          isTitleRow ? 'font-semibold' : ''
                        }`}
                      />
                      <div className="flex flex-col gap-0.5 shrink-0 pt-1">
                        <button
                          type="button"
                          title="仅将此英文单元格上移一行"
                          disabled={realIdx <= 0}
                          onClick={() => handleShiftColumnCell(realIdx, 'en', 'up')}
                          className="p-1 text-[#8A8A84] hover:text-[#141413] hover:bg-[#ECECE8] rounded disabled:opacity-25 cursor-pointer"
                        >
                          <ChevronUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          title="仅将此英文单元格下移一行"
                          disabled={realIdx >= article.pairs.length - 1}
                          onClick={() => handleShiftColumnCell(realIdx, 'en', 'down')}
                          className="p-1 text-[#8A8A84] hover:text-[#141413] hover:bg-[#ECECE8] rounded disabled:opacity-25 cursor-pointer"
                        >
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Chinese Column */}
                  <div className="p-2.5 border-r border-[#ECECE8] flex flex-col gap-1.5">
                    <div className="flex items-start gap-1.5">
                      <textarea
                        value={pair.zh}
                        onChange={(e) => handleCellEdit(pair.id, 'zh', e.target.value)}
                        rows={Math.max(2, Math.min(8, Math.ceil(pair.zh.length / 36)))}
                        className={`w-full resize-y bg-transparent text-sm leading-relaxed text-[#141413] px-1.5 py-1 rounded focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#1E3A5F] ${
                          isTitleRow ? 'font-semibold' : ''
                        }`}
                      />
                      <div className="flex flex-col gap-0.5 shrink-0 pt-1">
                        <button
                          type="button"
                          title="仅将此中文单元格上移一行"
                          disabled={realIdx <= 0}
                          onClick={() => handleShiftColumnCell(realIdx, 'zh', 'up')}
                          className="p-1 text-[#8A8A84] hover:text-[#141413] hover:bg-[#ECECE8] rounded disabled:opacity-25 cursor-pointer"
                        >
                          <ChevronUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          title="仅将此中文单元格下移一行"
                          disabled={realIdx >= article.pairs.length - 1}
                          onClick={() => handleShiftColumnCell(realIdx, 'zh', 'down')}
                          className="p-1 text-[#8A8A84] hover:text-[#141413] hover:bg-[#ECECE8] rounded disabled:opacity-25 cursor-pointer"
                        >
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Row Actions */}
                  <div className="px-2 py-2.5 flex flex-wrap items-start justify-center gap-1">
                    <button
                      type="button"
                      title="整行上移"
                      disabled={realIdx <= 0}
                      onClick={() => handleMoveRow(realIdx, 'up')}
                      className="p-1.5 text-[#575752] hover:text-[#141413] hover:bg-[#ECECE8] rounded disabled:opacity-25 cursor-pointer"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title="整行下移"
                      disabled={realIdx >= article.pairs.length - 1}
                      onClick={() => handleMoveRow(realIdx, 'down')}
                      className="p-1.5 text-[#575752] hover:text-[#141413] hover:bg-[#ECECE8] rounded disabled:opacity-25 cursor-pointer"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title="与下一行合并"
                      disabled={realIdx >= article.pairs.length - 1}
                      onClick={() => handleMergeWithNext(realIdx)}
                      className="p-1.5 text-[#575752] hover:text-[#141413] hover:bg-[#ECECE8] rounded disabled:opacity-25 cursor-pointer"
                    >
                      <Combine className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title="按句拆分为多行"
                      onClick={() => handleSplitRowToSentences(realIdx)}
                      className="p-1.5 text-[#575752] hover:text-[#141413] hover:bg-[#ECECE8] rounded cursor-pointer"
                    >
                      <Scissors className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title="在下方插入空行"
                      onClick={() => handleInsertBelow(realIdx)}
                      className="p-1.5 text-[#575752] hover:text-[#141413] hover:bg-[#ECECE8] rounded cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title="删除此行"
                      disabled={article.pairs.length <= 1}
                      onClick={() => handleDeleteRow(realIdx)}
                      className="p-1.5 text-[#8A8A84] hover:text-[#DC2626] hover:bg-[#FEE2E2] rounded disabled:opacity-25 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
