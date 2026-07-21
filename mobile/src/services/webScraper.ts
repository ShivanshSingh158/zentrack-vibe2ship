/**
 * webScraper.ts — ZenTrack Mobile
 * 
 * 100% Frontend-centric web search tool.
 * Since React Native's fetch() does not enforce CORS, we can scrape 
 * search engines directly from the mobile client without needing a backend!
 */

export async function executeWebSearch(query: string): Promise<string> {
  console.log(`[WebScraper] Searching for: ${query}`);
  try {
    // DuckDuckGo Lite HTML endpoint is fast and doesn't require JS execution
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
      }
    });
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    const html = await res.text();
    
    // Quick regex to extract snippet texts from DDG HTML
    // Extracts URL, Title, and Snippet
    const snippetRegex = /<a class="result__url" href="([^"]+)".*?>(.*?)<\/a>.*?<a class="result__snippet[^>]+>(.*?)<\/a>/gs;
    
    let match;
    const results = [];
    
    while ((match = snippetRegex.exec(html)) !== null) {
      if (results.length >= 3) break; // Take top 3 results to save Gemini context window
      
      const link = match[1];
      // Basic HTML tag stripping
      const title = match[2].replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').trim(); 
      const snippet = match[3].replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').trim(); 
      
      results.push(`Source: ${title}\nURL: ${link}\nSnippet: ${snippet}\n`);
    }
    
    if (results.length === 0) return "No search results found.";
    
    return results.join('\n');
    
  } catch (e: any) {
    console.error('[WebScraper] Search failed:', e);
    return `Search failed: ${e.message}`;
  }
}
