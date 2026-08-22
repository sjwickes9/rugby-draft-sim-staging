/* Firebase Cloud Messaging service worker.
 *
 * This runs in the background, separate from the page, so it can show a
 * notification even when the app is closed. It must live at the app scope
 * root (the /mp/ folder) and be named exactly firebase-messaging-sw.js.
 *
 * It reads the Firebase config from firebase-config.js, the same file the
 * page uses, so there is one place to keep the keys.
 */

importScripts("https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging-compat.js");
importScripts("firebase-config.js");

if (self.MP_FIREBASE_CONFIG) {
    firebase.initializeApp(self.MP_FIREBASE_CONFIG);
    const messaging = firebase.messaging();

    // IMPORTANT: we do NOT call showNotification here.
    //
    // The server sends a message that includes a `notification` payload (needed
    // for iOS web push to display reliably). When such a message arrives, the
    // browser/OS displays that notification itself. If we ALSO showed one from
    // onBackgroundMessage, the user would get two notifications per event, which
    // is exactly what happened on iOS. So we let the platform display the
    // notification payload and do nothing extra here.
    //
    // We keep a no-op handler registered so the SDK still wires up messaging,
    // but it must not create another notification.
    messaging.onBackgroundMessage(function () {
        // Intentionally empty: the notification payload is shown by the browser.
    });
}

// Tapping a notification focuses an open app window if there is one, or opens
// the app fresh. This lands the user straight back in their room.
self.addEventListener("notificationclick", function (event) {
    event.notification.close();
    const target = (event.notification.data && event.notification.data.url) || "./index.html";
    event.waitUntil(
        clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
            for (let i = 0; i < list.length; i++) {
                const c = list[i];
                if ("focus" in c) { c.focus(); return; }
            }
            if (clients.openWindow) return clients.openWindow(target);
        })
    );
});
