import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf8');

// Extract main script block
const lastScriptIdx = html.lastIndexOf('<script>');
const lastCloseIdx = html.lastIndexOf('</script>');
const mainScript = html.slice(lastScriptIdx + 8, lastCloseIdx);
console.log('Main script length:', mainScript.length);

// State machine for parsing
let brace = 0, paren = 0, bracket = 0;
let braceLines = []; // track where balance changes significantly

const STATE = { CODE: 0, LINE_COMMENT: 1, BLOCK_COMMENT: 2, STRING_SQ: 3, STRING_DQ: 4, TEMPLATE: 5, REGEX: 6 };
let state = STATE.CODE;
let stack = []; // for nested template expressions
let exprDepth = 0; // template expression nesting depth

for (let i = 0; i < mainScript.length; i++) {
  let ch = mainScript[i];
  let next = i < mainScript.length - 1 ? mainScript[i + 1] : '';
  let prev = i > 0 ? mainScript[i - 1] : '';
  let lineNum = mainScript.slice(0, i).split('\n').length;

  if (state === STATE.LINE_COMMENT) {
    if (ch === '\n') state = STATE.CODE;
    continue;
  }
  if (state === STATE.BLOCK_COMMENT) {
    if (ch === '*' && next === '/') { state = STATE.CODE; i++; }
    continue;
  }
  if (state === STATE.STRING_SQ) {
    if (ch === '\\') { i++; continue; }
    if (ch === "'") { state = STATE.CODE; continue; }
    continue;
  }
  if (state === STATE.STRING_DQ) {
    if (ch === '\\') { i++; continue; }
    if (ch === '"') { state = STATE.CODE; continue; }
    continue;
  }
  if (state === STATE.TEMPLATE) {
    if (ch === '\\') { i++; continue; }
    if (ch === '`') {
      if (stack.length > 0) {
        // This is a nested template - pop
        stack.pop();
        state = stack.length > 0 ? STATE.TEMPLATE : STATE.CODE;
      } else {
        state = STATE.CODE;
      }
      continue;
    }
    if (ch === '$' && next === '{') {
      // Enter template expression - count the opening brace
      stack.push('expr');
      brace++;
      if (Math.abs(brace) > 5) braceLines.push({line: lineNum, pos: i, brace, ch: '${'});
      i++; // skip {
      continue;
    }
    continue;
  }

  // CODE state
  if (ch === '/' && next === '/') { state = STATE.LINE_COMMENT; i++; continue; }
  if (ch === '/' && next === '*') { state = STATE.BLOCK_COMMENT; i++; continue; }

  // Regex detection (simplified: / not after identifier/number/paren)
  if (ch === '/' && !/[a-zA-Z0-9_)\]})]/.test(prev) && prev !== '/' && next !== '/') {
    // Could be regex, skip it
    state = STATE.REGEX;
    continue;
  }
  if (state === STATE.REGEX) {
    if (ch === '\\') { i++; continue; }
    if (ch === '/') { state = STATE.CODE; continue; }
    continue;
  }

  if (ch === "'") { state = STATE.STRING_SQ; continue; }
  if (ch === '"') { state = STATE.STRING_DQ; continue; }
  if (ch === '`') { state = STATE.TEMPLATE; stack = []; continue; }

  if (ch === '{') {
    brace++;
    if (Math.abs(brace) > 10) braceLines.push({line: lineNum, pos: i, brace, ch: '{'});
  }
  if (ch === '}') {
    brace--;
    if (brace < -3) braceLines.push({line: lineNum, pos: i, brace, ch: '}'});
  }
  if (ch === '(') paren++;
  if (ch === ')') paren--;
  if (ch === '[') bracket++;
  if (ch === ']') bracket--;
}

console.log('Brace balance:', brace, '(0=balanced)');
console.log('Paren balance:', paren, '(0=balanced)');
console.log('Bracket balance:', bracket, '(0=balanced)');
console.log('State at end:', state);

// Print lines with strange balances
if (braceLines.length > 0) {
  console.log('\nBrace anomalies (last 20):');
  braceLines.slice(-20).forEach(b => {
    const context = mainScript.slice(Math.max(0, b.pos - 40), Math.min(mainScript.length, b.pos + 40)).replace(/\n/g, '\\n');
    console.log(`  Line ${b.line}: ${b.ch} (balance now: ${b.brace}) context: ...${context}...`);
  });
}

// Print lines around the final position
const totalLines = mainScript.split('\n').length;
console.log('\nTotal lines:', totalLines);

// Find the final lines to see what's at the end
const tailLines = mainScript.split('\n').slice(-40);
console.log('\nLast 40 lines:');
tailLines.forEach((l, i) => console.log(`  ${totalLines - 40 + i + 1}: ${l}`));
