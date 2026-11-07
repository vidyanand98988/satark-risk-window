# Set up SATARK Risk Window once, then it runs itself

After this, nobody has to run anything. Every morning at 6:00 IST GitHub downloads the new satellite fires and weather, makes the forecast, checks yesterday's forecast, and updates the website.

You need: a GitHub account, the repo, and your free NASA FIRMS key.

## Already set up? Updating to a new version

1. Put the new files over the old ones (step 1 below, same way as before). For the two files in `.github/workflows`, open each one on github.com, click the pencil, select all, paste the new text, commit.
2. **Actions → Risk Window setup (run once) → Run workflow.** It only downloads what's new (this version adds Uttar Pradesh, Madhya Pradesh and Rajasthan, MODIS and wind direction), then retrains everything.

## 1. Put the files in the repo (5 minutes)

The zip has two folders: `.github` and `gis_prediction`. Both go in the top level of the repo.

**With git (easiest):**

```bash
git clone https://github.com/YOUR_NAME/YOUR_REPO.git
cd YOUR_REPO
unzip -o ~/Downloads/satark_risk_window.zip
git add .
git commit -m "SATARK Risk Window"
git push
```

**Without git (in the browser):**

1. Open the repo on github.com, then **Add file → Upload files**. Drag in the `gis_prediction` folder and commit.
2. The `.github` folder is hidden on most computers, so make its two files by hand: **Add file → Create new file**, type the name `.github/workflows/risk-window.yml`, paste in that file's text, commit. Do the same for `.github/workflows/risk-window-setup.yml`.

The repo needs to be **public** for the free website (GitHub Pages). Nothing secret is in these files.

## 2. Add the NASA key (1 minute)

**Settings → Secrets and variables → Actions → New repository secret**

- Name: `FIRMS_MAP_KEY`
- Secret: your FIRMS key (get one free at https://firms.modaps.eosdis.nasa.gov/api/map_key/)

## 3. Turn on the website (30 seconds)

**Settings → Pages → Build and deployment → Source: GitHub Actions**

## 4. Run the setup (1 click, then 2 to 4 hours of waiting)

**Actions** tab → **Risk Window setup (run once)** → **Run workflow**.

It downloads every past season for all five regions, tests every extra signal, trains the models, scores this season, and publishes the site. When it turns green, the link is in the "deploy" step: `https://YOUR_NAME.github.io/YOUR_REPO/`

The free weather service limits how much one person can download in a day. If the run hits that limit it saves what it got and stops. Nothing is lost: the daily run downloads a bit more each morning and trains each region as soon as its data is complete.

## What happens every day after that

| When | What |
|---|---|
| Every day, 6:00 IST | New VIIRS and MODIS fires, weather, Sentinel-2 signals (if set up), forecast for today, tomorrow and the day after, smoke paths, team plan, morning brief, yesterday's score, green villages, new website |
| Sundays, in season | Retrains and re-tests every extra signal, so only the ones that help are used |
| Off season | Shows the season replay and waits. Restarts by itself when each region's season begins (mid September in the north, late October in Purba Medinipur) |

## The expo screen (kiosk)

Open `https://YOUR_NAME.github.io/YOUR_REPO/#kiosk` and press F11 for full screen. It plays the 2025 season replay on a loop, and the **Ask SATARK** button stays in the corner. Set the DJI mic as the laptop's microphone in the system sound settings before you start.

## Optional extras

### Ask SATARK: the AI voice (about 15 minutes)

People tap **Ask SATARK** and talk, in Punjabi, Hindi, Bengali or English: "Sangrur kal?", "where is the smoke going?", "how accurate is this?". It answers out loud, using only the numbers on the page, and opens the village on the map.

It uses **Sarvam AI**, made in India for Indian languages: Saaras writes down what people say, Sarvam 105B works out the answer (it reads the forecast through the page's tools), and Bulbul speaks it, with its own Punjabi, Bengali, Hindi and English voices. It is paid per use. A small free Cloudflare Worker holds your Sarvam key, so the key never goes into the website.

**A. Sarvam key**

1. Go to https://dashboard.sarvam.ai and sign up. New accounts get ₹100 of free credit.
2. Add credit when you need it, and keep an eye on usage there.
3. **API keys**: create a key (it starts with `sk_`). Copy it. Never put it in the code, a file in this repo, a chat or a screenshot: the repo is public, and anyone with the key can spend your credit. Its only place is step B3.

**B. The voice server (Cloudflare Worker, free)**

1. Go to https://dash.cloudflare.com and sign up (free plan).
2. **Workers & Pages → Create**, and start from the "Hello World" Worker. Name it `satark-voice`, click **Deploy**, then **Edit code**. Delete everything in the editor, paste in the whole of `gis_prediction/risk_window/voice/worker.js`, and click **Deploy**. (If you already have the OpenAI Worker, just replace its code the same way.)
3. Open the Worker → **Settings → Variables and Secrets → Add**:
   - Type **Secret**, name `SARVAM_API_KEY`, value: your Sarvam key
   - Type **Text**, name `ALLOWED_ORIGINS`, value: `https://YOUR_NAME.github.io` (add your own domain too, separated by a comma, if you use one). Required: without it the Worker refuses everyone.
   - You can delete an old `OPENAI_API_KEY`; it isn't used any more.
4. Copy the Worker's address, like `https://satark-voice.YOUR_NAME.workers.dev`. Opening it in a browser should say "SATARK voice server (Sarvam) is running."

**C. Tell the website**

1. GitHub: **Settings → Secrets and variables → Actions → Variables tab → New repository variable**: name `SATARK_VOICE_URL`, value: the Worker address. (Already set if you used the OpenAI voice.)
2. **Actions → Risk Window daily → Run workflow**. When it's green, the **Ask SATARK** button appears on the site.

Good to know:

- It works on the website link in Chrome, Edge or Safari, on phones too. The browser asks for the microphone the first time.
- How a conversation goes: SATARK says hello, then listens. Talk, then pause: it sends your question by itself after about a second of quiet. Tap the circle to send early, to interrupt while it's speaking, or to talk again. **Pause** stops listening.
- Each answer takes a few seconds (writing down, thinking, speaking). It is turn by turn, like a walkie-talkie, not a phone call.
- Cost is roughly ₹1 to ₹2.5 per minute of talking (Sarvam's prices in November 2026: speech-to-text ₹0.49 a minute, Bulbul v4 Flash ₹1 per 1,000 characters, Sarvam 105B ₹15/₹60 per million tokens in/out).
- Each call ends after 3 minutes, and one device can make 300 requests an hour (about 75 questions). Your Sarvam credit balance is the real safety net.
- To change a voice, add a Worker variable `VOICES`, e.g. `{"pa-IN":"harpreet_pa_narration"}`, using names from Sarvam's Voices page. If a voice is refused, it falls back to the older Bulbul v3 voice by itself.
- The page says clearly that people are talking to an AI.

### Sentinel-2 harvest, burn scars and population (Google Earth Engine)

This adds three things: fields already cut but not cleared, fresh burn scars (which catch fires lit after the satellite pass), and how many people live in today's high-risk areas. Everything else works without it. The Earth Engine code (`harvest.py`) could not be tested from here, so watch the first run.

1. Go to https://console.cloud.google.com and create a project (for example `satark-risk`).
2. Register that project for Earth Engine at https://code.earthengine.google.com/register. It asks whether your use is noncommercial. Answer honestly: noncommercial and research use is free, commercial use is a paid plan.
3. In the project: **APIs & Services → Enable APIs** → turn on **Google Earth Engine API**. Skip the "Create credentials" button.
4. **IAM & Admin → Service accounts → Create service account** (name it `risk-window`). Give it two roles: **Earth Engine Resource Viewer** and **Service Usage Consumer**. No conditions.
5. Open the new account → **Keys → Add key → Create new key → JSON**. A file downloads.
6. In GitHub, add a secret `EE_SERVICE_ACCOUNT_KEY` and paste the whole file's text. Then delete the file.
7. Run **Risk Window setup (run once)** again. It reads every past season in one go. If you skip this, the daily run fills past seasons by itself, about 25 minutes' worth each morning, so it takes longer.

### Morning brief on Telegram

1. In Telegram, message **@BotFather**, send `/newbot`, and copy the token.
2. Add the bot to your team group and send any message in the group.
3. Open `https://api.telegram.org/botYOUR_TOKEN/getUpdates` and copy the `chat` → `id` number (group ids start with `-`).
4. Add secrets `TELEGRAM_TOKEN` and `TELEGRAM_CHAT`. For a different group per region, use `TELEGRAM_CHAT_PUNJAB_HARYANA`, `TELEGRAM_CHAT_PURBA_MEDINIPUR`, `TELEGRAM_CHAT_UTTAR_PRADESH`, `TELEGRAM_CHAT_MADHYA_PRADESH` or `TELEGRAM_CHAT_RAJASTHAN`.

### Your own web address

To use something like `risk.satark.co.in`:

1. At your domain provider, add a CNAME record: `risk` → `YOUR_NAME.github.io`.
2. **Settings → Pages → Custom domain**: `risk.satark.co.in`, then tick **Enforce HTTPS** when it appears.
3. **Settings → Secrets and variables → Actions → Variables → New variable**: `SATARK_SITE_URL` = `https://risk.satark.co.in/`.
4. If you use the voice, add `https://risk.satark.co.in` to the Worker's `ALLOWED_ORIGINS`.

## If something goes wrong

- **A red run in the Actions tab.** Click it to see which step failed. A NASA or weather site being down for a day is normal. The next morning's run catches up.
- **"Add the FIRMS_MAP_KEY secret first".** Step 2 was skipped or the name is misspelt.
- **A new state doesn't show up yet.** Its data is still downloading. It appears by itself once it's complete, usually within a day or two.
- **Ask SATARK says "could not connect" or "something went wrong".** Check the microphone permission, that `SATARK_VOICE_URL` is the Worker address, that `ALLOWED_ORIGINS` matches the site exactly, that `SARVAM_API_KEY` is set, and that your Sarvam account has credit. The message in brackets says which step failed (listening, thinking or speech).
- **The push step fails with "permission denied".** **Settings → Actions → General → Workflow permissions → Read and write permissions**, then re-run.
- **GitHub paused the daily workflow.** GitHub pauses scheduled runs in repos with no activity for 60 days. The robot commits every day, so this should not happen, but if it does: **Actions → Risk Window daily → Enable workflow**.
