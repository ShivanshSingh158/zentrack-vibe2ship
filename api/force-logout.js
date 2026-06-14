import admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (err) {
    console.error('[force-logout] Failed to initialize Firebase Admin:', err.message);
  }
}

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Very basic auth so random people can't trigger it
  const internalSecret = process.env.ZENTRACK_INTERNAL_SECRET;
  if (internalSecret) {
    const provided = req.headers['x-internal-secret'] || '';
    if (provided !== internalSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    let usersRevoked = 0;
    
    // List all users in batches of 1000
    let listUsersResult = await admin.auth().listUsers(1000);
    
    do {
      for (const user of listUsersResult.users) {
        await admin.auth().revokeRefreshTokens(user.uid);
        usersRevoked++;
      }
      
      if (listUsersResult.pageToken) {
        listUsersResult = await admin.auth().listUsers(1000, listUsersResult.pageToken);
      } else {
        break;
      }
    } while (true);

    return res.status(200).json({ 
      success: true, 
      message: `Successfully revoked sessions for ${usersRevoked} users.` 
    });
  } catch (err) {
    console.error('[force-logout] Error:', err);
    return res.status(500).json({ error: 'Failed to force logout users', details: err.message });
  }
}
