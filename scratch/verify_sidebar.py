import os

def verify_files():
    loader_path = "public/page-loader.js"
    perf_path = "public/performance_app.js"
    
    # 1. Verify page-loader.js has the updated highlightActiveSidebarLink logic
    with open(loader_path, "r", encoding="utf-8") as f:
        loader_content = f.read()
    
    if "isExactMatch = currentPath === href" in loader_content:
        print("PASS: page-loader.js contains the absolute path matching logic.")
    else:
        print("FAIL: page-loader.js is missing absolute path matching logic.")
        return False

    # 2. Verify performance_app.js doesn't contain legacy sidebar override
    with open(perf_path, "r", encoding="utf-8") as f:
        perf_content = f.read()

    if "sidebarMenu.innerHTML =" in perf_content:
        print("FAIL: performance_app.js still contains legacy sidebar override.")
        return False
    elif "sidebarSubtitle.textContent =" in perf_content:
        print("FAIL: performance_app.js still contains legacy subtitle overrides.")
        return False
    else:
        print("PASS: performance_app.js legacy sidebar rendering is successfully removed.")
        
    return True

if __name__ == "__main__":
    if verify_files():
        print("All assertions passed successfully!")
    else:
        exit(1)
