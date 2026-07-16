// ============================================================
// RUGBY XV DRAFT: MULTIPLAYER LOBBY LOGIC
// UK English. No em dashes or en dashes.
// ============================================================

(function () {
    const $ = function (id) { return document.getElementById(id); };
    const YEARS = MPEngine.ALL_YEARS;
    const GEO = MPEngine.GEO_GROUPS;

    // Competition format per table size (spec section 12).
    const FORMATS = {
        2: "Test series, best of three",
        3: "Tri Nations, home and away",
        4: "Pool of four, then a final",
        5: "Five Nations round robin",
        6: "Six Nations round robin",
        7: "Seven Nations round robin",
        8: "Two pools of four, then playoffs"
    };

    // Friendly rule copy (the engine ids are terse).
    const RULE_TEXT = {
        maxPerTournament: {
            label: "Max players per World Cup",
            desc: "No more than this many players from any single World Cup.",
            value: function (v) { return "Max " + v + " players"; }
        },
        maxPerCountry: {
            label: "Max players per nation",
            desc: "No more than this many players from any single nation.",
            value: function (v) { return "Max " + v + " players"; }
        },
        onePerTournament: {
            label: "One from every World Cup",
            desc: "Your XV must include at least one player from each World Cup in the window.",
            value: function () { return "At least 1 each"; }
        }
    };

    const state = {
        mode: "career",
        yMin: 0,
        yMax: YEARS.length - 1,
        geo: null,
        size: 4,      // table size (drafters)
        ai: 0,        // AI drafters
        rules: { maxPerTournament: false, maxPerCountry: false, onePerTournament: false }
    };

    let currentCode = null;
    let unwatch = null;

    // ── Theme ───────────────────────────────────────────────
    function applyTheme(theme) {
        if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
        else document.documentElement.removeAttribute("data-theme");
        $("themeToggle").textContent = (theme === "light") ? "Night" : "Day";
        try { localStorage.setItem("mp-theme", theme); } catch (e) {}
    }
    function initTheme() {
        let t = "night";
        try { t = localStorage.getItem("mp-theme") || "night"; } catch (e) {}
        applyTheme(t);
    }
    function toggleTheme() {
        const isLight = document.documentElement.getAttribute("data-theme") === "light";
        applyTheme(isLight ? "night" : "light");
    }

    // ── Filters ─────────────────────────────────────────────
    function filters() {
        const f = { mode: state.mode, geoLabel: state.geo || "All nations" };
        if (state.geo) f.countries = GEO[state.geo];
        if (state.mode === "tournament") { f.yearMin = YEARS[state.yMin]; f.yearMax = YEARS[state.yMax]; }
        return f;
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

    // ── Mode ────────────────────────────────────────────────
    function renderMode() {
        const career = state.mode === "career";
        $("modeCareer").setAttribute("aria-pressed", String(career));
        $("modeTournament").setAttribute("aria-pressed", String(!career));
        $("yearsBlock").classList.toggle("hidden", career);
    }

    // ── Players ─────────────────────────────────────────────
    function renderPlayers() {
        if (state.size < 2) state.size = 2;
        if (state.size > 8) state.size = 8;
        if (state.ai > state.size - 1) state.ai = state.size - 1;  // at least one human (you)
        if (state.ai < 0) state.ai = 0;
        $("sizeNum").textContent = state.size;
        $("aiNum").textContent = state.ai;
        $("sizeDown").disabled = state.size <= 2;
        $("sizeUp").disabled = state.size >= 8;
        $("aiDown").disabled = state.ai <= 0;
        $("aiUp").disabled = state.ai >= state.size - 1;
        const humans = state.size - state.ai;
        const aiNote = state.ai > 0 ? " (AI drafters arrive in a later build)" : "";
        $("formatLine").innerHTML = FORMATS[state.size]
            + "<br><span class='split'>" + humans + " human" + (humans === 1 ? "" : "s")
            + (state.ai ? " and " + state.ai + " AI" : "") + aiNote + "</span>";
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
            const valTxt = (r.available && r.value != null) ? t.value(r.value) : "";
            let why = "";
            if (!r.available) why = "<span class='why'>" + r.unavailableReason + "</span>";
            else if (r.warn) why = "<span class='why'>" + r.warnText + "</span>";
            else why = "<span class='why'>" + t.desc + "</span>";
            return "<div class='" + cls + "'>"
                + "<div><span class='label'>" + t.label + "</span>" + why + "</div>"
                + "<div style='display:flex;align-items:center;gap:12px'>"
                + (valTxt ? "<span class='value'>" + valTxt + "</span>" : "")
                + "<label class='sw'><input type='checkbox' data-rule='" + r.id + "'"
                + (r.enabled ? " checked" : "") + (r.available ? "" : " disabled") + ">"
                + "<span class='knob'></span></label>"
                + "</div></div>";
        }).join("");
    }

    // ── Refresh (readout + gate) ────────────────────────────
    function refresh() {
        renderMode();
        renderPlayers();
        renderYears();
        renderChips();
        const f = filters();
        const analysis = MPEngine.feasibility(allSquads, f, positionFamilyMap);
        renderRules(analysis);

        const strap = $("strap");
        const startable = analysis.viable && analysis.meetsNationFloor
            && analysis.supportedPlayers >= state.size;
        strap.classList.remove("ready", "blocked");
        strap.classList.add(startable ? "ready" : "blocked");
        strap.innerHTML =
            (startable ? "<span class='live-dot'></span>" : "")
            + "<span class='status-pill'><span class='glyph'>" + (startable ? "\u2713" : "\u26A0") + "</span>"
            + (startable ? "Ready" : "Fix pool") + "</span>"
            + "<span>" + MPEngine.readoutText(analysis, f) + "</span>";
        $("create").disabled = !startable;
    }

    // ── Events ──────────────────────────────────────────────
    function step(field, delta) { state[field] += delta; refresh(); }

    function wire() {
        $("themeToggle").addEventListener("click", toggleTheme);
        $("name").addEventListener("input", renderYou);
        $("kit1").addEventListener("input", renderYou);
        $("kit2").addEventListener("input", renderYou);

        $("modeCareer").addEventListener("click", function () { state.mode = "career"; refresh(); });
        $("modeTournament").addEventListener("click", function () { state.mode = "tournament"; refresh(); });

        $("sizeDown").addEventListener("click", function () { step("size", -1); });
        $("sizeUp").addEventListener("click", function () { step("size", 1); });
        $("aiDown").addEventListener("click", function () { step("ai", -1); });
        $("aiUp").addEventListener("click", function () { step("ai", 1); });

        $("yMin").addEventListener("input", function (e) {
            let v = +e.target.value; if (v > state.yMax) state.yMax = v; state.yMin = v; refresh();
        });
        $("yMax").addEventListener("input", function (e) {
            let v = +e.target.value; if (v < state.yMin) state.yMin = v; state.yMax = v; refresh();
        });

        $("geoChips").addEventListener("click", function (e) {
            const btn = e.target.closest(".chip"); if (!btn) return;
            state.geo = btn.getAttribute("data-geo") || null; refresh();
        });
        $("ruleList").addEventListener("change", function (e) {
            const cb = e.target.closest("input[data-rule]"); if (!cb) return;
            state.rules[cb.getAttribute("data-rule")] = cb.checked; refresh();
        });

        $("create").addEventListener("click", onCreate);
        $("joinBtn").addEventListener("click", onJoin);
        $("leave").addEventListener("click", onLeave);
    }

    function onCreate() {
        setStatus("lobbyStatus", "Creating room and snapshotting the pool...", false);
        $("create").disabled = true;
        MPNet.createRoom(filters(), profile(), state.rules, { tableSize: state.size, aiCount: state.ai })
            .then(enterRoom)
            .catch(function (err) { setStatus("lobbyStatus", err.message, true); $("create").disabled = false; });
    }
    function onJoin() {
        const code = $("join").value.toUpperCase().trim();
        if (code.length !== 4) { setStatus("lobbyStatus", "A room code is four characters.", true); return; }
        setStatus("lobbyStatus", "Joining " + code + "...", false);
        MPNet.joinRoom(code, profile()).then(enterRoom)
            .catch(function (err) { setStatus("lobbyStatus", err.message, true); });
    }
    function onLeave() {
        if (!currentCode) return;
        MPNet.leaveRoom(currentCode).then(function () {
            if (unwatch) { unwatch(); unwatch = null; }
            currentCode = null;
            $("roomView").classList.add("hidden");
            $("lobbyView").classList.remove("hidden");
            setStatus("lobbyStatus", "Left the room.", false);
        });
    }

    // ── Room view ───────────────────────────────────────────
    function enterRoom(code) {
        currentCode = code;
        $("lobbyView").classList.add("hidden");
        $("roomView").classList.remove("hidden");
        $("roomCode").innerHTML = code + "<small>share this code</small>";
        if (unwatch) unwatch();
        unwatch = MPNet.watchRoom(code, renderRoom);
    }
    function renderRoom(room) {
        if (!room) { setStatus("roomStatus", "This room has closed.", true); $("members").innerHTML = ""; return; }
        const s = room.settings || {};
        const yrs = (s.mode === "tournament" && s.yearMin)
            ? (s.yearMin === s.yearMax ? s.yearMin : s.yearMin + " to " + s.yearMax) : "all years";
        const modeTxt = s.mode === "career" ? "Career peak" : "Tournament";
        const seats = s.tableSize ? (Object.keys(room.members || {}).length + "/" + s.tableSize + " seats | ") : "";
        $("roomStrapText").textContent = seats + modeTxt + " | " + (s.geoLabel || "All nations")
            + (s.mode === "career" ? "" : " | " + yrs) + " | " + (room.pool ? room.pool.length : 0) + " players";

        const members = room.members || {};
        const hostUid = room.meta ? room.meta.hostUid : null;
        $("members").innerHTML = Object.keys(members).map(function (k) {
            const m = members[k];
            const you = (k === MPNet.currentUid());
            return "<li style='--mk1:" + (m.kit || "#6E8CA6") + ";--mk2:" + (m.kit2 || "transparent") + "'>"
                + "<span class='dot " + (m.connected ? "on" : "") + "'></span>"
                + "<span class='mname'>" + esc(m.name || "Player") + (you ? " (you)" : "") + "</span>"
                + (k === hostUid ? "<span class='htag'>Host</span>" : "")
                + "</li>";
        }).join("");
    }

    // ── Helpers ─────────────────────────────────────────────
    function setStatus(id, msg, isErr) { const el = $(id); el.textContent = msg; el.classList.toggle("err", !!isErr); }
    function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

    // ── Boot ────────────────────────────────────────────────
    function boot() {
        initTheme();
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
