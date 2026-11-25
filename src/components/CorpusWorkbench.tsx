import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Eraser,
  Replace,
  Search,
  SplitSquareVertical,
} from 'lucide-react';
import type { BilingualArticle, CorpusCleanOptions } from '../types/corpus';
import {
  applyFindReplace,
  cleanArticlePairs,
  computeCorpusStats,
  splitArticleToSentences,
} from '../utils/corpusEngine';

interface CorpusWorkbenchProps {
  articles: BilingualArticle[];
  selectedIds: string[];
  activeArticle: BilingualArticle | null;
  onUpdateArticles: (updater: (prev: BilingualArticle[]) => BilingualArticle[]) => void;
  onSelectArticle: (id: string) => void;
}

export const CorpusWorkbench: React.FC<CorpusWorkbenchProps> = ({
  articles,
  selectedIds,
  activeArticle,
  onUpdateArticles,
  onSelectArticle,
}) => {
  const [scope, setScope] = useState<'active' | 'batch'>('batch');
  const [cleanOptions, setCleanOptions] = useState<CorpusCleanOptions>({
    trimWhitespace: true,
    normalizeQuotes: false,
    normalizeZhPunctuation: true,
    removePhotoCredits: true,
    removeEmptyPairs: true,
    cjkLatinSpacing: 'keep',
  });
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Find & Replace state
  const [findPattern, setFindPattern] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [replaceTarget, setReplaceTarget] = useState<'en' | 'zh' | 'both'>('both');
  const [useRegex, setUseRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);

  // Concordance (KWIC) state
  const [kwicQuery, setKwicQuery] = useState('');
  const [kwicRegex, setKwicRegex] = useState(false);

  const targetArticles = useMemo(() => {
    if (scope === 'active' && activeArticle) return [activeArticle];
    const selectedSet = new Set(selectedIds);
    const matched = articles.filter((a) => selectedSet.has(a.id));
    return matched.length > 0 ? matched : articles;
  }, [scope, activeArticle, articles, selectedIds]);

  const stats = useMemo(() => computeCorpusStats(targetArticles), [targetArticles]);

  const targetIdSet = useMemo(
    () => new Set(targetArticles.map((a) => a.id)),
    [targetArticles]
  );

  const handleRunCleaning = () => {
    if (targetArticles.length === 0) return;
    let totalBefore = 0;
    let totalAfter = 0;

    onUpdateArticles((prev) =>
      prev.map((art) => {
        if (!targetIdSet.has(art.id)) return art;
        totalBefore += art.pairs.length;
        const nextPairs = cleanArticlePairs(art.pairs, cleanOptions);
        totalAfter += nextPairs.length;
        return {
          ...art,
          titleEn: nextPairs[0]?.isTitle ? nextPairs[0].en : art.titleEn,
          titleZh: nextPairs[0]?.isTitle ? nextPairs[0].zh : art.titleZh,
          pairs: nextPairs,
        };
      })
    );

    setActionNotice(
      `已完成语料清洗（作用域：${targetArticles.length} 篇文章，清理前 ${totalBefore} 行 → 清理后 ${totalAfter} 行）`
    );
  };

  const handleBatchSentenceSplit = () => {
    if (targetArticles.length === 0) return;
    let totalAfter = 0;
    onUpdateArticles((prev) =>
      prev.map((art) => {
        if (!targetIdSet.has(art.id)) return art;
        const split = splitArticleToSentences(art.pairs);
        totalAfter += split.length;
        return { ...art, pairs: split };
      })
    );
    setActionNotice(
      `已对 ${targetArticles.length} 篇文章执行句级拆分对齐，共生成 ${totalAfter} 个双语句对`
    );
  };

  const handleRunFindReplace = () => {
    if (!findPattern || targetArticles.length === 0) return;
    try {
      let totalAffected = 0;
      onUpdateArticles((prev) =>
        prev.map((art) => {
          if (!targetIdSet.has(art.id)) return art;
          const res = applyFindReplace(
            art.pairs,
            findPattern,
            replaceText,
            replaceTarget,
            useRegex,
            caseSensitive
          );
          totalAffected += res.affectedCount;
          return {
            ...art,
            titleEn: res.pairs[0]?.isTitle ? res.pairs[0].en : art.titleEn,
            titleZh: res.pairs[0]?.isTitle ? res.pairs[0].zh : art.titleZh,
            pairs: res.pairs,
          };
        })
      );
      setActionNotice(`已完成全文查找替换，共更新 ${totalAffected} 行双语文本`);
    } catch (err) {
      setActionNotice(
        `正则表达式语法有误：${err instanceof Error ? err.message : '请检查格式'}`
      );
    }
  };

  const kwicMatches = useMemo(() => {
    const q = kwicQuery.trim();
    if (!q) return [];
    const results: Array<{
      articleId: string;
      articleTitle: string;
      rowIndex: number;
      en: string;
      zh: string;
    }> = [];

    let re: RegExp | null = null;
    if (kwicRegex) {
      try {
        re = new RegExp(q, 'i');
      } catch {
        return [];
      }
    }

    for (const art of articles) {
      art.pairs.forEach((p, idx) => {
        const hit = re
          ? re.test(p.en) || re.test(p.zh)
          : p.en.toLowerCase().includes(q.toLowerCase()) ||
            p.zh.toLowerCase().includes(q.toLowerCase());
        if (hit) {
          results.push({
            articleId: art.id,
            articleTitle: art.titleZh,
            rowIndex: idx + 1,
            en: p.en,
            zh: p.zh,
          });
        }
      });
    }
    return results.slice(0, 120);
  }, [articles, kwicQuery, kwicRegex]);

  const highlightMatch = (text: string, query: string) => {
    const q = query.trim();
    if (!q) return text;
    try {
      const re = kwicRegex
        ? new RegExp(`(${q})`, 'gi')
        : new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      const parts = text.split(re);
      return parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-[#FEF08A] text-[#141413] px-0.5 rounded-xs">
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      );
    } catch {
      return text;
    }
  };

  const maxEnCount = stats.topEnWords[0]?.count || 1;
  const maxZhCount = stats.topZhTerms[0]?.count || 1;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header & Scope Toggle */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#E5E5E3] pb-5">
        <div className="space-y-1">
          <p className="text-xs font-medium text-[#6B6B66]">
            语料清洗 · 句级切分 · 正则替换 · 词频计量 · 平行检索
          </p>
          <h1 className="font-editorial text-2xl font-semibold text-[#141413]">
            全文语料处理工作台
          </h1>
        </div>

        <div className="inline-flex items-center gap-1 p-1 bg-[#EFEFEB] rounded-lg border border-[#E5E5E3] shrink-0">
          <button
            type="button"
            onClick={() => setScope('active')}
            disabled={!activeArticle}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer disabled:opacity-40 ${
              scope === 'active'
                ? 'bg-white text-[#141413] shadow-xs'
                : 'text-[#575752] hover:text-[#141413]'
            }`}
          >
            仅当前文章
          </button>
          <button
            type="button"
            onClick={() => setScope('batch')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              scope === 'batch'
                ? 'bg-white text-[#141413] shadow-xs'
                : 'text-[#575752] hover:text-[#141413]'
            }`}
          >
            全库 / 已选语料 ({targetArticles.length} 篇)
          </button>
        </div>
      </div>

      {actionNotice && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg text-xs text-[#166534]">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{actionNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionNotice(null)}
            className="text-[11px] underline cursor-pointer"
          >
            关闭
          </button>
        </div>
      )}

      {/* Quantitative Corpus Metrics Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-px bg-[#E5E5E3] border border-[#E5E5E3] rounded-xl overflow-hidden">
        <div className="bg-white p-4 space-y-1">
          <div className="text-xs text-[#6B6B66]">对齐总行数</div>
          <div className="font-mono tabular-nums text-xl font-semibold text-[#141413]">
            {stats.pairCount.toLocaleString()}
          </div>
        </div>
        <div className="bg-white p-4 space-y-1">
          <div className="text-xs text-[#6B6B66]">英文总词数 (Tokens)</div>
          <div className="font-mono tabular-nums text-xl font-semibold text-[#141413]">
            {stats.enTokens.toLocaleString()}
          </div>
        </div>
        <div className="bg-white p-4 space-y-1">
          <div className="text-xs text-[#6B6B66]">英文词汇量 (Types)</div>
          <div className="font-mono tabular-nums text-xl font-semibold text-[#141413]">
            {stats.enTypes.toLocaleString()}
          </div>
        </div>
        <div className="bg-white p-4 space-y-1">
          <div className="text-xs text-[#6B6B66]">词汇丰富度 (TTR)</div>
          <div className="font-mono tabular-nums text-xl font-semibold text-[#141413]">
            {(stats.enTtr * 100).toFixed(1)}%
          </div>
        </div>
        <div className="bg-white p-4 space-y-1">
          <div className="text-xs text-[#6B6B66]">中文字数 (不含标点)</div>
          <div className="font-mono tabular-nums text-xl font-semibold text-[#141413]">
            {stats.zhCharsNoPunct.toLocaleString()}
          </div>
        </div>
        <div className="bg-white p-4 space-y-1">
          <div className="text-xs text-[#6B6B66]">汉英字符比 / 待核对</div>
          <div className="font-mono tabular-nums text-xl font-semibold text-[#141413]">
            {stats.zhEnRatio.toFixed(2)}
            <span className="text-xs font-normal text-[#6B6B66] ml-1.5">
              ({stats.potentialMisalignedCount} 疑)
            </span>
          </div>
        </div>
      </div>

      {/* Processing Tools: Cleaning Pipeline + Find & Replace */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cleaning Pipeline */}
        <div className="bg-white border border-[#E5E5E3] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[#ECECE8] pb-3">
            <h2 className="text-sm font-semibold text-[#141413]">语料清洗与规范化流水线</h2>
            <span className="text-xs text-[#6B6B66]">作用域：{targetArticles.length} 篇</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            <label className="flex items-center gap-2 p-2 rounded-lg hover:bg-[#FAFAF8] cursor-pointer">
              <input
                type="checkbox"
                checked={cleanOptions.trimWhitespace}
                onChange={(e) =>
                  setCleanOptions({ ...cleanOptions, trimWhitespace: e.target.checked })
                }
                className="accent-[#1E3A5F]"
              />
              <span>清理多余空格与零宽字符</span>
            </label>
            <label className="flex items-center gap-2 p-2 rounded-lg hover:bg-[#FAFAF8] cursor-pointer">
              <input
                type="checkbox"
                checked={cleanOptions.normalizeZhPunctuation}
                onChange={(e) =>
                  setCleanOptions({
                    ...cleanOptions,
                    normalizeZhPunctuation: e.target.checked,
                  })
                }
                className="accent-[#1E3A5F]"
              />
              <span>规范中文全角标点符号</span>
            </label>
            <label className="flex items-center gap-2 p-2 rounded-lg hover:bg-[#FAFAF8] cursor-pointer">
              <input
                type="checkbox"
                checked={cleanOptions.normalizeQuotes}
                onChange={(e) =>
                  setCleanOptions({ ...cleanOptions, normalizeQuotes: e.target.checked })
                }
                className="accent-[#1E3A5F]"
              />
              <span>英文弯引号统一为直引号</span>
            </label>
            <label className="flex items-center gap-2 p-2 rounded-lg hover:bg-[#FAFAF8] cursor-pointer">
              <input
                type="checkbox"
                checked={cleanOptions.removePhotoCredits}
                onChange={(e) =>
                  setCleanOptions({
                    ...cleanOptions,
                    removePhotoCredits: e.target.checked,
                  })
                }
                className="accent-[#1E3A5F]"
              />
              <span>过滤摄影署名与广告噪声行</span>
            </label>
            <label className="flex items-center gap-2 p-2 rounded-lg hover:bg-[#FAFAF8] cursor-pointer">
              <input
                type="checkbox"
                checked={cleanOptions.removeEmptyPairs}
                onChange={(e) =>
                  setCleanOptions({
                    ...cleanOptions,
                    removeEmptyPairs: e.target.checked,
                  })
                }
                className="accent-[#1E3A5F]"
              />
              <span>剔除双语均为空的无效行</span>
            </label>

            <div className="flex items-center gap-2 p-2">
              <span className="text-[#575752] shrink-0">中英间距：</span>
              <select
                value={cleanOptions.cjkLatinSpacing}
                onChange={(e) =>
                  setCleanOptions({
                    ...cleanOptions,
                    cjkLatinSpacing: e.target.value as CorpusCleanOptions['cjkLatinSpacing'],
                  })
                }
                className="text-xs border border-[#D8D8D4] rounded px-2 py-1 bg-[#FAFAF8]"
              >
                <option value="keep">保持原样</option>
                <option value="add">中英数字间加空格</option>
                <option value="remove">移除多余盘古空格</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={handleRunCleaning}
              disabled={targetArticles.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#1E3A5F] rounded-lg hover:bg-[#162D4A] disabled:opacity-40 transition-colors cursor-pointer"
            >
              <Eraser className="w-3.5 h-3.5" />
              执行一键清洗
            </button>
            <button
              type="button"
              onClick={handleBatchSentenceSplit}
              disabled={targetArticles.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-[#141413] bg-[#FAFAF8] border border-[#D8D8D4] rounded-lg hover:bg-[#F0F0EC] disabled:opacity-40 transition-colors cursor-pointer"
            >
              <SplitSquareVertical className="w-3.5 h-3.5 text-[#1E3A5F]" />
              批量拆分为句级语料
            </button>
          </div>
        </div>

        {/* Batch Find & Replace */}
        <div className="bg-white border border-[#E5E5E3] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[#ECECE8] pb-3">
            <h2 className="text-sm font-semibold text-[#141413]">术语批量查找与正则替换</h2>
            <span className="text-xs text-[#6B6B66]">支持专有名词/标点统一</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#575752] mb-1">查找内容 / 正则表达式</label>
              <input
                type="text"
                value={findPattern}
                onChange={(e) => setFindPattern(e.target.value)}
                placeholder="例如：习近平 / Xi Jinping"
                className="w-full text-xs font-mono px-3 py-2 bg-[#FAFAF8] border border-[#D8D8D4] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#575752] mb-1">替换为</label>
              <input
                type="text"
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
                placeholder="替换文本（留空则删除匹配项）"
                className="w-full text-xs font-mono px-3 py-2 bg-[#FAFAF8] border border-[#D8D8D4] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F]"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-[#575752]">目标列：</span>
              <select
                value={replaceTarget}
                onChange={(e) =>
                  setReplaceTarget(e.target.value as 'en' | 'zh' | 'both')
                }
                className="border border-[#D8D8D4] rounded px-2 py-1 bg-[#FAFAF8]"
              >
                <option value="both">英汉双列</option>
                <option value="en">仅英文</option>
                <option value="zh">仅中文</option>
              </select>
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={useRegex}
                onChange={(e) => setUseRegex(e.target.checked)}
                className="accent-[#1E3A5F]"
              />
              <span>使用正则 (Regex)</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => setCaseSensitive(e.target.checked)}
                className="accent-[#1E3A5F]"
              />
              <span>区分大小写</span>
            </label>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={handleRunFindReplace}
              disabled={!findPattern || targetArticles.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#1E3A5F] rounded-lg hover:bg-[#162D4A] disabled:opacity-40 transition-colors cursor-pointer"
            >
              <Replace className="w-3.5 h-3.5" />
              应用全文替换
            </button>
          </div>
        </div>
      </div>

      {/* Bilingual KWIC Concordance Search */}
      <div className="bg-white border border-[#E5E5E3] rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#ECECE8] pb-3">
          <div>
            <h2 className="text-sm font-semibold text-[#141413]">
              全文双语平行语料检索 (KWIC Concordance)
            </h2>
            <p className="text-xs text-[#6B6B66]">
              跨全部已采集文章实时检索英文或中文关键词，查看平行上下文对齐例句。
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 text-[#8A8A84] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={kwicQuery}
                onChange={(e) => setKwicQuery(e.target.value)}
                placeholder="输入关键词或正则检索..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#FAFAF8] border border-[#D8D8D4] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F]"
              />
            </div>
            <label className="flex items-center gap-1.5 text-xs text-[#575752] cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={kwicRegex}
                onChange={(e) => setKwicRegex(e.target.checked)}
                className="accent-[#1E3A5F]"
              />
              正则
            </label>
          </div>
        </div>

        {kwicQuery.trim() ? (
          kwicMatches.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#6B6B66]">
              未在当前语料库中检索到匹配的平行语句
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto divide-y divide-[#ECECE8] border border-[#ECECE8] rounded-lg">
              {kwicMatches.map((m, idx) => (
                <div
                  key={`${m.articleId}-${m.rowIndex}-${idx}`}
                  className="grid grid-cols-1 md:grid-cols-[160px_1fr_1fr] gap-3 p-3 text-xs hover:bg-[#FAFAF8]"
                >
                  <button
                    type="button"
                    onClick={() => onSelectArticle(m.articleId)}
                    className="text-left text-[#1E3A5F] hover:underline font-medium truncate cursor-pointer"
                  >
                    {m.articleTitle} · 第{m.rowIndex}行
                  </button>
                  <div className="text-[#141413] leading-relaxed">
                    {highlightMatch(m.en, kwicQuery)}
                  </div>
                  <div className="text-[#141413] leading-relaxed">
                    {highlightMatch(m.zh, kwicQuery)}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="py-5 text-center text-xs text-[#8A8A84]">
            输入任意英文单词、中文术语或正则表达式即可在全部文章中即时定位双语对照句对
          </div>
        )}
      </div>

      {/* Word Frequency Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-[#E5E5E3] rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-[#ECECE8] pb-2.5">
            <h3 className="text-sm font-semibold text-[#141413]">英文高频实词排行</h3>
            <span className="text-xs text-[#6B6B66]">已过滤常见虚词</span>
          </div>
          {stats.topEnWords.length === 0 ? (
            <p className="text-xs text-[#8A8A84] py-4 text-center">暂无足够词频数据</p>
          ) : (
            <div className="space-y-1.5">
              {stats.topEnWords.slice(0, 12).map((item, idx) => (
                <div key={item.word} className="grid grid-cols-[24px_110px_1fr_42px] items-center gap-2 text-xs">
                  <span className="font-mono tabular-nums text-[#8A8A84]">{idx + 1}.</span>
                  <span className="font-mono text-[#141413] truncate">{item.word}</span>
                  <div className="h-2 bg-[#F1F1EE] rounded-xs overflow-hidden">
                    <div
                      className="h-full bg-[#1E3A5F]"
                      style={{ width: `${Math.round((item.count / maxEnCount) * 100)}%` }}
                    />
                  </div>
                  <span className="font-mono tabular-nums text-right text-[#4A4A46]">
                    {item.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-[#E5E5E3] rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-[#ECECE8] pb-2.5">
            <h3 className="text-sm font-semibold text-[#141413]">中文高频二字词组</h3>
            <span className="text-xs text-[#6B6B66]">基于连续汉字二元切分</span>
          </div>
          {stats.topZhTerms.length === 0 ? (
            <p className="text-xs text-[#8A8A84] py-4 text-center">暂无足够词频数据</p>
          ) : (
            <div className="space-y-1.5">
              {stats.topZhTerms.slice(0, 12).map((item, idx) => (
                <div key={item.term} className="grid grid-cols-[24px_110px_1fr_42px] items-center gap-2 text-xs">
                  <span className="font-mono tabular-nums text-[#8A8A84]">{idx + 1}.</span>
                  <span className="text-[#141413] truncate">{item.term}</span>
                  <div className="h-2 bg-[#F1F1EE] rounded-xs overflow-hidden">
                    <div
                      className="h-full bg-[#3B6998]"
                      style={{ width: `${Math.round((item.count / maxZhCount) * 100)}%` }}
                    />
                  </div>
                  <span className="font-mono tabular-nums text-right text-[#4A4A46]">
                    {item.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
