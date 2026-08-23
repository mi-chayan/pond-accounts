# How to publish a change

Whenever you change **anything** in this folder, do these two things together.
Skip step 1 and the investors keep seeing the old app.

## 1. Bump the build stamp

Open `version.json` and change the date and number:

```json
{ "build": "2026-08-20-02" }
```

Any new value works. It only has to be different from the last one.

## 2. Upload to GitHub

Upload the changed files. Cloudflare rebuilds on its own in about a minute.

## What happens on the investors' phones

| Situation | How fast they get it |
|---|---|
| App is open right now | within 20 seconds, it reloads itself |
| App is closed | the moment they open it |
| Phone is offline | the moment it reconnects |

Nobody uninstalls, nobody reinstalls, nobody clears anything.

## Sheet data

Separate from the app code, and always live.

- Every open app re-reads the sheet every 20 seconds
- Also the moment the app comes to the foreground
- Also the moment the phone comes back online
- Also on a pull-down at the top of the dashboard

So when Rafique saves an expense, everyone else sees it inside 20 seconds.

## Never upload

`Code.gs` holds the passcode. It belongs in Apps Script only, never in this
repo. This folder does not contain it, and it must stay that way.
