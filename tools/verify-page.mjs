import puppeteer from 'puppeteer';
import http from 'http';
import fs from 'fs';
import path from 'path';

const BASE = 'C:/Proyectos/wichanzao-final';
const PORT = 9876;

// Start HTTP server
const server = http.createServer((req, res) => {
  let filePath = path.join(BASE, req.url === '/' ? 'index.html' : req.url.replace(/^\//, ''));
  try {
    const content = fs.readFileSync(filePath);
    const mime = {'.html':'text/html','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.css':'text/css','.webmanifest':'application/manifest+json'};
    res.writeHead(200, {'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream'});
    res.end(content);
  } catch(e) { res.writeHead(404); res.end('Not found'); }
});

server.listen(PORT, '127.0.0.1');

console.log('Server started on http://127.0.0.1:' + PORT);

try {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // Capture console messages
  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push({ type: msg.type(), text: msg.text() });
  });

  // Capture page errors
  page.on('pageerror', err => {
    consoleLogs.push({ type: 'pageerror', text: err.message });
  });

  // Navigate to page
  console.log('Navigating to page...');
  await page.goto('http://127.0.0.1:' + PORT + '/index.html', {
    waitUntil: 'networkidle2',
    timeout: 30000
  });

  // Wait a bit for any async JS to run
  await new Promise(r => setTimeout(r, 3000));

  // Take screenshot
  await page.screenshot({ path: 'C:/Proyectos/wichanzao-final/icons/verify-page.png', fullPage: true });
  console.log('Screenshot saved to icons/verify-page.png');

  // Report console logs
  console.log('\n=== Console logs ===');
  if (consoleLogs.length === 0) {
    console.log('(none)');
  } else {
    consoleLogs.forEach(l => console.log(`[${l.type}] ${l.text}`));
  }

  // Check if page has content
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log('\n=== Page body (first 500 chars) ===');
  console.log(bodyText);

  // Check for specific elements
  const hasWelcome = await page.evaluate(() => !!document.getElementById('vWelcome'));
  const hasLogin = await page.evaluate(() => !!document.getElementById('vLogin'));
  const hasMain = await page.evaluate(() => !!document.getElementById('vMain'));
  const hasSidebar = await page.evaluate(() => !!document.getElementById('sidebar'));

  console.log('\n=== Key elements ===');
  console.log('vWelcome:', hasWelcome);
  console.log('vLogin:', hasLogin);
  console.log('vMain:', hasMain);
  console.log('sidebar:', hasSidebar);

  // Check if any view is visible
  const visibleView = await page.evaluate(() => {
    const views = document.querySelectorAll('.V');
    for (const v of views) {
      if (v.classList.contains('on')) return v.id;
    }
    return 'none';
  });
  console.log('Visible view:', visibleView);

  // Check JS errors specifically
  const jsErrors = consoleLogs.filter(l => l.type === 'error' || l.type === 'pageerror');
  console.log('\n=== JS errors found: ' + jsErrors.length + ' ===');
  if (jsErrors.length > 0) {
    console.log('CRITICAL: Page has JavaScript errors!');
    jsErrors.forEach(e => console.log('  ' + e.text));
  }

  await browser.close();
} catch (err) {
  console.error('ERROR:', err.message);
} finally {
  server.close();
  process.exit(0);
}
