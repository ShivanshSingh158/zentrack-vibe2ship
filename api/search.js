// api/search.js
// Vercel Serverless Function — Unified Web Search (DuckDuckGo + YouTube + Google News RSS + Bing)
// v2.0 — Hardened: Google News RSS added, India city routing, no more empty results.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const YT_API_BASE = 'https://www.googleapis.com/youtube/v3/search';

// ── India city/region → local news feed mapping ──────────────────────────────
const INDIA_CITY_FEEDS = {
  chandigarh:   'https://news.google.com/rss/search?q=chandigarh&hl=en-IN&gl=IN&ceid=IN:en',
  delhi:        'https://news.google.com/rss/search?q=new+delhi&hl=en-IN&gl=IN&ceid=IN:en',
  'new delhi':  'https://news.google.com/rss/search?q=new+delhi&hl=en-IN&gl=IN&ceid=IN:en',
  mumbai:       'https://news.google.com/rss/search?q=mumbai&hl=en-IN&gl=IN&ceid=IN:en',
  bangalore:    'https://news.google.com/rss/search?q=bangalore&hl=en-IN&gl=IN&ceid=IN:en',
  bengaluru:    'https://news.google.com/rss/search?q=bengaluru&hl=en-IN&gl=IN&ceid=IN:en',
  hyderabad:    'https://news.google.com/rss/search?q=hyderabad&hl=en-IN&gl=IN&ceid=IN:en',
  chennai:      'https://news.google.com/rss/search?q=chennai&hl=en-IN&gl=IN&ceid=IN:en',
  pune:         'https://news.google.com/rss/search?q=pune&hl=en-IN&gl=IN&ceid=IN:en',
  kolkata:      'https://news.google.com/rss/search?q=kolkata&hl=en-IN&gl=IN&ceid=IN:en',
  ahmedabad:    'https://news.google.com/rss/search?q=ahmedabad&hl=en-IN&gl=IN&ceid=IN:en',
  jaipur:       'https://news.google.com/rss/search?q=jaipur&hl=en-IN&gl=IN&ceid=IN:en',
  lucknow:      'https://news.google.com/rss/search?q=lucknow&hl=en-IN&gl=IN&ceid=IN:en',
  india:        'https://news.google.com/rss/search?q=india&hl=en-IN&gl=IN&ceid=IN:en',
};

// ── Generic topic → curated RSS feed mapping ─────────────────────────────────
const TOPIC_RSS_FEEDS = {
  tech:       'https://feeds.feedburner.com/TechCrunch',
  technology: 'https://feeds.feedburner.com/TechCrunch',
  ai:         'https://news.google.com/rss/search?q=artificial+intelligence&hl=en&gl=US&ceid=US:en',
  startup:    'https://news.google.com/rss/search?q=startup&hl=en-IN&gl=IN&ceid=IN:en',
  crypto:     'https://news.google.com/rss/search?q=cryptocurrency&hl=en&gl=US&ceid=US:en',
  sports:     'https://feeds.bbci.co.uk/sport/rss.xml',
  cricket:    'https://news.google.com/rss/search?q=cricket+india&hl=en-IN&gl=IN&ceid=IN:en',
  market:     'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms',
  stock:      'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms',
  finance:    'https://www.moneycontrol.com/rss/business.xml',
  business:   'https://feeds.bbci.co.uk/news/business/rss.xml',
  politics:   'https://feeds.bbci.co.uk/news/politics/rss.xml',
  world:      'https://feeds.bbci.co.uk/news/world/rss.xml',
  science:    'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml',
  health:     'https://feeds.bbci.co.uk/news/health/rss.xml',
};

/** Parse an RSS/Atom XML string and return up to `limit` items. */
function parseRss(xml, limit = 8) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(xml)) !== null && items.length < limit) {
    const chunk = m[1];
    const title = (
      chunk.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
      chunk.match(/<title>(.*?)<\/title>/)
    )?.[1]?.trim();
    const link = (
      chunk.match(/<link>(.*?)<\/link>/) ||
      chunk.match(/<guid[^>]*>(https?:[^<]+)<\/guid>/)
    )?.[1]?.trim();
    const desc = (
      chunk.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) ||
      chunk.match(/<description>(.*?)<\/description>/)
    )?.[1]?.replace(/<[^>]+>/g, '').trim();
    if (title && link) {
      items.push({ title, url: link, snippet: (desc || '').substring(0, 300) });
    }
  }
  return items;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).set(CORS_HEADERS).end();
  }

  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { q, type } = req.query;
  if (!q || typeof q !== 'string' || !q.trim()) {
    return res.status(400).json({ error: 'Search query (q) is required' });
  }

  const searchQuery = q.trim();
  const lowerQuery  = searchQuery.toLowerCase();

  // ── YOUTUBE SEARCH ──────────────────────────────────────────────────────────
  if (type === 'youtube') {
    const YOUTUBE_API_KEY = process.env.INNERTUBE_KEY || process.env.YOUTUBE_API_KEY;
    if (!YOUTUBE_API_KEY) {
      return res.status(500).json({ error: 'YouTube API key not configured on server' });
    }
    try {
      const params = new URLSearchParams({
        part: 'snippet',
        q: searchQuery,
        type: 'video',
        maxResults: '5',
        relevanceLanguage: 'en',
        key: YOUTUBE_API_KEY,
      });
      const ytRes = await fetch(`${YT_API_BASE}?${params.toString()}`);
      if (!ytRes.ok) throw new Error(`YouTube API error: ${ytRes.status}`);
      const data  = await ytRes.json();
      const items = data.items || [];
      if (items.length === 0) {
        return res.status(404).json({ error: `No videos found for: "${searchQuery}"` });
      }
      const results = items.map(item => ({
        videoId:      item.id.videoId,
        title:        item.snippet.title,
        channelTitle: item.snippet.channelTitle,
        thumbnailUrl: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || '',
        publishedAt:  item.snippet.publishedAt,
      }));
      return res.status(200).json({ query: searchQuery, topResult: results[0], alternatives: results.slice(1) });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'YouTube search failed' });
    }
  }

  // ── Classify query intent ───────────────────────────────────────────────────
  const isNewsQuery  = /\b(news|latest|today|breaking|update|market|stock|financial|headline|current|recent|happening|going on|2024|2025|2026)\b/i.test(searchQuery);
  const isCityQuery  = Object.keys(INDIA_CITY_FEEDS).some(city => lowerQuery.includes(city));
  const detectedCity = Object.keys(INDIA_CITY_FEEDS).find(city => lowerQuery.includes(city));
  const topicKey     = Object.keys(TOPIC_RSS_FEEDS).find(t => lowerQuery.includes(t));

  // ── SOURCE 1: City-specific Google News RSS (highest priority for city queries) ──
  if (isCityQuery && detectedCity) {
    try {
      const feedUrl = INDIA_CITY_FEEDS[detectedCity];
      const rssRes  = await fetch(feedUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ZenTrack/2.0)', Accept: 'application/rss+xml,text/xml' },
        signal: AbortSignal.timeout(6000),
      });
      if (rssRes.ok) {
        const xml   = await rssRes.text();
        const items = parseRss(xml, 10);
        if (items.length > 0) {
          console.log(`[search] City RSS hit for "${detectedCity}" — ${items.length} items`);
          return res.status(200).json({ results: items, source: 'city_rss' });
        }
      }
    } catch (cityErr) {
      console.warn('[search] City RSS failed:', cityErr.message);
    }
  }

  // ── SOURCE 2: DuckDuckGo Instant Answer API (JSON, no scraping, never blocked) ──
  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(searchQuery)}&format=json&no_html=1&skip_disambig=1&no_redirect=1`;
    const ddgRes = await fetch(ddgUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ZenTrack/2.0)' },
      signal: AbortSignal.timeout(5000),
    });
    if (ddgRes.ok) {
      const data    = await ddgRes.json();
      const results = [];

      // Abstract answer (e.g. "What is X")
      if (data.AbstractText && data.AbstractText.length > 30) {
        results.push({
          title:   data.Heading || searchQuery,
          url:     data.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(searchQuery)}`,
          snippet: data.AbstractText.substring(0, 400),
        });
      }

      // Related topics (actual links)
      if (data.RelatedTopics && data.RelatedTopics.length > 0) {
        for (const topic of data.RelatedTopics) {
          if (topic.FirstURL && topic.Text) {
            results.push({
              title:   topic.Text.split(' - ')[0]?.substring(0, 120) || topic.FirstURL,
              url:     topic.FirstURL,
              snippet: topic.Text.substring(0, 300),
            });
          } else if (topic.Topics) {
            for (const sub of topic.Topics) {
              if (sub.FirstURL && sub.Text) {
                results.push({
                  title:   sub.Text.split(' - ')[0]?.substring(0, 120) || sub.FirstURL,
                  url:     sub.FirstURL,
                  snippet: sub.Text.substring(0, 300),
                });
              }
            }
          }
          if (results.length >= 8) break;
        }
      }

      if (results.length > 0) {
        console.log(`[search] DDG hit — ${results.length} results`);
        return res.status(200).json({ results: results.slice(0, 8), source: 'ddg' });
      }
    }
  } catch (ddgErr) {
    console.warn('[search] DDG JSON API failed:', ddgErr.message);
  }

  // ── SOURCE 3: Google News RSS (universal — works for ANY topic or news query) ──
  // This is the most reliable fallback. Google News RSS is public, never rate-limited from server IPs.
  try {
    // Build an optimized query for Google News: strip filler words, keep key terms
    const gnQuery = encodeURIComponent(searchQuery.replace(/\b(what|is|are|the|a|an|of|in|on|for|and|or|latest|news|about|how|why|when|where|happening|going|today)\b/gi, ' ').replace(/\s+/g, ' ').trim() || searchQuery);
    const gnUrl   = `https://news.google.com/rss/search?q=${gnQuery}&hl=en-IN&gl=IN&ceid=IN:en`;
    const gnRes   = await fetch(gnUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ZenTrack/2.0)', Accept: 'application/rss+xml,text/xml,*/*' },
      signal: AbortSignal.timeout(7000),
    });
    if (gnRes.ok) {
      const xml   = await gnRes.text();
      const items = parseRss(xml, 10);
      if (items.length > 0) {
        console.log(`[search] Google News RSS hit — ${items.length} items`);
        return res.status(200).json({ results: items, source: 'google_news_rss' });
      }
    }
  } catch (gnErr) {
    console.warn('[search] Google News RSS failed:', gnErr.message);
  }

  // ── SOURCE 4: Topic-specific curated RSS feeds ──────────────────────────────
  if (topicKey) {
    try {
      const feedUrl = TOPIC_RSS_FEEDS[topicKey];
      const rssRes  = await fetch(feedUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ZenTrack/2.0)', Accept: 'application/rss+xml,text/xml' },
        signal: AbortSignal.timeout(5000),
      });
      if (rssRes.ok) {
        const xml   = await rssRes.text();
        const items = parseRss(xml, 8);
        if (items.length > 0) {
          console.log(`[search] Topic RSS hit for "${topicKey}" — ${items.length} items`);
          return res.status(200).json({ results: items, source: 'topic_rss' });
        }
      }
    } catch (rssErr) {
      console.warn('[search] Topic RSS feed failed:', rssErr.message);
    }
  }

  // ── SOURCE 5: Legacy India Finance RSS (for news/market queries) ─────────────
  if (isNewsQuery) {
    try {
      const RSS_FEEDS = [
        'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms',
        'https://www.moneycontrol.com/rss/business.xml',
        'https://feeds.bbci.co.uk/news/world/rss.xml',
        'https://feeds.bbci.co.uk/news/rss.xml',
      ];
      let feedUrl = RSS_FEEDS[3]; // BBC top-level news default
      if (/\b(india|indian|nse|bse|sensex|nifty|rupee|inr)\b/i.test(searchQuery)) feedUrl = RSS_FEEDS[0];
      else if (/\b(market|stock|share|fund|invest|finance|economy)\b/i.test(searchQuery)) feedUrl = RSS_FEEDS[1];
      else if (/\b(world|global|international)\b/i.test(searchQuery)) feedUrl = RSS_FEEDS[2];

      const rssRes = await fetch(feedUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ZenTrack/2.0)', Accept: 'application/rss+xml, text/xml' },
        signal: AbortSignal.timeout(5000),
      });
      if (rssRes.ok) {
        const xml   = await rssRes.text();
        const items = parseRss(xml, 8);
        if (items.length > 0) {
          console.log(`[search] Legacy news RSS hit — ${items.length} items`);
          return res.status(200).json({ results: items, source: 'legacy_rss' });
        }
      }
    } catch (rssErr) {
      console.warn('[search] Legacy RSS feed failed:', rssErr.message);
    }
  }

  // ── SOURCE 6: Bing Web Search Scraper (final fallback) ─────────────────────
  try {
    const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(searchQuery)}&count=10&setlang=en`;
    const bingRes = await fetch(bingUrl, {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept':          'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (bingRes.ok) {
      const html    = await bingRes.text();
      const results = [];
      const blockRegex = /<li class="b_algo">([\s\S]*?)<\/li>/g;
      let bm;
      while ((bm = blockRegex.exec(html)) !== null && results.length < 8) {
        const block       = bm[1];
        const linkMatch   = block.match(/<a[^>]+href="(https?:[^"]+)"[^>]*>([\s\S]*?)<\/a>/);
        const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/);
        if (linkMatch && !linkMatch[1].includes('bing.com')) {
          const title   = linkMatch[2].replace(/<[^>]+>/g, '').trim();
          const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : '';
          if (title) results.push({ title, url: linkMatch[1], snippet: snippet.substring(0, 300) });
        }
      }
      if (results.length > 0) {
        console.log(`[search] Bing fallback hit — ${results.length} results`);
        return res.status(200).json({ results, source: 'bing' });
      }
    }
  } catch (bingErr) {
    console.warn('[search] Bing fallback failed:', bingErr.message);
  }

  // ── All sources exhausted ───────────────────────────────────────────────────
  console.error(`[search] ALL sources failed for query: "${searchQuery}"`);
  return res.status(200).json({
    results: [],
    error:   `All search providers exhausted for "${searchQuery}". Try rephrasing the query.`
  });
}
