// ============================================================
// RUGBY XV DRAFT: MULTIPLAYER LOBBY LOGIC
// UK English. No em dashes or en dashes.
// ============================================================

(function () {
    // Bumped on every change. Format v1.YYMMDDHHMM in GMT.
    const VERSION = "v1.2607211345";

    const $ = function (id) { return document.getElementById(id); };

    // Attach a listener without letting one missing element abandon all the
    // listeners that follow it.
    function on(id, evt, fn) {
        const el = $(id);
        if (!el) { console.warn("Missing element: " + id); return; }
        el.addEventListener(evt, fn);
    }
    const YEARS = MPEngine.ALL_YEARS;
    const GEO = MPEngine.GEO_GROUPS;


    // Friendly rule copy (the engine ids are terse).
    const RULE_TEXT = {
        maxPerTournament: {
            label: "Max players per World Cup",
            desc: "No more than this many players from any single World Cup.",
            value: function (v) { return "Max " + v + " players"; }
        },
        maxPerCountry: {
            label: "Max players per nation",
            desc: "No more than this many players from any single nation. Adjustable.",
            value: function (v) { return "Max " + v + " players"; }
        },
        minPerCountry: {
            label: "Minimum nations in your XV",
            desc: "Your XV must draw on at least this many different nations, so it cannot be built from one or two squads.",
            value: function (v) { return "At least " + v + " nations"; }
        },
        onePerTournament: {
            label: "One from every World Cup",
            desc: "Your XV must include at least one player from each World Cup in the window.",
            value: function () { return "At least 1 each"; }
        }
    };

    // Eight kit combinations, so rooms are not full of identical colours
    // when nobody bothers to change them. One is chosen at random on load.
    const KITS = [
        { a: "#16E0CD", b: "#0B3B54" },   // teal and deep navy
        { a: "#E23B3B", b: "#F1F7FC" },   // red and white
        { a: "#1E5FD8", b: "#FFC24D" },   // blue and amber
        { a: "#2FA84F", b: "#F1F7FC" },   // green and white
        { a: "#FFC24D", b: "#1A1A1A" },   // amber and black
        { a: "#8B4FE0", b: "#16E0CD" },   // purple and teal
        { a: "#FF7A2F", b: "#0B1B2B" },   // orange and navy
        { a: "#F1F7FC", b: "#E23B3B" }    // white and red
    ];

    const state = {
        mode: "career",
        yMin: 0,
        yMax: YEARS.length - 1,
        geo: null,
        size: 2,           // human users, 1 to 8
        season: 3,         // competitions in the season, 1 to 15
        turnMs: 600000,    // time allowed per pick, 0 means no limit
        hostIdleMs: 86400000,  // host handover after this much silence
        path: "create",    // "create" | "join"
        countryCap: null,  // null = use the engine's auto value
        rules: { maxPerTournament: false, maxPerCountry: false, onePerTournament: false }
    };

    let currentCode = null;
    let unwatch = null;

    // ── Theme ───────────────────────────────────────────────
    function applyTheme(theme) {
        if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
        else document.documentElement.removeAttribute("data-theme");
        $("themeToggle").textContent = (theme === "light") ? "Dark" : "Light";
        try { localStorage.setItem("mp-theme", theme); } catch (e) {}
    }
    function initTheme() {
        let t = "dark";
        try { t = localStorage.getItem("mp-theme") || "dark"; } catch (e) {}
        applyTheme(t);
    }
    function toggleTheme() {
        const isLight = document.documentElement.getAttribute("data-theme") === "light";
        applyTheme(isLight ? "dark" : "light");
        // Kit colours are adapted to the background, so repaint the draft.
        if (latestRoom && window.MPDraftUI && MPDraftUI.applyRoom) {
            try { MPDraftUI.applyRoom(latestRoom); } catch (e) {}
        }
    }

    // ── Filters ─────────────────────────────────────────────
    function filters() {
        const f = { mode: state.mode, geoLabel: state.geo || "All nations" };
        if (state.geo) f.countries = GEO[state.geo];
        if (state.mode === "tournament") { f.yearMin = YEARS[state.yMin]; f.yearMax = YEARS[state.yMax]; }
        return f;
    }

    const NAME_KEY = "mp-display-name";
    function rememberName(n) {
        try { if (n) localStorage.setItem(NAME_KEY, n); } catch (e) {}
    }
    function recallName() {
        try { return localStorage.getItem(NAME_KEY) || ""; } catch (e) { return ""; }
    }

    function profile() {
        return {
            name: ($("name").value || "Player").trim() || "Player",
            kit: $("kit1").value,
            kit2: $("kit2").value
        };
    }

    // ── You flash (two-tone) ────────────────────────────────
    function renderYou() {
        $("youName").textContent = $("name").value.trim() || "Your name";
        $("youFlash").style.setProperty("--kit1", $("kit1").value);
        $("youFlash").style.setProperty("--kit2", $("kit2").value);
    }

    // ── Create or join ──────────────────────────────────────
    // The turn limit is free-form: any number of hours and minutes, or off.
    function renderTurnLimit() {
        const on = state.turnMs > 0;
        $("turnOn").checked = on;
        $("turnFields").classList.toggle("off", !on);
        $("turnHours").disabled = !on;
        $("turnMins").disabled = !on;
        if (on) {
            $("turnHours").value = Math.floor(state.turnMs / 3600000);
            $("turnMins").value = Math.round((state.turnMs % 3600000) / 60000);
        }
        $("turnHint").textContent = on
            ? "If a pick is not made within " + turnText(state.turnMs)
              + ", it is made automatically from that user's Big Board."
            : "Turns are untimed. A draft can stall if someone stops picking.";
    }

    function turnText(ms) {
        if (!ms) return "no limit";
        const h = Math.floor(ms / 3600000);
        const m = Math.round((ms % 3600000) / 60000);
        const parts = [];
        if (h) parts.push(h + " hour" + (h === 1 ? "" : "s"));
        if (m) parts.push(m + " minute" + (m === 1 ? "" : "s"));
        return parts.length ? parts.join(" ") : "0 minutes";
    }

    function readIdle() {
        const h = Math.max(1, Math.min(168, parseInt($("idleHours").value, 10) || 24));
        state.hostIdleMs = h * 3600000;
    }

    function renderTimersSummary() {
        const t = state.turnMs ? turnText(state.turnMs) : "no pick limit";
        const i = Math.round((state.hostIdleMs || 86400000) / 3600000);
        $("turnNow").textContent = t + ", host handover after " + i + "h";
        $("idleHours").value = i;
    }

    function readTurnFields() {
        readIdle();
        if (!$("turnOn").checked) { state.turnMs = 0; return; }
        const h = Math.max(0, Math.min(168, parseInt($("turnHours").value, 10) || 0));
        const m = Math.max(0, Math.min(59, parseInt($("turnMins").value, 10) || 0));
        let ms = (h * 3600000) + (m * 60000);
        // A turn of zero would expire instantly, so keep a sane floor.
        if (ms < 60000) ms = 60000;
        state.turnMs = ms;
    }

    // Randomise the setup: a quick way to get a tournament nobody would
    // have chosen deliberately, which is usually the interesting kind.
    function randomiseSetup() {
        const pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
        state.mode = pick(["tournament", "tournament", "career"]);

        const geoNames = Object.keys(GEO);
        state.geo = Math.random() < 0.4 ? "" : pick(geoNames);

        if (state.mode === "tournament") {
            const a = Math.floor(Math.random() * YEARS.length);
            const b = Math.floor(Math.random() * YEARS.length);
            state.yMin = Math.min(a, b);
            state.yMax = Math.max(a, b);
        } else {
            state.yMin = 0;
            state.yMax = YEARS.length - 1;
        }

        state.rules = {
            maxPerTournament: Math.random() < 0.5,
            maxPerCountry: Math.random() < 0.5,
            onePerTournament: Math.random() < 0.3
        };

        // Widen until the pool can actually support the room, so randomise
        // never lands on something that cannot be played.
        let guard = 0;
        while (guard++ < 40) {
            const f = filters();
            const a = MPEngine.feasibility(allSquads, f, positionFamilyMap);
            const ok = MPEngine.poolStatus(a, state.size).state !== "blocked"
                && MPRules.rulesFeasible(MPRules.buildContext(f, a), rulesForCreate(), a).ok;
            if (ok) break;
            if (state.yMin > 0) state.yMin--;
            else if (state.yMax < YEARS.length - 1) state.yMax++;
            else if (state.geo) state.geo = "";
            else if (state.rules.onePerTournament) state.rules.onePerTournament = false;
            else if (state.rules.maxPerCountry) state.rules.maxPerCountry = false;
            else if (state.rules.maxPerTournament) state.rules.maxPerTournament = false;
            else break;
        }
        refresh();
    }

    function renderPath() {
        const creating = state.path === "create";
        $("pathCreate").setAttribute("aria-pressed", String(creating));
        $("pathJoin").setAttribute("aria-pressed", String(!creating));
        $("createPane").classList.toggle("hidden", !creating);
        $("joinPane").classList.toggle("hidden", creating);
    }

    // ── Mode ────────────────────────────────────────────────
    function renderMode() {
        const career = state.mode === "career";
        $("modeCareer").setAttribute("aria-pressed", String(career));
        $("modeTournament").setAttribute("aria-pressed", String(!career));
        $("yearsBlock").classList.toggle("hidden", career);
    }

    // ── Drafters ────────────────────────────────────────────
    function renderPlayers() {
        if (state.size < 1) state.size = 1;
        if (state.size > 8) state.size = 8;
        if (state.season < 1) state.season = 1;
        if (state.season > 15) state.season = 15;
        $("sizeNum").textContent = state.size;
        $("seasonNum").textContent = state.season;
        $("sizeDown").disabled = state.size <= 1;
        $("sizeUp").disabled = state.size >= 8;
        $("seasonDown").disabled = state.season <= 1;
        $("seasonUp").disabled = state.season >= 15;
        const fmt = MPDraft.formatFor(state.size).name;
        $("formatLine").innerHTML = fmt
            + "<br><span class='split'>" + state.size + " user" + (state.size === 1 ? "" : "s")
            + ", " + state.season + " competition" + (state.season === 1 ? "" : "s")
            + " (locked once the first draft begins)</span>";
    }

    // ── Year slider ─────────────────────────────────────────
    function tickPos(k) { return "calc(9px + (" + (k / (YEARS.length - 1)) + ") * (100% - 18px))"; }
    function buildTicks() {
        $("yearTicks").innerHTML = YEARS.map(function (y, i) {
            return "<span data-i='" + i + "' style='left:" + tickPos(i) + "'>" + y + "</span>";
        }).join("");
    }
    function renderYears() {
        $("yMin").value = state.yMin;
        $("yMax").value = state.yMax;
        const left = tickPos(state.yMin), right = tickPos(state.yMax);
        $("yearFill").style.left = left;
        $("yearFill").style.width = "calc(" + right + " - " + left + ")";
        Array.prototype.forEach.call($("yearTicks").children, function (el) {
            const i = +el.getAttribute("data-i");
            el.classList.toggle("in", i >= state.yMin && i <= state.yMax);
        });
    }

    // ── Geography chips ─────────────────────────────────────
    function buildChips() {
        const names = ["All nations"].concat(Object.keys(GEO));
        $("geoChips").innerHTML = names.map(function (n) {
            const val = (n === "All nations") ? "" : n;
            return "<button class='chip' data-geo='" + val + "' aria-pressed='" + ((state.geo || "") === val) + "'>" + n + "</button>";
        }).join("");
    }
    function renderChips() {
        Array.prototype.forEach.call($("geoChips").children, function (el) {
            el.setAttribute("aria-pressed", String((state.geo || "") === el.getAttribute("data-geo")));
        });
    }

    // ── Rules ───────────────────────────────────────────────
    function renderRules(analysis) {
        const ctx = MPRules.buildContext(filters(), analysis);
        const rows = MPRules.evaluateRules(ctx, state.rules);
        $("ruleList").innerHTML = rows.map(function (r) {
            const t = RULE_TEXT[r.id];
            const cls = "rule" + (r.available ? (r.enabled ? "" : " off") : " unavailable");
            let why = "";
            if (!r.available) why = "<span class='why'>" + r.unavailableReason + "</span>";
            else if (r.warn) why = "<span class='why'>" + r.warnText + "</span>";
            else why = "<span class='why'>" + t.desc + "</span>";

            // The nation cap is adjustable when on, clamped to the floor
            // below which fifteen slots cannot be filled.
            let control;
            if (r.id === "maxPerCountry" && r.enabled) {
                const floor = MPRules.effectiveCountryCap(ctx).floor;
                const val = currentCountryCap(ctx);
                control = "<span class='mini-step'>"
                    + "<button data-cap='-1' " + (val <= floor ? "disabled" : "") + " aria-label='Lower cap'>&minus;</button>"
                    + "<span class='value'>" + val + "</span>"
                    + "<button data-cap='1' " + (val >= 15 ? "disabled" : "") + " aria-label='Raise cap'>+</button>"
                    + "</span>";
            } else {
                const valTxt = (r.available && r.value != null) ? t.value(r.value) : "";
                control = valTxt ? "<span class='value'>" + valTxt + "</span>" : "";
            }

            return "<div class='" + cls + "'>"
                + "<div><span class='label'>" + t.label + "</span>" + why + "</div>"
                + "<div style='display:flex;align-items:center;gap:12px'>"
                + control
                + "<label class='sw'><input type='checkbox' data-rule='" + r.id + "'"
                + (r.enabled ? " checked" : "") + (r.available ? "" : " disabled") + ">"
                + "<span class='knob'></span></label>"
                + "</div></div>";
        }).join("");
    }

    // The active nation cap: the host's chosen value if set, otherwise the
    // engine's auto-derived one. Always clamped to the hard floor.
    function currentCountryCap(ctx) {
        const d = MPRules.effectiveCountryCap(ctx);
        const v = (state.countryCap == null) ? d.cap : state.countryCap;
        return Math.max(d.floor, Math.min(15, v));
    }

    // ── Refresh (readout + gate) ────────────────────────────
    function refresh() {
        renderPath();
        renderTurnLimit();
        renderTimersSummary();
        renderMode();
        renderPlayers();
        renderYears();
        renderChips();
        const f = filters();
        const analysis = MPEngine.feasibility(allSquads, f, positionFamilyMap);
        renderRules(analysis);

        const strap = $("strap");
        const status = MPEngine.poolStatus(analysis, state.size);
        const glyph = status.state === "ready" ? "\u2713" : (status.state === "advisory" ? "\u2139" : "\u26A0");
        strap.classList.remove("ready", "advisory", "blocked");
        strap.classList.add(status.state);
        const extra = status.state === "blocked"
            ? status.reasons.map(function (r) { return "<span class='blocker'>" + r + "</span>"; }).join("")
            : status.warnings.map(function (w) { return "<span class='advice'>" + w + "</span>"; }).join("");
        strap.innerHTML =
            (status.state === "ready" ? "<span class='live-dot'></span>" : "")
            + "<span class='status-pill'><span class='glyph'>" + glyph + "</span>" + status.label + "</span>"
            + "<span class='strap-body'><span>" + MPEngine.readoutText(analysis, f) + "</span>" + extra + "</span>";
        // Advisory is playable: only a blocked pool disables Create.
        $("create").disabled = (status.state === "blocked");
    }

    // ── Events ──────────────────────────────────────────────
    function step(field, delta) { state[field] += delta; refresh(); }

    function wire() {
        on("themeToggle", "click", toggleTheme);
        on("name", "input", renderYou);
        on("kit1", "input", renderYou);
        on("kit2", "input", renderYou);

        on("pathCreate", "click", function () { state.path = "create"; refresh(); });
        on("pathJoin", "click", function () { state.path = "join"; refresh(); });
        on("modeCareer", "click", function () { state.mode = "career"; refresh(); });
        on("modeTournament", "click", function () { state.mode = "tournament"; refresh(); });

        on("sizeDown", "click", function () { step("size", -1); });
        on("sizeUp", "click", function () { step("size", 1); });
        on("seasonDown", "click", function () { step("season", -1); });
        on("seasonUp", "click", function () { step("season", 1); });
        on("turnOn", "change", function () {
            if (!$("turnOn").checked) state.turnMs = 0;
            else { state.turnMs = 600000; }
            refresh();
        });
        ["turnHours", "turnMins"].forEach(function (id) {
            on(id, "change", function () { readTurnFields(); refresh(); });
            on(id, "blur", function () { readTurnFields(); refresh(); });
        });

        on("yMin", "input", function (e) {
            let v = +e.target.value; if (v > state.yMax) state.yMax = v; state.yMin = v; refresh();
        });
        on("yMax", "input", function (e) {
            let v = +e.target.value; if (v < state.yMin) state.yMin = v; state.yMax = v; refresh();
        });

        on("geoChips", "click", function (e) {
            const btn = e.target.closest(".chip"); if (!btn) return;
            state.geo = btn.getAttribute("data-geo") || null; refresh();
        });
        on("ruleList", "click", function (e) {
            const b = e.target.closest("button[data-cap]"); if (!b) return;
            const f = filters();
            const ctx = MPRules.buildContext(f, MPEngine.feasibility(allSquads, f, positionFamilyMap));
            state.countryCap = currentCountryCap(ctx) + (+b.getAttribute("data-cap"));
            refresh();
        });
        on("ruleList", "change", function (e) {
            const cb = e.target.closest("input[data-rule]"); if (!cb) return;
            state.rules[cb.getAttribute("data-rule")] = cb.checked; refresh();
        });

        on("create", "click", onCreate);
        on("joinBtn", "click", onJoin);
        on("leave", "click", onLeave);
        on("closeRoom", "click", onCloseRoom);
        on("noticeClose", "click", function () { showNotice(""); });
        on("startDraft", "click", onStartDraft);
        on("backToRoom", "click", function () { showOnly("roomView"); });
        on("resumeDraft", "click", showDraft);
        on("spSlow", "click", function () { setSpeed(1.8); });
        on("spMed", "click", function () { setSpeed(1); });
        on("spFast", "click", function () { setSpeed(0.4); });
        on("playBtn", "click", function () {
            const room = latestRoom || {};
            const comp = room.comp || {};
            const isHost = (room.meta || {}).hostUid === MPNet.currentUid();
            if ((comp.results || []).length) {
                // Results already exist, so replay them locally.
                $("playBtn").disabled = true;
                playBack(comp.results, comp.fixtures).then(function () {
                    watchedComp[compKey(latestRoom || {})] = true;
                    renderRoom(latestRoom);
                });
                return;
            }
            if (!isHost) return;
            if (!latestRoom) return;
            $("playBtn").disabled = true;
            $("compStatus").textContent = "Playing the fixtures...";
            runFixtures(latestRoom)
                .then(function () { $("compStatus").textContent = ""; })
                .catch(function (err) {
                    $("compStatus").textContent = err.message;
                    $("playBtn").disabled = false;
                });
        });
        on("setupConfirm", "click", confirmSetup);
        on("setupBack", "click", function () {
            restoreOptions();
            setupShown = false;
            showOnly("roomView");
        });
        on("join", "keydown", function (e) {
            if (e.key === "Enter") { e.preventDefault(); onJoin(); }
        });
        on("name", "keydown", function (e) {
            if (e.key !== "Enter") return;
            e.preventDefault();
            // Whichever path is showing is the one Enter should take.
            if (state.path === "join") onJoin(); else onCreate();
        });
        on("turnAcc", "click", function () {
            const open = $("turnAcc").getAttribute("aria-expanded") === "true";
            $("turnAcc").setAttribute("aria-expanded", String(!open));
            $("turnBody").classList.toggle("hidden", open);
        });
        ["quietOn", "quietStart", "quietEnd"].forEach(function (id) {
            on(id, "change", saveQuiet);
        });
        on("idleHours", "change", function () { readTurnFields(); refresh(); });
        on("randomise", "click", randomiseSetup);
        on("preBoard", "click", function () {
            const room = latestRoom || {};
            if (!(room.pool || []).length) {
                showNotice("The pool is not ready yet."); setStatus("startHint", "The pool is not ready yet.", true);
                return;
            }
            ensureDraftInit(room);
            showOnly("draftView");
            MPDraftUI.setLive(false);
        });
        on("readyBtn", "click", function () {
            $("readyBtn").disabled = true;
            MPNet.setReady(currentCode, true)
                .then(function () {
                    $("readyBtn").disabled = false;
                    setStatus("nextHint", "", false);
                })
                .catch(function (err) {
                    showNotice("Could not mark you ready: "
                        + (err && err.message ? err.message : "unknown error"));
                    $("readyBtn").disabled = false;
                });
        });
        on("enterDraft", "click", function () {
            $("enterDraft").disabled = true;
            MPNet.enterDraft(currentCode).catch(function (err) {
                showNotice("Could not enter the draft: " + err.message);
                $("enterDraft").disabled = false;
            });
        });
        on("goHome", "click", function () { backToLobby(); });
        on("forceStart", "click", function () {
            const room = latestRoom || {};
            const mem = room.members || {};
            const rdy = room.ready || {};
            const out = Object.keys(mem).filter(function (u) { return !rdy[u]; });
            const timed = ((latestRoom || {}).settings || {}).turnMs > 0;
            modal({
                title: "Start without them?",
                body: names(mem, out).join(", ") + (out.length === 1 ? " has" : " have")
                    + " not entered the draft. <strong>The draft will begin anyway.</strong>"
                    + "<span class='warn'>" + (timed
                        ? "Their picks will be made automatically from their Big Board each time "
                          + "their turn runs out."
                        : "There is no pick timer set, so their turns will not auto-pick. "
                          + "The draft will wait on them at every turn.")
                    + "</span>",
                ok: "Start the draft", cancel: "Keep waiting"
            }).then(function (yes) {
                if (!yes) return;
                $("forceStart").disabled = true;
                out.forEach(function (u) { MPNet.enterDraft(currentCode, u); });
                startingDraft = true;
                MPNet.startDraft(currentCode).catch(function (err) {
                    showNotice(err.message); setStatus("forceHint", err.message, true);
                    $("forceStart").disabled = false;
                    startingDraft = false;
                });
            });
        });
        on("waitBoard", "click", function () {
            showOnly("draftView");
            MPDraftUI.setLive(false);
        });
        on("nextComp", "click", function () {
            modal({
                title: "Start the next competition?",
                body: "This returns the room to the setup screen, where you can change "
                    + "the pool and the rules before the next draft. "
                    + "<strong>Every squad is retired.</strong>"
                    + "<span class='warn'>The draft order reverses, so whoever is bottom of the tally picks first.</span>",
                ok: "Set up next competition", cancel: "Not yet"
            }).then(function (yes) {
                if (!yes) return;
                $("nextComp").disabled = true;
                $("nextHint").textContent = "Setting up the next draft...";
                MPNet.nextCompetition(currentCode)
                    .then(function () { /* the room state drives the reset */ })
                    .catch(function (err) {
                        $("nextHint").textContent = err.message;
                        $("nextComp").disabled = false;
                    });
            });
        });
        on("showTeams", "click", function () {
            renderTeams(latestRoom || {});
            showOnly("teamsView");
        });
        on("teamsBack", "click", function () { showOnly("compView"); });
        on("compBack", "click", function () { showOnly("roomView"); });
        on("newTournament", "click", function () {
            modal({
                title: "Create a new tournament?",
                body: "This season is finished. <strong>This room will be closed</strong> "
                    + "and you will go back to the start, where you can set up a new tournament "
                    + "or join someone else's."
                    + "<span class='warn'>The results above will no longer be available.</span>",
                ok: "Create new tournament", cancel: "Stay here"
            }).then(function (yes) {
                if (!yes) return;
                const isHost = ((latestRoom || {}).meta || {}).hostUid === MPNet.currentUid();
                const done = function () { backToLobby(); };
                if (isHost) MPNet.closeRoom(currentCode).then(done).catch(done);
                else MPNet.leaveRoom(currentCode).then(done).catch(done);
            });
        });
    }

    // Rules as stored on the room, including the resolved nation cap.
    function rulesForCreate() {
        const f = filters();
        const ctx = MPRules.buildContext(f, MPEngine.feasibility(allSquads, f, positionFamilyMap));
        const out = {
            maxPerTournament: !!state.rules.maxPerTournament,
            maxPerCountry: !!state.rules.maxPerCountry,
            minPerCountry: !!state.rules.minPerCountry,
            onePerTournament: !!state.rules.onePerTournament
        };
        if (out.maxPerCountry) out.countryCap = currentCountryCap(ctx);
        return out;
    }

    function onCreate() {
        rememberName(($("name").value || "").trim());
        // Rules that cannot produce a legal XV must be caught here, not
        // discovered at pick thirteen.
        try {
            const f0 = filters();
            const a0 = MPEngine.feasibility(allSquads, f0, positionFamilyMap);
            const rf0 = MPRules.rulesFeasible(MPRules.buildContext(f0, a0), rulesForCreate(), a0);
            if (!rf0.ok) {
                setStatus("lobbyStatus", rf0.reasons.join(" "), true);
                return;
            }
        } catch (e) {}

        setStatus("lobbyStatus", "Creating room and snapshotting the pool...", false);
        $("create").disabled = true;
        MPNet.createRoom(filters(), profile(), rulesForCreate(), { tableSize: state.size, aiCount: 0, seasonLength: state.season, turnMs: state.turnMs, hostIdleMs: state.hostIdleMs })
            .then(enterRoom)
            .catch(function (err) { setStatus("lobbyStatus", err.message, true); $("create").disabled = false; });
    }
    function onJoin() {
        rememberName(($("name").value || "").trim());
        const code = $("join").value.toUpperCase().trim();
        if (code.length !== 4) { setStatus("lobbyStatus", "A room code is four characters.", true); return; }
        setStatus("lobbyStatus", "Joining " + code + "...", false);
        MPNet.joinRoom(code, profile()).then(enterRoom)
            .catch(function (err) { setStatus("lobbyStatus", err.message, true); });
    }
    function onLeave() {
        // A closed room needs no server call: just go home.
        if (roomClosed) { roomClosed = false; roomClosedByMe = false; backToLobby(""); return; }
        if (!currentCode) { backToLobby("") ; return; }
        const code = currentCode;
        // Stop watching first, so the room disappearing underneath us
        // cannot repaint the room view while we are leaving it.
        if (unwatch) { unwatch(); unwatch = null; }
        currentCode = null;
        setStatus("roomStatus", "Leaving...", false);
        MPNet.forgetRoom();
        MPNet.leaveRoom(code)
            .then(function () { backToLobby("Left the room."); })
            .catch(function (err) {
                // Even if the write fails, do not strand the user on a dead
                // screen. Return to the lobby and report what happened.
                backToLobby("Left the room, but the server reported: " + err.message);
            });
    }

    function onCloseRoom() {
        if (!currentCode) return;
        modal({
            title: "Close this room?",
            body: "This ends the room for everyone in it. It cannot be undone.",
            ok: "Close room", cancel: "Keep playing"
        }).then(function (yes) { if (yes) doCloseRoom(); });
    }

    function doCloseRoom() {
        if (!currentCode) return;
        roomClosedByMe = true;
        const code = currentCode;
        if (unwatch) { unwatch(); unwatch = null; }
        currentCode = null;
        MPNet.forgetRoom();
        MPNet.closeRoom(code)
            .then(function () { backToLobby("Room closed."); })
            .catch(function (err) { backToLobby("Could not close the room: " + err.message); });
    }

    function onStartDraft() {
        if (!currentCode) return;
        $("startDraft").disabled = true;
        setStatus("startHint", "Drawing the draft lottery...", false);
        MPNet.startDraft(currentCode)
            .then(function () { setStatus("startHint", "", false); })
            .catch(function (err) {
                showNotice(err.message); setStatus("startHint", err.message, true);
                $("startDraft").disabled = false;
            });
    }

    // A closed room stays readable, but every action that would need the
    // server is retired, so nothing fails confusingly in the background.
    // Only called once the server has confirmed the room is really gone.
    // The listener is deliberately left running: it costs nothing and means
    // a recovering connection repairs itself.
    function declareRoomClosed() {
        if (roomClosed) return;
        roomClosed = true;
        MPNet.forgetRoom();
        if (!roomClosedByMe) {
            const drafting = !$("draftView").classList.contains("hidden")
                || !$("commitView").classList.contains("hidden");
            if (window.MPDraftUI) {
                if (MPDraftUI.stopAuto) MPDraftUI.stopAuto();
                if (MPDraftUI.setLive) MPDraftUI.setLive(false);
            }
            if (drafting) {
                showNotice("The host has closed this room, so this draft has ended. "
                    + "Nothing more can be picked here.");
            } else {
                showNotice("The host has closed this room. You can still look through "
                    + "the results, but nothing further will happen here.");
            }
        }
        markRoomClosed();
    }

    function markRoomClosed() {
        ["readyBtn", "nextComp", "playBtn", "enterDraft", "forceStart",
         "startDraft", "preBoard", "closeRoom", "showTeams"].forEach(function (id) {
            const el = $(id);
            if (el && id !== "showTeams") el.classList.add("hidden");
        });
        const lv = $("leave");
        if (lv) {
            const sp = lv.querySelector("span");
            if (sp) sp.textContent = "Back to the home page";
            lv.classList.remove("hidden");
        }
        const cb = $("compBack");
        if (cb) cb.classList.remove("hidden");
        setStatus("nextHint", "This room has been closed by the host.", false);
    }

    function backToLobby(msg) {
        if (unwatch) { unwatch(); unwatch = null; }
        currentCode = null;
        latestRoom = null;
        seenDrafting = false;
        compShown = false;
        commitShown = false;
        draftReady = false;
        restoreOptions();
        setupShown = false;
        showOnly("lobbyView");
        setStatus("roomStatus", "", false);
        setStatus("lobbyStatus", msg || "", false);
        $("create").disabled = false;
        refresh();
    }

    // ── Room view ───────────────────────────────────────────
    function enterRoom(code) {
        currentCode = code;
        commitShown = false;
        compShown = false;
        seenDrafting = false;
        draftReady = false;
        if (window.MPCommit && MPCommit.reset) MPCommit.reset();
        showOnly("roomView");
        $("roomCode").innerHTML = code + "<small>share this code</small>";
        if (unwatch) unwatch();
        unwatch = MPNet.watchRoom(code, renderRoom, function (err) {
            // A read failure is worth saying out loud: silently losing the
            // connection is what made every button appear to do nothing.
            showNotice("Lost contact with the room ("
                + (err && (err.code || err.message) ? (err.code || err.message) : "unknown")
                + "). Reload the page if this does not clear.");
        });
    }
    let latestRoom = null;
    let seenDrafting = false;
    let compShown = false;
    let viewCompNo = 1;
    let setupShown = false;
    let settingsConfirmed = false;
    let roomClosedByMe = false;
    let roomClosed = false;
    let checkingClosed = false;
    let quietState = { on: false, start: "23:00", end: "08:00" };
    let announceSeen = false;
    let startingDraft = false;
    const FORCE_GRACE_MS = 600000;   // ten minutes before the host may force
    let forceTicker = null;
    let simSpeed = 1;          // 1.8 slow, 1 medium, 0.4 fast, as in app.js
    let playingBack = false;
    let revealed = {};         // fixture index -> true, during playback
    let liveFixtures = null;   // resolved fixtures while playing back
    let watchedComp = {};      // competition number -> already watched here
    // The results on screen may belong to the previous competition while the
    // next one is being set up, so the watch flag follows the results, not
    // the room's current competition counter.
    function compKey(room) {
        const c = room && room.comp;
        return (c && c.number) || ((room && room.settings && room.settings.competition) || 1);
    }
    function renderRoom(room) {
        try {
            renderRoomInner(room);
        } catch (err) {
            console.error("renderRoom failed", err);
            showNotice("Something went wrong drawing this screen: "
                + (err && err.message ? err.message : "unknown error")
                + ". Please send this to Simon.");
        }
    }

    function renderRoomInner(room) {
        // The room has been closed, or this user removed from it. Firebase
        // reports that as an empty snapshot. Nobody is thrown out: they may
        // still be reading the results or looking through the squads. The
        // room simply stops being live, and they are told why.
        if (!room || !room.meta) {
            // Confirm with the server before acting. A single empty snapshot
            // can be a transient read failure, and tearing the listener down
            // on one made every later click appear to do nothing, because
            // the room could never update again.
            if (currentCode && !roomClosed && !checkingClosed) {
                checkingClosed = true;
                MPNet.roomExists(currentCode).then(function (stillThere) {
                    checkingClosed = false;
                    if (stillThere) return;          // false alarm, keep watching
                    declareRoomClosed();
                });
            }
            return;
        }
        roomClosed = false;
        latestRoom = room;
        const finished = ((room.settings || {}).competition || 1) >= ((room.settings || {}).seasonLength || 1)
            && ((room.comp || {}).results || []).length > 0;
        const cr = $("closeRoom");
        if (cr) cr.classList.toggle("hidden", finished);
        const lv = $("leave");
        if (lv) {
            const sp = lv.querySelector("span");
            if (sp) sp.textContent = finished ? "Create a new tournament" : "Leave room";
        }

        // A new competition must reset every one-shot view flag. Doing this
        // from the room state means all clients reset, not just the host who
        // pressed the button.
        const compNo = (room.settings || {}).competition || 1;
        if (compNo !== viewCompNo) {
            viewCompNo = compNo;
            seenDrafting = false;
            commitShown = false;
            compShown = false;
            draftReady = false;
            playingBack = false;
            setupShown = false;
            settingsConfirmed = false;
            announceSeen = false;
            const pb = $("playBtn");
            if (pb) pb.disabled = false;
            const nc = $("nextComp");
            if (nc) nc.disabled = false;
            if (window.MPCommit && MPCommit.reset) MPCommit.reset();
            if (window.MPDraftUI && MPDraftUI.stopAuto) MPDraftUI.stopAuto();
            // Deliberately no view hiding here. Doing so blanked the screen
            // for anyone still reading the previous results, because the
            // routing below may legitimately leave them where they are.
        }
        if (!room) {
            // The host closed the room while we were in it. Do not strand
            // the user on an empty screen; return them to the lobby.
            $("members").innerHTML = "";
            backToLobby("");
            showNotice("The host closed the room, so the draft has ended. You can create a new room or join another with a code.");
            return;
        }
        const s = room.settings || {};
        const yrs = (s.mode === "tournament" && s.yearMin)
            ? (s.yearMin === s.yearMax ? s.yearMin : s.yearMin + " to " + s.yearMax) : "all years";
        const modeTxt = s.mode === "career" ? "Career peak" : "Tournament";
        const seatTxt = s.tableSize ? (Object.keys(room.members || {}).length + "/" + s.tableSize + " seats | ") : "";
        $("roomStrapText").textContent = seatTxt + modeTxt + " | " + (s.geoLabel || "All nations")
            + (s.mode === "career" ? "" : " | " + yrs) + " | " + (room.pool ? room.pool.length : 0) + " players";

        const members = room.members || {};
        const hostUid = room.meta ? room.meta.hostUid : null;
        const isHost = (hostUid === MPNet.currentUid());
        const status = room.meta ? room.meta.status : "lobby";
        const count = Object.keys(members).length;
        const seats = s.tableSize || count;

        $("closeRoom").classList.toggle("hidden", !isHost);

        // Season position
        renderBrief(room);
        renderHostIdle(room);
        MPNet.noteRoom(room);
        // Keep the host's heartbeat fresh so a live host is never displaced.
        if ((room.meta || {}).hostUid === MPNet.currentUid()) {
            const seen = (room.meta || {}).hostSeenAt || 0;
            if (MPNet.serverNow() - seen > 60000) MPNet.touchHost(currentCode);
        }
        $("seasonLine").textContent = "Competition " + (s.competition || 1)
            + " of " + (s.seasonLength || 1);

        $("members").innerHTML = Object.keys(members).map(function (k) {
            const m = members[k];
            const you = (k === MPNet.currentUid());
            return "<li style='--mk1:" + (m.kit || "#6E8CA6") + ";--mk2:" + (m.kit2 || "transparent") + "'>"
                + "<span class='dot " + (m.connected ? "on" : "") + "'></span>"
                + "<span class='mname'>" + esc(m.name || "Player") + (you ? " (you)" : "") + "</span>"
                + (k === hostUid ? "<span class='htag'>Host</span>" : "")
                + "</li>";
        }).join("");

        // Draft order, once drawn
        const draft = room.draft;
        if (draft && draft.order) {
            $("lotteryPanel").classList.remove("hidden");
            $("lotteryList").innerHTML = draft.order.map(function (u) {
                const m = members[u] || {};
                const you = (u === MPNet.currentUid());
                return "<li style='border-left-color:" + (m.kit || "#16E0CD") + "'>"
                    + esc(m.name || "Player") + (you ? " (you)" : "") + "</li>";
            }).join("");
        } else {
            $("lotteryPanel").classList.add("hidden");
        }

        // Start button: host only, lobby only, needs a full table
        const canShow = isHost && status === "lobby";
        $("startDraft").classList.toggle("hidden", !canShow);
        if (canShow) {
            const ready = count >= 2 && count >= seats;
            $("startDraft").disabled = !ready;
            if (count < 2) setStatus("startHint", "Waiting for at least one more user to join.", false);
            else if (count < seats) setStatus("startHint", "Waiting for " + (seats - count) + " more of " + seats + " users.", false);
            else setStatus("startHint", MPDraft.formatFor(count).name + ". Everyone is here.", false);
        }

        // Between competitions the room returns to lobby status so the host
        // can change the pool and rules before the next draft.
        // Between competitions there are two distinct states, and users
        // must not see the new setup before it exists.
        //   lobby     the host is still deciding: users simply wait
        //   announced the settings are fixed: users see them and enter
        // Keep the results alive whenever there are results to show. The
        // room status moves on before the people reading them do.
        if (room.comp && (room.comp.results || []).length) {
            try { renderFixtures(room); } catch (e) { console.error("renderFixtures", e); }
        }

        if ((status === "lobby" || status === "announced") && compNo > 1) {
            const amHost = (room.meta || {}).hostUid === MPNet.currentUid();
            const me2 = MPNet.currentUid();
            const mem = room.members || {};
            const rdy = room.ready || {};
            const ent = room.entered || {};
            const announced = status === "announced";

            if (!announced) {
                // The host is still choosing. Nobody else should be moved
                // anywhere: a user who has not finished with the results
                // must keep them, and the ones who have get a plain notice.
                if (amHost) {
                    if (!setupShown) { setupShown = true; showSetup(room); }
                    else renderSetupStatus(room);
                    return;
                }
                if (!rdy[me2]) {
                    // Keep them with the results they are still reading. This
                    // only applies before the host has confirmed anything.
                    if ($("teamsView").classList.contains("hidden")) showOnly("compView");
                    return;
                }

                $("waitTitleText").textContent = "Next competition";
                $("waitSub").textContent = "";
                $("waitHint").textContent = hostName(room)
                    + " is setting up competition " + compNo + " of "
                    + ((room.settings || {}).seasonLength || 1)
                    + ". You will see the pool and the rules as soon as it is confirmed.";
                $("waitBrief").classList.add("hidden");
                $("waitBoard").classList.add("hidden");
                $("enterDraft").classList.add("hidden");
                $("forceStart").classList.add("hidden");
                $("forceHint").textContent = "";
                $("waitList").innerHTML = readyRows(mem, rdy, me2, "ready", "still with the results");
                showOnly("waitView");
                return;
            }

            // Announced: the settings are fixed, so everyone including the
            // host sees them, can build a board, and waits on the rest.
            const iAmIn = !!ent[me2];
            const notIn = Object.keys(mem).filter(function (u) { return !ent[u]; });
            const notReady = Object.keys(mem).filter(function (u) { return !rdy[u]; });

            $("waitTitleText").textContent = "Competition " + compNo + " is ready";
            $("waitSub").textContent = "of " + ((room.settings || {}).seasonLength || 1);
            $("waitHint").textContent = iAmIn
                ? "You are in. The draft begins once everyone has entered."
                : "These are the settings for the next draft. Press Enter the draft below "
                  + "when you are ready, and it will begin once everyone has.";
            if (!announceSeen && !iAmIn && !amHost) {
                announceSeen = true;
                modal({
                    title: "Competition " + compNo + " is ready",
                    body: hostName(room) + " has set up the next draft. "
                        + "<strong>Have a look at the pool and the rules, then enter.</strong>"
                        + "<span class='warn'>The draft starts once everyone has entered.</span>",
                    ok: "Have a look", cancel: "Enter now"
                }).then(function (look) {
                    if (!look) MPNet.enterDraft(currentCode).catch(function () {});
                });
            }
            $("waitBrief").classList.remove("hidden");
            $("waitBrief").innerHTML = (function () {
                try { return buildBrief(room); } catch (e) { return ""; }
            })();
            $("waitBoard").classList.toggle("hidden", !iAmIn);
            $("enterDraft").classList.toggle("hidden", iAmIn);
            $("waitList").innerHTML = readyRows(mem, ent, me2, "in the draft", "not entered yet");

            if (amHost && notIn.length) {
                const since = MPNet.serverNow() - ((room.meta || {}).announcedAt || 0);
                const left = FORCE_GRACE_MS - since;
                if (left > 0) {
                    $("forceStart").classList.add("hidden");
                    $("forceHint").textContent = "Waiting for " + names(mem, notIn).join(", ")
                        + ". You can start without them in " + Math.ceil(left / 1000) + "s.";
                    startForceTicker();
                } else {
                    $("forceStart").classList.remove("hidden");
                    $("forceStart").disabled = false;
                    $("forceHint").textContent = "Waiting for " + names(mem, notIn).join(", ") + ".";
                }
            } else {
                $("forceStart").classList.add("hidden");
                $("forceHint").textContent = notIn.length
                    ? "Waiting for " + names(mem, notIn).join(", ") + "."
                    : (notReady.length ? "Still with the results: " + names(mem, notReady).join(", ") : "");
            }

            if (amHost && !notIn.length && !startingDraft) {
                startingDraft = true;
                MPNet.startDraft(currentCode).catch(function (err) {
                    startingDraft = false;
                    showNotice(err.message); setStatus("forceHint", err.message, true);
                });
            }
            showOnly("waitView");
            return;
        }
        setupShown = false;

        if (status === "competing") {
            renderFixtures(room);
            if (!compShown) { compShown = true; showComp(); }
            $("resumeDraft").classList.add("hidden");
            return;
        }

        if (status === "drafting") {
            // A new competition writes a fresh draft node, so rebuild the
            // draft UI rather than reusing the finished one.
            ensureDraftInit(room);
            MPDraftUI.applyRoom(room);
            maybeCommit(room);
            $("resumeDraft").classList.remove("hidden");
            $("startDraft").classList.add("hidden");
            setStatus("startHint", "", false);
            if (!seenDrafting) {
                seenDrafting = true;
                const amHost = (room.meta || {}).hostUid === MPNet.currentUid();
                if (amHost) {
                    showDraft();
                } else {
                    // The user may be mid-way through setting quiet hours or
                    // reading the brief, so they are told and choose to go in.
                    $("startDraft").classList.add("hidden");
                    $("resumeDraft").classList.remove("hidden");
                    const sp = $("resumeDraft").querySelector("span");
                    if (sp) sp.textContent = "Enter the draft";
                    showOnly("roomView");
                    modal({
                        title: "The draft has started",
                        body: hostName(room) + " has started the draft."
                            + (((room.settings || {}).turnMs)
                                ? "<span class='warn'>Each turn is limited to "
                                  + turnText((room.settings || {}).turnMs)
                                  + ", so do not leave it too long.</span>"
                                : ""),
                        ok: "Enter the draft", cancel: "In a moment"
                    }).then(function (yes) { if (yes) showDraft(); });
                }
            }
        } else {
            $("resumeDraft").classList.add("hidden");
        }
    }

    // ── Rejoin after a refresh ──────────────────────────────
    // Anonymous auth keeps the same identity across a refresh, so a user
    // who reloads mid-draft can be put straight back into their seat.
    function tryRejoin() {
        const code = MPNet.lastRoom();
        if (!code) return;
        setStatus("lobbyStatus", "Rejoining " + code + "...", false);
        MPNet.joinRoom(code, profile())
            .then(function (c) {
                enterRoom(c);
                setStatus("roomStatus", "Rejoined " + c + ".", false);
            })
            .catch(function () {
                // The room has gone, or we were never in it. Forget it and
                // carry on quietly rather than nagging.
                MPNet.forgetRoom();
                setStatus("lobbyStatus", "", false);
            });
    }

    // ── Draft view ──────────────────────────────────────────
    let draftReady = false;

    function ensureDraftInit(room) {
        if (draftReady) { MPDraftUI.setLive(!!(room.draft && room.draft.order)); return; }
        draftReady = true;
        const st = room.settings || {};
        const f = {
            mode: st.mode || "tournament",
            yearMin: st.yearMin || undefined,
            yearMax: st.yearMax || undefined,
            countries: st.countries || null,
            geoLabel: st.geoLabel || "All nations"
        };
        const analysis = MPEngine.feasibility(allSquads, f, positionFamilyMap);
        const ctx = MPRules.buildContext(f, analysis);
        const active = MPRules.activeConstraints(ctx, st.rules || {});

        MPDraftUI.init({
            pool: room.pool || [],
            squad: MPPicks.emptySquad(),
            taken: {},
            constraints: active,
            ruleCtx: ctx,
            myUid: MPNet.currentUid(),
            roomCode: currentCode,
            competition: (room.settings || {}).competition || 1,
            turnMs: (room.settings || {}).turnMs || 0,
            quiet: room.quiet || {},
            onExpire: function (slotId, poolIndex, forUid, done) {
                const d = latestRoom && latestRoom.draft;
                if (!d) { done(); return; }
                MPNet.makePick(currentCode, slotId, poolIndex, d.order, d.pickIndex, forUid)
                    .then(function () { done(); })
                    .catch(function () { done(); });
            },
            live: !!(room.draft && room.draft.order),
            onPick: function (slotId, poolIndex, done) {
                const d = latestRoom && latestRoom.draft;
                if (!d) { done(new Error("No draft in progress.")); return; }
                MPNet.makePick(currentCode, slotId, poolIndex, d.order, d.pickIndex)
                    .then(function () { done(null); })
                    .catch(done);
            }
        });
        MPDraftUI.wire();
    }

    // ── Commitment screen ───────────────────────────────────
    let commitWired = false;
    let commitShown = false;

    function maybeCommit(room) {
        const d = room.draft || {};
        const total = (d.order || []).length * MPPicks.SLOTS.length;
        const done = total > 0 && (d.pickIndex || 0) >= total;
        if (!done) return;

        if (!commitWired) {
            commitWired = true;
            on("forceCommit", "click", function () {
                const room = latestRoom || {};
                const mem = room.members || {};
                const com = room.commit || {};
                const out = Object.keys(mem).filter(function (u) { return !com[u]; });
                if (!out.length) return;
                modal({
                    title: "Choose for them?",
                    body: names(mem, out).join(", ") + (out.length === 1 ? " has" : " have")
                        + " not picked a goal kicker or a strategy. "
                        + "<strong>Their best kicker and a balanced strategy will be chosen.</strong>"
                        + "<span class='warn'>This cannot be undone, and the competition will "
                        + "then start.</span>",
                    ok: "Choose for them", cancel: "Keep waiting"
                }).then(function (yes) {
                    if (!yes) return;
                    out.forEach(function (u) {
                        const sq = squadFor(room, u);
                        MPNet.forceCommit(currentCode, u, bestKickerSlot(sq), 50);
                    });
                });
            });
            MPCommit.wire(function () { /* locked in; waiting list updates live */ },
                function () { /* started; the status watcher moves everyone on */ });
        }
        let liveRules = [];
        try {
            const st2 = room.settings || {};
            const ff2 = {
                mode: st2.mode || "tournament",
                yearMin: st2.yearMin || undefined,
                yearMax: st2.yearMax || undefined,
                countries: st2.countries || null
            };
            liveRules = MPRules.activeConstraints(
                MPRules.buildContext(ff2, MPEngine.feasibility(allSquads, ff2, positionFamilyMap)),
                st2.rules || {});
        } catch (e) {}

        const payload = {
            squad: MPDraftUI.squad(),
            pool: room.pool || [],
            constraints: liveRules,
            members: room.members || {},
            commits: room.commit || {},
            myUid: MPNet.currentUid(),
            hostUid: (room.meta || {}).hostUid,
            code: currentCode
        };
        if (!commitShown) {
            commitShown = true;
            MPCommit.show(payload);
            showCommit();
        } else {
            MPCommit.update(payload);
        }
    }

    function showCommit() {
        showOnly("commitView");
    }

    const ALL_VIEWS = ["lobbyView", "roomView", "setupView", "waitView", "teamsView", "draftView", "commitView", "compView"];
    function showOnly(id) {
        ALL_VIEWS.forEach(function (v) {
            const el = $(v);
            if (el) el.classList.toggle("hidden", v !== id);
        });
        scrollTop();
    }

    function scrollTop() {
        try { window.scrollTo({ top: 0, behavior: "smooth" }); }
        catch (e) { window.scrollTo(0, 0); }
    }

    function showComp() {
        showOnly("compView");
    }

    // ── Playing the fixtures ────────────────────────────────
    // Every client could compute these scores from the stored seed, but
    // only the host runs and writes them, so the record is authoritative.
    function runFixtures(room) {
        const comp = room.comp || {};
        const draft = room.draft || {};
        const pool = room.pool || [];
        const commits = room.commit || {};
        const order = draft.order || [];

        // Rebuild every squad from the shared pick list.
        const squads = {};
        order.forEach(function (u) { squads[u] = MPPicks.emptySquad(); });
        const picks = draft.picks || {};
        Object.keys(picks).forEach(function (k) {
            const pk = picks[k];
            const p = pool[pk.i];
            if (p && squads[pk.by]) squads[pk.by][pk.slot] = p;
        });

        // The active constraints for this competition, so an illegal squad
        // carries its penalty into the results.
        let activeRules = [];
        try {
            const st = room.settings || {};
            const ff = {
                mode: st.mode || "tournament",
                yearMin: st.yearMin || undefined,
                yearMax: st.yearMax || undefined,
                countries: st.countries || null
            };
            const an = MPEngine.feasibility(allSquads, ff, positionFamilyMap);
            activeRules = MPRules.activeConstraints(MPRules.buildContext(ff, an), st.rules || {});
        } catch (e) {}

        const rating = {}, kicker = {}, kickerName = {};
        order.forEach(function (u) {
            const c = commits[u] || {};
            rating[u] = MPSim.teamRating(squads[u], c.strategy, pool, activeRules).overall;
            const kp = c.kickerSlot ? squads[u][c.kickerSlot] : null;
            kicker[u] = MPCommit.kickerRate(kp);
            kickerName[u] = kp ? kp.name : null;
        });

        const rng = MPDraft.makeRng((draft.seed || 1) ^ 0x5f3759df);
        const fixtures = (comp.fixtures || []).slice();
        const results = [];

        const playOne = function (f, i) {
            const m = MPSim.simulateMatch(rng, rating[f.home], rating[f.away], kicker[f.home], kicker[f.away]);
            let final = m, note = null;
            // Knockouts cannot end level: extra time, sudden death, then kicks.
            const isKO = (f.stage === "final" || f.stage === "playoff");
            if (isKO && m.drawn) {
                const res = MPSim.resolveKnockout(rng, m, kicker[f.home], kicker[f.away]);
                final = res.result;
                note = res.path;
            }
            const bdA = MPSim.buildScoreBreakdown(rng, final.a, squads[f.home], kickerName[f.home]);
            const bdB = MPSim.buildScoreBreakdown(rng, final.b, squads[f.away], kickerName[f.away]);
            results.push({
                i: i, home: f.home, away: f.away, stage: f.stage,
                a: final.a, b: final.b, drawn: final.drawn, winner: final.winner,
                aPts: final.aPts, bPts: final.bPts,
                note: note, bdA: bdA, bdB: bdB
            });
        };

        // Stage one: every fixture with two known teams.
        fixtures.forEach(function (f, i) {
            if (MPFixtures.isPlaceholder(f.home) || MPFixtures.isPlaceholder(f.away)) return;
            playOne(f, i);
        });

        // Stage two: resolve the placeholders from the stage standings, then
        // play those too, so a competition finishes in one go.
        const byStage = {};
        ["pool", "poolA", "poolB", "league"].forEach(function (st) {
            const t = MPSim.stageStandings(order, results, st);
            if (t.length) byStage[st] = t;
        });
        const resolved = fixtures.map(function (f) { return Object.assign({}, f); });
        fixtures.forEach(function (f, i) {
            if (!MPFixtures.isPlaceholder(f.home) && !MPFixtures.isPlaceholder(f.away)) return;
            const h = MPFixtures.isPlaceholder(f.home) ? MPSim.resolvePlaceholder(f.home, byStage) : f.home;
            const a = MPFixtures.isPlaceholder(f.away) ? MPSim.resolvePlaceholder(f.away, byStage) : f.away;
            if (!h || !a) return;
            resolved[i].home = h;
            resolved[i].away = a;
            playOne({ home: h, away: a, stage: f.stage, label: f.label }, i);
        });

        results.sort(function (x, y) { return x.i - y.i; });

        const standings = MPSim.buildTable(order, results);

        // Legality is decided once, here, and stored with the competition so
        // every client shows the same verdict.
        const illegal = {}, breachInfo = {};
        order.forEach(function (u) {
            const b = MPSim.squadBreaches(squads[u], pool, activeRules);
            if (b.length) { illegal[u] = true; breachInfo[u] = b; }
        });

        const winner = MPSim.competitionWinner(order, { fixtures: resolved }, results, illegal);
        const tally = MPSim.updateTally(room.tally, order, winner, standings, illegal);

        return MPNet.finishCompetition(currentCode, {
            fixtures: resolved, results: results, standings: standings,
            winner: winner, illegal: illegal, breaches: breachInfo
        }, tally).then(function () {
            // Everyone can start watching now. The host watches the same
            // stored results as everyone else, rather than the room waiting
            // on the host's playback to finish before publishing.
            return playBack(results, resolved).then(function () {
                watchedComp[compKey(latestRoom || {})] = true;
                renderRoom(latestRoom);
            });
        });
    }

    // ── Setup between competitions ──────────────────────────
    // The host re-chooses the pool and rules before each new draft. Rather
    // than duplicating the controls, the whole options block is moved into
    // the setup view and moved back afterwards, so there is one set of
    // controls and one set of handlers.
    function renderSetupStatus(room) {
        const el = $("setupReady");
        if (!el) return;
        const mem = room.members || {};
        const rdy = room.ready || {};
        const out = Object.keys(mem).filter(function (u) { return !rdy[u]; });
        el.innerHTML = "<p class='sub-label'>Where everyone is</p>"
            + readyRows(mem, rdy, MPNet.currentUid(), "ready to move on", "still with the results")
            + "<p class='list-hint'>" + (out.length
                ? "You can still set this up and confirm it. "
                  + names(mem, out).join(", ") + (out.length === 1 ? " will" : " will")
                  + " be invited in as soon as you do."
                : "Everyone has finished with the results.") + "</p>";
    }

    function showSetup(room) {
        const block = $("optionsBlock");
        const host = $("setupHost");
        if (block && host && block.parentNode !== host) host.appendChild(block);
        // Seats and season length are fixed for the life of the room.
        $("seatsBlock").classList.add("hidden");

        const st = room.settings || {};
        $("setupSub").textContent = "competition " + (st.competition || 2)
            + " of " + (st.seasonLength || 1);
        renderSetupStatus(room);

        // Load the room's current settings into the controls.
        state.mode = st.mode === "career" ? "career" : "tournament";
        if (st.yearMin) state.yMin = Math.max(0, YEARS.indexOf(st.yearMin));
        if (st.yearMax) state.yMax = Math.max(0, YEARS.indexOf(st.yearMax));
        // The chips store "" for All nations, not the label.
        state.geo = (st.geoLabel && GEO[st.geoLabel]) ? st.geoLabel : "";
        state.rules = Object.assign({}, st.rules || {});
        if (st.turnMs === 0 || st.turnMs) state.turnMs = st.turnMs;
        if (st.hostIdleMs) state.hostIdleMs = st.hostIdleMs;
        refresh();

        showOnly("setupView");
    }

    // Put the controls back where they belong when leaving the setup view.
    function restoreOptions() {
        const block = $("optionsBlock");
        const pane = $("createPane");
        const btn = $("create");
        if (block && pane && block.parentNode !== pane) pane.insertBefore(block, btn);
        $("seatsBlock").classList.remove("hidden");
    }

    function confirmSetup() {
        if (!currentCode) return;

        // The same pool gate the create screen uses. Without this the host
        // could narrow the pool below what the room needs, and the draft
        // would run out of players part way through.
        const room = latestRoom || {};
        const seats = (room.settings || {}).tableSize
            || Object.keys(room.members || {}).length || 2;
        const check = filters();
        const analysis = MPEngine.feasibility(allSquads, check, positionFamilyMap);
        const status = MPEngine.poolStatus(analysis, seats);
        if (status.state === "blocked") {
            setStatus("setupStatus", status.reasons.join(" "), true);
            return;
        }
        const rf = MPRules.rulesFeasible(MPRules.buildContext(check, analysis), rulesForCreate(), analysis);
        if (!rf.ok) {
            setStatus("setupStatus", rf.reasons.join(" "), true);
            return;
        }

        $("setupConfirm").disabled = true;
        setStatus("setupStatus", "Rebuilding the pool...", false);
        // Use the same helpers the create path uses, so the settings written
        // here are identical in shape to those written at room creation.
        const f = filters();
        const patch = {
            mode: f.mode,
            geoLabel: f.geoLabel,
            countries: f.countries || null,
            yearMin: f.yearMin || null,
            yearMax: f.yearMax || null,
            rules: rulesForCreate(),
            turnMs: state.turnMs,
            hostIdleMs: state.hostIdleMs
        };
        MPNet.announceNext(currentCode, patch)
            .then(function () {
                restoreOptions();
                setStatus("setupStatus", "", false);
                $("setupConfirm").disabled = false;
                setupShown = false;
                startingDraft = false;
            })
            .catch(function (err) {
                showNotice("Could not set up the next competition: " + err.message);
                setStatus("setupStatus", err.message, true);
                $("setupConfirm").disabled = false;
            });
    }

    // ── Quiet hours ─────────────────────────────────────────
    // Personal, not a room rule. The pick clock pauses during these hours
    // for whoever is on the clock, so nobody has to draft at 3am.
    const QUIET_KEY = "mp-quiet-hours";

    function loadQuiet() {
        try {
            const raw = localStorage.getItem(QUIET_KEY);
            if (raw) return JSON.parse(raw);
        } catch (e) {}
        return { on: false, start: "23:00", end: "08:00" };
    }

    function currentQuiet() {
        return {
            on: !!$("quietOn").checked,
            start: $("quietStart").value || "23:00",
            end: $("quietEnd").value || "08:00",
            // Minutes to add to UTC for this device's local time.
            tzOffset: -new Date().getTimezoneOffset()
        };
    }

    function renderQuiet() {
        const q = quietState;
        $("quietOn").checked = !!q.on;
        $("quietStart").value = q.start || "23:00";
        $("quietEnd").value = q.end || "08:00";
        $("quietStart").disabled = !q.on;
        $("quietEnd").disabled = !q.on;
        $("quietNow").textContent = q.on ? (q.start + " to " + q.end) : "not set";

        const ok = MPDraft.quietValid(q);
        const len = MPDraft.quietLength(MPDraft.hhmmToMin(q.start), MPDraft.hhmmToMin(q.end));
        $("quietHint").innerHTML = !q.on
            ? "Your clock runs continuously."
            : (ok
                ? "Your clock pauses for " + Math.round(len / 60) + " hours a night."
                : "<span class='quiet-warn'>Too long. You must leave at least eight hours "
                  + "a day when your clock can run, or a draft could never finish.</span>");
        return ok;
    }

    function saveQuiet() {
        quietState = currentQuiet();
        const ok = renderQuiet();
        try { localStorage.setItem(QUIET_KEY, JSON.stringify(quietState)); } catch (e) {}
        if (ok && currentCode) MPNet.saveQuiet(currentCode, quietState).catch(function () {});
    }

    // ── Room brief ──────────────────────────────────────────
    // A joiner needs the whole setup before the draft starts: the pool,
    // the constraints and the format. Anything that will limit their picks
    // belongs here, not discovered mid-draft.
    // If the host has gone quiet for longer than the room allows, anyone
    // else may take over, so the room cannot be frozen by one absence.
    function renderHostIdle(room) {
        const el = $("hostIdle");
        if (!el) return;
        const meta = room.meta || {};
        const me = MPNet.currentUid();
        const limit = (room.settings || {}).hostIdleMs || 86400000;
        // A room from before heartbeats existed has no hostSeenAt. Treating
        // that as "away since 1970" wrongly offers a takeover immediately.
        const seen = meta.hostSeenAt || meta.createdAt || 0;
        if (!seen) { el.classList.add("hidden"); return; }
        const idle = MPNet.serverNow() - seen;
        if (meta.hostUid === me || idle < limit) { el.classList.add("hidden"); return; }
        el.classList.remove("hidden");
        el.innerHTML = "<strong>" + esc(hostName(room)) + " has been away for "
            + Math.floor(idle / 3600000) + " hours.</strong>"
            + "The room cannot move on without a host. "
            + "<button class='chip-btn' id='takeHost'>Take over as host</button>";
        const b = $("takeHost");
        if (b) b.onclick = function () {
            b.disabled = true;
            MPNet.claimHost(currentCode).catch(function (err) {
                showNotice(err.message); setStatus("startHint", err.message, true);
                b.disabled = false;
            });
        };
    }

    function renderBrief(room) {
        const el = $("roomBrief");
        if (!el) return;
        try {
            el.innerHTML = buildBrief(room);
        } catch (e) {
            // Informational only, so it must never take the room view down.
            el.innerHTML = "";
        }
    }

    function buildBrief(room) {
        const st = room.settings || {};
        const f = {
            mode: st.mode || "tournament",
            yearMin: st.yearMin || undefined,
            yearMax: st.yearMax || undefined,
            countries: st.countries || null,
            geoLabel: st.geoLabel || "All nations"
        };

        let analysis = null;
        try { analysis = MPEngine.feasibility(allSquads, f, positionFamilyMap); } catch (e) {}

        const rows = [];
        const add = function (k, v) {
            rows.push("<div class='brief-row'><div class='brief-k'>" + k
                + "</div><div class='brief-v'>" + v + "</div></div>");
        };

        add("Pool", esc(st.geoLabel || "All nations")
            + "<span class='sub'>" + (st.yearMin && st.yearMax
                ? (st.yearMin === st.yearMax ? esc(st.yearMin) : esc(st.yearMin) + " to " + esc(st.yearMax))
                : "All tournaments") + "</span>");

        add("Ratings", st.mode === "career"
            ? "Career peak<span class='sub'>Each player at his best, one version only</span>"
            : "By tournament<span class='sub'>Players rated for the year they played, and each year is a separate pick</span>");

        if (analysis) {
            const nations = analysis.uniqueCountries || 0;
            add("Players available", (analysis.entries || 0).toLocaleString()
                + "<span class='sub'>" + (analysis.kickers || 0) + " recognised kickers, from "
                + nations + " nation" + (nations === 1 ? "" : "s") + "</span>");
        }

        const users = st.tableSize || Object.keys(room.members || {}).length || 2;
        add("Format", esc(MPDraft.formatFor(users).name)
            + "<span class='sub'>" + users + " users, snake draft, 15 rounds each</span>");

        const turn = st.turnMs || 0;
        const turnTxt = turn ? turnText(turn) : "No limit";
        add("Turn limit", turnTxt + "<span class='sub'>"
            + (turn ? "If a pick is not made in time, it is made automatically from that user's Big Board"
                    : "A draft can stall if someone stops picking") + "</span>");

        const season = st.seasonLength || 1;
        add("Season", season + " competition" + (season === 1 ? "" : "s")
            + "<span class='sub'>Locked once the first draft begins</span>");

        let ruleHtml = "";
        try {
            const ctx = MPRules.buildContext(f, analysis);
            const active = MPRules.activeConstraints(ctx, st.rules || {});
            ruleHtml = active.length
                ? active.map(function (r) {
                    return "<span class='brief-rule'>" + esc(ruleText(r)) + "</span>";
                }).join("")
                : "<span class='sub'>None. Any player, any nation, any tournament.</span>";
        } catch (e) {
            ruleHtml = "<span class='sub'>None</span>";
        }
        add("Restrictions", ruleHtml);

        add("Out of position", "Allowed, at a rating penalty"
            + "<span class='sub'>The front row is the exception: only front-row players may pack down there</span>");

        return rows.join("");
    }

    function ruleText(r) {
        if (r.id === "maxPerCountry") return "Maximum " + r.value + " players from any one nation";
        if (r.id === "maxPerTournament") return "Maximum " + r.value + " players from any one tournament";
        if (r.id === "minPerCountry") return "At least " + r.value + " different nations in your XV";
        if (r.id === "onePerTournament") return "One player from each of the " + r.value + " tournaments";
        return r.id;
    }

    // ── Playback ────────────────────────────────────────────
    // Reveals results one fixture at a time at the chosen speed, matching
    // the pacing of the single-player app (900ms base).
    function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    function playBack(results, resolvedFixtures) {
        playingBack = true;
        revealed = {};
        liveFixtures = resolvedFixtures || null;
        renderFixtures(latestRoom, results, revealed);
        let chain = Promise.resolve();
        results.forEach(function (r) {
            chain = chain.then(function () {
                return delay(900 * simSpeed).then(function () {
                    revealed[r.i] = true;
                    renderFixtures(latestRoom, results, revealed, r.i);
                });
            });
        });
        return chain.then(function () {
            return delay(500 * simSpeed).then(function () { playingBack = false; liveFixtures = null; });
        });
    }

    function setSpeed(v) {
        simSpeed = v;
        $("spSlow").setAttribute("aria-pressed", String(v === 1.8));
        $("spMed").setAttribute("aria-pressed", String(v === 1));
        $("spFast").setAttribute("aria-pressed", String(v === 0.4));
        try { localStorage.setItem("mp-sim-speed", String(v)); } catch (e) {}
    }

    function initSpeed() {
        let v = 1;
        try { v = parseFloat(localStorage.getItem("mp-sim-speed")) || 1; } catch (e) {}
        setSpeed(v);
    }

    // ── Fixtures ────────────────────────────────────────────
    function renderFixtures(room, liveResults, liveRevealed, justPlayed) {
        let comp = room && room.comp;
        if (comp && liveFixtures) comp = Object.assign({}, comp, { fixtures: liveFixtures });
        if (!comp) return;
        $("compName").textContent = comp.name || "";
        $("compDecided").textContent = comp.decidedBy ? ("Decided by: " + comp.decidedBy) : "";
        const members = room.members || {};
        const me = MPNet.currentUid();

        const name = function (u) {
            if (MPFixtures.isPlaceholder(u)) return null;
            const m = members[u] || {};
            return m.name || "User";
        };
        const kit = function (u) {
            const m = members[u] || {};
            return m.kit || "#6E8CA6";
        };

        // Scores are withheld entirely until this user has played the
        // competition through. Publishing the results early is what lets
        // everyone start watching at once, but it must not show the answers.
        const watchedHere = !!watchedComp[compKey(room)];
        const results = {};
        const source = liveResults || (watchedHere ? (comp.results || []) : []);
        source.forEach(function (r) {
            if (!liveRevealed || liveRevealed[r.i]) results[r.i] = r;
        });
        const played = (comp.results || []).length > 0 || playingBack;

        // Host can play the fixtures once, and only once.
        const isHost = (room.meta || {}).hostUid === me;
        // The host plays the fixtures to generate them. Everyone else gets
        // to play the same stored results back at their own pace, so they
        // watch the competition unfold rather than meeting a finished table.
        const hasResults = (comp.results || []).length > 0;
        const canGenerate = isHost && !hasResults;
        const canReplay = hasResults && !watchedComp[compKey(room)] && !playingBack;
        // Once watched, there is nothing left to press.

        // Everyone sees the button from the start. It only becomes usable
        // once the host has generated the results, so a user knows the
        // tournament is coming rather than staring at an empty screen.
        const showPlay = canGenerate || canReplay || (!hasResults && !isHost);
        $("playBtn").classList.toggle("hidden", !showPlay || playingBack);
        $("playBtn").disabled = !hasResults && !isHost;
        $("playBtn").querySelector("span").textContent = canGenerate
            ? "Play the fixtures"
            : (hasResults ? "Watch the tournament" : "Waiting for " + hostName(room));
        $("speedRow").classList.toggle("hidden", !(canGenerate || canReplay) && !playingBack);
        $("compStatus").textContent = playingBack
            ? "Playing..."
            : (hasResults ? "" : (isHost ? "" : "Waiting for "
                + (((room.members || {})[(room.meta || {}).hostUid] || {}).name || "the host")
                + " to play the fixtures."));

        renderSeason(room, comp);
        const unwatched = (comp.results || []).length > 0 && !watchedComp[compKey(room)];
        if (playingBack || unwatched) {
            $("tableWrap").classList.add("hidden");
            $("seriesWrap").classList.add("hidden");
        } else if (!renderSeries(room, comp)) {
            renderTable(room, comp);
        } else {
            $("tableWrap").classList.add("hidden");
        }

        let lastRound = null;
        const rows = (comp.fixtures || []).map(function (f) {
            let head = "";
            if (f.label) head = "<div class='fx-label'>" + esc(f.label) + "</div>";
            else if (f.round !== lastRound) {
                lastRound = f.round;
                head = "<div class='fx-round'>Round " + f.round + "</div>";
            }
            const hn = name(f.home), an = name(f.away);
            const mine = (f.home === me || f.away === me);
            const res = results[comp.fixtures.indexOf(f)];
            const scoreHtml = res
                ? "<span class='score" + (res.winner === "a" ? " winner" : "") + "'>" + res.a + "</span>"
                  + "<span class='vs'>-</span>"
                  + "<span class='score" + (res.winner === "b" ? " winner" : "") + "'>" + res.b + "</span>"
                : "<span class='vs'>v</span>";
            const idx = comp.fixtures.indexOf(f);
            const cls = (mine ? " mine" : "") + (res ? " played" : "")
                + (playingBack && !res ? " pending-play" : "")
                + (justPlayed === idx ? " just-played" : "");
            return head + "<div class='fx" + cls + "'>"
                + (hn ? "<span class='kit-dot' style='background:" + kit(f.home) + "'></span>" : "")
                + "<span class='side" + (hn ? "" : " pending") + "'>"
                + esc(hn || MPFixtures.placeholderLabel(f.home)) + "</span>"
                + scoreHtml
                + "<span class='side away" + (an ? "" : " pending") + "'>"
                + esc(an || MPFixtures.placeholderLabel(f.away)) + "</span>"
                + (an ? "<span class='kit-dot' style='background:" + kit(f.away) + "'></span>" : "")
                + "</div>"
                + (res ? scorersHtml(res) : "");
        }).join("");
        $("fixtureList").innerHTML = rows;
    }

    // Try scorers, conversions and penalties under a played fixture.
    function scorersHtml(res) {
        const side = function (bd) {
            if (!bd) return "";
            const t = (bd.tries || []).map(function (x) {
                return x.count > 1 ? esc(x.name) + " x" + x.count : esc(x.name);
            }).join(", ");
            const lines = [];
            if (t) lines.push("<span class='lbl'>T</span> " + t);
            if (bd.conversions) lines.push("<span class='lbl'>C</span> " + esc(bd.kicker || "") + " x" + bd.conversions);
            if (bd.penalties) lines.push("<span class='lbl'>P</span> " + esc(bd.kicker || "") + " x" + bd.penalties);
            return lines.join("<br>");
        };
        const a = side(res.bdA), b = side(res.bdB);
        const note = res.note ? "<div class='fx-note'>Decided in " + esc(res.note) + "</div>" : "";
        if (!a && !b) return note;
        return note + "<div class='fx-scorers'><div class='col'>" + a
            + "</div><div class='col away'>" + b + "</div></div>";
    }

    // Two users play a Test series, not a league, so show the series
    // outcome rather than a table (spec section 12).
    function renderSeries(room, comp) {
        const order = (room.draft || {}).order || [];
        const wrap = $("seriesWrap");
        if (order.length !== 2 || !(comp.results || []).length) {
            wrap.classList.add("hidden");
            return false;
        }
        const members = room.members || {};
        const r = MPSim.seriesResult(order, comp.results);
        const nameOf = function (u) { return (members[u] || {}).name || "User"; };
        wrap.classList.remove("hidden");
        $("seriesBox").innerHTML = "<div class='series-box'>"
            + "<div class='series-score'>" + r.winsA + " - " + r.winsB + "</div>"
            + "<div class='series-note'>" + esc(nameOf(r.a)) + " v " + esc(nameOf(r.b))
            + (r.draws ? ", " + r.draws + " drawn" : "") + "</div>"
            + (r.winner
                ? "<div class='series-winner'>" + esc(nameOf(r.winner)) + " wins the series</div>"
                : "<div class='series-winner'>Series level</div>")
            + "<div class='series-note'>Decided on " + esc(r.decidedBy)
            + ". Aggregate " + r.aggregateA + " to " + r.aggregateB + ".</div>"
            + "</div>";
        return true;
    }

    // Competition winner, season tally, and what happens next.
    function renderSeason(room, comp) {
        const st = room.settings || {};
        // True once the host has already moved the room on. The results are
        // still readable, but this screen no longer drives what happens next.
        const movedOn = ((room.meta || {}).status !== "competing");
        const members = room.members || {};
        const me = MPNet.currentUid();
        const nameOf = function (u) { return (members[u] || {}).name || "User"; };
        const now = st.competition || 1;
        const total = st.seasonLength || 1;
        // Nothing about the outcome is shown until this user has watched it.
        const watched = !!watchedComp[compKey(room)];
        const played = (comp.results || []).length > 0 && !playingBack && watched;

        const wb = $("winnerBox");
        const tw = $("tallyWrap");
        const nb = $("nextComp");

        if (!played) {
            $("seasonSummary").classList.add("hidden");
            $("newTournament").classList.add("hidden");
            $("goHome").classList.add("hidden");
            $("compBack").classList.remove("hidden");
            wb.classList.add("hidden");
            tw.classList.add("hidden");
            nb.classList.add("hidden");
            $("nextHint").textContent = "";
            return;
        }

        const seasonOver = now >= total;
        const tally = room.tally || {};
        const rankedTally = MPSim.tallyOrder(tally);
        const champion = seasonOver && rankedTally.length ? rankedTally[0].uid : null;

        // Winner box: this competition, or the season champion at the end.
        wb.classList.remove("hidden");
        if (seasonOver && champion) {
            wb.innerHTML = "<div class='winner-box champion'>"
                + "<div class='winner-lbl'>Season champion</div>"
                + "<div class='winner-name'>" + esc(nameOf(champion)) + "</div>"
                + "<div class='winner-sub'>" + rankedTally[0].titles + " of " + total
                + " competition" + (total === 1 ? "" : "s") + " won</div></div>";
        } else if (comp.winner) {
            const illegalMap = comp.illegal || {};
            const anyIllegal = Object.keys(illegalMap).length;
            wb.innerHTML = "<div class='winner-box'>"
                + "<div class='winner-lbl'>Competition " + now + " of " + total + "</div>"
                + "<div class='winner-name'>" + esc(nameOf(comp.winner)) + "</div>"
                + "<div class='winner-sub'>takes the title"
                + (anyIllegal ? ", with " + anyIllegal + " side"
                    + (anyIllegal === 1 ? "" : "s") + " ruled ineligible" : "")
                + "</div></div>";
        } else if ((comp.results || []).length) {
            wb.innerHTML = "<div class='winner-box vacant'>"
                + "<div class='winner-lbl'>Competition " + now + " of " + total + "</div>"
                + "<div class='winner-name'>No champion</div>"
                + "<div class='winner-sub'>every side fielded an illegal XV</div></div>";
        } else {
            wb.classList.add("hidden");
        }

        // Room tally, once there is more than one competition in play.
        if (total > 1 && rankedTally.length) {
            tw.classList.remove("hidden");
            $("tallySub").textContent = "after " + now + " of " + total;
            const head = "<tr><th class='pos'></th><th class='team'>Team</th><th>Titles</th>"
                + "<th>Played</th><th>Pts</th><th>PD</th><th>Illegal</th></tr>";
            const body = rankedTally.map(function (r, i) {
                return "<tr" + (r.uid === me ? " class='mine'" : "") + ">"
                    + "<td class='pos'>" + (i + 1) + "</td>"
                    + "<td class='team'>" + esc(nameOf(r.uid)) + "</td>"
                    + "<td class='titles'>" + r.titles + "</td>"
                    + "<td>" + r.played + "</td><td>" + r.points + "</td>"
                    + "<td>" + (r.pd > 0 ? "+" : "") + r.pd + "</td>"
                    + "<td class='" + (r.illegal ? "badcount" : "") + "'>"
                    + (r.illegal || "") + "</td></tr>";
            }).join("");
            $("tallyTable").innerHTML = "<table class='ltable'>" + head + body + "</table>";
        } else {
            tw.classList.add("hidden");
        }

        // Next competition. Everyone must say they have finished looking at
        // the results before the room moves on, so nobody is dragged off
        // the screen mid-read by someone else's click.
        const isHost = (room.meta || {}).hostUid === me;
        const ready = room.ready || {};
        const iAmReady = !!ready[me];
        const outstanding = Object.keys(members).filter(function (u) { return !ready[u]; });

        $("showTeams").classList.toggle("hidden", !watchedComp[compKey(room)]);
        const rb = $("readyBtn");
        const rl = $("readyList");
        $("preBoard").classList.toggle("hidden", seasonOver);
        if (!seasonOver) {
            rb.classList.toggle("hidden", iAmReady);
            rb.disabled = false;
            // The list is always visible, so the host can see who is still
            // reading before deciding whether to set the next one up.
            rl.classList.remove("hidden");
            rl.innerHTML = readyRows(members, ready, me, "ready", "still with the results");
        } else {
            rb.classList.add("hidden");
            rl.classList.add("hidden");
        }

        if (seasonOver) {
            // The season is done: show the whole story, not the last set of
            // fixtures, and offer the only action that still makes sense.
            nb.classList.add("hidden");
            $("nextHint").textContent = "";
            $("seasonSummary").classList.remove("hidden");
            renderSeasonSummary(room);
            $("fixtureList").classList.add("hidden");
            $("tableWrap").classList.add("hidden");
            $("seriesWrap").classList.add("hidden");
            $("speedRow").classList.add("hidden");
            $("playBtn").classList.add("hidden");
            $("newTournament").classList.remove("hidden");
            $("goHome").classList.remove("hidden");
            $("compBack").classList.add("hidden");
        } else if (isHost) {
            nb.classList.toggle("hidden", !iAmReady);
            nb.disabled = false;
            $("nextHint").textContent = iAmReady
                ? "The next draft picks in reverse order, so the bottom of the tally picks first."
                : "Take your time with the results. Say when you are ready.";
        } else if (iAmReady) {
            nb.classList.add("hidden");
            $("nextHint").textContent = outstanding.length
                ? "Waiting for " + names(members, outstanding).join(", ") + "."
                : "Waiting for " + hostName(room) + " to set up the next competition.";
        } else {
            nb.classList.add("hidden");
            $("nextHint").textContent = "Waiting for "
                + (((room.members || {})[(room.meta || {}).hostUid] || {}).name || "the host")
                + " to set up competition " + (now + 1) + " of " + total + ".";
        }
    }

    // At the end of a season the last competition's fixtures are not the
    // story: the season is. This replaces that detail with a summary of
    // every competition played.
    function renderSeasonSummary(room) {
        const el = $("seasonSummary");
        if (!el) return "";
        const members = room.members || {};
        const hist = room.history || {};
        const total = (room.settings || {}).seasonLength || 1;
        const nameOf = function (u) { return (members[u] || {}).name || "User"; };

        const rows = [];
        for (let n = 1; n <= total; n++) {
            const h = hist[n] || (n === ((room.settings || {}).competition || 1) ? room.comp : null);
            const w = h && h.winner;
            rows.push("<div class='sum-row'><span class='sum-no'>" + n + "</span>"
                + "<span class='sum-win" + (w ? "" : " sum-vacant") + "'>"
                + (w ? esc(nameOf(w)) : "no champion") + "</span></div>");
        }

        const tally = MPSim.tallyOrder(room.tally || {});
        const table = "<table class='ltable'><tr><th class='pos'></th><th class='team'>Team</th>"
            + "<th>Titles</th><th>Pts</th><th>PD</th><th>Illegal</th></tr>"
            + tally.map(function (r, i) {
                return "<tr" + (r.uid === MPNet.currentUid() ? " class='mine'" : "") + ">"
                    + "<td class='pos'>" + (i + 1) + "</td>"
                    + "<td class='team'>" + esc(nameOf(r.uid)) + "</td>"
                    + "<td class='titles'>" + r.titles + "</td>"
                    + "<td>" + r.points + "</td>"
                    + "<td>" + (r.pd > 0 ? "+" : "") + r.pd + "</td>"
                    + "<td class='" + (r.illegal ? "badcount" : "") + "'>" + (r.illegal || "") + "</td></tr>";
            }).join("") + "</table>";

        el.innerHTML = "<div class='season-sum'>"
            + "<p class='sum-head'>Every competition</p>" + rows.join("")
            + "<p class='sum-head'>Final standings</p>" + table + "</div>";
        return true;
    }

    function readyRows(members, flags, me, doneLabel, waitLabel) {
        doneLabel = doneLabel || "ready";
        waitLabel = waitLabel || "still watching";
        return Object.keys(members).map(function (u) {
            const m = members[u] || {};
            const done = !!flags[u];
            return "<div class='ready-row " + (done ? "done" : "waiting") + "'>"
                + "<span class='tick'>" + (done ? "\u2713" : "\u25CB") + "</span>"
                + "<span class='rname'>" + esc(m.name || "User") + (u === me ? " (you)" : "") + "</span>"
                + "<span class='rstate'>" + esc(done ? doneLabel : waitLabel) + "</span></div>";
        }).join("");
    }

    // The force countdown needs to tick even when nothing else changes.
    function startForceTicker() {
        if (forceTicker) return;
        forceTicker = setInterval(function () {
            if (!latestRoom || (latestRoom.meta || {}).status !== "announced") {
                clearInterval(forceTicker); forceTicker = null; return;
            }
            renderRoom(latestRoom);
        }, 1000);
    }

    function names(members, uids) {
        return uids.map(function (u) { return (members[u] || {}).name || "User"; });
    }

    function hostName(room) {
        const h = (room.meta || {}).hostUid;
        return ((room.members || {})[h] || {}).name || "the host";
    }

    // Rebuild one user's squad from the shared pick list.
    function squadFor(room, uid) {
        const sq = MPPicks.emptySquad();
        const picks = ((room.draft || {}).picks) || {};
        const pool = room.pool || [];
        Object.keys(picks).forEach(function (k) {
            const pk = picks[k];
            if (pk.by !== uid) return;
            const p = pool[pk.i];
            if (p) sq[pk.slot] = p;
        });
        return sq;
    }

    // The most reliable kicker in a squad, for when the host has to choose.
    function bestKickerSlot(squad) {
        let best = null, bestRate = -1;
        MPPicks.SLOTS.forEach(function (s) {
            const p = squad[s.id];
            if (!p) return;
            const rate = MPCommit.kickerRate(p);
            if (rate > bestRate) { bestRate = rate; best = s.id; }
        });
        return best || "FH";
    }

    // Every squad, so people can argue about each other's picks. Shown once
    // the tournament has been watched, since it gives away nothing then.
    function renderTeams(room) {
        const members = room.members || {};
        const order = ((room.draft || {}).order) || Object.keys(members);
        const comp = room.comp || {};
        const commits = room.commit || {};
        const illegal = comp.illegal || {};
        const breaches = comp.breaches || {};
        const me = MPNet.currentUid();

        $("teamsSub").textContent = "competition " + ((room.settings || {}).competition || 1);

        $("teamsBody").innerHTML = order.map(function (u) {
            const sq = squadFor(room, u);
            const c = commits[u] || {};
            const kickSlot = c.kickerSlot || null;
            const r = MPSim.teamRating(sq, c.strategy);
            const fw = Math.round(MPSim.strategyForwardWeight(c.strategy == null ? 50 : c.strategy) * 100);

            const rows = MPPicks.SLOTS.map(function (slot) {
                const p = sq[slot.id];
                if (!p) return "<div class='sq-row'><span class='sq-num'>" + slot.num
                    + "</span><span class='sq-nm'>not filled</span></div>";
                const pen = MPPicks.oopPenalty(p, slot.node);
                return "<div class='sq-row'><span class='sq-num'>" + slot.num + "</span>"
                    + "<span class='sq-nm'>" + esc(p.name)
                    + (slot.id === kickSlot ? " <span class='kick'>KICKER</span>" : "") + "</span>"
                    + "<span class='sq-ct'>" + esc(p.country) + (p.year ? " " + p.year : "") + "</span>"
                    + "<span class='sq-rt'>" + MPPicks.effectiveRating(p, slot.node)
                    + (pen ? "<small class='pen'> -" + pen + "</small>" : "") + "</span></div>";
            }).join("");

            const bad = illegal[u];
            const bl = (breaches[u] || []).map(function (b) { return b.rule; }).join(", ");
            return "<div class='squad-card" + (u === me ? " mine" : "") + "'>"
                + "<div class='squad-head'><span class='squad-name'>"
                + esc((members[u] || {}).name || "User") + (u === me ? " (you)" : "")
                + "</span><span class='squad-rate'>" + r.overall + "</span></div>"
                + "<div class='squad-meta'>Forwards " + fw + "% of the weight"
                + (bad ? " | <span class='illegal-tag'>illegal: " + esc(bl) + "</span>" : "")
                + "</div><div class='squad-list'>" + rows + "</div></div>";
        }).join("");
    }

    function renderTable(room, comp) {
        const standings = comp.standings;
        const wrap = $("tableWrap");
        if (!standings || !standings.length) { wrap.classList.add("hidden"); return; }
        wrap.classList.remove("hidden");
        const members = room.members || {};
        const me = MPNet.currentUid();
        const head = "<tr><th class='pos'></th><th class='team'>Team</th><th>P</th><th>W</th>"
            + "<th>D</th><th>L</th><th>PF</th><th>PA</th><th>PD</th><th>Pts</th></tr>";
        const illegal = comp.illegal || {};
        const body = standings.map(function (r, i) {
            const m = members[r.uid] || {};
            const bad = !!illegal[r.uid];
            return "<tr class='" + (r.uid === me ? "mine " : "") + (bad ? "illegal" : "") + "'>"
                + "<td class='pos'>" + (i + 1) + "</td>"
                + "<td class='team'>" + esc(m.name || "User")
                + (bad ? "<span class='ineligible'>ineligible</span>" : "") + "</td>"
                + "<td>" + r.played + "</td><td>" + r.won + "</td><td>" + r.drawn + "</td><td>" + r.lost + "</td>"
                + "<td>" + r.pf + "</td><td>" + r.pa + "</td>"
                + "<td>" + (r.pd > 0 ? "+" : "") + r.pd + "</td><td>" + r.points + "</td></tr>";
        }).join("");
        $("leagueTable").innerHTML = "<table class='ltable'>" + head + body + "</table>";
    }

    function showDraft() {
        showOnly("draftView");
        setStatus("draftStatus", "", false);
    }

    // ── Helpers ─────    // ── Helpers ─────────────────────────────────────────────
    // Designed confirmation dialogue, replacing window.confirm.
    function modal(opts) {
        return new Promise(function (resolve) {
            $("modalTitle").textContent = opts.title || "Are you sure?";
            $("modalBody").innerHTML = opts.body || "";
            $("modalOk").textContent = opts.ok || "Confirm";
            $("modalCancel").textContent = opts.cancel || "Cancel";
            $("modal").classList.remove("hidden");
            $("modalScrim").classList.remove("hidden");

            const close = function (val) {
                $("modal").classList.add("hidden");
                $("modalScrim").classList.add("hidden");
                $("modalOk").onclick = null;
                $("modalCancel").onclick = null;
                $("modalScrim").onclick = null;
                document.removeEventListener("keydown", onKey);
                resolve(val);
            };
            const onKey = function (e) {
                if (e.key === "Escape") close(false);
                if (e.key === "Enter") close(true);
            };
            $("modalOk").onclick = function () { close(true); };
            $("modalCancel").onclick = function () { close(false); };
            $("modalScrim").onclick = function () { close(false); };
            document.addEventListener("keydown", onKey);
            $("modalOk").focus();
        });
    }
    window.MPModal = modal;

    function showNotice(msg) {
        if (!msg) { $("notice").classList.add("hidden"); return; }
        $("noticeText").textContent = msg;
        $("notice").classList.remove("hidden");
    }

    function setStatus(id, msg, isErr) { const el = $(id); el.textContent = msg; el.classList.toggle("err", !!isErr); }
    function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

    // ── Boot ────────────────────────────────────────────────
    function randomKit() {
        const k = KITS[Math.floor(Math.random() * KITS.length)];
        $("kit1").value = k.a;
        $("kit2").value = k.b;
    }

    function boot() {
        const v = $("version");
        if (v) v.textContent = VERSION;
        quietState = loadQuiet();
        renderQuiet();
        const saved = recallName();
        if (saved && $("name") && !$("name").value) $("name").value = saved;
        initTheme();
        initSpeed();
        randomKit();
        buildTicks();
        buildChips();
        wire();
        renderYou();
        refresh();
        setStatus("lobbyStatus", "Connecting...", false);
        MPNet.init().then(function () { setStatus("lobbyStatus", "", false); })
            .catch(function (err) { setStatus("lobbyStatus", err.message, true); });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
})();
