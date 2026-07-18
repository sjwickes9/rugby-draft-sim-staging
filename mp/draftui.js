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
    const STAR_KEY = "mp-bigboard";
    const AXIS_KEY = "mp-list-axis";

    const state = {
        pool: [],
        squad: null,
        taken: {},
        starred: [],
        activeSlot: null,   // null = browsing, otherwise picking for this slot
        tab: "xv",          // "xv" | "board" | "all"
        search: "",
        axis: "nation",     // "nation" | "position", remembered
        openNations: {},    // nation -> true
        openGroups: {},     // position group -> true
        expanded: {},       // player key -> true (version chevron)
        constraints: [],
        ruleCtx: null,
        onPick: null
    };

    let byNation = [];
    let groupedPlayers = {};

    // ── Setup ───────────────────────────────────────────────
    function init(opts) {
        state.pool = opts.pool || [];
        state.squad = opts.squad || MPPicks.emptySquad();
        state.taken = opts.taken || {};
        state.starred = loadStars();
        state.axis = loadAxis();
        state.constraints = opts.constraints || [];
        state.ruleCtx = opts.ruleCtx || null;
        state.onPick = opts.onPick || null;
        buildIndex();
        renderAxis();
        setTab("xv");
        renderTeamsheet();
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

    function loadStars() {
        try { return JSON.parse(localStorage.getItem(STAR_KEY) || "[]"); }
        catch (e) { return []; }
    }
    function saveStars() {
        try { localStorage.setItem(STAR_KEY, JSON.stringify(state.starred)); } catch (e) {}
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

    function primaryGroup(p) {
        const gs = MPPicks.playerGroups(p);
        for (let i = 0; i < GROUP_ORDER.length; i++) {
            if (gs.indexOf(GROUP_ORDER[i]) !== -1) return GROUP_ORDER[i];
        }
        return "other";
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
        $("paneXV").classList.toggle("hidden", tab !== "xv");
        $("paneList").classList.toggle("hidden", tab === "xv");
        if (tab !== "xv") renderList();
    }

    // ── Team sheet ──────────────────────────────────────────
    function renderTeamsheet() {
        const sq = state.squad;
        $("squadProgress").textContent = MPPicks.filledSlots(sq).length + " of 15 picked";
        $("teamsheet").innerHTML = MPPicks.SLOTS.map(function (s) {
            const p = sq[s.id];
            if (!p) {
                return "<button class='slot' data-slot='" + s.id + "'>"
                    + "<span class='snum'>" + s.num + "</span>"
                    + "<span class='slabel'>" + s.label + "</span>"
                    + "<span class='empty-hint'>Tap to pick</span></button>";
            }
            const pen = MPPicks.oopPenalty(p, s.node);
            const eff = Math.max(0, (p.rating || 0) - pen);
            return "<div class='slot filled" + (pen > 0 ? " oop" : "") + "'>"
                + "<span class='snum'>" + s.num + "</span>"
                + "<span class='slabel'>" + s.label + "</span>"
                + "<span class='sname'>" + esc(p.name)
                + (p.kicker ? " <span class='kick'>K</span>" : "")
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
        const ng = MPPicks.NODE_GROUP[slot.node];
        if (ng) state.openGroups[ng] = true;
        byNation.forEach(function (g) {
            const fits = g.players.some(function (e) {
                return MPPicks.naturalSlots(e.versions[0]).indexOf(slotId) !== -1;
            });
            if (fits && Object.keys(state.openNations).length < 3) state.openNations[g.nation] = true;
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

    // Nation accordions, positions as sub-headings inside.
    function renderByNation(slot, q) {
        const html = byNation.map(function (g) {
            const matched = g.players.filter(function (e) { return matchesSearch(e, q); });
            if (!matched.length) return "";

            let fitCount = 0;
            if (slot) {
                matched.forEach(function (e) {
                    if (MPPicks.naturalSlots(e.versions[0]).indexOf(slot.id) !== -1) fitCount++;
                });
            }
            const open = q ? true : !!state.openNations[g.nation];

            let body = "";
            if (open) {
                let lastGroup = null;
                const rows = [];
                matched.forEach(function (e) {
                    const h = renderEntry(e, slot);
                    if (!h) return;
                    if (e.group !== lastGroup) {
                        lastGroup = e.group;
                        rows.push("<div class='posgroup'>" + (GROUP_LABEL[e.group] || "Other") + "</div>");
                    }
                    rows.push(h);
                });
                body = "<div class='nation-body'>" + (rows.length ? rows.join("")
                    : "<p class='panel-empty'>Nobody here can fill that slot.</p>") + "</div>";
            }

            return "<div class='nation'>"
                + "<button class='nation-head' data-nation='" + esc(g.nation) + "'>"
                + "<span class='caret'>" + (open ? "\u25BC" : "\u25B6") + "</span>"
                + esc(g.nation)
                + "<span class='ncount'>" + matched.length + " players"
                + (slot && fitCount ? " <span class='nfit'>| " + fitCount + " in position</span>" : "")
                + "</span></button>" + body + "</div>";
        }).join("");

        $("panelBody").innerHTML = html || "<p class='panel-empty'>No players match that search.</p>";
    }

    // Position accordions, nations as sub-headings inside.
    function renderByPosition(slot, q) {
        const html = byGroup.map(function (g) {
            const matched = g.players.filter(function (e) { return matchesSearch(e, q); });
            if (!matched.length) return "";

            let fitCount = 0;
            if (slot) {
                matched.forEach(function (e) {
                    if (MPPicks.naturalSlots(e.versions[0]).indexOf(slot.id) !== -1) fitCount++;
                });
            }
            const open = q ? true : !!state.openGroups[g.group];

            let body = "";
            if (open) {
                let lastNation = null;
                const rows = [];
                matched.forEach(function (e) {
                    const h = renderEntry(e, slot);
                    if (!h) return;
                    if (e.country !== lastNation) {
                        lastNation = e.country;
                        rows.push("<div class='posgroup'>" + esc(e.country) + "</div>");
                    }
                    rows.push(h);
                });
                body = "<div class='nation-body'>" + (rows.length ? rows.join("")
                    : "<p class='panel-empty'>Nobody here can fill that slot.</p>") + "</div>";
            }

            return "<div class='nation'>"
                + "<button class='nation-head' data-group='" + esc(g.group) + "'>"
                + "<span class='caret'>" + (open ? "\u25BC" : "\u25B6") + "</span>"
                + esc(g.label)
                + "<span class='ncount'>" + matched.length + " players"
                + (slot && fitCount ? " <span class='nfit'>| " + fitCount + " in position</span>" : "")
                + "</span></button>" + body + "</div>";
        }).join("");

        $("panelBody").innerHTML = html || "<p class='panel-empty'>No players match that search.</p>";
    }

    function renderBoard(slot, q) {
        const entries = [];
        Object.keys(groupedPlayers).forEach(function (k) {
            const versions = groupedPlayers[k].filter(function (v) {
                return state.starred.indexOf(MPPicks.playerKey(v)) !== -1;
            });
            if (!versions.length) return;
            const e = {
                key: k, name: versions[0].name, country: versions[0].country,
                versions: versions, group: primaryGroup(versions[0])
            };
            if (matchesSearch(e, q)) entries.push(e);
        });

        if (!entries.length) {
            $("panelBody").innerHTML = "<p class='panel-empty'>Your Big Board is empty. "
                + "Open Full Draft and star players to build a shortlist, before or during the draft.</p>";
            return;
        }
        entries.sort(function (a, b) {
            const ga = GROUP_ORDER.indexOf(a.group), gb = GROUP_ORDER.indexOf(b.group);
            if (ga !== gb) return (ga === -1 ? 99 : ga) - (gb === -1 ? 99 : gb);
            return surname(a.name).toLowerCase().localeCompare(surname(b.name).toLowerCase());
        });

        let last = null;
        const rows = [];
        entries.forEach(function (e) {
            const html = renderEntry(e, slot);
            if (!html) return;
            if (e.group !== last) {
                last = e.group;
                rows.push("<div class='posgroup'>" + (GROUP_LABEL[e.group] || "Other") + "</div>");
            }
            rows.push(html);
        });
        $("panelBody").innerHTML = rows.length ? rows.join("")
            : "<p class='panel-empty'>Nobody on your Big Board can fill that slot.</p>";
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
        const head = "<div class='prow'>"
            + starButton(versions[0])
            + "<div class='pinfo'><div class='pname'>" + esc(entry.name) + "</div>"
            + "<div class='pmeta'>" + esc(entry.country) + " | " + versions.length + " tournaments</div></div>"
            + "<div class='prate'>" + (lo === hi ? lo : lo + " to " + hi) + "</div>"
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
        const v = slot
            ? MPPicks.evaluate(p, slot.id, state.squad, state.taken, state.constraints,
                state.ruleCtx, (window.MPRules && MPRules.isPickLegal))
            : { eligible: false, reason: "" };

        const meta = esc(p.country) + (p.year ? " " + p.year : "")
            + (p.positions && p.positions.length ? " | " + esc(p.positions.join(", ")) : "")
            + (p.kicker ? " | <span class='kick'>Kicker</span>" : "")
            + (pen > 0 ? " | <span class='pen'>out of position, minus " + pen + "</span>" : "");

        const blocked = slot && !v.eligible;
        return "<div class='prow" + (blocked ? " blocked" : "") + "'>"
            + starButton(p)
            + "<div class='pinfo'><div class='pname'>" + esc(isVersion ? (p.year || p.name) : p.name) + "</div>"
            + "<div class='pmeta'>" + meta + "</div>"
            + (blocked && v.reason ? "<div class='why-not'>" + esc(v.reason) + "</div>" : "")
            + "</div>"
            + "<div class='prate'>" + (slot ? eff : base)
            + (pen > 0 ? "<span class='was'>" + base + "</span>" : "") + "</div>"
            + (slot && v.eligible ? "<button class='take' data-take='" + esc(MPPicks.playerKey(p)) + "'>Pick</button>" : "")
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
        const v = MPPicks.evaluate(p, slotId, state.squad, state.taken, state.constraints,
            state.ruleCtx, (window.MPRules && MPRules.isPickLegal));
        if (!v.eligible) return;
        state.squad[slotId] = p;
        state.taken[MPPicks.playerKey(p)] = "you";
        cancelPicking();
        renderTeamsheet();
        setTab("xv");
        if (state.onPick) state.onPick(slotId, p);
    }

    function toggleStar(key) {
        const i = state.starred.indexOf(key);
        if (i === -1) state.starred.push(key); else state.starred.splice(i, 1);
        saveStars();
        renderList();
    }

    // ── Wiring ──────────────────────────────────────────────
    function wire() {
        $("tabXV").addEventListener("click", function () { setTab("xv"); });
        $("tabBoard").addEventListener("click", function () { setTab("board"); });
        $("tabAll").addEventListener("click", function () { setTab("all"); });
        $("bannerCancel").addEventListener("click", cancelPicking);
        $("axisNation").addEventListener("click", function () { setAxis("nation"); });
        $("axisPosition").addEventListener("click", function () { setAxis("position"); });

        $("teamsheet").addEventListener("click", function (e) {
            const btn = e.target.closest(".slot");
            if (!btn || btn.classList.contains("filled")) return;
            startPicking(btn.getAttribute("data-slot"));
        });

        $("panelSearch").addEventListener("input", function (e) {
            state.search = e.target.value; renderList();
        });

        $("panelBody").addEventListener("click", function (e) {
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
        init: init, wire: wire,
        renderTeamsheet: renderTeamsheet,
        squad: function () { return state.squad; },
        starred: function () { return state.starred; }
    };
})();
