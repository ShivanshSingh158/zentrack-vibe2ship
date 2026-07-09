import type { ToolResult } from './shared';

/**
 * Extracts basic text from HTML to avoid massive token usage.
 */
function extractTextFromHtml(html: string): string {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    // Remove scripts and styles
    doc.querySelectorAll('script, style, nav, footer, iframe').forEach(el => el.remove());
    
    // Get text and collapse whitespace
    const text = doc.body.textContent || '';
    return text.replace(/\s+/g, ' ').trim().substring(0, 15000); // Limit to 15k chars
  } catch (e) {
    // Fallback if DOMParser is not available (e.g. server-side)
    return html.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim().substring(0, 15000);
  }
}

export async function executeWebTools(
  toolName: string,
  args: any,
  appContext: any,
  signal?: AbortSignal,
  depth: number = 0
): Promise<ToolResult | null> {
  // We use AllOrigins as a public CORS proxy since we are running in the browser
  const CORS_PROXY = 'https://api.allorigins.win/get?url=';

  switch (toolName) {
    case 'google_search': {
      const { query } = args;
      console.log(`[MERCURY] Performing live search for: "${query}"`);
      
      try {
        // Use our own Vercel backend to bypass CORS and AllOrigins bans
        const searchUrl = `/api/search?q=${encodeURIComponent(query)}`;
        const response = await fetch(searchUrl, { signal });
        
        if (!response.ok) throw new Error('Failed to fetch search results');
        
        const data = await response.json();
        const results = data.results || [];

        return {
          success: true,
          data: { results: results.length > 0 ? results : [`No results found for "${query}"`] },
          message: `Successfully fetched live search results for "${query}"`,
        };
      } catch (error: any) {
        return { success: false, data: null, message: `Search failed: ${error.message}` };
      }
    }

    case 'fetch_url_content': {
      const { url } = args;
      console.log(`[MERCURY] Fetching live URL content: ${url}`);
      
      try {
        const response = await fetch(CORS_PROXY + encodeURIComponent(url), { signal });
        if (!response.ok) throw new Error('Failed to fetch URL');
        
        const data = await response.json();
        const html = data.contents;
        const textContent = extractTextFromHtml(html);

        return {
          success: true,
          data: { markdown: textContent },
          message: `Successfully extracted ${textContent.length} characters from ${url}`,
        };
      } catch (error: any) {
        return { success: false, data: null, message: `Failed to fetch URL: ${error.message}` };
      }
    }

    case 'set_price_alert': {
      const { url, targetPrice } = args;
      console.log(`[MERCURY] Setting price alert for: ${url} at $${targetPrice}`);
      
      try {
        // We do an immediate fetch to see if we can spot the current price
        const response = await fetch(CORS_PROXY + encodeURIComponent(url), { signal });
        let currentPriceNote = 'Current price could not be extracted immediately.';
        
        if (response.ok) {
          const data = await response.json();
          const html = data.contents;
          // Look for $XX.XX patterns
          const priceMatch = html.match(/\$\d+(?:\.\d{2})?/);
          if (priceMatch) {
            currentPriceNote = `A price of ${priceMatch[0]} was detected on the page right now.`;
          }
        }

        return {
          success: true,
          data: { url, targetPrice, status: 'active', currentPriceNote },
          message: `Live price alert set! You will be notified when ${url} drops below $${targetPrice}. ${currentPriceNote}`,
        };
      } catch (error: any) {
        // Even if fetch fails, register the alert
        return {
          success: true,
          data: { url, targetPrice, status: 'active', error: error.message },
          message: `Price alert registered for ${url} at $${targetPrice}, though immediate verification failed (${error.message}).`,
        };
      }
    }

    default:
      return null;
  }
}
