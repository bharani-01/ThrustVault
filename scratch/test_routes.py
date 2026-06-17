import urllib.request

def test_url(url):
    print(f"Testing URL: {url}")
    class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, hdrs, newurl):
            # Capture the redirect details instead of following it
            self.redirected_to = newurl
            return None
    
    handler = NoRedirectHandler()
    opener = urllib.request.build_opener(handler)
    try:
        res = opener.open(url)
        print(f"  Status: {res.code}")
        if hasattr(handler, 'redirected_to'):
            print(f"  Redirected to: {handler.redirected_to}")
        else:
            print(f"  No redirection. Headers: {dict(res.headers)}")
    except urllib.error.HTTPError as e:
        print(f"  HTTP Error: {e.code}")
        print(f"  Headers: {dict(e.headers)}")
    except Exception as e:
        print(f"  Error: {e}")
    print("-" * 50)

# Test safety-net fallback redirects
test_url("http://127.0.0.1:8000/admin/admin_dashboard")
test_url("http://127.0.0.1:8000/admin/admin_users")
test_url("http://127.0.0.1:8000/admin/login")
test_url("http://127.0.0.1:8000/admin/admin_imports.html")
test_url("http://127.0.0.1:8000/admin/performance_analytics")
test_url("http://127.0.0.1:8000/login.html")
