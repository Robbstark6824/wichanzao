import puppeteer from 'puppeteer';
import http from 'http';
import fs from 'fs';
import path from 'path';

const BASE = 'C:/Proyectos/wichanzao-final';
const PORT = 9878;

const server = http.createServer((req, res) => {
  let filePath = path.join(BASE, req.url === '/' ? 'index.html' : req.url.replace(/^\//, ''));
  try {
    const content = fs.readFileSync(filePath);
    const mime = {'.html':'text/html','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
    res.writeHead(200, {'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream'});
    res.end(content);
  } catch(e) { res.writeHead(404); res.end('Not found'); }
});

server.listen(PORT, '127.0.0.1');

try {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  const consoleLogs = [];
  page.on('console', msg => consoleLogs.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => consoleLogs.push({ type: 'pageerror', text: err.message }));

  await page.goto('http://127.0.0.1:' + PORT + '/index.html', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  // Try to navigate to login view by clicking
  console.log('=== Clicking "Iniciar sesion" ===');
  const loginClicked = await page.evaluate(() => {
    // Find the login button in vWelcome
    const buttons = document.querySelectorAll('#vWelcome button');
    let clicked = false;
    buttons.forEach(b => {
      if (b.textContent.includes('Iniciar sesion') || b.textContent.includes('Iniciar sesión')) {
        b.click();
        clicked = true;
      }
    });
    return clicked;
  });
  console.log('Login button clicked:', loginClicked);
  await new Promise(r => setTimeout(r, 1000));

  // Check current visible view
  let visibleView = await page.evaluate(() => {
    const views = document.querySelectorAll('.V');
    for (const v of views) {
      if (v.classList.contains('on')) return v.id;
    }
    return 'none';
  });
  console.log('Visible view after click:', visibleView);

  // Try entering credentials (using test folder)
  if (visibleView === 'vLogin') {
    await page.evaluate(() => {
      const inputs = document.querySelectorAll('#vLogin input');
      inputs.forEach(inp => {
        if (inp.placeholder && inp.placeholder.includes('USUARIO')) inp.value = 'test';
        if (inp.placeholder && inp.placeholder.includes('CONTRASE')) inp.value = 'test';
      });
    });

    // Try clicking login
    const doLoginExists = await page.evaluate(() => typeof doLogin === 'function');
    console.log('doLogin exists:', doLoginExists);
  }

  // Final check: any errors?
  const pageErrors = consoleLogs.filter(l => l.type === 'error' || l.type === 'pageerror');
  console.log('\n=== Final JS errors: ' + pageErrors.length + ' ===');
  pageErrors.forEach(e => console.log('  ' + e.text));

  // Show all console output
  console.log('\n=== All console output ===');
  consoleLogs.forEach(l => console.log('  [' + l.type + '] ' + l.text));

  await page.screenshot({ path: 'C:/Proyectos/wichanzao-final/icons/verify-login.png' });
  console.log('\nScreenshot: icons/verify-login.png');

  await browser.close();
} catch(e) {
  console.error('FATAL:', e.message);
} finally {
  server.close();
  process.exit(0);
}
