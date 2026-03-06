# PRism

A Chrome extension that shows your open GitHub Pull Requests and review requests directly from the browser toolbar.

## Features

- View your open PRs across all repositories or filter by repo
- See PRs awaiting your review
- Filter by specific repository or view "All Repositories"
- Repos grouped by owner with private repo indicators
- Click any PR to open it in a new tab
- GitHub OAuth authentication via a Cloudflare Worker proxy

## Architecture

The extension uses a [Cloudflare Worker](https://workers.cloudflare.com/) as an OAuth proxy to keep the GitHub OAuth app secret out of the extension bundle. The worker handles the authorization code exchange; the extension stores and uses the resulting access token directly against the GitHub API.

```
Extension <-> Cloudflare Worker <-> GitHub OAuth
Extension <-> GitHub API (direct, with access token)
```

## Setup

### 1. Create a GitHub OAuth App

1. Go to **GitHub > Settings > Developer settings > OAuth Apps > New OAuth App**
2. Fill in the fields:
   - **Application name**: PRism (or any name)
   - **Homepage URL**: your worker URL (set after step 2)
   - **Authorization callback URL**: `https://<your-worker>.workers.dev` (placeholder for now)
3. Save the **Client ID** and generate a **Client Secret**

### 2. Deploy the Cloudflare Worker

1. Sign up / log in at [workers.cloudflare.com](https://workers.cloudflare.com/)
2. Create a new Worker and paste the contents of `worker/github-oauth-worker.js`
3. Add the following **Environment Variables** (Settings > Variables):
   - `GITHUB_CLIENT_ID` — from step 1
   - `GITHUB_CLIENT_SECRET` — from step 1
4. Deploy and copy the worker URL (e.g. `https://your-worker.workers.dev`)

### 3. Update the Extension Config

Edit `config.js` and set your worker URL:

```js
const CONFIG = {
  WORKER_URL: "https://your-worker.workers.dev",
};
```

### 4. Update the GitHub OAuth App Callback URL

Back in your GitHub OAuth App settings, set the **Authorization callback URL** to the Chrome extension redirect URL. You can find it by running this in the browser console on any extension page:

```js
chrome.identity.getRedirectURL()
// e.g. https://<extension-id>.chromiumapp.org/
```

### 5. Load the Extension in Chrome

1. Go to `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select this project folder
4. The PRism icon will appear in your toolbar

## Usage

1. Click the PRism icon in the toolbar
2. Click **Sign in with GitHub** and authorize the app
3. Select a repository from the dropdown, or choose **All Repositories**
4. Switch between **My PRs** and **Review Requests** tabs

## Contributing

Contributions are welcome.

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Commit your changes: `git commit -m 'Add your feature'`
4. Push the branch: `git push origin feat/your-feature`
5. Open a Pull Request against `master`

Please keep PRs focused on a single change and include a clear description of what was changed and why.

## License

MIT — see [LICENSE](LICENSE)
