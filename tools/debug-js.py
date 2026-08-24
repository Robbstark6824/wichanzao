with open('C:/Proyectos/wichanzao-final/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

start = content.find('<script>', 200)
end = content.find('</script>', start)
script = content[start:end]
lines = script.split('\n')

# Find lines with backticks
for i, line in enumerate(lines, 1):
    if '`' in line:
        print(f"L{i}: backtick: {line[:150]}")

print(f"\nTotal backticks: {script.count('`')}")

# Find lines where quote count is odd (unbalanced)
for i, line in enumerate(lines, 1):
    sq = line.count("'")
    if sq % 2 != 0:
        # Check if it's part of a multi-line string
        pass  # many JS lines have odd quotes, they're concatenations

# Find Unicode chars that look like quotes
for i, ch in enumerate(script):
    cp = ord(ch)
    if cp in [0x2018, 0x2019, 0x201C, 0x201D, 0x201A, 0x201B, 0x2032, 0x2033]:
        line_num = script[:i].count('\n') + 1
        context = script[max(0,i-20):min(len(script),i+20)]
        print(f"L{line_num}: SMART QUOTE U+{cp:04X} at pos {i}: ...{context}...")

print("\nLooking for other potential issues...")
# Check for stray characters right after string concatenation
import re
# Pattern: 'string' followed immediately by 'string' without operator
for m in re.finditer(r"'[^']*'[^+\n\r;,)\]} ]{0,5}'", script):
    ctx = script[max(0,m.start()-10):m.end()+10]
    ln = script[:m.start()].count('\n') + 1
    print(f"L{ln}: possible double string: ...{ctx}...")
