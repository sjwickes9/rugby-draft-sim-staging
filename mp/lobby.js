// ============================================================
// RUGBY XV DRAFT: MULTIPLAYER LOBBY LOGIC
// UK English. No em dashes or en dashes.
// ============================================================

(function () {
    // Bumped on every change. Format v1.YYMMDDHHMM in GMT.
    const VERSION = "v1.2607191300";

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
        size: 2,           // human users, 1 to 8
        season: 3,         // competitions in the season, 1 to 15
        turnMs: 86400000,  // time allowed per pick, 0 means no limit
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
    function renderTurnLimit() {
        const sel = $("turnLimit");
        if (sel) sel.value = String(state.turnMs);
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
        $("turnLimit").addEventListener("change", function (e) {
            state.turnMs = parseInt(e.target.value, 10) || 0;
            refresh();
        });

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
        $("noticeClose").addEventListener("click", function () { showNotice(""); });
        $("startDraft").addEventListener("click", onStartDraft);
        $("backToRoom").addEventListener("click", function () { showOnly("roomView"); });
        $("resumeDraft").addEventListener("click", showDraft);
        $("spSlow").addEventListener("click", function () { setSpeed(1.8); });
        $("spMed").addEventListener("click", function () { setSpeed(1); });
        $("spFast").addEventListener("click", function () { setSpeed(0.4); });
        $("playBtn").addEventListener("click", function () {
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
        $("setupConfirm").addEventListener("click", confirmSetup);
        $("setupBack").addEventListener("click", function () {
            restoreOptions();
            setupShown = false;
            showOnly("roomView");
        });
        $("nextComp").addEventListener("click", function () {
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
        $("compBack").addEventListener("click", function () { showOnly("roomView"); });
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
        MPNet.createRoom(filters(), profile(), rulesForCreate(), { tableSize: state.size, aiCount: 0, seasonLength: state.season, turnMs: state.turnMs })
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
        modal({
            title: "Close this room?",
            body: "This ends the room for everyone in it. It cannot be undone.",
            ok: "Close room", cancel: "Keep playing"
        }).then(function (yes) { if (yes) doCloseRoom(); });
    }

    function doCloseRoom() {
        if (!currentCode) return;
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
        unwatch = MPNet.watchRoom(code, renderRoom);
    }
    let latestRoom = null;
    let seenDrafting = false;
    let compShown = false;
    let viewCompNo = 1;
    let setupShown = false;
    let simSpeed = 1;          // 1.8 slow, 1 medium, 0.4 fast, as in app.js
    let playingBack = false;
    let revealed = {};         // fixture index -> true, during playback
    let liveFixtures = null;   // resolved fixtures while playing back
    function renderRoom(room) {
        latestRoom = room;

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
            const pb = $("playBtn");
            if (pb) pb.disabled = false;
            const nc = $("nextComp");
            if (nc) nc.disabled = false;
            if (window.MPCommit && MPCommit.reset) MPCommit.reset();
            if (window.MPDraftUI && MPDraftUI.stopAuto) MPDraftUI.stopAuto();
            $("draftView").classList.add("hidden");
            $("commitView").classList.add("hidden");
            $("compView").classList.add("hidden");
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
        if (status === "lobby" && compNo > 1) {
            const amHost = (room.meta || {}).hostUid === MPNet.currentUid();
            if (amHost) {
                if (!setupShown) { setupShown = true; showSetup(room); }
            } else {
                showOnly("roomView");
                setStatus("startHint", "The host is setting up competition "
                    + compNo + " of " + ((room.settings || {}).seasonLength || 1) + ".", false);
            }
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
            competition: (room.settings || {}).competition || 1,
            turnMs: (room.settings || {}).turnMs || 0,
            onExpire: function (slotId, poolIndex, forUid, done) {
                const d = latestRoom && latestRoom.draft;
                if (!d) { done(); return; }
                MPNet.makePick(currentCode, slotId, poolIndex, d.order, d.pickIndex, forUid)
                    .then(function () { done(); })
                    .catch(function () { done(); });
            },
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

    const ALL_VIEWS = ["lobbyView", "roomView", "setupView", "draftView", "commitView", "compView"];
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

        return playBack(results, resolved).then(function () {
            return MPNet.finishCompetition(currentCode, {
                fixtures: resolved, results: results, standings: standings,
                winner: winner, illegal: illegal, breaches: breachInfo
            }, tally);
        });
    }

    // ── Setup between competitions ──────────────────────────
    // The host re-chooses the pool and rules before each new draft. Rather
    // than duplicating the controls, the whole options block is moved into
    // the setup view and moved back afterwards, so there is one set of
    // controls and one set of handlers.
    function showSetup(room) {
        const block = $("optionsBlock");
        const host = $("setupHost");
        if (block && host && block.parentNode !== host) host.appendChild(block);
        // Seats and season length are fixed for the life of the room.
        $("seatsBlock").classList.add("hidden");

        const st = room.settings || {};
        $("setupSub").textContent = "competition " + (st.competition || 2)
            + " of " + (st.seasonLength || 1);

        // Load the room's current settings into the controls.
        state.mode = st.mode === "career" ? "career" : "tournament";
        if (st.yearMin) state.yMin = Math.max(0, YEARS.indexOf(st.yearMin));
        if (st.yearMax) state.yMax = Math.max(0, YEARS.indexOf(st.yearMax));
        // The chips store "" for All nations, not the label.
        state.geo = (st.geoLabel && GEO[st.geoLabel]) ? st.geoLabel : "";
        state.rules = Object.assign({}, st.rules || {});
        if (st.turnMs === 0 || st.turnMs) state.turnMs = st.turnMs;
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
            turnMs: state.turnMs
        };
        MPNet.updateSettings(currentCode, patch)
            .then(function () { return MPNet.startDraft(currentCode); })
            .then(function () {
                restoreOptions();
                setStatus("setupStatus", "", false);
                $("setupConfirm").disabled = false;
                setupShown = false;
                // The room watcher will route to the draft, but move now so
                // the setup screen cannot sit on top of a live draft.
                showOnly("draftView");
            })
            .catch(function (err) {
                setStatus("setupStatus", err.message, true);
                $("setupConfirm").disabled = false;
            });
    }

    // ── Room brief ──────────────────────────────────────────
    // A joiner needs the whole setup before the draft starts: the pool,
    // the constraints and the format. Anything that will limit their picks
    // belongs here, not discovered mid-draft.
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
        const turnTxt = !turn ? "No limit"
            : turn >= 86400000 ? (turn / 86400000) + " day" + (turn === 86400000 ? "" : "s")
            : turn >= 3600000 ? (turn / 3600000) + " hour" + (turn === 3600000 ? "" : "s")
            : (turn / 60000) + " minutes";
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

        const results = {};
        const source = liveResults || comp.results || [];
        source.forEach(function (r) {
            if (!liveRevealed || liveRevealed[r.i]) results[r.i] = r;
        });
        const played = (comp.results || []).length > 0 || playingBack;

        // Host can play the fixtures once, and only once.
        const isHost = (room.meta || {}).hostUid === me;
        $("playBtn").classList.toggle("hidden", played || !isHost);
        if (!played) $("playBtn").disabled = false;
        $("speedRow").classList.toggle("hidden", played || !isHost);
        $("compStatus").textContent = playingBack
            ? "Playing..."
            : (played ? "" : (isHost ? "" : "Waiting for "
                + (((room.members || {})[(room.meta || {}).hostUid] || {}).name || "the host")
                + " to play the fixtures."));

        renderSeason(room, comp);
        if (playingBack) {
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
        const members = room.members || {};
        const me = MPNet.currentUid();
        const nameOf = function (u) { return (members[u] || {}).name || "User"; };
        const now = st.competition || 1;
        const total = st.seasonLength || 1;
        const played = (comp.results || []).length > 0 && !playingBack;

        const wb = $("winnerBox");
        const tw = $("tallyWrap");
        const nb = $("nextComp");

        if (!played) {
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

        // Next competition, host only.
        const isHost = (room.meta || {}).hostUid === me;
        if (seasonOver) {
            nb.classList.add("hidden");
            $("nextHint").textContent = "The season is complete. The host can close the room or start a new one.";
        } else if (isHost) {
            nb.classList.remove("hidden");
            nb.disabled = false;
            $("nextHint").textContent = "The next draft picks in reverse order, so the bottom of the tally picks first.";
        } else {
            nb.classList.add("hidden");
            $("nextHint").textContent = "Waiting for "
                + (((room.members || {})[(room.meta || {}).hostUid] || {}).name || "the host")
                + " to set up competition " + (now + 1) + " of " + total + ".";
        }
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
