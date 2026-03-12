const axios = require('axios');
const RSSParser = require('rss-parser');
const fs = require('fs');
const path = require('path');

const rssParser = new RSSParser({
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
});

// 权威AI新闻源（基于tech-news-digest技能配置）
const SOURCES = [
  // 高优先级：官方和顶级专家
  { name: 'OpenAI Blog', url: 'https://openai.com/blog/rss.xml', type: 'official', maxItems: 2 },
  { name: 'Hugging Face', url: 'https://huggingface.co/blog/feed.xml', type: 'official', maxItems: 2 },
  { name: 'Google AI', url: 'https://blog.google/technology/ai/rss/', type: 'official', maxItems: 2 },
  
  // 中优先级：行业专家和KOL
  { name: 'Simon Willison', url: 'https://simonwillison.net/atom/everything/', type: 'expert', maxItems: 2 },
  { name: 'Sebastian Raschka', url: 'https://magazine.sebastianraschka.com/feed', type: 'expert', maxItems: 2 },
  { name: 'Lil\'Log', url: 'https://lilianweng.github.io/index.xml', type: 'expert', maxItems: 2 },
  { name: 'Gary Marcus', url: 'https://garymarcus.substack.com/feed', type: 'expert', maxItems: 1 },
  
  // 中文媒体
  { name: '量子位', url: 'https://www.qbitai.com/rss', type: 'media', maxItems: 3 },
  
  // Agent专项
  { name: 'LangChain', url: 'https://blog.langchain.dev/rss/', type: 'agent', maxItems: 2 },
];

// 过滤低质量内容
const BAD_WORDS = ['token自由', '奖金', '0门槛', '冲就完了', '大舞台', '养虾', '龙虾', '羊毛', '限时', '免费领', '速来'];

async function fetchRSS(source) {
  try {
    console.log(`[获取] ${source.name}`);
    const feed = await rssParser.parseURL(source.url);
    return feed.items.slice(0, source.maxItems).map(item => ({
      title: item.title || '',
      summary: item.contentSnippet || item.content || '',
      url: item.link || '',
      pubDate: item.pubDate || new Date().toISOString(),
      sourceName: source.name,
      sourceType: source.type
    }));
  } catch (error) {
    console.log(`[失败] ${source.name}: ${error.message.substring(0, 50)}`);
    return [];
  }
}

function isValidNews(news) {
  const text = (news.title + news.summary).toLowerCase();
  // 过滤广告
  for (const word of BAD_WORDS) {
    if (text.includes(word)) return false;
  }
  // 必须包含AI关键词
  const aiWords = ['ai', '人工智能', '大模型', 'llm', 'gpt', 'agent', '智能体', 'openai', 'claude', 'langchain'];
  return aiWords.some(w => text.includes(w));
}

// 预置的中文标题翻译
const TITLE_TRANSLATIONS = {
  'autonomous context compression': 'LangChain推出自主上下文压缩技术',
  'rakuten fixes issues twice as fast': 'Rakuten用Codex将问题修复速度提升2倍',
  'designing ai agents to resist prompt injection': '设计抗提示注入的AI Agent安全方案',
  'wayfair boosts catalog accuracy': 'Wayfair用OpenAI提升电商产品目录精准度',
  'from model to agent': 'OpenAI发布Agent运行环境',
  'the anatomy of an agent harness': 'Agent架构解析：模型与工程化框架',
  'how coding agents are reshaping': '编程Agent如何重塑工程、产品和设计',
  'improving instruction hierarchy': '前沿大模型的指令层级安全优化',
  'new ways to learn math': 'ChatGPT推出数学和科学交互式学习',
  'openai to acquire promptfoo': 'OpenAI收购Promptfoo强化AI安全能力',
  'how descript enables': 'Descript实现大规模多语言视频配音',
  'how wattpad uses': 'Wattpad用OpenAI扩展内容审核能力',
  'how coding agents work': '编程Agent工作原理深度解析',
  'evaluating skills': 'Agent技能评估体系设计',
  'qq浏览器': 'QQ浏览器入选a16z全球AI应用榜单',
  '对话vast': '对话VAST：2秒生成3D内容的技术突破'
};

// 产品机会画布模板（根据新闻类型匹配）
const PRODUCT_CANVAS_TEMPLATES = {
  developer: {
    targetUser: '企业开发者、技术团队负责人',
    scenarios: '代码开发、自动化测试、DevOps流程',
    competitors: 'GitHub Copilot、Cursor、国内同类产品',
    difficulty: 3,
    potential: '高'
  },
  enterprise: {
    targetUser: '企业决策者、产品经理',
    scenarios: '客服自动化、知识管理、业务流程优化',
    competitors: '传统SaaS、大厂AI产品',
    difficulty: 4,
    potential: '中高'
  },
  consumer: {
    targetUser: 'C端用户、创作者',
    scenarios: '内容创作、学习辅助、日常效率',
    competitors: '现有消费级AI产品',
    difficulty: 2,
    potential: '中'
  },
  infrastructure: {
    targetUser: 'AI基础设施开发者、平台架构师',
    scenarios: '模型训练、推理优化、工具链建设',
    competitors: '云厂商AI服务、开源方案',
    difficulty: 5,
    potential: '高'
  }
};

function translateTitle(title) {
  const lower = title.toLowerCase();
  for (const [key, value] of Object.entries(TITLE_TRANSLATIONS)) {
    if (lower.includes(key)) return value;
  }
  return title;
}

function detectProductType(title, summary) {
  const text = (title + ' ' + summary).toLowerCase();
  if (text.includes('code') || text.includes('coding') || text.includes('developer') || text.includes('dev')) return 'developer';
  if (text.includes('enterprise') || text.includes('business') || text.includes('company')) return 'enterprise';
  if (text.includes('consumer') || text.includes('user') || text.includes('app')) return 'consumer';
  return 'infrastructure';
}

function generateDeepInsight(news) {
  const title = translateTitle(news.title);
  const productType = detectProductType(news.title, news.summary);
  const canvas = PRODUCT_CANVAS_TEMPLATES[productType];
  
  // 根据来源生成不同的技术解读深度
  const techAnalysis = {
    official: `该技术由${news.sourceName}官方发布，代表了行业最新发展方向。从技术架构看，这属于${productType === 'developer' ? '开发者工具层' : productType === 'enterprise' ? '企业应用层' : '基础设施层'}的创新，可能改变现有产品形态。`,
    expert: `${news.sourceName}作为领域专家，深入分析了该技术的实现原理。核心突破在于架构设计的优化，这对产品化落地具有重要参考价值。`,
    media: '该技术在中文市场引发关注，从技术成熟度看已具备商业化条件，值得评估其在国内的适用性和竞争格局。',
    agent: 'Agent技术栈的又一进展，重点解决了多步骤任务执行中的关键问题，对构建复杂AI工作流有实际帮助。'
  };
  
  const marketImpact = {
    developer: '将降低开发门槛，提升个体开发者效率，可能改变团队协作模式和技术栈选择。',
    enterprise: '有望替代传统SaaS的部分功能，企业采购决策将面临AI原生方案 vs 传统方案的选择。',
    consumer: '用户体验将被重新定义，交互方式从GUI向自然语言过渡，产品形态需重新设计。',
    infrastructure: '底层能力增强将催生上层应用创新，平台型机会显现，但技术壁垒较高。'
  };
  
  return {
    title,
    // 深度洞察 - 技术产品双维度
    deepInsight: {
      techPrinciple: techAnalysis[news.sourceType] || techAnalysis.media,
      productValue: `对产品经理而言，这意味着${marketImpact[productType]}`,
      marketImpact: marketImpact[productType],
      timeWindow: news.sourceType === 'official' ? '官方已发布，建议3个月内评估落地' : '技术验证阶段，建议持续关注6个月'
    },
    // 产品机会画布
    productCanvas: canvas
  };
}

async function main() {
  console.log('=== 开始爬取 ===');
  
  // 1. 获取所有新闻
  let allNews = [];
  for (const source of SOURCES) {
    const news = await fetchRSS(source);
    allNews = allNews.concat(news);
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log(`[获取] 共 ${allNews.length} 条`);
  
  // 2. 过滤
  allNews = allNews.filter(isValidNews);
  console.log(`[过滤] 剩余 ${allNews.length} 条`);
  
  if (allNews.length === 0) {
    console.log('[错误] 没有有效新闻');
    process.exit(1);
  }
  
  // 3. 去重
  const seen = new Set();
  allNews = allNews.filter(n => {
    const key = n.title.toLowerCase().substring(0, 30);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  console.log(`[去重] 剩余 ${allNews.length} 条`);
  
  // 4. 生成洞察（前15条）
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const headlines = [];
  const quickBrowse = [];
  
  for (let i = 0; i < allNews.length && i < 15; i++) {
    const news = allNews[i];
    const result = generateDeepInsight(news);
    
    const item = {
      id: `${today}_${String(i+1).padStart(3, '0')}`,
      title: result.title,
      category: news.sourceType,
      fact: {
        sourceName: news.sourceName,
        sourceType: news.sourceType,
        sourceUrl: news.url
      },
      insight: {
        techFeasibility: result.productCanvas.difficulty,
        implementation: result.productCanvas.difficulty,
        techStars: '★'.repeat(result.productCanvas.difficulty) + '☆'.repeat(5 - result.productCanvas.difficulty),
        implStars: '★'.repeat(result.productCanvas.difficulty) + '☆'.repeat(5 - result.productCanvas.difficulty),
        maturity: '可用',
        // 核心洞察（增强版）- 去掉换行符，用空格分隔
        keyInsight: result.deepInsight.techPrinciple + ' ' + result.deepInsight.productValue + ' ' + result.deepInsight.marketImpact,
        // 时间窗口
        timeWindow: result.deepInsight.timeWindow,
        // 产品画布
        targetUser: result.productCanvas.targetUser,
        scenarios: result.productCanvas.scenarios,
        competitors: result.productCanvas.competitors,
        potential: result.productCanvas.potential
      },
      tags: [news.sourceType]
    };
    
    if (i < 5) {
      headlines.push(item);
    } else {
      quickBrowse.push(item);
    }
  }
  
  // 5. 保存
  const output = {
    date: today,
    headlines,
    quickBrowse,
    total: headlines.length + quickBrowse.length
  };
  
  const outDir = path.join(__dirname, 'data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  fs.writeFileSync(path.join(outDir, 'insights.json'), JSON.stringify(output, null, 2));
  
  console.log(`=== 完成：头条${headlines.length}条，快速浏览${quickBrowse.length}条 ===`);
}

main().catch(e => {
  console.error('[错误]', e.message);
  process.exit(1);
});
