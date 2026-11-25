import * as cheerio from 'cheerio';
import type { ArticleMetadata } from '../src/types/corpus.ts';

const ALLOWED_HOSTS = new Set([
  'cn.nytimes.com',
  'www.cn.nytimes.com',
  'm.cn.nytimes.com',
]);

const SECTION_LABELS: Record<string, string> = {
  china: '中国 (China)',
  world: '国际 (World)',
  business: '商业与经济 (Business)',
  usa: '美国 (U.S.)',
  science: '科学与技术 (Science & Tech)',
  technology: '科技 (Technology)',
  culture: '文化 (Culture)',
  opinion: '观点 (Opinion)',
  style: '风尚 (Style)',
  travel: '旅游 (Travel)',
  education: '教育 (Education)',
  'real-estate': '地产 (Real Estate)',
  health: '健康 (Health)',
  lens: '影像 (Lens)',
};

export interface ParsedNytArticle {
  titleEn: string;
  titleZh: string;
  pairs: Array<{ isTitle?: boolean; en: string; zh: string }>;
  metadata: ArticleMetadata;
}

function isPrivateOrLocalHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '0.0.0.0' ||
    lower === '::1' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    return true;
  }
  const ipv4Match = lower.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const a = Number(ipv4Match[1]);
    const b = Number(ipv4Match[2]);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

export function validateAndNormalizeNytUrl(rawUrl: string): {
  valid: boolean;
  canonicalDualUrl?: string;
  originalUrl?: string;
  error?: string;
} {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { valid: false, error: 'URL 不能为空' };
  }

  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { valid: false, error: 'URL 格式无效，请检查链接是否完整' };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { valid: false, error: '仅支持 HTTP 或 HTTPS 协议的链接' };
  }

  const host = parsed.hostname.toLowerCase();
  if (isPrivateOrLocalHostname(host) || !ALLOWED_HOSTS.has(host)) {
    return {
      valid: false,
      error: `仅允许抓取 cn.nytimes.com 域名下的双语文章（当前域名: ${host}）`,
    };
  }

  parsed.protocol = 'https:';
  parsed.hostname = 'cn.nytimes.com';
  parsed.hash = '';
  parsed.search = '';

  let pathname = parsed.pathname.replace(/\/+$/, '');
  // Normalize /en-us/ or /zh-hant/ or regular article path to /dual/
  if (pathname.endsWith('/dual')) {
    pathname = `${pathname}/`;
  } else if (pathname.endsWith('/en-us')) {
    pathname = `${pathname.slice(0, -6)}/dual/`;
  } else if (pathname.endsWith('/zh-hant')) {
    pathname = `${pathname}/dual/`;
  } else if (/^\/[^/]+\/\d{8}\/[^/]+$/.test(pathname)) {
    pathname = `${pathname}/dual/`;
  } else if (!pathname.endsWith('/')) {
    pathname = `${pathname}/`;
  }

  parsed.pathname = pathname;

  return {
    valid: true,
    originalUrl: trimmed,
    canonicalDualUrl: parsed.toString(),
  };
}

function hasCjk(text: string): boolean {
  return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(text);
}

function cjkRatio(text: string): number {
  const cleaned = text.replace(/\s+/g, '');
  if (!cleaned) return 0;
  const cjkMatches = cleaned.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g);
  return (cjkMatches ? cjkMatches.length : 0) / cleaned.length;
}

function cleanText(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isBoilerplate(text: string): boolean {
  if (!text) return true;
  const patterns = [
    /^广告$/i,
    /^Advertisement$/i,
    /^Continue reading the main story$/i,
    /^相关文章/,
    /^欢迎关注纽约时报中文网/,
    /^点击查看/,
    /^Subscribe/i,
    /^Read in English$/i,
    /^阅读简体中文版/,
    /^阅读繁体中文版/,
    /^双语对照$/,
  ];
  return patterns.some((re) => re.test(text.trim()));
}

function extractMetadataFromUrlAndDom(
  $: cheerio.CheerioAPI,
  sourceUrl: string,
  canonicalDualUrl: string,
  sourceType: ArticleMetadata['sourceType']
): ArticleMetadata {
  let section = '未分类';
  let date = '';

  try {
    const u = new URL(canonicalDualUrl || sourceUrl || 'https://cn.nytimes.com/');
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length > 0 && SECTION_LABELS[parts[0]]) {
      section = SECTION_LABELS[parts[0]];
    } else if (parts.length > 0 && !/^\d+$/.test(parts[0])) {
      section = parts[0];
    }
    const datePart = parts.find((p) => /^\d{8}$/.test(p));
    if (datePart) {
      date = `${datePart.slice(0, 4)}-${datePart.slice(4, 6)}-${datePart.slice(6, 8)}`;
    }
  } catch {
    // ignore URL parse error for local HTML
  }

  if (!date) {
    const metaTime =
      $('meta[name="ptime"]').attr('content') ||
      $('meta[property="article:published_time"]').attr('content') ||
      $('time[datetime]').first().attr('datetime') ||
      $('time').first().text();
    if (metaTime) {
      const m = metaTime.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/);
      if (m) {
        date = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
      } else {
        const compact = metaTime.match(/(\d{4})(\d{2})(\d{2})/);
        if (compact) {
          date = `${compact[1]}-${compact[2]}-${compact[3]}`;
        }
      }
    }
  }

  const bylineRaw = cleanText(
    $('.byline-box .byline').first().text() ||
      $('.article-byline').first().text() ||
      $('meta[name="author"]').attr('content') ||
      ''
  );

  return {
    url: sourceUrl || canonicalDualUrl,
    canonicalDualUrl: canonicalDualUrl || sourceUrl,
    section,
    date: date || new Date().toISOString().slice(0, 10),
    byline: bylineRaw || undefined,
    fetchedAt: new Date().toISOString(),
    sourceType,
  };
}

export function parseNytDualHtml(
  html: string,
  sourceUrl: string,
  canonicalDualUrl: string,
  sourceType: ArticleMetadata['sourceType'] = 'live-url'
): ParsedNytArticle {
  const $ = cheerio.load(html);

  // Remove non-article noise elements
  $(
    'script, style, noscript, iframe, svg, .ad, .advertisement, .related-articles, .article-related, .newsletter-signup, .share-tools, .comments-wrapper, nav, footer'
  ).remove();

  // 1. Extract Chinese & English Titles
  let titleEn = '';
  let titleZh = '';

  const enTitleSelectors = [
    '.article-header .en-title',
    '.article-header h1.en-title',
    '.article-header h2.en-title',
    'h1.en-title',
    'h2.en-title',
    '.dual-title-en',
    '.en-headline',
    '.article-title-en',
  ];
  for (const sel of enTitleSelectors) {
    const t = cleanText($(sel).first().text());
    if (t) {
      titleEn = t;
      break;
    }
  }

  const zhTitleSelectors = [
    '.article-header h1:not(.en-title)',
    '.article-header .zh-title',
    'h1.article-title',
    'h1.zh-title',
    '.dual-title-zh',
    'article h1',
    'h1',
  ];
  for (const sel of zhTitleSelectors) {
    const candidates = $(sel);
    candidates.each((_, el) => {
      const t = cleanText($(el).text());
      if (!t) return;
      if (hasCjk(t) && !titleZh) {
        titleZh = t;
      } else if (!hasCjk(t) && !titleEn && t.length > 5) {
        titleEn = t;
      }
    });
    if (titleZh && titleEn) break;
  }

  // Fallback to meta tags if one title is still missing
  if (!titleZh) {
    const ogTitle = cleanText(
      $('meta[property="og:title"]').attr('content') || $('title').text() || ''
    ).replace(/\s*[-–|]\s*纽约时报中文网.*$/, '');
    if (ogTitle && hasCjk(ogTitle)) {
      titleZh = ogTitle;
    } else if (ogTitle && !titleEn) {
      titleEn = ogTitle;
    }
  }

  // 2. Extract Bilingual Body Pairs
  const bodyPairs: Array<{ en: string; zh: string }> = [];

  // Strategy A: .article-dual-body-item (each row holds EN + ZH blocks)
  const dualItems = $('.article-dual-body-item');
  if (dualItems.length > 0) {
    dualItems.each((_, row) => {
      const cols = $(row).find('.article-paragraph, .dual-en, .dual-zh, p, h2, h3');
      if (cols.length >= 2) {
        let enText = '';
        let zhText = '';
        cols.each((__, col) => {
          const text = cleanText($(col).text());
          if (!text || isBoilerplate(text)) return;
          if (cjkRatio(text) >= 0.15) {
            zhText = zhText ? `${zhText} ${text}` : text;
          } else {
            enText = enText ? `${enText} ${text}` : text;
          }
        });
        if (enText || zhText) {
          bodyPairs.push({ en: enText, zh: zhText });
        }
      } else {
        const children = $(row).children();
        if (children.length >= 2) {
          const t1 = cleanText(children.eq(0).text());
          const t2 = cleanText(children.eq(1).text());
          if ((t1 || t2) && !isBoilerplate(t1) && !isBoilerplate(t2)) {
            if (cjkRatio(t1) > cjkRatio(t2)) {
              bodyPairs.push({ en: t2, zh: t1 });
            } else {
              bodyPairs.push({ en: t1, zh: t2 });
            }
          }
        }
      }
    });
  }

  // Strategy B: Alternating .article-paragraph blocks inside .article-body
  if (bodyPairs.length === 0) {
    const paragraphs: Array<{ lang: 'en' | 'zh'; text: string }> = [];
    const selector =
      '.article-body .article-paragraph, .article-content .article-paragraph, .article-body p, .article-body h2, .article-body h3';
    $(selector).each((_, el) => {
      const $el = $(el);
      if (
        $el.closest('.article-body-aside, .article-span-photo, figcaption, .byline-box').length >
        0
      ) {
        return;
      }
      const text = cleanText($el.text());
      if (!text || isBoilerplate(text)) return;
      const lang: 'en' | 'zh' = cjkRatio(text) >= 0.15 ? 'zh' : 'en';
      paragraphs.push({ lang, text });
    });

    // Pair consecutive EN & ZH blocks
    let pendingEn = '';
    let pendingZh = '';
    for (const item of paragraphs) {
      if (item.lang === 'en') {
        if (pendingEn && pendingZh) {
          bodyPairs.push({ en: pendingEn, zh: pendingZh });
          pendingEn = item.text;
          pendingZh = '';
        } else if (pendingEn && !pendingZh) {
          // Two consecutive EN paragraphs without ZH in between
          bodyPairs.push({ en: pendingEn, zh: '' });
          pendingEn = item.text;
        } else if (pendingZh && !pendingEn) {
          // ZH came first, now EN completes the pair
          bodyPairs.push({ en: item.text, zh: pendingZh });
          pendingEn = '';
          pendingZh = '';
        } else {
          pendingEn = item.text;
        }
      } else {
        if (pendingEn && !pendingZh) {
          bodyPairs.push({ en: pendingEn, zh: item.text });
          pendingEn = '';
          pendingZh = '';
        } else if (pendingZh && !pendingEn) {
          bodyPairs.push({ en: '', zh: pendingZh });
          pendingZh = item.text;
        } else {
          pendingZh = item.text;
        }
      }
    }
    if (pendingEn || pendingZh) {
      bodyPairs.push({ en: pendingEn, zh: pendingZh });
    }
  }

  // Strategy C: Generic article/main paragraphs fallback (for custom saved pages)
  if (bodyPairs.length === 0) {
    const blocks: Array<{ lang: 'en' | 'zh'; text: string }> = [];
    $('article p, main p, .story-body p, p').each((_, el) => {
      const text = cleanText($(el).text());
      if (!text || text.length < 2 || isBoilerplate(text)) return;
      blocks.push({ lang: cjkRatio(text) >= 0.15 ? 'zh' : 'en', text });
    });

    let i = 0;
    while (i < blocks.length) {
      const curr = blocks[i];
      const next = blocks[i + 1];
      if (next && curr.lang !== next.lang) {
        bodyPairs.push(
          curr.lang === 'en'
            ? { en: curr.text, zh: next.text }
            : { en: next.text, zh: curr.text }
        );
        i += 2;
      } else {
        bodyPairs.push(
          curr.lang === 'en' ? { en: curr.text, zh: '' } : { en: '', zh: curr.text }
        );
        i += 1;
      }
    }
  }

  // Build final aligned array with Title strictly in the FIRST row
  const pairs: Array<{ isTitle?: boolean; en: string; zh: string }> = [];
  if (titleEn || titleZh) {
    pairs.push({
      isTitle: true,
      en: titleEn || '(English Headline Missing)',
      zh: titleZh || '(中文标题缺失)',
    });
  }
  for (const bp of bodyPairs) {
    pairs.push({ isTitle: false, en: bp.en, zh: bp.zh });
  }

  const metadata = extractMetadataFromUrlAndDom($, sourceUrl, canonicalDualUrl, sourceType);

  return {
    titleEn: titleEn || 'Untitled NYT Article',
    titleZh: titleZh || '未命名纽约时报文章',
    pairs,
    metadata,
  };
}

export async function fetchNytDualArticle(rawUrl: string): Promise<{
  ok: boolean;
  inputUrl: string;
  canonicalDualUrl: string;
  article?: ParsedNytArticle;
  error?: string;
  hint?: string;
}> {
  const normalized = validateAndNormalizeNytUrl(rawUrl);
  if (!normalized.valid || !normalized.canonicalDualUrl) {
    return {
      ok: false,
      inputUrl: rawUrl,
      canonicalDualUrl: rawUrl,
      error: normalized.error || '链接无效',
    };
  }

  const targetUrl = normalized.canonicalDualUrl;

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        Referer: 'https://cn.nytimes.com/',
      },
    });

    if (!response.ok) {
      return {
        ok: false,
        inputUrl: rawUrl,
        canonicalDualUrl: targetUrl,
        error: `目标站点返回 HTTP ${response.status} (${response.statusText || '请求被拒绝'})`,
        hint: '若文章受地区网络限制、人机验证或订阅墙保护，可在浏览器打开该 /dual/ 页面后「另存为网页 HTML」或复制网页源码，使用本工具的「HTML 源码导入」功能即可无损对齐导出。',
      };
    }

    const html = await response.text();
    if (!html || html.length < 300) {
      return {
        ok: false,
        inputUrl: rawUrl,
        canonicalDualUrl: targetUrl,
        error: '返回的页面内容为空或过短',
        hint: '请检查链接是否为有效的 cn.nytimes.com 双语文章页，或改用 HTML 源码导入。',
      };
    }

    const parsed = parseNytDualHtml(html, rawUrl, targetUrl, 'live-url');
    if (parsed.pairs.length === 0) {
      return {
        ok: false,
        inputUrl: rawUrl,
        canonicalDualUrl: targetUrl,
        error: '未能从页面中提取到双语对照正文（可能页面触发了反爬验证或非双语版面）',
        hint: '请尝试在浏览器打开该链接后右键「查看网页源代码」并粘贴至「HTML 源码导入」面板。',
      };
    }

    return {
      ok: true,
      inputUrl: rawUrl,
      canonicalDualUrl: targetUrl,
      article: parsed,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : '网络请求失败';
    return {
      ok: false,
      inputUrl: rawUrl,
      canonicalDualUrl: targetUrl,
      error: `抓取失败：${message}`,
      hint: '当前服务器运行环境可能无法直连 cn.nytimes.com（或连接超时）。您可以将目标网页保存为 .html 文件或复制源码后，通过「HTML 源码导入」立即完成对齐与 XLSX 导出。',
    };
  }
}
