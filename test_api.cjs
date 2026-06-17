const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
async function go() {
  const r = await fetch('https://www.youtube.com/playlist?list=PLgUwDviBIf0oF6QL8m22w1hIDC1vJ_BHz&hl=en', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const html = await r.text();
  const match = html.match(/"numVideosText":\{"runs":\[\{"text":"([0-9,]+)"/);
  if (match) console.log('Playlist total videos (from HTML):', match[1]);
  else console.log('Could not find numVideosText');
}
go();
