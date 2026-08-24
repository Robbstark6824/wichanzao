import fs from 'fs';
const file = process.argv[2] || 'index.html';
const html = fs.readFileSync(file, 'utf8');
// Find all inline <script> blocks (no src attribute) and check the largest.
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let m, biggest = null, biggestLen = -1;
while ((m = re.exec(html)) !== null) {
  if (m[1].length > biggestLen) { biggestLen = m[1].length; biggest = m[1]; }
}
if (biggest === null) { console.log(`${file}: no inline script found`); process.exit(1); }
try {
  new Function(biggest);
  console.log(`${file}: SYNTAX OK (${biggest.length} chars in main script)`);
} catch (e) {
  console.log(`${file}: SYNTAX ERROR: ${e.message}`);
  process.exit(1);
}
