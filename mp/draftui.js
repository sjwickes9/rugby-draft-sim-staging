// ============================================================
// RUGBY XV DRAFT: DRAFT UI
// Slice 6: slot-first team sheet and player selection panel
// (spec sections 8 and 9)
// ============================================================
// Guiding principle from spec 9: never rank the candidates for the
// user. The full list is sorted by nation then surname, never by
// rating. Ratings are shown so a player can be judged once found,
// but they are not a sort key. Finding the right player is the skill.
//
// UK English. No em dashes or en dashes.
// ============================================================

window.MPDraftUI = (function () {
    const $ = function (id) { return document.getElementById(id); };

    const state = {
        pool: [],          // room pool snapshot
        squad: null,       // { slotId: player }
        taken: {},         // playerKey -> user name
        starred: [],       // player keys, the Big Board
        activeSlot: null,  // slot id currently being filled
        tab: "all",        // "all" | "board"
        search: "",
        expanded: {},      // name key -> true, for multi-tournament chevrons
        constraints: [],
        ruleCtx: null,
        onPick: null       // callback(slotId, player)
    };

    // ── Setup ───────────────────────────────────────────────
    function init(opts) {
        state.pool = opts.pool || [];
        state.squad = opts.squad || MPPicks.emptySquad();
        state.taken = opts.taken || {};
        state.starred = opts.starred || [];
        state.constraints = opts.constraints || [];
        state.ruleCtx = opts.ruleCtx || null;
        state.onPick = opts.onPick || null;
        buildIndex();
        renderTeamsheet();
    }

    // ── Pool index: nation, then surname ────────────────────
    // Deliberately not rating. Stable, learnable, and gives no
    // ranking signal (spec 9).
    let byNation = [];      // [{ nation, players: [entry] }]
    let groupedPlayers = {}; // nameKey -> [entries] for multi-tournament

    function surname(name) {
        const parts = String(name).trim().split(/\s+/);
        return parts.length > 1 ? parts[parts.length - 1] : parts[0];
    }

    function nameKey(p) { return p.country + "|" + p.name; }

    function buildIndex() {
        // Collapse to one row per player, keeping their versions.
        groupedPlayers = {};
        state.pool.forEach(function (p) {
            const k = nameKey(p);
            (groupedPlayers[k] = groupedPlayers[k] || []).push(p);
        });

        const nations = {};
        Object.keys(groupedPlayers).forEach(function (k) {
            const versions = groupedPlayers[k];
            const first = versions[0];
            (nations[first.country] = nations[first.country] || []).push({
                key: k,
                name: first.name,
                country: first.country,
                versions: versions.slice().sort(function (a, b) {
                    return String(a.year).localeCompare(String(b.year));
                })
            });
        });

        byNation = Object.keys(nations).sort().map(function (n) {
            return {
                nation: n,
                players: nations[n].sort(function (a, b) {
                    const sa = surname(a.name).toLowerCase(), sb = surname(b.name).toLowerCase();
                    return sa === sb ? a.name.localeCompare(b.name) : sa.localeCompare(sb);
                })
            };
        });
    }

    // ── Team sheet ──────────────────────────────────────────
    function renderTeamsheet() {
        const sq = state.squad;
        const filled = MPPicks.filledSlots(sq).length;
        $("squadProgress").textContent = filled + " of 15 picked";

        $("teamsheet").innerHTML = MPPicks.SLOTS.map(function (s) {
            const p = sq[s.id];
            if (!p) {
                return "<button class='slot' data-slot='" + s.id + "'>"
                    + "<span class='snum'>" + s.num + "</span>"
                    + "<span class='slabel'>" + s.label + "</span>"
                    + "<span class='empty-hint'>Tap to pick</span>"
                    + "</button>";
            }
            const pen = MPPicks.oopPenalty(p, s.node);
            const eff = Math.max(0, (p.rating || 0) - pen);
            return "<div class='slot filled" + (pen > 0 ? " oop" : "") + "' data-slot='" + s.id + "'>"
                + "<span class='snum'>" + s.num + "</span>"
                + "<span class='slabel'>" + s.label + "</span>"
                + "<span class='sname'>" + esc(p.name)
                + (p.kicker ? " <span class='kick' title='Recognised kicker'>K</span>" : "")
                + "<span class='smeta'>" + esc(p.country) + (p.year ? " " + p.year : "")
                + (pen > 0 ? " <span class='oop-tag'>out of position, minus " + pen + "</span>" : "")
                + "</span></span>"
                + "<span class='srating'>" + eff + "</span>"
                + "</div>";
        }).join("");
    }

    // ── Panel ───────────────────────────────────────────────
    function openPanel(slotId) {
        state.activeSlot = slotId;
        state.search = "";
        $("panelSearch").value = "";
        const slot = MPPicks.slotById(slotId);
        $("panelSlot").textContent = slot.num + ". " + slot.label;
        $("panelSub").textContent = "Choose a player. Ratings shown are for this slot.";
        $("pickPanel").classList.remove("hidden");
        $("panelScrim").classList.remove("hidden");
        renderPanel();
        // Scroll to the slot's own position group, so the relevant
        // players are presented first (spec 9). The user is free to
        // scroll away and take someone listed elsewhere.
        setTimeout(scrollToNaturalGroup, 30);
    }

    function closePanel() {
        $("pickPanel").classList.add("hidden");
        $("panelScrim").classList.add("hidden");
        state.activeSlot = null;
    }

    function setTab(tab) {
        state.tab = tab;
        $("tabBoard").setAttribute("aria-pressed", String(tab === "board"));
        $("tabAll").setAttribute("aria-pressed", String(tab === "all"));
        renderPanel();
    }

    // Find the first nation heading containing a player whose natural
    // position matches this slot, and scroll it into view.
    function scrollToNaturalGroup() {
        const body = $("panelBody");
        const first = body.querySelector("[data-natural='1']");
        if (first) {
            const head = first.closest("[data-nation]");
            const target = head || first;
            body.scrollTop = Math.max(0, target.offsetTop - body.offsetTop - 8);
        }
    }

    function matchesSearch(entry, q) {
        if (!q) return true;
        const hay = (entry.name + " " + entry.country + " "
            + entry.versions.map(function (v) { return v.year; }).join(" ")).toLowerCase();
        return hay.indexOf(q) !== -1;
    }

    function renderPanel() {
        const slotId = state.activeSlot;
        if (!slotId) return;
        const slot = MPPicks.slotById(slotId);
        const q = state.search.trim().toLowerCase();
        const body = $("panelBody");

        if (state.tab === "board") {
            renderBoard(slot, q, body);
            return;
        }

        // Full list, grouped by nation, surname order within.
        const chunks = [];
        byNation.forEach(function (group) {
            const rows = [];
            group.players.forEach(function (entry) {
                if (!matchesSearch(entry, q)) return;
                const html = renderPlayerEntry(entry, slot);
                if (html) rows.push(html);
            });
            if (rows.length) {
                chunks.push("<div data-nation='" + esc(group.nation) + "'>"
                    + "<div class='nation-head'>" + esc(group.nation) + "</div>"
                    + rows.join("") + "</div>");
            }
        });
        body.innerHTML = chunks.length ? chunks.join("")
            : "<p class='panel-empty'>No players match that search.</p>";
    }

    function renderBoard(slot, q, body) {
        // The Big Board: the user's starred players, grouped by the
        // position they are natural in, so it reads like a shortlist.
        const starredEntries = [];
        Object.keys(groupedPlayers).forEach(function (k) {
            const versions = groupedPlayers[k].filter(function (v) {
                return state.starred.indexOf(MPPicks.playerKey(v)) !== -1;
            });
            if (!versions.length) return;
            const entry = { key: k, name: versions[0].name, country: versions[0].country, versions: versions };
            if (matchesSearch(entry, q)) starredEntries.push(entry);
        });

        if (!starredEntries.length) {
            body.innerHTML = "<p class='panel-empty'>Your Big Board is empty. "
                + "Star players in the full list to build a shortlist, "
                + "before or during the draft.</p>";
            return;
        }
        // Group by the first natural slot label.
        const groups = {};
        starredEntries.forEach(function (entry) {
            const nat = MPPicks.naturalSlots(entry.versions[0]);
            const label = nat.length ? MPPicks.slotById(nat[0]).label : "Other";
            (groups[label] = groups[label] || []).push(entry);
        });
        body.innerHTML = Object.keys(groups).map(function (label) {
            return "<div><div class='nation-head'>" + esc(label) + "</div>"
                + groups[label].map(function (e) { return renderPlayerEntry(e, slot, true); }).filter(Boolean).join("")
                + "</div>";
        }).join("");
    }

    // One row per player. Multi-tournament players get a chevron that
    // reveals each version with its own rating and pick button.
    function renderPlayerEntry(entry, slot, isBoard) {
        const versions = entry.versions;
        const single = versions.length === 1;

        // Front-row law: if every version is forbidden here, omit entirely.
        const anyAllowed = versions.some(function (v) { return !MPPicks.isForbidden(v, slot.node); });
        if (!anyAllowed) return "";

        const natural = MPPicks.naturalSlots(versions[0]).indexOf(slot.id) !== -1 ? "1" : "0";

        if (single) return versionRow(versions[0], slot, entry, natural, false);

        const open = !!state.expanded[entry.key];
        const ratings = versions.map(function (v) { return v.rating; });
        const lo = Math.min.apply(null, ratings), hi = Math.max.apply(null, ratings);
        const head = "<div class='prow' data-natural='" + natural + "'>"
            + starButton(versions[0])
            + "<div class='pinfo'><div class='pname'>" + esc(entry.name) + "</div>"
            + "<div class='pmeta'>" + esc(entry.country) + " | " + versions.length + " tournaments</div></div>"
            + "<div class='prate'>" + (lo === hi ? lo : lo + " to " + hi) + "</div>"
            + "<button class='chev' data-expand='" + esc(entry.key) + "'>" + (open ? "Hide" : "Versions") + "</button>"
            + "</div>";
        if (!open) return head;
        return head + "<div class='versions'>"
            + versions.map(function (v) { return versionRow(v, slot, entry, "0", true); }).join("")
            + "</div>";
    }

    function versionRow(p, slot, entry, natural, isVersion) {
        if (MPPicks.isForbidden(p, slot.node)) return "";
        const v = MPPicks.evaluate(p, slot.id, state.squad, state.taken,
            state.constraints, state.ruleCtx, (window.MPRules && MPRules.isPickLegal));
        const pen = MPPicks.oopPenalty(p, slot.node);
        const base = p.rating || 0;
        const eff = Math.max(0, base - pen);

        const meta = esc(p.country) + (p.year ? " " + p.year : "")
            + (p.positions && p.positions.length ? " | " + esc(p.positions.join(", ")) : "")
            + (p.kicker ? " | <span class='kick'>Kicker</span>" : "")
            + (pen > 0 ? " | <span class='pen'>out of position, minus " + pen + "</span>" : "");

        return "<div class='prow" + (v.eligible ? "" : " blocked") + "' data-natural='" + natural + "'>"
            + starButton(p)
            + "<div class='pinfo'>"
            + "<div class='pname'>" + esc(isVersion ? (p.year || p.name) : p.name) + "</div>"
            + "<div class='pmeta'>" + meta + "</div>"
            + (v.eligible ? "" : "<div class='why-not'>" + esc(v.reason) + "</div>")
            + "</div>"
            + "<div class='prate'>" + eff + (pen > 0 ? "<span class='was'>" + base + "</span>" : "") + "</div>"
            + (v.eligible ? "<button class='take' data-take='" + esc(MPPicks.playerKey(p)) + "'>Pick</button>" : "")
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
        const p = findByKey(key);
        if (!p || !state.activeSlot) return;
        const slotId = state.activeSlot;
        const v = MPPicks.evaluate(p, slotId, state.squad, state.taken,
            state.constraints, state.ruleCtx, (window.MPRules && MPRules.isPickLegal));
        if (!v.eligible) return;
        state.squad[slotId] = p;
        state.taken[MPPicks.playerKey(p)] = "you";
        closePanel();
        renderTeamsheet();
        if (state.onPick) state.onPick(slotId, p);
    }

    function toggleStar(key) {
        const i = state.starred.indexOf(key);
        if (i === -1) state.starred.push(key); else state.starred.splice(i, 1);
        renderPanel();
    }

    // ── Wiring ──────────────────────────────────────────────
    function wire() {
        $("teamsheet").addEventListener("click", function (e) {
            const btn = e.target.closest(".slot");
            if (!btn || btn.classList.contains("filled")) return;
            openPanel(btn.getAttribute("data-slot"));
        });
        $("panelClose").addEventListener("click", closePanel);
        $("panelScrim").addEventListener("click", closePanel);
        $("tabBoard").addEventListener("click", function () { setTab("board"); });
        $("tabAll").addEventListener("click", function () { setTab("all"); });
        $("panelSearch").addEventListener("input", function (e) {
            state.search = e.target.value; renderPanel();
        });
        $("panelBody").addEventListener("click", function (e) {
            const star = e.target.closest("[data-star]");
            if (star) { toggleStar(star.getAttribute("data-star")); return; }
            const chev = e.target.closest("[data-expand]");
            if (chev) {
                const k = chev.getAttribute("data-expand");
                state.expanded[k] = !state.expanded[k];
                renderPanel();
                return;
            }
            const take = e.target.closest("[data-take]");
            if (take) commitPick(take.getAttribute("data-take"));
        });
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && state.activeSlot) closePanel();
        });
    }

    function esc(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    }

    return {
        init: init,
        wire: wire,
        openPanel: openPanel,
        renderTeamsheet: renderTeamsheet,
        squad: function () { return state.squad; },
        starred: function () { return state.starred; }
    };
})();
