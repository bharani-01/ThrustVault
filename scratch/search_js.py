import os

def search_text_in_files(directory, text):
    for root, dirs, files in os.walk(directory):
        for file in files:
            path = os.path.join(root, file)
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    if text in content:
                        print(f"Found '{text}' in: {path}")
            except Exception as e:
                pass

search_text_in_files('public', 'draft-card')
