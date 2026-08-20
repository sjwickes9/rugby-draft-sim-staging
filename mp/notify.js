/* Push notifications for the multiplayer app.
 *
 * What this does:
 *   - Works out what the user's device can do (iOS needs the app added to the
 *     home screen first; Android and desktop can subscribe straight away).
 *   - Presents a friendly explainer and an opt-in button.
 *   - On opt-in, registers the service worker, asks permission, gets a Firebase
 *     Cloud Messaging token, and stores it so the backend can notify this user.
 *
 * The actual sending is done server-side by a Cloud Function when it becomes a
 * user's turn. This file only handles the subscribing.
 *
 * Public API (window.MPNotify):
 *   supported()      -> is web push possible on this device at all
 *   state()          -> "unsupported" | "needs-install" | "ready" | "on" | "denied"
 *   enable()         -> Promise, runs the opt-in flow, resolves to a state
 *   saveTokenFor(uid, code) -> store this device's token against a user + room
 */
(function () {
    "use strict";

    let messaging = null;
    let currentToken = null;
    let swReg = null;

    // ── Device and capability detection ─────────────────────
    function isIos() {
        const ua = navigator.userAgent || "";
        const iOSDevice = /iPad|iPhone|iPod/.test(ua);
        // iPadOS 13+ reports as Mac; detect by touch points.
        const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
        return iOSDevice || iPadOS;
    }

    // True when the app is running as an installed home-screen app rather than
    // an ordinary browser tab. iOS push only works in this mode.
    function isStandalone() {
        return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches)
            || window.navigator.standalone === true;
    }

    function pushCapable() {
        return ("serviceWorker" in navigator) && ("PushManager" in window) && ("Notification" in window);
    }

    // The overall situation, which drives what we show the user.
    function state() {
        // iOS in a normal Safari tab cannot do push yet, and crucially it does
        // not even expose PushManager until the app is installed to the home
        // screen. So this case is checked BEFORE pushCapable(), otherwise an
        // iPhone user would be told "unsupported" and never see the steps that
        // tell them how to install it.
        if (isIos() && !isStandalone()) return "needs-install";
        if (!pushCapable()) return "unsupported";
        if (Notification.permission === "denied") return "denied";
        if (Notification.permission === "granted" && currentToken) return "on";
        return "ready";
    }

    // Whether to show the notifications card at all. True if the device can do
    // push now, OR it is an iOS device that could once installed (so we can
    // show it the install steps). Only genuinely incapable devices hide it.
    function supported() {
        return pushCapable() || isIos();
    }

    // ── Opt-in flow ─────────────────────────────────────────
    function ensureMessaging() {
        if (messaging) return messaging;
        if (typeof firebase === "undefined" || !firebase.messaging) return null;
        try { messaging = firebase.messaging(); } catch (e) { messaging = null; }
        return messaging;
    }

    function registerSW() {
        if (swReg) return Promise.resolve(swReg);
        return navigator.serviceWorker.register("firebase-messaging-sw.js")
            .then(function (reg) { swReg = reg; return reg; });
    }

    // Run the whole opt-in. Resolves to the new state, or rejects with a
    // friendly message.
    function enable() {
        if (!pushCapable()) {
            return Promise.reject(new Error("This device cannot show web notifications."));
        }
        if (isIos() && !isStandalone()) {
            return Promise.reject(new Error("needs-install"));
        }
        const m = ensureMessaging();
        if (!m) {
            return Promise.reject(new Error("Notifications are not set up yet. Please try again shortly."));
        }
        const vapid = window.MP_VAPID_KEY;
        if (!vapid) {
            return Promise.reject(new Error("Notifications are not configured on this site yet."));
        }
        return registerSW().then(function (reg) {
            return Notification.requestPermission().then(function (perm) {
                if (perm !== "granted") {
                    throw new Error(perm === "denied"
                        ? "Notifications are blocked. You can turn them on in your browser settings."
                        : "Notifications were not enabled.");
                }
                return m.getToken({ vapidKey: vapid, serviceWorkerRegistration: reg });
            });
        }).then(function (token) {
            if (!token) throw new Error("Could not get a notification token. Please try again.");
            currentToken = token;
            return "on";
        });
    }

    // ── Storing the subscription ────────────────────────────
    // The token is stored per user under the room, so the Cloud Function can
    // look up every device to notify when it becomes that user's turn. A user
    // may be on more than one device, so tokens are keyed by the token itself.
    function saveTokenFor(uid, code) {
        if (!currentToken || !uid || !code) return Promise.resolve(false);
        if (typeof firebase === "undefined" || !firebase.database) return Promise.resolve(false);
        // A short safe key derived from the token (Firebase keys cannot contain
        // . # $ [ ] / ). The full token is stored as the value.
        const key = currentToken.replace(/[.#$\[\]\/]/g, "_").slice(0, 120);
        const ref = firebase.database().ref("rooms/" + code + "/pushTokens/" + uid + "/" + key);
        return ref.set({
            token: currentToken,
            platform: isIos() ? "ios" : "web",
            at: firebase.database.ServerValue.TIMESTAMP
        }).then(function () { return true; }).catch(function () { return false; });
    }

    // If the user already granted permission on a previous visit, quietly
    // refresh the token so we can re-store it, without prompting again.
    function refreshQuietly() {
        if (!pushCapable() || Notification.permission !== "granted") return Promise.resolve(null);
        if (isIos() && !isStandalone()) return Promise.resolve(null);
        const m = ensureMessaging();
        const vapid = window.MP_VAPID_KEY;
        if (!m || !vapid) return Promise.resolve(null);
        return registerSW().then(function (reg) {
            return m.getToken({ vapidKey: vapid, serviceWorkerRegistration: reg });
        }).then(function (token) {
            if (token) currentToken = token;
            return token || null;
        }).catch(function () { return null; });
    }

    window.MPNotify = {
        supported: supported,
        state: state,
        isIos: isIos,
        isStandalone: isStandalone,
        enable: enable,
        saveTokenFor: saveTokenFor,
        refreshQuietly: refreshQuietly,
        hasToken: function () { return !!currentToken; }
    };
})();
