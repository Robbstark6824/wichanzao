import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf8');

// Find all script blocks
const scriptRegex = /<script>([\s\S]*?)<\/script>/g;
const scripts = [];
let match;
while ((match = scriptRegex.exec(html)) !== null) {
  scripts.push({ content: match[1], start: match.index, end: match.index + match[0].length });
}

console.log('Found', scripts.length, 'script blocks');

// Try to parse each script block for syntax errors
for (let i = 0; i < scripts.length; i++) {
  const code = scripts[i].content;
  // Find line number in HTML for this script
  const lineInHtml = html.slice(0, scripts[i].start).split('\n').length;
  console.log(`\nScript block ${i + 1}: starts at HTML line ${lineInHtml}, length ${code.length}`);

  try {
    // Use vm.compileFunction for a more accurate check
    new Function(code);
    console.log('  Syntax: OK');
  } catch (e) {
    console.log('  Syntax ERROR:', e.message);

    // Extract line info from error
    const errMatch = e.message.match(/at position (\d+)/);
    if (errMatch) {
      const pos = parseInt(errMatch[1]);
      const lineInCode = code.slice(0, pos).split('\n').length;
      const errorLine = code.split('\n')[lineInCode - 1];
      console.log('  Near line', lineInCode, 'of script:', errorLine ? errorLine.trim().slice(0, 120) : '?');
    }
  }
}
