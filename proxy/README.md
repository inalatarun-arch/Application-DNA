# Keep the Gemini key on a server (optional)

By default the app stores your key encrypted in the browser. If you want the key to never reach the browser, run this small proxy. It needs no terminal.

1. Sign in at dash.cloudflare.com, open **Workers & Pages**, choose **Create**, then **Create Worker**, name it, and click **Deploy**.
2. Click **Edit code**, replace everything with the contents of `worker.js`, and click **Deploy**.
3. Open the Worker's **Settings > Variables and Secrets** and add:
   - `GEMINI_API_KEY` (secret): your Google AI Studio key.
   - `PROXY_TOKEN` (secret): a long random string you make up.
   - `ALLOWED_ORIGINS` (text): the address your app is served from, for example `https://yourname.github.io`.
4. In the app, open **Settings > AI configuration > Keep the key off this device with a server proxy**, enter the Worker address and the same token, and save. Test the connection.

The proxy only forwards `/v1beta/` requests to Google, rejects other origins, and requires the token. Anyone who learns the token can use your key through the proxy, so treat it like a password and rotate it if it leaks.
