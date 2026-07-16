// ============================================================
// RUGBY XV DRAFT: MULTIPLAYER NETWORK LAYER
// Slice 3: Firebase init, anonymous auth, room model (spec 3, 4)
// ============================================================
// Uses the Firebase compat SDK (global `firebase`), loaded from the CDN
// with plain script tags, so there is no build step. Depends on:
//   - firebase-app-compat, firebase-auth-compat, firebase-database-compat
//   - window.MP_FIREBASE_CONFIG (firebase-config.js)
//   - MPEngine (engine.js) to build the eligible pool
//   - the global `allSquads` (data.js) for the pool snapshot
//
// Room schema (RTDB):
//   rooms/{CODE}/
//     meta/     { createdAt, hostUid, status, dataVersion }
//     settings/ { mode, yearMin, yearMax, geoLabel, countries[], rules{} }
//     members/{uid}/ { name, kit, connected, joinedAt }   (host = meta.hostUid)
//     pool/     [ {name,country,year,positions,rating,careerRating,kicker} ]
//     draft/    (added in a later slice)
//
// UK English. No em dashes or en dashes.
// ============================================================

window.MPNet = (function () {

    // Room codes: four characters, easy to read aloud. The alphabet omits
    // easily confused characters (0/O, 1/I) so a code read over the phone
    // is unambiguous.
    const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const CODE_LENGTH = 4;
    const MAX_MEMBERS = 8;

    let app = null;
    let auth = null;
    let db = null;
    let uid = null;
    let readyResolvers = [];

    // ── Init and auth ───────────────────────────────────────
    function init() {
        if (app) return whenReady();
        if (typeof firebase === "undefined") {
            return Promise.reject(new Error("Firebase SDK not loaded. Check the script tags."));
        }
        if (!window.MP_FIREBASE_CONFIG) {
            return Promise.reject(new Error("Missing MP_FIREBASE_CONFIG. Check firebase-config.js is loaded."));
        }
        app = firebase.initializeApp(window.MP_FIREBASE_CONFIG);
        auth = firebase.auth();
        db = firebase.database();

        auth.onAuthStateChanged(function (user) {
            if (user) {
                uid = user.uid;
                const rs = readyResolvers; readyResolvers = [];
                rs.forEach(function (r) { r(uid); });
            }
        });

        return auth.signInAnonymously()
            .catch(function (err) {
                throw new Error("Anonymous sign-in failed: " + err.message
                    + " (is the Anonymous provider enabled in Authentication?)");
            })
            .then(function () { return whenReady(); });
    }

    function whenReady() {
        if (uid) return Promise.resolve(uid);
        return new Promise(function (resolve) { readyResolvers.push(resolve); });
    }

    function currentUid() { return uid; }

    // ── Pool snapshot ───────────────────────────────────────
    // Build the eligible pool from the live data and freeze a copy for the
    // room. Stored as a plain array; a pick will later reference a pool
    // index, so the array order is the stable identity within a room.
    function buildSnapshot(filters) {
        if (typeof MPEngine === "undefined") throw new Error("MPEngine (engine.js) not loaded.");
        if (typeof allSquads === "undefined") throw new Error("allSquads (data.js) not loaded.");
        const pool = MPEngine.buildPool(allSquads, filters);
        // Normalise each entry to the exact fields we store, so the shape
        // is predictable on read.
        return pool.map(function (e) {
            return {
                name: e.name,
                country: e.country,
                year: e.year === null ? "" : e.year,   // RTDB cannot store null in an array slot
                positions: e.positions,
                rating: e.rating,
                careerRating: e.careerRating,
                kicker: !!e.kicker
            };
        });
    }

    // ── Room codes ──────────────────────────────────────────
    function randomCode() {
        let s = "";
        for (let i = 0; i < CODE_LENGTH; i++) {
            s += CODE_ALPHABET.charAt(Math.floor(Math.random() * CODE_ALPHABET.length));
        }
        return s;
    }

    function codeIsFree(code) {
        return db.ref("rooms/" + code + "/meta").get().then(function (snap) {
            return !snap.exists();
        });
    }

    function reserveCode(attempts) {
        attempts = attempts || 0;
        if (attempts >= 8) return Promise.reject(new Error("Could not find a free room code, try again."));
        const code = randomCode();
        return codeIsFree(code).then(function (free) {
            return free ? code : reserveCode(attempts + 1);
        });
    }

    // ── Create a room ───────────────────────────────────────
    // filters: { mode, yearMin, yearMax, countries, geoLabel }
    // host:    { name, kit }
    // rules:   { maxPerTournament, maxPerCountry, onePerTournament } (booleans)
    function createRoom(filters, host, rules, extra) {
        extra = extra || {};
        return whenReady().then(function () {
            const snapshot = buildSnapshot(filters);
            return reserveCode().then(function (code) {
                const now = firebase.database.ServerValue.TIMESTAMP;
                const room = {
                    meta: {
                        createdAt: now,
                        hostUid: uid,
                        status: "lobby",
                        dataVersion: window.MP_DATA_VERSION || "unset"
                    },
                    settings: {
                        mode: filters.mode || "tournament",
                        yearMin: filters.yearMin || null,
                        yearMax: filters.yearMax || null,
                        geoLabel: filters.geoLabel || "All nations",
                        countries: filters.countries || null,
                        tableSize: extra.tableSize || 4,
                        aiCount: extra.aiCount || 0,
                        rules: rules || { maxPerTournament: false, maxPerCountry: false, onePerTournament: false }
                    },
                    members: {},
                    pool: snapshot
                };
                room.members[uid] = {
                    name: (host && host.name) || "Host",
                    kit: (host && host.kit) || "#16E0CD",
                    kit2: (host && host.kit2) || "#FFC24D",
                    connected: true,
                    joinedAt: now
                };
                // Write the child paths in one fan-out update. A set() on the
                // parent rooms/{code} would be denied: write rules cascade
                // downward, so the granular child rules do not authorise a
                // write aimed at the parent. Addressing each child path
                // directly lets each land on its own rule.
                const base = "rooms/" + code + "/";
                const updates = {};
                updates[base + "meta"] = room.meta;
                updates[base + "settings"] = room.settings;
                updates[base + "pool"] = room.pool;
                updates[base + "members/" + uid] = room.members[uid];
                return db.ref().update(updates).then(function () {
                    trackPresence(code);
                    return code;
                });
            });
        });
    }

    // ── Join a room ─────────────────────────────────────────
    function joinRoom(code, profile) {
        code = (code || "").toUpperCase().trim();
        return whenReady().then(function () {
            return db.ref("rooms/" + code + "/meta").get().then(function (metaSnap) {
                if (!metaSnap.exists()) throw new Error("No room with code " + code + ".");
                const meta = metaSnap.val();
                if (meta.status !== "lobby") throw new Error("That draft has already started.");
                return db.ref("rooms/" + code + "/members").get().then(function (memSnap) {
                    const members = memSnap.val() || {};
                    const already = Object.prototype.hasOwnProperty.call(members, uid);
                    return db.ref("rooms/" + code + "/settings").get().then(function (setSnap) {
                        const s = setSnap.val() || {};
                        const humanSeats = s.tableSize ? (s.tableSize - (s.aiCount || 0)) : MAX_MEMBERS;
                        if (!already && Object.keys(members).length >= humanSeats) {
                            throw new Error("That room is full (" + humanSeats + " human seats).");
                        }
                        const now = firebase.database.ServerValue.TIMESTAMP;
                        return db.ref("rooms/" + code + "/members/" + uid).update({
                            name: (profile && profile.name) || "Player",
                            kit: (profile && profile.kit) || "#FFC24D",
                            kit2: (profile && profile.kit2) || "#16E0CD",
                            connected: true,
                            joinedAt: already ? members[uid].joinedAt : now
                        }).then(function () {
                            trackPresence(code);
                            return code;
                        });
                    });
                });
            });
        });
    }

    // ── Presence ────────────────────────────────────────────
    // Mark the member connected, and on disconnect flip the flag rather
    // than deleting them, so a reconnecting player resumes their seat.
    function trackPresence(code) {
        const meRef = db.ref("rooms/" + code + "/members/" + uid + "/connected");
        const connectedRef = db.ref(".info/connected");
        connectedRef.on("value", function (snap) {
            if (snap.val() === true) {
                meRef.onDisconnect().set(false);
                meRef.set(true);
            }
        });
    }

    // ── Watch a room ────────────────────────────────────────
    // cb receives the whole room object on every change. Returns an
    // unsubscribe function.
    function watchRoom(code, cb) {
        const ref = db.ref("rooms/" + code);
        const handler = ref.on("value", function (snap) { cb(snap.val()); });
        return function () { ref.off("value", handler); };
    }

    // ── Leave and close ─────────────────────────────────────
    // On a graceful leave, if the host departs and others remain, migrate
    // the host to the earliest-joined remaining member (spec 17). The host
    // is identified solely by meta/hostUid, so migration touches only that
    // and removes the leaver's own member node.
    function leaveRoom(code) {
        return whenReady().then(function () {
            return db.ref("rooms/" + code).get().then(function (snap) {
                const room = snap.val() || {};
                const members = room.members || {};
                const meta = room.meta || {};
                const leavingIsHost = meta.hostUid === uid;
                const updates = {};
                updates["rooms/" + code + "/members/" + uid] = null;

                if (leavingIsHost) {
                    const others = Object.keys(members).filter(function (k) { return k !== uid; });
                    if (others.length === 0) {
                        // Last person out closes the room.
                        return db.ref("rooms/" + code).remove();
                    }
                    others.sort(function (a, b) {
                        return (members[a].joinedAt || 0) - (members[b].joinedAt || 0);
                    });
                    updates["rooms/" + code + "/meta/hostUid"] = others[0];
                }
                return db.ref().update(updates);
            });
        });
    }

    function closeRoom(code) {
        return whenReady().then(function () {
            return db.ref("rooms/" + code).remove();
        });
    }

    return {
        init: init,
        whenReady: whenReady,
        currentUid: currentUid,
        createRoom: createRoom,
        joinRoom: joinRoom,
        watchRoom: watchRoom,
        leaveRoom: leaveRoom,
        closeRoom: closeRoom,
        MAX_MEMBERS: MAX_MEMBERS
    };
})();
