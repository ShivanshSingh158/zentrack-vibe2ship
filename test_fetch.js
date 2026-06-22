const key = process.env.VITE_GEMINI_API_KEY?.split(',')[0] || '';
async function run() {
  for (const model of ['gemini-3.1-flash-lite']) {
    console.log(`Testing ${model}...`);
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Hello' }] }] })
      });
      const data = await res.json();
      if (res.ok) {
        console.log(`Success ${model}`);
      } else {
        console.error(`Error ${model}:`, data.error?.message || data.error);
      }
    } catch (e) {
      console.error(`Fetch Error ${model}:`, e.message);
    }
  }
}
run();
