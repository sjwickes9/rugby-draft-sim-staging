// ============================================================
// RUGBY XV DRAFT: MULTIPLAYER LOBBY LOGIC
// Wires the pool filters into MPEngine (feasibility readout and
// start gate), the rule toggles into MPRules, and Create / Join
// into MPNet. UK English. No em dashes or en dashes.
// ============================================================

(function () {
    const $ = function (id) { return document.getElementById(id); };
    const YEARS = MPEngine.ALL_YEARS;
    const GEO = MPEngine.GEO_GROUPS;

    // ── Lobby state ─────────────────────────────────────────
    const state = {
        mode: "career",              // "career" | "tournament"
        yMin: 0,                     // index into YEARS
        yMax: YEARS.length - 1,
        geo: null,                   // group name, or null for all nations
        rules: { maxPerTournament: false, maxPerCountry: false, onePerTournament: false }
    };

    let currentCode = null;
    let unwatch = null;

    // ── Filters derived from state ──────────────────────────
    function filters() {
        const f = { mode: state.mode, geoLabel: state.geo || "All nations" };
        if (state.geo) f.countries = GEO[state.geo];
        if (state.mode === "tournament") {
            f.yearMin = YEARS[state.yMin];
            f.yearMax = YEARS[state.yMax];
        }
        return f;
    }

    // ── Render: You flash ───────────────────────────────────
    function renderYou() {
        const name = $("name").value.trim() || "Your name";
        $("youName").textContent = name;
        $("youFlash").style.setProperty("--kit", $("kit").value);
    }

    // ── Render: mode ────────────────────────────────────────
    function renderMode() {
        const career = state.mode === "career";
        $("modeCareer").setAttribute("aria-pressed", String(career));
        $("modeTournament").setAttribute("aria-pressed", String(!career));
        // The year window only means something in tournament mode.
        $("yearsBlock").classList.toggle("hidden", career);
    }

    // ── Render: year slider ─────────────────────────────────
    function tickPos(k) {
        // Matches the CSS thumb geometry: 18px thumb, 9px inset each side.
        return "calc(9px + (" + (k / (YEARS.length - 1)) + ") * (100% - 18px))";
    }
    function buildTicks() {
        $("yearTicks").innerHTML = YEARS.map(function (y, i) {
            return "<span data-i='" + i + "' style='left:" + tickPos(i) + "'>" + y + "</span>";
        }).join("");
    }
    function renderYears() {
        $("yMin").value = state.yMin;
        $("yMax").value = state.yMax;
        const left = tickPos(state.yMin);
        const right = tickPos(state.yMax);
        const fill = $("yearFill");
        fill.style.left = left;
        fill.style.width = "calc(" + right + " - " + left + ")";
        // highlight in-range year labels
        Array.prototype.forEach.call($("yearTicks").children, function (el) {
            const i = +el.getAttribute("data-i");
            el.classList.toggle("in", i >= state.yMin && i <= state.yMax);
        });
    }

    // ── Render: geography chips ─────────────────────────────
    function buildChips() {
        const names = ["All nations"].concat(Object.keys(GEO));
        $("geoChips").innerHTML = names.map(function (n) {
            const val = (n === "All nations") ? "" : n;
            const on = (state.geo || "") === val;
            return "<button class='chip' data-geo='" + val + "' aria-pressed='" + on + "'>" + n + "</button>";
        }).join("");
    }
    function renderChips() {
        Array.prototype.forEach.call($("geoChips").children, function (el) {
            el.setAttribute("aria-pressed", String((state.geo || "") === el.getAttribute("data-geo")));
        });
    }

    // ── Render: rule toggles (driven by MPRules) ────────────
    function renderRules(analysis) {
        const ctx = MPRules.buildContext(filters(), analysis);
        const rows = MPRules.evaluateRules(ctx, state.rules);
        $("ruleList").innerHTML = rows.map(function (r) {
            const cls = "rule" + (r.available ? (r.enabled ? "" : " off") : " unavailable");
            const valTxt = r.available && r.value != null
                ? (r.id === "maxPerCountry" ? "Max " + r.value + " per nation"
                   : r.id === "maxPerTournament" ? "Max " + r.value + " per tournament"
                   : "Covers " + r.value + " tournaments")
                : "";
            const why = r.available
                ? (r.warn ? "<span class='why'>" + r.warnText + "</span>" : "")
                : "<span class='why'>" + r.unavailableReason + "</span>";
            return "<div class='" + cls + "'>"
                + "<div><span class='label'>" + r.label + "</span>" + why + "</div>"
                + "<div style='display:flex;align-items:center;gap:12px'>"
                + (valTxt ? "<span class='value'>" + valTxt + "</span>" : "")
                + "<label class='sw'><input type='checkbox' data-rule='" + r.id + "'"
                + (r.enabled ? " checked" : "") + (r.available ? "" : " disabled") + ">"
                + "<span class='knob'></span></label>"
                + "</div></div>";
        }).join("");
    }

    // ── Render: feasibility strap and Create gate ───────────
    function refresh() {
        renderMode();
        renderYears();
        renderChips();
        const f = filters();
        const analysis = MPEngine.feasibility(allSquads, f, positionFamilyMap);
        renderRules(analysis);

        const strap = $("strap");
        strap.classList.remove("ready", "blocked");
        // At create time the room is not yet sized, so the gate here is the
        // nation floor plus basic viability. Room-size is checked at draft start.
        const startable = analysis.viable && analysis.meetsNationFloor;
        $("strapText").textContent = MPEngine.readoutText(analysis, f);
        if (startable) {
            strap.classList.add("ready");
            strap.querySelector(".live-dot") || strap.insertAdjacentHTML("afterbegin", "<span class='live-dot'></span>");
            ensureBadge(strap, "Ready");
        } else {
            strap.classList.add("blocked");
            const dot = strap.querySelector(".live-dot"); if (dot) dot.remove();
            ensureBadge(strap, "Fix pool");
        }
        $("create").disabled = !startable;
    }

    function ensureBadge(strap, text) {
        let b = strap.querySelector(".badge");
        if (!b) { b = document.createElement("span"); b.className = "badge"; strap.appendChild(b); }
        b.textContent = text;
    }

    // ── Events ──────────────────────────────────────────────
    function wire() {
        $("name").addEventListener("input", renderYou);
        $("kit").addEventListener("input", renderYou);

        $("modeCareer").addEventListener("click", function () { state.mode = "career"; refresh(); });
        $("modeTournament").addEventListener("click", function () { state.mode = "tournament"; refresh(); });

        // Dual-handle year slider: clamp by pushing the other handle (spec 5.1).
        $("yMin").addEventListener("input", function (e) {
            let v = +e.target.value;
            if (v > state.yMax) state.yMax = v;
            state.yMin = v;
            refresh();
        });
        $("yMax").addEventListener("input", function (e) {
            let v = +e.target.value;
            if (v < state.yMin) state.yMin = v;
            state.yMax = v;
            refresh();
        });

        $("geoChips").addEventListener("click", function (e) {
            const btn = e.target.closest(".chip");
            if (!btn) return;
            const val = btn.getAttribute("data-geo");
            state.geo = val || null;
            refresh();
        });

        $("ruleList").addEventListener("change", function (e) {
            const cb = e.target.closest("input[data-rule]");
            if (!cb) return;
            state.rules[cb.getAttribute("data-rule")] = cb.checked;
            refresh();
        });

        $("create").addEventListener("click", onCreate);
        $("joinBtn").addEventListener("click", onJoin);
        $("leave").addEventListener("click", onLeave);
    }

    function profile() {
        return { name: ($("name").value || "Player").trim() || "Player", kit: $("kit").value };
    }

    function onCreate() {
        setStatus("lobbyStatus", "Creating room and snapshotting the pool...", false);
        $("create").disabled = true;
        MPNet.createRoom(filters(), profile(), state.rules)
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
            ? (s.yearMin === s.yearMax ? s.yearMin : s.yearMin + " to " + s.yearMax)
            : "all years";
        const modeTxt = s.mode === "career" ? "Career peak" : "Tournament";
        $("roomStrapText").textContent = modeTxt + " | " + (s.geoLabel || "All nations")
            + " | " + (s.mode === "career" ? "" : yrs + " | ")
            + (room.pool ? room.pool.length : 0) + " players";

        const members = room.members || {};
        const hostUid = room.meta ? room.meta.hostUid : null;
        $("members").innerHTML = Object.keys(members).map(function (k) {
            const m = members[k];
            const you = (k === MPNet.currentUid());
            return "<li style='--mkit:" + (m.kit || "#6E8CA6") + "'>"
                + "<span class='dot " + (m.connected ? "on" : "") + "'></span>"
                + "<span class='mname'>" + esc(m.name || "Player") + (you ? " (you)" : "") + "</span>"
                + (k === hostUid ? "<span class='htag'>Host</span>" : "")
                + "</li>";
        }).join("");
    }

    // ── Helpers ─────────────────────────────────────────────
    function setStatus(id, msg, isErr) {
        const el = $(id); el.textContent = msg;
        el.classList.toggle("err", !!isErr);
    }
    function esc(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    }

    // ── Boot ────────────────────────────────────────────────
    function boot() {
        buildTicks();
        buildChips();
        wire();
        renderYou();
        refresh();
        setStatus("lobbyStatus", "Connecting...", false);
        MPNet.init()
            .then(function () { setStatus("lobbyStatus", "", false); })
            .catch(function (err) { setStatus("lobbyStatus", err.message, true); });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
})();
