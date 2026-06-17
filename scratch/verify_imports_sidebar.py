import os

def verify_file():
    imports_path = "public/admin_imports_app.js"
    
    with open(imports_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Assertions
    checks = {
        "elements totalMotors getter": "get totalMotors() { return document.getElementById('total-motors-count'); }",
        "elements catList getter": "get catList() { return document.getElementById('category-list-container'); }",
        "fetchSidebarCounts definition": "async function fetchSidebarCounts()",
        "renderSidebar definition": "function renderSidebar()",
        "setupSidebar definition": "function setupSidebar()",
        "sidebarLoaded event binding": "window.addEventListener('sidebarLoaded', setupSidebar)"
    }
    
    all_passed = True
    for desc, code in checks.items():
        if code in content:
            print(f"PASS: {desc}")
        else:
            print(f"FAIL: {desc} is missing.")
            all_passed = False
            
    return all_passed
``
if __name__ == "__main__":
    if verify_file():
        print("All imports sidebar assertions passed successfully!")
    else:
        exit(1)
