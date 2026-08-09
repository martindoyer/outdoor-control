# Outdoor Patio Control

Spotify playback + Meross outdoor light control, on Netlify + Supabase.

## What this does

- Lists your Meross lights (from Meross's cloud, via the unofficial `meross-cloud` protocol) and lets you toggle/dim them.
- Embeds a real Spotify player (Web Playback SDK) so you control music from the same screen.
- Uses Supabase only to store your custom display names for each light. Netlify serverless functions call Meross — your Meross email/password never reach the browser.

## 1. Deploy to Netlify

1. Push this folder to a GitHub repo.
2. In Netlify: **Add new site → Import an existing project**, point it at the repo.
3. Build settings are already set in `netlify.toml` (publish `public/`, functions `netlify/functions/`). No build command needed.
4. In **Site settings → Environment variables**, add:
   - `MEROSS_EMAIL` — your Meross app login email
   - `MEROSS_PASSWORD` — your Meross app login password
5. Deploy. Note your site URL, e.g. `https://your-patio.netlify.app`.

## 2. Spotify

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) → **Create app**.
2. Redirect URI: your Netlify site URL with a trailing slash, e.g. `https://your-patio.netlify.app/`.
3. Copy the **Client ID**.
4. In the app, open **Settings (gear icon)** → paste the Client ID → **Save**.
5. Click **Connect Spotify**, log in, approve access. Playback requires a **Premium** account — Free accounts can't use in-browser playback (Spotify restriction, not this app).

No client secret is needed — this uses PKCE, safe to run entirely in the browser.

## 3. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open the **SQL editor**, paste and run `supabase/schema.sql`.
3. Go to **Project settings → API**, copy the **Project URL** and the **anon public key**.
4. In the app's Settings, paste both in the Supabase section → **Save**.

## 4. Meross

No developer account needed — just the email/password you use in the Meross app (set as Netlify env vars above). This talks to Meross's cloud, so your Netlify functions and your lights don't need to be on the same network.

**Caveat:** Meross doesn't publish or support this API. The `meross-cloud` package is a community reverse-engineering of it. It's widely used and stable in practice, but Meross could change it without notice — if lights stop responding after a Meross app update, check that package's GitHub issues first.

## Notes

- Device state polls on load / after each action — there's no live push update. Fine for a personal control panel; refresh via the gear icon's "Refresh device list" if a light was changed from the Meross app itself.
- Renaming a light in Settings only changes what's displayed here — it doesn't rename the device in the Meross app.
