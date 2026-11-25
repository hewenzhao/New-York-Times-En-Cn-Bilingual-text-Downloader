import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  fetchNytDualArticle,
  parseNytDualHtml,
  validateAndNormalizeNytUrl,
} from './server/nytScraper.ts';
import { generateXlsxWorkbook } from './server/xlsxExporter.ts';
import type {
  BilingualArticle,
  CorpusStats,
  ExportOptions,
} from './src/types/corpus.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '8mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'New York Times EN-CN Bilingual-text Downloader' });
  });

  app.post('/api/fetch-nyt', async (req, res) => {
    const rawUrl = typeof req.body?.url === 'string' ? req.body.url : '';
    if (!rawUrl.trim()) {
      res.status(400).json({ ok: false, error: '请提供有效的 cn.nytimes.com 文章链接' });
      return;
    }
    const result = await fetchNytDualArticle(rawUrl);
    if (!result.ok) {
      res.status(422).json(result);
      return;
    }
    res.json(result);
  });

  app.post('/api/fetch-nyt-batch', async (req, res) => {
    const rawUrls: unknown = req.body?.urls;
    if (!Array.isArray(rawUrls) || rawUrls.length === 0) {
      res.status(400).json({ ok: false, error: '请至少提供一个文章 URL' });
      return;
    }

    const cleanedUrls = Array.from(
      new Set(
        rawUrls
          .filter((item): item is string => typeof item === 'string')
          .map((u) => u.trim())
          .filter(Boolean)
      )
    ).slice(0, 25);

    if (cleanedUrls.length === 0) {
      res.status(400).json({ ok: false, error: '未检测到有效的链接' });
      return;
    }

    // Concurrency-limited batch fetch (max 3 concurrent)
    const results = new Array(cleanedUrls.length);
    let cursor = 0;

    async function worker() {
      while (cursor < cleanedUrls.length) {
        const idx = cursor++;
        results[idx] = await fetchNytDualArticle(cleanedUrls[idx]);
      }
    }

    const workers = Array.from({ length: Math.min(3, cleanedUrls.length) }, () => worker());
    await Promise.all(workers);

    res.json({ ok: true, results });
  });

  app.post('/api/parse-html', (req, res) => {
    const html = typeof req.body?.html === 'string' ? req.body.html : '';
    const sourceUrl = typeof req.body?.sourceUrl === 'string' ? req.body.sourceUrl.trim() : '';

    if (!html || html.trim().length < 50) {
      res.status(400).json({ ok: false, error: 'HTML 内容过短或为空，请粘贴完整的网页源代码' });
      return;
    }

    let canonicalDualUrl = 'https://cn.nytimes.com/';
    if (sourceUrl) {
      const check = validateAndNormalizeNytUrl(sourceUrl);
      if (check.valid && check.canonicalDualUrl) {
        canonicalDualUrl = check.canonicalDualUrl;
      }
    }

    try {
      const article = parseNytDualHtml(html, sourceUrl || canonicalDualUrl, canonicalDualUrl, 'html-upload');
      if (article.pairs.length === 0) {
        res.status(422).json({
          ok: false,
          error: '未能从上传的 HTML 中识别到中英文对照段落，请确认保存的是 /dual/ 双语页面。',
        });
        return;
      }
      res.json({ ok: true, article });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'HTML 解析失败';
      res.status(500).json({ ok: false, error: message });
    }
  });

  app.post('/api/export-xlsx', async (req, res) => {
    const articles: unknown = req.body?.articles;
    const options: ExportOptions | undefined = req.body?.options;
    const aggregateStats: CorpusStats | undefined = req.body?.aggregateStats;
    const perArticleStats: Record<string, CorpusStats> | undefined = req.body?.perArticleStats;
    const rawFilename = typeof req.body?.filename === 'string' ? req.body.filename : 'nyt_bilingual_aligned';

    if (!Array.isArray(articles) || articles.length === 0 || !options) {
      res.status(400).json({ ok: false, error: '缺少待导出的文章数据或导出配置' });
      return;
    }

    try {
      const buffer = await generateXlsxWorkbook(
        articles as BilingualArticle[],
        options,
        aggregateStats,
        perArticleStats
      );
      const safeBase =
        rawFilename
          .replace(/[^\w\u4e00-\u9fff\-_. ]+/g, '_')
          .trim()
          .slice(0, 80) || 'nyt_bilingual_aligned';
      const asciiFallback = safeBase.replace(/[^\x20-\x7E]/g, '_') || 'nyt_bilingual_aligned';
      const encodedName = encodeURIComponent(`${safeBase}.xlsx`);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${asciiFallback}.xlsx"; filename*=UTF-8''${encodedName}`
      );
      res.send(buffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : '生成 XLSX 文件失败';
      res.status(500).json({ ok: false, error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`New York Times EN-CN Bilingual-text Downloader running on http://localhost:${PORT}`);
  });
}

startServer();
