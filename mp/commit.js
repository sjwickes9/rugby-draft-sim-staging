// ============================================================
// RUGBY XV DRAFT: COMMITMENT SCREEN
// Slice 8: kicker nomination and strategy slider (spec 10, 18)
// ============================================================
// The draft ends, then one screen with two irreversible choices, both
// made before you know your fixtures. The strategy weighting is a
// verbatim port of strategyForwardWeight from the single-player app.js:
// inherit the existing scheme, do not invent a second scale.
//
// UK English. No em dashes or en dashes.
// ============================================================

window.MPCommit = (function () {
    const $ = function (id) { return document.getElementById(id); };

    const state = {
        squad: null,
        members: {},
        commits: {},
        myUid: null,
        code: null,
        hostUid: null,
        onLocked: null,
        kickerSlot: null,
        strategy: 50,
        locked: false
    };

    // Verbatim from app.js. 0 gives forwards 0.75 of the weight, 100 gives
    // them 0.25, 50 is balanced.
    function strategyForwardWeight(v) {
        return 0.75 - (v / 100) * 0.50;
    }

    // Success rates from spec section 10. Out-of-position placement does
    // not affect kicking: a recognised kicker is a kicker wherever he plays.
    function kickerRate(player) {
        if (!player) return 0;
        const r = player.rating || 0;
        if (player.kicker) {
            if (r >= 95) return 85;
            if (r >= 85) return 76;
            if (r >= 78) return 72;
            return 64;
        }
        const groups = MPPicks.playerGroups(player);
        const isForward = groups.some(function (g) {
            return g === "front-row" || g === "lock" || g === "back-row";
        });
        return isForward ? 40 : 50;
    }

    // ── Ratings ─────────────────────────────────────────────
    function unitRatings() {
        let fwd = 0, fwdN = 0, bck = 0, bckN = 0;
        MPPicks.SLOTS.forEach(function (s) {
            const p = state.squad[s.id];
            if (!p) return;
            const eff = Math.max(0, (p.rating || 0) - MPPicks.oopPenalty(p, s.node));
            if (s.num <= 8) { fwd += eff; fwdN++; } else { bck += eff; bckN++; }
        });
        return {
            fwd: fwdN ? Math.round(fwd / fwdN) : 0,
            bck: bckN ? Math.round(bck / bckN) : 0
        };
    }

    function renderRatings() {
        const u = unitRatings();
        const w = strategyForwardWeight(state.strategy);
        $("cFwd").textContent = u.fwd;
        $("cBck").textContent = u.bck;
        const base = Math.round(u.fwd * w + u.bck * (1 - w));

        // An illegal squad still plays, but it is penalised, and the user
        // must be able to see that before they lock in.
        let breaches = [];
        try {
            breaches = MPSim.squadBreaches(state.squad, state.pool || [], state.constraints || []);
        } catch (e) {}
        const penalty = MPSim.breachPenalty(breaches);
        // Chemistry is shown as a separate addition rather than folded in,
        // so it is obvious what the links are actually worth.
        let chemAdd = 0;
        if (typeof MPChem !== "undefined") {
            chemAdd = MPChem.bonus(state.squad, base, {
                mode: state.roomMode || "career",
                tournamentCount: state.tournamentCount || 99
            }).applied;
        }
        const core = Math.max(0, base - penalty);
        $("cOverall").innerHTML = core
            + (chemAdd ? " <span class='chem-add'>+" + chemAdd.toFixed(1) + "</span>" : "");

        const pen = $("penaltyNote");
        if (pen) {
            if (!penalty) { pen.classList.add("hidden"); }
            else {
                pen.classList.remove("hidden");
                pen.innerHTML = "<strong>Illegal XV: you cannot win this competition</strong>"
                    + "<span class='pen-line'>Your side still plays and its results still count "
                    + "for everyone else, but it is not eligible for the title.</span>"
                    + breaches.map(function (b) {
                        return "<span class='pen-line'>" + esc(b.rule) + ": " + esc(b.detail) + "</span>";
                    }).join("")
                    + "<span class='pen-line'>Rating penalty: minus " + penalty + ".</span>";
            }
        }
        const pct = Math.round(w * 100);
        $("strategyHint").textContent = "Forwards carry " + pct + "% of the weight, backs "
            + (100 - pct) + "%. This locks for the whole competition.";
    }

    // ── Kicker list ─────────────────────────────────────────
    // Which slots are part of a formed link, and how strong. Used to tint
    // the kicker list so the partnerships are visible while choosing.
    function chemBySlot() {
        const out = {};
        if (typeof MPChem === "undefined") return out;
        const a = MPChem.analyse(state.squad, {
            mode: state.roomMode || "career",
            tournamentCount: state.tournamentCount || 99
        });
        a.links.forEach(function (l) {
            if (l.tier === "none") return;
            // For any-two groups, only the pair that actually linked counts.
            const names = l.players;
            l.slots.forEach(function (id) {
                const p = state.squad[id];
                if (!p || names.indexOf(p.name) === -1) return;
                if (l.tier === "full" || !out[id]) out[id] = l.tier;
            });
        });
        return out;
    }

    function renderKickers() {
        const link = chemBySlot();
        const rows = MPPicks.SLOTS.map(function (s) {
            const p = state.squad[s.id];
            if (!p) return "";
            const chosen = state.kickerSlot === s.id;
            const tier = link[s.id];
            // No success rate and no kicker mark here on purpose. Knowing who
            // could kick is part of the skill, so the choice is made on your
            // own knowledge rather than a number on the screen.
            return "<button class='kicker" + (chosen ? " chosen" : "")
                + (tier === "full" ? " linked" : (tier === "half" ? " linked-half" : ""))
                + "' data-kicker='" + s.id + "'"
                + (state.locked ? " disabled" : "") + ">"
                + "<span class='knum'>" + s.num + "</span>"
                + "<span class='kinfo'><span class='kname'>" + esc(p.name) + "</span>"
                + "<span class='kmeta'>" + esc(p.country) + (p.year ? " " + p.year : "")
                + " | " + esc(s.label) + "</span></span>"
                + "<span class='ktick'>" + (chosen ? "\u2713" : "") + "</span>"
                + "</button>";
        }).join("");
        $("kickerList").innerHTML = rows;

        // A short summary above the list, so the tinting is explained.
        const el = $("commitChem");
        if (el && typeof MPChem !== "undefined") {
            const b = MPChem.bonus(state.squad, 80, {
                mode: state.roomMode || "career",
                tournamentCount: state.tournamentCount || 99
            });
            el.innerHTML = "<span class='chem-title'>Chemistry</span>"
                + "<span class='chem-chips'>"
                + b.links.map(function (l) {
                    return "<span class='chem-chip " + l.tier + "'>" + l.label + "</span>";
                }).join("")
                + "</span><span class='chem-score'>" + b.formed + "/7</span>";
        }
    }

    function renderWaiting() {
        const uids = Object.keys(state.members);
        const outstanding = uids.filter(function (u) { return !state.commits[u]; });
        if (!state.locked) { $("commitWaiting").classList.add("hidden"); return; }
        $("commitWaiting").classList.remove("hidden");
        const isHost = state.hostUid === state.myUid;
        const btn = $("startComp");
        if (!outstanding.length) {
            $("commitMembers").innerHTML = "<li><span class='mname'>Everyone is ready</span></li>";
            if (btn) {
                btn.classList.toggle("hidden", !isHost);
                $("startCompHint").textContent = isHost
                    ? "" : "Waiting for the host to start the tournament.";
            }
            return;
        }
        if (btn) { btn.classList.add("hidden"); $("startCompHint").textContent = ""; }
        $("commitMembers").innerHTML = outstanding.map(function (u) {
            const m = state.members[u] || {};
            return "<li style='--mk1:" + (m.kit || "#6E8CA6") + ";--mk2:" + (m.kit2 || "transparent") + "'>"
                + "<span class='dot " + (m.connected ? "on" : "") + "'></span>"
                + "<span class='mname'>" + esc(m.name || "User") + "</span></li>";
        }).join("");
    }

    function refresh() {
        const fc = $("forceCommit");
        if (fc) {
            const uids = Object.keys(state.members || {});
            const out = uids.filter(function (u) { return !state.commits[u]; });
            const amHost = state.hostUid === (window.MPNet && MPNet.currentUid());
            fc.classList.toggle("hidden", !(amHost && state.locked && out.length));
        }
        renderRatings();
        renderKickers();
        renderWaiting();
        $("commitBtn").disabled = state.locked || !state.kickerSlot;
        const st = $("kickerState");
        if (st) {
            st.textContent = state.kickerSlot ? "Chosen" : "Required";
            st.classList.toggle("chosen", !!state.kickerSlot);
        }
        const kl = $("kickerList");
        if (kl) kl.classList.toggle("needed", !state.kickerSlot && !state.locked);
        const why = $("commitWhy");
        if (why) {
            if (state.locked) {
                const uids = Object.keys(state.members || {});
                const out = uids.filter(function (u) { return !state.commits[u]; })
                    .map(function (u) { return (state.members[u] || {}).name || "User"; });
                why.textContent = out.length
                    ? "Locked in. Waiting for " + out.join(", ") + "."
                    : "Locked in. Everyone is ready.";
            }
            else if (!state.kickerSlot) why.textContent = "Choose your goal kicker above to continue.";
            else why.textContent = "Ready. Neither choice can be changed afterwards.";
        }
        $("strategy").disabled = state.locked;
        if (state.locked) {
            $("commitBtn").querySelector("span").textContent = "Locked in";
        }
    }

    // ── Public ──────────────────────────────────────────────
    // Reset everything that belongs to a single competition. Without this
    // the previous room's kicker, strategy and locked flag leak into the
    // next one, which made the screen think you had already committed.
    function reset() {
        state.squad = null;
        state.commits = {};
        state.kickerSlot = null;
        state.strategy = 50;
        state.locked = false;
        const sl = $("strategy");
        if (sl) { sl.value = 50; sl.disabled = false; }
        const btn = $("commitBtn");
        if (btn) {
            btn.disabled = true;
            const sp = btn.querySelector("span");
            if (sp) sp.textContent = "Lock in and kick off";
        }
        const sc = $("startComp");
        if (sc) { sc.classList.add("hidden"); sc.disabled = false; }
        const cs = $("commitStatus");
        if (cs) { cs.textContent = ""; cs.classList.remove("err"); }
    }

    function show(opts) {
        reset();
        state.squad = opts.squad;
        state.members = opts.members || {};
        state.commits = opts.commits || {};
        state.myUid = opts.myUid;
        state.code = opts.code;
        state.hostUid = opts.hostUid || null;
        state.pool = opts.pool || [];
        state.constraints = opts.constraints || [];
        const mine = state.commits[state.myUid];
        if (mine) {
            state.locked = true;
            state.kickerSlot = mine.kickerSlot;
            state.strategy = mine.strategy;
            $("strategy").value = mine.strategy;
        }
        refresh();
    }

    function update(opts) {
        state.members = opts.members || state.members;
        state.hostUid = opts.hostUid || state.hostUid;
        state.commits = opts.commits || {};
        if (state.commits[state.myUid] && !state.locked) {
            state.locked = true;
            const mine = state.commits[state.myUid];
            state.kickerSlot = mine.kickerSlot;
            state.strategy = mine.strategy;
            $("strategy").value = mine.strategy;
        }
        refresh();
    }

    function wire(onLocked, onStarted) {
        state.onLocked = onLocked;
        const sc = $("startComp");
        if (sc) sc.addEventListener("click", function () {
            sc.disabled = true;
            $("startCompHint").textContent = "Building the fixture list...";
            MPNet.startCompetition(state.code)
                .then(function () { if (onStarted) onStarted(); })
                .catch(function (err) {
                    $("startCompHint").textContent = err.message;
                    sc.disabled = false;
                });
        });
        $("kickerList").addEventListener("click", function (e) {
            const b = e.target.closest("[data-kicker]");
            if (!b || state.locked) return;
            state.kickerSlot = b.getAttribute("data-kicker");
            refresh();
        });
        $("strategy").addEventListener("input", function (e) {
            if (state.locked) return;
            state.strategy = +e.target.value;
            renderRatings();
        });
        $("commitBtn").addEventListener("click", function () {
            if (state.locked || !state.kickerSlot) return;
            const p = state.squad[state.kickerSlot];
            const pct = Math.round(strategyForwardWeight(state.strategy) * 100);
            let breaches = [];
            try {
                breaches = MPSim.squadBreaches(state.squad, state.pool || [], state.constraints || []);
            } catch (e) {}
            const illegalWarn = breaches.length
                ? "<span class='warn'>Your XV breaks the room rules, so it cannot win this "
                  + "competition and carries a rating penalty of minus "
                  + MPSim.breachPenalty(breaches) + ".</span>"
                : "";
            window.MPModal({
                title: "Lock in your choices?",
                body: "<strong>" + esc(p.name) + "</strong> takes the goal kicks, and your forwards "
                    + "carry <strong>" + pct + "%</strong> of the weight."
                    + "<span class='warn'>Neither can be changed for the whole competition.</span>"
                    + illegalWarn,
                ok: "Lock in", cancel: "Go back"
            }).then(function (yes) { if (yes) doLock(); });
        });
    }

    function doLock() {
        $("commitBtn").disabled = true;
        MPNet.submitCommit(state.code, state.kickerSlot, state.strategy)
            .then(function () {
                state.locked = true;
                refresh();
                if (state.onLocked) state.onLocked();
            })
            .catch(function (err) {
                $("commitStatus").textContent = err.message;
                $("commitStatus").classList.add("err");
                $("commitBtn").disabled = false;
            });
    }

    function esc(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    }

    return {
        show: show, update: update, wire: wire, reset: reset,
        strategyForwardWeight: strategyForwardWeight,
        kickerRate: kickerRate
    };
})();
