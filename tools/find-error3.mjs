import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf8');

const lastScriptIdx = html.lastIndexOf('<script>');
const lastCloseIdx = html.lastIndexOf('</script>');
const code = html.slice(lastScriptIdx + 8, lastCloseIdx);

// Test prefixes character by character around position 960-980
for (let i = 960; i <= 980; i++) {
  const chunk = code.slice(0, i);
  try {
    new Function(chunk);
  } catch (e) {
    console.log(`FAIL at ${i}: ${e.message}`);
    console.log(`  Last 40 chars: ${JSON.stringify(chunk.slice(-40))}`);
    break;
  }
}

// Also test: does the code from 0-500 parse?
console.log('\n--- Testing smaller chunks ---');
[500, 900, 950, 960, 965, 968, 969].forEach(end => {
  try {
    new Function(code.slice(0, end));
    console.log(`0-${end}: OK`);
  } catch(e) {
    console.log(`0-${end}: FAIL - ${e.message}`);
  }
});
