'use strict';

async function testListing() {
  console.log('🧪 Testing custom /api/admin/users route directly from Cognito...');
  try {
    // 1. Log in to get session cookie
    const loginRes = await fetch('http://localhost:8001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admindemo@thrustvault.in',
        password: 'ThrustVault123!'
      })
    });

    if (loginRes.status !== 200) {
      throw new Error('Login failed with status ' + loginRes.status);
    }
    const cookie = loginRes.headers.get('set-cookie');
    const headers = {
      'Content-Type': 'application/json',
      ...(cookie ? { 'cookie': cookie } : {})
    };

    // 2. Query all users (with email order sorting)
    console.log('Fetching all users with order=email.asc...');
    const allUsersRes = await fetch('http://localhost:8001/api/admin/users?order=email.asc', { headers });
    console.log('All Users Status:', allUsersRes.status);
    const allUsers = await allUsersRes.json();
    console.log('First 3 users in retrieved list:', allUsers.slice(0, 3));
    console.log(`Total users returned: ${allUsers.length}`);

    // Verify properties
    if (allUsers.length > 0) {
      const u = allUsers[0];
      if (u.id && u.email && u.created_at && u.role) {
        console.log('✅ Success: User objects contain required attributes (id, email, created_at, role).');
      } else {
        console.error('❌ Error: Missing user attributes.', u);
      }
    }

    // 3. Query filtered user by email
    const filterEmail = 'admindemo@thrustvault.in';
    console.log(`Fetching user filtered by email: eq.${filterEmail}...`);
    const filterRes = await fetch(`http://localhost:8001/api/admin/users?email=eq.${filterEmail}`, { headers });
    console.log('Filter Status:', filterRes.status);
    const filteredUsers = await filterRes.json();
    console.log('Filtered response:', filteredUsers);

    if (filteredUsers.length === 1 && filteredUsers[0].email === filterEmail) {
      console.log('✅ Success: User email filter returned exactly the requested user.');
    } else {
      console.error('❌ Error: Filter logic failed.');
    }

  } catch (err) {
    console.error('❌ Test failed:', err.message);
  }
}

testListing();
