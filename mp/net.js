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

    // Remember the room across a page refresh.
    const LAST_ROOM = "mp-last-room";
    function rememberRoom(code) {
        try { localStorage.setItem(LAST_ROOM, code || ""); } catch (e) {}
    }
    function lastRoom() {
        try { return localStorage.getItem(LAST_ROOM) || null; } catch (e) { return null; }
    }
    function forgetRoom() { rememberRoom(""); }

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
                        yearMin: filters.yearMin || "",
                        yearMax: filters.yearMax || "",
                        geoLabel: filters.geoLabel || "All nations",
                        countries: filters.countries || "",
                        tableSize: extra.tableSize || 4,
                        seasonLength: extra.seasonLength || 3,
                        competition: 1,
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
                // Single atomic write of the whole room. The room-level
                // create rule grants this when the room does not yet exist
                // and you are naming yourself host. Writing the parent in
                // one go avoids cross-path rule lookups that cannot resolve
                // at creation time.
                return db.ref("rooms/" + code).set(room).then(function () {
                    trackPresence(code);
                    rememberRoom(code);
                    return code;
                }).catch(function (err) {
                    throw new Error("Could not create the room (" + (err.code || err.message) + "). "
                        + "If this says permission denied, re-publish database.rules.json in the "
                        + "Firebase console under Realtime Database, Rules.");
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
                return db.ref("rooms/" + code + "/members").get().then(function (memSnap) {
                    const members = memSnap.val() || {};
                    const already = Object.prototype.hasOwnProperty.call(members, uid);
                    // An existing member may always rejoin, including mid-draft
                    // after a refresh. Only new users are turned away once the
                    // draft has started, since seats and pick order are fixed.
                    if (!already && meta.status !== "lobby") {
                        throw new Error("That draft has already started.");
                    }
                    return db.ref("rooms/" + code + "/settings").get().then(function (setSnap) {
                        const s = setSnap.val() || {};
                        const humanSeats = s.tableSize ? (s.tableSize - (s.aiCount || 0)) : MAX_MEMBERS;
                        if (!already && Object.keys(members).length >= humanSeats) {
                            throw new Error("That room is full (" + humanSeats + " human seats).");
                        }
                        const now = firebase.database.ServerValue.TIMESTAMP;
                        const prev = already ? members[uid] : null;
                        // Rejoining keeps the identity already in the room, so a
                        // refresh cannot rename you or change your kit mid-draft.
                        return db.ref("rooms/" + code + "/members/" + uid).update({
                            name: prev ? prev.name : ((profile && profile.name) || "Player"),
                            kit: prev ? prev.kit : ((profile && profile.kit) || "#FFC24D"),
                            kit2: prev ? (prev.kit2 || "#16E0CD") : ((profile && profile.kit2) || "#16E0CD"),
                            connected: true,
                            joinedAt: prev ? prev.joinedAt : now
                        }).then(function () {
                            trackPresence(code);
                            rememberRoom(code);
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

    // ── Start the draft (host only) ────────────────────────
    // Writes the draft node and flips the room to "drafting". Once the
    // status leaves "lobby" the settings rule locks the settings block,
    // which is what fixes the season length for the duration.
    function startDraft(code) {
        return whenReady().then(function () {
            return db.ref("rooms/" + code).get().then(function (snap) {
                const room = snap.val();
                if (!room) throw new Error("That room no longer exists.");
                if (room.meta.hostUid !== uid) throw new Error("Only the host can start the draft.");
                if (room.meta.status !== "lobby") throw new Error("The draft has already started.");

                const members = room.members || {};
                const uids = Object.keys(members);
                if (uids.length < 2) throw new Error("You need at least two users to start.");

                const settings = room.settings || {};
                const competition = settings.competition || 1;
                const seed = MPDraft.newSeed();

                // First competition uses the lottery. Later ones use reverse
                // standings, so the bottom of the room tally picks first.
                let order;
                if (competition <= 1) {
                    order = MPDraft.lottery(uids, seed);
                } else {
                    order = MPDraft.reverseStandingsOrder(uids, room.tally || {}, (room.draft && room.draft.order) || uids);
                }

                const updates = {};
                updates["rooms/" + code + "/draft"] = {
                    seed: seed,
                    order: order,
                    pickIndex: 0,
                    currentPicker: order[0],
                    startedAt: firebase.database.ServerValue.TIMESTAMP,
                    competition: competition
                };
                updates["rooms/" + code + "/meta/status"] = "drafting";
                return db.ref().update(updates).then(function () { return order; });
            });
        });
    }

    // ── Make a pick (spec 8) ───────────────────────────────
    // One atomic fan-out: write the pick into its slot index, advance the
    // pick index, and hand the baton to the next user. The security rules
    // enforce all three independently, so a client cannot pick out of
    // turn, pick into an occupied index, or skip the queue.
    function makePick(code, slotId, poolIndex, order, pickIndex) {
        return whenReady().then(function () {
            const nextIndex = pickIndex + 1;
            const total = order.length * MPDraft.SQUAD_SIZE;
            const nextPicker = (nextIndex < total)
                ? MPDraft.pickerAt(order, nextIndex)
                : MPDraft.pickerAt(order, pickIndex);   // draft over: leave as is

            const base = "rooms/" + code + "/draft/";
            const updates = {};
            updates[base + "picks/" + pickIndex] = { by: uid, slot: slotId, i: poolIndex };
            updates[base + "pickIndex"] = nextIndex;
            updates[base + "currentPicker"] = nextPicker;
            return db.ref().update(updates).catch(function (err) {
                throw new Error("Pick rejected (" + (err.code || err.message) + "). "
                    + "Someone may have picked first, or it is not your turn.");
            });
        });
    }

    // ── Commit (spec 18) ───────────────────────────────────
    // One screen, two irreversible choices: your goal kicker and your
    // forwards/backs weighting, both locked before you see your fixtures.
    // The rules make this write-once, so it cannot be revised later.
    function submitCommit(code, kickerSlot, strategy) {
        return whenReady().then(function () {
            return db.ref("rooms/" + code + "/commit/" + uid).set({
                kickerSlot: kickerSlot,
                strategy: strategy,
                at: firebase.database.ServerValue.TIMESTAMP
            }).catch(function (err) {
                throw new Error("Could not save your choices ("
                    + (err.code || err.message) + "). They may already be locked in.");
            });
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
        startDraft: startDraft,
        makePick: makePick,
        submitCommit: submitCommit,
        rememberRoom: rememberRoom,
        lastRoom: lastRoom,
        forgetRoom: forgetRoom,
        joinRoom: joinRoom,
        watchRoom: watchRoom,
        leaveRoom: leaveRoom,
        closeRoom: closeRoom,
        MAX_MEMBERS: MAX_MEMBERS
    };
})();
