# TvHost

TvHost is a small GitHub Actions launcher for a TvCord JavaScript bot.

## How to use

1. Enable GitHub Actions for this repository.
2. Enable GitHub Pages from **Settings → Pages** using the `main` branch and `/(root)`.
3. Open the published website, enter this repository and a narrowly scoped GitHub token, paste your TvCord bot token, then write or import `bot.js`.
4. Press **Check repository**, then **Save & turn online**. The website commits `bot.js`, encrypts the TvCord token into the GitHub Actions secret `TVCORD_BOT_TOKEN`, and dispatches `.github/workflows/host-bot.yml`.

The browser never commits the TvCord token into a file. The GitHub access token stays in page memory only; still, only use a trusted device and revoke it after use.

## Important limits

GitHub Actions is CI, not a permanent bot-hosting service. This workflow is limited to 350 minutes and is cancelled when a newer run starts. A truly persistent 24/7 bot needs a long-running host. Imported code runs with the repository's workflow permissions, so only import code you trust.

The starter `bot.js` is a placeholder. Add the TvCord SDK file and any needed package/dependency setup to the workflow/repository for your bot's actual imports.
