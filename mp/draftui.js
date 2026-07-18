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
        complete: false
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
        state.live = !!opts.live;
        state.starred = loadStars();
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
    function starKey() { return STAR_ROOT + ":" + (state.roomCode || "none"); }
    function loadStars() {
        try { return JSON.parse(localStorage.getItem(starKey()) || "[]"); }
        catch (e) { return []; }
    }
    function saveStars() {
        try { localStorage.setItem(starKey(), JSON.stringify(state.starred)); } catch (e) {}
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

        const total = state.order.length * MPPicks.SLOTS.length;
        state.complete = state.pickIndex >= total && total > 0;
        state.isMyTurn = !state.complete && draft.currentPicker === state.myUid;

        // Reset and replay.
        state.squad = MPPicks.emptySquad();
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
            state.taken[MPPicks.playerKey(p)] = (pk.by === state.myUid)
                ? "you"
                : ((who && who.name) || "another user");
            if (pk.by === state.myUid) state.squad[pk.slot] = p;
        });

        renderTurn(draft);
        renderTeamsheet();
        // Always repaint the list, so taken players grey out the instant
        // another user picks, whichever tab is showing.
        if (state.tab === "picks") renderPicks();
        else if (state.tab !== "xv") renderList();
        renderBoardBadge();
    }

    // Big Board tab badge: how many starred players are still available.
    function renderBoardBadge() {
        const el = $("tabBoard");
        if (!el) return;
        let avail = 0, total = 0;
        state.starred.forEach(function (k) {
            total++;
            if (!state.taken[k]) avail++;
        });
        el.textContent = total ? ("Big Board " + avail + "/" + total) : "Big Board";
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
            return "<div class='pickrow" + (mine ? " mine" : "") + "' style='--pk:"
                + (who.kit || "#6E8CA6") + "'>"
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
                    + "<span class='empty-hint'>"
                    + (state.live && !state.isMyTurn ? "Waiting for your turn" : "Tap to pick")
                    + "</span></button>";
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

        // The Big Board honours the same Group by choice as the full list.
        // It is a short list, so headings rather than accordions.
        const byPosition = (state.axis === "position");
        const buckets = {};
        const order = [];
        entries.forEach(function (e) {
            const k = byPosition ? e.group : e.country;
            if (!buckets[k]) { buckets[k] = []; order.push(k); }
            buckets[k].push(e);
        });
        if (byPosition) {
            order.sort(function (a, b) {
                const ia = GROUP_ORDER.indexOf(a), ib = GROUP_ORDER.indexOf(b);
                return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
            });
        } else {
            order.sort();
        }

        const html = order.map(function (k) {
            const label = byPosition ? (GROUP_LABEL[k] || "Other") : k;
            const rows = buckets[k].sort(function (a, b) {
                if (byPosition && a.country !== b.country) return a.country.localeCompare(b.country);
                return surname(a.name).toLowerCase().localeCompare(surname(b.name).toLowerCase());
            }).map(function (e) { return renderEntry(e, slot); }).filter(Boolean);
            if (!rows.length) return "";
            return "<div class='board-head'>" + esc(label) + "</div>" + rows.join("");
        }).join("");

        $("panelBody").innerHTML = html
            || "<p class='panel-empty'>Nobody on your Big Board can fill that slot.</p>";
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
            return !!state.taken[MPPicks.playerKey(v)];
        }).length;
        const allGone = gone === versions.length;
        const head = "<div class='prow" + (allGone ? " blocked taken" : "") + "'>"
            + starButton(versions[0])
            + "<div class='pinfo'><div class='pname'>" + esc(entry.name) + "</div>"
            + "<div class='pmeta'>" + esc(entry.country) + " | " + versions.length + " tournaments"
            + (gone ? " | <span class='gone'>" + gone + " taken</span>" : "") + "</div></div>"
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

        // Taken state is independent of whether a slot is being picked, so
        // the list greys out the moment another user takes a player.
        const takenBy = state.taken[MPPicks.playerKey(p)] || null;

        const v = slot
            ? MPPicks.evaluate(p, slot.id, state.squad, state.taken, state.constraints,
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
        const v = MPPicks.evaluate(p, slotId, state.squad, state.taken, state.constraints,
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
        state.taken[MPPicks.playerKey(p)] = "you";
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
        init: init, wire: wire, applyRoom: applyRoom,
        renderTeamsheet: renderTeamsheet,
        squad: function () { return state.squad; },
        starred: function () { return state.starred; }
    };
})();
