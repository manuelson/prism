// GitHub PR Viewer - Service Worker
// Handles OAuth flow with GitHub via Cloudflare Worker

importScripts('../config.js');

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'login') {
    handleOAuthLogin()
      .then(result => sendResponse(result))
      .catch(error => {
        console.error('OAuth error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === 'getUser') {
    getUser(request.token)
      .then(user => sendResponse({ success: true, user }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

async function handleOAuthLogin() {
  // Get client_id from worker
  const configResponse = await fetch(`${CONFIG.WORKER_URL}/config`);
  const config = await configResponse.json();
  const clientId = config.client_id;

  if (!clientId) {
    throw new Error('OAuth not configured. Please deploy the worker first.');
  }

  // Get the extension's redirect URL
  const redirectUrl = chrome.identity.getRedirectURL();

  // Build GitHub authorization URL
  const state = generateRandomState();
  const authUrl = new URL('https://github.com/login/oauth/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUrl);
  authUrl.searchParams.set('scope', 'repo read:org admin:org user');
  authUrl.searchParams.set('state', state);

  // Launch OAuth flow - this opens GitHub in a popup
  const responseUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl.toString(),
    interactive: true,
  });

  // Parse the response
  const url = new URL(responseUrl);

  // Check for errors
  const error = url.searchParams.get('error');
  if (error) {
    throw new Error(url.searchParams.get('error_description') || error);
  }

  // Verify state
  const returnedState = url.searchParams.get('state');
  if (returnedState !== state) {
    throw new Error('Security error: state mismatch');
  }

  // Get authorization code
  const code = url.searchParams.get('code');
  if (!code) {
    throw new Error('No authorization code received');
  }

  // Exchange code for token via worker
  const tokenResponse = await fetch(`${CONFIG.WORKER_URL}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      code: code,
      redirect_uri: redirectUrl,
    }),
  });

  const tokenData = await tokenResponse.json();

  if (tokenData.error) {
    throw new Error(tokenData.error);
  }

  if (!tokenData.access_token) {
    throw new Error('No access token received');
  }

  // Get user info
  const user = await getUser(tokenData.access_token);

  // Save to storage
  await chrome.storage.local.set({
    accessToken: tokenData.access_token,
    user: user,
  });

  return { success: true, user };
}

async function getUser(token) {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to get user info');
  }

  return response.json();
}

function generateRandomState() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}
