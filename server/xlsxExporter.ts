import ExcelJS from 'exceljs';
import type {
  AlignedPair,
  BilingualArticle,
  CorpusStats,
  ExportOptions,
} from '../src/types/corpus.ts';

function sanitizeSheetName(raw: string, usedNames: Set<string>): string {
  // Excel sheet names max 31 chars, cannot contain \ / ? * [ ] :
  let cleaned = raw.replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) cleaned = 'Article';
  let base = cleaned.slice(0, 28);
  let candidate = base.slice(0, 31);
  let counter = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    const suffix = `_${counter}`;
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    counter++;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function applyCellBorder(cell: ExcelJS.Cell, isTitleRow: boolean) {
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFE2E2DF' } },
    left: { style: 'thin', color: { argb: 'FFE2E2DF' } },
    bottom: {
      style: isTitleRow ? 'medium' : 'thin',
      color: { argb: isTitleRow ? 'FF1E3A5F' : 'FFE2E2DF' },
    },
    right: { style: 'thin', color: { argb: 'FFE2E2DF' } },
  };
}

function configureAlignedSheetColumns(
  sheet: ExcelJS.Worksheet,
  options: ExportOptions
) {
  const cols: Partial<ExcelJS.Column>[] = [];
  if (options.includeIndexColumn) {
    cols.push({ key: 'idx', width: 9 });
  }
  cols.push({ key: 'en', width: 64 });
  cols.push({ key: 'zh', width: 58 });
  sheet.columns = cols;
}

function styleAlignedRow(
  row: ExcelJS.Row,
  isHeader: boolean,
  isTitle: boolean,
  isSeparator: boolean,
  includeIndexColumn: boolean,
  zebra: boolean
) {
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const isIndexCol = includeIndexColumn && colNumber === 1;
    cell.alignment = {
      vertical: 'top',
      horizontal: isIndexCol ? 'center' : 'left',
      wrapText: true,
    };

    if (isHeader) {
      cell.font = {
        name: 'Calibri',
        size: 11,
        bold: true,
        color: { argb: 'FFFFFFFF' },
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E3A5F' },
      };
      applyCellBorder(cell, false);
    } else if (isTitle) {
      cell.font = {
        name: 'Calibri',
        size: 12,
        bold: true,
        color: { argb: 'FF111827' },
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFEEF2F7' },
      };
      applyCellBorder(cell, true);
    } else if (isSeparator) {
      cell.font = {
        name: 'Calibri',
        size: 10,
        italic: true,
        color: { argb: 'FF4B5563' },
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF3F4F6' },
      };
      applyCellBorder(cell, false);
    } else {
      cell.font = {
        name: 'Calibri',
        size: 11,
        color: { argb: 'FF1F2937' },
      };
      if (zebra) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFAFAF9' },
        };
      }
      applyCellBorder(cell, false);
    }
  });
}

function populateArticleSheet(
  sheet: ExcelJS.Worksheet,
  article: BilingualArticle,
  options: ExportOptions
) {
  configureAlignedSheetColumns(sheet, options);

  // Ensure title pair is strictly placed at the first row
  const sortedPairs: AlignedPair[] = [...article.pairs];
  const hasTitle = sortedPairs.some((p) => p.isTitle);
  if (!hasTitle && (article.titleEn || article.titleZh)) {
    sortedPairs.unshift({
      id: 'title-auto',
      index: 1,
      isTitle: true,
      en: article.titleEn,
      zh: article.titleZh,
    });
  }

  let frozenRows = 0;

  if (options.titlePlacement === 'header-plus-title-row') {
    const headerValues = options.includeIndexColumn
      ? ['#', options.enColumnLabel || 'English', options.zhColumnLabel || '中文']
      : [options.enColumnLabel || 'English', options.zhColumnLabel || '中文'];
    const headerRow = sheet.addRow(headerValues);
    headerRow.height = 24;
    styleAlignedRow(headerRow, true, false, false, options.includeIndexColumn, false);
    frozenRows = 1;
  }

  sortedPairs.forEach((pair, idx) => {
    const rowNumber = idx + 1;
    const values = options.includeIndexColumn
      ? [pair.isTitle ? 'Title' : rowNumber, pair.en, pair.zh]
      : [pair.en, pair.zh];
    const row = sheet.addRow(values);
    const isTitleRow = Boolean(pair.isTitle) || idx === 0;
    if (isTitleRow && frozenRows === 0) {
      frozenRows = 1;
    }
    styleAlignedRow(
      row,
      false,
      isTitleRow,
      false,
      options.includeIndexColumn,
      !isTitleRow && idx % 2 === 1
    );
  });

  if (frozenRows > 0) {
    sheet.views = [{ state: 'frozen', ySplit: frozenRows }];
  }
}

export async function generateXlsxWorkbook(
  articles: BilingualArticle[],
  options: ExportOptions,
  aggregateStats?: CorpusStats,
  perArticleStats?: Record<string, CorpusStats>
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'New York Times EN-CN Bilingual-text Downloader';
  workbook.created = new Date();
  workbook.modified = new Date();

  const usedSheetNames = new Set<string>();

  if (options.mode === 'single' && articles.length >= 1) {
    const sheetName = sanitizeSheetName('Aligned_Text', usedSheetNames);
    const sheet = workbook.addWorksheet(sheetName);
    populateArticleSheet(sheet, articles[0], options);
  } else if (options.mode === 'merged') {
    const sheetName = sanitizeSheetName('Batch_Aligned_Corpus', usedSheetNames);
    const sheet = workbook.addWorksheet(sheetName);
    configureAlignedSheetColumns(sheet, options);

    let frozenRows = 0;
    if (options.titlePlacement === 'header-plus-title-row') {
      const headerValues = options.includeIndexColumn
        ? ['#', options.enColumnLabel || 'English', options.zhColumnLabel || '中文']
        : [options.enColumnLabel || 'English', options.zhColumnLabel || '中文'];
      const headerRow = sheet.addRow(headerValues);
      headerRow.height = 24;
      styleAlignedRow(headerRow, true, false, false, options.includeIndexColumn, false);
      frozenRows = 1;
    }

    let globalRowIdx = 0;
    articles.forEach((article, articleIdx) => {
      if (options.includeArticleSeparatorInMerged && articleIdx > 0) {
        const sepValues = options.includeIndexColumn
          ? [
              `A${articleIdx + 1}`,
              `--- Article ${articleIdx + 1} (${article.metadata.date}) ---`,
              `--- 第 ${articleIdx + 1} 篇 (${article.metadata.canonicalDualUrl}) ---`,
            ]
          : [
              `--- Article ${articleIdx + 1} (${article.metadata.date}) ---`,
              `--- 第 ${articleIdx + 1} 篇 (${article.metadata.canonicalDualUrl}) ---`,
            ];
        const sepRow = sheet.addRow(sepValues);
        styleAlignedRow(sepRow, false, false, true, options.includeIndexColumn, false);
      }

      const pairs = [...article.pairs];
      pairs.forEach((pair, pIdx) => {
        globalRowIdx++;
        const isTitleRow = Boolean(pair.isTitle) || pIdx === 0;
        const values = options.includeIndexColumn
          ? [isTitleRow ? `T${articleIdx + 1}` : globalRowIdx, pair.en, pair.zh]
          : [pair.en, pair.zh];
        const row = sheet.addRow(values);
        styleAlignedRow(
          row,
          false,
          isTitleRow,
          false,
          options.includeIndexColumn,
          !isTitleRow && globalRowIdx % 2 === 0
        );
      });
    });

    if (frozenRows > 0) {
      sheet.views = [{ state: 'frozen', ySplit: frozenRows }];
    }
  } else {
    // multi-sheet mode
    const indexSheet = workbook.addWorksheet(
      sanitizeSheetName('Summary_Index', usedSheetNames)
    );
    indexSheet.columns = [
      { header: '序号', key: 'seq', width: 8 },
      { header: '日期', key: 'date', width: 14 },
      { header: '栏目', key: 'section', width: 18 },
      { header: '英文标题', key: 'titleEn', width: 48 },
      { header: '中文标题', key: 'titleZh', width: 44 },
      { header: '对齐行数', key: 'pairs', width: 12 },
      { header: '英文词数', key: 'enTokens', width: 12 },
      { header: '中文字数', key: 'zhChars', width: 12 },
      { header: '原始链接', key: 'url', width: 54 },
    ];
    const idxHeader = indexSheet.getRow(1);
    idxHeader.height = 24;
    styleAlignedRow(idxHeader, true, false, false, true, false);
    indexSheet.views = [{ state: 'frozen', ySplit: 1 }];

    articles.forEach((article, i) => {
      const stats = perArticleStats?.[article.id];
      const r = indexSheet.addRow({
        seq: i + 1,
        date: article.metadata.date,
        section: article.metadata.section,
        titleEn: article.titleEn,
        titleZh: article.titleZh,
        pairs: article.pairs.length,
        enTokens: stats?.enTokens ?? '-',
        zhChars: stats?.zhCharsWithPunct ?? '-',
        url: article.metadata.canonicalDualUrl,
      });
      styleAlignedRow(r, false, false, false, true, i % 2 === 1);
    });

    articles.forEach((article, i) => {
      const datePrefix = article.metadata.date ? article.metadata.date.replace(/-/g, '') : `${i + 1}`;
      const rawName = `${datePrefix}_${article.titleZh || article.titleEn || `Article_${i + 1}`}`;
      const sheetName = sanitizeSheetName(rawName, usedSheetNames);
      const sheet = workbook.addWorksheet(sheetName);
      populateArticleSheet(sheet, article, options);
    });
  }

  if (options.includeMetadataSheet) {
    const metaSheet = workbook.addWorksheet(
      sanitizeSheetName('Metadata', usedSheetNames)
    );
    metaSheet.columns = [
      { header: '序号', key: 'seq', width: 8 },
      { header: '英文标题', key: 'titleEn', width: 48 },
      { header: '中文标题', key: 'titleZh', width: 44 },
      { header: '发布日期', key: 'date', width: 14 },
      { header: '所属栏目', key: 'section', width: 18 },
      { header: '作者/署名', key: 'byline', width: 28 },
      { header: '来源类型', key: 'sourceType', width: 16 },
      { header: '双语链接', key: 'url', width: 60 },
      { header: '采集时间', key: 'fetchedAt', width: 24 },
    ];
    const h = metaSheet.getRow(1);
    h.height = 24;
    styleAlignedRow(h, true, false, false, true, false);
    metaSheet.views = [{ state: 'frozen', ySplit: 1 }];

    articles.forEach((a, i) => {
      const r = metaSheet.addRow({
        seq: i + 1,
        titleEn: a.titleEn,
        titleZh: a.titleZh,
        date: a.metadata.date,
        section: a.metadata.section,
        byline: a.metadata.byline || '',
        sourceType: a.metadata.sourceType,
        url: a.metadata.canonicalDualUrl,
        fetchedAt: a.metadata.fetchedAt,
      });
      styleAlignedRow(r, false, false, false, true, i % 2 === 1);
    });
  }

  if (options.includeStatsSheet && aggregateStats) {
    const statsSheet = workbook.addWorksheet(
      sanitizeSheetName('Corpus_Stats', usedSheetNames)
    );
    statsSheet.columns = [
      { header: '语料指标 / Metric', key: 'metric', width: 34 },
      { header: '数值 / Value', key: 'value', width: 20 },
      { header: '英文高频词', key: 'enWord', width: 22 },
      { header: '频次', key: 'enCount', width: 10 },
      { header: '中文高频词组', key: 'zhTerm', width: 22 },
      { header: '频次 ', key: 'zhCount', width: 10 },
    ];
    const h = statsSheet.getRow(1);
    h.height = 24;
    styleAlignedRow(h, true, false, false, false, false);
    statsSheet.views = [{ state: 'frozen', ySplit: 1 }];

    const metricRows: Array<[string, string | number]> = [
      ['包含文章数 (Articles)', articles.length],
      ['总对齐行数 (Total Aligned Pairs)', aggregateStats.pairCount],
      ['正文对齐行数 (Body Pairs)', aggregateStats.bodyPairCount],
      ['英文总词数 (EN Tokens)', aggregateStats.enTokens],
      ['英文词汇量 (EN Types)', aggregateStats.enTypes],
      ['英文词汇丰富度 (TTR)', `${(aggregateStats.enTtr * 100).toFixed(2)}%`],
      ['中文字数含标点 (ZH Chars w/ Punct)', aggregateStats.zhCharsWithPunct],
      ['中文字数不含标点 (ZH Chars)', aggregateStats.zhCharsNoPunct],
      ['平均每行英文词数 (Avg EN Words/Pair)', aggregateStats.avgEnWordsPerPair.toFixed(1)],
      ['平均每行中文字数 (Avg ZH Chars/Pair)', aggregateStats.avgZhCharsPerPair.toFixed(1)],
      ['汉英字符长度比 (ZH/EN Ratio)', aggregateStats.zhEnRatio.toFixed(2)],
      ['待人工复核错位行 (Flagged Rows)', aggregateStats.potentialMisalignedCount],
    ];

    const maxLen = Math.max(
      metricRows.length,
      aggregateStats.topEnWords.length,
      aggregateStats.topZhTerms.length
    );

    for (let i = 0; i < maxLen; i++) {
      const m = metricRows[i];
      const ew = aggregateStats.topEnWords[i];
      const zt = aggregateStats.topZhTerms[i];
      const r = statsSheet.addRow({
        metric: m ? m[0] : '',
        value: m ? m[1] : '',
        enWord: ew ? ew.word : '',
        enCount: ew ? ew.count : '',
        zhTerm: zt ? zt.term : '',
        zhCount: zt ? zt.count : '',
      });
      styleAlignedRow(r, false, false, false, false, i % 2 === 1);
    }
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
