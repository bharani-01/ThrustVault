import os

directory = r"d:\motor data\admin_portal\public"
replacements = {
    'src="page-loader.js"': 'src="page-loader.js?v=2.0"',
    "src='page-loader.js'": "src='page-loader.js?v=2.0'"
}

for root, dirs, files in os.walk(directory):
    for file in files:
        if file.endswith(".html"):
            filepath = os.path.join(root, file)
            print(f"Processing: {filepath}")
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()
            
            modified = False
            for old, new in replacements.items():
                if old in content:
                    content = content.replace(old, new)
                    modified = True
                    print(f"  Replaced '{old}' with '{new}'")
            
            if modified:
                with open(filepath, "w", encoding="utf-8") as f:
                    f.write(content)
                print(f"  Saved changes to {file}")

print("Bulk HTML replacement complete.")
