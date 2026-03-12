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

// 权威AI新闻源
const SOURCES = [
  { name: 'OpenAI Blog', url: 'https://openai.com/blog/rss.xml', type: '官方', maxItems: 3 },
  { name: '量子位', url: 'https://www.qbitai.com/rss', type: '媒体', maxItems: 4 },
  { name: 'LangChain', url: 'https://blog.langchain.dev/rss/', type: 'Agent', maxItems: 3 },
  { name: 'Hugging Face', url: 'https://huggingface.co/blog/feed.xml', type: '官方', maxItems: 2 },
  { name: 'Google AI', url: 'https://blog.google/technology/ai/rss/', type: '官方', maxItems: 2 },
  { name: 'Sebastian Raschka', url: 'https://magazine.sebastianraschka.com/feed', type: '专家', maxItems: 2 },
  { name: 'Lil Log', url: 'https://lilianweng.github.io/index.xml', type: '专家', maxItems: 2 },
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

async function generateAnalysis(news) {
  const apiKey = process.env.SILICONFLOW_API_KEY;
  if (!apiKey) {
    // 无API时返回简化版
    return {
      coreInsight: `${news.title}。该技术值得关注，建议评估其落地可行性。`,
      scenarios: '企业级应用、开发者工具',
      techKeywords: 'AI大模型: 基于Transformer架构的预训练语言模型，具备强大的文本理解和生成能力',
      productDesign: '可关注该技术在现有产品中的集成可能性，评估用户体验提升空间。'
    };
  }
  
  const category = categorizeNews(news.title, news.summary);
  const categoryName = CATEGORIES[category];
  
  const prompt = `作为资深AI产品经理，分析以下新闻：

标题：${news.title}
摘要：${news.summary.substring(0, 400)}
来源：${news.sourceName}

请输出JSON格式：
{
  "coreInsight": "核心洞察：技术原理+用法说明，2-3句话，讲清楚这是什么技术、怎么工作、怎么用",
  "scenarios": "应用场景：2-3个最适合的使用场景，用顿号分隔",
  "techKeywords": "技术关键词：格式'英文术语(English Name): 2-3句话解释核心原理和应用'",
  "productDesign": "产品设计点：从PM角度分析这条新闻带来的产品启示和机会，2-3句话"
}

注意：
1. 内容分类是：${categoryName}
2. 所有输出用中文
3. 技术关键词必须保留英文原词
4. 讲核心点，不要废话`;

  try {
    const res = await axios.post('https://api.siliconflow.cn/v1/chat/completions', {
      model: 'deepseek-ai/DeepSeek-V3',
      messages: [
        { role: 'system', content: '你是资深AI产品经理，擅长技术评估和商业化分析。输出合法JSON。' },
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
      return JSON.parse(match[0]);
    }
  } catch (e) {
    console.log(`[AI失败] ${e.message.substring(0, 50)}`);
  }
  
  // 失败时返回简化版
  return {
    coreInsight: `${news.title}。该技术值得关注，建议评估其落地可行性。`,
    scenarios: '企业级应用、开发者工具',
    techKeywords: 'AI大模型: 基于Transformer架构的预训练语言模型，具备强大的文本理解和生成能力',
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
    const analysis = await generateAnalysis(news);
    
    return {
      id: `${todayStr}_${isHeadline ? String(index + 1).padStart(3, '0') : 'q' + String(index + 1).padStart(3, '0')}`,
      title: news.title,
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
      // 分析内容
      coreInsight: analysis.coreInsight,
      scenarios: analysis.scenarios,
      techKeywords: analysis.techKeywords,
      productDesign: analysis.productDesign
    };
  };
  
  // 处理头条
  const headlineData = [];
  for (let i = 0; i < headlines.length; i++) {
    const item = await processNews(headlines[i], i, true);
    headlineData.push(item);
  }
  
  // 处理速览
  const quickData = [];
  for (let i = 0; i < quickBrowse.length; i++) {
    const item = await processNews(quickBrowse[i], i, false);
    quickData.push(item);
  }
  
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
