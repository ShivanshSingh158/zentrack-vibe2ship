const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const CLIENT = { clientName: 'WEB', clientVersion: '2.20231219.01.00' };

async function go() {
  const r0 = await fetch('https://www.youtube.com/youtubei/v1/next?key=' + KEY, {
    method:'POST',headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ context:{client:CLIENT}, playlistId:'PLgUwDviBIf0oF6QL8m22w1hIDC1vJ_BHz', playlistIndex: 0 })
  });
  const d0 = await r0.json();
  
  // Let's find title recursively
  function walk(obj) {
      if (!obj || typeof obj !== 'object') return;
      if (obj.playlist && obj.playlist.title) {
          console.log('FOUND PLAYLIST:', obj.playlist.title);
      }
      if (Array.isArray(obj)) obj.forEach(walk); else Object.values(obj).forEach(walk);
  }
  walk(d0);
}
go().catch(console.error);
