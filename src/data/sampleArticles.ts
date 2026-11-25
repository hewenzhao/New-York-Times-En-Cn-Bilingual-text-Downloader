import type { BilingualArticle } from '../types/corpus';

export function createSampleArticles(): BilingualArticle[] {
  const now = new Date().toISOString();

  const article1Pairs = [
    {
      id: 's1-p1',
      index: 1,
      isTitle: true,
      en: 'Global Supply Chains Adapt Quietly as New Trade Rules Take Hold',
      zh: '随着新贸易规则落地，全球供应链悄然调整布局',
    },
    {
      id: 's1-p2',
      index: 2,
      isTitle: false,
      en: 'Across coastal manufacturing hubs, factory managers are rewriting shipping schedules and sourcing contracts in response to shifting tariff regimes. Rather than halting cross-border production, many suppliers have opted to diversify assembly lines across Southeast Asia and Latin America.',
      zh: '在沿海制造业枢纽，工厂管理者们正根据不断变化的关税制度重新制定航运时间表与采购合同。许多供应商并未停止跨境生产，而是选择将组装线分散到东南亚和拉丁美洲。',
    },
    {
      id: 's1-p3',
      index: 3,
      isTitle: false,
      en: 'Economists note that the restructuring is neither rapid nor uniform. High-precision electronics and specialized industrial components still rely heavily on dense supplier ecosystems built over three decades.',
      zh: '经济学家指出，这种重组既非一蹴而就，也非整齐划一。高精度电子产品和特种工业零部件仍然高度依赖过去三十年间建成的密集供应商生态。',
    },
    {
      id: 's1-p4',
      index: 4,
      isTitle: false,
      en: '"Logistics costs have risen by roughly 12 percent, yet predictability matters more to our clients than marginal savings," said Lin Wei, an operations director at a Ningbo machinery exporter.',
      zh: '“物流成本上升了大约12%，但对我们的客户而言，供应链的可预测性比微小的成本节省更为重要，”宁波一家机械出口企业的运营总监林伟表示。',
    },
    {
      id: 's1-p5',
      index: 5,
      isTitle: false,
      en: 'Port authorities in Singapore and Rotterdam also reported higher transshipment volumes during the third quarter, reflecting longer multi-leg maritime routes.',
      zh: '新加坡和鹿特丹的港务局也报告称，第三季度中转货运量有所上升，反映出多段式海上运输路线正在变长。',
    },
  ];

  const article2Pairs = [
    {
      id: 's2-p1',
      index: 1,
      isTitle: true,
      en: 'How Cities Are Redesigning Public Libraries for an Era of Heat and Isolation',
      zh: '酷暑与孤独时代：城市如何重新设计公共图书馆',
    },
    {
      id: 's2-p2',
      index: 2,
      isTitle: false,
      en: 'When record summer temperatures swept through major metropolitan areas this year, neighborhood libraries quietly became frontline climate shelters. Architects and municipal planners are now rethinking what a civic reading room should provide.',
      zh: '当创纪录的夏季高温今年席卷各大都市区时，社区图书馆悄然成为了应对气候危机的一线避暑场所。建筑师与市政规划者如今正在重新思考公民阅览室应当提供哪些功能。',
    },
    {
      id: 's2-p3',
      index: 3,
      isTitle: false,
      en: 'In newly renovated branches from Madrid to Taipei, silent study tables share floor space with shaded courtyards, community repair workshops and air-filtered lounges for older residents living alone.',
      zh: '从马德里到台北，在新近翻修的分馆中，安静的自习桌与遮荫庭院、社区维修工坊以及供独居老人使用的空气过滤休息室共享同一片空间。',
    },
    {
      id: 's2-p4',
      index: 4,
      isTitle: false,
      en: 'Public health researchers say these low-barrier spaces play an underappreciated role in reducing urban loneliness. Unlike commercial cafes, libraries require no purchase to stay all afternoon.',
      zh: '公共卫生研究人员表示，这些低门槛空间在缓解城市孤独感方面发挥着被低估的作用。与商业咖啡馆不同，在图书馆待上一整个下午无需任何消费。',
    },
  ];

  return [
    {
      id: 'sample-supply-chain',
      titleEn: article1Pairs[0].en,
      titleZh: article1Pairs[0].zh,
      pairs: article1Pairs,
      rawPairs: article1Pairs.map((p) => ({ ...p })),
      metadata: {
        url: 'https://cn.nytimes.com/business/20261124/global-supply-chains-trade/dual/',
        canonicalDualUrl: 'https://cn.nytimes.com/business/20261124/global-supply-chains-trade/dual/',
        section: '商业与经济 (Business)',
        date: '2026-11-24',
        byline: 'By Editorial Sample',
        fetchedAt: now,
        sourceType: 'sample',
      },
      status: 'ready',
    },
    {
      id: 'sample-libraries',
      titleEn: article2Pairs[0].en,
      titleZh: article2Pairs[0].zh,
      pairs: article2Pairs,
      rawPairs: article2Pairs.map((p) => ({ ...p })),
      metadata: {
        url: 'https://cn.nytimes.com/culture/20261120/cities-redesigning-public-libraries/dual/',
        canonicalDualUrl: 'https://cn.nytimes.com/culture/20261120/cities-redesigning-public-libraries/dual/',
        section: '文化 (Culture)',
        date: '2026-11-20',
        byline: 'By Editorial Sample',
        fetchedAt: now,
        sourceType: 'sample',
      },
      status: 'ready',
    },
  ];
}
