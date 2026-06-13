import unittest
import json
from server import app

class TestAPIEndpoints(unittest.TestCase):
    def setUp(self):
        app.config['TESTING'] = True
        self.client = app.test_client()

    def test_unauthorized_access(self):
        """Requests with no session cookie should return 401 on protected routes"""
        res = self.client.get('/api/db/motors')
        self.assertEqual(res.status_code, 401)
        
        res = self.client.get('/api/db/categories')
        self.assertEqual(res.status_code, 401)
        
        # Test anonymous access request POST (should be 200 or 500/409, not 401)
        # Note: it will try to call Supabase, which might fail or return representation,
        # but it shouldn't fail with 401.
        res = self.client.post('/api/db/access_requests', json={
            "fullName": "Test User",
            "email": "test@example.com",
            "requestedRole": "guest",
            "justification": "Testing"
        })
        self.assertNotEqual(res.status_code, 401)

    def test_guest_role_permissions(self):
        """Guest role should be allowed to GET motors/categories but not mutate them"""
        with self.client.session_transaction() as sess:
            sess['role'] = 'guest'
            sess['uid'] = 'mock-guest-uid'
            sess['timestamp'] = 2000000000000 # far in future/valid

        # GET should be allowed (it will try to fetch from Supabase, so it might fail with 500, but not 403)
        res = self.client.get('/api/db/motors')
        self.assertNotEqual(res.status_code, 403)
        self.assertNotEqual(res.status_code, 401)

        # POST should be forbidden (403)
        res = self.client.post('/api/db/motors', json={})
        self.assertEqual(res.status_code, 403)

        # PATCH should be forbidden (403)
        res = self.client.patch('/api/db/motors', json={})
        self.assertEqual(res.status_code, 403)

        # DELETE should be forbidden (403)
        res = self.client.delete('/api/db/motors')
        self.assertEqual(res.status_code, 403)

    def test_intern_role_permissions(self):
        """Intern role should be allowed to GET/POST/PATCH motors but not DELETE them"""
        with self.client.session_transaction() as sess:
            sess['role'] = 'intern'
            sess['uid'] = 'mock-intern-uid'
            sess['timestamp'] = 2000000000000

        # GET allowed
        res = self.client.get('/api/db/motors')
        self.assertNotEqual(res.status_code, 403)

        # POST allowed (might return 500 on db connect, but not 403)
        res = self.client.post('/api/db/motors', json={})
        self.assertNotEqual(res.status_code, 403)

        # PATCH allowed
        res = self.client.patch('/api/db/motors', json={})
        self.assertNotEqual(res.status_code, 403)

        # DELETE forbidden on motors
        res = self.client.delete('/api/db/motors')
        self.assertEqual(res.status_code, 403)

    def test_admin_role_permissions(self):
        """Admin role should be allowed to perform all operations"""
        with self.client.session_transaction() as sess:
            sess['role'] = 'admin'
            sess['uid'] = 'mock-admin-uid'
            sess['timestamp'] = 2000000000000

        # All methods should pass the 403 check (they might fail with 500 due to database mocks, but not 403)
        res = self.client.get('/api/db/motors')
        self.assertNotEqual(res.status_code, 403)

        res = self.client.post('/api/db/motors', json={})
        self.assertNotEqual(res.status_code, 403)

        res = self.client.patch('/api/db/motors', json={})
        self.assertNotEqual(res.status_code, 403)

        res = self.client.delete('/api/db/motors')
        self.assertNotEqual(res.status_code, 403)

if __name__ == '__main__':
    unittest.main()
