# Turn notifications: setup and deployment

This adds "it is your turn" push notifications, delivered by Firebase Cloud
Messaging (FCM) to the web app installed on a phone or open in a browser.

There are three one-time setup steps, then a deploy. Do them in order.

## 1. Generate the Web Push (VAPID) key

1. Firebase console, open your project.
2. Project settings (gear icon), then the **Cloud Messaging** tab.
3. Under **Web configuration** / **Web Push certificates**, click **Generate key pair**.
4. Copy the key string it shows.

Add it to your `firebase-config.js` (the same file that holds MP_FIREBASE_CONFIG),
as a new line:

```js
window.MP_VAPID_KEY = "PASTE_THE_KEY_HERE";
self.MP_VAPID_KEY = window.MP_VAPID_KEY; // so the service worker can read it too
```

Also make sure `firebase-config.js` sets the config on BOTH `window` and `self`,
because the service worker runs outside the page and reads `self`:

```js
window.MP_FIREBASE_CONFIG = { /* ...your config... */ };
self.MP_FIREBASE_CONFIG = window.MP_FIREBASE_CONFIG;
```

(The config must include `messagingSenderId` and `appId`. If yours does not,
copy the full config again from Project settings, General, your web app.)

## 2. Upload the web files

Upload these to the `mp/` folder of the production (and staging) repo, exactly
as with any other build:

- `manifest.json`
- `firebase-messaging-sw.js`  (MUST be at the mp/ root, same folder as index.html)
- `notify.js`
- `icons/` folder (replace the placeholder icons with real artwork when ready)
- the updated `index.html`, `lobby.js`, `lobby.css`, `help.js`

The service worker file name and location matter: it has to be reachable at
`https://www.rugbydraft.team/mp/firebase-messaging-sw.js`.

## 3. Deploy the Cloud Function

From the repo root on your machine (needs Node and the Firebase CLI:
`npm install -g firebase-tools`, then `firebase login`):

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

If this is the first function in the project, the CLI may ask to enable some
Google Cloud APIs; say yes. The project must be on the Blaze plan (it is).

## 4. Publish the database rules

`database.rules.json` now allows a signed-in user to write their own push
tokens under a room. Publish it from the Firebase console (Realtime Database,
Rules, paste, Publish) as usual, or `firebase deploy --only database`.

## How it works

- When someone installs the app and taps "Turn on notifications", the browser
  gives us an FCM token for that device. We store it under
  `rooms/<code>/pushTokens/<uid>/<key>`.
- The `onPlayerTurn` function watches `draft/currentPicker`. When it changes to
  a user, it sends that user's devices a push. `onNationTurn` does the same for
  the nation draft.
- AI seats have no tokens, so they are skipped. Dead tokens are cleaned up
  automatically when a send is rejected.

## Cost

FCM sending is free. The functions run about once per pick, far under the free
2 million invocations/month. Your Blaze spend cap on Cloud Functions is the
safety net. Realistic cost for normal play: nil.
