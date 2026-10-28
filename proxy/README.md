# Keep the Gemini key on a server (optional)

By default the app stores your key encrypted in the browser. If you want the key to never reach the browser, run this small proxy. It needs no terminal.

1. Sign in at dash.cloudflare.com, open **Workers & Pages**, choose **Create**, then **Create Worker**, name it, and click **Deploy**.
2. Click **Edit code**, replace everything with the contents of `worker.js`, and click **Deploy**.
3. Open the Worker's **Settings > Variables and Secrets** and add:
   - `GEMINI_API_KEY` (secret): your Google AI Studio key.
   - `PROXY_TOKEN` (secret, **required**): a long random string of at least 24 characters. The proxy refuses every request until this is set.
   - `ALLOWED_ORIGINS` (text): the address your app is served from, for example `https://yourname.github.io`. A `*` wildcard is ignored on purpose.
4. In the app, open **Settings > AI configuration > Keep the key off this device with a server proxy**, enter the Worker address and the same token, and save. Test the connection.

## What the proxy allows

It forwards only listing models, reading one model, `generateContent`, `streamGenerateContent` and `countTokens` under `/v1beta/models`. File upload, tuned models and deletes are refused. It requires the token on every request (compared in constant time), only answers the listed origins, drops any query parameter the app does not use, and refuses request bodies over 25 MB.

## Limits you should still set

The token is the only thing standing between the internet and your key, so treat it like a password and rotate it if it leaks. The Worker does not rate-limit by itself. In the Cloudflare dashboard open **Security > WAF > Rate limiting rules** for this Worker's address and add a rule, for example 60 requests per minute per IP, and set a spending or quota limit on the key in Google AI Studio.
