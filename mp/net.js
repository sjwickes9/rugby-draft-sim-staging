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
                try { watchClock(); } catch (e) {}
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

    // Firebase publishes the difference between this device's clock and the
    // server's. The turn deadline is enforced server-side, so the countdown
    // must use server time or a device with a wrong clock would show the
    // wrong answer and try to take turns that have not expired.
    let clockSkew = 0;
    function watchClock() {
        db.ref(".info/serverTimeOffset").on("value", function (snap) {
            clockSkew = snap.val() || 0;
        });
    }
    function serverNow() { return Date.now() + clockSkew; }

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
                        hostIdleMs: extra.hostIdleMs || 86400000,
                        chemistry: extra.chemistry !== false,
                        gameType: extra.gameType || "custom",
                        rwcTournament: extra.rwcTournament || null,
                        rwcAssign: extra.rwcAssign || null,
                        rwcPool: extra.rwcPool || null,
                        turnMs: (extra.turnMs === 0 || extra.turnMs) ? extra.turnMs : 600000,
                        wholeDraftMs: extra.wholeDraftMs || null,
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
                    if (!already && meta.status !== "lobby" && meta.status !== "announced") {
                        throw new Error("That draft has already started.");
                    }
                    return db.ref("rooms/" + code + "/settings").get().then(function (setSnap) {
                        const s = setSnap.val() || {};
                        const humanSeats = s.tableSize ? (s.tableSize - (s.aiCount || 0)) : MAX_MEMBERS;
                        // Count humans only. AI seats live in members too, so
                        // counting every member wrongly reported the room full
                        // as soon as the AI sides were added.
                        const humansIn = Object.keys(members).filter(function (u) {
                            return !(members[u] && members[u].ai);
                        }).length;
                        if (!already && humansIn >= humanSeats) {
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
                            // Coming back through the door plainly undoes a
                            // graceful leave. The missed flag is left alone:
                            // it clears when they actually take a turn.
                            left: null,
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
        const seenRef = db.ref("rooms/" + code + "/members/" + uid + "/lastSeen");
        connectedRef.on("value", function (snap) {
            if (snap.val() === true) {
                meRef.onDisconnect().set(false);
                seenRef.onDisconnect().set(firebase.database.ServerValue.TIMESTAMP);
                meRef.set(true);
                seenRef.set(firebase.database.ServerValue.TIMESTAMP);
            }
        });
    }

    // ── Update settings between competitions (host only) ───
    // Allowed only while the room is back in lobby status. The security
    // rules keep the season length frozen once a competition is archived.
    function updateSettings(code, patch) {
        return whenReady().then(function () {
            const updates = {};
            Object.keys(patch).forEach(function (k) {
                updates["rooms/" + code + "/settings/" + k] = patch[k];
            });
            return db.ref().update(updates).catch(function (err) {
                throw new Error("Could not save the settings (" + (err.code || err.message) + ").");
            });
        });
    }

    // ── Start the draft (host only) ────────────────────────
    // Writes the draft node and flips the room to "drafting". Once the
    // status leaves "lobby" the settings rule locks the settings block,
    // which is what fixes the season length for the duration.
    // Build the World Cup nation assignment. Every user replaces one real
    // nation. Two methods are specified: the app assigns them (spread across
    // pools), or the users draft their nations in a random order. Only the
    // first is built here; the second arrives with the parallel-draft step,
    // so a room using it never reaches this point. The result is a flat
    // structure every client reads:
    //   { tournament, assign, pool, seed, seat: { uid: { nation, pool } } }
    function buildRwcAssignment(settings, uids, members, seed) {
        if (typeof MPRWC === "undefined") {
            return { error: "The World Cup engine failed to load. Reload and try again." };
        }
        const tournament = settings.rwcTournament || "2023";
        // Order humans by join time so the assignment is stable and the
        // draw's one-per-pool spread follows a predictable sequence.
        const humans = uids.filter(function (u) { return !(members[u] && members[u].ai); });
        humans.sort(function (a, b) {
            return ((members[a] || {}).joinedAt || 0) - ((members[b] || {}).joinedAt || 0);
        });
        if (humans.length < 2) {
            return { error: "A World Cup needs at least two users." };
        }

        const assign = settings.rwcAssign || "app";
        if (assign !== "app") {
            // The users-draft-nations method is not built yet. A room should
            // never have been allowed to start with it, so this is a guard.
            return { error: "That way of assigning nations is not available yet." };
        }

        // The app assigns. drawReplacements spreads users one per pool while
        // pools last, then at random, so a big group is not stacked together.
        // When the host has restricted the pool to a set of nations, only
        // those may be assigned.
        const allowed = (settings.countries && settings.countries.length)
            ? settings.countries : null;
        const rng = MPDraft.makeRng(seed);
        const draw = MPRWC.drawReplacements(tournament, humans.length, rng, null, allowed);
        if (!draw || draw.length < humans.length) {
            const cap = MPRWC.maxReplacements(tournament, null, allowed);
            return { error: "Only " + cap + " of the chosen nations are in this World Cup, "
                + "so it cannot seat " + humans.length + " users. Choose more nations or fewer users." };
        }
        const seat = {};
        humans.forEach(function (u, i) {
            seat[u] = { nation: draw[i].nation, pool: draw[i].pool };
        });

        return {
            tournament: tournament,
            assign: assign,
            pool: settings.rwcPool || "whole",
            seed: seed,
            seat: seat
        };
    }

    // Within-nation parallel draft. Each user drafts only from their own
    // allocated nation, across all years. Because no two users share a nation,
    // the pools never overlap and there is nothing to serialise, so everyone
    // drafts at the same time against one shared deadline. The draft node has
    // no currentPicker or per-pick clock: instead a per-user pool and a
    // per-user pick map, plus a whole-draft deadline.
    // A pick in a parallel draft. The user writes into their own subtree, so
    // there is no turn gate and no contention: each user's picks are theirs
    // alone. slotId is the squad slot, poolIndex indexes that user's pool.
    // Once the whole-draft deadline passes, the host submits any users who
    // have not finished, using whatever XV they have drafted so far. A partial
    // side is legal to store; the engine rates it from the players present.
    function sweepParallelDeadline(code) {
        return whenReady().then(function () {
            return db.ref("rooms/" + code + "/draft").get().then(function (snap) {
                const d = snap.val();
                if (!d || !d.parallel) return;
                if (!d.deadline || serverNow() <= d.deadline) return;
                const order = d.order || [];
                const done = d.done || {};
                const updates = {};
                order.forEach(function (u) {
                    if (!done[u]) updates["rooms/" + code + "/draft/done/" + u] = true;
                });
                if (!Object.keys(updates).length) return;
                return db.ref().update(updates).catch(function () { /* best effort */ });
            });
        });
    }

    function makeParallelPick(code, slotId, poolIndex) {
        return whenReady().then(function () {
            const base = "rooms/" + code + "/draft/ppicks/" + uid + "/";
            const updates = {};
            updates[base + slotId] = poolIndex;
            return db.ref().update(updates).catch(function (err) {
                if ((err.code || "").indexOf("permission") !== -1) {
                    throw new Error("That pick could not be saved. The draft may have ended.");
                }
                throw new Error("Could not make that pick (" + (err.code || err.message) + ").");
            });
        });
    }

    // Remove a pick in a parallel draft (deselect a slot).
    function clearParallelPick(code, slotId) {
        return whenReady().then(function () {
            return db.ref("rooms/" + code + "/draft/ppicks/" + uid + "/" + slotId).remove()
                .catch(function (err) {
                    throw new Error("Could not clear that pick (" + (err.code || err.message) + ").");
                });
        });
    }

    // Mark this user's XV as complete in a parallel draft.
    function finishParallelUser(code) {
        return whenReady().then(function () {
            return db.ref("rooms/" + code + "/draft/done/" + uid).set(true)
                .catch(function (err) {
                    throw new Error("Could not submit your team (" + (err.code || err.message) + ").");
                });
        });
    }

    // ── Nation draft (users draft their nations) ────────────
    // Before any player draft, users pick the nation they represent, in a
    // random order, one each. For the whole pool this becomes round one of the
    // snake, so the pick order here is what the player draft snakes back from.
    // For only-your-nation it simply fixes each user's nation, then the
    // parallel draft runs. A per-pick clock mirrors the snake draft.
    function startNationDraft(code, room, uids, members, settings, competition, seed) {
        if (typeof MPRWC === "undefined") {
            return Promise.reject(new Error("The World Cup engine failed to load."));
        }
        const humans = uids.filter(function (u) { return !(members[u] && members[u].ai); });
        if (humans.length < 2) {
            return Promise.reject(new Error("A World Cup needs at least two users."));
        }
        const tournament = settings.rwcTournament || "2023";

        // The nations a user may pick: the tournament's nations, limited to the
        // host's chosen set if one was set.
        let nations = MPRWC.nationsIn(tournament);
        if (settings.countries && settings.countries.length) {
            const allow = {};
            settings.countries.forEach(function (n) { allow[n] = true; });
            nations = nations.filter(function (n) { return allow[n]; });
        }
        if (nations.length < humans.length) {
            return Promise.reject(new Error("There are only " + nations.length
                + " nations to choose from, too few for " + humans.length + " users."));
        }

        // Random pick order.
        const order = MPDraft.lottery(humans, seed);

        const perPick = settings.turnMs || 0;
        const updates = {};
        updates["rooms/" + code + "/nationDraft"] = {
            order: order,
            nations: nations,
            picks: {},                 // uid -> nation
            pickIndex: 0,
            competition: competition,
            seed: seed,
            perPick: perPick,          // per-pick clock, read by the pick transaction
            startedAt: firebase.database.ServerValue.TIMESTAMP,
            deadline: perPick ? (serverNow() + perPick) : 0
        };
        updates["rooms/" + code + "/meta/status"] = "nationdraft";
        updates["rooms/" + code + "/comp"] = null;
        return db.ref().update(updates).catch(function (err) {
            throw new Error("Could not start the nation draft (" + (err.code || err.message) + ").");
        });
    }

    // A user picks their nation. Only the user on the clock may pick, and only
    // a nation nobody has taken.
    function pickNation(code, nation) {
        return whenReady().then(function () {
            const ref = db.ref("rooms/" + code + "/nationDraft");
            return ref.transaction(function (nd) {
                if (!nd) return nd;
                const order = nd.order || [];
                const picker = order[nd.pickIndex || 0];
                if (picker !== uid) return; // not your turn, abort
                const taken = nd.picks || {};
                // Already taken by someone?
                const clash = Object.keys(taken).some(function (u) { return taken[u] === nation; });
                if (clash) return;
                if ((nd.nations || []).indexOf(nation) === -1) return;
                taken[uid] = nation;
                nd.picks = taken;
                nd.pickIndex = (nd.pickIndex || 0) + 1;
                const perPick = nd.perPick || 0;
                nd.deadline = perPick ? (serverNow() + perPick) : 0;
                return nd;
            }).then(function (res) {
                return true;
            }).catch(function (err) {
                throw new Error("Could not pick that nation (" + (err.code || err.message) + ").");
            });
        });
    }

    // The host auto-picks for a user who lets the clock run out, taking a
    // random free nation so the draft never stalls.
    function sweepNationDeadline(code) {
        return whenReady().then(function () {
            return db.ref("rooms/" + code + "/nationDraft").transaction(function (nd) {
                if (!nd || !nd.deadline) return nd;
                if (serverNow() <= nd.deadline) return nd;
                const order = nd.order || [];
                if ((nd.pickIndex || 0) >= order.length) return nd;
                const taken = nd.picks || {};
                const used = {};
                Object.keys(taken).forEach(function (u) { used[taken[u]] = true; });
                const free = (nd.nations || []).filter(function (n) { return !used[n]; });
                if (!free.length) return nd;
                const picker = order[nd.pickIndex || 0];
                // A stable pseudo-random choice from the seed and index.
                const rng = MPDraft.makeRng((nd.seed || 1) + (nd.pickIndex || 0) * 101);
                taken[picker] = free[Math.floor(rng() * free.length)];
                nd.picks = taken;
                nd.pickIndex = (nd.pickIndex || 0) + 1;
                const perPick = nd.perPick || 0;
                nd.deadline = perPick ? (serverNow() + perPick) : 0;
                return nd;
            });
        });
    }

    // Once every user has a nation, build the assignment and start the player
    // draft: parallel for only-your-nation, snake for the whole pool. The snake
    // order is the reverse of the nation-pick order, so the first nation picker
    // gets the last pick of the first player round.
    // The host starts the player draft once every nation is chosen. This is an
    // explicit action (a button), so the transition fires exactly once and only
    // when the host is ready, rather than racing off whoever made the last pick.
    function startPlayerDraftFromNations(code) {
        return whenReady().then(function () {
            return db.ref("rooms/" + code).get().then(function (snap) {
                const room = snap.val();
                if (!room) throw new Error("That room no longer exists.");
                if ((room.meta || {}).status !== "nationdraft") return;
                if ((room.meta || {}).hostUid !== uid) throw new Error("Only the host can start the draft.");
                const nd = room.nationDraft || {};
                const order = nd.order || [];
                const picks = nd.picks || {};
                if (order.length === 0 || !order.every(function (u) { return picks[u]; })) {
                    throw new Error("Every user needs to pick a nation first.");
                }

                const settings = room.settings || {};
                const members = room.members || {};
                const uids = Object.keys(members);
                const competition = settings.competition || 1;
                const seed = nd.seed || MPDraft.newSeed();
                const tournament = settings.rwcTournament || "2023";

                const seat = {};
                order.forEach(function (u) {
                    seat[u] = { nation: picks[u], pool: MPRWC.poolOfNation(tournament, picks[u]) };
                });
                const rwcNode = {
                    tournament: tournament, assign: "userdraft",
                    pool: settings.rwcPool || "whole", seed: seed, seat: seat
                };

                if (settings.rwcPool === "nation") {
                    return startParallelDraft(code, room, uids, members, settings,
                        competition, seed, rwcNode);
                }
                // Whole pool: the player draft snakes back from the nation order,
                // so the first nation picker drafts last in the opening round.
                const playerOrder = order.slice().reverse();
                return startSnakeFromNations(code, room, uids, members, settings,
                    competition, seed, rwcNode, playerOrder);
            });
        });
    }

    // Start the snake player draft using a fixed opening order (the reverse of
    // the nation-pick order), so the nation round and the player draft form one
    // continuous snake. Mirrors the normal draft node.
    function startSnakeFromNations(code, room, uids, members, settings, competition, seed, rwcNode, playerOrder) {
        const filters = {
            mode: settings.mode || "tournament",
            yearMin: settings.yearMin || undefined,
            yearMax: settings.yearMax || undefined,
            countries: settings.countries || null
        };
        let freshPool = null;
        try { freshPool = MPEngine.buildPool(allSquads, filters); } catch (e) {}

        const updates = {};
        updates["rooms/" + code + "/draft"] = {
            seed: seed,
            order: playerOrder,
            pickIndex: 0,
            currentPicker: playerOrder[0],
            startedAt: firebase.database.ServerValue.TIMESTAMP,
            turnStartedAt: firebase.database.ServerValue.TIMESTAMP,
            turnDeadline: (function () {
                const t = settings.turnMs || 0;
                if (!t) return 0;
                const q = ((room.quiet || {})[playerOrder[0]]) || null;
                return MPDraft.deadlineFrom(serverNow(), t, q);
            })(),
            competition: competition
        };
        if (freshPool && freshPool.length) updates["rooms/" + code + "/pool"] = freshPool;
        if (rwcNode) updates["rooms/" + code + "/rwc"] = rwcNode;
        updates["rooms/" + code + "/nationDraft"] = null;
        updates["rooms/" + code + "/comp"] = null;
        updates["rooms/" + code + "/ready"] = null;
        updates["rooms/" + code + "/entered"] = null;
        updates["rooms/" + code + "/meta/announcedAt"] = null;
        updates["rooms/" + code + "/meta/status"] = "drafting";
        return db.ref().update(updates).then(function () { return playerOrder; });
    }

    function startParallelDraft(code, room, uids, members, settings, competition, seed, rwcNode) {
        if (!rwcNode || !rwcNode.seat) {
            return Promise.reject(new Error("The nations have not been assigned."));
        }
        // Only humans draft; there are no AI sides in a World Cup.
        const humans = uids.filter(function (u) { return !(members[u] && members[u].ai); });

        // Build each user's nation pool: their nation, every year, using the
        // room's rating mode. Store per user so each client reads only theirs.
        const pools = {};
        const baseFilters = {
            mode: settings.mode || "tournament",
            yearMin: undefined, yearMax: undefined
        };
        for (let i = 0; i < humans.length; i++) {
            const u = humans[i];
            const nation = (rwcNode.seat[u] || {}).nation;
            if (!nation) return Promise.reject(new Error("A user has no nation assigned."));
            let pool = null;
            try {
                pool = MPEngine.buildPool(allSquads, {
                    mode: baseFilters.mode, countries: [nation]
                });
            } catch (e) {}
            if (!pool || pool.length < MPDraft.SQUAD_SIZE) {
                return Promise.reject(new Error(nation + " does not have enough players to field an XV."));
            }
            pools[u] = pool;
        }

        // One whole-draft deadline. The host sets it; default thirty minutes.
        const wholeMs = settings.wholeDraftMs || (30 * 60 * 1000);
        const deadline = serverNow() + wholeMs;

        const updates = {};
        updates["rooms/" + code + "/draft"] = {
            parallel: true,
            seed: seed,
            order: humans,          // used only for iteration, not turn order
            competition: competition,
            startedAt: firebase.database.ServerValue.TIMESTAMP,
            deadline: deadline,
            pools: pools,           // uid -> [player, ...]
            ppicks: {},             // uid -> { slotId: poolIndex }
            done: {}                // uid -> true when their XV is complete
        };
        updates["rooms/" + code + "/meta/status"] = "drafting";
        if (rwcNode && !room.rwc) updates["rooms/" + code + "/rwc"] = rwcNode;
        // Clear any stale competition result from a previous game.
        updates["rooms/" + code + "/comp"] = null;
        updates["rooms/" + code + "/nationDraft"] = null;

        return db.ref().update(updates).catch(function (err) {
            throw new Error("Could not start the draft (" + (err.code || err.message) + ").");
        });
    }

    function startDraft(code) {
        return whenReady().then(function () {
            return db.ref("rooms/" + code).get().then(function (snap) {
                const room = snap.val();
                if (!room) throw new Error("That room no longer exists.");
                if (room.meta.hostUid !== uid) throw new Error("Only the host can start the draft.");
                // 'announced' means the settings are fixed and people are
                // entering. That is precisely when the draft should start.
                if (room.meta.status !== "lobby" && room.meta.status !== "announced") {
                    throw new Error("The draft has already started.");
                }

                const members = room.members || {};
                const uids = Object.keys(members);
                if (uids.length < 2) throw new Error("You need at least two users to start.");

                const settings = room.settings || {};
                const competition = settings.competition || 1;
                const seed = MPDraft.newSeed();

                // World Cup mode: each user replaces one real nation. The
                // assignment is decided once, here, and stored so every
                // client agrees. It is only built if it does not already
                // exist, so a restarted draft keeps the same nations.
                let rwcNode = room.rwc || null;

                // Users-draft-nations: before any player draft, the users pick
                // the nation they represent, in a random order, on their own
                // screen. Only once every nation is chosen does the player
                // draft begin. If that phase has not run yet, start it now.
                if (settings.gameType === "worldcup" && settings.rwcAssign === "userdraft" && !rwcNode) {
                    return startNationDraft(code, room, uids, members, settings, competition, seed);
                }

                if (settings.gameType === "worldcup" && !rwcNode) {
                    rwcNode = buildRwcAssignment(settings, uids, members, seed);
                    if (rwcNode.error) throw new Error(rwcNode.error);
                }

                // Within-nation World Cup: each user drafts only from their
                // allocated nation, all years. The pools do not overlap, so
                // the draft runs in parallel with one shared deadline rather
                // than a snake order. This is a distinct flow.
                if (settings.gameType === "worldcup" && settings.rwcPool === "nation") {
                    return startParallelDraft(code, room, uids, members, settings,
                        competition, seed, rwcNode);
                }

                // Re-snapshot the pool, so any settings the host changed
                // between competitions take effect and every user drafts
                // from the same frozen list.
                const filters = {
                    mode: settings.mode || "tournament",
                    yearMin: settings.yearMin || undefined,
                    yearMax: settings.yearMax || undefined,
                    countries: settings.countries || null
                };
                let freshPool = null;
                try { freshPool = MPEngine.buildPool(allSquads, filters); } catch (e) {}

                // First competition uses the lottery. Later ones use reverse
                // standings, so the bottom of the room tally picks first.
                let order;
                if (competition <= 1) {
                    order = MPDraft.lottery(uids, seed);
                } else {
                    // The tally holds objects, so flatten to a single score
                    // first: titles dominate, points break ties.
                    order = MPDraft.reverseStandingsOrder(uids, tallyPoints(room.tally),
                        (room.draft && room.draft.order) || uids);
                }

                const updates = {};
                updates["rooms/" + code + "/draft"] = {
                    seed: seed,
                    order: order,
                    pickIndex: 0,
                    currentPicker: order[0],
                    startedAt: firebase.database.ServerValue.TIMESTAMP,
                    turnStartedAt: firebase.database.ServerValue.TIMESTAMP,
                    turnDeadline: (function () {
                        const t = settings.turnMs || 0;
                        if (!t) return 0;
                        const q = ((room.quiet || {})[order[0]]) || null;
                        return MPDraft.deadlineFrom(serverNow(), t, q);
                    })(),
                    competition: competition
                };
                if (freshPool && freshPool.length) {
                    updates["rooms/" + code + "/pool"] = freshPool;
                }
                if (rwcNode) {
                    updates["rooms/" + code + "/rwc"] = rwcNode;
                }
                updates["rooms/" + code + "/comp"] = null;
                updates["rooms/" + code + "/ready"] = null;
                updates["rooms/" + code + "/entered"] = null;
                updates["rooms/" + code + "/meta/announcedAt"] = null;
                updates["rooms/" + code + "/meta/status"] = "drafting";
                return db.ref().update(updates).then(function () { return order; });
            });
        });
    }

    // ── AI seats ───────────────────────────────────────────
    // An AI has no client, so the host creates its member node and later
    // writes its picks. The seat is otherwise an ordinary member.
    function addAiSeats(code, seats) {
        return whenReady().then(function () {
            const updates = {};
            (seats || []).forEach(function (s) {
                updates["rooms/" + code + "/members/" + s.uid] = {
                    name: s.name,
                    kit: s.kit || "#8899AA",
                    joinedAt: firebase.database.ServerValue.TIMESTAMP,
                    ai: { traits: s.traits, seed: s.seed }
                };
                updates["rooms/" + code + "/entered/" + s.uid] = true;
                updates["rooms/" + code + "/ready/" + s.uid] = true;
            });
            if (!Object.keys(updates).length) return null;
            return db.ref().update(updates).catch(function (err) {
                throw new Error("Could not add the AI sides ("
                    + (err.code || err.message) + ").");
            });
        });
    }

    // Cover a human's seat with an AI stand-in. The seat still belongs to
    // the person: their name and kit stay, and a marker shows an AI is
    // playing it. Reversible, so they reclaim it on return.
    // Flag that a seat missed a pick. Any client may set this when it
    // resolves an expired turn, so the host can later offer AI cover. The
    // flag is harmless if set more than once.
    function markMissed(code, forUid) {
        return whenReady().then(function () {
            return db.ref("rooms/" + code + "/members/" + forUid + "/missed")
                .set(firebase.database.ServerValue.TIMESTAMP).catch(function () {});
        });
    }

    // Clear my own missed flag, on returning to take a turn.
    function clearMissed(code) {
        return whenReady().then(function () {
            return db.ref("rooms/" + code + "/members/" + uid + "/missed")
                .remove().catch(function () {});
        });
    }

    function coverWithAi(code, forUid, traits, seed) {
        return whenReady().then(function () {
            const updates = {};
            updates["rooms/" + code + "/members/" + forUid + "/cover"] = {
                by: "ai", traits: traits, seed: seed,
                at: firebase.database.ServerValue.TIMESTAMP
            };
            // The miss has been dealt with, so clear the flag.
            updates["rooms/" + code + "/members/" + forUid + "/missed"] = null;
            // A covered seat is treated as entered and ready, so it never
            // holds the room up the way an absent human would.
            updates["rooms/" + code + "/entered/" + forUid] = true;
            updates["rooms/" + code + "/ready/" + forUid] = true;
            return db.ref().update(updates).catch(function (err) {
                throw new Error("Could not assign an AI (" + (err.code || err.message) + ").");
            });
        });
    }

    // The human reclaims their own seat between competitions.
    function reclaimSeat(code) {
        return whenReady().then(function () {
            return db.ref("rooms/" + code + "/members/" + uid + "/cover").remove()
                .catch(function (err) {
                    throw new Error("Could not resume (" + (err.code || err.message) + ").");
                });
        });
    }

    function removeAiSeats(code, uids) {
        return whenReady().then(function () {
            const updates = {};
            (uids || []).forEach(function (u) {
                updates["rooms/" + code + "/members/" + u] = null;
                updates["rooms/" + code + "/entered/" + u] = null;
                updates["rooms/" + code + "/ready/" + u] = null;
            });
            if (!Object.keys(updates).length) return null;
            return db.ref().update(updates);
        });
    }

    // ── Quiet hours ────────────────────────────────────────
    // Personal to each user, and stored on the room because whichever
    // client resolves an expired turn needs to know the picker's schedule.
    function saveQuiet(code, q) {
        return whenReady().then(function () {
            return db.ref("rooms/" + code + "/quiet/" + uid).set(q);
        });
    }

    // ── Host takeover ──────────────────────────────────────
    // A host who disappears would otherwise freeze the room, since only
    // they can play fixtures or set up the next competition.
    function touchHost(code) {
        return whenReady().then(function () {
            return db.ref("rooms/" + code + "/meta/hostSeenAt")
                .set(firebase.database.ServerValue.TIMESTAMP);
        }).catch(function () {});
    }

    function claimHost(code) {
        return whenReady().then(function () {
            const updates = {};
            updates["rooms/" + code + "/meta/hostUid"] = uid;
            updates["rooms/" + code + "/meta/hostSeenAt"] = firebase.database.ServerValue.TIMESTAMP;
            return db.ref().update(updates).catch(function (err) {
                throw new Error("Could not take over as host ("
                    + (err.code || err.message) + "). The host may have just been active.");
            });
        });
    }

    // ── Draft entry ────────────────────────────────────────
    // A user confirms they are in before the draft begins. The host can
    // force an entry for anyone who has stopped responding, so one absent
    // person cannot hold a room up indefinitely.
    function enterDraft(code, forUid) {
        return whenReady().then(function () {
            return db.ref("rooms/" + code + "/entered/" + (forUid || uid)).set(true)
                .catch(function (err) {
                    throw new Error("Could not enter the draft (" + (err.code || err.message)
                        + "). If this says permission denied, the security rules need "
                        + "republishing from the Firebase console.");
                });
        });
    }

    // Announce the next competition: settings are fixed, users are invited
    // in, and the clock that governs forcing starts here.
    function announceNext(code, patch) {
        return whenReady().then(function () {
            const updates = {};
            Object.keys(patch || {}).forEach(function (k) {
                updates["rooms/" + code + "/settings/" + k] = patch[k];
            });
            updates["rooms/" + code + "/entered"] = null;
            updates["rooms/" + code + "/meta/announcedAt"] = firebase.database.ServerValue.TIMESTAMP;
            updates["rooms/" + code + "/meta/status"] = "announced";
            return db.ref().update(updates).catch(function (err) {
                throw new Error("Could not set up the next competition ("
                    + (err.code || err.message) + ").");
            });
        });
    }

    // The host may lock in a kicker and strategy for a user who has gone
    // quiet, so the room cannot stall on the commitment screen either.
    function forceCommit(code, forUid, kickerSlot, strategy) {
        return whenReady().then(function () {
            return db.ref("rooms/" + code + "/commit/" + forUid).set({
                kickerSlot: kickerSlot, strategy: strategy, forced: true,
                at: firebase.database.ServerValue.TIMESTAMP
            });
        });
    }

    // ── Readiness between competitions ─────────────────────
    // Nobody is moved off the results screen by someone else's click. Each
    // user says when they have finished looking, and the next draft only
    // begins once everyone has.
    // The host marks an AI side ready, since it has no client to do so.
    function setReadyFor(code, forUid) {
        return whenReady().then(function () {
            return db.ref("rooms/" + code + "/ready/" + forUid).set(true).catch(function () {});
        });
    }

    function setReady(code, value) {
        return whenReady().then(function () {
            return db.ref("rooms/" + code + "/ready/" + uid).set(!!value)
                .catch(function (err) {
                    throw new Error("Could not mark you ready (" + (err.code || err.message)
                        + "). If this says permission denied, the security rules need "
                        + "republishing from the Firebase console.");
                });
        });
    }

    function clearReady(code) {
        return whenReady().then(function () {
            return db.ref("rooms/" + code + "/ready").remove();
        }).catch(function () {});
    }

    // ── Big Board sync ─────────────────────────────────────
    // The board is kept on the room so an expired turn can be resolved
    // from it by whichever client is watching. The rules keep it private
    // until that user's clock has actually run out.
    function saveBoard(code, keys) {
        return whenReady().then(function () {
            return db.ref("rooms/" + code + "/boards/" + uid).set(keys || []);
        }).catch(function () { /* the board is a convenience, never fatal */ });
    }

    function readBoard(code, forUid) {
        return whenReady().then(function () {
            return db.ref("rooms/" + code + "/boards/" + forUid).get()
                .then(function (snap) { return snap.val() || []; })
                .catch(function () { return []; });
        });
    }

    // ── Make a pick (spec 8) ───────────────────────────────
    // One atomic fan-out: write the pick into its slot index, advance the
    // pick index, and hand the baton to the next user. The security rules
    // enforce all three independently, so a client cannot pick out of
    // turn, pick into an occupied index, or skip the queue.
    // onBehalfOf lets a watching client take an expired turn for an absent
    // user. The rules only permit it once the clock has actually run out,
    // and the pick is always recorded against whoever's turn it was.
    function makePick(code, slotId, poolIndex, order, pickIndex, onBehalfOf, playerKey) {
        return whenReady().then(function () {
            // Read the live draft state rather than trusting the client's
            // cached copy. A snapshot that is one pick behind targets the
            // wrong index, which Firebase rejects as permission denied and
            // which previously stalled the whole draft.
            return db.ref("rooms/" + code + "/draft").get().then(function (snap) {
                const d = snap.val();
                if (!d) throw new Error("That draft is no longer available.");

                const liveIndex = d.pickIndex || 0;
                const livePicker = d.currentPicker;
                const liveOrder = d.order || order;

                const forUid = onBehalfOf || uid;
                if (livePicker !== forUid) {
                    throw new Error("That pick was already made. The draft has moved on.");
                }

                const nextIndex = liveIndex + 1;
                const total = liveOrder.length * MPDraft.SQUAD_SIZE;
                const nextPicker = (nextIndex < total)
                    ? MPDraft.pickerAt(liveOrder, nextIndex)
                    : livePicker;

                const base = "rooms/" + code + "/draft/";
                const updates = {};
                // The identity key is the source of truth for which player was
                // picked. The pool index is kept only as a fallback. Each client
                // resolves the key against its own pool, so a pick always means
                // the same player regardless of pool ordering or load timing.
                updates[base + "picks/" + liveIndex] = {
                    by: livePicker, slot: slotId, i: poolIndex,
                    key: playerKey || null,
                    auto: onBehalfOf ? true : null
                };
                updates[base + "turnStartedAt"] = firebase.database.ServerValue.TIMESTAMP;
                updates[base + "turnDeadline"] = nextDeadline(code, nextPicker);
                updates[base + "pickIndex"] = nextIndex;
                updates[base + "currentPicker"] = nextPicker;

                return db.ref().update(updates).catch(function (err) {
                    if ((err.code || "").indexOf("permission") !== -1) {
                        throw new Error("That pick could not be made. Someone may have just "
                            + "picked, or the turn moved on. Your board is unchanged, try again.");
                    }
                    throw new Error("Could not make that pick (" + (err.code || err.message) + ").");
                });
            });
        });
    }

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

    // ── Start the competition (host only) ──────────────────
    // Generates the fixture list from the user count and stores it, then
    // flips the room to competing. Settings are already locked by status.
    function startCompetition(code) {
        return whenReady().then(function () {
            return db.ref("rooms/" + code).get().then(function (snap) {
                const room = snap.val();
                if (!room) throw new Error("That room no longer exists.");
                if (room.meta.hostUid !== uid) throw new Error("Only the host can start the tournament.");

                const order = (room.draft && room.draft.order) || [];
                const commits = room.commit || {};
                const missing = order.filter(function (u) { return !commits[u]; });
                if (missing.length) throw new Error("Not everyone has locked in yet.");

                const settings = room.settings || {};
                const updates = {};
                if (settings.gameType === "worldcup") {
                    // A World Cup has its own structure, run by the engine when
                    // the host plays. No series or league fixtures are made
                    // here; the compView shows the World Cup screens instead.
                    updates["rooms/" + code + "/comp"] = {
                        rwc: true,
                        pending: true,
                        startedAt: firebase.database.ServerValue.TIMESTAMP
                    };
                } else {
                    const comp = MPFixtures.generate(order);
                    updates["rooms/" + code + "/comp"] = {
                        name: comp.name,
                        decidedBy: comp.decidedBy,
                        fixtures: comp.fixtures,
                        pools: comp.pools || null,
                        startedAt: firebase.database.ServerValue.TIMESTAMP
                    };
                }
                updates["rooms/" + code + "/meta/status"] = "competing";
                return db.ref().update(updates).catch(function (err) {
                    throw new Error("Could not start the tournament ("
                        + (err.code || err.message) + "). Re-publish database.rules.json if this says permission denied.");
                });
            });
        });
    }

    // ── Play the fixtures (host only) ──────────────────────
    // Runs the seeded simulation and stores the results. Every client
    // could compute the same scores from the same seed, but storing them
    // makes the record authoritative and cheap to read.
    function finishCompetition(code, comp, tally) {
        return whenReady().then(function () {
            const updates = {};
            updates["rooms/" + code + "/comp/fixtures"] = comp.fixtures;
            updates["rooms/" + code + "/comp/results"] = comp.results;
            updates["rooms/" + code + "/comp/standings"] = comp.standings;
            updates["rooms/" + code + "/comp/number"] = comp.number || null;
            updates["rooms/" + code + "/comp/winner"] = comp.winner || null;
            updates["rooms/" + code + "/comp/kickerNames"] = comp.kickerNames || null;
            updates["rooms/" + code + "/comp/squads"] = comp.squads || null;
            updates["rooms/" + code + "/comp/illegal"] = comp.illegal || null;
            updates["rooms/" + code + "/comp/breaches"] = comp.breaches || null;
            updates["rooms/" + code + "/comp/playedAt"] = firebase.database.ServerValue.TIMESTAMP;
            updates["rooms/" + code + "/tally"] = tally;
            return db.ref().update(updates).catch(function (err) {
                throw new Error("Could not save the results (" + (err.code || err.message) + ").");
            });
        });
    }

    // Store a completed World Cup. Like finishCompetition, but the payload
    // carries the tournament's tables, results, bracket and sides rather than
    // a league fixture list. Everything sits under comp with an rwc marker so
    // the client renders World Cup screens.
    function finishRwc(code, comp, tally) {
        return whenReady().then(function () {
            const updates = {};
            updates["rooms/" + code + "/comp/rwc"] = true;
            updates["rooms/" + code + "/comp/number"] = comp.number || 1;
            updates["rooms/" + code + "/comp/tournament"] = comp.tournament || null;
            updates["rooms/" + code + "/comp/meta"] = comp.meta || null;
            updates["rooms/" + code + "/comp/tables"] = comp.tables || null;
            updates["rooms/" + code + "/comp/results"] = comp.results || null;
            updates["rooms/" + code + "/comp/bracket"] = comp.bracket || null;
            updates["rooms/" + code + "/comp/sides"] = comp.sides || null;
            updates["rooms/" + code + "/comp/winner"] = comp.winner || null;
            updates["rooms/" + code + "/comp/championNation"] = comp.championNation || null;
            updates["rooms/" + code + "/comp/illegal"] = comp.illegal || null;
            updates["rooms/" + code + "/comp/breaches"] = comp.breaches || null;
            updates["rooms/" + code + "/comp/kickerNames"] = comp.kickerNames || null;
            updates["rooms/" + code + "/comp/squads"] = comp.squads || null;
            updates["rooms/" + code + "/comp/playedAt"] = firebase.database.ServerValue.TIMESTAMP;
            updates["rooms/" + code + "/tally"] = tally;
            return db.ref().update(updates).catch(function (err) {
                throw new Error("Could not save the results (" + (err.code || err.message) + ").");
            });
        });
    }

    // ── Next competition (host only) ───────────────────────
    // Archives the finished competition, clears the draft and commitments,
    // and starts a fresh draft in reverse standings order so the bottom of
    // the room tally picks first.
    // Start a brand new tournament in the same room, keeping every member
    // seated so nobody re-enters a code. The game state is wiped (draft,
    // results, history, running tally, World Cup assignment) but members, their
    // kits and their quiet hours are kept. The host is dropped back to a fresh
    // lobby to configure the next tournament; the settings are rewritten when
    // they confirm the setup. Human seats are fixed at this point, since the
    // people are already here; the host can still adjust AI seats for a custom
    // game during setup.
    function newTournamentInRoom(code) {
        return whenReady().then(function () {
            return db.ref("rooms/" + code).get().then(function (snap) {
                const room = snap.val();
                if (!room) throw new Error("That room no longer exists.");
                if ((room.meta || {}).hostUid !== uid) {
                    throw new Error("Only the host can start a new tournament.");
                }
                const updates = {};
                updates["rooms/" + code + "/draft"] = null;
                updates["rooms/" + code + "/nationDraft"] = null;
                updates["rooms/" + code + "/commit"] = null;
                updates["rooms/" + code + "/comp"] = null;
                updates["rooms/" + code + "/history"] = null;
                updates["rooms/" + code + "/tally"] = null;
                updates["rooms/" + code + "/rwc"] = null;
                updates["rooms/" + code + "/ready"] = null;
                updates["rooms/" + code + "/entered"] = null;
                updates["rooms/" + code + "/pool"] = null;
                updates["rooms/" + code + "/meta/announcedAt"] = null;
                updates["rooms/" + code + "/settings/competition"] = 1;
                updates["rooms/" + code + "/meta/status"] = "lobby";
                return db.ref().update(updates).catch(function (err) {
                    throw new Error("Could not start a new tournament ("
                        + (err.code || err.message) + "). Re-publish database.rules.json if this says permission denied.");
                });
            });
        });
    }

    // Rewrite the room settings for a new in-room tournament. The human seats
    // are fixed (those people are already here), but the host may change the
    // game type, pool, rules, timers, season length and, for a custom game, the
    // number of AI seats. Called after newTournamentInRoom has reset the room
    // to a fresh lobby. Leaves the room at lobby so the host then starts the
    // draft with the normal first-draft flow.
    function reconfigureRoom(code, filters, rules, extra) {
        return whenReady().then(function () {
            return db.ref("rooms/" + code).get().then(function (snap) {
                const room = snap.val();
                if (!room) throw new Error("That room no longer exists.");
                if ((room.meta || {}).hostUid !== uid) {
                    throw new Error("Only the host can change the tournament settings.");
                }
                const members = room.members || {};
                const humans = Object.keys(members).filter(function (u) { return !members[u].ai; });
                const gameType = extra.gameType || "custom";
                // Human seats are fixed. AI seats only exist in a custom game.
                const ai = gameType === "worldcup" ? 0 : (extra.aiCount || 0);
                const tableSize = humans.length + ai;

                const s = {
                    mode: filters.mode || "tournament",
                    yearMin: filters.yearMin || "",
                    yearMax: filters.yearMax || "",
                    geoLabel: filters.geoLabel || "All nations",
                    countries: filters.countries || "",
                    tableSize: tableSize,
                    hostIdleMs: extra.hostIdleMs || 86400000,
                    chemistry: extra.chemistry !== false,
                    gameType: gameType,
                    rwcTournament: extra.rwcTournament || null,
                    rwcAssign: extra.rwcAssign || null,
                    rwcPool: extra.rwcPool || null,
                    turnMs: (extra.turnMs === 0 || extra.turnMs) ? extra.turnMs : 600000,
                    wholeDraftMs: extra.wholeDraftMs || null,
                    seasonLength: gameType === "worldcup" ? 1 : (extra.seasonLength || 1),
                    competition: 1,
                    aiCount: ai,
                    rules: rules || { maxPerTournament: false, maxPerCountry: false, onePerTournament: false }
                };

                const updates = {};
                updates["rooms/" + code + "/settings"] = s;
                // Remove any AI members from the previous game; the host re-adds
                // AI seats for the new custom game if wanted. Human members stay.
                Object.keys(members).forEach(function (u) {
                    if (members[u].ai) updates["rooms/" + code + "/members/" + u] = null;
                });
                updates["rooms/" + code + "/meta/status"] = "lobby";
                return db.ref().update(updates).catch(function (err) {
                    throw new Error("Could not save the new settings ("
                        + (err.code || err.message) + "). Re-publish database.rules.json if this says permission denied.");
                });
            });
        });
    }

    function nextCompetition(code) {
        return whenReady().then(function () {
            return db.ref("rooms/" + code).get().then(function (snap) {
                const room = snap.val();
                if (!room) throw new Error("That room no longer exists.");
                if (room.meta.hostUid !== uid) throw new Error("Only the host can start the next competition.");

                const settings = room.settings || {};
                const done = settings.competition || 1;
                const total = settings.seasonLength || 1;
                if (done >= total) throw new Error("The season is already complete.");

                const updates = {};
                updates["rooms/" + code + "/history/" + done] = {
                    name: (room.comp || {}).name || null,
                    standings: (room.comp || {}).standings || null,
                    winner: (room.comp || {}).winner || null,
                    results: (room.comp || {}).results || null,
                    kickerNames: (room.comp || {}).kickerNames || null,
                    squads: (room.comp || {}).squads || null
                };
                updates["rooms/" + code + "/commit"] = null;
                updates["rooms/" + code + "/draft"] = null;
                updates["rooms/" + code + "/settings/competition"] = done + 1;
                // Back to the lobby, not straight into a draft. The host may
                // change the pool and the rules between competitions, and the
                // pool snapshot is re-taken when they start the next draft.
                updates["rooms/" + code + "/meta/status"] = "lobby";
                return db.ref().update(updates).catch(function (err) {
                    throw new Error("Could not start the next competition ("
                        + (err.code || err.message) + "). Re-publish database.rules.json if this says permission denied.");
                });
            });
        });
    }

    // The next picker's deadline, allowing for their quiet hours. Computed
    // here because a security rule cannot evaluate a personal schedule.
    let cachedRoom = null;
    function noteRoom(room) { cachedRoom = room; }

    function nextDeadline(code, pickerUid) {
        const room = cachedRoom || {};
        const turnMs = ((room.settings || {}).turnMs) || 0;
        if (!turnMs) return 0;
        const q = ((room.quiet || {})[pickerUid]) || null;
        return MPDraft.deadlineFrom(serverNow(), turnMs, q);
    }

    function tallyPoints(tally) {
        const out = {};
        Object.keys(tally || {}).forEach(function (u) {
            const t = tally[u] || {};
            // Reverse standings uses titles first, then points.
            out[u] = (t.titles || 0) * 1000 + (t.points || 0);
        });
        return out;
    }

    // ── Watch a room ────────────────────────────────────────
    // cb receives the whole room object on every change. Returns an
    // unsubscribe function.
    // A read error is not the same as a deleted room, and previously both
    // arrived as a null snapshot. The listener now reports which it was, so
    // a momentary permission blip cannot be mistaken for a closed room.
    function watchRoom(code, cb, onError) {
        const ref = db.ref("rooms/" + code);
        const handler = ref.on("value",
            function (snap) { cb(snap.val()); },
            function (err) { if (onError) onError(err); });
        return function () { ref.off("value", handler); };
    }

    // Ask the server directly whether a room still exists, used to confirm
    // a disappearance before acting on it.
    function roomExists(code) {
        return whenReady().then(function () {
            return db.ref("rooms/" + code + "/meta").get()
                .then(function (snap) { return snap.exists(); })
                .catch(function () { return true; });   // unsure: assume it is there
        });
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

                if (leavingIsHost) {
                    // The host role can only pass to a human. AI seats live in
                    // members too, but they cannot make host decisions, so
                    // they are never candidates.
                    const humans = Object.keys(members).filter(function (k) {
                        return k !== uid && !(members[k] && members[k].ai);
                    });
                    if (humans.length === 0) {
                        // No humans left, so the room closes rather than being
                        // handed to an AI that could never run it.
                        return db.ref("rooms/" + code).remove();
                    }
                    humans.sort(function (a, b) {
                        return (members[a].joinedAt || 0) - (members[b].joinedAt || 0);
                    });
                    updates["rooms/" + code + "/meta/hostUid"] = humans[0];
                }

                // A seat with a draft position against it cannot simply be
                // deleted: its picks, fixtures and results all point at it,
                // and every piece of cover machinery reads room.members. So
                // once the leaver appears in the draft order, the seat stays
                // and is marked as departed. That is what lets the host
                // assign AI cover, keeps the name on every table it already
                // sits in, and stops the room deadlocking at the commit
                // stage on someone who can never lock in.
                const order = ((room.draft || {}).order) || [];
                const inDraft = order.indexOf(uid) !== -1;
                if (inDraft) {
                    updates["rooms/" + code + "/members/" + uid + "/left"] = true;
                    updates["rooms/" + code + "/members/" + uid + "/connected"] = false;
                    updates["rooms/" + code + "/members/" + uid + "/missed"] = true;
                    // A departed seat must never hold the room up between
                    // competitions, so it reads as ready and entered. Cover,
                    // once assigned, keeps these flags true itself.
                    updates["rooms/" + code + "/ready/" + uid] = true;
                    updates["rooms/" + code + "/entered/" + uid] = true;
                } else {
                    updates["rooms/" + code + "/members/" + uid] = null;
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
        updateSettings: updateSettings,
        startDraft: startDraft,
        makePick: makePick,
        makeParallelPick: makeParallelPick,
        clearParallelPick: clearParallelPick,
        finishParallelUser: finishParallelUser,
        sweepParallelDeadline: sweepParallelDeadline,
        pickNation: pickNation,
        sweepNationDeadline: sweepNationDeadline,
        startPlayerDraftFromNations: startPlayerDraftFromNations,
        addAiSeats: addAiSeats,
        markMissed: markMissed,
        clearMissed: clearMissed,
        coverWithAi: coverWithAi,
        reclaimSeat: reclaimSeat,
        removeAiSeats: removeAiSeats,
        saveQuiet: saveQuiet,
        touchHost: touchHost,
        claimHost: claimHost,
        setReady: setReady,
        setReadyFor: setReadyFor,
        enterDraft: enterDraft,
        announceNext: announceNext,
        forceCommit: forceCommit,
        clearReady: clearReady,
        saveBoard: saveBoard,
        readBoard: readBoard,
        serverNow: serverNow,
        noteRoom: noteRoom,
        submitCommit: submitCommit,
        startCompetition: startCompetition,
        finishCompetition: finishCompetition,
        finishRwc: finishRwc,
        nextCompetition: nextCompetition,
        rememberRoom: rememberRoom,
        lastRoom: lastRoom,
        forgetRoom: forgetRoom,
        joinRoom: joinRoom,
        watchRoom: watchRoom,
        roomExists: roomExists,
        leaveRoom: leaveRoom,
        closeRoom: closeRoom,
        newTournamentInRoom: newTournamentInRoom,
        reconfigureRoom: reconfigureRoom,
        MAX_MEMBERS: MAX_MEMBERS
    };
})();
