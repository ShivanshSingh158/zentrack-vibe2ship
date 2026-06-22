import { YoutubeTranscript } from 'youtube-transcript';

export default async function handler(req, res) {
  const { videoId } = req.query;
  if (!videoId) return res.status(400).json({ error: 'Missing videoId' });

  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);
    // Format transcript into a readable string
    const text = transcript
      .map(item => {
        const startSec = Math.floor(item.offset / 1000);
        const mm = Math.floor(startSec / 60);
        const ss = String(startSec % 60).padStart(2, '0');
        return `[${mm}:${ss}] ${item.text.replace(/\n/g, ' ')}`;
      })
      .join('\n');
      
    res.status(200).json({ transcript: text });
  } catch (e) {
    console.error('Transcript API Error:', e);
    res.status(500).json({ error: e.message || 'Transcript not found or unavailable' });
  }
}
