import { readFileSync } from 'fs';

const html = readFileSync('C:/Proyectos/wichanzao-final/index.html', 'utf8');
const s1 = html.indexOf('<script>', 200) + 8;
const s2 = html.indexOf('</script>', s1);
const script = html.substring(s1, s2);

// Find all positions with backslash-backslash-singlequote
let pos = 0;
let found = [];
while ((pos = script.indexOf("\\\\'", pos)) !== -1) {
  const line = script.substring(0, pos).split('\n').length;
  const ctx = script.substring(Math.max(0, pos - 20), pos + 30).replace(/\n/g, '\\n');
  found.push({ line, pos, ctx });
  pos += 3;
}

console.log(`Found ${found.length} occurrences of \\\\'`);
found.forEach(f => console.log(`  Line ${f.line}: ...${f.ctx}...`));

// Also find all positions with backslash followed by non-standard chars
let pos2 = 0;
let badEscapes = [];
while ((pos2 = script.indexOf('\\', pos2)) !== -1) {
  const nextChar = script[pos2 + 1];
  // Valid escape sequences in JS strings: \\ \' \" \n \r \t \b \f \v \0 \x \u
  const valid = ['\\', "'", '"', 'n', 'r', 't', 'b', 'f', 'v', '0', 'x', 'u'];
  if (nextChar && !valid.includes(nextChar) && !/\d/.test(nextChar)) {
    // Could be an issue if inside a string
    const line = script.substring(0, pos2).split('\n').length;
    const ctx = script.substring(Math.max(0, pos2 - 15), pos2 + 15).replace(/\n/g, '\\n');
    badEscapes.push({ line, pos: pos2, ctx, next: nextChar, code: nextChar.charCodeAt(0) });
  }
  pos2 += 2;
  if (badEscapes.length > 20) break;
}

console.log(`\nBad escapes found: ${badEscapes.length}`);
badEscapes.slice(0, 20).forEach(f => console.log(`  Line ${f.line}, next='${f.next}' (${f.code}): ...${f.ctx}...`));
