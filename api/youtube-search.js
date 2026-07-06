// api/youtube-search.js
// Vercel Serverless Function — YouTube Data API v3 video search
// Called by agent tool: search_and_play_youtube
//
// GET /api/youtube-search?q=Apna College DSA lecture 23
// Returns: { videoId, title, channelTitle, thumbnailUrl }

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const YT_API_BASE = 'https://www.googleapis.com/youtube/v3/search';

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).set(CORS_HEADERS).end();
  }

  // Set CORS headers for all responses
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { q } = req.query;
  if (!q || typeof q !== 'string' || !q.trim()) {
    return res.status(400).json({ error: 'Search query (q) is required' });
  }

  const YOUTUBE_API_KEY = process.env.INNERTUBE_KEY || process.env.YOUTUBE_API_KEY;
  if (!YOUTUBE_API_KEY) {
    return res.status(500).json({ error: 'YouTube API key not configured on server' });
  }

  try {
    const searchQuery = q.trim();
    console.log(`[YT Search] Query: "${searchQuery}"`);

    const params = new URLSearchParams({
      part: 'snippet',
      q: searchQuery,
      type: 'video',
      maxResults: '5',
      relevanceLanguage: 'en',
      key: YOUTUBE_API_KEY,
    });

    const ytRes = await fetch(`${YT_API_BASE}?${params.toString()}`);
    
    if (!ytRes.ok) {
      const errorText = await ytRes.text();
      console.error(`[YT Search] API error ${ytRes.status}:`, errorText);
      throw new Error(`YouTube API error: ${ytRes.status}`);
    }

    const data = await ytRes.json();
    const items = data.items || [];

    if (items.length === 0) {
      return res.status(404).json({ error: `No videos found for: "${searchQuery}"` });
    }

    // Return top result + alternatives
    const results = items.map(item => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      thumbnailUrl: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || '',
      publishedAt: item.snippet.publishedAt,
    }));

    console.log(`[YT Search] Found ${results.length} results. Top: "${results[0].title}"`);

    return res.status(200).json({
      query: searchQuery,
      topResult: results[0],
      alternatives: results.slice(1),
    });

  } catch (err) {
    console.error('[YT Search] Error:', err.message);
    return res.status(500).json({ error: err.message || 'YouTube search failed' });
  }
}
