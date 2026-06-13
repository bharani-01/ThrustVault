import re

def search_pattern_in_file(filepath, pattern):
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    for idx, line in enumerate(lines):
        if pattern in line:
            print(f"{filepath}:{idx+1}: {line.strip()}")

print("Searching 'draft-card'...")
search_pattern_in_file('public/performance_analytics.html', 'draft-card')
search_pattern_in_file('public/performance_app.js', 'draft-card')

print("\nSearching 'run-card'...")
search_pattern_in_file('public/performance_analytics.html', 'run-card')
search_pattern_in_file('public/performance_app.js', 'run-card')
