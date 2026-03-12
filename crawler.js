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
  // 官方源 - 最高优先级
  official: [
    { name: 'OpenAI Blog', url: 'https://openai.com/blog/rss.xml', type: 'official' },
    { name: 'Google AI Blog', url: 'https://ai.googleblog.com/feeds/posts/default', type: 'official' },
    { name: 'Meta AI Blog', url: 'https://ai.meta.com/blog/rss/', type: 'official' },
    { name: 'Anthropic Blog', url: 'https://www.anthropic.com/rss.xml', type: 'official' },
  ],
  // 权威中文媒体
  media: [
    { name: '机器之心', url: 'https://www.jiqizhixin.com/rss', type: 'media' },
    { name: '量子位', url: 'https://www.qbitai.com/rss', type: 'media' },
    { name: 'AI Base', url: 'https://www.aibase.com/rss', type: 'media' },
  ],
  // Agent专项
  agent: [
    { name: 'LangChain Blog', url: 'https://blog.langchain.dev/rss/', type: 'agent' },
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

function calculateImportance(news) {
  let score = 3; // 基础分
  const titleLower = news.title.toLowerCase();
  const summaryLower = news.summary.toLowerCase();
  const text = titleLower + ' ' + summaryLower;
  
  // 来源加分
  if (news.sourceType === 'official') score += 1.5;
  if (news.sourceType === 'agent') score += 0.5;
  
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
  
  // 1. 爬取所有源
  const allNews = [];
  for (const [category, sources] of Object.entries(SOURCES)) {
    for (const source of sources) {
      const news = await fetchRSS(source);
      allNews.push(...news);
      await new Promise(r => setTimeout(r, 1000)); // 防限流
    }
  }
  
  console.log(`[爬取] 共获取 ${allNews.length} 条新闻`);
  
  if (allNews.length === 0) {
    console.error('[错误] 没有获取到任何新闻');
    process.exit(1);
  }
  
  // 2. 去重（按标题相似度）
  const uniqueNews = [];
  const seenTitles = new Set();
  for (const news of allNews) {
    const key = news.title.toLowerCase().replace(/[^\w\u4e00-\u9fa5]/g, '').substring(0, 20);
    if (!seenTitles.has(key)) {
      seenTitles.add(key);
      uniqueNews.push(news);
    }
  }
  console.log(`[去重] 剩余 ${uniqueNews.length} 条`);
  
  // 3. 计算重要性
  for (const news of uniqueNews) {
    news.importance = calculateImportance(news);
    news.category = categorizeNews(news);
  }
  
  // 4. 排序：重要性 > 时效性
  uniqueNews.sort((a, b) => {
    if (b.importance !== a.importance) {
      return b.importance - a.importance;
    }
    return b.rawDate - a.rawDate;
  });
  
  // 5. 选择头条5条（重要性>=4）
  const headlineCandidates = uniqueNews.filter(n => n.importance >= 4);
  const headlines = headlineCandidates.slice(0, 5);
  
  // 6. 选择快速浏览10条（剩余中重要性>=3，或Agent领域）
  const remaining = uniqueNews.filter(n => !headlines.includes(n));
  const quickBrowse = remaining
    .filter(n => n.importance >= 3 || n.category === 'agent')
    .slice(0, 10);
  
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
