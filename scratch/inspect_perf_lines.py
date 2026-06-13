with open('public/performance_analytics.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for idx, line in enumerate(lines):
    if 'draft-card' in line or 'draft-card-header' in line or 'draft-card-title' in line:
        start = max(0, idx - 4)
        end = min(len(lines), idx + 20)
        print(f"=== Line {idx+1} ===")
        for i in range(start, end):
            print(f"{i+1}: {lines[i]}", end='')
