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

// 信息源配置（按优先级排序）
const SOURCES = {
  // 第一优先级：中文行业媒体（你最关注的）
  media: [
    { name: '机器之心', url: 'https://www.jiqizhixin.com/rss', type: 'media', priority: 3 },
    { name: '量子位', url: 'https://www.qbitai.com/rss', type: 'media', priority: 3 },
    { name: 'AI Base', url: 'https://www.aibase.com/rss', type: 'media', priority: 3 },
  ],
  
  // 第二优先级：Agent专项（你重点关注的领域）
  agent: [
    { name: 'LangChain Blog', url: 'https://blog.langchain.dev/rss/', type: 'agent', priority: 2 },
  ],
  
  // 第三优先级：官方源（限制数量，避免占比过高）
  official: [
    { name: 'OpenAI Blog', url: 'https://openai.com/blog/rss.xml', type: 'official', priority: 1, maxItems: 2 },
    { name: 'Anthropic Blog', url: 'https://www.anthropic.com/rss.xml', type: 'official', priority: 1, maxItems: 1 },
  ]
};

// Agent关键词（用于识别Agent相关内容）
const AGENT_KEYWORDS = [
  'agent', '智能体', 'autogpt', 'langchain', 'llamaindex', 'crewai',
  'autogen', '多智能体', 'multi-agent', '工具调用', 'function calling',
  'workflow', '工作流', 'orchestration', '编排'
];

// 核心AI关键词（用于计算重要性）
const CORE_KEYWORDS = [
  'gpt', 'claude', 'gemini', 'llama', '大模型', '大语言模型',
  'openai', 'anthropic', 'google', 'meta', 'microsoft',
  '多模态', 'multimodal', '图像生成', '视频生成',
  'rag', '检索增强', 'fine-tuning', '微调',
  'prompt', '提示词', '推理', 'reasoning'
];

// 低质量/广告关键词（用于过滤）
const LOW_QUALITY_KEYWORDS = [
  'token自由', '奖金', '0门槛', '冲就完了', '大舞台',
  '养虾', '龙虾', '挖矿', '空投', '羊毛',
  '限时', '免费领', '速来', '爆款', '秒杀'
];

// 必须包含至少一个AI相关关键词才算有效新闻
const REQUIRED_AI_KEYWORDS = [
  'ai', '人工智能', '大模型', 'llm', 'gpt', 'claude', 'agent', '智能体',
  'openai', 'anthropic', 'google', 'meta', '微软', '百度', '阿里', '腾讯',
  '生成式', 'aigc', '机器学习', '深度学习', '神经网络',
  'rag', '多模态', 'chatgpt', 'copilot', 'midjourney', 'stable diffusion',
  'langchain', 'llama', 'gemini', '文心', '通义', '混元'
];

async function fetchRSS(source) {
  try {
    console.log(`[RSS] 获取: ${source.name}`);
    const feed = await rssParser.parseURL(source.url);
    return feed.items.slice(0, 10).map(item => ({
      title: item.title || '',
      summary: item.contentSnippet || item.content || '',
      url: item.link || '',
      pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
      sourceName: source.name,
      sourceType: source.type,
      rawDate: new Date(item.pubDate || item.isoDate || Date.now())
    }));
  } catch (error) {
    console.error(`[RSS] ${source.name} 失败:`, error.message);
    return [];
  }
}

function isValidNews(news) {
  const text = (news.title + ' ' + news.summary).toLowerCase();
  
  // 1. 检查是否包含低质量关键词
  for (const keyword of LOW_QUALITY_KEYWORDS) {
    if (text.includes(keyword.toLowerCase())) {
      console.log(`[过滤] 低质量内容: ${news.title.substring(0, 40)}...`);
      return false;
    }
  }
  
  // 2. 检查是否包含AI相关关键词（必须至少一个）
  let hasAIKeyword = false;
  for (const keyword of REQUIRED_AI_KEYWORDS) {
    if (text.includes(keyword.toLowerCase())) {
      hasAIKeyword = true;
      break;
    }
  }
  
  if (!hasAIKeyword) {
    console.log(`[过滤] 非AI内容: ${news.title.substring(0, 40)}...`);
    return false;
  }
  
  return true;
}

function calculateImportance(news) {
  let score = 3; // 基础分
  const titleLower = news.title.toLowerCase();
  const summaryLower = news.summary.toLowerCase();
  const text = titleLower + ' ' + summaryLower;
  
  // 来源加分（中文媒体优先级最高）
  if (news.sourceType === 'media') score += 2; // 中文媒体+2
  else if (news.sourceType === 'agent') score += 1; // Agent专项+1
  else if (news.sourceType === 'official') score += 0.5; // 官方源+0.5（降低权重）
  
  // Agent关键词加分（用户重点关注）
  for (const keyword of AGENT_KEYWORDS) {
    if (text.includes(keyword.toLowerCase())) {
      score += 0.8;
      break; // 只加一次
    }
  }
  
  // 核心AI关键词加分
  let coreKeywordCount = 0;
  for (const keyword of CORE_KEYWORDS) {
    if (text.includes(keyword.toLowerCase())) {
      coreKeywordCount++;
    }
  }
  score += Math.min(coreKeywordCount * 0.2, 0.6);
  
  // 时效性加分（24小时内）
  const hoursAgo = (Date.now() - news.rawDate.getTime()) / (1000 * 60 * 60);
  if (hoursAgo < 24) score += 0.5;
  else if (hoursAgo < 48) score += 0.3;
  
  return Math.min(Math.round(score), 5);
}

function categorizeNews(news) {
  const text = (news.title + ' ' + news.summary).toLowerCase();
  
  if (text.includes('agent') || text.includes('智能体') || text.includes('workflow') || text.includes('工作流')) {
    return 'agent';
  }
  if (text.includes('image') || text.includes('图像') || text.includes('绘画') || text.includes('diffusion')) {
    return 'image';
  }
  if (text.includes('video') || text.includes('视频') || text.includes('sora')) {
    return 'video';
  }
  if (text.includes('code') || text.includes('代码') || text.includes('coder') || text.includes('dev')) {
    return 'devtool';
  }
  if (text.includes('research') || text.includes('论文') || text.includes('arxiv') || text.includes('研究')) {
    return 'research';
  }
  if (text.includes('openai') || text.includes('google') || text.includes('meta') || text.includes('anthropic') || text.includes('微软') || text.includes('发布')) {
    return 'company';
  }
  return 'application';
}

async function generateInsightWithAI(news) {
  const apiKey = process.env.SILICONFLOW_API_KEY;
  if (!apiKey) {
    console.error('[AI] 未设置 API Key');
    return null;
  }
  
  const prompt = `作为资深AI产品经理，分析以下新闻并提供洞察。

原文标题：${news.title}
原文摘要：${news.summary.substring(0, 500)}
来源：${news.sourceName}

请输出JSON格式：
{
  "chineseTitle": "中文标题（简洁明了，突出核心价值）",
  "englishTitle": "${news.title}",
  "techFeasibility": 1-5,
  "implementation": 1-5,
  "maturity": "实验阶段|可用|生产就绪",
  "keyInsight": "核心洞察，2-3句话，纯中文",
  "useCases": [{"scenario": "应用场景", "value": "价值"}],
  "competitors": [{"name": "竞品", "context": "动态"}],
  "recommendations": {
    "short": "1个月行动建议，具体可执行",
    "medium": "3个月规划，明确里程碑",
    "long": "半年以上战略，方向清晰"
  },
  "tools": ["相关工具1", "工具2"],
  "category": "llm|image|video|agent|devtool|research|company|application"
}

重要要求：
1. 所有文本字段必须用中文输出
2. chineseTitle 要简洁有力，突出对PM的价值
3. keyInsight 用中文详细阐述技术原理和产品机会
4. 如果是Agent/智能体相关内容，重点分析编排能力、工具调用、多智能体协作
5. 评估技术可行性和落地难度，给出具体可执行的建议
6. 确保JSON格式合法，不要包含换行符在字符串内`;

  try {
    console.log(`[AI] 生成洞察: ${news.title.substring(0, 40)}...`);
    const response = await axios.post(
      'https://api.siliconflow.cn/v1/chat/completions',
      {
        model: 'deepseek-ai/DeepSeek-V3',
        messages: [
          { role: 'system', content: '你是资深AI产品经理，擅长技术评估和商业化分析。输出必须是合法JSON格式。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1500
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 120000
      }
    );
    
    const content = response.data.choices[0].message.content;
    // 提取JSON部分
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const insight = JSON.parse(jsonMatch[0]);
      return {
        ...insight,
        techStars: '★'.repeat(insight.techFeasibility || 3) + '☆'.repeat(5 - (insight.techFeasibility || 3)),
        implStars: '★'.repeat(insight.implementation || 3) + '☆'.repeat(5 - (insight.implementation || 3))
      };
    }
    return null;
  } catch (error) {
    console.error('[AI] 生成失败:', error.message);
    return null;
  }
}

function generateQuickInsight(news) {
  // 快速浏览的简化洞察
  return {
    techFeasibility: 3,
    implementation: 3,
    techStars: '★★★☆☆',
    implStars: '★★★☆☆',
    maturity: '待评估',
    keyInsight: news.summary ? (news.summary.substring(0, 80) + '...') : '暂无详细洞察',
    recommendations: {
      short: '持续关注该领域动态',
      medium: '评估技术成熟度后试点',
      long: '根据市场反馈制定战略'
    },
    maturity: '待评估',
    keyInsight: news.summary.substring(0, 100) + '...',
    category: categorizeNews(news)
  };
}

async function main() {
  console.log('=== AI新闻爬取开始 ===');
  console.log('时间:', new Date().toISOString());
  
  // 1. 按优先级爬取所有源
  const allNews = [];
  const sourceCount = {}; // 记录每个来源的数量
  
  // 按优先级顺序处理：media > agent > official
  const priorityOrder = ['media', 'agent', 'official'];
  
  for (const category of priorityOrder) {
    const sources = SOURCES[category] || [];
    for (const source of sources) {
      const news = await fetchRSS(source);
      
      // 限制每个来源的数量
      const maxItems = source.maxItems || 10;
      const limitedNews = news.slice(0, maxItems);
      
      // 标记来源优先级
      limitedNews.forEach(item => {
        item.sourcePriority = source.priority || 1;
      });
      
      allNews.push(...limitedNews);
      console.log(`[RSS] ${source.name}: 获取 ${limitedNews.length} 条 (限制: ${maxItems})`);
      
      await new Promise(r => setTimeout(r, 1000)); // 防限流
    }
  }
  
  console.log(`[爬取] 共获取 ${allNews.length} 条新闻`);
  
  if (allNews.length === 0) {
    console.error('[错误] 没有获取到任何新闻');
    process.exit(1);
  }
  
  // 2. 过滤低质量和非AI内容
  const filteredNews = allNews.filter(isValidNews);
  console.log(`[过滤] 剩余 ${filteredNews.length} 条有效新闻`);
  
  if (filteredNews.length === 0) {
    console.error('[错误] 过滤后没有有效新闻');
    process.exit(1);
  }
  
  // 3. 去重（按标题相似度）
  const uniqueNews = [];
  const seenTitles = new Set();
  for (const news of filteredNews) {
    const key = news.title.toLowerCase().replace(/[^\w\u4e00-\u9fa5]/g, '').substring(0, 20);
    if (!seenTitles.has(key)) {
      seenTitles.add(key);
      uniqueNews.push(news);
    }
  }
  console.log(`[去重] 剩余 ${uniqueNews.length} 条`);
  
  // 4. 计算重要性和分类
  for (const news of uniqueNews) {
    news.importance = calculateImportance(news);
    news.category = categorizeNews(news);
  }
  
  // 6. 排序：来源优先级 > 重要性 > 时效性
  uniqueNews.sort((a, b) => {
    // 首先按来源优先级（中文媒体优先）
    if (b.sourcePriority !== a.sourcePriority) {
      return b.sourcePriority - a.sourcePriority;
    }
    // 然后按重要性
    if (b.importance !== a.importance) {
      return b.importance - a.importance;
    }
    // 最后按时效性
    return b.rawDate - a.rawDate;
  });
  
  // 7. 选择头条5条（确保多样性：最多1条来自同一来源，避免LangChain垄断）
  const headlines = [];
  const headlineSourceCount = {};
  
  for (const news of uniqueNews) {
    if (headlines.length >= 5) break;
    
    const sourceName = news.sourceName;
    headlineSourceCount[sourceName] = (headlineSourceCount[sourceName] || 0) + 1;
    
    // 限制同一来源最多1条进入头条（增加多样性）
    if (headlineSourceCount[sourceName] <= 1) {
      headlines.push(news);
    }
  }
  
  // 8. 选择快速浏览10条（同样确保多样性，同一来源最多2条）
  const remaining = uniqueNews.filter(n => !headlines.includes(n));
  const quickBrowse = [];
  const quickSourceCount = {};
  
  for (const news of remaining) {
    if (quickBrowse.length >= 10) break;
    
    const sourceName = news.sourceName;
    quickSourceCount[sourceName] = (quickSourceCount[sourceName] || 0) + 1;
    
    // 限制同一来源最多2条进入快速浏览
    if (quickSourceCount[sourceName] <= 2 && (news.importance >= 3 || news.category === 'agent')) {
      quickBrowse.push(news);
    }
  }
  
  console.log(`[选择] 头条: ${headlines.length}, 快速浏览: ${quickBrowse.length}`);
  
  // 7. 生成洞察
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
  
  // 头条生成完整洞察
  const headlineInsights = [];
  for (let i = 0; i < headlines.length; i++) {
    const news = headlines[i];
    const aiInsight = await generateInsightWithAI(news);
    
    // 使用中文标题（如果有）
    const displayTitle = aiInsight?.chineseTitle || news.title;
    const englishTitle = aiInsight?.englishTitle || news.title;
    
    headlineInsights.push({
      id: `${today}_${String(i + 1).padStart(3, '0')}`,
      title: displayTitle,
      englishTitle: englishTitle,
      category: aiInsight?.category || news.category,
      fact: {
        summary: news.summary.substring(0, 200),
        sourceName: news.sourceName,
        sourceType: news.sourceType,
        sourceUrl: news.url,
        originalDate: news.pubDate
      },
      insight: aiInsight || generateQuickInsight(news),
      tags: [news.category, news.sourceType],
      importance: news.importance,
      displayDate: today,
      isHeadline: true
    });
  }
  
  // 快速浏览简化洞察
  const quickInsights = quickBrowse.map((news, i) => ({
    id: `${today}_q${String(i + 1).padStart(3, '0')}`,
    title: news.title,
    category: news.category,
    fact: {
      summary: news.summary.substring(0, 150),
      sourceName: news.sourceName,
      sourceType: news.sourceType,
      sourceUrl: news.url,
      originalDate: news.pubDate
    },
    insight: generateQuickInsight(news),
    tags: [news.category],
    importance: news.importance,
    displayDate: today,
    isHeadline: false
  }));
  
  // 8. 保存数据
  const outputDir = path.join(__dirname, 'data');
 if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const output = {
    date: today,
    lastUpdate: new Date().toISOString(),
    headlines: headlineInsights,
    quickBrowse: quickInsights,
    total: headlineInsights.length + quickInsights.length
  };
  
  fs.writeFileSync(
    path.join(outputDir, 'insights.json'),
    JSON.stringify(output, null, 2)
  );
  
  // 同时保存一份按日期命名的历史记录
  fs.writeFileSync(
    path.join(outputDir, `insights_${today}.json`),
    JSON.stringify(output, null, 2)
  );
  
  console.log('=== 完成 ===');
  console.log(`头条: ${headlineInsights.length} 条`);
  console.log(`快速浏览: ${quickInsights.length} 条`);
  console.log(`数据已保存到: data/insights.json`);
}

main().catch(error => {
  console.error('[错误]', error);
  process.exit(1);
});
