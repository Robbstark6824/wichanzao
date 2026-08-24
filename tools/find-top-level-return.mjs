import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf8');
const scriptStart = html.lastIndexOf('<script>');
const scriptEnd = html.lastIndexOf('</script>');
const js = html.slice(scriptStart + 8, scriptEnd);

// Identify top-level code regions (not inside any function)
// Strategy: find all function declarations, map their bodies
// Then flag any return outside those bodies

const lines = js.split('\n');

// Parse: track brace depth and identify function boundaries
const funcRanges = []; // {startLine, endLine}
let inFunc = false;
let funcStart = -1;
let funcBraceDepth = 0;
let braceDepth = 0;

// First, identify function declaration lines
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const trimmed = line.trim();

  // Count braces in this line
  const opens = (line.match(/\{/g) || []).length;
  const closes = (line.match(/\}/g) || []).length;

  if (!inFunc) {
    // Check if this line starts a function declaration
    // function foo() {  or  async function foo() {
    if (trimmed.match(/^(async\s+)?function\s+\w+\s*\(/) || trimmed.match(/function\s*\(/)) {
      if (opens > closes) {
        inFunc = true;
        funcStart = i;
        funcBraceDepth = opens - closes;
      }
    }
    // Arrow functions assigned to vars: var foo = (...) => { or var foo = function() {
    else if (trimmed.match(/\.on\w+\s*=\s*function\s*\(/) || trimmed.match(/\.addEventListener\(.*function/)) {
      if (opens > closes || trimmed.endsWith('{')) {
        inFunc = true;
        funcStart = i;
        funcBraceDepth = opens - closes;
      }
    }
    else {
      braceDepth += (opens - closes);
    }
  } else {
    // Inside a function — track brace depth
    funcBraceDepth += (opens - closes);
    if (funcBraceDepth <= 0) {
      inFunc = false;
      funcRanges.push({ start: funcStart, end: i });
      funcStart = -1;
      funcBraceDepth = 0;
    }
  }
}

// Also track bracket-based function expressions like obj.method = function() { ... };
// Let me also check for arrow functions: const x = () => { ... };
// And for cases where function definition spans multiple lines before opening brace

console.log(`Found ${funcRanges.length} function boundaries`);

// Now check for return statements outside function ranges
let found = 0;
for (let i = 0; i < lines.length; i++) {
  const trimmed = lines[i].trim();

  // Quick check: does line contain 'return'?
  if (!/\breturn\b/.test(trimmed)) continue;

  // Skip if inside strings
  const stripped = trimmed.replace(/'[^']*'/g, '').replace(/"[^"]*"/g, '').replace(/`[^`]*`/g, '');
  if (!/\breturn\b/.test(stripped)) continue;

  // Check if inside any function range
  let inside = false;
  for (const range of funcRanges) {
    if (i >= range.start && i <= range.end) {
      inside = true;
      break;
    }
  }

  if (!inside) {
    found++;
    console.log(`\nILLEGAL RETURN at line ${i+1}: ${trimmed.slice(0, 100)}`);
    // Show context
    for (let c = Math.max(0, i-5); c <= Math.min(lines.length-1, i+5); c++) {
      const marker = c === i ? '>>>' : '   ';
      console.log(`${marker} ${c+1}: ${lines[c]}`);
    }

    if (found >= 5) {
      console.log('\n... (stopped at 5 findings)');
      break;
    }
  }
}

if (found === 0) {
  console.log('\nNo illegal return statements found!');
  console.log('The error might be from cached version or a different reason.');
}
