// ============================================================
// FIREBASE CONFIG (no-build, compat SDK)
// ============================================================
// These are the same values from the Firebase console snippet. The
// console gives you bundler-style `import` lines, which need a build
// step. This site has no build step, so we load Firebase from its CDN
// with plain script tags (see lobby-test.html) and just expose the
// config object here for net.js to initialise.
//
// The apiKey is not a secret. It only identifies the project. Access is
// controlled entirely by the database security rules, so this file is
// safe to commit to the repo and safe to serve to clients.
// ============================================================

window.MP_FIREBASE_CONFIG = {
    apiKey: "AIzaSyBUarrg9aAmvOts2VadkQaqhD84zsQPBHY",
    authDomain: "rugby-draft-rwc.firebaseapp.com",
    databaseURL: "https://rugby-draft-rwc-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "rugby-draft-rwc",
    storageBucket: "rugby-draft-rwc.firebasestorage.app",
    messagingSenderId: "53116680658",
    appId: "1:53116680658:web:4909d713c1a3506bd9700b",
    measurementId: "G-LQR6YMMP80"
};

// A stamp recorded on each room so we can tell which data.js a room's
// pool snapshot came from. Bump this when you change player data.
window.MP_DATA_VERSION = window.MP_DATA_VERSION || "unset";
