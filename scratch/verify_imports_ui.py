import os

def verify_ui():
    html_path = "public/admin_imports.html"
    
    if not os.path.exists(html_path):
        print(f"FAIL: {html_path} does not exist.")
        return False
        
    with open(html_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Assertions for style rules and elements
    checks = {
        "guidelines-card CSS class": ".guidelines-card",
        "mapper-select CSS class styling": ".mapper-select {",
        "stats-strip CSS class styling": ".stats-strip {",
        "stat-box CSS class styling": ".stat-box {",
        "modal-overlay show state CSS rule": ".modal-overlay.show {",
        "progress-shimmer animation rule": "@keyframes progress-shimmer",
        "guidelines-card HTML block": 'id="guidelines-card"',
        "guidelines-toggle HTML block": 'id="guidelines-toggle"',
        "guidelines-content HTML block": 'id="guidelines-content"',
        "guidelines-chevron HTML block": 'id="guidelines-chevron"',
        "Total Rows stat-box class": 'class="stat-box stat-total"',
        "Ready to Import stat-box class": 'class="stat-box stat-valid"',
        "Duplicates stat-box class": 'class="stat-box stat-dup"',
        "Errors stat-box class": 'class="stat-box stat-err"',
        "Stepper modal overlay class": 'class="modal-overlay" id="import-progress-modal"',
        "Stepper modal container stripped styles": 'class="modal-container"',
        "Confirm modal overlay class": 'class="modal-overlay" id="confirm-modal"',
        "Collapsible guidelines inline JS script": 'document.getElementById(\'guidelines-toggle\')'
    }
    
    all_passed = True
    for desc, code in checks.items():
        if code in content:
            print(f"PASS: {desc}")
        else:
            print(f"FAIL: {desc} is missing from admin_imports.html.")
            all_passed = False
            
    return all_passed

if __name__ == "__main__":
    if verify_ui():
        print("All Bulk Import Console UI assertions passed successfully!")
    else:
        exit(1)
