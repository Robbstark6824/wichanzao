import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf8');
const i = html.lastIndexOf('<script>');
const j = html.lastIndexOf('</script>');
const js = html.slice(i + 8, j);
const lines = js.split('\n');

// Count function depth properly
let funcDepth = 0;
let blockDepth = 0;

for (let k = 0; k < lines.length; k++) {
  const line = lines[k];
  const trimmed = line.trim();

  // Skip comments and strings
  if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

  // Track braces at line level (simplified)
  for (let c = 0; c < line.length; c++) {
    const ch = line[c];
    if (ch === '{') blockDepth++;
    if (ch === '}') blockDepth--;
  }

  // Track function keyword
  if (trimmed.match(/\bfunction\b/) && line.includes('{')) funcDepth++;
  if (trimmed.match(/=>\s*\{/)) funcDepth++;

  // Closing brace that might end a function
  if (trimmed === '}') {
    if (funcDepth > 0 && blockDepth === 0) funcDepth--;
  }

  // Look for return
  const hasReturn = /\breturn\b/.test(trimmed);
  if (!hasReturn) continue;

  // Exclude returns in strings
  const strippedLine = line.replace(/'[^']*'/g, '').replace(/"[^"]*"/g, '');
  if (!/\breturn\b/.test(strippedLine)) continue;

  // If block depth is 0 or negative when we see return, it's likely illegal
  if (blockDepth <= 0 && funcDepth <= 0) {
    console.log(`ILLEGAL RETURN at line ${k+1} (block=${blockDepth}, func=${funcDepth}):`);
    for (let c = Math.max(0, k-8); c <= Math.min(lines.length-1, k+3); c++) {
      const marker = c === k ? '>>>' : '   ';
      console.log(`${marker} ${c+1}: ${lines[c]}`);
    }
    console.log('---');
  }
}

// Also check for return in specific suspicious areas
// Look for: if (... ) return; at top level
console.log('\n=== Top-level code checks ===');
let inFunction = false;
for (let k = 0; k < lines.length; k++) {
  const trimmed = lines[k].trim();
  if (trimmed.startsWith('function ') || trimmed.startsWith('async function ')) inFunction = true;
  if (trimmed === '}' && inFunction) { inFunction = false; continue; }

  if (!inFunction && trimmed.match(/^\s*if\s*\(.*\)\s*return/)) {
    console.log(`Top-level 'if return' at line ${k+1}: ${trimmed}`);
    for (let c = Math.max(0, k-4); c <= Math.min(lines.length-1, k+4); c++) {
      console.log(`  ${c+1}: ${lines[c]}`);
    }
  }
}
