// ============================================================
// RUGBY XV DRAFT: MULTIPLAYER LOBBY LOGIC
// UK English. No em dashes or en dashes.
// ============================================================

(function () {
    const $ = function (id) { return document.getElementById(id); };
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
        size: 4,           // human users, 1 to 8
        season: 3,         // competitions in the season, 1 to 15
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

    // ── Create or join ──────────────────────────────────────
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

        $("pathCreate").addEventListener("click", function () { state.path = "create"; refresh(); });
        $("pathJoin").addEventListener("click", function () { state.path = "join"; refresh(); });
        $("modeCareer").addEventListener("click", function () { state.mode = "career"; refresh(); });
        $("modeTournament").addEventListener("click", function () { state.mode = "tournament"; refresh(); });

        $("sizeDown").addEventListener("click", function () { step("size", -1); });
        $("sizeUp").addEventListener("click", function () { step("size", 1); });
        $("seasonDown").addEventListener("click", function () { step("season", -1); });
        $("seasonUp").addEventListener("click", function () { step("season", 1); });

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
        $("startDraft").addEventListener("click", onStartDraft);
        $("backToRoom").addEventListener("click", function () {
            $("draftView").classList.add("hidden");
            $("roomView").classList.remove("hidden");
        });
        $("resumeDraft").addEventListener("click", showDraft);
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
        MPNet.createRoom(filters(), profile(), rulesForCreate(), { tableSize: state.size, aiCount: 0, seasonLength: state.season })
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
        if (!window.confirm("Close this room for everyone? This cannot be undone.")) return;
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
                setStatus("startHint", err.message, true);
                $("startDraft").disabled = false;
            });
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
    let latestRoom = null;
    let seenDrafting = false;
    function renderRoom(room) {
        latestRoom = room;
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

        if (status === "drafting") {
            ensureDraftInit(room);
            MPDraftUI.applyRoom(room);
            $("resumeDraft").classList.remove("hidden");
            $("startDraft").classList.add("hidden");
            setStatus("startHint", "", false);
            if (!seenDrafting) { seenDrafting = true; showDraft(); }
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
        if (draftReady) return;
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
            live: true,
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

    function showDraft() {
        $("roomView").classList.add("hidden");
        $("lobbyView").classList.add("hidden");
        $("draftView").classList.remove("hidden");
        setStatus("draftStatus", "", false);
    }

    // ── Helpers ─────    // ── Helpers ─────────────────────────────────────────────
    function setStatus(id, msg, isErr) { const el = $(id); el.textContent = msg; el.classList.toggle("err", !!isErr); }
    function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

    // ── Boot ────────────────────────────────────────────────
    function randomKit() {
        const k = KITS[Math.floor(Math.random() * KITS.length)];
        $("kit1").value = k.a;
        $("kit2").value = k.b;
    }

    function boot() {
        initTheme();
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
