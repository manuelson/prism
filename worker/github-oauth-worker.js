/**
 * GitHub OAuth Worker for Chrome Extension
 * Deploy this to Cloudflare Workers (free tier)
 *
 * Setup:
 * 1. Go to https://workers.cloudflare.com/
 * 2. Create account / Sign in
 * 3. Create a new Worker
 * 4. Paste this code
 * 5. Add environment variables:
 *    - GITHUB_CLIENT_ID: Your GitHub OAuth App Client ID
 *    - GITHUB_CLIENT_SECRET: Your GitHub OAuth App Client Secret
 * 6. Deploy and copy the worker URL
 */

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // Config endpoint (GET) - returns client_id for the extension
    if (url.pathname === '/config') {
      return jsonResponse({ client_id: env.GITHUB_CLIENT_ID }, 200, corsHeaders);
    }

    // Token exchange endpoint (POST)
    if (url.pathname === '/token') {
      if (request.method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);
      }

      try {
        const body = await request.json();
        const { code, redirect_uri } = body;

        if (!code) {
          return jsonResponse({ error: 'Missing code' }, 400, corsHeaders);
        }

        // Exchange code for token with GitHub
        const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            client_id: env.GITHUB_CLIENT_ID,
            client_secret: env.GITHUB_CLIENT_SECRET,
            code: code,
            redirect_uri: redirect_uri,
          }),
        });

        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
          return jsonResponse({ error: tokenData.error_description || tokenData.error }, 400, corsHeaders);
        }

        return jsonResponse({ access_token: tokenData.access_token }, 200, corsHeaders);

      } catch (error) {
        return jsonResponse({ error: 'Token exchange failed' }, 500, corsHeaders);
      }
    }

    return jsonResponse({ error: 'Not found' }, 404, corsHeaders);
  },
};

function jsonResponse(data, status, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}
