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

// 预置的中文标题翻译（避免AI调用不稳定）
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

function translateTitle(title) {
  const lower = title.toLowerCase();
  for (const [key, value] of Object.entries(TITLE_TRANSLATIONS)) {
    if (lower.includes(key)) return value;
  }
  // 如果匹配不到，返回原标题
  return title;
}

function generateInsight(news) {
  // 不使用AI，直接用规则生成稳定的中文内容
  const title = translateTitle(news.title);
  
  // 根据来源类型生成不同的洞察
  const insights = {
    media: '该技术/产品在中文市场具有重要参考价值，值得关注其商业化落地进展和对国内AI生态的影响。',
    agent: 'Agent技术正在快速发展，该方案在自动化工作流、工具调用等方面具有实践价值，建议评估其适用场景。',
    official: '作为官方发布的技术/产品，代表了行业发展方向，建议关注其技术细节和商业化策略。'
  };
  
  const recommendations = {
    short: '1.调研技术原理 2.评估适用场景 3.关注竞品动态',
    medium: '1.开发概念验证 2.收集用户反馈 3.优化产品体验',
    long: '1.制定商业化策略 2.构建技术壁垒 3.规划生态布局'
  };
  
  return {
    title,
    insight: insights[news.sourceType] || insights.media,
    ...recommendations
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
    const result = generateInsight(news);
    
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
        techFeasibility: 4,
        implementation: 3,
        techStars: '★★★★☆',
        implStars: '★★★☆☆',
        maturity: '可用',
        keyInsight: result.insight,
        recommendations: {
          short: result.short,
          medium: result.medium,
          long: result.long
        }
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
