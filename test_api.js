const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const CLIENT = { clientName: 'WEB', clientVersion: '2.20240417.00.00' };

async function go() {
  const r0 = await fetch('https://www.youtube.com/youtubei/v1/browse?key=' + KEY, {
    method:'POST',headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ context:{client:CLIENT}, browseId:'VLPLgUwDviBIf0oF6QL8m22w1hIDC1vJ_BHz' })
  });
  const d0 = await r0.json();
  
  let p1Token = null;
  function findToken(obj) {
      if (!obj || typeof obj !== 'object') return;
      if (obj.continuationCommand?.token && !obj.continuationCommand.token.includes('jb21tZW50')) {
          if (!p1Token) p1Token = obj.continuationCommand.token;
      }
      if (Array.isArray(obj)) obj.forEach(findToken);
      else Object.values(obj).forEach(findToken);
  }
  findToken(d0);
  console.log('P1 token:', p1Token?.slice(0,40));
  
  const r1 = await fetch('https://www.youtube.com/youtubei/v1/browse?key=' + KEY, {
    method:'POST',headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ context:{client:CLIENT}, continuation: p1Token })
  });
  const d1Str = JSON.stringify(await r1.json());
  
  const regex = /"token":"([^"]+)"/g;
  let match;
  let tokens = [];
  while ((match = regex.exec(d1Str)) !== null) {
      tokens.push(match[1]);
  }
  console.log('Tokens on Page 2:', tokens.map(t => t.slice(0, 40)));
}
go().catch(console.error);
