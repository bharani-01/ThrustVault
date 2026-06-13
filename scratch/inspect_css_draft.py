with open('public/style.css', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for idx, line in enumerate(lines):
    if '.card' in line or '[class*="card"]' in line or 'card {' in line:
        start = max(0, idx - 4)
        end = min(len(lines), idx + 15)
        print(f"=== Line {idx+1} ===")
        for i in range(start, end):
            print(f"{i+1}: {lines[i]}", end='')
