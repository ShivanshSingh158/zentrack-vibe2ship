import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('pageerror', err => {
    console.log('PAGE ERROR:', err.toString());
  });
  
  page.on('console', msg => {
    if(msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text());
  });
  
  await page.goto('http://localhost:4173/home');
  await new Promise(r => setTimeout(r, 3000));
  
  await browser.close();
})();
