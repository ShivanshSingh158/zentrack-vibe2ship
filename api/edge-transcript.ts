export const config = { runtime: 'edge' };

export default async function handler(req) {
  try {
    const url = new URL(req.url);
    const videoId = url.searchParams.get('videoId');
    if (!videoId) return new Response('Missing videoId', { status: 400 });

    const key = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
    
    // 1. Fetch InnerTube API
    const innertubeRes = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${key}&prettyPrint=false`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)'
      },
      body: JSON.stringify({
        context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38' } },
        videoId: videoId,
      }),
    });

    const data = await innertubeRes.json();
    const captionTracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!captionTracks || captionTracks.length === 0) {
      return new Response(JSON.stringify({ error: 'No captions found via Edge' }), { status: 404 });
    }

    // Grab first english track or default
    let selectedTrack = captionTracks.find(t => t.languageCode === 'en' || t.languageCode === 'en-US' || t.languageCode?.startsWith('en')) || captionTracks[0];

    // 2. Fetch the actual XML
    const xmlRes = await fetch(selectedTrack.baseUrl, {
      headers: { 'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)' }
    });
    const xmlText = await xmlRes.text();

    // 3. Parse XML
    let formattedLines = [];
    const pRegex = /<p\s+t="(\d+)"[^>]*>([\s\S]*?)<\/p>/gi;
    let pMatches = [...xmlText.matchAll(pRegex)];
    
    if (pMatches.length > 0) {
      formattedLines = pMatches.map(m => {
        const startSec = Math.floor(parseInt(m[1]) / 1000);
        const mm = Math.floor(startSec / 60);
        const ss = String(startSec % 60).padStart(2, '0');
        const cleanText = m[2].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n/g, ' ').trim();
        return `[${mm}:${ss}] ${cleanText}`;
      });
    } else {
      const textMatches = [...xmlText.matchAll(/<text\s+start="([\d.]+)"[^>]*>(.*?)<\/text>/gi)];
      formattedLines = textMatches.map(m => {
        const startSec = Math.floor(parseFloat(m[1]));
        const mm = Math.floor(startSec / 60);
        const ss = String(startSec % 60).padStart(2, '0');
        const cleanText = m[2].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n/g, ' ').trim();
        return `[${mm}:${ss}] ${cleanText}`;
      });
    }

    const transcript = formattedLines.filter(line => line.length > 8).join('\n');
    
    // Add CORS headers so frontend can call it directly or through proxy
    const headers = new Headers({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    });

    return new Response(JSON.stringify({ transcript }), { status: 200, headers });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
