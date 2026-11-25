import type {
  AlignedPair,
  BilingualArticle,
  CorpusCleanOptions,
  CorpusStats,
} from '../types/corpus';

const EN_ABBREVIATIONS = [
  'Mr.',
  'Mrs.',
  'Ms.',
  'Dr.',
  'Prof.',
  'Sen.',
  'Rep.',
  'Gov.',
  'Pres.',
  'Gen.',
  'Col.',
  'Lt.',
  'Sgt.',
  'Rev.',
  'St.',
  'Jr.',
  'Sr.',
  'Inc.',
  'Corp.',
  'Co.',
  'Ltd.',
  'No.',
  'Vol.',
  'vs.',
  'etc.',
  'e.g.',
  'i.e.',
  'U.S.',
  'U.K.',
  'U.N.',
  'E.U.',
  'Jan.',
  'Feb.',
  'Mar.',
  'Apr.',
  'Aug.',
  'Sept.',
  'Oct.',
  'Nov.',
  'Dec.',
];

const EN_STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be', 'been', 'being', 'have',
  'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
  'might', 'must', 'can', 'that', 'this', 'these', 'those', 'it', 'its', 'he',
  'she', 'they', 'them', 'their', 'his', 'her', 'we', 'our', 'you', 'your', 'i',
  'my', 'who', 'whom', 'whose', 'which', 'what', 'when', 'where', 'why', 'how',
  'not', 'no', 'if', 'than', 'then', 'so', 'up', 'out', 'about', 'into', 'over',
  'after', 'before', 'more', 'most', 'also', 'said', 'says', 'one', 'two', 'new',
  'there', 'here', 'such', 'all', 'any', 'some', 'many', 'much', 'other', 'only',
]);

const ZH_STOP_TERMS = new Set([
  '我们', '他们', '她们', '它们', '这个', '那个', '这些', '那些', '一个', '一些',
  '一种', '没有', '不是', '已经', '正在', '可以', '可能', '因为', '所以', '但是',
  '然而', '如果', '虽然', '或者', '以及', '对于', '关于', '通过', '进行', '表示',
  '指出', '认为', '成为', '作为', '其中', '之后', '之前', '时候', '什么', '这样',
  '那样', '自己', '这里', '那里', '现在', '目前', '依然', '仍然', '还是',
]);

export function makeId(prefix = 'id'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function normalizeUrlPreview(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  let candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(candidate);
    if (!u.hostname.toLowerCase().includes('cn.nytimes.com')) return candidate;
    let p = u.pathname.replace(/\/+$/, '');
    if (p.endsWith('/dual')) p = `${p}/`;
    else if (p.endsWith('/en-us')) p = `${p.slice(0, -6)}/dual/`;
    else if (/^\/[^/]+\/\d{8}\/[^/]+$/.test(p)) p = `${p}/dual/`;
    else if (!p.endsWith('/')) p = `${p}/`;
    u.protocol = 'https:';
    u.hostname = 'cn.nytimes.com';
    u.pathname = p;
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return candidate;
  }
}

export function splitEnglishSentences(text: string): string[] {
  const cleaned = text.trim();
  if (!cleaned) return [];

  let masked = cleaned;
  const placeholders: Array<[string, string]> = [];

  // Mask decimal numbers like 3.14
  masked = masked.replace(/\b(\d+)\.(\d+)\b/g, (_m, a, b) => {
    const token = `__DEC_${placeholders.length}__`;
    placeholders.push([token, `${a}.${b}`]);
    return token;
  });

  // Mask known abbreviations
  EN_ABBREVIATIONS.forEach((abbr, idx) => {
    const escaped = abbr.replace(/\./g, '\\.');
    const re = new RegExp(`\\b${escaped}`, 'g');
    masked = masked.replace(re, (match) => {
      const token = `__ABBR_${idx}_${placeholders.length}__`;
      placeholders.push([token, match]);
      return token;
    });
  });

  // Mask single uppercase initials like "J. K." or "D."
  masked = masked.replace(/\b([A-Z])\.(?=\s+[A-Z])/g, (_m, ch) => {
    const token = `__INIT_${placeholders.length}__`;
    placeholders.push([token, `${ch}.`]);
    return token;
  });

  const rawParts = masked
    .split(/(?<=[.!?]["”’')\]]*)\s+(?=[A-Z0-9"“‘(])/)
    .map((part) => {
      let restored = part;
      for (let i = placeholders.length - 1; i >= 0; i--) {
        const [token, orig] = placeholders[i];
        restored = restored.split(token).join(orig);
      }
      return restored.trim();
    })
    .filter(Boolean);

  return rawParts.length > 0 ? rawParts : [cleaned];
}

export function splitChineseSentences(text: string): string[] {
  const cleaned = text.trim();
  if (!cleaned) return [];
  const parts = cleaned
    .split(/(?<=[。！？；][”’」』）)]*)/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [cleaned];
}

function alignUnevenSentences(enSents: string[], zhSents: string[]): Array<{ en: string; zh: string }> {
  if (enSents.length === 0 && zhSents.length === 0) return [];
  if (enSents.length === zhSents.length) {
    return enSents.map((en, i) => ({ en, zh: zhSents[i] }));
  }
  if (enSents.length === 1) {
    return [{ en: enSents[0], zh: zhSents.join('') }];
  }
  if (zhSents.length === 1) {
    return [{ en: enSents.join(' '), zh: zhSents[0] }];
  }

  // Length-proportional grouping onto the shorter side's count
  if (enSents.length > zhSents.length) {
    const totalEnLen = enSents.reduce((s, x) => s + x.length, 0) || 1;
    const totalZhLen = zhSents.reduce((s, x) => s + x.length, 0) || 1;
    const result: Array<{ en: string; zh: string }> = [];
    let enCursor = 0;

    zhSents.forEach((zh, zIdx) => {
      if (zIdx === zhSents.length - 1) {
        result.push({ en: enSents.slice(enCursor).join(' '), zh });
        return;
      }
      const targetRatio = zh.length / totalZhLen;
      const targetEnChars = targetRatio * totalEnLen;
      const picked: string[] = [];
      let acc = 0;
      const remainingZh = zhSents.length - 1 - zIdx;
      while (enCursor < enSents.length - remainingZh) {
        const candidate = enSents[enCursor];
        if (picked.length > 0 && acc + candidate.length * 0.5 > targetEnChars) break;
        picked.push(candidate);
        acc += candidate.length;
        enCursor++;
      }
      if (picked.length === 0 && enCursor < enSents.length) {
        picked.push(enSents[enCursor++]);
      }
      result.push({ en: picked.join(' '), zh });
    });
    return result;
  } else {
    const totalEnLen = enSents.reduce((s, x) => s + x.length, 0) || 1;
    const totalZhLen = zhSents.reduce((s, x) => s + x.length, 0) || 1;
    const result: Array<{ en: string; zh: string }> = [];
    let zhCursor = 0;

    enSents.forEach((en, eIdx) => {
      if (eIdx === enSents.length - 1) {
        result.push({ en, zh: zhSents.slice(zhCursor).join('') });
        return;
      }
      const targetRatio = en.length / totalEnLen;
      const targetZhChars = targetRatio * totalZhLen;
      const picked: string[] = [];
      let acc = 0;
      const remainingEn = enSents.length - 1 - eIdx;
      while (zhCursor < zhSents.length - remainingEn) {
        const candidate = zhSents[zhCursor];
        if (picked.length > 0 && acc + candidate.length * 0.5 > targetZhChars) break;
        picked.push(candidate);
        acc += candidate.length;
        zhCursor++;
      }
      if (picked.length === 0 && zhCursor < zhSents.length) {
        picked.push(zhSents[zhCursor++]);
      }
      result.push({ en, zh: picked.join('') });
    });
    return result;
  }
}

export function splitArticleToSentences(pairs: AlignedPair[]): AlignedPair[] {
  const result: AlignedPair[] = [];
  let seq = 1;

  for (const pair of pairs) {
    if (pair.isTitle) {
      result.push({
        ...pair,
        index: seq++,
      });
      continue;
    }

    const enSents = splitEnglishSentences(pair.en);
    const zhSents = splitChineseSentences(pair.zh);
    const aligned = alignUnevenSentences(enSents, zhSents);

    for (const item of aligned) {
      result.push({
        id: makeId('sent'),
        index: seq++,
        isTitle: false,
        en: item.en,
        zh: item.zh,
      });
    }
  }

  return result;
}

export function cleanArticlePairs(
  pairs: AlignedPair[],
  options: CorpusCleanOptions
): AlignedPair[] {
  const cleaned: AlignedPair[] = [];

  for (const pair of pairs) {
    let en = pair.en;
    let zh = pair.zh;

    if (options.trimWhitespace) {
      en = en.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
      zh = zh.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
    }

    if (options.removePhotoCredits) {
      const creditRe = /^(Credit\.{0,3}|摄影：|图片版权|NYT\s*Photo|Getty Images)/i;
      if (!pair.isTitle && (creditRe.test(en) || creditRe.test(zh))) {
        continue;
      }
    }

    if (options.normalizeQuotes) {
      en = en
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2018\u2019]/g, "'");
    }

    if (options.normalizeZhPunctuation) {
      zh = zh
        .replace(/([\u4e00-\u9fff]),\s*/g, '$1，')
        .replace(/([\u4e00-\u9fff]);\s*/g, '$1；')
        .replace(/([\u4e00-\u9fff]):\s*/g, '$1：')
        .replace(/([\u4e00-\u9fff])\?\s*/g, '$1？')
        .replace(/([\u4e00-\u9fff])!\s*/g, '$1！');
    }

    if (options.cjkLatinSpacing === 'add') {
      zh = zh
        .replace(/([\u4e00-\u9fff])([A-Za-z0-9])/g, '$1 $2')
        .replace(/([A-Za-z0-9])([\u4e00-\u9fff])/g, '$1 $2');
    } else if (options.cjkLatinSpacing === 'remove') {
      zh = zh
        .replace(/([\u4e00-\u9fff])\s+([A-Za-z0-9])/g, '$1$2')
        .replace(/([A-Za-z0-9])\s+([\u4e00-\u9fff])/g, '$1$2');
    }

    if (options.removeEmptyPairs && !pair.isTitle && !en.trim() && !zh.trim()) {
      continue;
    }

    cleaned.push({
      ...pair,
      en,
      zh,
    });
  }

  return cleaned.map((p, idx) => ({ ...p, index: idx + 1 }));
}

export function applyFindReplace(
  pairs: AlignedPair[],
  findPattern: string,
  replaceText: string,
  target: 'en' | 'zh' | 'both',
  useRegex: boolean,
  caseSensitive: boolean
): { pairs: AlignedPair[]; affectedCount: number } {
  if (!findPattern) return { pairs, affectedCount: 0 };

  let affectedCount = 0;
  const flags = caseSensitive ? 'g' : 'gi';
  const regex = useRegex
    ? new RegExp(findPattern, flags)
    : new RegExp(findPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);

  const nextPairs = pairs.map((pair) => {
    let en = pair.en;
    let zh = pair.zh;
    let changed = false;

    if (target === 'en' || target === 'both') {
      const updated = en.replace(regex, replaceText);
      if (updated !== en) {
        en = updated;
        changed = true;
      }
    }
    if (target === 'zh' || target === 'both') {
      const updated = zh.replace(regex, replaceText);
      if (updated !== zh) {
        zh = updated;
        changed = true;
      }
    }
    if (changed) affectedCount++;
    return changed ? { ...pair, en, zh } : pair;
  });

  return { pairs: nextPairs, affectedCount };
}

export function isPotentialMisalignment(pair: AlignedPair): {
  flagged: boolean;
  reason?: string;
} {
  const en = pair.en.trim();
  const zh = pair.zh.trim();
  if (!en && !zh) return { flagged: true, reason: '双语均为空' };
  if (!en) return { flagged: true, reason: '缺失英文文本' };
  if (!zh) return { flagged: true, reason: '缺失中文译文' };

  if (pair.isTitle) return { flagged: false };

  const enLen = en.length;
  const zhLen = zh.replace(/\s+/g, '').length;
  if (enLen > 45 && zhLen > 12) {
    const ratio = zhLen / enLen;
    if (ratio < 0.14) {
      return { flagged: true, reason: '中文过短，可能漏译或错位' };
    }
    if (ratio > 1.25) {
      return { flagged: true, reason: '中文偏长，可能多段合并' };
    }
  }
  return { flagged: false };
}

export function computeCorpusStats(articles: BilingualArticle[]): CorpusStats {
  const allPairs = articles.flatMap((a) => a.pairs);
  const bodyPairs = allPairs.filter((p) => !p.isTitle);

  const enWordFreq = new Map<string, number>();
  const allEnTokens: string[] = [];
  let totalZhCharsWithPunct = 0;
  let totalZhCharsNoPunct = 0;
  let totalEnChars = 0;
  let potentialMisalignedCount = 0;

  const zhTermFreq = new Map<string, number>();

  for (const pair of allPairs) {
    if (isPotentialMisalignment(pair).flagged) {
      potentialMisalignedCount++;
    }

    const enText = pair.en.trim();
    const zhText = pair.zh.trim();
    totalEnChars += enText.length;

    const words = enText.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || [];
    for (const w of words) {
      allEnTokens.push(w);
      if (w.length > 2 && !EN_STOP_WORDS.has(w)) {
        enWordFreq.set(w, (enWordFreq.get(w) || 0) + 1);
      }
    }

    const zhNoSpace = zhText.replace(/\s+/g, '');
    totalZhCharsWithPunct += zhNoSpace.length;
    const zhHan = zhText.match(/[\u4e00-\u9fff]/g) || [];
    totalZhCharsNoPunct += zhHan.length;

    // Extract 2-char CJK chunks within contiguous Hanzi segments for frequency insight
    const hanSegments = zhText.match(/[\u4e00-\u9fff]{2,}/g) || [];
    for (const seg of hanSegments) {
      for (let i = 0; i <= seg.length - 2; i++) {
        const bigram = seg.slice(i, i + 2);
        if (!ZH_STOP_TERMS.has(bigram)) {
          zhTermFreq.set(bigram, (zhTermFreq.get(bigram) || 0) + 1);
        }
      }
    }
  }

  const enTypesSet = new Set(allEnTokens);
  const enTokens = allEnTokens.length;
  const enTypes = enTypesSet.size;
  const enTtr = enTokens > 0 ? enTypes / enTokens : 0;

  const pairCount = allPairs.length;
  const avgEnWordsPerPair = pairCount > 0 ? enTokens / pairCount : 0;
  const avgZhCharsPerPair = pairCount > 0 ? totalZhCharsWithPunct / pairCount : 0;
  const zhEnRatio = totalEnChars > 0 ? totalZhCharsWithPunct / totalEnChars : 0;

  const topEnWords = Array.from(enWordFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 18)
    .map(([word, count]) => ({ word, count }));

  const topZhTerms = Array.from(zhTermFreq.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 18)
    .map(([term, count]) => ({ term, count }));

  return {
    pairCount,
    bodyPairCount: bodyPairs.length,
    enTokens,
    enTypes,
    enTtr,
    zhCharsWithPunct: totalZhCharsWithPunct,
    zhCharsNoPunct: totalZhCharsNoPunct,
    avgEnWordsPerPair,
    avgZhCharsPerPair,
    zhEnRatio,
    topEnWords,
    topZhTerms,
    potentialMisalignedCount,
  };
}

export function parseRawBilingualText(
  rawText: string,
  titleEnInput: string,
  titleZhInput: string
): Array<{ isTitle?: boolean; en: string; zh: string }> {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const pairs: Array<{ isTitle?: boolean; en: string; zh: string }> = [];

  if (titleEnInput.trim() || titleZhInput.trim()) {
    pairs.push({
      isTitle: true,
      en: titleEnInput.trim(),
      zh: titleZhInput.trim(),
    });
  }

  // Check if tab-separated lines
  const tabCount = lines.filter((l) => l.includes('\t')).length;
  if (tabCount >= Math.max(1, Math.floor(lines.length * 0.5))) {
    for (const line of lines) {
      const [col1 = '', col2 = ''] = line.split('\t');
      const isCol1Zh = /[\u4e00-\u9fff]/.test(col1) && !/[\u4e00-\u9fff]/.test(col2);
      pairs.push({
        isTitle: pairs.length === 0,
        en: isCol1Zh ? col2.trim() : col1.trim(),
        zh: isCol1Zh ? col1.trim() : col2.trim(),
      });
    }
    return pairs;
  }

  // Otherwise pair by language alternation
  const isZhLine = (s: string) => {
    const cjk = (s.match(/[\u4e00-\u9fff]/g) || []).length;
    return cjk / Math.max(1, s.replace(/\s+/g, '').length) >= 0.15;
  };

  let pendingEn = '';
  let pendingZh = '';
  for (const line of lines) {
    if (isZhLine(line)) {
      if (pendingEn && !pendingZh) {
        pairs.push({ isTitle: pairs.length === 0, en: pendingEn, zh: line });
        pendingEn = '';
      } else if (pendingZh) {
        pairs.push({ isTitle: pairs.length === 0, en: '', zh: pendingZh });
        pendingZh = line;
      } else {
        pendingZh = line;
      }
    } else {
      if (pendingZh && !pendingEn) {
        pairs.push({ isTitle: pairs.length === 0, en: line, zh: pendingZh });
        pendingZh = '';
      } else if (pendingEn) {
        pairs.push({ isTitle: pairs.length === 0, en: pendingEn, zh: '' });
        pendingEn = line;
      } else {
        pendingEn = line;
      }
    }
  }
  if (pendingEn || pendingZh) {
    pairs.push({ isTitle: pairs.length === 0, en: pendingEn, zh: pendingZh });
  }

  return pairs;
}

export function buildTsvContent(articles: BilingualArticle[], includeHeader: boolean): string {
  const rows: string[] = [];
  if (includeHeader) {
    rows.push('English\t中文');
  }
  for (const article of articles) {
    for (const pair of article.pairs) {
      const en = pair.en.replace(/[\t\r\n]+/g, ' ').trim();
      const zh = pair.zh.replace(/[\t\r\n]+/g, ' ').trim();
      rows.push(`${en}\t${zh}`);
    }
  }
  return '\uFEFF' + rows.join('\n');
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildTmxContent(articles: BilingualArticle[]): string {
  const tus = articles
    .flatMap((article) =>
      article.pairs.map(
        (p) => `    <tu>
      <tuv xml:lang="en"><seg>${escapeXml(p.en)}</seg></tuv>
      <tuv xml:lang="zh-CN"><seg>${escapeXml(p.zh)}</seg></tuv>
    </tu>`
      )
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<tmx version="1.4">
  <header creationtool="New York Times EN-CN Bilingual-text Downloader" creationtoolversion="1.0" segtype="paragraph" o-tmf="unknown" adminlang="en" srclang="en" datatype="PlainText" />
  <body>
${tus}
  </body>
</tmx>`;
}
