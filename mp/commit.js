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

    function rateLabel(pct) {
        if (pct >= 82) return "elite";
        if (pct >= 70) return "reliable";
        if (pct >= 60) return "shaky";
        if (pct >= 50) return "not a kicker";
        return "a forward on the tee";
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
        $("cOverall").textContent = Math.round(u.fwd * w + u.bck * (1 - w));
        const pct = Math.round(w * 100);
        $("strategyHint").textContent = "Forwards carry " + pct + "% of the weight, backs "
            + (100 - pct) + "%. This locks for the whole competition.";
    }

    // ── Kicker list ─────────────────────────────────────────
    function renderKickers() {
        const rows = MPPicks.SLOTS.map(function (s) {
            const p = state.squad[s.id];
            if (!p) return "";
            const rate = kickerRate(p);
            const chosen = state.kickerSlot === s.id;
            return "<button class='kicker" + (chosen ? " chosen" : "") + "' data-kicker='" + s.id + "'"
                + (state.locked ? " disabled" : "") + ">"
                + "<span class='knum'>" + s.num + "</span>"
                + "<span class='kinfo'><span class='kname'>" + esc(p.name) + "</span>"
                + "<span class='kmeta'>" + esc(p.country) + (p.year ? " " + p.year : "")
                + " | " + esc(s.label) + "</span></span>"
                + "<span class='krate'>" + rate + "%<span class='klbl'>" + rateLabel(rate) + "</span></span>"
                + "</button>";
        }).join("");
        $("kickerList").innerHTML = rows;
    }

    function renderWaiting() {
        const uids = Object.keys(state.members);
        const outstanding = uids.filter(function (u) { return !state.commits[u]; });
        if (!state.locked) { $("commitWaiting").classList.add("hidden"); return; }
        $("commitWaiting").classList.remove("hidden");
        if (!outstanding.length) {
            $("commitMembers").innerHTML = "<li><span class='mname'>Everyone is ready</span></li>";
            return;
        }
        $("commitMembers").innerHTML = outstanding.map(function (u) {
            const m = state.members[u] || {};
            return "<li style='--mk1:" + (m.kit || "#6E8CA6") + ";--mk2:" + (m.kit2 || "transparent") + "'>"
                + "<span class='dot " + (m.connected ? "on" : "") + "'></span>"
                + "<span class='mname'>" + esc(m.name || "User") + "</span></li>";
        }).join("");
    }

    function refresh() {
        renderRatings();
        renderKickers();
        renderWaiting();
        $("commitBtn").disabled = state.locked || !state.kickerSlot;
        $("strategy").disabled = state.locked;
        if (state.locked) {
            $("commitBtn").querySelector("span").textContent = "Locked in";
        }
    }

    // ── Public ──────────────────────────────────────────────
    function show(opts) {
        state.squad = opts.squad;
        state.members = opts.members || {};
        state.commits = opts.commits || {};
        state.myUid = opts.myUid;
        state.code = opts.code;
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

    function wire(onLocked) {
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
            const rate = kickerRate(p);
            const warn = rate < 60
                ? "\n\n" + p.name + " is not a recognised kicker (" + rate + "%). "
                  + "That will cost you the close games."
                : "";
            if (!window.confirm("Lock in " + p.name + " as your goal kicker and this strategy?"
                + "\n\nNeither can be changed for the whole competition." + warn)) return;
            $("commitBtn").disabled = true;
            MPNet.submitCommit(state.code, state.kickerSlot, state.strategy)
                .then(function () {
                    state.locked = true;
                    refresh();
                    if (onLocked) onLocked();
                })
                .catch(function (err) {
                    $("commitStatus").textContent = err.message;
                    $("commitStatus").classList.add("err");
                    $("commitBtn").disabled = false;
                });
        });
    }

    function esc(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    }

    return {
        show: show, update: update, wire: wire,
        strategyForwardWeight: strategyForwardWeight,
        kickerRate: kickerRate
    };
})();
