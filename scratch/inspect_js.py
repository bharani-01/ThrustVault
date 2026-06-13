with open('public/performance_app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for idx, line in enumerate(lines):
    if 'creator-drafts-list' in line:
        start = max(0, idx - 5)
        end = min(len(lines), idx + 35)
        print(f"=== Line {idx+1} in performance_app.js ===")
        for i in range(start, end):
            print(f"{i+1}: {lines[i]}", end='')
