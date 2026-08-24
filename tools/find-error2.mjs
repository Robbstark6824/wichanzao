import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf8');

// Extract main script block
const lastScriptIdx = html.lastIndexOf('<script>');
const lastCloseIdx = html.lastIndexOf('</script>');
const code = html.slice(lastScriptIdx + 8, lastCloseIdx);

// Show chars around position 960-980
console.log('Chars 960-990:');
console.log(JSON.stringify(code.slice(960, 990)));
console.log('---');

// Show the code with line numbers around where the error is
const lines = code.split('\n');
// Find which line contains char 970
let pos = 0;
for (let i = 0; i < lines.length; i++) {
  if (pos + lines[i].length >= 970) {
    const col = 970 - pos;
    console.log(`Line ${i + 1} (offset ${pos}): ${lines[i]}`);
    console.log(`Position 970 is at column ${col}: char = '${code[970]}' (${code.charCodeAt(970)})`);
    // Show context
    for (let j = Math.max(0, i - 5); j <= Math.min(lines.length - 1, i + 5); j++) {
      console.log(`  ${j + 1}: ${lines[j]}`);
    }
    break;
  }
  pos += lines[i].length + 1; // +1 for newline
}

// Also try to find any empty strings or unusual quote patterns before pos 970
console.log('\n--- Checking for potential issues ---');
// Check for template literals without proper closing
for (let i = 0; i < 970; i++) {
  if (code[i] === '`' && (i === 0 || code[i-1] !== '\\')) {
    // Find the matching backtick
    let j = i + 1;
    while (j < code.length) {
      if (code[j] === '`' && code[j-1] !== '\\') break;
      if (code[j] === '\\') j++;
      j++;
    }
    if (j >= code.length || j > 2000) {
      console.log('Unclosed template literal starting at position', i);
      console.log('  Context:', JSON.stringify(code.slice(Math.max(0,i-20), i+60)));
    }
  }
}
