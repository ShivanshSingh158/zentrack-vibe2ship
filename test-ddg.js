const url = 'https://html.duckduckgo.com/html/?q=latest+openai+gpt+model';
fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' } })
  .then(res => res.text())
  .then(html => {
    const results = [];
    const urlRegex = /<a class="result__snippet[^>]+href="([^"]+)"[^>]*>/g;
    const titleRegex = /<h2 class="result__title">[\s\S]*?<a[^>]*>(.*?)<\/a>[\s\S]*?<\/h2>/g;
    const snippetRegex = /<a class="result__snippet[^>]*>(.*?)<\/a>/g;

    let matchTitle, matchSnippet, matchUrl;
    while ((matchTitle = titleRegex.exec(html)) !== null && 
           (matchSnippet = snippetRegex.exec(html)) !== null &&
           (matchUrl = urlRegex.exec(html)) !== null) {
      results.push({
        title: matchTitle[1].replace(/<[^>]+>/g, '').trim(),
        snippet: matchSnippet[1].replace(/<[^>]+>/g, '').trim(),
        url: matchUrl[1].replace(/<[^>]+>/g, '').trim()
      });
    }
    console.log(results);
  });
