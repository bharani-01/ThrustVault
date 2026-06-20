import os
import re

directories = [
    r"d:\motor data\src",
    r"d:\motor data\public",
    r"d:\motor data\admin_portal"
]

# Case-insensitive replacements
replacements = [
    # Paths & URLs
    (r"/intern/dashboard", "/user/dashboard"),
    (r"/intern_dashboard", "/user_dashboard"),
    (r"/intern/analytics", "/user/analytics"),
    (r"/intern_analytics", "/user_analytics"),
    (r"/intern/explorer", "/user/explorer"),
    (r"/intern_explorer", "/user_explorer"),
    (r"/intern/", "/user/"),
    
    # Specific identifiers with underscores/hyphens/camelCase
    (r"\bintern_dashboard\b", "user_dashboard"),
    (r"\bintern_analytics\b", "user_analytics"),
    (r"\bintern_explorer\b", "user_explorer"),
    (r"\bintern_catalog\b", "user_catalog"),
    (r"\bisIntern\b", "isUser"),
    (r"\binterndemo\b", "userdemo"),
    (r"\bintern-item\b", "user-item"),
    (r"\brole-intern\b", "role-user"),
    (r"\bclass intern\b", "class user"),
    
    # Exact word replacements preserving case where possible
    (r"\bINTERNS\b", "USERS"),
    (r"\bInterns\b", "Users"),
    (r"\binterns\b", "users"),
    (r"\bINTERN\b", "USER"),
    (r"\bIntern\b", "User"),
    (r"\bintern\b", "user"),
]

exclude_files = ["bulk_replace.py", "replace_roles.py"]

for directory in directories:
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file in exclude_files:
                continue
            if file.endswith((".js", ".html", ".css", ".py", ".sql")):
                filepath = os.path.join(root, file)
                with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
                
                modified = False
                new_content = content
                for pattern, replacement in replacements:
                    # Perform regex substitution case-insensitively if needed, or keeping it direct
                    temp = re.sub(pattern, replacement, new_content)
                    if temp != new_content:
                        new_content = temp
                        modified = True
                
                if modified:
                    with open(filepath, "w", encoding="utf-8") as f:
                        f.write(new_content)
                    print(f"Updated: {filepath}")

print("Replacement complete.")
