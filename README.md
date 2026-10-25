# Buzzer

A realtime buzzer app that works within LAN, without internet connection, for use with Quiz competitions.
Any smartphone can be used as the client.

Requires Node 22.12 or later.

```
npm install
node server.js
```

## Screen

- User Screen - http://localhost:3000
- Main Screen - http://localhost:3000/main
- Admin Screen - http://localhost:3000/admin

On start, the server prints the URL for each screen at `localhost` and at every LAN IPv4 address of the machine, so you can share the LAN URLs with players directly.

## Password

Set the admin password with the `ADMIN_PASSWORD` environment variable:

```
ADMIN_PASSWORD=your-password node server.js
```

If it isn't set, the server generates a random password on each start and prints it to the console.

## Features

- Works without internet access
- Admin approval for registations
- Announces the name of winner via TTS
- Remembers registration across page load
- Accidental reload protection

## Flow

- Users (client) registers their team by opening the User screen.
- Admin approves the teams from the admin screen.
- The main screen will be displayed using Projector / LED screen to display the results.
- Admin resets the buzzer before each question from the admin screen.

## Recommendation

- Run in local Wireless LAN (WiFi network) with static IP for the server machine.
- Distribute the WiFi network name, and server url as QR code for easy client setup.
- Place the mobile phone in **Do not disturb** (DND) mode, to prevent calls during competition.
- Ensure that mobile phone screen has the longest timeout to prevent the screen from locking during competition. The app asks the browser to keep the screen awake, but browsers only allow that over HTTPS or on localhost, so it won't work over a plain-HTTP LAN address.

## Testing

Server tests use [Vitest](https://vitest.dev). Each test starts its own server on a random port with a temporary state file, so your `appState.json` is never touched.

```
npm test               # run once
npm run test:watch     # re-run on change
npm run test:coverage  # with a coverage report in coverage/
```

End-to-end tests use [Playwright](https://playwright.dev) to drive the user, admin and main screens in Chromium. Install the browser once, then run them:

```
npx playwright install chromium
npm run test:e2e
```

Playwright starts the server on port 3100 with the admin password `e2e-pass` and a fresh state file for each run, so port 3100 must be free.

The `STATE_FILE` environment variable sets where the server keeps its state, which is `appState.json` by default.
