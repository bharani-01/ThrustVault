import urllib.request

url = "http://127.0.0.1:8000/page-loader.js"
try:
    with urllib.request.urlopen(url) as response:
        content = response.read().decode('utf-8')
        if "MutationObserver" in content and "sessionStorage" in content:
            print("Verification Success: page-loader.js correctly served with MutationObserver and sessionStorage cache logic.")
        else:
            print("Verification Fail: page-loader.js does not contain the updated logic.")
except Exception as e:
    print(f"Error requesting page-loader.js: {e}")
