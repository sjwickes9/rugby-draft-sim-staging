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

    // The server sends a DATA-ONLY message (no `notification` payload) and we
    // show the notification here. This is deliberate: if the message also
    // carried a `notification` payload, the browser would auto-display it AND
    // this handler would show another, giving two notifications per event on
    // iOS, and on Chrome a data+notification message produces either a
    // duplicate or a generic "site updated" notice. Data-only + one
    // showNotification here yields exactly one notification on both iOS and
    // desktop Chrome.
    messaging.onBackgroundMessage(function (payload) {
        console.log("[sw] onBackgroundMessage fired", payload);
        const data = payload.data || {};
        const title = data.title || "Rugby XV Draft";
        const options = {
            body: data.body || "",
            icon: "assets/icons/icon-192.png",
            badge: "assets/icons/icon-192.png",
            tag: data.tag || "rugby-draft",
            renotify: true,
            data: { url: data.url || "./index.html" }
        };
        return self.registration.showNotification(title, options)
            .then(function () { console.log("[sw] showNotification resolved"); })
            .catch(function (e) { console.log("[sw] showNotification FAILED", e && e.message); });
    });

    // Also catch the raw push event directly. If FCM's onBackgroundMessage does
    // not fire on this platform but a push genuinely arrives, this will still
    // log it, telling us the message reached the SW even if the FCM wrapper did
    // not hand it over.
    self.addEventListener("push", function (event) {
        let body = "";
        try { body = event.data ? event.data.text() : "(no data)"; } catch (e) { body = "(unreadable)"; }
        console.log("[sw] raw push event received:", body);
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
