with open('public/style.css', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for idx, line in enumerate(lines):
    if 'landing-footer' in line or 'logo-light' in line or 'logo-dark' in line:
        start = max(0, idx - 2)
        end = min(len(lines), idx + 5)
        print(f"--- Line {idx+1} ---")
        for i in range(start, end):
            print(f"{i+1}: {lines[i]}", end='')
