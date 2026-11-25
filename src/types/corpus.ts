export interface AlignedPair {
  id: string;
  index: number;
  isTitle?: boolean;
  en: string;
  zh: string;
  note?: string;
}

export interface ArticleMetadata {
  url: string;
  canonicalDualUrl: string;
  section: string;
  date: string;
  byline?: string;
  fetchedAt: string;
  sourceType: 'live-url' | 'html-upload' | 'text-import' | 'sample';
}

export interface BilingualArticle {
  id: string;
  titleEn: string;
  titleZh: string;
  pairs: AlignedPair[];
  rawPairs: AlignedPair[];
  metadata: ArticleMetadata;
  status: 'ready' | 'fetching' | 'error';
  errorMessage?: string;
}

export interface CorpusCleanOptions {
  trimWhitespace: boolean;
  normalizeQuotes: boolean;
  normalizeZhPunctuation: boolean;
  removePhotoCredits: boolean;
  removeEmptyPairs: boolean;
  cjkLatinSpacing: 'keep' | 'remove' | 'add';
}

export interface ExportOptions {
  mode: 'single' | 'merged' | 'multi-sheet';
  titlePlacement: 'first-row-no-header' | 'header-plus-title-row';
  enColumnLabel: string;
  zhColumnLabel: string;
  includeMetadataSheet: boolean;
  includeStatsSheet: boolean;
  includeArticleSeparatorInMerged: boolean;
  includeIndexColumn: boolean;
}

export interface CorpusStats {
  pairCount: number;
  bodyPairCount: number;
  enTokens: number;
  enTypes: number;
  enTtr: number;
  zhCharsWithPunct: number;
  zhCharsNoPunct: number;
  avgEnWordsPerPair: number;
  avgZhCharsPerPair: number;
  zhEnRatio: number;
  topEnWords: Array<{ word: string; count: number }>;
  topZhTerms: Array<{ term: string; count: number }>;
  potentialMisalignedCount: number;
}

export interface BatchFetchItemResult {
  inputUrl: string;
  canonicalDualUrl: string;
  ok: boolean;
  article?: {
    titleEn: string;
    titleZh: string;
    pairs: Array<{ isTitle?: boolean; en: string; zh: string }>;
    metadata: ArticleMetadata;
  };
  error?: string;
  hint?: string;
}
