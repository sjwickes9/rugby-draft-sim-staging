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
            desc: "No more than this many players from any single nation. Adjustable.",
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
        size: 4,           // human drafters, 1 to 8
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

    // ── Drafters ────────────────────────────────────────────
    function renderPlayers() {
        if (state.size < 1) state.size = 1;
        if (state.size > 8) state.size = 8;
        $("sizeNum").textContent = state.size;
        $("sizeDown").disabled = state.size <= 1;
        $("sizeUp").disabled = state.size >= 8;
        const fmt = FORMATS[state.size] || "Solo draft, no competition yet";
        $("formatLine").innerHTML = fmt
            + "<br><span class='split'>" + state.size + " user" + (state.size === 1 ? "" : "s") + "</span>";
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
        $("themeToggle").addEventListener("click", toggleTheme);
        $("name").addEventListener("input", renderYou);
        $("kit1").addEventListener("input", renderYou);
        $("kit2").addEventListener("input", renderYou);

        $("modeCareer").addEventListener("click", function () { state.mode = "career"; refresh(); });
        $("modeTournament").addEventListener("click", function () { state.mode = "tournament"; refresh(); });

        $("sizeDown").addEventListener("click", function () { step("size", -1); });
        $("sizeUp").addEventListener("click", function () { step("size", 1); });

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
        $("ruleList").addEventListener("click", function (e) {
            const b = e.target.closest("button[data-cap]"); if (!b) return;
            const f = filters();
            const ctx = MPRules.buildContext(f, MPEngine.feasibility(allSquads, f, positionFamilyMap));
            state.countryCap = currentCountryCap(ctx) + (+b.getAttribute("data-cap"));
            refresh();
        });
        $("ruleList").addEventListener("change", function (e) {
            const cb = e.target.closest("input[data-rule]"); if (!cb) return;
            state.rules[cb.getAttribute("data-rule")] = cb.checked; refresh();
        });

        $("create").addEventListener("click", onCreate);
        $("joinBtn").addEventListener("click", onJoin);
        $("leave").addEventListener("click", onLeave);
        $("closeRoom").addEventListener("click", onCloseRoom);
    }

    // Rules as stored on the room, including the resolved nation cap.
    function rulesForCreate() {
        const f = filters();
        const ctx = MPRules.buildContext(f, MPEngine.feasibility(allSquads, f, positionFamilyMap));
        const out = {
            maxPerTournament: !!state.rules.maxPerTournament,
            maxPerCountry: !!state.rules.maxPerCountry,
            onePerTournament: !!state.rules.onePerTournament
        };
        if (out.maxPerCountry) out.countryCap = currentCountryCap(ctx);
        return out;
    }

    function onCreate() {
        setStatus("lobbyStatus", "Creating room and snapshotting the pool...", false);
        $("create").disabled = true;
        MPNet.createRoom(filters(), profile(), rulesForCreate(), { tableSize: state.size, aiCount: 0 })
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
        if (!currentCode) { backToLobby("") ; return; }
        const code = currentCode;
        // Stop watching first, so the room disappearing underneath us
        // cannot repaint the room view while we are leaving it.
        if (unwatch) { unwatch(); unwatch = null; }
        currentCode = null;
        setStatus("roomStatus", "Leaving...", false);
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
        if (!window.confirm("Close this room for everyone? This cannot be undone.")) return;
        const code = currentCode;
        if (unwatch) { unwatch(); unwatch = null; }
        currentCode = null;
        MPNet.closeRoom(code)
            .then(function () { backToLobby("Room closed."); })
            .catch(function (err) { backToLobby("Could not close the room: " + err.message); });
    }

    function backToLobby(msg) {
        if (unwatch) { unwatch(); unwatch = null; }
        currentCode = null;
        $("roomView").classList.add("hidden");
        $("lobbyView").classList.remove("hidden");
        setStatus("roomStatus", "", false);
        setStatus("lobbyStatus", msg || "", false);
        $("create").disabled = false;
        refresh();
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
        if (!room) {
            // The host closed the room while we were in it. Do not strand
            // the user on an empty screen; return them to the lobby.
            $("members").innerHTML = "";
            backToLobby("That room was closed by the host.");
            return;
        }
        const s = room.settings || {};
        const yrs = (s.mode === "tournament" && s.yearMin)
            ? (s.yearMin === s.yearMax ? s.yearMin : s.yearMin + " to " + s.yearMax) : "all years";
        const modeTxt = s.mode === "career" ? "Career peak" : "Tournament";
        const seats = s.tableSize ? (Object.keys(room.members || {}).length + "/" + s.tableSize + " seats | ") : "";
        $("roomStrapText").textContent = seats + modeTxt + " | " + (s.geoLabel || "All nations")
            + (s.mode === "career" ? "" : " | " + yrs) + " | " + (room.pool ? room.pool.length : 0) + " players";

        const members = room.members || {};
        const hostUid = room.meta ? room.meta.hostUid : null;
        // Only the host can close a room.
        $("closeRoom").classList.toggle("hidden", hostUid !== MPNet.currentUid());
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
