
const videoId = 'xpy5NXiBFvA';
const androidUA = 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)';
fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'User-Agent': androidUA },
  body: JSON.stringify({ context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38' } }, videoId })
}).then(r => r.json()).then(data => {
  const captionTracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  const selectedTrack = captionTracks[0];
  console.log('fetching baseUrl:', selectedTrack.baseUrl.substring(0, 100));
  return fetch(selectedTrack.baseUrl, {
    headers: {
      'Accept-Language': selectedTrack.languageCode,
      'User-Agent': androidUA
    }
  }).then(r => r.text());
}).then(xmlText => {
  console.log('xmlText:', xmlText.substring(0, 300));
}).catch(console.error);

