// ============================================================
// RUGBY XV DRAFT: DRAFT UI
// Slot-first team sheet, Big Board and Full Draft (spec 8, 9)
// ============================================================
// Three tabs: Your XV, Big Board, Full Draft. The list tabs are
// browsable at any time, so the Big Board can be built before and
// during the draft without entering a pick.
//
// Guiding principle (spec 9): never rank candidates for the user.
// Nations are accordions, sorted alphabetically; players within a
// nation are grouped by position and sorted by surname. Ratings are
// shown so a player can be judged once found, never as a sort key.
//
// UK English. No em dashes or en dashes.
// ============================================================

window.MPDraftUI = (function () {
    const $ = function (id) { return document.getElementById(id); };
    const STAR_ROOT = "mp-bigboard";
    const AXIS_KEY = "mp-list-axis";

    const state = {
        pool: [],
        squad: null,
        taken: {},
        starred: [],
        roomCode: null,
        activeSlot: null,   // null = browsing, otherwise picking for this slot
        tab: "xv",          // "xv" | "board" | "all"
        search: "",
        axis: "nation",     // "nation" | "position", remembered
        openNations: {},    // nation -> true
        openGroups: {},     // position group -> true
        openSub: {},        // 'parent|child' -> true, nested accordions
        expanded: {},       // player key -> true (version chevron)
        constraints: [],
        ruleCtx: null,
        onPick: null,
        myUid: null,
        isMyTurn: false,
        live: false,        // true once wired to a real room
        order: [],
        members: {},
        pickIndex: 0,
        picksList: [],
        complete: false,
        relaxedNow: false,
        turnMs: 0,
        turnStartedAt: 0,
        expiryBusy: false,
        autoMode: false,
        autoBusy: false
    };

    let byNation = [];
    let groupedPlayers = {};

    // ── Setup ───────────────────────────────────────────────
    function init(opts) {
        state.pool = opts.pool || [];
        state.squad = opts.squad || MPPicks.emptySquad();
        state.taken = opts.taken || {};
        state.axis = loadAxis();
        state.constraints = opts.constraints || [];
        state.ruleCtx = opts.ruleCtx || null;
        state.onPick = opts.onPick || null;
        state.myUid = opts.myUid || null;
        state.roomCode = opts.roomCode || null;
        state.competition = opts.competition || 1;
        state.live = !!opts.live;
        state.roomTurnMs = opts.turnMs || 0;
        state.onExpire = opts.onExpire || function () {};
        state.starred = loadStars();
        pruneStars();
        buildIndex();
        renderAxis();
        setTab("xv");
        renderTeamsheet();
        renderBoardBadge();
    }

    function loadAxis() {
        try { return localStorage.getItem(AXIS_KEY) === "position" ? "position" : "nation"; }
        catch (e) { return "nation"; }
    }
    function saveAxis() {
        try { localStorage.setItem(AXIS_KEY, state.axis); } catch (e) {}
    }
    function setAxis(axis) {
        state.axis = axis;
        saveAxis();
        renderAxis();
        renderList();
    }
    function renderAxis() {
        $("axisNation").setAttribute("aria-pressed", String(state.axis === "nation"));
        $("axisPosition").setAttribute("aria-pressed", String(state.axis === "position"));
    }

    // The Big Board is scoped to a room. A different room means a
    // different pool, so a board carried over from another room would list
    // players who are not even in this draft.
    function starKey() {
        return STAR_ROOT + ":" + (state.roomCode || "none") + ":c" + (state.competition || 1);
    }

    // A new competition draws from a freshly built pool, so any board entry
    // that no longer exists in it is dropped. Otherwise the count keeps
    // reporting players that cannot be shown or picked.
    function pruneStars() {
        const before = state.starred.length;
        state.starred = state.starred.filter(function (k) { return !!findPlayerByKey(k); });
        if (state.starred.length !== before) saveStars();
    }
    function loadStars() {
        try { return JSON.parse(localStorage.getItem(starKey()) || "[]"); }
        catch (e) { return []; }
    }
    function saveStars() {
        try { localStorage.setItem(starKey(), JSON.stringify(state.starred)); } catch (e) {}
        // Mirror to the room so an expired turn can be resolved from it.
        if (state.live && state.roomCode && window.MPNet && MPNet.saveBoard) {
            clearTimeout(saveStarsTimer);
            saveStarsTimer = setTimeout(function () {
                MPNet.saveBoard(state.roomCode, state.starred);
            }, 400);
        }
    }
    let saveStarsTimer = null;

    // ── Dev auto-pick ───────────────────────────────────────
    // Only available with ?dev=1 in the URL. Drafting two full XVs by hand
    // to reach the later screens is slow, so this fills your own squad by
    // taking the best available player for the next slot you still need.
    // It can only ever pick on your own turn, exactly like a real user, so
    // it cannot bypass the turn order or the server rules.
    // Matches IS_STAGING_ENV in the single-player app.js, so dev tools
    // appear on staging automatically and never on production. ?dev=1
    // remains as a manual override for local testing.
    function devEnabled() {
        try {
            const staging = location.hostname.indexOf("github.io") !== -1
                && location.pathname.indexOf("rugby-draft-sim-staging") !== -1;
            const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
            return staging || local || /[?&]dev=1/.test(location.search);
        } catch (e) { return false; }
    }

    function toggleAuto() {
        state.autoMode = !state.autoMode;
        const b = $("autoPickBtn");
        if (b) b.setAttribute("aria-pressed", String(state.autoMode));
        note(state.autoMode ? "Auto-pick on. Picking whenever it is your turn." : "Auto-pick off.");
        maybeAutoPick();
    }

    function note(msg) {
        const n = $("devNote");
        if (n) n.textContent = msg || "";
    }

    function stopAuto() {
        state.autoMode = false;
        state.autoBusy = false;
        const b = $("autoPickBtn");
        if (b) b.setAttribute("aria-pressed", "false");
        note("");
    }

    function maybeAutoPick() {
        if (!state.autoMode) return;
        // Switch off once there is nothing left to pick, so it cannot carry
        // into the next competition and draft a squad without being asked.
        if (state.complete || !MPPicks.emptySlots(state.squad).length) {
            stopAuto();
            note("Auto-pick finished and switched itself off.");
            return;
        }
        if (!state.live) return;
        if (!state.isMyTurn || state.autoBusy) return;
        state.autoBusy = true;
        setTimeout(function () {
            const res = MPPicks.autoPick(state.pool, state.squad, state.taken, boardPlayers(),
                state.constraints, state.ruleCtx, (window.MPRules && MPRules.isPickLegal));
            if (!res || res.stuck) {
                state.autoBusy = false;
                stopAuto();
                note("No player can fill the remaining slots. Finishing a man short.");
                return;
            }
            let idx = -1;
            for (let i = 0; i < state.pool.length; i++) {
                if (state.pool[i] === res.player) { idx = i; break; }
            }
            if (idx === -1) { state.autoBusy = false; return; }
            note("Picked " + res.player.name + " at " + MPPicks.slotById(res.slotId).label + ".");
            state.onPick(res.slotId, idx, function (err) {
                state.autoBusy = false;
                if (err) { note("Auto-pick failed: " + err.message); return; }
                // The room watcher may already have repainted while this
                // pick was in flight, so on a snake turnaround nothing
                // would retrigger. Ask again now that we are free.
                maybeAutoPick();
            });
        }, 250);
    }

    // ── Colour safety ───────────────────────────────────────
    // Users pick their own kit colours, so two dark colours on the dark
    // theme (or two light ones on the light theme) would vanish. Measure
    // relative luminance and lift or darken only when a colour would be
    // too close to the background to see.
    function hexToRgb(hex) {
        const h = String(hex || "").replace("#", "");
        const full = h.length === 3 ? h.split("").map(function (c) { return c + c; }).join("") : h;
        const n = parseInt(full, 16);
        if (isNaN(n) || full.length !== 6) return { r: 128, g: 128, b: 128 };
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
    function luminance(hex) {
        const c = hexToRgb(hex);
        const f = function (v) {
            v /= 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    }
    function mix(hex, target, amount) {
        const a = hexToRgb(hex), b = hexToRgb(target);
        const m = function (x, y) { return Math.round(x + (y - x) * amount); };
        const to2 = function (v) { return ("0" + v.toString(16)).slice(-2); };
        return "#" + to2(m(a.r, b.r)) + to2(m(a.g, b.g)) + to2(m(a.b, b.b));
    }
    function isLightTheme() {
        return document.documentElement.getAttribute("data-theme") === "light";
    }
    // Returns a version of the colour that is always visible against the
    // current background, leaving well-contrasted colours untouched.
    function safeKit(hex) {
        if (!hex) return "#6E8CA6";
        const L = luminance(hex);
        if (isLightTheme()) {
            // Light background: lighten colours are the problem.
            if (L > 0.62) return mix(hex, "#000000", Math.min(0.55, (L - 0.62) * 1.6 + 0.25));
            return hex;
        }
        // Dark background: very dark colours are the problem.
        if (L < 0.16) return mix(hex, "#FFFFFF", Math.min(0.65, (0.16 - L) * 2.4 + 0.3));
        return hex;
    }

    function myKit() {
        const me = state.members[state.myUid] || {};
        return { a: safeKit(me.kit || "#16E0CD"), b: safeKit(me.kit2 || "#FFC24D") };
    }

    // ── Live state from the room ────────────────────────────
    // Rebuild every squad from the shared pick list, so all clients agree
    // and a reconnecting user resumes exactly where they left off.
    function applyRoom(room) {
        const draft = room.draft || {};
        const pool = room.pool || [];
        state.order = draft.order || [];
        state.members = room.members || {};
        state.pickIndex = draft.pickIndex || 0;
        state.currentPicker = draft.currentPicker || null;
        state.turnStartedAt = draft.turnStartedAt || draft.startedAt || 0;
        state.turnMs = state.roomTurnMs || 0;

        const total = state.order.length * MPPicks.SLOTS.length;
        state.complete = state.pickIndex >= total && total > 0;
        state.isMyTurn = !state.complete && draft.currentPicker === state.myUid;

        // Reset and replay. Every squad is rebuilt, not just your own, so
        // an expired turn can be taken on the absent user's behalf.
        state.squad = MPPicks.emptySquad();
        state.squads = {};
        state.order.forEach(function (u) { state.squads[u] = MPPicks.emptySquad(); });
        state.taken = {};
        const picks = draft.picks || {};
        state.picksList = Object.keys(picks)
            .map(function (k) { return { idx: parseInt(k, 10), pick: picks[k] }; })
            .sort(function (a, b) { return a.idx - b.idx; });
        Object.keys(picks).forEach(function (k) {
            const pk = picks[k];
            const p = pool[pk.i];
            if (!p) return;
            const who = state.members[pk.by];
            state.taken[MPPicks.personKey(p)] = (pk.by === state.myUid)
                ? "you"
                : ((who && who.name) || "another user");
            if (state.squads[pk.by]) state.squads[pk.by][pk.slot] = p;
            if (pk.by === state.myUid) state.squad[pk.slot] = p;
        });

        renderTurn(draft);
        checkStuck();
        paintClock();
        startClock();
        renderTeamsheet();
        // Always repaint the list, so taken players grey out the instant
        // another user picks, whichever tab is showing.
        if (state.tab === "picks") renderPicks();
        else if (state.tab !== "xv") renderList();
        renderBoardBadge();
        maybeAutoPick();
    }

    // Big Board tab badge: how many starred players are still available.
    function renderBoardBadge() {
        const el = $("tabBoard");
        if (!el) return;
        let avail = 0, total = 0;
        state.starred.forEach(function (k) {
            total++;
            // Starred keys are version-level; availability is person-level.
            const parts = k.split("|");
            if (!state.taken[parts[0] + "|" + parts[1]]) avail++;
        });
        el.textContent = total ? ("Big Board " + avail + "/" + total) : "Big Board";
    }

    // If the active user cannot legally pick anything, the constraint rules
    // step aside for that pick rather than freezing the draft. The front-row
    // law never steps aside.
    function checkStuck() {
        state.relaxedNow = false;
        const el = $("stuckNote");
        if (!el) return;
        if (!state.isMyTurn || state.complete || !MPPicks.emptySlots(state.squad).length) {
            el.classList.add("hidden");
            return;
        }
        const relax = MPPicks.relaxFor(state.pool, state.squad, state.taken,
            state.constraints, state.ruleCtx, (window.MPRules && MPRules.isPickLegal));
        if (relax.level === 0) { el.classList.add("hidden"); return; }

        state.relaxedNow = true;
        el.classList.remove("hidden");
        el.innerHTML = relax.level === 1
            ? "<strong>No legal pick left under the room rules.</strong> "
              + "The restrictions have been lifted for this pick so the draft can continue. "
              + "They apply again next time."
            : "<strong>No player can fill your remaining slots.</strong> "
              + "The pool has run dry, so you will finish a man short. "
              + "Your rating is worked out from the players you do have.";
    }

    // ── Turn clock ──────────────────────────────────────────
    // A draft can run for days, so a user who goes quiet must not stall
    // the room. When the clock runs out, any watching client may take the
    // pick on their behalf. The rules only allow it once the deadline has
    // genuinely passed, measured on server time, so it cannot be forced
    // early by a device with a wrong clock.
    function msLeft() {
        if (!state.turnMs || !state.turnStartedAt) return null;
        return (state.turnStartedAt + state.turnMs) - MPNet.serverNow();
    }

    function formatLeft(ms) {
        if (ms <= 0) return "time up";
        const s = Math.floor(ms / 1000);
        const d = Math.floor(s / 86400);
        const h = Math.floor((s % 86400) / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        if (d) return d + "d " + h + "h left";
        if (h) return h + "h " + m + "m left";
        if (m) return m + "m " + sec + "s left";
        return sec + "s left";
    }

    let clockTimer = null;
    function startClock() {
        if (clockTimer) return;
        clockTimer = setInterval(function () {
            if (!state.live || state.complete) return;
            paintClock();
            checkExpiry();
        }, 1000);
    }

    function paintClock() {
        const el = $("turnClock");
        if (!el) return;
        const left = msLeft();
        if (left === null) { el.textContent = ""; return; }
        el.textContent = formatLeft(left);
        el.classList.toggle("urgent", left > 0 && left < 60000);
        el.classList.toggle("expired", left <= 0);
    }

    // Any client may resolve an expired turn. The server rules enforce pick
    // uniqueness, so if several try at once only one succeeds.
    function checkExpiry() {
        if (state.expiryBusy || !state.live || state.complete) return;
        const left = msLeft();
        if (left === null || left > 0) return;

        const who = state.currentPicker;
        if (!who) return;
        const theirSquad = state.squads && state.squads[who];
        if (!theirSquad) return;

        state.expiryBusy = true;

        const finish = function (board) {
            const res = MPPicks.autoPick(state.pool, theirSquad, state.taken, board,
                state.constraints, state.ruleCtx, (window.MPRules && MPRules.isPickLegal));
            if (!res || res.stuck) { state.expiryBusy = false; return; }
            let idx = -1;
            for (let i = 0; i < state.pool.length; i++) {
                if (state.pool[i] === res.player) { idx = i; break; }
            }
            if (idx === -1) { state.expiryBusy = false; return; }
            state.onExpire(res.slotId, idx, who, function () { state.expiryBusy = false; });
        };

        if (who === state.myUid) { finish(boardPlayers()); return; }

        // Their board is readable now that their clock has expired.
        MPNet.readBoard(state.roomCode, who).then(function (keys) {
            const board = (keys || []).map(findPlayerByKey).filter(Boolean);
            finish(board);
        }).catch(function () { finish([]); });
    }

    function renderTurn(draft) {
        const el = $("turnBar");
        if (!el) return;
        if (!state.live) { el.classList.add("hidden"); return; }
        el.classList.remove("hidden");
        if (state.complete) {
            el.className = "turn-bar done";
            el.innerHTML = "<span class='turn-who'>Draft complete</span>"
                + "<span class='turn-meta'>All squads are picked.</span>";
            return;
        }
        const cur = state.members[draft.currentPicker] || {};
        el.style.setProperty("--turnkit", safeKit(cur.kit || "#16E0CD"));
        const round = state.order.length
            ? Math.floor(state.pickIndex / state.order.length) + 1 : 1;
        el.className = "turn-bar" + (state.isMyTurn ? " mine" : "");
        el.innerHTML = "<span class='turn-who'>"
            + (state.isMyTurn ? "Your pick" : esc(cur.name || "Waiting") + " is picking")
            + "</span><span class='turn-meta'>Round " + round + " of 15, pick "
            + (state.pickIndex + 1) + "</span>";
    }

    // ── Index ───────────────────────────────────────────────
    function surname(name) {
        const parts = String(name).trim().split(/\s+/);
        return parts.length > 1 ? parts[parts.length - 1] : parts[0];
    }
    function nameKey(p) { return p.country + "|" + p.name; }

    // Position group order for the sub-headings inside a nation.
    const GROUP_ORDER = ["front-row", "lock", "back-row", "half-back", "centre", "wing", "fullback"];
    const GROUP_LABEL = {
        "front-row": "Front row", "lock": "Locks", "back-row": "Back row",
        "half-back": "Half backs", "centre": "Centres", "wing": "Wings",
        "fullback": "Full backs", "other": "Other"
    };

    // A player belongs to the group of the position he is actually listed
    // at first. Scanning a fixed order instead meant anyone who could cover
    // a second position was filed under whichever group came earlier in
    // that order, so a fullback who also played wing or fly-half never
    // appeared under full backs at all.
    function primaryGroup(p) {
        const first = (p.positions && p.positions[0]) || null;
        const g = first ? MPPicks.POS_GROUP[first] : null;
        if (g) return g;
        const gs = MPPicks.playerGroups(p);
        return gs.length ? gs[0] : "other";
    }

    function buildIndex() {
        groupedPlayers = {};
        state.pool.forEach(function (p) {
            const k = nameKey(p);
            (groupedPlayers[k] = groupedPlayers[k] || []).push(p);
        });

        const nations = {};
        Object.keys(groupedPlayers).forEach(function (k) {
            const versions = groupedPlayers[k].slice().sort(function (a, b) {
                return String(a.year).localeCompare(String(b.year));
            });
            const first = versions[0];
            (nations[first.country] = nations[first.country] || []).push({
                key: k, name: first.name, country: first.country,
                versions: versions, group: primaryGroup(first)
            });
        });

        byNation = Object.keys(nations).sort().map(function (n) {
            return {
                nation: n,
                players: nations[n].sort(function (a, b) {
                    const ga = GROUP_ORDER.indexOf(a.group), gb = GROUP_ORDER.indexOf(b.group);
                    if (ga !== gb) return (ga === -1 ? 99 : ga) - (gb === -1 ? 99 : gb);
                    return surname(a.name).toLowerCase().localeCompare(surname(b.name).toLowerCase());
                })
            };
        });
        buildGroupIndex(byNation);
    }

    // Position-first index: group, then nation, then surname.
    let byGroup = [];
    function buildGroupIndex(entriesByNation) {
        const groups = {};
        entriesByNation.forEach(function (g) {
            g.players.forEach(function (e) {
                (groups[e.group] = groups[e.group] || []).push(e);
            });
        });
        byGroup = GROUP_ORDER.concat(["other"]).filter(function (k) { return groups[k]; }).map(function (k) {
            return {
                group: k,
                label: GROUP_LABEL[k] || "Other",
                players: groups[k].sort(function (a, b) {
                    if (a.country !== b.country) return a.country.localeCompare(b.country);
                    return surname(a.name).toLowerCase().localeCompare(surname(b.name).toLowerCase());
                })
            };
        });
    }

    // ── Tabs ────────────────────────────────────────────────
    function setTab(tab) {
        state.tab = tab;
        $("tabXV").setAttribute("aria-pressed", String(tab === "xv"));
        $("tabBoard").setAttribute("aria-pressed", String(tab === "board"));
        $("tabAll").setAttribute("aria-pressed", String(tab === "all"));
        $("tabPicks").setAttribute("aria-pressed", String(tab === "picks"));
        $("paneXV").classList.toggle("hidden", tab !== "xv");
        $("paneList").classList.toggle("hidden", tab === "xv" || tab === "picks");
        $("panePicks").classList.toggle("hidden", tab !== "picks");
        if (tab === "picks") renderPicks();
        else if (tab !== "xv") renderList();
    }

    // ── Picks tab ───────────────────────────────────────────
    // Every pick, latest first, so the newest is at the top and you can
    // scroll back to the first pick of the draft.
    function renderPicks() {
        const el = $("picksBody");
        if (!el) return;
        if (!state.picksList.length) {
            el.innerHTML = "<p class='panel-empty'>No picks yet.</p>";
            return;
        }
        const pool = state.pool;
        const n = state.order.length || 1;
        el.innerHTML = state.picksList.slice().reverse().map(function (row) {
            const pk = row.pick;
            const p = pool[pk.i];
            if (!p) return "";
            const who = state.members[pk.by] || {};
            const mine = pk.by === state.myUid;
            const slot = MPPicks.slotById(pk.slot);
            const round = Math.floor(row.idx / n) + 1;
            const pen = slot ? MPPicks.oopPenalty(p, slot.node) : 0;
            return "<div class='pickrow" + (mine ? " mine" : "") + (pk.auto ? " auto" : "") + "' style='--pk:"
                + safeKit(who.kit || "#6E8CA6") + "'>"
                + "<span class='pknum'>" + (row.idx + 1) + "</span>"
                + "<span class='pkinfo'>"
                + "<span class='pkname'>" + esc(p.name) + "</span>"
                + "<span class='pkmeta'>" + esc(p.country) + (p.year ? " " + p.year : "")
                + " | " + (slot ? esc(slot.label) : "")
                + (pen > 0 ? " <span class='pen'>minus " + pen + "</span>" : "")
                + "</span></span>"
                + "<span class='pkby'>" + (mine ? "You" : esc(who.name || "User"))
                + "<span class='pkround'>R" + round + "</span></span>"
                + "</div>";
        }).join("");
    }

    // ── Rules progress (spec 7) ─────────────────────────────
    // A draft can run for days, so the constraints must be visible with
    // your progress against them rather than held in memory.
    function renderRules() {
        const el = $("rulePanel");
        if (!el) return;
        const active = state.constraints || [];
        if (!active.length) { el.classList.add("hidden"); return; }
        el.classList.remove("hidden");

        const picked = MPPicks.squadPlayers(state.squad);
        const left = MPPicks.emptySlots(state.squad).length;

        const html = active.map(function (r) {
            if (r.id === "maxPerCountry") return countRule(picked, r, "country", "nation");
            if (r.id === "maxPerTournament") return countRule(picked, r, "year", "tournament");
            if (r.id === "onePerTournament") return coverRule(picked, r, left);
            return "";
        }).filter(Boolean).join("");
        el.innerHTML = html;
    }

    // "Maximum N from any one nation/tournament": show what you hold and
    // flag anything already at the cap.
    function countRule(picked, rule, field, word) {
        const cap = rule.value;
        const counts = {};
        picked.forEach(function (p) {
            const k = p[field];
            if (k) counts[k] = (counts[k] || 0) + 1;
        });
        const keys = Object.keys(counts).sort(function (a, b) {
            return counts[b] - counts[a] || String(a).localeCompare(String(b));
        });
        const atCap = keys.filter(function (k) { return counts[k] >= cap; }).length;
        const chips = keys.map(function (k) {
            const full = counts[k] >= cap;
            return "<span class='rule-chip" + (full ? " full" : "") + "'>"
                + esc(k) + " " + counts[k] + "/" + cap + "</span>";
        }).join("");
        const state1 = keys.length
            ? (atCap ? atCap + " at the limit" : "within limits")
            : "nothing picked yet";
        return "<div class='rule-item'><div class='rule-top'>"
            + "<span class='rule-name'>Max " + cap + " per " + word + "</span>"
            + "<span class='rule-state " + (atCap ? "tight" : "ok") + "'>" + state1 + "</span></div>"
            + (chips ? "<div class='rule-detail'>" + chips + "</div>" : "")
            + "</div>";
    }

    // "One player from each tournament": show which are covered and which
    // are still outstanding, with a warning if slots are running short.
    function coverRule(picked, rule, slotsLeft) {
        const cov = MPPicks.coverageContext(state.pool, state.squad, state.constraints);
        // Only the tournaments actually in this pool, not every tournament
        // ever played. A room filtered to 1995 to 2015 must not be told it
        // needs a player from 1987.
        const need = {};
        const inPool = {};
        state.pool.forEach(function (p) { if (p.year) inPool[p.year] = true; });
        Object.keys(inPool).forEach(function (y) { need[y] = 0; });
        picked.forEach(function (p) { if (p.year) need[p.year] = (need[p.year] || 0) + 1; });
        const years = Object.keys(need).sort();
        const covered = years.filter(function (y) { return need[y] > 0; });
        const missing = years.filter(function (y) { return !need[y]; });
        const chips = years.map(function (y) {
            const have = need[y] > 0;
            return "<span class='rule-chip " + (have ? "have" : "missing") + "'>" + esc(y) + "</span>";
        }).join("");
        const short = missing.length > slotsLeft;
        const forced = cov && cov.forced && missing.length;
        let note = "";
        if (short) {
            note = "<span class='rule-warn'>Cannot be met: " + missing.length
                + " tournaments to cover with " + slotsLeft + " slot"
                + (slotsLeft === 1 ? "" : "s") + " left. Your XV will be illegal, "
                + "which means a rating penalty and no chance of winning this competition.</span>";
        } else if (forced) {
            note = "<span class='rule-warn'>Every remaining pick must come from a "
                + "tournament you do not have yet.</span>";
        } else if (cov) {
            note = "<span class='rule-slack'>" + cov.slack + " free pick"
                + (cov.slack === 1 ? "" : "s") + " left before every pick must cover a new tournament.</span>";
        }
        return "<div class='rule-item'><div class='rule-top'>"
            + "<span class='rule-name'>One from every tournament</span>"
            + "<span class='rule-state " + (short ? "tight" : (missing.length ? "" : "ok")) + "'>"
            + covered.length + " of " + years.length + " covered</span></div>"
            + "<div class='rule-detail'>" + chips + "</div>" + note + "</div>";
    }

    // ── Team sheet ──────────────────────────────────────────
    function renderTeamsheet() {
        const sq = state.squad;
        const kit = myKit();
        $("squadProgress").textContent = MPPicks.filledSlots(sq).length + " of 15 picked";
        renderRules();
        const sheet = $("teamsheet");
        sheet.style.setProperty("--kit1", kit.a);
        sheet.style.setProperty("--kit2", kit.b);
        sheet.innerHTML = MPPicks.SLOTS.map(function (s) {
            const p = sq[s.id];
            if (!p) {
                return "<button class='slot' data-slot='" + s.id + "'>"
                    + "<span class='snum'>" + s.num + "</span>"
                    + "<span class='slabel'>" + s.label + "</span>"
                    + "<span class='empty-hint'>"
                    + (state.live && !state.isMyTurn ? "Waiting for your turn" : "Tap to pick")
                    + "</span></button>";
            }
            const pen = MPPicks.oopPenalty(p, s.node);
            const eff = Math.max(0, (p.rating || 0) - pen);
            // No kicker mark here on purpose: once a player is in your XV
            // you are expected to know whether he can kick.
            return "<div class='slot filled" + (pen > 0 ? " oop" : "") + "'>"
                + "<span class='snum'>" + s.num + "</span>"
                + "<span class='slabel'>" + s.label + "</span>"
                + "<span class='sname'>" + esc(p.name)
                + "<span class='smeta'>" + esc(p.country) + (p.year ? " " + p.year : "")
                + (pen > 0 ? " <span class='oop-tag'>out of position, minus " + pen + "</span>" : "")
                + "</span></span>"
                + "<span class='srating'>" + eff + "</span></div>";
        }).join("");
    }

    // ── Picking mode ────────────────────────────────────────
    function startPicking(slotId) {
        state.activeSlot = slotId;
        const slot = MPPicks.slotById(slotId);
        $("bannerSlot").textContent = slot.num + ". " + slot.label;
        $("pickBanner").classList.remove("hidden");
        // Open the nations that hold natural players for this slot, so the
        // relevant ones are presented first. The user is free to open any
        // other nation and take someone listed elsewhere.
        state.openNations = {};
        state.openGroups = {};
        // Position axis: open the group that naturally covers this slot.
        state.openSub = {};
        const ng = MPPicks.NODE_GROUP[slot.node];
        if (ng) {
            state.openGroups[ng] = true;
            // Position axis: open every nation sub-accordion is too much, so
            // leave them shut; the counts guide the user.
        }
        byNation.forEach(function (g) {
            const fits = g.players.some(function (e) {
                return MPPicks.naturalSlots(e.versions[0]).indexOf(slotId) !== -1;
            });
            if (fits && Object.keys(state.openNations).length < 3) {
                state.openNations[g.nation] = true;
                // Nation axis: open the matching position sub-accordion too.
                if (ng) state.openSub[g.nation + "|" + ng] = true;
            }
        });
        setTab("all");
    }

    function cancelPicking() {
        state.activeSlot = null;
        $("pickBanner").classList.add("hidden");
        renderList();
    }

    // ── List rendering ──────────────────────────────────────
    function matchesSearch(entry, q) {
        if (!q) return true;
        const hay = (entry.name + " " + entry.country + " "
            + entry.versions.map(function (v) { return v.year; }).join(" ")).toLowerCase();
        return hay.indexOf(q) !== -1;
    }

    function renderList() {
        const q = state.search.trim().toLowerCase();
        const slot = state.activeSlot ? MPPicks.slotById(state.activeSlot) : null;

        $("listHint").textContent = slot
            ? "Ratings shown are for " + slot.label + ". Open any nation to find a player."
            : "Browsing. Star players to build your Big Board. Pick from Your XV.";

        if (state.tab === "board") { renderBoard(slot, q); return; }
        if (state.axis === "position") { renderByPosition(slot, q); return; }
        renderByNation(slot, q);
    }

    // Nation accordions, with position sub-accordions inside.
    function renderByNation(slot, q) {
        const html = byNation.map(function (g) {
            const matched = g.players.filter(function (e) { return matchesSearch(e, q); });
            if (!matched.length) return "";
            const open = q ? true : !!state.openNations[g.nation];
            const fit = slot ? countFit(matched, slot) : 0;
            const body = open ? subAccordions(matched, slot, q, g.nation, "group") : "";
            return accordionShell("data-nation", g.nation, g.nation, matched.length, fit, slot, open, body);
        }).join("");
        $("panelBody").innerHTML = html || "<p class='panel-empty'>No players match that search.</p>";
    }

    // Position accordions, with nation sub-accordions inside.
    function renderByPosition(slot, q) {
        const html = byGroup.map(function (g) {
            const matched = g.players.filter(function (e) { return matchesSearch(e, q); });
            if (!matched.length) return "";
            const open = q ? true : !!state.openGroups[g.group];
            const fit = slot ? countFit(matched, slot) : 0;
            const body = open ? subAccordions(matched, slot, q, g.group, "nation") : "";
            return accordionShell("data-group", g.group, g.label, matched.length, fit, slot, open, body);
        }).join("");
        $("panelBody").innerHTML = html || "<p class='panel-empty'>No players match that search.</p>";
    }

    // Shared accordion shell for the top level.
    function accordionShell(attr, key, label, count, fit, slot, open, body) {
        return "<div class='nation'>"
            + "<button class='nation-head' " + attr + "='" + esc(key) + "'>"
            + "<span class='caret'>" + (open ? "\u25BC" : "\u25B6") + "</span>"
            + esc(label)
            + "<span class='ncount'>" + count + " players"
            + (slot && fit ? " <span class='nfit'>| " + fit + " in position</span>" : "")
            + "</span></button>" + body + "</div>";
    }

    function countFit(entries, slot) {
        let n = 0;
        entries.forEach(function (e) {
            if (MPPicks.naturalSlots(e.versions[0]).indexOf(slot.id) !== -1) n++;
        });
        return n;
    }

    // Nested sub-accordions. childBy is "group" (position sub-headings)
    // or "nation" (nation sub-headings).
    function subAccordions(entries, slot, q, parentKey, childBy) {
        const buckets = {};
        const order = [];
        entries.forEach(function (e) {
            const k = (childBy === "group") ? e.group : e.country;
            if (!buckets[k]) { buckets[k] = []; order.push(k); }
            buckets[k].push(e);
        });
        if (childBy === "group") {
            order.sort(function (a, b) {
                const ia = GROUP_ORDER.indexOf(a), ib = GROUP_ORDER.indexOf(b);
                return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
            });
        } else {
            order.sort();
        }

        const parts = order.map(function (k) {
            const list = buckets[k];
            const subKey = parentKey + "|" + k;
            const label = (childBy === "group") ? (GROUP_LABEL[k] || "Other") : k;
            const open = q ? true : !!state.openSub[subKey];
            const fit = slot ? countFit(list, slot) : 0;
            let rows = "";
            if (open) {
                const built = list.map(function (e) { return renderEntry(e, slot); }).filter(Boolean);
                rows = "<div class='sub-body'>" + (built.length ? built.join("")
                    : "<p class='panel-empty'>Nobody here can fill that slot.</p>") + "</div>";
            }
            return "<button class='posgroup' data-sub='" + esc(subKey) + "'>"
                + "<span class='caret'>" + (open ? "\u25BC" : "\u25B6") + "</span>"
                + esc(label)
                + "<span class='scount'>" + list.length
                + (slot && fit ? " <span class='sfit'>| " + fit + " in pos</span>" : "")
                + "</span></button>" + rows;
        });
        return "<div class='nation-body'>" + parts.join("") + "</div>";
    }

    // The Big Board is a priority list, not a filter. Its order decides
    // what auto-pick reaches for first when a turn expires, so it is shown
    // in that order and can be rearranged by dragging or with the arrows.
    function renderBoard(slot, q) {
        const rows = [];
        state.starred.forEach(function (key, i) {
            const p = findPlayerByKey(key);
            if (!p) return;
            const e = { key: key, name: p.name, country: p.country, versions: [p] };
            if (!matchesSearch(e, q)) return;
            rows.push({ key: key, player: p, index: i });
        });

        if (!state.starred.length) {
            $("panelBody").innerHTML = "<p class='panel-empty'>Your Big Board is empty. "
                + "Open Full Draft and star players to build a shortlist. "
                + "The order matters: if your turn runs out, the pick is taken from here, "
                + "highest first, for a position they actually play.</p>";
            return;
        }

        const html = "<p class='board-intro'>Drag to reorder, or use the arrows. "
            + "If your turn expires, the first player here who fits an empty position "
            + "and meets the rules is picked.</p>"
            + rows.map(function (r) {
                const p = r.player;
                const takenBy = state.taken[MPPicks.personKey(p)];
                const nat = MPPicks.naturalSlots(p).map(function (id) {
                    return MPPicks.slotById(id).label;
                });
                return "<div class='bb-row" + (takenBy ? " taken-row" : "") + "'"
                    + " draggable='" + (takenBy ? "false" : "true") + "' data-bb='" + esc(r.key) + "'>"
                    + "<span class='bb-rank'>" + (r.index + 1) + "</span>"
                    + "<span class='bb-grip'>&#8942;&#8942;</span>"
                    + "<span class='bb-info'><span class='bb-name'>" + esc(p.name) + "</span>"
                    + "<span class='bb-meta'>" + esc(p.country) + (p.year ? " " + p.year : "")
                    + (nat.length ? " | " + esc(nat.slice(0, 2).join(", ")) : "")
                    + (takenBy ? " | taken by " + esc(takenBy) : "") + "</span></span>"
                    + "<span class='bb-rate'>" + (p.rating || 0) + "</span>"
                    + pickBtnFor(p, slot, takenBy)
                    + "<span class='bb-move'>"
                    + "<button data-up='" + esc(r.key) + "'" + (r.index === 0 ? " disabled" : "") + ">&#9650;</button>"
                    + "<button data-down='" + esc(r.key) + "'" + (r.index === state.starred.length - 1 ? " disabled" : "") + ">&#9660;</button>"
                    + "</span>"
                    + "<button class='star on' data-star='" + esc(r.key) + "'>&#9733;</button>"
                    + "</div>";
            }).join("");
        $("panelBody").innerHTML = html || "<p class='panel-empty'>Nothing matches that search.</p>";
    }

    // The Big Board must be pickable, not just a list. When a slot is
    // selected, each eligible player gets a pick button exactly as in the
    // full draft.
    function pickBtnFor(p, slot, takenBy) {
        if (!slot || takenBy) return "";
        if (!state.isMyTurn || !state.live) return "";
        const v = MPPicks.evaluate(p, slot.id, state.squad, state.taken,
            state.relaxedNow ? [] : state.constraints, state.ruleCtx,
            (window.MPRules && MPRules.isPickLegal),
            MPPicks.coverageContext(state.pool, state.squad, state.constraints));
        if (!v.eligible) return "<span class='bb-no' title='" + esc(v.reason || "") + "'>&#10007;</span>";
        const pen = v.penalty ? " -" + v.penalty : "";
        return "<button class='take' data-take='" + esc(MPPicks.playerKey(p))
            + "'>Pick" + (pen ? "<small>" + pen + "</small>" : "") + "</button>";
    }

    function findPlayerByKey(key) {
        for (let i = 0; i < state.pool.length; i++) {
            if (MPPicks.playerKey(state.pool[i]) === key) return state.pool[i];
        }
        return null;
    }

    // Reordering
    function moveStar(key, delta) {
        const i = state.starred.indexOf(key);
        const j = i + delta;
        if (i === -1 || j < 0 || j >= state.starred.length) return;
        state.starred.splice(j, 0, state.starred.splice(i, 1)[0]);
        saveStars();
        renderList();
    }

    function dropStar(fromKey, toKey) {
        const i = state.starred.indexOf(fromKey);
        const j = state.starred.indexOf(toKey);
        if (i === -1 || j === -1 || i === j) return;
        state.starred.splice(j, 0, state.starred.splice(i, 1)[0]);
        saveStars();
        renderList();
    }

    // The ordered list of Big Board players, for auto-pick.
    function boardPlayers() {
        const out = [];
        state.starred.forEach(function (k) {
            const p = findPlayerByKey(k);
            if (p) out.push(p);
        });
        return out;
    }

    function renderEntry(entry, slot) {
        const versions = entry.versions;
        if (slot) {
            const anyAllowed = versions.some(function (v) { return !MPPicks.isForbidden(v, slot.node); });
            if (!anyAllowed) return "";          // front-row law: omit entirely
        }
        if (versions.length === 1) return row(versions[0], slot, false);

        const open = !!state.expanded[entry.key];
        const ratings = versions.map(function (v) { return v.rating; });
        const lo = Math.min.apply(null, ratings), hi = Math.max.apply(null, ratings);
        const gone = versions.filter(function (v) {
            return !!state.taken[MPPicks.personKey(v)];
        }).length;
        const allGone = gone === versions.length;
        const head = "<div class='prow" + (allGone ? " blocked taken" : "") + "'>"
            + starButton(versions[0])
            + "<div class='pinfo'><div class='pname'>" + esc(entry.name) + "</div>"
            + "<div class='pmeta'>" + esc(entry.country) + " | " + versions.length + " tournaments"
            + (gone ? " | <span class='gone'>" + gone + " taken</span>" : "") + "</div></div>"
            + "<div class='prate" + (lo === hi ? "" : " range") + "'>" + (lo === hi ? lo : lo + " to " + hi) + "</div>"
            + "<button class='chev' data-expand='" + esc(entry.key) + "'>" + (open ? "Hide" : "Versions") + "</button>"
            + "</div>";
        if (!open) return head;
        return head + "<div class='versions'>"
            + versions.map(function (v) { return row(v, slot, true); }).join("") + "</div>";
    }

    function row(p, slot, isVersion) {
        if (slot && MPPicks.isForbidden(p, slot.node)) return "";
        const base = p.rating || 0;
        const pen = slot ? MPPicks.oopPenalty(p, slot.node) : 0;
        const eff = Math.max(0, base - pen);

        // Taken state is independent of whether a slot is being picked, so
        // the list greys out the moment another user takes a player.
        const takenBy = state.taken[MPPicks.personKey(p)] || null;

        const v = slot
            ? MPPicks.evaluate(p, slot.id, state.squad, state.taken,
                state.relaxedNow ? [] : state.constraints,
                state.ruleCtx, (window.MPRules && MPRules.isPickLegal))
            : { eligible: !takenBy, reason: takenBy ? ("Taken by " + takenBy) : "" };

        const meta = esc(p.country) + (p.year ? " " + p.year : "")
            + (p.positions && p.positions.length ? " | " + esc(p.positions.join(", ")) : "")
            + (p.kicker ? " | <span class='kick'>Kicker</span>" : "")
            + (pen > 0 && !takenBy ? " | <span class='pen'>out of position, minus " + pen + "</span>" : "");

        const blocked = !!takenBy || (slot && !v.eligible);
        const why = takenBy ? ("Taken by " + takenBy) : (slot && !v.eligible ? v.reason : "");

        return "<div class='prow" + (blocked ? " blocked" : "") + (takenBy ? " taken" : "") + "'>"
            + starButton(p)
            + "<div class='pinfo'><div class='pname'>" + esc(isVersion ? (p.year || p.name) : p.name) + "</div>"
            + "<div class='pmeta'>" + meta + "</div>"
            + (why ? "<div class='why-not'>" + esc(why) + "</div>" : "")
            + "</div>"
            + "<div class='prate'>" + (slot ? eff : base)
            + (pen > 0 && !takenBy ? "<span class='was'>" + base + "</span>" : "") + "</div>"
            + (slot && v.eligible && !takenBy && (!state.live || state.isMyTurn)
                ? "<button class='take' data-take='" + esc(MPPicks.playerKey(p)) + "'>Pick</button>" : "")
            + "</div>";
    }

    function starButton(p) {
        const k = MPPicks.playerKey(p);
        const on = state.starred.indexOf(k) !== -1;
        return "<button class='star" + (on ? " on" : "") + "' data-star='" + esc(k) + "' "
            + "aria-label='" + (on ? "Remove from Big Board" : "Add to Big Board") + "'>"
            + (on ? "\u2605" : "\u2606") + "</button>";
    }

    // ── Actions ─────────────────────────────────────────────
    function findByKey(key) {
        for (let i = 0; i < state.pool.length; i++) {
            if (MPPicks.playerKey(state.pool[i]) === key) return state.pool[i];
        }
        return null;
    }

    function commitPick(key) {
        if (state.live && !state.isMyTurn) return;
        const idx = findIndexByKey(key);
        if (idx === -1 || !state.activeSlot) return;
        const p = state.pool[idx];
        const slotId = state.activeSlot;
        const v = MPPicks.evaluate(p, slotId, state.squad, state.taken,
            state.relaxedNow ? [] : state.constraints,
            state.ruleCtx, (window.MPRules && MPRules.isPickLegal));
        if (!v.eligible) return;

        if (state.live) {
            // Optimistic UI is wrong here: the server decides. Wait for the
            // write, then the room watcher repaints from shared state.
            setBusy(true);
            state.onPick(slotId, idx, function (err) {
                setBusy(false);
                if (err) { alert(err.message); return; }
                cancelPicking();
                setTab("xv");
            });
            return;
        }

        state.squad[slotId] = p;
        state.taken[MPPicks.personKey(p)] = "you";
        cancelPicking();
        renderTeamsheet();
        setTab("xv");
    }

    function setBusy(on) {
        const b = $("panelBody");
        if (b) b.style.opacity = on ? "0.5" : "";
    }

    function findIndexByKey(key) {
        for (let i = 0; i < state.pool.length; i++) {
            if (MPPicks.playerKey(state.pool[i]) === key) return i;
        }
        return -1;
    }

    function toggleStar(key) {
        const i = state.starred.indexOf(key);
        if (i === -1) state.starred.push(key); else state.starred.splice(i, 1);
        saveStars();
        renderBoardBadge();
        renderList();
    }

    // ── Wiring ──────────────────────────────────────────────
    function wire() {
        $("tabXV").addEventListener("click", function () { setTab("xv"); });
        $("tabBoard").addEventListener("click", function () { setTab("board"); });
        $("tabAll").addEventListener("click", function () { setTab("all"); });
        $("tabPicks").addEventListener("click", function () { setTab("picks"); });
        $("bannerCancel").addEventListener("click", cancelPicking);
        if (devEnabled()) {
            const bar = $("devBar");
            if (bar) bar.classList.remove("hidden");
            const b = $("autoPickBtn");
            if (b) b.addEventListener("click", toggleAuto);
        }
        $("axisNation").addEventListener("click", function () { setAxis("nation"); });
        $("axisPosition").addEventListener("click", function () { setAxis("position"); });

        $("teamsheet").addEventListener("click", function (e) {
            const btn = e.target.closest(".slot");
            if (!btn || btn.classList.contains("filled")) return;
            if (state.live && !state.isMyTurn) return;   // read-only off-turn
            startPicking(btn.getAttribute("data-slot"));
        });

        $("panelSearch").addEventListener("input", function (e) {
            state.search = e.target.value; renderList();
        });

        // Big Board reordering: arrows for reliability, drag for speed.
        $("panelBody").addEventListener("click", function (e) {
            const up = e.target.closest("[data-up]");
            if (up) { moveStar(up.getAttribute("data-up"), -1); return; }
            const down = e.target.closest("[data-down]");
            if (down) { moveStar(down.getAttribute("data-down"), 1); return; }
        });

        let dragKey = null;
        $("panelBody").addEventListener("dragstart", function (e) {
            const row = e.target.closest("[data-bb]");
            if (!row) return;
            dragKey = row.getAttribute("data-bb");
            row.classList.add("dragging");
            try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", dragKey); } catch (x) {}
        });
        $("panelBody").addEventListener("dragover", function (e) {
            const row = e.target.closest("[data-bb]");
            if (!row || !dragKey) return;
            e.preventDefault();
            row.classList.add("over");
        });
        $("panelBody").addEventListener("dragleave", function (e) {
            const row = e.target.closest("[data-bb]");
            if (row) row.classList.remove("over");
        });
        $("panelBody").addEventListener("drop", function (e) {
            const row = e.target.closest("[data-bb]");
            if (!row || !dragKey) return;
            e.preventDefault();
            row.classList.remove("over");
            dropStar(dragKey, row.getAttribute("data-bb"));
            dragKey = null;
        });
        $("panelBody").addEventListener("dragend", function () {
            dragKey = null;
            const d = $("panelBody").querySelector(".dragging");
            if (d) d.classList.remove("dragging");
        });

        $("panelBody").addEventListener("click", function (e) {
            const sub = e.target.closest("[data-sub]");
            if (sub) {
                const k = sub.getAttribute("data-sub");
                state.openSub[k] = !state.openSub[k];
                renderList();
                return;
            }
            const grp = e.target.closest("[data-group]");
            if (grp) {
                const k = grp.getAttribute("data-group");
                state.openGroups[k] = !state.openGroups[k];
                renderList();
                return;
            }
            const nat = e.target.closest("[data-nation]");
            if (nat) {
                const n = nat.getAttribute("data-nation");
                state.openNations[n] = !state.openNations[n];
                renderList();
                return;
            }
            const star = e.target.closest("[data-star]");
            if (star) { toggleStar(star.getAttribute("data-star")); return; }
            const chev = e.target.closest("[data-expand]");
            if (chev) {
                const k = chev.getAttribute("data-expand");
                state.expanded[k] = !state.expanded[k];
                renderList();
                return;
            }
            const take = e.target.closest("[data-take]");
            if (take) commitPick(take.getAttribute("data-take"));
        });
    }

    function esc(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    }

    return {
        init: init, wire: wire, applyRoom: applyRoom, stopAuto: stopAuto,
        renderTeamsheet: renderTeamsheet,
        squad: function () { return state.squad; },
        starred: function () { return state.starred; }
    };
})();
