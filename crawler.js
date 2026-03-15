const axios = require('axios');
const RSSParser = require('rss-parser');
const fs = require('fs');
const path = require('path');

// 硬编码 API Key 确保翻译生效
const SILICONFLOW_API_KEY = 'sk-cqgwfjqbgvrdxxxazprkytqaabszazhuccglfkeoxujrreuj';

const rssParser = new RSSParser({
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
});

// 权威AI新闻源
const SOURCES = [
  { name: 'OpenAI Blog', url: 'https://openai.com/blog/rss.xml', type: '官方', maxItems: 5 },
  { name: '量子位', url: 'https://www.qbitai.com/rss', type: '媒体', maxItems: 5 },
  { name: 'LangChain', url: 'https://blog.langchain.dev/rss/', type: 'Agent', maxItems: 4 },
  { name: 'Hugging Face', url: 'https://huggingface.co/blog/feed.xml', type: '官方', maxItems: 3 },
  { name: 'Google AI', url: 'https://blog.google/technology/ai/rss/', type: '官方', maxItems: 3 },
  { name: 'Sebastian Raschka', url: 'https://magazine.sebastianraschka.com/feed', type: '专家', maxItems: 3 },
  { name: 'Lil Log', url: 'https://lilianweng.github.io/index.xml', type: '专家', maxItems: 3 },
  { name: '机器之心', url: 'https://www.jiqizhixin.com/rss', type: '媒体', maxItems: 4 },
  { name: 'MIT Technology Review', url: 'https://www.technologyreview.com/feed/', type: '媒体', maxItems: 3 },
];

// 7个内容分类
const CATEGORIES = {
  'llm': '大语言模型',
  'image-video': 'AI绘画/视频',
  'agent': 'Agent',
  'research': '科研突破',
  'company': '企业动态',
  'devtool': '开发工具',
  'application': '应用落地'
};

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

// 检查新闻是否在最近 N 天内
function isRecentNews(news, days = 3) {
  const pubDate = new Date(news.pubDate);
  const now = new Date();
  const diffTime = now - pubDate;
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  return diffDays <= days;
}

function isValidNews(news) {
  const text = (news.title + news.summary).toLowerCase();
  for (const word of BAD_WORDS) {
    if (text.includes(word)) return false;
  }
  const aiWords = ['ai', '人工智能', '大模型', 'llm', 'gpt', 'agent', '智能体', 'openai', 'claude', 'langchain'];
  return aiWords.some(w => text.includes(w));
}

function categorizeNews(title, summary) {
  const text = (title + ' ' + summary).toLowerCase();
  
  if (text.includes('agent') || text.includes('智能体') || text.includes('langchain') || text.includes('autogpt')) {
    return 'agent';
  }
  if (text.includes('image') || text.includes('绘画') || text.includes('video') || text.includes('视频') || text.includes('sora') || text.includes('diffusion')) {
    return 'image-video';
  }
  if (text.includes('research') || text.includes('论文') || text.includes('arxiv') || text.includes('study')) {
    return 'research';
  }
  if (text.includes('openai') || text.includes('google') || text.includes('meta') || text.includes('anthropic') || text.includes('收购') || text.includes('融资')) {
    return 'company';
  }
  if (text.includes('code') || text.includes('代码') || text.includes('dev') || text.includes('tool') || text.includes('github')) {
    return 'devtool';
  }
  if (text.includes('app') || text.includes('应用') || text.includes('product') || text.includes('用户')) {
    return 'application';
  }
  return 'llm';
}

// 判断标题是否为英文
function isEnglishTitle(title) {
  if (!title) return false;
  const asciiChars = title.replace(/[^a-zA-Z]/g, '').length;
  return asciiChars / title.length > 0.5;
}

// 翻译英文标题为中文
async function translateTitle(title, summary, apiKey) {
  if (!isEnglishTitle(title)) return title;
  const key = apiKey || SILICONFLOW_API_KEY;
  if (!key) return title; // 无API时保留原文

  try {
    const res = await axios.post('https://api.siliconflow.cn/v1/chat/completions', {
      model: 'deepseek-ai/DeepSeek-V3',
      messages: [
        { role: 'system', content: '你是AI行业新闻编辑。将英文标题翻译成简洁的中文标题，保留关键产品名和技术术语原文。只输出翻译结果，不要解释。' },
        { role: 'user', content: `翻译这个AI新闻标题为中文（保留产品名如OpenAI/LangChain等）：\n${title}` }
      ],
      temperature: 0.3,
      max_tokens: 100
    }, {
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      timeout: 30000
    });
    const translated = res.data.choices[0].message.content.trim();
    // 去除可能的引号
    const cleaned = translated.replace(/^["'""]+|["'""]+$/g, '');
    if (cleaned.length > 0 && cleaned.length < 100) {
      console.log(`[翻译] ${title} → ${cleaned}`);
      return cleaned;
    }
  } catch (e) {
    console.log(`[翻译失败] ${title}: ${e.message.substring(0, 30)}`);
  }
  return title;
}

// 确保 techKeywords 输出为字符串
function normalizeTechKeywords(kw) {
  if (!kw) return '';
  if (typeof kw === 'string') return kw;
  // 如果AI返回了对象，转为 "术语：说明" 格式的字符串
  try {
    return Object.entries(kw).map(([k, v]) => `${k}：${v}`).join('\n');
  } catch(e) {
    return JSON.stringify(kw);
  }
}

async function generateAnalysis(news, chineseTitle) {
  const apiKey = SILICONFLOW_API_KEY;
  if (!apiKey) {
    return {
      coreInsight: `${chineseTitle}。该技术值得关注，建议评估其落地可行性。`,
      scenarios: '企业级应用、开发者工具',
      techKeywords: 'AI大模型(Large Language Model)：基于Transformer架构的预训练语言模型，具备强大的文本理解和生成能力。',
      productDesign: '可关注该技术在现有产品中的集成可能性，评估用户体验提升空间。'
    };
  }
  
  const category = categorizeNews(news.title, news.summary);
  const categoryName = CATEGORIES[category];
  
  const prompt = `作为资深AI产品经理，分析以下新闻：

标题：${chineseTitle}
原标题：${news.title}
摘要：${news.summary.substring(0, 400)}
来源：${news.sourceName}

请严格按以下JSON格式输出（所有value都是字符串，不要嵌套对象）：
{
  "coreInsight": "核心洞察：技术原理+用法说明，2-3句话",
  "scenarios": "应用场景1、应用场景2、应用场景3",
  "techKeywords": "术语A(English)：2句话说明核心原理。术语B(English)：2句话说明。",
  "productDesign": "从PM角度分析产品启示和机会，2-3句话"
}

要求：
1. 所有字段的值必须是纯字符串，techKeywords不要用嵌套对象
2. 所有输出用中文，技术关键词保留英文原词
3. 讲核心点，不要废话`;

  try {
    const res = await axios.post('https://api.siliconflow.cn/v1/chat/completions', {
      model: 'deepseek-ai/DeepSeek-V3',
      messages: [
        { role: 'system', content: '你是资深AI产品经理。所有JSON字段的值必须是纯字符串。techKeywords字段绝对不能是对象/字典，必须是一个字符串。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 800
    }, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 90000
    });
    
    const content = res.data.choices[0].message.content;
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      // 强制确保 techKeywords 是字符串
      parsed.techKeywords = normalizeTechKeywords(parsed.techKeywords);
      parsed.chineseTitle = chineseTitle;
      return parsed;
    }
  } catch (e) {
    console.log(`[AI失败] ${e.message.substring(0, 50)}`);
  }
  
  return {
    coreInsight: `${chineseTitle}。该技术值得关注，建议评估其落地可行性。`,
    scenarios: '企业级应用、开发者工具',
    techKeywords: 'AI大模型(Large Language Model)：基于Transformer架构的预训练语言模型，具备强大的文本理解和生成能力。',
    productDesign: '可关注该技术在现有产品中的集成可能性，评估用户体验提升空间。'
  };
}

async function main() {
  console.log('=== AI新闻爬取开始 ===');
  
  // 1. 获取所有新闻
  let allNews = [];
  for (const source of SOURCES) {
    const news = await fetchRSS(source);
    allNews = allNews.concat(news);
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log(`[获取] 共 ${allNews.length} 条`);
  
  // 2. 过滤低质量内容
  allNews = allNews.filter(isValidNews);
  console.log(`[过滤] 剩余 ${allNews.length} 条`);
  
  // 2.5 只保留最近 3 天的新闻
  const recentNews = allNews.filter(n => isRecentNews(n, 3));
  console.log(`[时间过滤] 最近3天: ${recentNews.length} 条`);
  
  // 如果最近3天没有足够新闻，使用所有新闻
  if (recentNews.length >= 5) {
    allNews = recentNews;
  } else {
    console.log('[提示] 最近3天新闻不足，使用全部新闻');
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
  
  // 4. 分类并排序（每个分类最多2条进入头条）
  const categoryCount = {};
  const headlines = [];
  const quickBrowse = [];
  
  for (const news of allNews) {
    news.category = categorizeNews(news.title, news.summary);
    categoryCount[news.category] = (categoryCount[news.category] || 0) + 1;
    
    if (headlines.length < 5 && categoryCount[news.category] <= 2) {
      headlines.push(news);
    } else if (quickBrowse.length < 10) {
      quickBrowse.push(news);
    }
  }
  
  // 5. 生成分析内容
  const today = new Date().toISOString().split('T')[0];
  const todayStr = today.replace(/-/g, '');
  
  const processNews = async (news, index, isHeadline) => {
    // 先强制翻译标题（不依赖 generateAnalysis）
    const chineseTitle = await translateTitle(news.title, news.summary, SILICONFLOW_API_KEY);
    
    const analysis = await generateAnalysis(news, chineseTitle);
    // 使用翻译后的中文标题
    const displayTitle = chineseTitle || news.title;
    
    return {
      id: `${todayStr}_${isHeadline ? String(index + 1).padStart(3, '0') : 'q' + String(index + 1).padStart(3, '0')}`,
      title: displayTitle,
      originalTitle: news.title, // 保留英文原标题
      category: news.category,
      categoryName: CATEGORIES[news.category],
      publishDate: news.pubDate,
      crawlDate: today,
      source: {
        name: news.sourceName,
        type: news.sourceType,
        url: news.url
      },
      tags: [news.sourceType, CATEGORIES[news.category]],
      isHeadline: isHeadline,
      // 分析内容（techKeywords 强制为字符串）
      coreInsight: analysis.coreInsight || '',
      scenarios: analysis.scenarios || '',
      techKeywords: normalizeTechKeywords(analysis.techKeywords),
      productDesign: analysis.productDesign || ''
    };
  };
  
// 并行处理函数（带并发限制）
  async function processBatch(items, isHeadline, concurrency = 3) {
    const results = [];
    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      const batchPromises = batch.map((item, idx) => 
        processNews(item, i + idx, isHeadline)
      );
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      console.log(`[处理进度] ${isHeadline ? '头条' : '速览'}: ${Math.min(i + concurrency, items.length)}/${items.length}`);
    }
    return results;
  }
  
  // 并行处理头条和速览（同时开始，各自限制并发）
  console.log('[开始] 并行处理新闻...');
  const [headlineData, quickData] = await Promise.all([
    processBatch(headlines, true, 3),
    processBatch(quickBrowse, false, 3)
  ]);
  
  // 6. 保存
  const output = {
    date: todayStr,
    updateTime: new Date().toISOString(),
    headlines: headlineData,
    quickBrowse: quickData,
    total: headlineData.length + quickData.length,
    categories: CATEGORIES
  };
  
  const outDir = path.join(__dirname, 'data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  fs.writeFileSync(path.join(outDir, 'insights.json'), JSON.stringify(output, null, 2));
  
  console.log(`=== 完成：头条${headlineData.length}条，速览${quickData.length}条 ===`);
}

main().catch(e => {
  console.error('[错误]', e.message);
  process.exit(1);
});
