import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf8');

const lastScriptIdx = html.lastIndexOf('<script>');
const lastCloseIdx = html.lastIndexOf('</script>');
const code = html.slice(lastScriptIdx + 8, lastCloseIdx);

// Find the first error (0-500 fails)
function checkSyntax(js) {
  try { new Function(js); return null; } catch(e) { return e.message; }
}

// Binary search for error in 0-500
let lo = 0, hi = 500;
while (lo < hi) {
  const mid = Math.floor((lo + hi) / 2);
  if (checkSyntax(code.slice(0, mid))) {
    hi = mid;
  } else {
    lo = mid + 1;
  }
}
console.log('First error at position:', lo);
console.log('Char:', JSON.stringify(code[lo-1]), 'code:', code.charCodeAt(lo-1));
console.log('Context:');
const lines = code.split('\n');
let pos = 0;
for (let i = 0; i < lines.length; i++) {
  if (pos + lines[i].length >= lo) {
    const col = lo - pos;
    console.log(`Line ${i+1}, col ${col}: ${JSON.stringify(lines[i])}`);
    console.log(`Char at col: '${lines[i][col-1]}'`);
    if (i > 0) console.log(`Previous line: ${JSON.stringify(lines[i-1])}`);
    break;
  }
  pos += lines[i].length + 1;
}

// Also check for the 0-900 error
lo = 900; hi = 950;
while (lo < hi) {
  const mid = Math.floor((lo + hi) / 2);
  if (checkSyntax(code.slice(0, mid))) {
    hi = mid;
  } else {
    lo = mid + 1;
  }
}
console.log('\n0-900 error resolves at:', lo);
console.log('Char:', JSON.stringify(code.slice(lo-5, lo+5)));
