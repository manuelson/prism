// Extension Configuration
// Set these values after deploying your Cloudflare Worker

const CONFIG = {
  // Your Cloudflare Worker URL (e.g., https://github-oauth.your-name.workers.dev)
  WORKER_URL: "https://square-lake-f5fc.manuelsoon.workers.dev",
};

// Make it available globally
if (typeof window !== "undefined") {
  window.CONFIG = CONFIG;
}
if (typeof self !== "undefined") {
  self.CONFIG = CONFIG;
}
