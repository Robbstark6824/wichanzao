import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf8');

// Extract main script block
const lastScriptIdx = html.lastIndexOf('<script>');
const lastCloseIdx = html.lastIndexOf('</script>');
const code = html.slice(lastScriptIdx + 8, lastCloseIdx);
const htmlLines = html.split('\n');

console.log('Main script: chars 0 to', code.length);

// Binary search to find the error position
function checkSyntax(js) {
  try {
    new Function(js);
    return null; // OK
  } catch (e) {
    return e.message;
  }
}

// Test progressively larger chunks
let chunkSize = 10000;
for (let end = chunkSize; end <= code.length; end += chunkSize) {
  const chunk = code.slice(0, end);
  const err = checkSyntax(chunk);
  if (err) {
    console.log(`ERROR at first ${end} chars:`, err);

    // Binary search within this chunk
    let lo = end - chunkSize + 1;
    let hi = end;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (checkSyntax(code.slice(0, mid))) {
        hi = mid;
      } else {
        lo = mid + 1;
      }
    }
    console.log('Error position in code:', lo);

    // Find the HTML line number
    const posInHtml = lastScriptIdx + 8 + lo;
    const htmlLineNum = html.slice(0, posInHtml).split('\n').length;

    // Show context
    const lineStart = code.lastIndexOf('\n', lo) + 1;
    const lineEnd = code.indexOf('\n', lo);
    const errorLine = code.slice(lineStart, lineEnd > 0 ? lineEnd : undefined);
    console.log('HTML line ~' + htmlLineNum);

    // Show surrounding lines
    const codeLines = code.split('\n');
    const codeLineNum = code.slice(0, lo).split('\n').length;
    console.log('\nContext (code lines):');
    for (let l = Math.max(0, codeLineNum - 5); l <= Math.min(codeLines.length - 1, codeLineNum + 5); l++) {
      const marker = l === codeLineNum - 1 ? '>>>' : '   ';
      console.log(`${marker} ${l + 1}: ${codeLines[l]}`);
    }

    break;
  }
}
