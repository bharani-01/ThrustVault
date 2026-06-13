import os
import re

public_dir = 'public'
# Match <script src="libs/supabase.js" ...></script> and optional surrounding whitespace
pattern = re.compile(r'\s*<script src="libs/supabase\.js"[^>]*></script>', re.IGNORECASE)

removed_count = 0
for root, dirs, files in os.walk(public_dir):
    for file in files:
        if file.endswith('.html'):
            path = os.path.join(root, file)
            try:
                with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                if 'libs/supabase.js' in content:
                    new_content = pattern.sub('', content)
                    with open(path, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                    print(f"Removed supabase.js script tag from: {path}")
                    removed_count += 1
            except Exception as e:
                print(f"Error processing {path}: {e}")

print(f"Done! Cleaned {removed_count} HTML files.")
