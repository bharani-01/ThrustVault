with open('server.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

print(f"Total lines: {len(lines)}")
for idx in range(min(800, len(lines)), len(lines)):
    print(f"{idx+1}: {lines[idx]}", end='')
