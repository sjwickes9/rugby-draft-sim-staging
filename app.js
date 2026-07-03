// ============================================================
// RUGBY HYBRID XV DRAFT — APP LOGIC
// ============================================================

// ============================================================
// OUT-OF-POSITION PENALTY SYSTEM
// ============================================================
// Returns penalty points for placing a player at a pitch node.
// Returns null if placement is FORBIDDEN (front-row safety law).

const POS_GROUP = {
    "Loosehead Prop":   "front-row", "Tighthead Prop": "front-row", "Hooker": "front-row",
    "Lock":             "lock",
    "Blindside Flanker":"back-row",  "Openside Flanker":"back-row", "Number 8":"back-row",
    "Scrum-half":       "half-back", "Fly-half":       "half-back",
    "Inside Centre":    "centre",    "Outside Centre": "centre",
    "Left Wing":        "wing",      "Right Wing":     "wing",
    "Fullback":         "fullback",
};

const NODE_GROUP = {
    "Loosehead Prop":   "front-row", "Hooker":"front-row", "Tighthead Prop":"front-row",
    "Lock 4":           "lock",      "Lock 5":"lock",
    "Blindside Flanker":"back-row",  "Openside Flanker":"back-row", "Number 8":"back-row",
    "Scrum-half":       "half-back", "Fly-half":"half-back",
    "Inside Centre":    "centre",    "Outside Centre":"centre",
    "Left Wing":        "wing",      "Right Wing":"wing",
    "Fullback":         "fullback",
};

function playerGroups(player) {
    return [...new Set(player.positions.map(p => POS_GROUP[p]).filter(Boolean))];
}

function isForbidden(player, nodePos) {
    // Front-row safety law: only players with a front-row position listed can play there
    if (NODE_GROUP[nodePos] === "front-row" && !playerGroups(player).includes("front-row")) return true;
    return false;
}

function oopPenalty(player, nodePos) {
    const ng = NODE_GROUP[nodePos];
    const pg = playerGroups(player);

    // No penalty if the exact node position is in player's positions list
    if (player.positions.includes(nodePos)) return 0;

    // Half-backs: Scrum-half and Fly-half share the same "half-back" group,
    // but playing the OTHER half-back slot without it being a listed
    // position is still out of position — a flat 3pt penalty applies even
    // though both positions are in the same family.
    if (ng === "half-back" && pg.includes("half-back")) return 3;

    // Hooker and Prop (Loosehead/Tighthead) share the same "front-row"
    // group, but a pure hooker playing prop (or vice versa) without it
    // being a listed position is still out of position — a flat 3pt
    // penalty applies. Genuine prop↔prop swaps (Loosehead↔Tighthead)
    // remain unaffected, since neither side is "Hooker".
    if (ng === "front-row" && pg.includes("front-row")) {
        const wantsHooker = (nodePos === "Hooker");
        const playerHasHooker = player.positions.includes("Hooker");
        const playerHasProp = player.positions.some(p => p === "Loosehead Prop" || p === "Tighthead Prop");
        if (wantsHooker && playerHasProp && !playerHasHooker) return 3;
        if (!wantsHooker && playerHasHooker && !playerHasProp) return 3;
    }

    // No penalty if node group matches player's listed groups
    if (pg.includes(ng)) return 0;
    // (genuine prop↔prop swaps, e.g. Loosehead at Tighthead, are caught by
    // the line above and correctly return 0 — both are "front-row" group
    // and neither side is "Hooker")

    if (pg.includes("front-row")) {
        if (ng === "lock" || ng === "back-row") return 10;
        return 15;
    }
    if (pg.includes("lock")) {
        if (ng === "back-row") return 5;
        return 10;
    }
    if (pg.includes("back-row")) {
        if (ng === "lock") return 5;
        return 10;
    }
    if (pg.includes("half-back")) {
        if (ng === "front-row" || ng === "lock" || ng === "back-row") return 15;
        // (half-back↔half-back case is handled earlier, before the group shortcut)
        return 5;
    }
    if (pg.includes("centre")) {
        if (ng === "lock") return 15;
        if (ng === "back-row") return 10;
        if (ng === "half-back") return 7;
        if (ng === "fullback") return 5;
        if (ng === "wing") return 3;
        return 15;
    }
    if (pg.includes("wing")) {
        if (ng === "front-row" || ng === "lock" || ng === "back-row") return 15;
        if (ng === "half-back") return 10;
        if (ng === "centre") return 5;
        if (ng === "fullback") return 3;
        return 10;
    }
    if (pg.includes("fullback")) {
        if (ng === "front-row" || ng === "lock" || ng === "back-row") return 15;
        if (ng === "half-back" && nodePos === "Scrum-half") return 10;
        if (ng === "half-back") return 5;
        if (ng === "centre") return 5;
        if (ng === "wing") return 2;
        return 10;
    }
    return 10;
}

// Pitch node label -> position family
const pitchNodeFamily = {
    "Loosehead Prop":   "Props",
    "Hooker":           "Hookers",
    "Tighthead Prop":   "Props",
    "Lock 4":           "Locks",
    "Lock 5":           "Locks",
    "Blindside Flanker":"Back Row",
    "Openside Flanker": "Back Row",
    "Number 8":         "Back Row",
    "Scrum-half":       "Scrum Halves",
    "Fly-half":         "Fly Halves",
    "Left Wing":        "Back Three",
    "Inside Centre":    "Centres",
    "Outside Centre":   "Centres",
    "Right Wing":       "Back Three",
    "Fullback":         "Back Three"
};

// Exact position name -> family (for looking up player recognised positions)
const posFamily = {
    "Loosehead Prop":   "Props",
    "Tighthead Prop":   "Props",
    "Hooker":           "Hookers",
    "Lock":             "Locks",
    "Blindside Flanker":"Back Row",
    "Openside Flanker": "Back Row",
    "Number 8":         "Back Row",
    "Scrum-half":       "Scrum Halves",
    "Fly-half":         "Fly Halves",
    "Inside Centre":    "Centres",
    "Outside Centre":   "Centres",
    "Left Wing":        "Back Three",
    "Right Wing":       "Back Three",
    "Fullback":         "Back Three"
};

// Pitch nodes that count as "forwards" vs "backs" for average display
const forwardNodes = ["Loosehead Prop","Hooker","Tighthead Prop","Lock 4","Lock 5","Blindside Flanker","Openside Flanker","Number 8"];
const backNodes    = ["Scrum-half","Fly-half","Inside Centre","Outside Centre","Left Wing","Right Wing","Fullback"];

// Given a player and a pitch node position label, is placement in-position?
function isInPosition(player, nodePos) {
    return oopPenalty(player, nodePos) === 0;
}

// Get the display group for a player's PRIMARY position
function primaryGroup(player) {
    return POS_GROUP[player.positions[0]] || "wing";
}

// Shorten full position names to display labels in squad list
function shortenPos(pos) {
    const map = {
        "Loosehead Prop":   "Prop",
        "Tighthead Prop":   "Prop",
        "Hooker":           "Hooker",
        "Lock":             "Lock",
        "Blindside Flanker":"Flanker",
        "Openside Flanker": "Flanker",
        "Number 8":         "Number 8",
        "Scrum-half":       "Scrum-half",
        "Fly-half":         "Fly-half",
        "Inside Centre":    "Centre",
        "Outside Centre":   "Centre",
        "Left Wing":        "Wing",
        "Right Wing":       "Wing",
        "Fullback":         "Fullback",
    };
    return map[pos] || pos;
}


// All groups a player is recognised in (no penalty)
function recognisedFamilies(player) {
    return [...new Set(player.positions.map(p => POS_GROUP[p]).filter(Boolean))];
}

// ── Runtime state ──────────────────────────────────────────
let userTeam           = {};       // nodePos -> { name, score, nation, outOfPosition }
let appMode             = "rwc"; // "rwc" or "lions"
let currentSpunSquad   = [];
let selectedPlayer     = null;
let respinsLeft        = 0;
let isKnowledgeMode    = false;
let isCareerMode       = false;
let simSpeedMultiplier = 1; // 1 = medium (default); read from the speed radio when Kick Off Tournament is clicked
let teamStrategyWeight = 50; // 0 = max Forwards Dominant, 100 = max Backs Dominant, 50 = Balanced; locked in when Kick Off Tournament is clicked

// Preloaded once at script load so the share card can draw it synchronously
// without needing to restructure generateShareGraphic() as async.
const shareCardLogo = new Image();
shareCardLogo.src = "assets/logo-dark.png";
let selectedTournamentYear = "2023"; // which World Cup is being simulated this run
let activePoolStandings = poolStandingsByYear[selectedTournamentYear];
let activeTeamStrengths = teamStrengthsByYear[selectedTournamentYear];
let spotsFilledCount   = 0;
let playerSelectedFromCurrentPool = false;
let globalDraftedNames = new Set();
let replacedTeam       = "";

// ── DOM refs ───────────────────────────────────────────────
const setupCard       = document.getElementById("setup-card");
const draftDashboard  = document.getElementById("draft-dashboard");
const simDashboard    = document.getElementById("sim-dashboard");
const spinBtn         = document.getElementById("spin-btn");
const respinBtn       = document.getElementById("respin-btn");
const respinCountText = document.getElementById("respin-count");
const rosterContainer = document.getElementById("roster-container");
const statusText      = document.getElementById("status-text");
const flagIndicator   = document.getElementById("flag-indicator");
const pitchCircles    = document.querySelectorAll(".pitch-circle");
const runSimBtn       = document.getElementById("run-sim-btn");
const simResults      = document.getElementById("sim-results");
const restartBtn      = document.getElementById("restart-btn");
const manifestTeamBox = document.getElementById("manifest-team-box");

// Staging-only dev mode: detected by URL pattern so the same app.js works
// correctly on both sites without manual edits. Dev options simply won't
// exist when this file is served from production.
const IS_STAGING_ENV = location.hostname.includes("github.io") &&
    location.pathname.includes("rugby-draft-sim-staging");

// ============================================================
// SETUP SCREEN
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
    const teamSelect = document.getElementById("team-select");
    const yearSelect = document.getElementById("tournament-year-select");

    // Staging-only dev mode: detected by URL pattern so the same app.js
    // works correctly on both sites without manual edits. The Cymru
    // option simply won't exist when this file is served from production.

    function populateTeamSelect(year) {
        if (!teamSelect) return;
        const pools = poolStandingsByYear[year];
        if (!pools) return;
        const nations = Object.values(pools).flat().sort();
        teamSelect.innerHTML = "";
        nations.forEach(t => {
            const opt = document.createElement("option");
            opt.value = t; opt.textContent = t;
            teamSelect.appendChild(opt);
        });
        if (IS_STAGING_ENV) {
            const devOpt = document.createElement("option");
            devOpt.value = "Cymru"; devOpt.textContent = "Cymru (Dev Mode)";
            teamSelect.appendChild(devOpt);
        }
        // Prefer England if it's competing that year, otherwise just take the first nation
        teamSelect.value = nations.includes("England") ? "England" : nations[0];
    }

    if (yearSelect) {
        yearSelect.addEventListener("change", () => populateTeamSelect(yearSelect.value));
    }
    populateTeamSelect(yearSelect ? yearSelect.value : "2023");

    const lionsDevBtn = document.getElementById("lions-dev-btn");
    if (lionsDevBtn) {
        lionsDevBtn.addEventListener("click", e => {
            e.preventDefault();
            activateLionsDevMode();
        });
    }

    document.getElementById("start-game-btn").addEventListener("click", e => {
        e.preventDefault();
        const diff = document.querySelector('input[name="difficulty"]:checked');
        const setting = diff ? diff.value : "normal";
        respinsLeft = setting === "easy" ? 3 : setting === "normal" ? 1 : 0;
        if (respinCountText) respinCountText.textContent = respinsLeft;

        selectedTournamentYear = yearSelect ? yearSelect.value : "2023";
        activePoolStandings = poolStandingsByYear[selectedTournamentYear];
        activeTeamStrengths = teamStrengthsByYear[selectedTournamentYear];

        replacedTeam = teamSelect ? teamSelect.value : "England";

        if (replacedTeam === "Cymru") {
            // Dev mode: skip straight to boss stage with a 99-rated squad
            activateCymruMode();
            return;
        }

        setupCard.classList.add("hidden");
        draftDashboard.classList.remove("hidden");
        window.scrollTo(0, 0);
        recalculateDashboardAverages();
        showTip("draftIntro");

        const headerResetBtn = document.getElementById("header-reset-btn");
        if (headerResetBtn) headerResetBtn.textContent = "Abandon Campaign";
    });
});

function activateCymruMode() {
    // Fill userTeam with 99-rated Welsh (and Lions) legends — every field
    // matches the real shape the draft produces, so the rest of the app
    // (pitch rendering, manifest, score breakdowns, standings) treats this
    // exactly like a genuinely-drafted squad.
    const cymruSquad = [
        { pos:"Loosehead Prop",    name:"Gethin Jenkins",   nation:"WAL '11" },
        { pos:"Hooker",            name:"Bobby Windsor",    nation:"WAL '78" },
        { pos:"Tighthead Prop",    name:"Graham Price",     nation:"WAL '78" },
        { pos:"Lock 4",            name:"Alun Wyn Jones",   nation:"WAL '19" },
        { pos:"Lock 5",            name:"RH Williams",      nation:"WAL '60" },
        { pos:"Blindside Flanker", name:"Dai Morris",       nation:"WAL '71" },
        { pos:"Openside Flanker",  name:"Sam Warburton",    nation:"WAL '11" },
        { pos:"Number 8",          name:"Mervyn Davies",    nation:"WAL '76" },
        { pos:"Scrum-half",        name:"Gareth Edwards",   nation:"WAL '76" },
        { pos:"Fly-half",          name:"Barry John",       nation:"WAL '72", kicker:true },
        { pos:"Left Wing",         name:"Shane Williams",   nation:"WAL '07" },
        { pos:"Inside Centre",     name:"Scott Gibbs",      nation:"WAL '99" },
        { pos:"Outside Centre",    name:"Bleddyn Williams", nation:"WAL '53" },
        { pos:"Right Wing",        name:"Gerald Davies",    nation:"WAL '71" },
        { pos:"Fullback",          name:"JPR Williams",     nation:"WAL '71" },
    ];
    cymruSquad.forEach(p => {
        userTeam[p.pos] = {
            name: p.name, score: 99, nation: p.nation,
            outOfPosition: false, penalty: 0, originalRating: 99,
            kicker: p.kicker === true
        };
    });
    replacedTeam = "Wales";  // replaces Wales in the bracket

    // Move straight to the simulation screen, exactly as a real draft would
    // once the 15th player is placed — nothing downstream is faked, this
    // runs through the same runTournamentSimulation() as a normal game.
    setupCard.classList.add("hidden");
    draftDashboard.classList.add("hidden");
    simDashboard.classList.remove("hidden");
    window.scrollTo(0, 0);
    populateManifestPreviewWindow();
    populatePreKickoffSummary();
    populateTournamentTitle();
    applyHostTheme();
    showTip("simIntro");

    const headerResetBtn = document.getElementById("header-reset-btn");
    if (headerResetBtn) headerResetBtn.textContent = "Abandon Campaign";
}

function activateLionsDevMode() {
    // Fill userTeam with 99-rated Lions legends, reusing the same roster as
    // the Lions All Time XV boss fight so there's only one place these
    // names are maintained. Locks share one "Lock" label in that data, so
    // split them across Lock 4/Lock 5 the same way bossTeamToLineup does.
    let lockSlot = 4;
    BOSS_TEAMS.lions.players.forEach(p => {
        const pos = p.pos === "Lock" ? "Lock " + (lockSlot++) : p.pos;
        userTeam[pos] = {
            name: p.name, score: 99, nation: p.nation,
            outOfPosition: false, penalty: 0, originalRating: 99,
            kicker: false
        };
    });

    // Move straight to the simulation screen, exactly as a real draft would
    // once the 15th player is placed.
    setupCard.classList.add("hidden");
    draftDashboard.classList.add("hidden");
    simDashboard.classList.remove("hidden");
    window.scrollTo(0, 0);
    populateManifestPreviewWindow();
    populatePreKickoffSummary();
    populateTournamentTitle();
    applyHostTheme();
    showTip("simIntro");

    const headerResetBtn2 = document.getElementById("header-reset-btn");
    if (headerResetBtn2) headerResetBtn2.textContent = "Abandon Campaign";
}


// ============================================================
// SLIDERS
// ============================================================
const variantHint = document.getElementById("variant-hint");
const variantCompLabel = document.getElementById("variant-comp");
setupSlider("variant-slider-track", "variant-handle", idx => {
    isCareerMode = idx === 1;
    if (variantHint) variantHint.textContent = isCareerMode
        ? "Players are rated at their personal career best, regardless of tournament year."
        : (appMode === "lions"
            ? "Players are rated for their form nearest to each Lions tour they face."
            : "Players are rated as they were at the 2023 World Cup.");
    if (currentSpunSquad.length > 0) renderRosterList();
});

// Game Mode toggle: Rugby World Cups (default) or Lions Tours. Swaps the
// explainer copy, hides the World Cup year and Replace Which Team controls
// (Lions mode has neither, it's a fixed ladder of home nations squads),
// relabels the Rating Mode control to Tour Rating, and applies the Lions
// colour theme on top of whichever light/dark mode is already active.
setupSlider("mode-slider-track", "mode-handle", idx => {
    appMode = idx === 1 ? "lions" : "rwc";
    document.getElementById("explainer-rwc").classList.toggle("hidden", appMode === "lions");
    document.getElementById("explainer-lions").classList.toggle("hidden", appMode === "rwc");
    document.getElementById("tournament-year-group").classList.toggle("hidden", appMode === "lions");
    document.getElementById("team-select-group").classList.toggle("hidden", appMode === "lions");
    document.body.classList.toggle("lions-theme", appMode === "lions");
    const lionsDevBtn = document.getElementById("lions-dev-btn");
    if (lionsDevBtn) lionsDevBtn.classList.toggle("hidden", !(appMode === "lions" && IS_STAGING_ENV));
    if (runSimBtn) runSimBtn.textContent = appMode === "lions" ? "Kick Off Tour" : "Kick Off Tournament";
    if (variantCompLabel) variantCompLabel.textContent = appMode === "lions" ? "Tour Rating" : "Tournament Rating";
    if (variantHint && !isCareerMode) variantHint.textContent = appMode === "lions"
        ? "Players are rated for their form nearest to each Lions tour they face."
        : "Players are rated as they were at the 2023 World Cup.";
});
setupSlider("rating-slider-track", "rating-handle", idx => {
    isKnowledgeMode = idx === 1;
    if (currentSpunSquad.length > 0) renderRosterList();
});

function setupSlider(trackId, handleId, onChange) {
    const track = document.getElementById(trackId);
    if (!track) return;
    const opts = track.querySelectorAll(".slider-opt");
    let active = 0;
    track.addEventListener("click", () => {
        active = active === 0 ? 1 : 0;
        track.classList.toggle("right-state", active === 1);
        opts[0].classList.toggle("active", active === 0);
        opts[1].classList.toggle("active", active === 1);
        onChange(active);
    });
}

// Draggable 3-position speed slider (Slow / Medium / Fast) used on the
// simulation screen. Supports drag, click-anywhere-to-snap, and keyboard
// left/right arrows. Greys out and stops responding once the tournament
// has started (re-enabled on Play Again via resetSpeedSlider()).
const SPEED_POSITIONS = ["slow", "medium", "fast"];

function setupSpeedSlider() {
    const track = document.getElementById("speed-slider-track");
    const handle = document.getElementById("speed-slider-handle");
    if (!track || !handle) return;

    let index = 1; // medium by default

    function applyIndex(i, fireChange) {
        index = Math.max(0, Math.min(2, i));
        const value = SPEED_POSITIONS[index];
        // Matches the stop dots' positions exactly: 14px inset on each side,
        // not a plain 0%/50%/100% of the full track width.
        const left = index === 0 ? "14px" : index === 1 ? "50%" : "calc(100% - 14px)";
        handle.style.left = left;
        track.dataset.value = value;
        handle.setAttribute("aria-valuenow", index);
        if (fireChange) applySpeedSetting(value);
    }

    function pointerToIndex(clientX) {
        const rect = track.getBoundingClientRect();
        const usableLeft = rect.left + 14;
        const usableWidth = rect.width - 28;
        const fraction = Math.max(0, Math.min(1, (clientX - usableLeft) / usableWidth));
        return Math.round(fraction * 2);
    }

    let dragging = false;

    function startDrag(e) {
        if (track.classList.contains("disabled")) return;
        dragging = true;
        e.preventDefault();
    }

    function moveDrag(e) {
        if (!dragging) return;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        applyIndex(pointerToIndex(clientX), true);
    }

    function endDrag() { dragging = false; }

    handle.addEventListener("mousedown", startDrag);
    handle.addEventListener("touchstart", startDrag, { passive: false });
    document.addEventListener("mousemove", moveDrag);
    document.addEventListener("touchmove", moveDrag, { passive: false });
    document.addEventListener("mouseup", endDrag);
    document.addEventListener("touchend", endDrag);

    // Click anywhere on the track (not just the handle) snaps to that position
    track.addEventListener("click", (e) => {
        if (track.classList.contains("disabled")) return;
        if (e.target === handle) return; // handled by drag logic
        applyIndex(pointerToIndex(e.clientX), true);
    });

    handle.addEventListener("keydown", (e) => {
        if (track.classList.contains("disabled")) return;
        if (e.key === "ArrowLeft")  { applyIndex(index - 1, true); e.preventDefault(); }
        if (e.key === "ArrowRight") { applyIndex(index + 1, true); e.preventDefault(); }
    });

    applyIndex(1, true); // initialise at medium
}

function applySpeedSetting(value) {
    simSpeedMultiplier = value === "slow" ? 1.8 : value === "fast" ? 0.4 : 1;
}

function disableSpeedSlider() {
    const track = document.getElementById("speed-slider-track");
    const handle = document.getElementById("speed-slider-handle");
    if (track) track.classList.add("disabled");
    if (handle) handle.setAttribute("tabindex", "-1");
}

function resetSpeedSlider() {
    const track = document.getElementById("speed-slider-track");
    const handle = document.getElementById("speed-slider-handle");
    if (track) track.classList.remove("disabled");
    if (handle) handle.setAttribute("tabindex", "0");
}

setupSpeedSlider();

// ============================================================
// SPIN / RESPIN
// ============================================================
if (spinBtn) {
    spinBtn.addEventListener("click", () => {
        if (currentSpunSquad.length > 0 && !playerSelectedFromCurrentPool) {
            statusText.textContent = "You must select a player from this squad before spinning again.";
            return;
        }
        lockCurrentNodes();
        triggerRosterSpinEngine();
    });
}

// Floating mobile-only "Spin Team" button: triggers the exact same spin
// logic as the real button (so the existing guard against re-spinning
// before placing a player still applies), then scrolls up so the newly
// spun squad's country/year is visible at the top of the screen (not
// just the player list itself, which would push that context off-screen
// above the fold), and hides itself again since there's nothing to
// place yet.
const floatingSpinBtn = document.getElementById("floating-spin-btn");
if (floatingSpinBtn && spinBtn) {
    floatingSpinBtn.addEventListener("click", () => {
        spinBtn.click();
        floatingSpinBtn.classList.add("hidden");
        const spinActionCard = document.getElementById("spin-action-card");
        if (spinActionCard) {
            spinActionCard.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    });
}
if (respinBtn) {
    respinBtn.addEventListener("click", () => {
        if (respinsLeft <= 0) return;
        respinsLeft--;
        respinCountText.textContent = respinsLeft;
        if (respinsLeft <= 0) { respinBtn.classList.add("disabled"); respinBtn.disabled = true; }
        lockCurrentNodes();
        triggerRosterSpinEngine();
    });
}

function lockCurrentNodes() {
    pitchCircles.forEach(c => { if (c.classList.contains("occupied")) c.dataset.locked = "true"; });
}

// ============================================================
// ROSTER SPIN ENGINE
// ============================================================
function triggerRosterSpinEngine() {
    selectedPlayer = null;
    playerSelectedFromCurrentPool = false;
    spinBtn.classList.add("disabled"); spinBtn.disabled = true;
    respinBtn.classList.add("disabled"); respinBtn.disabled = true;
    rosterContainer.innerHTML = "";
    statusText.textContent = "";
    if (flagIndicator) flagIndicator.innerHTML = "";

    if (typeof allSquads === "undefined") {
        statusText.textContent = "Error: data.js failed to load.";
        spinBtn.classList.remove("disabled"); spinBtn.disabled = false;
        return;
    }

    // Every nation is available to draft from, including the one you're
    // replacing in the bracket — there's no reason building an
    // England-led Hybrid XV should lock you out of English players.
    // The team you're replacing is still correctly excluded from your
    // own pool's match simulation elsewhere (you can't play yourself),
    // but that's a separate, bracket-level concern from this draft pool.
    const allNations = appMode === "lions"
        ? ["England", "Ireland", "Scotland", "Wales"]
        : Object.keys(allSquads);

    // Weighted draw — tier 1 nations appear ~3x more often than tier 3.
    // In Lions mode the pool is already just the four home unions, so
    // there's no need for the wider tiering, an even weight keeps the
    // draw fair across all four.
    const weights = appMode === "lions" ? {
        "England":1,"Ireland":1,"Scotland":1,"Wales":1
    } : {
        "New Zealand":3,"South Africa":3,"Australia":3,"England":3,"France":3,
        "Ireland":3,"Wales":3,"Scotland":3,"Argentina":3,
        "Fiji":2,"Samoa":2,"Japan":2,"Italy":2,"Tonga":2,"Georgia":2,
        "Romania":1,"Canada":1,"USA":1,"Namibia":1,"Portugal":1,
        "Russia":1,"Uruguay":1,"Chile":1,"Spain":1,"Zimbabwe":1,"Ivory Coast":1,
    };
    const pool = [];
    allNations.forEach(n => {
        const w = weights[n] || 1;
        for (let i = 0; i < w; i++) pool.push(n);
    });
    const nation = pool[Math.floor(Math.random() * pool.length)];
    const years = Object.keys(allSquads[nation]);
    // Weight recent years more heavily — older tournaments have lower ratings overall
    const yearWeights = { "1987":1,"1991":1,"1995":2,"1999":2,"2003":3,"2007":3,"2011":4,"2015":4,"2019":5,"2023":5 };
    const yearPool = [];
    years.forEach(y => {
        const w = yearWeights[y] || 2;
        for (let i = 0; i < w; i++) yearPool.push(y);
    });
    const year = yearPool[Math.floor(Math.random() * yearPool.length)];
    const squad = allSquads[nation][year];

    if (flagIndicator && typeof getFlagEmbed === "function") {
        flagIndicator.innerHTML = getFlagEmbed(nation);
    }
    statusText.textContent = nation.toUpperCase() + " — " + year + " World Cup squad. Choose ONE player.";

    currentSpunSquad = squad.map(p => ({
        name:      p.name,
        positions: p.positions,
        group:     primaryGroup(p),
        num:       p.num,
        rating:    isCareerMode ? p.careerRating : p.rating,
        nation:    nation + " '" + year.slice(2),
        kicker:    p.kicker === true
    }));

    renderRosterList();
    spinBtn.classList.remove("disabled"); spinBtn.disabled = false;
    if (respinsLeft > 0) { respinBtn.classList.remove("disabled"); respinBtn.disabled = false; }
}

// ============================================================
// RENDER ROSTER LIST
// ============================================================

// Check if ALL pitch nodes for a given family are occupied
function isFamilyFull(family) {
    return Array.from(pitchCircles)
        .filter(c => NODE_GROUP[c.dataset.pos] === family)
        .every(c => c.classList.contains("occupied"));
}

function renderRosterList() {
    rosterContainer.innerHTML = "";

    const groups = {};
    currentSpunSquad.forEach(p => {
        if (!groups[p.group]) groups[p.group] = [];
        groups[p.group].push(p);
    });

    const groupOrder = ["front-row","lock","back-row","half-back","centre","wing","fullback"];
    const groupLabels = {
        "front-row":"Front Row","lock":"Locks","back-row":"Back Row",
        "half-back":"Half-backs","centre":"Centres","wing":"Wings","fullback":"Fullbacks"
    };
    groupOrder.forEach(g => {
        if (!groups[g] || !groups[g].length) return;
        const block = document.createElement("div"); block.className = "roster-group";
        const head = document.createElement("div"); head.className = "group-header"; head.textContent = groupLabels[g] || g;
        block.appendChild(head);
        rosterContainer.appendChild(block);

        groups[g].sort((a,b) => a.num - b.num).forEach(player => {
            const row = document.createElement("div"); row.className = "player-row";

            const drafted  = globalDraftedNames.has(player.name);
            const allFamilies = recognisedFamilies(player);
            // A player is selectable if at least one of their recognised families has a free node
            const anySlotOpen = allFamilies.some(f => !isFamilyFull(f));
            const locked = playerSelectedFromCurrentPool;

            if (drafted || !anySlotOpen || locked) {
                row.classList.add("claimed-lockout");
            }

            const nameSpan = document.createElement("span"); nameSpan.className = "player-name";      nameSpan.textContent = player.name;
            const posSpan  = document.createElement("span"); posSpan.className  = "player-pos-label"; posSpan.textContent = shortenPos(player.positions[0]);
            const rtgSpan  = document.createElement("span"); rtgSpan.className  = "player-rating";    rtgSpan.textContent = isKnowledgeMode ? "" : player.rating;

            row.appendChild(nameSpan); row.appendChild(posSpan); row.appendChild(rtgSpan);
            block.appendChild(row);

            if (!drafted && anySlotOpen && !locked) {
                row.addEventListener("click", () => {
                    if (selectedPlayer && selectedPlayer.name === player.name) {
                        row.classList.remove("selected");
                        selectedPlayer = null;
                        clearPitchHighlights();
                    } else {
                        document.querySelectorAll(".player-row").forEach(r => r.classList.remove("selected"));
                        row.classList.add("selected");
                        selectedPlayer = player;
                        highlightEligibleNodes(player);
                    }
                });
            }
        });
    });
}

// ============================================================
// PITCH HIGHLIGHTING — gold (in-position) or amber (out-of-position)
// ============================================================
function clearPitchHighlights() {
    pitchCircles.forEach(c => {
        c.classList.remove("highlight-eligible", "highlight-outofpos", "highlight-forbidden");
        c.removeAttribute("title");
        delete c.dataset.penalty;
    });
}

function highlightEligibleNodes(player) {
    clearPitchHighlights();
    pitchCircles.forEach(circle => {
        if (circle.classList.contains("occupied")) return;
        const nodePos = circle.dataset.pos;
        if (isForbidden(player, nodePos)) {
            circle.classList.add("highlight-forbidden");
            return;
        }
        const penalty = oopPenalty(player, nodePos);
        if (penalty === 0) {
            circle.classList.add("highlight-eligible");
        } else {
            circle.classList.add("highlight-outofpos");
            circle.dataset.penalty = penalty;
        }
    });
}

// ============================================================
// PITCH CIRCLE CLICK — PLACE OR UNPLACE PLAYER
// ============================================================
pitchCircles.forEach(node => {
    node.addEventListener("click", () => {
        const nodePos = node.dataset.pos;

        // Clicking an occupied node — remove player if not locked
        if (node.classList.contains("occupied")) {
            if (!node.dataset.locked) {
                const name = node.dataset.occupant;
                delete userTeam[nodePos];
                globalDraftedNames.delete(name);
                spotsFilledCount--;
                playerSelectedFromCurrentPool = false;
                node.classList.remove("occupied");
                delete node.dataset.occupant;
                node.innerHTML = "";
                node.removeAttribute("title");
                recalculateDashboardAverages();
                renderRosterList();
            }
            return;
        }

        // Must have a player selected, and the node must not be forbidden or already occupied
        if (!selectedPlayer) return;
        if (!node.classList.contains("highlight-eligible") && !node.classList.contains("highlight-outofpos")) return;

        const penalty = oopPenalty(selectedPlayer, nodePos);
        const baseRating = selectedPlayer.rating;
        const finalRating = Math.max(0, baseRating - penalty);
        const inPos = (penalty === 0);

        userTeam[nodePos] = {
            name:           selectedPlayer.name,
            score:          finalRating,
            nation:         selectedPlayer.nation,
            outOfPosition:  !inPos,
            penalty:        penalty,
            originalRating: baseRating,
            kicker:         selectedPlayer.kicker === true
        };
        globalDraftedNames.add(selectedPlayer.name);
        spotsFilledCount++;
        playerSelectedFromCurrentPool = true;

        node.classList.add("occupied");
        node.dataset.occupant = selectedPlayer.name;

        if (!inPos) {
            node.classList.add("occupied-oop");
            node.dataset.oopPenalty = penalty;
            const ratingHtml = isKnowledgeMode ? "" : finalRating;
            node.innerHTML = `<div class="circle-num oop-num">${ratingHtml}<span class="oop-icon" data-penalty="${penalty}">⚠</span></div><div class="circle-name">${selectedPlayer.name}</div>`;
            const icon = node.querySelector(".oop-icon");
            if (icon) {
                icon.addEventListener("mouseenter", () => showOopTooltip(icon, penalty));
                icon.addEventListener("mouseleave",  hideOopTooltip);
                icon.addEventListener("click", e => { e.stopPropagation(); toggleOopTooltip(icon, penalty); });
            }
        } else {
            const ratingHtml = isKnowledgeMode ? "" : finalRating;
            node.innerHTML = `<div class="circle-num">${ratingHtml}</div><div class="circle-name">${selectedPlayer.name}</div>`;
        }

        selectedPlayer = null;
        clearPitchHighlights();
        recalculateDashboardAverages();
        renderRosterList();

        if (spotsFilledCount === 15) {
            lockCurrentNodes();
            if (floatingSpinBtn) floatingSpinBtn.classList.add("hidden");
            setTimeout(() => {
                draftDashboard.classList.add("hidden");
                simDashboard.classList.remove("hidden");
                window.scrollTo(0, 0);
                populateManifestPreviewWindow();
                populatePreKickoffSummary();
                populateTournamentTitle();
                applyHostTheme();
                showTip("simIntro");
            }, 800);
        } else {
            if (floatingSpinBtn) floatingSpinBtn.classList.remove("hidden");
        }
    });
});

// ============================================================
// DASHBOARD AVERAGES
// ============================================================
function recalculateDashboardAverages() {
    const globalEl  = document.getElementById("avg-global-ovr");
    const forwardEl = document.getElementById("avg-forward-ovr");
    const backEl    = document.getElementById("avg-back-ovr");

    if (isKnowledgeMode) {
        // Hide Ratings mode — keep the team strength hidden until kickoff
        globalEl.textContent  = "??";
        forwardEl.textContent = "??";
        backEl.textContent    = "??";
        return;
    }

    let tS=0,fS=0,bS=0,tC=0,fC=0,bC=0;
    for (let pos in userTeam) {
        const v = userTeam[pos].score; tS+=v; tC++;
        if (forwardNodes.includes(pos)) { fS+=v; fC++; }
        if (backNodes.includes(pos))    { bS+=v; bC++; }
    }
    globalEl.textContent  = tC>0 ? Math.round(tS/tC) : "--";
    forwardEl.textContent = fC>0 ? Math.round(fS/fC) : "--";
    backEl.textContent    = bC>0 ? Math.round(bS/bC) : "--";
}

// ============================================================
// MANIFEST (SCREEN 3 SQUAD SUMMARY)
// ============================================================
function populateManifestPreviewWindow() {
    if (!manifestTeamBox) return;
    const order = ["Loosehead Prop","Hooker","Tighthead Prop","Lock 4","Lock 5",
                   "Blindside Flanker","Openside Flanker","Number 8",
                   "Scrum-half","Fly-half",
                   "Left Wing","Inside Centre","Outside Centre","Right Wing","Fullback"];
    const posShort = {
        "Loosehead Prop":"Prop", "Tighthead Prop":"Prop", "Hooker":"Hooker",
        "Lock 4":"Lock", "Lock 5":"Lock",
        "Blindside Flanker":"Flanker", "Openside Flanker":"Flanker", "Number 8":"No. 8",
        "Scrum-half":"Scrum-half", "Fly-half":"Fly-half",
        "Inside Centre":"Centre", "Outside Centre":"Centre",
        "Left Wing":"Wing", "Right Wing":"Wing", "Fullback":"Fullback"
    };
    let html = `<div class="manifest-header">Your Hybrid XV${appMode === "lions" ? "" : " replacing " + replacedTeam}</div>`;
    order.forEach((pos, i) => {
        const p = userTeam[pos];
        if (!p) return;
        const oopBadge = p.outOfPosition
            ? (isKnowledgeMode ? `<span class="manifest-oop">⚠ OOP</span>` : `<span class="manifest-oop">⚠ -${p.penalty || '?'}pts</span>`)
            : "";
        html += `<div class="manifest-row">
            <span class="manifest-left">
                <span class="manifest-num">${i+1}</span>
                <span class="manifest-pos">${posShort[pos] || pos}</span>
            </span>
            <span class="manifest-right">
                <span class="manifest-name">${p.name}</span> <span class="manifest-nation">(${p.nation})</span>${oopBadge}
            </span>
        </div>`;
    });
    manifestTeamBox.innerHTML = html;
}

// Shows "Rugby World Cup" + "[year] — [host]" above the simulation panels,
// using the tournament the user actually selected on the setup screen.
function populateTournamentTitle() {
    const box = document.getElementById("tournament-title");
    if (!box) return;
    if (appMode === "lions") {
        box.innerHTML = `<div class="tt-line1">Lions Tour, Ultimate Edition</div>`;
        return;
    }
    const meta = tournamentMeta[selectedTournamentYear];
    const host = meta ? meta.host : "";
    box.innerHTML = `
        <div class="tt-line1">Rugby World Cup ${selectedTournamentYear}${host ? ", " + host : ""}</div>
    `;
}

// Recolours the simulation screen's chrome to match the host nation's
// genuine sporting colours for the selected tournament year, using the
// fully explicit per-year, per-theme spec in simTheme (data.js) — team
// list card background/border/text, the processor panel border, the
// inner match-log box background/text, the ratings circles, the
// "Your Hybrid XV is ready" header, the speed slider handle, and the
// Kick Off Tournament button. Re-applied on theme toggle as well as on
// screen transitions, since most nations have a genuinely distinct
// light/dark variant rather than one colour reused across both.
function applyHostTheme() {
    const dashboard = document.getElementById("sim-dashboard");
    if (!dashboard) return;

    const allVars = ["--host-team-bg","--host-team-border","--host-team-text","--host-team-muted",
        "--host-proc-bg","--host-proc-border","--host-terminal-bg","--host-terminal-text",
        "--host-ratings-bg","--host-ratings-text","--host-ready-header",
        "--host-slider-colour","--host-button-bg","--host-button-text"];

    const yearTheme = (typeof simTheme !== "undefined") ? simTheme[appMode === "lions" ? "1999" : selectedTournamentYear] : null;
    if (!yearTheme) {
        dashboard.classList.remove("host-themed");
        allVars.forEach(v => dashboard.style.removeProperty(v));
        return;
    }

    const isLight = document.body.classList.contains("light-theme");
    const spec = yearTheme[isLight ? "light" : "dark"];
    if (!spec) {
        dashboard.classList.remove("host-themed");
        allVars.forEach(v => dashboard.style.removeProperty(v));
        return;
    }

    dashboard.classList.add("host-themed");
    const propMap = {
        teamBg: "--host-team-bg", teamBorder: "--host-team-border",
        teamText: "--host-team-text", teamMuted: "--host-team-muted",
        procBg: "--host-proc-bg", procBorder: "--host-proc-border",
        terminalBg: "--host-terminal-bg", terminalText: "--host-terminal-text",
        ratingsBg: "--host-ratings-bg", ratingsText: "--host-ratings-text",
        readyHeader: "--host-ready-header", sliderColour: "--host-slider-colour",
        buttonBg: "--host-button-bg", buttonText: "--host-button-text"
    };
    Object.entries(propMap).forEach(([key, cssVar]) => {
        if (spec[key]) dashboard.style.setProperty(cssVar, spec[key]);
        else dashboard.style.removeProperty(cssVar);
    });
}


// ============================================================
// PRE-KICKOFF SUMMARY — the FIRST moment ratings are revealed
// ============================================================
function populatePreKickoffSummary() {
    const box = document.getElementById("pre-kickoff-summary");
    if (!box) return;

    let fS=0,bS=0,fC=0,bC=0;
    for (let pos in userTeam) {
        const v = userTeam[pos].score;
        if (forwardNodes.includes(pos)) { fS+=v; fC++; }
        if (backNodes.includes(pos))    { bS+=v; bC++; }
    }
    const fwd = fC>0 ? Math.round(fS/fC) : 0;
    const bck = bC>0 ? Math.round(bS/bC) : 0;
    // Reset to Balanced each time the prekick screen is (re)built, so the
    // Overall Rating shown here always matches what getUserRating() will
    // actually use if the player kicks off without touching the slider.
    teamStrategyWeight = 50;
    const overall = Math.round(fwd*strategyForwardWeight(50) + bck*(1-strategyForwardWeight(50)));

    box.innerHTML = `
        <div class="prekick-header">Your Hybrid XV is ready</div>
        <div class="prekick-stats">
            <div class="prekick-stat">
                <div class="prekick-val" id="prekick-overall-val">${overall}</div>
                <div class="prekick-lbl">Overall Rating</div>
            </div>
            <div class="prekick-stat">
                <div class="prekick-val">${fwd}</div>
                <div class="prekick-lbl">Forwards Rating</div>
            </div>
            <div class="prekick-stat">
                <div class="prekick-val">${bck}</div>
                <div class="prekick-lbl">Backs Rating</div>
            </div>
        </div>
        <div class="strategy-row">
            <span class="strategy-row-label">Team Strategy
                <span id="strategy-info-icon" class="info-icon" tabindex="0" role="button" aria-label="What does Team Strategy do?">i</span>
            </span>
            <div id="strategy-slider-track" class="strategy-slider-track" data-value="balanced">
                <div class="strategy-slider-rail"></div>
                <div id="strategy-slider-handle" class="strategy-slider-handle" tabindex="0" role="slider"
                     aria-label="Team strategy: forwards dominant to backs dominant" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50"></div>
                <div class="strategy-slider-labels">
                    <span class="strategy-slider-label">Forwards Dominant</span>
                    <span class="strategy-slider-label">Balanced</span>
                    <span class="strategy-slider-label">Backs Dominant</span>
                </div>
            </div>
        </div>
    `;

    setupStrategySlider(fwd, bck);
    syncProcessorCardHeight();
}

// Pins #sim-processor-card's height to match #sim-left-column's actual
// rendered height, so the terminal log scrolls inside a fixed box instead
// of the whole card growing as match results are appended. Grid align-items:
// stretch alone doesn't do this safely — an auto-sized grid track grows to
// fit unbounded flex content, which is exactly the bug this replaces.
function syncProcessorCardHeight() {
    const left = document.getElementById("sim-left-column");
    const card = document.getElementById("sim-processor-card");
    if (!left || !card) return;
    // Below the 1024px breakpoint the columns stack and CSS already
    // handles sizing (height: auto, fixed-height terminal), so leave it alone.
    if (window.innerWidth <= 1024) { card.style.height = ""; return; }
    card.style.height = left.offsetHeight + "px";
}

let _procCardResizeTimer = null;
window.addEventListener("resize", () => {
    clearTimeout(_procCardResizeTimer);
    _procCardResizeTimer = setTimeout(syncProcessorCardHeight, 120);
});

function setupStrategySlider(fwdAvg, bckAvg) {
    const track  = document.getElementById("strategy-slider-track");
    const handle = document.getElementById("strategy-slider-handle");
    const overallVal = document.getElementById("prekick-overall-val");
    const infoIcon = document.getElementById("strategy-info-icon");
    if (infoIcon) {
        const tipText = "Slide toward Forwards or Backs Dominant to weight your Overall Rating (and match simulation) more heavily on that half of the team. Locks in once you kick off.";
        infoIcon.addEventListener("click", e => {
            e.stopPropagation();
            toggleInfoTooltip(infoIcon, tipText);
        });
        infoIcon.addEventListener("keydown", e => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleInfoTooltip(infoIcon, tipText);
            }
        });
    }
    if (!track || !handle) return;

    function applyValue(v) {
        teamStrategyWeight = Math.max(0, Math.min(100, Math.round(v)));
        handle.style.left = `calc(14px + ${teamStrategyWeight/100} * (100% - 28px))`;
        handle.setAttribute("aria-valuenow", teamStrategyWeight);
        track.dataset.value = teamStrategyWeight < 40 ? "forwards" : teamStrategyWeight > 60 ? "backs" : "balanced";
        if (overallVal) {
            const fwdWeight = strategyForwardWeight(teamStrategyWeight);
            overallVal.textContent = Math.round(fwdAvg*fwdWeight + bckAvg*(1-fwdWeight));
        }
    }

    function pointerToValue(clientX) {
        const rect = track.getBoundingClientRect();
        const usableLeft = rect.left + 14;
        const usableWidth = rect.width - 28;
        const fraction = Math.max(0, Math.min(1, (clientX - usableLeft) / usableWidth));
        return fraction * 100;
    }

    let dragging = false;

    function startDrag(e) {
        if (track.classList.contains("disabled")) return;
        dragging = true;
        e.preventDefault();
    }
    function moveDrag(e) {
        if (!dragging) return;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        applyValue(pointerToValue(clientX));
    }
    function endDrag() { dragging = false; }

    handle.addEventListener("mousedown", startDrag);
    handle.addEventListener("touchstart", startDrag, { passive: false });
    document.addEventListener("mousemove", moveDrag);
    document.addEventListener("touchmove", moveDrag, { passive: false });
    document.addEventListener("mouseup", endDrag);
    document.addEventListener("touchend", endDrag);

    // Click anywhere on the track (not just the handle) jumps straight there
    track.addEventListener("click", (e) => {
        if (track.classList.contains("disabled")) return;
        if (e.target === handle) return; // handled by drag logic
        applyValue(pointerToValue(e.clientX));
    });

    handle.addEventListener("keydown", (e) => {
        if (track.classList.contains("disabled")) return;
        if (e.key === "ArrowLeft")  { applyValue(teamStrategyWeight - 5); e.preventDefault(); }
        if (e.key === "ArrowRight") { applyValue(teamStrategyWeight + 5); e.preventDefault(); }
    });

    applyValue(50); // start Balanced
}

function disableStrategySlider() {
    const track = document.getElementById("strategy-slider-track");
    const handle = document.getElementById("strategy-slider-handle");
    if (track) track.classList.add("disabled");
    if (handle) handle.setAttribute("tabindex", "-1");
}

// ============================================================
// SIMULATION ENGINE
// ============================================================
if (runSimBtn) {
    runSimBtn.addEventListener("click", () => {
        runSimBtn.disabled = true; runSimBtn.classList.add("disabled");
        simResults.innerHTML = "";
        disableSpeedSlider();
        disableStrategySlider();
        if (appMode === "lions") {
            runLionsGauntlet();
            return;
        }
        const meta = tournamentMeta[selectedTournamentYear];
        if (meta && meta.hasPlayoffRound) {
            runTournamentSimulation1999();
        } else if (selectedTournamentYear === "1995") {
            runTournamentSimulation1995();
        } else if (selectedTournamentYear === "1991") {
            runTournamentSimulation1991();
        } else if (selectedTournamentYear === "1987") {
            runTournamentSimulation1987();
        } else {
            runTournamentSimulation();
        }
    });
}

// ============================================================
// SHARE GRAPHIC — downloadable PNG of squad + pitch + result
// ============================================================
let lastResultHeadline = "";
let matchHistory = []; // { stage, opponent, userScore, oppScore, won } per match this run
let playerStats = {}; // { playerName: { tries, points } } accumulated across this tournament run

function getPlayerStat(name) {
    if (!playerStats[name]) playerStats[name] = { tries: 0, points: 0 };
    return playerStats[name];
}
let lastResultColour   = "#4ade80";

function isMobileDevice() {
    // Explicit mobile check — some desktop browsers partially implement the
    // Web Share API without a real OS share sheet, so we check the device
    // itself rather than trusting feature detection alone.
    const ua = navigator.userAgent || "";
    const mobileUA = /Android|iPhone|iPad|iPod/i.test(ua);
    const touchPrimary = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    return mobileUA || touchPrimary;
}

function canUseNativeShare() {
    // Web Share API with file support — only treated as usable on mobile,
    // where it opens a genuine OS share sheet. Desktop always downloads.
    if (!isMobileDevice()) return false;
    return !!(navigator.share && navigator.canShare &&
        navigator.canShare({ files: [new File([""], "test.png", { type: "image/png" })] }));
}

// ============================================================
// PAGE SHARE BUTTON (footer) — share the site itself, not a result card
// ============================================================
function setupPageShareButton() {
    const shareBtn = document.getElementById("page-share-btn");
    const shareMenu = document.getElementById("page-share-menu");
    if (!shareBtn || !shareMenu) return;

    const pageUrl = window.location.href.split("?")[0]; // strip any cache-busting query param
    const shareText = "Build your ultimate Hybrid XV and simulate the Rugby World Cup!";

    function closeMenu() { shareMenu.classList.add("hidden"); }
    function openMenu() { shareMenu.classList.remove("hidden"); }

    shareBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        shareMenu.classList.contains("hidden") ? openMenu() : closeMenu();
    });
    document.addEventListener("click", (e) => {
        if (!shareMenu.contains(e.target) && e.target !== shareBtn) closeMenu();
    });

    async function copyLink() {
        try {
            await navigator.clipboard.writeText(pageUrl);
            shareBtn.querySelector(".share-label").textContent = "Copied!";
            setTimeout(() => { shareBtn.querySelector(".share-label").textContent = "Share"; }, 1800);
        } catch (e) {
            // Clipboard API unavailable — fall back to a prompt the user can copy from manually
            window.prompt("Copy this link:", pageUrl);
        }
    }

    shareMenu.querySelectorAll("button[data-share]").forEach(btn => {
        btn.addEventListener("click", async () => {
            const kind = btn.dataset.share;
            closeMenu();

            if (kind === "email") {
                window.location.href = "mailto:?subject=" + encodeURIComponent("Rugby XV Draft") +
                    "&body=" + encodeURIComponent(shareText + "\n\n" + pageUrl);
            } else if (kind === "sms") {
                // iOS and Android use slightly different sms: separators, but
                // a bare sms: with a body param degrades gracefully on both.
                window.location.href = "sms:?body=" + encodeURIComponent(shareText + " " + pageUrl);
            } else if (kind === "whatsapp") {
                window.open("https://wa.me/?text=" + encodeURIComponent(shareText + " " + pageUrl), "_blank");
            } else if (kind === "instagram") {
                // Instagram has no public web scheme for sharing an arbitrary
                // link with pre-filled text. On mobile, try the native OS
                // share sheet (the user can pick Instagram themselves); on
                // desktop, copy the link so they can paste it into Instagram.
                if (navigator.share && isMobileDevice()) {
                    try { await navigator.share({ title: "Rugby XV Draft", text: shareText, url: pageUrl }); }
                    catch (e) { /* user cancelled — no action needed */ }
                } else {
                    await copyLink();
                    window.prompt("Link copied — paste this into Instagram:", pageUrl);
                }
            } else if (kind === "copy") {
                await copyLink();
            }
        });
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupPageShareButton);
} else {
    setupPageShareButton();
}

// Renders an end-of-run results summary into the sim log: games played,
// won, lost, plus the tournament's top points scorer and top try scorer.
// Called once at every possible run-ending point, right before the
// share/download button appears.
// Computes the played/won/lost record and the tournament's top points
// scorer and top try scorer from the current run's accumulated stats.
// Shared by showResultsSummary() (in-app log) and generateShareGraphic()
// (the downloadable card), so both always agree with each other.
function computeTournamentSummary() {
    const played = matchHistory.length;
    const won = matchHistory.filter(m => m.won).length;
    const lost = played - won;

    const statEntries = Object.entries(playerStats);
    const topScorer = statEntries.length
        ? statEntries.reduce((best, cur) => cur[1].points > best[1].points ? cur : best)
        : null;
    const topTryScorer = statEntries.length
        ? statEntries.reduce((best, cur) => cur[1].tries > best[1].tries ? cur : best)
        : null;

    return { played, won, lost, topScorer, topTryScorer };
}

async function showResultsSummary() {
    const { played, won, lost, topScorer, topTryScorer } = computeTournamentSummary();

    let html = '<div class="results-summary">';
    html += '<div class="results-summary-title">Tournament Summary</div>';
    html += '<div class="results-summary-grid">';
    html += '<div class="rs-stat"><div class="rs-val">' + played + '</div><div class="rs-lbl">Played</div></div>';
    html += '<div class="rs-stat"><div class="rs-val rs-good">' + won + '</div><div class="rs-lbl">Won</div></div>';
    html += '<div class="rs-stat"><div class="rs-val rs-bad">' + lost + '</div><div class="rs-lbl">Lost</div></div>';
    html += '</div>';

    if (topScorer && topScorer[1].points > 0) {
        html += '<div class="rs-leader"><span class="rs-leader-lbl">Top Points Scorer</span>' +
            '<span class="rs-leader-val">' + topScorer[0] + ' — ' + topScorer[1].points + ' pts</span></div>';
    }
    if (topTryScorer && topTryScorer[1].tries > 0) {
        html += '<div class="rs-leader"><span class="rs-leader-lbl">Top Try Scorer</span>' +
            '<span class="rs-leader-val">' + topTryScorer[0] + ' — ' + topTryScorer[1].tries +
            (topTryScorer[1].tries === 1 ? ' try' : ' tries') + '</span></div>';
    }
    html += '</div>';

    await addLogBlock(html);
}

function showShareButton(headline, colour) {
    lastResultHeadline = headline;
    lastResultColour   = colour || "#4ade80";

    if (document.getElementById("share-team-btn")) return; // already showing

    const btn = document.createElement("button");
    btn.id = "share-team-btn";
    btn.textContent = canUseNativeShare() ? "Share Your Card" : "Download Your Card";
    btn.className = "btn-primary share-team-btn";
    btn.addEventListener("click", generateShareGraphic);

    // Insert it right after the restart button so the two sit side by side
    if (restartBtn && restartBtn.parentNode) {
        restartBtn.classList.add("result-action-btn");
        restartBtn.parentNode.insertBefore(btn, restartBtn.nextSibling);

        // Wrap both buttons in a flex row if not already wrapped
        if (!restartBtn.parentNode.classList.contains("result-actions-row")) {
            const row = document.createElement("div");
            row.className = "result-actions-row";
            restartBtn.parentNode.insertBefore(row, restartBtn);
            row.appendChild(restartBtn);
            row.appendChild(btn);
        }
    }
}

function generateShareGraphic() {
    const W = 1080, H = 2150; // portrait, social-friendly
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");

    // ── Background ──
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, "#0f1b12");
    bgGrad.addColorStop(1, "#162018");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    const gold = "#c5a059";
    const goldFaint = "rgba(197,160,89,0.25)";
    const textMuted = "#9ca39c";
    const white = "#f3f4f6";

    // ── Header — no logo here any more; it now sits as a large, faint
    // watermark behind the pitch diagram instead ──
    ctx.textAlign = "center";
    ctx.fillStyle = gold;
    ctx.font = "bold 52px Georgia, serif";
    ctx.fillText("RUGBY HYBRID XV", W/2, 110);
    ctx.font = "26px Georgia, serif";
    ctx.fillStyle = textMuted;
    ctx.fillText(appMode === "lions" ? "Lions Tours" : "replacing " + (replacedTeam || "—"), W/2, 148);

    // Divider
    ctx.strokeStyle = goldFaint;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(80, 178); ctx.lineTo(W-80, 178); ctx.stroke();

    // ── Result headline — more breathing room below the divider than before ──
    ctx.font = "bold 36px Georgia, serif";
    ctx.fillStyle = lastResultColour;
    wrapCanvasText(ctx, lastResultHeadline || "Campaign complete", W/2, 240, W-160, 44);

    // ── Tournament line, played/won/lost, and top scorers — one host-themed box ──
    const boxBottom = drawTournamentSummary(ctx, W, 330);

    // ── Full-width pitch diagram, matched to the box's own width, with a
    // large faint logo watermark behind the roster ──
    const pitchTop = boxBottom + 45;
    drawMiniPitch(ctx, W/2, pitchTop + 450, W-120, 900);

    // ── Results recap ──
    const recapTop = pitchTop + 900 + 60;
    ctx.textAlign = "left";
    ctx.font = "bold 24px Georgia, serif";
    ctx.fillStyle = gold;
    ctx.fillText("THE CAMPAIGN", 80, recapTop);
    ctx.strokeStyle = goldFaint;
    ctx.beginPath(); ctx.moveTo(80, recapTop+12); ctx.lineTo(W-80, recapTop+12); ctx.stroke();

    const rowH = 52;
    let y = recapTop + 65;
    if (!matchHistory.length) {
        ctx.font = "18px Arial";
        ctx.fillStyle = textMuted;
        ctx.fillText("No matches played.", 80, y);
    } else {
        matchHistory.forEach(m => {
            ctx.font = "bold 19px Arial";
            ctx.fillStyle = textMuted;
            ctx.fillText(m.stage.toUpperCase(), 80, y);

            ctx.font = "bold 24px Arial";
            ctx.fillStyle = white;
            ctx.fillText("vs " + m.opponent, 280, y);

            ctx.textAlign = "right";
            ctx.font = "bold 26px Arial";
            ctx.fillStyle = m.won ? "#4ade80" : "#f87171";
            ctx.fillText(m.userScore + " — " + m.oppScore, W-80, y);
            ctx.textAlign = "left";

            y += rowH;
        });
    }

    // ── Footer — bigger and in brand gold, rather than small and muted ──
    ctx.textAlign = "center";
    ctx.font = "bold 30px Arial";
    ctx.fillStyle = gold;
    ctx.fillText("www.rugbydraft.team", W/2, y + 30);

    shareOrDownloadCanvas(canvas);
}

// Draws the tournament line, the Played/Won/Lost stat row, and the two top
// scorers side by side, all inside one bordered box. Colours come from
// simTheme — the same host-nation theming the sim screen's rating circles
// and team panel already use — so the card always matches whatever the
// player saw in-app, falling back to a neutral dark/gold look for any
// year without a theme entry. Returns the box's bottom y so the caller
// can position the pitch diagram directly beneath it.
function drawTournamentSummary(ctx, W, top) {
    const { played, won, lost, topScorer, topTryScorer } = computeTournamentSummary();
    const gold = "#c5a059";
    const boxMuted = "#dee8e0";
    const white = "#f3f4f6";

    const boxLeft = 60, boxRight = W - 60;
    const boxTop = top;
    const boxBottom = boxTop + 260;
    const radius = 14;

    const yearTheme = (typeof simTheme !== "undefined") ? simTheme[appMode === "lions" ? "1999" : selectedTournamentYear] : null;
    const isLight = document.body.classList.contains("light-theme");
    const spec = yearTheme ? yearTheme[isLight ? "light" : "dark"] : null;
    const boxFill = (spec && spec.teamBg) || "rgba(255,255,255,0.04)";
    const boxBorder = (spec && spec.teamBorder) || gold;

    ctx.beginPath();
    ctx.moveTo(boxLeft+radius, boxTop);
    ctx.arcTo(boxRight, boxTop, boxRight, boxBottom, radius);
    ctx.arcTo(boxRight, boxBottom, boxLeft, boxBottom, radius);
    ctx.arcTo(boxLeft, boxBottom, boxLeft, boxTop, radius);
    ctx.arcTo(boxLeft, boxTop, boxRight, boxTop, radius);
    ctx.closePath();
    ctx.fillStyle = boxFill;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = boxBorder;
    ctx.stroke();

    const tmeta = tournamentMeta[selectedTournamentYear];
    ctx.textAlign = "center";
    ctx.font = "bold 24px Arial";
    ctx.fillStyle = gold;
    ctx.fillText("RUGBY WORLD CUP " + selectedTournamentYear + (tmeta ? " - " + tmeta.host.toUpperCase() : ""), W/2, boxTop + 40);

    let by = boxTop + 86;
    const cols = [
        { label: "Played", value: played, colour: white },
        { label: "Won",    value: won,    colour: "#4ade80" },
        { label: "Lost",   value: lost,   colour: "#f87171" },
    ];
    const colWidth = (boxRight - boxLeft) / 3;
    cols.forEach((col, i) => {
        const cx = boxLeft + colWidth * i + colWidth / 2;
        ctx.font = "bold 44px Arial";
        ctx.fillStyle = col.colour;
        ctx.fillText(String(col.value), cx, by);
        ctx.font = "15px Arial";
        ctx.fillStyle = boxMuted;
        ctx.fillText(col.label.toUpperCase(), cx, by + 30);
    });

    by += 53;
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(boxLeft+40, by); ctx.lineTo(boxRight-40, by); ctx.stroke();

    by += 30;
    const half = (boxRight - boxLeft) / 2;
    const lx = boxLeft + half/2;
    const rx = boxLeft + half + half/2;

    ctx.font = "20px Arial";
    ctx.fillStyle = boxMuted;
    if (topScorer && topScorer[1].points > 0) ctx.fillText("TOP POINTS SCORER", lx, by);
    if (topTryScorer && topTryScorer[1].tries > 0) ctx.fillText("TOP TRY SCORER", rx, by);

    by += 34;
    ctx.font = "bold 26px Arial";
    ctx.fillStyle = white;
    if (topScorer && topScorer[1].points > 0) ctx.fillText(topScorer[0], lx, by);
    if (topTryScorer && topTryScorer[1].tries > 0) ctx.fillText(topTryScorer[0], rx, by);

    by += 24;
    ctx.font = "bold 24px Arial";
    ctx.fillStyle = gold;
    if (topScorer && topScorer[1].points > 0) ctx.fillText(topScorer[1].points + " pts", lx, by);
    if (topTryScorer && topTryScorer[1].tries > 0) {
        const tries = topTryScorer[1].tries;
        ctx.fillText(tries + (tries === 1 ? " try" : " tries"), rx, by);
    }

    ctx.textAlign = "center"; // reset for subsequent drawing
    return boxBottom;
}

function drawMiniPitch(ctx, cx, cy, w, h) {
    const left = cx - w/2, top = cy - h/2;
    const gold = "#c5a059";

    // Pitch background
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    ctx.fillRect(left, top, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(left, top, w, h);

    // Pitch markings (halfway + 22m lines)
    [0.15, 0.42, 0.58, 0.85].forEach(frac => {
        ctx.beginPath();
        ctx.moveTo(left, top + h*frac);
        ctx.lineTo(left + w, top + h*frac);
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.stroke();
    });

    // Large, faint logo watermark behind the roster — drawn before the
    // circles/text below so it always sits underneath them.
    if (shareCardLogo.complete && shareCardLogo.naturalWidth > 0) {
        const wmSize = 620;
        ctx.save();
        ctx.globalAlpha = 0.10;
        ctx.drawImage(shareCardLogo, cx - wmSize/2, cy - wmSize/2, wmSize, wmSize);
        ctx.restore();
    }

    // Node layout as fractions of pitch width/height, matching the live pitch.
    // Wingers sit inset from the pitch edge (rather than right against it)
    // and dropped to sit halfway between the centres and the fullback, so
    // a wide name never has to shrink just because the position is drawn
    // close to the border.
    const nodes = [
        { pos:"Loosehead Prop", xf:0.20, yf:0.07 },
        { pos:"Hooker",         xf:0.50, yf:0.07 },
        { pos:"Tighthead Prop", xf:0.80, yf:0.07 },
        { pos:"Lock 4",         xf:0.35, yf:0.236 },
        { pos:"Lock 5",         xf:0.65, yf:0.236 },
        { pos:"Blindside Flanker", xf:0.18, yf:0.402 },
        { pos:"Number 8",      xf:0.50, yf:0.402 },
        { pos:"Openside Flanker", xf:0.82, yf:0.402 },
        { pos:"Scrum-half",    xf:0.34, yf:0.568 },
        { pos:"Fly-half",      xf:0.66, yf:0.568 },
        { pos:"Left Wing",     xf:0.166, yf:0.817 },
        { pos:"Inside Centre", xf:0.36, yf:0.734 },
        { pos:"Outside Centre",xf:0.64, yf:0.734 },
        { pos:"Right Wing",    xf:0.834, yf:0.817 },
        { pos:"Fullback",      xf:0.50, yf:0.90 },
    ];

    const r = 36;

    nodes.forEach(n => {
        const x = left + w * n.xf;
        const y = top  + h * n.yf;
        const p = userTeam[n.pos];

        // How much horizontal room this node actually has before its text
        // would run off the pitch box's own edge (with a margin either side).
        const distToEdge = Math.min(x - left, (left + w) - x);
        const maxTextWidth = Math.max(100, distToEdge * 2 - 30);

        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI*2);
        ctx.fillStyle = "rgba(197,160,89,0.15)";
        ctx.fill();
        ctx.strokeStyle = gold;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Rating number inside the circle (in place of the shirt number)
        ctx.fillStyle = gold;
        ctx.font = "bold 26px Arial";
        ctx.textAlign = "center";
        ctx.fillText(p ? String(p.score) : "—", x, y + 9);

        // Player name beneath the circle — auto-shrinks to fit on one line
        // rather than truncating, so the full name is always readable.
        ctx.fillStyle = "#f3f4f6";
        const name = p ? p.name : "";
        fitCanvasTextOneLine(ctx, name, maxTextWidth, 18, 12);
        ctx.fillText(name, x, y + r + 20);

        // Nation and year beneath the name
        ctx.fillStyle = "#9ca39c";
        const nation = p ? p.nation : "";
        fitCanvasTextOneLine(ctx, nation, maxTextWidth, 15, 11);
        ctx.fillText(nation, x, y + r + 36);
    });
}

// Shrinks ctx.font (Arial, bold) down from a starting size until the given
// text fits within maxWidth on a single line, never going below minSize.
// Leaves ctx.font set to the resulting size as a side effect.
function fitCanvasTextOneLine(ctx, text, maxWidth, startSize, minSize) {
    let size = startSize;
    ctx.font = "bold " + size + "px Arial";
    while (size > minSize && ctx.measureText(text).width > maxWidth) {
        size -= 1;
        ctx.font = "bold " + size + "px Arial";
    }
}

function truncateCanvasText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + "…").width > maxWidth) {
        t = t.slice(0, -1);
    }
    return t + "…";
}

// Mobile (iOS Safari / Android Chrome): opens the native share sheet with the
// image attached, so the user can pick WhatsApp, Messages, Instagram, etc.
// Desktop / unsupported browsers: falls back to a normal file download.
function shareOrDownloadCanvas(canvas) {
    canvas.toBlob(async blob => {
        if (canUseNativeShare()) {
            const file = new File([blob], "my-hybrid-xv.png", { type: "image/png" });
            try {
                await navigator.share({
                    files: [file],
                    title: "My Rugby Hybrid XV",
                    text: lastResultHeadline || "Check out my Rugby Hybrid XV!"
                });
                return;
            } catch (err) {
                // User cancelled the share sheet, or it failed — fall through to download
                if (err && err.name === "AbortError") return;
            }
        }

        // Desktop fallback — straightforward download
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "my-hybrid-xv.png";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(" ");
    let line = "";
    let lines = [];
    words.forEach(word => {
        const test = line ? line + " " + word : word;
        if (ctx.measureText(test).width > maxWidth && line) {
            lines.push(line);
            line = word;
        } else {
            line = test;
        }
    });
    if (line) lines.push(line);
    const startY = y - (lines.length - 1) * lineHeight / 2;
    lines.forEach((l, i) => ctx.fillText(l, x, startY + i * lineHeight));
}

function getUserRating() {
    let fS=0, fC=0, bS=0, bC=0;
    for (let p in userTeam) {
        const v = userTeam[p].score;
        if (forwardNodes.includes(p)) { fS+=v; fC++; }
        else if (backNodes.includes(p)) { bS+=v; bC++; }
    }
    if (!fC || !bC) {
        // Fallback for an incomplete team — shouldn't happen once the
        // tournament has kicked off, but keeps this safe if ever called early.
        let s=0, c=0;
        for (let p in userTeam) { s+=userTeam[p].score; c++; }
        return c>0 ? Math.round(s/c) : 80;
    }
    const fwdWeight = strategyForwardWeight(teamStrategyWeight);
    return Math.round((fS/fC)*fwdWeight + (bS/bC)*(1-fwdWeight));
}

// Team Strategy slider: 0 = max Forwards Dominant, 50 = Balanced (an even
// 50/50 blend of the forwards and backs averages), 100 = max Backs Dominant.
// Capped at a 75/25 skew at each extreme so a stacked pack (or backline)
// can never fully out-rate a genuinely balanced XV.
function strategyForwardWeight(sliderValue) {
    return 0.75 - (sliderValue / 100) * 0.50;
}

// Analytical win probability derived from the simulateMatch distribution
function winProbability(userR, oppR) {
    // Matches the actual outcome distribution of simulateMatch() below —
    // close gaps stay genuinely uncertain, but once the gap passes ~12
    // points the better side wins essentially every time (the model
    // doesn't let variance erase a real quality gap at that range).
    const diff = userR - oppR;
    const absd = Math.abs(diff);
    const sign = diff >= 0 ? 1 : -1;

    let winPct;
    if (absd <= 12) {
        // Smooth S-curve through the empirical 0/±4/±8/±12 sample points
        winPct = 50 + sign * (absd * 6.2 + (absd*absd) * 0.05);
    } else {
        winPct = sign > 0 ? 100 : 0;
    }

    const prob = Math.round(winPct);
    // Cosmetic floor/ceiling only — keeps the odds text from ever claiming
    // total certainty, even though genuine blowout matchups round to 0/100.
    return Math.min(99, Math.max(1, prob));
}

function oddsText(prob) {
    if (prob >= 90) return "Your team are overwhelming favourites.";
    if (prob >= 78) return "Your team are strong favourites.";
    if (prob >= 65) return "Your team are slight favourites.";
    if (prob >= 47) return "This is too close to call.";
    if (prob >= 35) return "Your team are slight underdogs.";
    if (prob >= 22) return "Your team are significant underdogs.";
    return "Your team are heavy underdogs.";
}

// ============================================================
// OPPOSITION LINEUPS — best 2023 player per position, per nation
// ============================================================
function getOppositionLineup(nationName) {
    if (!allSquads[nationName] || !allSquads[nationName][selectedTournamentYear]) return null;
    const squad = allSquads[nationName][selectedTournamentYear];

    const lineup = {};
    const usedNames = new Set();

    const nodeOrder = [
        "Hooker","Loosehead Prop","Tighthead Prop",
        "Lock 4","Lock 5",
        "Blindside Flanker","Openside Flanker","Number 8",
        "Scrum-half","Fly-half",
        "Left Wing","Right Wing","Inside Centre","Outside Centre","Fullback"
    ];
    const nodeToDataPos = {
        "Hooker": ["Hooker"], "Loosehead Prop": ["Loosehead Prop"], "Tighthead Prop": ["Tighthead Prop"],
        "Lock 4": ["Lock"], "Lock 5": ["Lock"],
        "Blindside Flanker": ["Blindside Flanker"], "Openside Flanker": ["Openside Flanker"], "Number 8": ["Number 8"],
        "Scrum-half": ["Scrum-half"], "Fly-half": ["Fly-half"],
        "Left Wing": ["Left Wing"], "Right Wing": ["Right Wing"],
        "Inside Centre": ["Inside Centre"], "Outside Centre": ["Outside Centre"], "Fullback": ["Fullback"],
    };

    nodeOrder.forEach(node => {
        const wantedPositions = nodeToDataPos[node];

        // Pass 1: only consider players whose PRIMARY position (positions[0])
        // matches this node — primary-position players always take priority
        // over secondary-position players, regardless of rating.
        let best = null;
        squad.forEach(p => {
            if (usedNames.has(p.name)) return;
            const primaryMatches = wantedPositions.includes(p.positions[0]);
            if (!primaryMatches) return;
            if (!best || p.rating > best.rating) best = p;
        });

        // Pass 2: no primary-position candidate found — fall back to anyone
        // who lists this position anywhere in their positions array.
        if (!best) {
            squad.forEach(p => {
                if (usedNames.has(p.name)) return;
                const matches = p.positions.some(pos => wantedPositions.includes(pos));
                if (!matches) return;
                if (!best || p.rating > best.rating) best = p;
            });
        }

        if (best) {
            lineup[node] = { name: best.name, score: best.rating };
            usedNames.add(best.name);
        }
    });

    // Fill any gaps with the next-best unused player overall
    nodeOrder.forEach(node => {
        if (lineup[node]) return;
        let best = null;
        squad.forEach(p => {
            if (usedNames.has(p.name)) return;
            if (!best || p.rating > best.rating) best = p;
        });
        if (best) {
            lineup[node] = { name: best.name, score: best.rating };
            usedNames.add(best.name);
        }
    });

    return lineup;
}

// ============================================================
// SCORE BREAKDOWN — tries, conversions, penalties, scorers
// ============================================================
const TRY_WEIGHTS = {
    "Left Wing": 16.67, "Right Wing": 16.67,
    "Inside Centre": 10.19, "Outside Centre": 10.19,
    "Fullback": 10.19,
    "Number 8": 6.48,
    "Scrum-half": 5.56,
    "Hooker": 4.63,
    "Blindside Flanker": 3.70, "Openside Flanker": 3.70,
    "Fly-half": 4.63,
    "Lock 4": 1.85, "Lock 5": 1.85,
    "Loosehead Prop": 1.85, "Tighthead Prop": 1.85,
};

function decideKicker(team) {
    // Find all players in the XV flagged as specialist kickers. If more
    // than one was drafted, pick the highest-rated — roughly approximating
    // who takes the goal-kicking duties when, e.g., both a fly-half and
    // fullback in the XV are known kickers.
    const flaggedKickers = Object.entries(team)
        .filter(([, p]) => p && p.kicker)
        .map(([pos, p]) => ({ pos, name: p.name, score: p.score }));

    if (flaggedKickers.length > 0) {
        flaggedKickers.sort((a, b) => b.score - a.score);
        return { pos: flaggedKickers[0].pos, name: flaggedKickers[0].name };
    }

    // No specialist kicker drafted — fall back to whoever is playing
    // fly-half or fullback, preferring fly-half unless the fullback is
    // rated noticeably higher (same logic as before).
    const fh = team["Fly-half"];
    const fb = team["Fullback"];
    if (!fh && !fb) return null;
    if (!fh) return { pos: "Fullback", name: fb.name };
    if (!fb) return { pos: "Fly-half", name: fh.name };
    return (fb.score - fh.score >= 5)
        ? { pos: "Fullback", name: fb.name }
        : { pos: "Fly-half", name: fh.name };
}

function pickWeightedScorer(team) {
    const entries = Object.keys(team)
        .filter(pos => team[pos] && TRY_WEIGHTS[pos])
        .map(pos => ({ pos, name: team[pos].name, weight: TRY_WEIGHTS[pos] }));
    if (!entries.length) return null;
    const total = entries.reduce((s,e) => s+e.weight, 0);
    let r = Math.random() * total;
    for (const e of entries) {
        if (r < e.weight) return e;
        r -= e.weight;
    }
    return entries[entries.length-1];
}

function buildScoreBreakdown(finalScore, team) {
    const kicker = decideKicker(team);
    let remaining = finalScore;
    const tryScorers = {};
    let tries = 0, conversions = 0, penalties = 0;

    const maxTries = Math.max(1, Math.floor(finalScore / 6));
    while (remaining >= 5 && tries < maxTries) {
        const canConvert = remaining - 7 >= 0;
        if (canConvert && Math.random() < 0.78) {
            remaining -= 7; tries++; conversions++;
        } else {
            remaining -= 5; tries++;
        }
        const scorer = pickWeightedScorer(team);
        if (scorer) {
            tryScorers[scorer.name] = (tryScorers[scorer.name] || 0) + 1;
        }
    }
    while (remaining >= 3) { remaining -= 3; penalties++; }
    if (remaining === 2 && conversions === 0 && tries > 0) { conversions++; remaining -= 2; }

    const tryList = Object.entries(tryScorers).map(([name,count]) => ({ name, count }));
    return { tries: tryList, tryCount: tries, conversions, penalties, kicker };
}

function renderScoreBreakdown(userTeamObj, userScore, oppScore, oppLineup) {
    const userBD = buildScoreBreakdown(userScore, userTeamObj);
    const oppBD  = oppLineup ? buildScoreBreakdown(oppScore, oppLineup) : null;

    // Accumulate individual scoring stats across the tournament for the
    // end-of-run results summary (top points scorer / top try scorer).
    userBD.tries.forEach(t => {
        const p = getPlayerStat(t.name);
        p.tries += t.count;
        p.points += t.count * 5;
    });
    if (userBD.kicker && userBD.conversions) {
        const p = getPlayerStat(userBD.kicker.name);
        p.points += userBD.conversions * 2;
    }
    if (userBD.kicker && userBD.penalties) {
        const p = getPlayerStat(userBD.kicker.name);
        p.points += userBD.penalties * 3;
    }

    const fmtTries = (bd) => bd.tries.length
        ? bd.tries.map(t => t.count > 1 ? (t.name + " x" + t.count) : t.name).join(", ")
        : "—";

    const userLines = [];
    userLines.push("T: " + fmtTries(userBD));
    if (userBD.conversions) userLines.push("C: " + (userBD.kicker ? userBD.kicker.name : "—") + " x" + userBD.conversions);
    if (userBD.penalties)   userLines.push("P: " + (userBD.kicker ? userBD.kicker.name : "—") + " x" + userBD.penalties);

    const oppLines = [];
    if (oppBD) {
        oppLines.push("T: " + fmtTries(oppBD));
        if (oppBD.conversions) oppLines.push("C: " + (oppBD.kicker ? oppBD.kicker.name : "—") + " x" + oppBD.conversions);
        if (oppBD.penalties)   oppLines.push("P: " + (oppBD.kicker ? oppBD.kicker.name : "—") + " x" + oppBD.penalties);
    }
    return { userLines, oppLines };
}

// Renders the try/conversion/penalty breakdown for both teams as a genuine
// two-column block (not padded text) so it stays aligned regardless of
// font or container width.
async function addScoreBreakdownLog(userTeamObj, userScore, oppNationName, oppScore) {
    const oppLineup = getOppositionLineup(oppNationName);
    const bd = renderScoreBreakdown(userTeamObj, userScore, oppScore, oppLineup);
    await addScoreBreakdownBlock(bd);
}

// Same as addScoreBreakdownLog but takes a ready-made lineup object directly
// (used for boss-stage matches, which already have a hand-built opponent lineup)
async function addScoreBreakdownLogForBoss(userTeamObj, userScore, oppLineup, oppScore) {
    const bd = renderScoreBreakdown(userTeamObj, userScore, oppScore, oppLineup);
    await addScoreBreakdownBlock(bd);
}

// Builds and inserts a two-column scorers block: "Your XV" on the left,
// the opposition on the right, T/C/P rows stacked underneath each.
async function addScoreBreakdownBlock(bd) {
    const wrap = document.createElement("div");
    wrap.className = "sim-log-line score-breakdown";

    const colLeft  = document.createElement("div");
    colLeft.className = "score-col score-col-left";
    bd.userLines.forEach(line => {
        const row = document.createElement("div");
        row.className = "score-row";
        row.textContent = line;
        colLeft.appendChild(row);
    });

    const colRight = document.createElement("div");
    colRight.className = "score-col score-col-right";
    bd.oppLines.forEach(line => {
        const row = document.createElement("div");
        row.className = "score-row";
        row.textContent = line;
        colRight.appendChild(row);
    });

    wrap.appendChild(colLeft);
    wrap.appendChild(colRight);
    simResults.appendChild(wrap);
    simResults.scrollTop = simResults.scrollHeight;
    await delay(900 * simSpeedMultiplier);
}

// Inserts an arbitrary HTML block into the sim log with the same
// speed-scaled pacing as addLog — used by the end-of-run results summary.
async function addLogBlock(html) {
    const wrap = document.createElement("div");
    wrap.className = "sim-log-line";
    wrap.innerHTML = html;
    simResults.appendChild(wrap);
    simResults.scrollTop = simResults.scrollHeight;
    await delay(900 * simSpeedMultiplier);
}

// Builds the HTML for a full pool standings table: P W D L PF PA Pts,
// with the user's row highlighted.
function buildStandingsTableHtml(table) {
    let html = '<table class="standings-table"><thead><tr>' +
        '<th class="st-pos">#</th><th class="st-team">Team</th>' +
        '<th>P</th><th>W</th><th>D</th><th>L</th>' +
        '<th>PF</th><th>PA</th><th>Pts</th>' +
        '</tr></thead><tbody>';
    table.forEach((r, i) => {
        const isUser = r.name === "Your XV";
        html += '<tr class="' + (isUser ? "st-user-row" : "") + '">' +
            '<td class="st-pos">' + (i+1) + '</td>' +
            '<td class="st-team">' + r.name + '</td>' +
            '<td>' + r.p + '</td><td>' + r.w + '</td><td>' + r.d + '</td><td>' + r.l + '</td>' +
            '<td>' + r.pf + '</td><td>' + r.pa + '</td>' +
            '<td class="st-pts">' + r.pts + '</td>' +
            '</tr>';
    });
    html += '</tbody></table>';
    return html;
}

function simulateMatch(userR, oppR) {
    const diff = userR - oppR;
    const absd = Math.abs(diff);
    const sign = diff >= 0 ? 1 : -1;
    const base = 22; // symmetric baseline when teams are evenly matched

    let userBase, oppBase;
    if (absd <= 15) {
        // Close/competitive range — genuine Test-match rugby, outcome
        // is never a foregone conclusion within this gap.
        userBase = base + sign * absd * 0.75;
        oppBase  = base - sign * absd * 0.75;
    } else {
        // Beyond a 15-point gap, scoring accelerates sharply for the
        // stronger side while the weaker side's scoring keeps shrinking —
        // this is what produces genuine RWC-style blowouts (e.g. 80-140
        // point routs of the lowest-tier nations) rather than everything
        // converging on a generic "favourite wins by a bit" scoreline.
        const extra = absd - 15;
        const blowout = extra * 1.9 + Math.pow(extra, 1.7) * 0.04;
        const winnerBase = base + 15*0.75 + blowout;
        const loserBase  = Math.max(3, base - 15*0.75 - extra*0.3);
        if (sign > 0) { userBase = winnerBase; oppBase = loserBase; }
        else          { userBase = loserBase;  oppBase = winnerBase; }
    }

    // Variance shrinks as the gap widens — close games stay unpredictable,
    // but a genuine mismatch can no longer be erased by random noise alone.
    let varRange;
    if (absd <= 10) varRange = 10;
    else if (absd <= 20) varRange = 8;
    else if (absd <= 30) varRange = 6;
    else varRange = 5;

    const v = () => Math.floor(Math.random()*(varRange*2+1)) - varRange;
    let uS = Math.max(3, Math.round(userBase + v()));
    let oS = Math.max(3, Math.round(oppBase + v()));
    if (uS === oS) uS += (Math.random() < 0.5 ? 3 : -3);
    uS = Math.max(3, uS);

    const won = uS > oS;
    const margin = Math.abs(uS-oS);
    // bonus point: 4+ tries approximated as margin > 21; losing bonus: margin <=7
    const pts = won ? (margin>21 ? 5 : 4) : (margin<=7 ? 1 : 0);
    return { userScore:uS, oppScore:oS, won, margin, pts };
}

function delay(ms) { return new Promise(r => setTimeout(r,ms)); }

async function addLog(msg, colour) {
    const line = document.createElement("div");
    line.className = "sim-log-line";
    if (colour) line.style.color = colour;
    line.textContent = msg;
    simResults.appendChild(line);
    simResults.scrollTop = simResults.scrollHeight;
    await delay(900 * simSpeedMultiplier);
}

async function runTournamentSimulation() {
    const userR = getUserRating();
    const pool = getPoolFor(replacedTeam);
    const poolTeams = activePoolStandings[pool].filter(t => t !== replacedTeam);

    await addLog("=== POOL STAGE — Pool " + pool + " ===", "var(--brand-gold)");
    await addLog("Your Hybrid XV (avg: " + userR + ") replaces " + replacedTeam, null);
    await addLog("", null);
    matchHistory = [];
    playerStats = {};

    // Full record tracking for every team in the pool: played, win, draw,
    // loss, points for, points against, and competition points.
    const record = name => ({ name, p:0, w:0, d:0, l:0, pf:0, pa:0, pts:0 });
    const records = { "Your XV": record("Your XV") };
    poolTeams.forEach(t => { records[t] = record(t); });

    function applyResult(nameA, scoreA, nameB, scoreB, ptsA, ptsB) {
        const a = records[nameA], b = records[nameB];
        a.p++; b.p++;
        a.pf += scoreA; a.pa += scoreB;
        b.pf += scoreB; b.pa += scoreA;
        a.pts += ptsA; b.pts += ptsB;
        if (scoreA > scoreB) { a.w++; b.l++; }
        else if (scoreA < scoreB) { b.w++; a.l++; }
        else { a.d++; b.d++; }
    }

    // ── Run user's pool matches ──
    for (const opp of poolTeams) {
        const res = simulateMatch(userR, activeTeamStrengths[opp] || 72);
        const icon = res.won ? "WIN " : "LOSS";
        const colour = res.won ? "#4ade80" : "#f87171";
        await addLog(icon + "  vs " + opp + "  " + res.userScore + "-" + res.oppScore + "  (" + (res.pts>0?"+":"") + res.pts + " pts)", colour);
        await addScoreBreakdownLog(userTeam, res.userScore, opp, res.oppScore);
        matchHistory.push({ stage:"Pool", opponent:opp, userScore:res.userScore, oppScore:res.oppScore, won:res.won });

        const oppPts = res.won ? (res.margin<=7?1:0) : (res.margin>21?5:4);
        applyResult("Your XV", res.userScore, opp, res.oppScore, res.pts, oppPts);
    }

    // ── Simulate other pool matches ──
    for (let i = 0; i < poolTeams.length; i++) {
        for (let j = i+1; j < poolTeams.length; j++) {
            const t1 = poolTeams[i], t2 = poolTeams[j];
            const res = simulateMatch(activeTeamStrengths[t1]||72, activeTeamStrengths[t2]||72);
            const ptsT1 = res.won ? (res.margin>21?5:4) : (res.margin<=7?1:0);
            const ptsT2 = res.won ? (res.margin<=7?1:0) : (res.margin>21?5:4);
            applyResult(t1, res.userScore, t2, res.oppScore, ptsT1, ptsT2);
        }
    }

    // ── Pool standings (full table: P W D L PF PA Pts) ──
    await addLog("", null);
    await addLog("--- Pool " + pool + " Standings ---", "var(--brand-gold)");
    const table = Object.values(records);

    // Historical accuracy override: the real 2015 Pool A ("Pool of Death")
    // saw England fail to escape their own home World Cup, with Australia
    // and Wales taking the top two places. When the user's replacement
    // doesn't touch any of these three teams, the standings should reflect
    // what actually happened rather than a freshly-simulated (and likely
    // different) outcome — England always finishes below both Australia
    // and Wales, who are otherwise free to land in either order between
    // themselves based on their simulated result.
    const isHistorical2015PoolA = selectedTournamentYear === "2015" && pool === "A" &&
        ["England", "Australia", "Wales"].every(t => records[t]);

    table.sort((a, b) => {
        if (isHistorical2015PoolA) {
            const aIsEngland = a.name === "England", bIsEngland = b.name === "England";
            const aIsAusWal = a.name === "Australia" || a.name === "Wales";
            const bIsAusWal = b.name === "Australia" || b.name === "Wales";
            if (aIsEngland && bIsAusWal) return 1;  // England always sorts below Australia/Wales
            if (bIsEngland && aIsAusWal) return -1;
        }
        return (b.pts - a.pts) || ((b.pf - b.pa) - (a.pf - a.pa));
    });

    await addLogBlock(buildStandingsTableHtml(table));

    const rank = table.findIndex(r => r.name === "Your XV");
    if (rank > 1) {
        await addLog("", null);
        await addLog("ELIMINATED — Your Hybrid XV did not qualify from Pool " + pool + ".", "#ef4444");
        await showResultsSummary();
        showShareButton("Eliminated at the Pool Stage", "#f87171");
        restartBtn.classList.remove("hidden"); return;
    }

    const qualified = rank === 0 ? "1st" : "2nd";
    await addLog("", null);
    await addLog("QUALIFIED — " + qualified + " in Pool " + pool, "#4ade80");

    // ── Simulate ALL pools to get real pool standings ──
    // Then build a bracket from the actual finishes
    const allStandings = simulateAllPools();
    // Overwrite user's pool with the real results from above
    const userPoolOrder = table.map(r => r.name === "Your XV" ? replacedTeam : r.name);
    allStandings[pool] = userPoolOrder;

    // 2023 QF bracket: A1vD2, B1vC2, C1vB2, D1vA2
    // SF1: winner(A1vD2) v winner(B1vC2)
    // SF2: winner(C1vB2) v winner(D1vA2)
    const qfPairings = [
        { id:0, home: allStandings.A[0], away: allStandings.D[1], sf: "SF1" },
        { id:1, home: allStandings.B[0], away: allStandings.C[1], sf: "SF1" },
        { id:2, home: allStandings.C[0], away: allStandings.B[1], sf: "SF2" },
        { id:3, home: allStandings.D[0], away: allStandings.A[1], sf: "SF2" },
    ];

    // Find which QF the user is in
    const userQF = qfPairings.find(qf => qf.home === replacedTeam || qf.away === replacedTeam);
    const qfOpp = userQF.home === replacedTeam ? userQF.away : userQF.home;
    const userSF = userQF.sf;

    // Small knockout boost — crowd factor / tournament momentum for the user's team
    const koBoost = 3;
    const effectiveR = userR + koBoost;

    // ── Quarter-final ──
    await addLog("", null);
    await addLog("=== QUARTER-FINAL vs " + qfOpp + " ===", "var(--brand-gold)");
    const qfOppR = activeTeamStrengths[qfOpp]||80;
    const qfProb = winProbability(effectiveR, qfOppR);
    await addLog(oddsText(qfProb), "var(--text-muted)");
    await addLog(qfProb + "% chance of winning", "var(--text-muted)");
    const qf = simulateMatch(effectiveR, qfOppR);
    await addLog((qf.won?"WIN ":"LOSS") + "  " + qf.userScore + "-" + qf.oppScore, qf.won?"#4ade80":"#f87171");
    matchHistory.push({ stage:"QF", opponent:qfOpp, userScore:qf.userScore, oppScore:qf.oppScore, won:qf.won });
    await addScoreBreakdownLog(userTeam, qf.userScore, qfOpp, qf.oppScore);
    if (!qf.won) {
        await addLog("KNOCKED OUT at the quarter-final stage.", "#ef4444");
        await showResultsSummary();
        showShareButton("Knocked Out — Quarter-Final", "#f87171");
        restartBtn.classList.remove("hidden"); return;
    }

    // Simulate the other QF in the same semi bracket → SF opponent
    const otherQFSameSide = qfPairings.find(qf2 => qf2.sf === userSF && qf2.id !== userQF.id);
    const oqRes = simulateMatch(activeTeamStrengths[otherQFSameSide.home]||80, activeTeamStrengths[otherQFSameSide.away]||80);
    const sfOpp = oqRes.won ? otherQFSameSide.home : otherQFSameSide.away;

    // Simulate both QFs on the other side → final opponent and 3rd place opponent
    const otherSideQFs = qfPairings.filter(qf2 => qf2.sf !== userSF);
    const os0Res = simulateMatch(activeTeamStrengths[otherSideQFs[0].home]||80, activeTeamStrengths[otherSideQFs[0].away]||80);
    const os1Res = simulateMatch(activeTeamStrengths[otherSideQFs[1].home]||80, activeTeamStrengths[otherSideQFs[1].away]||80);
    const otherSF_A = os0Res.won ? otherSideQFs[0].home : otherSideQFs[0].away;
    const otherSF_B = os1Res.won ? otherSideQFs[1].home : otherSideQFs[1].away;
    const otherSFRes = simulateMatch(activeTeamStrengths[otherSF_A]||86, activeTeamStrengths[otherSF_B]||86);
    const finOpp  = otherSFRes.won ? otherSF_A : otherSF_B;
    const tpOpp   = otherSFRes.won ? otherSF_B : otherSF_A;

    // ── Semi-final ──
    await addLog("", null);
    await addLog("=== SEMI-FINAL vs " + sfOpp + " ===", "var(--brand-gold)");
    const sfOppR = activeTeamStrengths[sfOpp]||86;
    const sfProb = winProbability(effectiveR, sfOppR);
    await addLog(oddsText(sfProb), "var(--text-muted)");
    await addLog(sfProb + "% chance of winning", "var(--text-muted)");
    const sf = simulateMatch(effectiveR, sfOppR);
    await addLog((sf.won?"WIN ":"LOSS") + "  " + sf.userScore + "-" + sf.oppScore, sf.won?"#4ade80":"#f87171");
    matchHistory.push({ stage:"SF", opponent:sfOpp, userScore:sf.userScore, oppScore:sf.oppScore, won:sf.won });
    await addScoreBreakdownLog(userTeam, sf.userScore, sfOpp, sf.oppScore);

    if (!sf.won) {
        await addLog("", null);
        await addLog("=== THIRD-PLACE PLAY-OFF vs " + tpOpp + " ===", "var(--brand-gold)");
        const tpOppR = activeTeamStrengths[tpOpp]||84;
        const tpProb = winProbability(effectiveR, tpOppR);
        await addLog(oddsText(tpProb), "var(--text-muted)");
        await addLog(tpProb + "% chance of winning", "var(--text-muted)");
        const tp = simulateMatch(effectiveR, tpOppR);
        await addLog((tp.won?"WIN ":"LOSS") + "  " + tp.userScore + "-" + tp.oppScore, tp.won?"#4ade80":"#f87171");
        matchHistory.push({ stage:"3rd Place", opponent:tpOpp, userScore:tp.userScore, oppScore:tp.oppScore, won:tp.won });
        await addScoreBreakdownLog(userTeam, tp.userScore, tpOpp, tp.oppScore);
        await addLog(tp.won ? ("BRONZE — 3rd place at the " + selectedTournamentYear + " Rugby World Cup!") : "4th place — agonisingly close.", tp.won?"#4ade80":"#c5a059");
        await showResultsSummary();
        showShareButton(tp.won ? "Bronze Medal — 3rd Place" : "4th Place Finish", tp.won?"#4ade80":"#c5a059");
        restartBtn.classList.remove("hidden"); return;
    }

    // ── Final ──
    await addLog("", null);
    await addLog("=== FINAL vs " + finOpp + " ===", "var(--brand-gold)");
    const finOppR = activeTeamStrengths[finOpp]||90;
    const finProb = winProbability(effectiveR, finOppR);
    await addLog(oddsText(finProb), "var(--text-muted)");
    await addLog(finProb + "% chance of winning", "var(--text-muted)");
    const fin = simulateMatch(effectiveR, finOppR);
    await addLog((fin.won?"WIN ":"LOSS") + "  " + fin.userScore + "-" + fin.oppScore, fin.won?"#4ade80":"#f87171");
    matchHistory.push({ stage:"Final", opponent:finOpp, userScore:fin.userScore, oppScore:fin.oppScore, won:fin.won });
    await addScoreBreakdownLog(userTeam, fin.userScore, finOpp, fin.oppScore);
    if (fin.won) {
        await addLog("WORLD CHAMPIONS! Your Hybrid XV wins the " + selectedTournamentYear + " Rugby World Cup!", "var(--brand-gold)");
        await addLog("", null);
        await addLog("But the challenge doesn't end here...", "var(--text-muted)");
        await addLog("Three legendary teams await. Do you dare face them?", "var(--text-muted)");
        await addLog("", null);
        await showResultsSummary();
        showShareButton("WORLD CHAMPIONS", "#c5a059");

        // Show boss challenge button — appended to sim-results (the terminal viewport)
        const bossBtn = document.createElement("button");
        bossBtn.textContent = "Accept the Ultimate Challenge";
        bossBtn.className = "btn-primary";
        bossBtn.style.cssText = "margin:12px 0;display:block;width:100%;padding:8px 14px;font-size:0.9rem;";
        document.getElementById("sim-results").appendChild(bossBtn);
        document.getElementById("sim-results").scrollTop = document.getElementById("sim-results").scrollHeight;

        bossBtn.addEventListener("click", async () => {
            bossBtn.remove();
            await runBossStage();
        }, { once: true });

        // Also show play again
        restartBtn.classList.remove("hidden");
    } else {
        await addLog("Runners-up. A magnificent campaign — one step short of glory.", "#c5a059");
        await showResultsSummary();
        showShareButton("Runners-Up — World Cup Final", "#c5a059");
        restartBtn.classList.remove("hidden");
    }
}

// ============================================================
// 1999 RUGBY WORLD CUP — unique structure: 5 pools of 4, 3/2/1 points
// (no bonus points), and a fixed knockout play-off round between the
// pool stage and the quarter-finals. Kept as its own function rather
// than threaded into runTournamentSimulation() with year checks, since
// the bracket shape and points system are both genuinely different,
// not just a data variation of the modern format.
// ============================================================
async function runTournamentSimulation1999() {
    const userR = getUserRating();
    const pool = getPoolFor(replacedTeam);
    const poolTeams = activePoolStandings[pool].filter(t => t !== replacedTeam);

    await addLog("=== POOL STAGE — Pool " + pool + " ===", "var(--brand-gold)");
    await addLog("Your Hybrid XV (avg: " + userR + ") replaces " + replacedTeam, null);
    await addLog("", null);
    matchHistory = [];
    playerStats = {};

    const record = name => ({ name, p:0, w:0, d:0, l:0, pf:0, pa:0, pts:0 });
    const records = { "Your XV": record("Your XV") };
    poolTeams.forEach(t => { records[t] = record(t); });

    // 1999's points system: 3 for a win, 2 for a draw, 1 just for playing
    // (and losing) — no try bonus, no losing bonus.
    function pts1999(won, drew) { return won ? 3 : drew ? 2 : 1; }

    function applyResult(nameA, scoreA, nameB, scoreB) {
        const a = records[nameA], b = records[nameB];
        a.p++; b.p++;
        a.pf += scoreA; a.pa += scoreB;
        b.pf += scoreB; b.pa += scoreA;
        const drew = scoreA === scoreB;
        if (scoreA > scoreB) { a.w++; b.l++; }
        else if (scoreA < scoreB) { b.w++; a.l++; }
        else { a.d++; b.d++; }
        a.pts += pts1999(scoreA > scoreB, drew);
        b.pts += pts1999(scoreB > scoreA, drew);
    }

    // ── User's pool matches ──
    for (const opp of poolTeams) {
        const res = simulateMatch(userR, activeTeamStrengths[opp] || 72);
        const icon = res.won ? "WIN " : "LOSS";
        const colour = res.won ? "#4ade80" : "#f87171";
        const userPts = pts1999(res.won, res.userScore === res.oppScore);
        await addLog(icon + "  vs " + opp + "  " + res.userScore + "-" + res.oppScore + "  (+" + userPts + " pts)", colour);
        await addScoreBreakdownLog(userTeam, res.userScore, opp, res.oppScore);
        matchHistory.push({ stage:"Pool", opponent:opp, userScore:res.userScore, oppScore:res.oppScore, won:res.won });
        applyResult("Your XV", res.userScore, opp, res.oppScore);
    }

    // ── Simulate other pool matches ──
    for (let i = 0; i < poolTeams.length; i++) {
        for (let j = i+1; j < poolTeams.length; j++) {
            const t1 = poolTeams[i], t2 = poolTeams[j];
            const res = simulateMatch(activeTeamStrengths[t1]||72, activeTeamStrengths[t2]||72);
            applyResult(t1, res.userScore, t2, res.oppScore);
        }
    }

    // ── Pool standings ──
    await addLog("", null);
    await addLog("--- Pool " + pool + " Standings ---", "var(--brand-gold)");
    const table = Object.values(records);
    table.sort((a, b) => (b.pts - a.pts) || ((b.pf - b.pa) - (a.pf - a.pa)));
    await addLogBlock(buildStandingsTableHtml(table));

    const rank = table.findIndex(r => r.name === "Your XV");
    if (rank > 1) {
        await addLog("", null);
        await addLog("ELIMINATED — Your Hybrid XV did not qualify from Pool " + pool + ".", "#ef4444");
        await showResultsSummary();
        showShareButton("Eliminated at the Pool Stage", "#f87171");
        restartBtn.classList.remove("hidden"); return;
    }

    const qualified = rank === 0 ? "1st" : "2nd";
    await addLog("", null);
    await addLog((rank === 0 ? "QUALIFIED DIRECTLY TO THE QUARTER-FINALS — " : "QUALIFIED FOR THE PLAY-OFF ROUND — ") + qualified + " in Pool " + pool, "#4ade80");

    // ── Simulate every other pool in full, with proper 1999 records,
    // so we know the real standings (needed for the play-off pairings
    // and to determine the best third-placed team across all 5 pools) ──
    const allPoolRecords = {};
    for (const [p, teams] of Object.entries(activePoolStandings)) {
        const poolRecords = {};
        teams.forEach(t => { poolRecords[t] = record(t); });
        // If the user's actual pool is this one, splice in their real
        // simulated results instead of re-simulating from scratch.
        if (p === pool) {
            teams.forEach(t => {
                const key = (t === replacedTeam) ? "Your XV" : t;
                if (records[key]) poolRecords[t] = { ...records[key], name: t };
            });
        } else {
            for (let i = 0; i < teams.length; i++) {
                for (let j = i+1; j < teams.length; j++) {
                    const t1 = teams[i], t2 = teams[j];
                    const res = simulateMatch(activeTeamStrengths[t1]||72, activeTeamStrengths[t2]||72);
                    const a = poolRecords[t1], b = poolRecords[t2];
                    a.p++; b.p++;
                    a.pf += res.userScore; a.pa += res.oppScore;
                    b.pf += res.oppScore; b.pa += res.userScore;
                    const drew = res.userScore === res.oppScore;
                    if (res.userScore > res.oppScore) { a.w++; b.l++; } else if (res.userScore < res.oppScore) { b.w++; a.l++; } else { a.d++; b.d++; }
                    a.pts += pts1999(res.userScore > res.oppScore, drew);
                    b.pts += pts1999(res.oppScore > res.userScore, drew);
                }
            }
        }
        allPoolRecords[p] = Object.values(poolRecords).sort((a,b) => (b.pts-a.pts) || ((b.pf-b.pa)-(a.pf-a.pa)));
    }

    // Map of pool -> [1st, 2nd, 3rd, 4th] team names (user's real name
    // substituted back in if they were in this pool)
    const finishers = {};
    for (const [p, sorted] of Object.entries(allPoolRecords)) {
        finishers[p] = sorted.map(r => r.name === "Your XV" ? replacedTeam : r.name);
    }

    // Best third-placed team across all 5 pools, by the same points/PD criteria
    const thirdPlaceTeams = Object.entries(allPoolRecords).map(([p, sorted]) => ({ pool:p, ...sorted[2] }));
    thirdPlaceTeams.sort((a,b) => (b.pts-a.pts) || ((b.pf-b.pa)-(a.pf-a.pa)));
    const bestThird = thirdPlaceTeams[0];
    const bestThirdName = bestThird.name === "Your XV" ? replacedTeam : bestThird.name;

    // ── Determine the user's play-off fixture (if they finished 2nd) or
    // their automatic QF slot (if they finished 1st) ──
    const userFinishedFirst = rank === 0;
    const userIsBestThird = rank === 2 && bestThird.pool === pool && bestThirdName === replacedTeam;

    if (rank === 2 && !userIsBestThird) {
        // Finished third but isn't the best third-placed side overall — tournament over.
        await addLog("", null);
        await addLog("ELIMINATED — Your Hybrid XV finished 3rd in Pool " + pool + " and was not the best third-placed side.", "#ef4444");
        await showResultsSummary();
        showShareButton("Eliminated at the Pool Stage", "#f87171");
        restartBtn.classList.remove("hidden"); return;
    }
    if (rank === 3) {
        await addLog("", null);
        await addLog("ELIMINATED — Your Hybrid XV finished bottom of Pool " + pool + ".", "#ef4444");
        await showResultsSummary();
        showShareButton("Eliminated at the Pool Stage", "#f87171");
        restartBtn.classList.remove("hidden"); return;
    }

    // Resolve a bracket slot name (e.g. "poolA_2nd", "best3rd") to an actual team
    function resolveSlot(slot) {
        if (slot === "best3rd") return bestThirdName;
        const m = slot.match(/^pool([A-E])_(1st|2nd)$/);
        if (m) return finishers[m[1]][m[2] === "1st" ? 0 : 1];
        return null;
    }

    const koBoost = 3;
    const effectiveR = userR + koBoost;
    const playoffWinners = {}; // keyed by match label (F, G, H) -> winning team name

    if (!userFinishedFirst) {
        // ── User plays in the knockout play-off round ──
        const userPlayoff = bracket1999.playoffs.find(po => {
            const a = resolveSlot(po.slotA), b = resolveSlot(po.slotB);
            return a === replacedTeam || b === replacedTeam;
        });
        const oppSlot = resolveSlot(userPlayoff.slotA) === replacedTeam ? userPlayoff.slotB : userPlayoff.slotA;
        const poOpp = resolveSlot(oppSlot);

        await addLog("", null);
        await addLog("=== QUARTER-FINAL PLAY-OFF (" + userPlayoff.label + ") vs " + poOpp + " ===", "var(--brand-gold)");
        await addLog("Lose this and the tournament is over.", "var(--text-muted)");
        const poOppR = activeTeamStrengths[poOpp] || 75;
        const poProb = winProbability(userR, poOppR);
        await addLog(oddsText(poProb), "var(--text-muted)");
        await addLog(poProb + "% chance of winning", "var(--text-muted)");
        const po = simulateMatch(userR, poOppR);
        await addLog((po.won?"WIN ":"LOSS") + "  " + po.userScore + "-" + po.oppScore, po.won?"#4ade80":"#f87171");
        matchHistory.push({ stage:"Play-off", opponent:poOpp, userScore:po.userScore, oppScore:po.oppScore, won:po.won });
        await addScoreBreakdownLog(userTeam, po.userScore, poOpp, po.oppScore);

        if (!po.won) {
            await addLog("", null);
            await addLog("ELIMINATED at the quarter-final play-off stage.", "#ef4444");
            await showResultsSummary();
            showShareButton("Eliminated — QF Play-off", "#f87171");
            restartBtn.classList.remove("hidden"); return;
        }
        playoffWinners[userPlayoff.label.replace("Match ", "")] = replacedTeam;
    }

    // Simulate the other two playoff matches (the user isn't in)
    for (const po of bracket1999.playoffs) {
        const key = po.label.replace("Match ", "");
        if (playoffWinners[key]) continue; // user already resolved this one
        const a = resolveSlot(po.slotA), b = resolveSlot(po.slotB);
        const res = simulateMatch(activeTeamStrengths[a]||75, activeTeamStrengths[b]||75);
        playoffWinners[key] = res.won ? a : b;
    }

    function resolveQfSlot(slot) {
        if (slot.startsWith("playoff")) return playoffWinners[slot.replace("playoff","").replace("_winner","")];
        return resolveSlot(slot);
    }

    // ── Quarter-final (fixed bracket) ──
    const userQF = bracket1999.quarterFinals.find(qf => {
        const a = resolveQfSlot(qf.slotA), b = resolveQfSlot(qf.slotB);
        return a === replacedTeam || b === replacedTeam;
    });
    const qfOppSlot = resolveQfSlot(userQF.slotA) === replacedTeam ? userQF.slotB : userQF.slotA;
    const qfOpp = resolveQfSlot(qfOppSlot);

    await addLog("", null);
    await addLog("=== QUARTER-FINAL (" + userQF.label + ") vs " + qfOpp + " ===", "var(--brand-gold)");
    const qfOppR = activeTeamStrengths[qfOpp] || 80;
    const qfProb = winProbability(effectiveR, qfOppR);
    await addLog(oddsText(qfProb), "var(--text-muted)");
    await addLog(qfProb + "% chance of winning", "var(--text-muted)");
    const qf = simulateMatch(effectiveR, qfOppR);
    await addLog((qf.won?"WIN ":"LOSS") + "  " + qf.userScore + "-" + qf.oppScore, qf.won?"#4ade80":"#f87171");
    matchHistory.push({ stage:"QF", opponent:qfOpp, userScore:qf.userScore, oppScore:qf.oppScore, won:qf.won });
    await addScoreBreakdownLog(userTeam, qf.userScore, qfOpp, qf.oppScore);
    if (!qf.won) {
        await addLog("KNOCKED OUT at the quarter-final stage.", "#ef4444");
        await showResultsSummary();
        showShareButton("Knocked Out — Quarter-Final", "#f87171");
        restartBtn.classList.remove("hidden"); return;
    }

    // Resolve the rest of the bracket: simulate every other QF, then both semis
    const qfWinners = { [userQF.label.replace("Match ","")]: replacedTeam };
    for (const qfx of bracket1999.quarterFinals) {
        const key = qfx.label.replace("Match ","");
        if (qfWinners[key]) continue;
        const a = resolveQfSlot(qfx.slotA), b = resolveQfSlot(qfx.slotB);
        const res = simulateMatch(activeTeamStrengths[a]||80, activeTeamStrengths[b]||80);
        qfWinners[key] = res.won ? a : b;
    }

    function resolveSfSlot(slot) {
        const m = slot.match(/^qf([A-M])_winner$/);
        return m ? qfWinners[m[1]] : null;
    }

    const userSF = bracket1999.semiFinals.find(sf => {
        const a = resolveSfSlot(sf.slotA), b = resolveSfSlot(sf.slotB);
        return a === replacedTeam || b === replacedTeam;
    });
    const sfOppSlot = resolveSfSlot(userSF.slotA) === replacedTeam ? userSF.slotB : userSF.slotA;
    const sfOpp = resolveSfSlot(sfOppSlot);

    await addLog("", null);
    await addLog("=== SEMI-FINAL vs " + sfOpp + " ===", "var(--brand-gold)");
    const sfOppR = activeTeamStrengths[sfOpp] || 82;
    const sfProb = winProbability(effectiveR, sfOppR);
    await addLog(oddsText(sfProb), "var(--text-muted)");
    await addLog(sfProb + "% chance of winning", "var(--text-muted)");
    const sf = simulateMatch(effectiveR, sfOppR);
    await addLog((sf.won?"WIN ":"LOSS") + "  " + sf.userScore + "-" + sf.oppScore, sf.won?"#4ade80":"#f87171");
    matchHistory.push({ stage:"SF", opponent:sfOpp, userScore:sf.userScore, oppScore:sf.oppScore, won:sf.won });
    await addScoreBreakdownLog(userTeam, sf.userScore, sfOpp, sf.oppScore);

    // The other semi-final, simulated, gives the Final opponent and the
    // 3rd-place play-off opponent (whichever side the user didn't face)
    const otherSF = bracket1999.semiFinals.find(sf2 => sf2 !== userSF);
    const otherA = resolveSfSlot(otherSF.slotA), otherB = resolveSfSlot(otherSF.slotB);
    const otherSFRes = simulateMatch(activeTeamStrengths[otherA]||82, activeTeamStrengths[otherB]||82);
    const otherSFWinner = otherSFRes.won ? otherA : otherB;
    const otherSFLoser  = otherSFRes.won ? otherB : otherA;

    if (!sf.won) {
        // Lost the semi — play the 3rd-place match against the other semi's loser
        await addLog("", null);
        await addLog("=== 3RD PLACE PLAY-OFF vs " + otherSFLoser + " ===", "var(--brand-gold)");
        const tpOppR = activeTeamStrengths[otherSFLoser] || 80;
        const tpProb = winProbability(effectiveR, tpOppR);
        await addLog(oddsText(tpProb), "var(--text-muted)");
        await addLog(tpProb + "% chance of winning", "var(--text-muted)");
        const tp = simulateMatch(effectiveR, tpOppR);
        await addLog((tp.won?"WIN ":"LOSS") + "  " + tp.userScore + "-" + tp.oppScore, tp.won?"#4ade80":"#f87171");
        matchHistory.push({ stage:"3rd Place", opponent:otherSFLoser, userScore:tp.userScore, oppScore:tp.oppScore, won:tp.won });
        await addScoreBreakdownLog(userTeam, tp.userScore, otherSFLoser, tp.oppScore);
        await addLog(tp.won ? "BRONZE — 3rd place at the 1999 Rugby World Cup!" : "4th place — agonisingly close.", tp.won?"#4ade80":"#c5a059");
        await showResultsSummary();
        showShareButton(tp.won ? "Bronze Medal — 3rd Place" : "4th Place Finish", tp.won?"#4ade80":"#c5a059");
        restartBtn.classList.remove("hidden"); return;
    }

    // ── Final ──
    await addLog("", null);
    await addLog("=== FINAL vs " + otherSFWinner + " ===", "var(--brand-gold)");
    const finOppR = activeTeamStrengths[otherSFWinner] || 85;
    const finProb = winProbability(effectiveR, finOppR);
    await addLog(oddsText(finProb), "var(--text-muted)");
    await addLog(finProb + "% chance of winning", "var(--text-muted)");
    const fin = simulateMatch(effectiveR, finOppR);
    await addLog((fin.won?"WIN ":"LOSS") + "  " + fin.userScore + "-" + fin.oppScore, fin.won?"#4ade80":"#f87171");
    matchHistory.push({ stage:"Final", opponent:otherSFWinner, userScore:fin.userScore, oppScore:fin.oppScore, won:fin.won });
    await addScoreBreakdownLog(userTeam, fin.userScore, otherSFWinner, fin.oppScore);

    if (fin.won) {
        await addLog("WORLD CHAMPIONS! Your Hybrid XV wins the 1999 Rugby World Cup!", "var(--brand-gold)");
        await addLog("", null);
        await addLog("But the challenge doesn't end here...", "var(--text-muted)");
        await addLog("Three legendary teams await. Do you dare face them?", "var(--text-muted)");
        await addLog("", null);
        await showResultsSummary();
        showShareButton("WORLD CHAMPIONS", "#c5a059");

        const bossBtn = document.createElement("button");
        bossBtn.textContent = "Accept the Ultimate Challenge";
        bossBtn.className = "btn-primary";
        bossBtn.style.cssText = "margin:12px 0;display:block;width:100%;padding:8px 14px;font-size:0.9rem;";
        document.getElementById("sim-results").appendChild(bossBtn);
        document.getElementById("sim-results").scrollTop = document.getElementById("sim-results").scrollHeight;

        bossBtn.addEventListener("click", async () => {
            bossBtn.remove();
            await runBossStage();
        }, { once: true });

        restartBtn.classList.remove("hidden");
    } else {
        await addLog("Runners-up. A magnificent campaign — one step short of glory.", "#c5a059");
        await showResultsSummary();
        showShareButton("Runners-Up — World Cup Final", "#c5a059");
        restartBtn.classList.remove("hidden");
    }
}

// ============================================================
// 1995 RUGBY WORLD CUP — same era 3/2/1 points system as 1999 (no bonus
// points), but a simpler bracket: 4 pools of 4, no play-off round, pool
// winners and runners-up go straight to the quarter-finals. The QF
// cross-pairing is genuinely different from the modern (2003+) format
// though — winner of A faces runner-up of B and vice versa, same for
// C/D — not the diagonal A-D / B-C pairing used from 2003 onward. Kept
// as its own function rather than parameterising the modern one, since
// that pairing is hardcoded there and safer not to touch.
// ============================================================
async function runTournamentSimulation1995() {
    const userR = getUserRating();
    const pool = getPoolFor(replacedTeam);
    const poolTeams = activePoolStandings[pool].filter(t => t !== replacedTeam);

    await addLog("=== POOL STAGE — Pool " + pool + " ===", "var(--brand-gold)");
    await addLog("Your Hybrid XV (avg: " + userR + ") replaces " + replacedTeam, null);
    await addLog("", null);
    matchHistory = [];
    playerStats = {};

    const record = name => ({ name, p:0, w:0, d:0, l:0, pf:0, pa:0, pts:0 });
    const records = { "Your XV": record("Your XV") };
    poolTeams.forEach(t => { records[t] = record(t); });

    // Same 3/2/1 points system as 1999 — no bonus points.
    function pts1995(won, drew) { return won ? 3 : drew ? 2 : 1; }

    function applyResult(nameA, scoreA, nameB, scoreB) {
        const a = records[nameA], b = records[nameB];
        a.p++; b.p++;
        a.pf += scoreA; a.pa += scoreB;
        b.pf += scoreB; b.pa += scoreA;
        const drew = scoreA === scoreB;
        if (scoreA > scoreB) { a.w++; b.l++; }
        else if (scoreA < scoreB) { b.w++; a.l++; }
        else { a.d++; b.d++; }
        a.pts += pts1995(scoreA > scoreB, drew);
        b.pts += pts1995(scoreB > scoreA, drew);
    }

    // ── User's pool matches ──
    for (const opp of poolTeams) {
        const res = simulateMatch(userR, activeTeamStrengths[opp] || 72);
        const icon = res.won ? "WIN " : "LOSS";
        const colour = res.won ? "#4ade80" : "#f87171";
        const userPts = pts1995(res.won, res.userScore === res.oppScore);
        await addLog(icon + "  vs " + opp + "  " + res.userScore + "-" + res.oppScore + "  (+" + userPts + " pts)", colour);
        await addScoreBreakdownLog(userTeam, res.userScore, opp, res.oppScore);
        matchHistory.push({ stage:"Pool", opponent:opp, userScore:res.userScore, oppScore:res.oppScore, won:res.won });
        applyResult("Your XV", res.userScore, opp, res.oppScore);
    }

    // ── Simulate other pool matches ──
    for (let i = 0; i < poolTeams.length; i++) {
        for (let j = i+1; j < poolTeams.length; j++) {
            const t1 = poolTeams[i], t2 = poolTeams[j];
            const res = simulateMatch(activeTeamStrengths[t1]||72, activeTeamStrengths[t2]||72);
            applyResult(t1, res.userScore, t2, res.oppScore);
        }
    }

    // ── Pool standings ──
    await addLog("", null);
    await addLog("--- Pool " + pool + " Standings ---", "var(--brand-gold)");
    const table = Object.values(records);
    table.sort((a, b) => (b.pts - a.pts) || ((b.pf - b.pa) - (a.pf - a.pa)));
    await addLogBlock(buildStandingsTableHtml(table));

    const rank = table.findIndex(r => r.name === "Your XV");
    if (rank > 1) {
        await addLog("", null);
        await addLog("ELIMINATED — Your Hybrid XV did not qualify from Pool " + pool + ".", "#ef4444");
        await showResultsSummary();
        showShareButton("Eliminated at the Pool Stage", "#f87171");
        restartBtn.classList.remove("hidden"); return;
    }

    const qualified = rank === 0 ? "1st" : "2nd";
    await addLog("", null);
    await addLog("QUALIFIED — " + qualified + " in Pool " + pool, "#4ade80");

    // ── Simulate every other pool in full with proper 1995 records, so
    // we know the real standings needed for the QF cross-pairing ──
    const allPoolRecords = {};
    for (const [p, teams] of Object.entries(activePoolStandings)) {
        const poolRecords = {};
        teams.forEach(t => { poolRecords[t] = record(t); });
        if (p === pool) {
            teams.forEach(t => {
                const key = (t === replacedTeam) ? "Your XV" : t;
                if (records[key]) poolRecords[t] = { ...records[key], name: t };
            });
        } else {
            for (let i = 0; i < teams.length; i++) {
                for (let j = i+1; j < teams.length; j++) {
                    const t1 = teams[i], t2 = teams[j];
                    const res = simulateMatch(activeTeamStrengths[t1]||72, activeTeamStrengths[t2]||72);
                    const a = poolRecords[t1], b = poolRecords[t2];
                    a.p++; b.p++;
                    a.pf += res.userScore; a.pa += res.oppScore;
                    b.pf += res.oppScore; b.pa += res.userScore;
                    const drew = res.userScore === res.oppScore;
                    if (res.userScore > res.oppScore) { a.w++; b.l++; } else if (res.userScore < res.oppScore) { b.w++; a.l++; } else { a.d++; b.d++; }
                    a.pts += pts1995(res.userScore > res.oppScore, drew);
                    b.pts += pts1995(res.oppScore > res.userScore, drew);
                }
            }
        }
        allPoolRecords[p] = Object.values(poolRecords).sort((a,b) => (b.pts-a.pts) || ((b.pf-b.pa)-(a.pf-a.pa)));
    }

    const finishers = {};
    for (const [p, sorted] of Object.entries(allPoolRecords)) {
        finishers[p] = sorted.map(r => r.name === "Your XV" ? replacedTeam : r.name);
    }

    // ── Real 1995 QF cross-pairing: winner of A vs runner-up of B and
    // vice versa; winner of C vs runner-up of D and vice versa ──
    const qfPairings = [
        { id: "QF1", home: finishers.A[0], away: finishers.B[1] },
        { id: "QF2", home: finishers.B[0], away: finishers.A[1] },
        { id: "QF3", home: finishers.C[0], away: finishers.D[1] },
        { id: "QF4", home: finishers.D[0], away: finishers.C[1] },
    ];

    const userQF = qfPairings.find(qf => qf.home === replacedTeam || qf.away === replacedTeam);
    const qfOpp = userQF.home === replacedTeam ? userQF.away : userQF.home;

    const koBoost = 3;
    const effectiveR = userR + koBoost;

    await addLog("", null);
    await addLog("=== QUARTER-FINAL vs " + qfOpp + " ===", "var(--brand-gold)");
    const qfOppR = activeTeamStrengths[qfOpp] || 80;
    const qfProb = winProbability(effectiveR, qfOppR);
    await addLog(oddsText(qfProb), "var(--text-muted)");
    await addLog(qfProb + "% chance of winning", "var(--text-muted)");
    const qf = simulateMatch(effectiveR, qfOppR);
    await addLog((qf.won?"WIN ":"LOSS") + "  " + qf.userScore + "-" + qf.oppScore, qf.won?"#4ade80":"#f87171");
    matchHistory.push({ stage:"QF", opponent:qfOpp, userScore:qf.userScore, oppScore:qf.oppScore, won:qf.won });
    await addScoreBreakdownLog(userTeam, qf.userScore, qfOpp, qf.oppScore);
    if (!qf.won) {
        await addLog("KNOCKED OUT at the quarter-final stage.", "#ef4444");
        await showResultsSummary();
        showShareButton("Knocked Out — Quarter-Final", "#f87171");
        restartBtn.classList.remove("hidden"); return;
    }

    // Simulate the other three QFs to fill out the rest of the bracket.
    // SF pairing per the real 1995 rule: winner of QF1 vs winner of QF2,
    // winner of QF3 vs winner of QF4.
    const qfWinners = { [userQF.id]: replacedTeam };
    for (const qfx of qfPairings) {
        if (qfWinners[qfx.id]) continue;
        const res = simulateMatch(activeTeamStrengths[qfx.home]||80, activeTeamStrengths[qfx.away]||80);
        qfWinners[qfx.id] = res.won ? qfx.home : qfx.away;
    }

    // Real 1995 SF pairing, confirmed directly against actual results:
    // QF1 winner (South Africa, beat Samoa) played QF4 winner (France,
    // beat Ireland); QF3 winner (New Zealand, beat Scotland) played QF2
    // winner (England, beat Australia). This is the standard "opposite
    // side of the draw" bracket convention (1↔4, 2↔3), not the literal
    // "winner 1 vs winner 2" some secondary sources paraphrase it as.
    const userInGroup14 = userQF.id === "QF1" || userQF.id === "QF4";
    const sfOpp = userInGroup14
        ? (userQF.id === "QF1" ? qfWinners.QF4 : qfWinners.QF1)
        : (userQF.id === "QF2" ? qfWinners.QF3 : qfWinners.QF2);

    await addLog("", null);
    await addLog("=== SEMI-FINAL vs " + sfOpp + " ===", "var(--brand-gold)");
    const sfOppR = activeTeamStrengths[sfOpp] || 82;
    const sfProb = winProbability(effectiveR, sfOppR);
    await addLog(oddsText(sfProb), "var(--text-muted)");
    await addLog(sfProb + "% chance of winning", "var(--text-muted)");
    const sf = simulateMatch(effectiveR, sfOppR);
    await addLog((sf.won?"WIN ":"LOSS") + "  " + sf.userScore + "-" + sf.oppScore, sf.won?"#4ade80":"#f87171");
    matchHistory.push({ stage:"SF", opponent:sfOpp, userScore:sf.userScore, oppScore:sf.oppScore, won:sf.won });
    await addScoreBreakdownLog(userTeam, sf.userScore, sfOpp, sf.oppScore);

    // Simulate the other semi-final to get the Final opponent (if the
    // user wins) or the 3rd-place opponent (if the user loses).
    let otherSFWinner, otherSFLoser;
    if (userInGroup14) {
        const a = qfWinners.QF2, b = qfWinners.QF3;
        const res = simulateMatch(activeTeamStrengths[a]||82, activeTeamStrengths[b]||82);
        otherSFWinner = res.won ? a : b; otherSFLoser = res.won ? b : a;
    } else {
        const a = qfWinners.QF1, b = qfWinners.QF4;
        const res = simulateMatch(activeTeamStrengths[a]||82, activeTeamStrengths[b]||82);
        otherSFWinner = res.won ? a : b; otherSFLoser = res.won ? b : a;
    }

    if (!sf.won) {
        await addLog("", null);
        await addLog("=== 3RD PLACE PLAY-OFF vs " + otherSFLoser + " ===", "var(--brand-gold)");
        const tpOppR = activeTeamStrengths[otherSFLoser] || 80;
        const tpProb = winProbability(effectiveR, tpOppR);
        await addLog(oddsText(tpProb), "var(--text-muted)");
        await addLog(tpProb + "% chance of winning", "var(--text-muted)");
        const tp = simulateMatch(effectiveR, tpOppR);
        await addLog((tp.won?"WIN ":"LOSS") + "  " + tp.userScore + "-" + tp.oppScore, tp.won?"#4ade80":"#f87171");
        matchHistory.push({ stage:"3rd Place", opponent:otherSFLoser, userScore:tp.userScore, oppScore:tp.oppScore, won:tp.won });
        await addScoreBreakdownLog(userTeam, tp.userScore, otherSFLoser, tp.oppScore);
        await addLog(tp.won ? "BRONZE — 3rd place at the 1995 Rugby World Cup!" : "4th place — agonisingly close.", tp.won?"#4ade80":"#c5a059");
        await showResultsSummary();
        showShareButton(tp.won ? "Bronze Medal — 3rd Place" : "4th Place Finish", tp.won?"#4ade80":"#c5a059");
        restartBtn.classList.remove("hidden"); return;
    }

    // ── Final ──
    await addLog("", null);
    await addLog("=== FINAL vs " + otherSFWinner + " ===", "var(--brand-gold)");
    const finOppR = activeTeamStrengths[otherSFWinner] || 85;
    const finProb = winProbability(effectiveR, finOppR);
    await addLog(oddsText(finProb), "var(--text-muted)");
    await addLog(finProb + "% chance of winning", "var(--text-muted)");
    const fin = simulateMatch(effectiveR, finOppR);
    await addLog((fin.won?"WIN ":"LOSS") + "  " + fin.userScore + "-" + fin.oppScore, fin.won?"#4ade80":"#f87171");
    matchHistory.push({ stage:"Final", opponent:otherSFWinner, userScore:fin.userScore, oppScore:fin.oppScore, won:fin.won });
    await addScoreBreakdownLog(userTeam, fin.userScore, otherSFWinner, fin.oppScore);

    if (fin.won) {
        await addLog("WORLD CHAMPIONS! Your Hybrid XV wins the 1995 Rugby World Cup!", "var(--brand-gold)");
        await addLog("", null);
        await addLog("But the challenge doesn't end here...", "var(--text-muted)");
        await addLog("Three legendary teams await. Do you dare face them?", "var(--text-muted)");
        await addLog("", null);
        await showResultsSummary();
        showShareButton("WORLD CHAMPIONS", "#c5a059");

        const bossBtn = document.createElement("button");
        bossBtn.textContent = "Accept the Ultimate Challenge";
        bossBtn.className = "btn-primary";
        bossBtn.style.cssText = "margin:12px 0;display:block;width:100%;padding:8px 14px;font-size:0.9rem;";
        document.getElementById("sim-results").appendChild(bossBtn);
        document.getElementById("sim-results").scrollTop = document.getElementById("sim-results").scrollHeight;

        bossBtn.addEventListener("click", async () => {
            bossBtn.remove();
            await runBossStage();
        }, { once: true });

        restartBtn.classList.remove("hidden");
    } else {
        await addLog("Runners-up. A magnificent campaign — one step short of glory.", "#c5a059");
        await showResultsSummary();
        showShareButton("Runners-Up — World Cup Final", "#c5a059");
        restartBtn.classList.remove("hidden");
    }
}


// ============================================================
// 1991 RUGBY WORLD CUP — same 4-pools-of-4 shape and 3/2/1 points
// system as 1995, but confirmed directly against real results to use
// a different QF cross-pairing direction (our A-D labels map onto the
// real Pool 1-4 numbering, with the actual pairing being A vs D and
// B vs C, not 1995's A vs B and C vs D). Kept as its own function for
// the same reason 1995 is: the pairing differs enough, and is
// hardcoded rather than parameterised, that sharing logic isn't safe.
// ============================================================
async function runTournamentSimulation1991() {
    const userR = getUserRating();
    const pool = getPoolFor(replacedTeam);
    const poolTeams = activePoolStandings[pool].filter(t => t !== replacedTeam);

    await addLog("=== POOL STAGE — Pool " + pool + " ===", "var(--brand-gold)");
    await addLog("Your Hybrid XV (avg: " + userR + ") replaces " + replacedTeam, null);
    await addLog("", null);
    matchHistory = [];
    playerStats = {};

    const record = name => ({ name, p:0, w:0, d:0, l:0, pf:0, pa:0, pts:0 });
    const records = { "Your XV": record("Your XV") };
    poolTeams.forEach(t => { records[t] = record(t); });

    // Same 3/2/1 points system as 1999 — no bonus points.
    function pts1991(won, drew) { return won ? 3 : drew ? 2 : 1; }

    function applyResult(nameA, scoreA, nameB, scoreB) {
        const a = records[nameA], b = records[nameB];
        a.p++; b.p++;
        a.pf += scoreA; a.pa += scoreB;
        b.pf += scoreB; b.pa += scoreA;
        const drew = scoreA === scoreB;
        if (scoreA > scoreB) { a.w++; b.l++; }
        else if (scoreA < scoreB) { b.w++; a.l++; }
        else { a.d++; b.d++; }
        a.pts += pts1991(scoreA > scoreB, drew);
        b.pts += pts1991(scoreB > scoreA, drew);
    }

    // ── User's pool matches ──
    for (const opp of poolTeams) {
        const res = simulateMatch(userR, activeTeamStrengths[opp] || 72);
        const icon = res.won ? "WIN " : "LOSS";
        const colour = res.won ? "#4ade80" : "#f87171";
        const userPts = pts1991(res.won, res.userScore === res.oppScore);
        await addLog(icon + "  vs " + opp + "  " + res.userScore + "-" + res.oppScore + "  (+" + userPts + " pts)", colour);
        await addScoreBreakdownLog(userTeam, res.userScore, opp, res.oppScore);
        matchHistory.push({ stage:"Pool", opponent:opp, userScore:res.userScore, oppScore:res.oppScore, won:res.won });
        applyResult("Your XV", res.userScore, opp, res.oppScore);
    }

    // ── Simulate other pool matches ──
    for (let i = 0; i < poolTeams.length; i++) {
        for (let j = i+1; j < poolTeams.length; j++) {
            const t1 = poolTeams[i], t2 = poolTeams[j];
            const res = simulateMatch(activeTeamStrengths[t1]||72, activeTeamStrengths[t2]||72);
            applyResult(t1, res.userScore, t2, res.oppScore);
        }
    }

    // ── Pool standings ──
    await addLog("", null);
    await addLog("--- Pool " + pool + " Standings ---", "var(--brand-gold)");
    const table = Object.values(records);
    table.sort((a, b) => (b.pts - a.pts) || ((b.pf - b.pa) - (a.pf - a.pa)));
    await addLogBlock(buildStandingsTableHtml(table));

    const rank = table.findIndex(r => r.name === "Your XV");
    if (rank > 1) {
        await addLog("", null);
        await addLog("ELIMINATED — Your Hybrid XV did not qualify from Pool " + pool + ".", "#ef4444");
        await showResultsSummary();
        showShareButton("Eliminated at the Pool Stage", "#f87171");
        restartBtn.classList.remove("hidden"); return;
    }

    const qualified = rank === 0 ? "1st" : "2nd";
    await addLog("", null);
    await addLog("QUALIFIED — " + qualified + " in Pool " + pool, "#4ade80");

    // ── Simulate every other pool in full with proper 1991 records, so
    // we know the real standings needed for the QF cross-pairing ──
    const allPoolRecords = {};
    for (const [p, teams] of Object.entries(activePoolStandings)) {
        const poolRecords = {};
        teams.forEach(t => { poolRecords[t] = record(t); });
        if (p === pool) {
            teams.forEach(t => {
                const key = (t === replacedTeam) ? "Your XV" : t;
                if (records[key]) poolRecords[t] = { ...records[key], name: t };
            });
        } else {
            for (let i = 0; i < teams.length; i++) {
                for (let j = i+1; j < teams.length; j++) {
                    const t1 = teams[i], t2 = teams[j];
                    const res = simulateMatch(activeTeamStrengths[t1]||72, activeTeamStrengths[t2]||72);
                    const a = poolRecords[t1], b = poolRecords[t2];
                    a.p++; b.p++;
                    a.pf += res.userScore; a.pa += res.oppScore;
                    b.pf += res.oppScore; b.pa += res.userScore;
                    const drew = res.userScore === res.oppScore;
                    if (res.userScore > res.oppScore) { a.w++; b.l++; } else if (res.userScore < res.oppScore) { b.w++; a.l++; } else { a.d++; b.d++; }
                    a.pts += pts1991(res.userScore > res.oppScore, drew);
                    b.pts += pts1991(res.oppScore > res.userScore, drew);
                }
            }
        }
        allPoolRecords[p] = Object.values(poolRecords).sort((a,b) => (b.pts-a.pts) || ((b.pf-b.pa)-(a.pf-a.pa)));
    }

    const finishers = {};
    for (const [p, sorted] of Object.entries(allPoolRecords)) {
        finishers[p] = sorted.map(r => r.name === "Your XV" ? replacedTeam : r.name);
    }

    // ── Real 1991 QF cross-pairing, confirmed directly against actual
    // results (New Zealand/Pool1 beat Canada/Pool4-runner-up; England/
    // Pool1-runner-up beat France/Pool4; Scotland/Pool2 beat Samoa/
    // Pool3-runner-up; Australia/Pool3 beat Ireland/Pool2-runner-up).
    // Our internal A-D labels map to the real Pool 1-4 numbering, so
    // this is winner of A vs runner-up of D and vice versa; winner of
    // B vs runner-up of C and vice versa — genuinely different from
    // 1995's A-B/C-D pairing direction (1991 uses Pool1-4 numbering
    // mapped onto our A-D labels, with a different cross-pairing). ──
    const qfPairings = [
        { id: "QF1", home: finishers.A[0], away: finishers.D[1] },
        { id: "QF2", home: finishers.D[0], away: finishers.A[1] },
        { id: "QF3", home: finishers.B[0], away: finishers.C[1] },
        { id: "QF4", home: finishers.C[0], away: finishers.B[1] },
    ];

    const userQF = qfPairings.find(qf => qf.home === replacedTeam || qf.away === replacedTeam);
    const qfOpp = userQF.home === replacedTeam ? userQF.away : userQF.home;

    const koBoost = 3;
    const effectiveR = userR + koBoost;

    await addLog("", null);
    await addLog("=== QUARTER-FINAL vs " + qfOpp + " ===", "var(--brand-gold)");
    const qfOppR = activeTeamStrengths[qfOpp] || 80;
    const qfProb = winProbability(effectiveR, qfOppR);
    await addLog(oddsText(qfProb), "var(--text-muted)");
    await addLog(qfProb + "% chance of winning", "var(--text-muted)");
    const qf = simulateMatch(effectiveR, qfOppR);
    await addLog((qf.won?"WIN ":"LOSS") + "  " + qf.userScore + "-" + qf.oppScore, qf.won?"#4ade80":"#f87171");
    matchHistory.push({ stage:"QF", opponent:qfOpp, userScore:qf.userScore, oppScore:qf.oppScore, won:qf.won });
    await addScoreBreakdownLog(userTeam, qf.userScore, qfOpp, qf.oppScore);
    if (!qf.won) {
        await addLog("KNOCKED OUT at the quarter-final stage.", "#ef4444");
        await showResultsSummary();
        showShareButton("Knocked Out — Quarter-Final", "#f87171");
        restartBtn.classList.remove("hidden"); return;
    }

    // Simulate the other three QFs to fill out the rest of the bracket.
    // SF pairing per the real bracket convention: winner of QF1 vs winner of QF4,
    // winner of QF3 vs winner of QF4.
    const qfWinners = { [userQF.id]: replacedTeam };
    for (const qfx of qfPairings) {
        if (qfWinners[qfx.id]) continue;
        const res = simulateMatch(activeTeamStrengths[qfx.home]||80, activeTeamStrengths[qfx.away]||80);
        qfWinners[qfx.id] = res.won ? qfx.home : qfx.away;
    }

    // Real 1991 SF pairing, confirmed directly against actual results:
    // QF1 winner (New Zealand, beat Canada) played QF4 winner
    // (Australia, beat Ireland); QF3 winner (Scotland, beat Samoa)
    // played QF2 winner (England, beat France). Same "opposite side of
    // the draw" bracket convention (1↔4, 2↔3), same as 1995.
    const userInGroup14 = userQF.id === "QF1" || userQF.id === "QF4";
    const sfOpp = userInGroup14
        ? (userQF.id === "QF1" ? qfWinners.QF4 : qfWinners.QF1)
        : (userQF.id === "QF2" ? qfWinners.QF3 : qfWinners.QF2);

    await addLog("", null);
    await addLog("=== SEMI-FINAL vs " + sfOpp + " ===", "var(--brand-gold)");
    const sfOppR = activeTeamStrengths[sfOpp] || 82;
    const sfProb = winProbability(effectiveR, sfOppR);
    await addLog(oddsText(sfProb), "var(--text-muted)");
    await addLog(sfProb + "% chance of winning", "var(--text-muted)");
    const sf = simulateMatch(effectiveR, sfOppR);
    await addLog((sf.won?"WIN ":"LOSS") + "  " + sf.userScore + "-" + sf.oppScore, sf.won?"#4ade80":"#f87171");
    matchHistory.push({ stage:"SF", opponent:sfOpp, userScore:sf.userScore, oppScore:sf.oppScore, won:sf.won });
    await addScoreBreakdownLog(userTeam, sf.userScore, sfOpp, sf.oppScore);

    // Simulate the other semi-final to get the Final opponent (if the
    // user wins) or the 3rd-place opponent (if the user loses).
    let otherSFWinner, otherSFLoser;
    if (userInGroup14) {
        const a = qfWinners.QF2, b = qfWinners.QF3;
        const res = simulateMatch(activeTeamStrengths[a]||82, activeTeamStrengths[b]||82);
        otherSFWinner = res.won ? a : b; otherSFLoser = res.won ? b : a;
    } else {
        const a = qfWinners.QF1, b = qfWinners.QF4;
        const res = simulateMatch(activeTeamStrengths[a]||82, activeTeamStrengths[b]||82);
        otherSFWinner = res.won ? a : b; otherSFLoser = res.won ? b : a;
    }

    if (!sf.won) {
        await addLog("", null);
        await addLog("=== 3RD PLACE PLAY-OFF vs " + otherSFLoser + " ===", "var(--brand-gold)");
        const tpOppR = activeTeamStrengths[otherSFLoser] || 80;
        const tpProb = winProbability(effectiveR, tpOppR);
        await addLog(oddsText(tpProb), "var(--text-muted)");
        await addLog(tpProb + "% chance of winning", "var(--text-muted)");
        const tp = simulateMatch(effectiveR, tpOppR);
        await addLog((tp.won?"WIN ":"LOSS") + "  " + tp.userScore + "-" + tp.oppScore, tp.won?"#4ade80":"#f87171");
        matchHistory.push({ stage:"3rd Place", opponent:otherSFLoser, userScore:tp.userScore, oppScore:tp.oppScore, won:tp.won });
        await addScoreBreakdownLog(userTeam, tp.userScore, otherSFLoser, tp.oppScore);
        await addLog(tp.won ? "BRONZE — 3rd place at the 1991 Rugby World Cup!" : "4th place — agonisingly close.", tp.won?"#4ade80":"#c5a059");
        await showResultsSummary();
        showShareButton(tp.won ? "Bronze Medal — 3rd Place" : "4th Place Finish", tp.won?"#4ade80":"#c5a059");
        restartBtn.classList.remove("hidden"); return;
    }

    // ── Final ──
    await addLog("", null);
    await addLog("=== FINAL vs " + otherSFWinner + " ===", "var(--brand-gold)");
    const finOppR = activeTeamStrengths[otherSFWinner] || 85;
    const finProb = winProbability(effectiveR, finOppR);
    await addLog(oddsText(finProb), "var(--text-muted)");
    await addLog(finProb + "% chance of winning", "var(--text-muted)");
    const fin = simulateMatch(effectiveR, finOppR);
    await addLog((fin.won?"WIN ":"LOSS") + "  " + fin.userScore + "-" + fin.oppScore, fin.won?"#4ade80":"#f87171");
    matchHistory.push({ stage:"Final", opponent:otherSFWinner, userScore:fin.userScore, oppScore:fin.oppScore, won:fin.won });
    await addScoreBreakdownLog(userTeam, fin.userScore, otherSFWinner, fin.oppScore);

    if (fin.won) {
        await addLog("WORLD CHAMPIONS! Your Hybrid XV wins the 1991 Rugby World Cup!", "var(--brand-gold)");
        await addLog("", null);
        await addLog("But the challenge doesn't end here...", "var(--text-muted)");
        await addLog("Three legendary teams await. Do you dare face them?", "var(--text-muted)");
        await addLog("", null);
        await showResultsSummary();
        showShareButton("WORLD CHAMPIONS", "#c5a059");

        const bossBtn = document.createElement("button");
        bossBtn.textContent = "Accept the Ultimate Challenge";
        bossBtn.className = "btn-primary";
        bossBtn.style.cssText = "margin:12px 0;display:block;width:100%;padding:8px 14px;font-size:0.9rem;";
        document.getElementById("sim-results").appendChild(bossBtn);
        document.getElementById("sim-results").scrollTop = document.getElementById("sim-results").scrollHeight;

        bossBtn.addEventListener("click", async () => {
            bossBtn.remove();
            await runBossStage();
        }, { once: true });

        restartBtn.classList.remove("hidden");
    } else {
        await addLog("Runners-up. A magnificent campaign — one step short of glory.", "#c5a059");
        await showResultsSummary();
        showShareButton("Runners-Up — World Cup Final", "#c5a059");
        restartBtn.classList.remove("hidden");
    }
}

// ============================================================
// 1987 RUGBY WORLD CUP (inaugural tournament) — same 4-pools-of-4
// shape as 1991/1995, but with two genuine differences confirmed
// directly against the official record: a 2/1/0 points system (not
// 3/2/1), and ties broken by tries scored rather than points
// difference (confirmed to have actually mattered: Fiji finished
// above Argentina in the real Pool 3 standings on tries, despite a
// similar points difference). The QF pairing pattern is adjacent
// pools (A-B/C-D, same shape as 1995) rather than 1991's opposite-
// corner A-D/B-C, but with entirely different actual teams involved.
// ============================================================
async function runTournamentSimulation1987() {
    const userR = getUserRating();
    const pool = getPoolFor(replacedTeam);
    const poolTeams = activePoolStandings[pool].filter(t => t !== replacedTeam);

    await addLog("=== POOL STAGE — Pool " + pool + " ===", "var(--brand-gold)");
    await addLog("Your Hybrid XV (avg: " + userR + ") replaces " + replacedTeam, null);
    await addLog("", null);
    matchHistory = [];
    playerStats = {};

    const record = name => ({ name, p:0, w:0, d:0, l:0, pf:0, pa:0, pts:0, tries:0 });
    const records = { "Your XV": record("Your XV") };
    poolTeams.forEach(t => { records[t] = record(t); });

    // 1987's points system: 2 for a win, 1 for a draw, 0 for a loss —
    // genuinely different from every later tournament's 3/2/1.
    function pts1987(won, drew) { return won ? 2 : drew ? 1 : 0; }

    // 1987 uniquely breaks ties on TRIES SCORED, not points difference —
    // confirmed directly from the official record, which states this
    // genuinely affected the real Pool 3 standings (Fiji finished above
    // Argentina on tries despite a similar points difference). Since the
    // simulation engine itself only produces final scores, not real
    // try-by-try data, we derive a plausible try count from each score
    // using the same buildScoreBreakdown() logic already used for the
    // live match log — reusing real, already-tested machinery rather
    // than inventing a new approximation.
    function deriveTries(score, lineup) {
        if (!lineup) return Math.round(score / 6); // rough fallback if no lineup available
        return buildScoreBreakdown(score, lineup).tryCount;
    }

    function applyResult(nameA, scoreA, nameB, scoreB, triesA, triesB) {
        const a = records[nameA], b = records[nameB];
        a.p++; b.p++;
        a.pf += scoreA; a.pa += scoreB;
        b.pf += scoreB; b.pa += scoreA;
        a.tries += triesA; b.tries += triesB;
        const drew = scoreA === scoreB;
        if (scoreA > scoreB) { a.w++; b.l++; }
        else if (scoreA < scoreB) { b.w++; a.l++; }
        else { a.d++; b.d++; }
        a.pts += pts1987(scoreA > scoreB, drew);
        b.pts += pts1987(scoreB > scoreA, drew);
    }

    // ── User's pool matches ──
    for (const opp of poolTeams) {
        const res = simulateMatch(userR, activeTeamStrengths[opp] || 72);
        const icon = res.won ? "WIN " : "LOSS";
        const colour = res.won ? "#4ade80" : "#f87171";
        const userPts = pts1987(res.won, res.userScore === res.oppScore);
        await addLog(icon + "  vs " + opp + "  " + res.userScore + "-" + res.oppScore + "  (+" + userPts + " pts)", colour);
        await addScoreBreakdownLog(userTeam, res.userScore, opp, res.oppScore);
        matchHistory.push({ stage:"Pool", opponent:opp, userScore:res.userScore, oppScore:res.oppScore, won:res.won });
        const oppLineupForTries = getOppositionLineup(opp);
        const userTries = deriveTries(res.userScore, userTeam);
        const oppTries = deriveTries(res.oppScore, oppLineupForTries);
        applyResult("Your XV", res.userScore, opp, res.oppScore, userTries, oppTries);
    }

    // ── Simulate other pool matches ──
    for (let i = 0; i < poolTeams.length; i++) {
        for (let j = i+1; j < poolTeams.length; j++) {
            const t1 = poolTeams[i], t2 = poolTeams[j];
            const res = simulateMatch(activeTeamStrengths[t1]||72, activeTeamStrengths[t2]||72);
            const t1Lineup = getOppositionLineup(t1), t2Lineup = getOppositionLineup(t2);
            const t1Tries = deriveTries(res.userScore, t1Lineup);
            const t2Tries = deriveTries(res.oppScore, t2Lineup);
            applyResult(t1, res.userScore, t2, res.oppScore, t1Tries, t2Tries);
        }
    }

    // ── Pool standings ──
    await addLog("", null);
    await addLog("--- Pool " + pool + " Standings ---", "var(--brand-gold)");
    const table = Object.values(records);
    table.sort((a, b) => (b.pts - a.pts) || (b.tries - a.tries));
    await addLogBlock(buildStandingsTableHtml(table));

    const rank = table.findIndex(r => r.name === "Your XV");
    if (rank > 1) {
        await addLog("", null);
        await addLog("ELIMINATED — Your Hybrid XV did not qualify from Pool " + pool + ".", "#ef4444");
        await showResultsSummary();
        showShareButton("Eliminated at the Pool Stage", "#f87171");
        restartBtn.classList.remove("hidden"); return;
    }

    const qualified = rank === 0 ? "1st" : "2nd";
    await addLog("", null);
    await addLog("QUALIFIED — " + qualified + " in Pool " + pool, "#4ade80");

    // ── Simulate every other pool in full with proper 1987 records
    // (including derived try counts, since this year's tiebreaker is
    // tries scored, not points difference), so we know the real
    // standings needed for the QF cross-pairing ──
    const allPoolRecords = {};
    for (const [p, teams] of Object.entries(activePoolStandings)) {
        const poolRecords = {};
        teams.forEach(t => { poolRecords[t] = record(t); });
        if (p === pool) {
            teams.forEach(t => {
                const key = (t === replacedTeam) ? "Your XV" : t;
                if (records[key]) poolRecords[t] = { ...records[key], name: t };
            });
        } else {
            for (let i = 0; i < teams.length; i++) {
                for (let j = i+1; j < teams.length; j++) {
                    const t1 = teams[i], t2 = teams[j];
                    const res = simulateMatch(activeTeamStrengths[t1]||72, activeTeamStrengths[t2]||72);
                    const a = poolRecords[t1], b = poolRecords[t2];
                    a.p++; b.p++;
                    a.pf += res.userScore; a.pa += res.oppScore;
                    b.pf += res.oppScore; b.pa += res.userScore;
                    const t1Lineup = getOppositionLineup(t1), t2Lineup = getOppositionLineup(t2);
                    a.tries += deriveTries(res.userScore, t1Lineup);
                    b.tries += deriveTries(res.oppScore, t2Lineup);
                    const drew = res.userScore === res.oppScore;
                    if (res.userScore > res.oppScore) { a.w++; b.l++; } else if (res.userScore < res.oppScore) { b.w++; a.l++; } else { a.d++; b.d++; }
                    a.pts += pts1987(res.userScore > res.oppScore, drew);
                    b.pts += pts1987(res.oppScore > res.userScore, drew);
                }
            }
        }
        allPoolRecords[p] = Object.values(poolRecords).sort((a,b) => (b.pts-a.pts) || (b.tries-a.tries));
    }

    const finishers = {};
    for (const [p, sorted] of Object.entries(allPoolRecords)) {
        finishers[p] = sorted.map(r => r.name === "Your XV" ? replacedTeam : r.name);
    }

    // ── Real 1987 QF cross-pairing, confirmed directly against actual
    // results (Australia/Pool1 beat Ireland/Pool2-runner-up; Wales/
    // Pool2 beat England/Pool1-runner-up; New Zealand/Pool3 beat
    // Scotland/Pool4-runner-up; France/Pool4 beat Fiji/Pool3-runner-up).
    // Our internal A-D labels map directly onto the real Pool 1-4
    // numbering, so this is winner of A vs runner-up of B and vice
    // versa; winner of C vs runner-up of D and vice versa — the same
    // pairing SHAPE as 1995 (adjacent pools, not opposite-corner like
    // 1991), even though the actual nations involved are different. ──
    const qfPairings = [
        { id: "QF1", home: finishers.A[0], away: finishers.B[1] },
        { id: "QF2", home: finishers.B[0], away: finishers.A[1] },
        { id: "QF3", home: finishers.C[0], away: finishers.D[1] },
        { id: "QF4", home: finishers.D[0], away: finishers.C[1] },
    ];

    const userQF = qfPairings.find(qf => qf.home === replacedTeam || qf.away === replacedTeam);
    const qfOpp = userQF.home === replacedTeam ? userQF.away : userQF.home;

    const koBoost = 3;
    const effectiveR = userR + koBoost;

    await addLog("", null);
    await addLog("=== QUARTER-FINAL vs " + qfOpp + " ===", "var(--brand-gold)");
    const qfOppR = activeTeamStrengths[qfOpp] || 80;
    const qfProb = winProbability(effectiveR, qfOppR);
    await addLog(oddsText(qfProb), "var(--text-muted)");
    await addLog(qfProb + "% chance of winning", "var(--text-muted)");
    const qf = simulateMatch(effectiveR, qfOppR);
    await addLog((qf.won?"WIN ":"LOSS") + "  " + qf.userScore + "-" + qf.oppScore, qf.won?"#4ade80":"#f87171");
    matchHistory.push({ stage:"QF", opponent:qfOpp, userScore:qf.userScore, oppScore:qf.oppScore, won:qf.won });
    await addScoreBreakdownLog(userTeam, qf.userScore, qfOpp, qf.oppScore);
    if (!qf.won) {
        await addLog("KNOCKED OUT at the quarter-final stage.", "#ef4444");
        await showResultsSummary();
        showShareButton("Knocked Out — Quarter-Final", "#f87171");
        restartBtn.classList.remove("hidden"); return;
    }

    // Simulate the other three QFs to fill out the rest of the bracket.
    // SF pairing per the real bracket convention: winner of QF1 vs winner of QF4,
    // winner of QF3 vs winner of QF4.
    const qfWinners = { [userQF.id]: replacedTeam };
    for (const qfx of qfPairings) {
        if (qfWinners[qfx.id]) continue;
        const res = simulateMatch(activeTeamStrengths[qfx.home]||80, activeTeamStrengths[qfx.away]||80);
        qfWinners[qfx.id] = res.won ? qfx.home : qfx.away;
    }

    // Real 1987 SF pairing, confirmed directly against actual results:
    // QF1 winner (Australia, beat Ireland) played QF4 winner (France,
    // beat Fiji); QF3 winner (New Zealand, beat Scotland) played QF2
    // winner (Wales, beat England). Same "opposite side of the draw"
    // bracket convention (1↔4, 2↔3) as both 1991 and 1995, even though
    // the QF pairing pattern at the pool level differs (1987 uses
    // adjacent pools A-B/C-D for its QFs, not 1991's opposite-corner
    // A-D/B-C — but the SF grouping is unaffected either way).
    const userInGroup14 = userQF.id === "QF1" || userQF.id === "QF4";
    const sfOpp = userInGroup14
        ? (userQF.id === "QF1" ? qfWinners.QF4 : qfWinners.QF1)
        : (userQF.id === "QF2" ? qfWinners.QF3 : qfWinners.QF2);

    await addLog("", null);
    await addLog("=== SEMI-FINAL vs " + sfOpp + " ===", "var(--brand-gold)");
    const sfOppR = activeTeamStrengths[sfOpp] || 82;
    const sfProb = winProbability(effectiveR, sfOppR);
    await addLog(oddsText(sfProb), "var(--text-muted)");
    await addLog(sfProb + "% chance of winning", "var(--text-muted)");
    const sf = simulateMatch(effectiveR, sfOppR);
    await addLog((sf.won?"WIN ":"LOSS") + "  " + sf.userScore + "-" + sf.oppScore, sf.won?"#4ade80":"#f87171");
    matchHistory.push({ stage:"SF", opponent:sfOpp, userScore:sf.userScore, oppScore:sf.oppScore, won:sf.won });
    await addScoreBreakdownLog(userTeam, sf.userScore, sfOpp, sf.oppScore);

    // Simulate the other semi-final to get the Final opponent (if the
    // user wins) or the 3rd-place opponent (if the user loses).
    let otherSFWinner, otherSFLoser;
    if (userInGroup14) {
        const a = qfWinners.QF2, b = qfWinners.QF3;
        const res = simulateMatch(activeTeamStrengths[a]||82, activeTeamStrengths[b]||82);
        otherSFWinner = res.won ? a : b; otherSFLoser = res.won ? b : a;
    } else {
        const a = qfWinners.QF1, b = qfWinners.QF4;
        const res = simulateMatch(activeTeamStrengths[a]||82, activeTeamStrengths[b]||82);
        otherSFWinner = res.won ? a : b; otherSFLoser = res.won ? b : a;
    }

    if (!sf.won) {
        await addLog("", null);
        await addLog("=== 3RD PLACE PLAY-OFF vs " + otherSFLoser + " ===", "var(--brand-gold)");
        const tpOppR = activeTeamStrengths[otherSFLoser] || 80;
        const tpProb = winProbability(effectiveR, tpOppR);
        await addLog(oddsText(tpProb), "var(--text-muted)");
        await addLog(tpProb + "% chance of winning", "var(--text-muted)");
        const tp = simulateMatch(effectiveR, tpOppR);
        await addLog((tp.won?"WIN ":"LOSS") + "  " + tp.userScore + "-" + tp.oppScore, tp.won?"#4ade80":"#f87171");
        matchHistory.push({ stage:"3rd Place", opponent:otherSFLoser, userScore:tp.userScore, oppScore:tp.oppScore, won:tp.won });
        await addScoreBreakdownLog(userTeam, tp.userScore, otherSFLoser, tp.oppScore);
        await addLog(tp.won ? "BRONZE — 3rd place at the 1987 Rugby World Cup!" : "4th place — agonisingly close.", tp.won?"#4ade80":"#c5a059");
        await showResultsSummary();
        showShareButton(tp.won ? "Bronze Medal — 3rd Place" : "4th Place Finish", tp.won?"#4ade80":"#c5a059");
        restartBtn.classList.remove("hidden"); return;
    }

    // ── Final ──
    await addLog("", null);
    await addLog("=== FINAL vs " + otherSFWinner + " ===", "var(--brand-gold)");
    const finOppR = activeTeamStrengths[otherSFWinner] || 85;
    const finProb = winProbability(effectiveR, finOppR);
    await addLog(oddsText(finProb), "var(--text-muted)");
    await addLog(finProb + "% chance of winning", "var(--text-muted)");
    const fin = simulateMatch(effectiveR, finOppR);
    await addLog((fin.won?"WIN ":"LOSS") + "  " + fin.userScore + "-" + fin.oppScore, fin.won?"#4ade80":"#f87171");
    matchHistory.push({ stage:"Final", opponent:otherSFWinner, userScore:fin.userScore, oppScore:fin.oppScore, won:fin.won });
    await addScoreBreakdownLog(userTeam, fin.userScore, otherSFWinner, fin.oppScore);

    if (fin.won) {
        await addLog("WORLD CHAMPIONS! Your Hybrid XV wins the 1987 Rugby World Cup!", "var(--brand-gold)");
        await addLog("", null);
        await addLog("But the challenge doesn't end here...", "var(--text-muted)");
        await addLog("Three legendary teams await. Do you dare face them?", "var(--text-muted)");
        await addLog("", null);
        await showResultsSummary();
        showShareButton("WORLD CHAMPIONS", "#c5a059");

        const bossBtn = document.createElement("button");
        bossBtn.textContent = "Accept the Ultimate Challenge";
        bossBtn.className = "btn-primary";
        bossBtn.style.cssText = "margin:12px 0;display:block;width:100%;padding:8px 14px;font-size:0.9rem;";
        document.getElementById("sim-results").appendChild(bossBtn);
        document.getElementById("sim-results").scrollTop = document.getElementById("sim-results").scrollHeight;

        bossBtn.addEventListener("click", async () => {
            bossBtn.remove();
            await runBossStage();
        }, { once: true });

        restartBtn.classList.remove("hidden");
    } else {
        await addLog("Runners-up. A magnificent campaign — one step short of glory.", "#c5a059");
        await showResultsSummary();
        showShareButton("Runners-Up — World Cup Final", "#c5a059");
        restartBtn.classList.remove("hidden");
    }
}
// Simulate all four pool round-robins, return ordered standings {A:[1st,2nd,...], ...}
function simulateAllPools() {
    const standings = {};
    for (const [p, teams] of Object.entries(activePoolStandings)) {
        const pts = {};
        teams.forEach(t => { pts[t] = 0; });
        for (let i = 0; i < teams.length; i++) {
            for (let j = i+1; j < teams.length; j++) {
                const res = simulateMatch(activeTeamStrengths[teams[i]]||65, activeTeamStrengths[teams[j]]||65);
                pts[teams[i]] += res.won ? (res.margin>21?5:4) : (res.margin<=7?1:0);
                pts[teams[j]] += res.won ? (res.margin<=7?1:0) : (res.margin>21?5:4);
            }
        }
        standings[p] = [...teams].sort((a,b) => pts[b]-pts[a]);
    }
    return standings;
}

// ============================================================
// BRACKET HELPERS
// ============================================================
function getPoolFor(team) {
    for (const [k,v] of Object.entries(activePoolStandings)) { if (v.includes(team)) return k; }
    return "A";
}

// ============================================================
// ============================================================
// OOP TOOLTIP — hover on desktop, tap on mobile
// ============================================================
let currentOopTooltip = null;
let currentInfoTooltip = null;

function showOopTooltip(icon, penalty) {
    hideOopTooltip();
    const tip = document.createElement("div");
    tip.className = "oop-tooltip";
    tip.textContent = "Out of position penalty: -" + penalty + " points";
    document.body.appendChild(tip);
    currentOopTooltip = tip;
    positionTooltip(tip, icon);
}

function positionTooltip(tip, anchor) {
    const rect = anchor.getBoundingClientRect();
    tip.style.position = "fixed";
    tip.style.zIndex   = "9999";
    // Try above first, fall back to below
    const tipH = tip.offsetHeight || 32;
    const top  = rect.top - tipH - 6;
    tip.style.top  = (top > 0 ? top : rect.bottom + 6) + "px";
    tip.style.left = Math.max(4, rect.left + rect.width/2 - tip.offsetWidth/2) + "px";
}

function hideOopTooltip() {
    if (currentOopTooltip) { currentOopTooltip.remove(); currentOopTooltip = null; }
}

function toggleOopTooltip(icon, penalty) {
    if (currentOopTooltip) { hideOopTooltip(); return; }
    showOopTooltip(icon, penalty);
}

// Generic info tooltip — shares positionTooltip() with the OOP tooltip above,
// but takes free text and wraps, for explanatory "i" icons rather than warnings.
function showInfoTooltip(icon, text) {
    hideInfoTooltip();
    const tip = document.createElement("div");
    tip.className = "info-tooltip";
    tip.textContent = text;
    document.body.appendChild(tip);
    currentInfoTooltip = tip;
    positionTooltip(tip, icon);
}

function hideInfoTooltip() {
    if (currentInfoTooltip) { currentInfoTooltip.remove(); currentInfoTooltip = null; }
}

function toggleInfoTooltip(icon, text) {
    if (currentInfoTooltip) { hideInfoTooltip(); return; }
    showInfoTooltip(icon, text);
}

// Dismiss info tooltip on outside click
document.addEventListener("click", e => {
    if (currentInfoTooltip && !e.target.classList.contains("info-icon")) hideInfoTooltip();
});

// Dismiss tooltip on outside click
document.addEventListener("click", e => {
    if (currentOopTooltip && !e.target.classList.contains("oop-icon")) hideOopTooltip();
});

// MISC
// ============================================================
function hardReload() {
    // location.reload() can sometimes replay a cached version of the page
    // and its scripts rather than fetching fresh ones. Navigating to the
    // base URL with a cache-busting query param forces a genuine reload.
    // The sessionStorage flag tells the next page load to skip the
    // full-screen loading logo, since the user has already seen it once
    // this session and is just restarting a game, not opening the site
    // fresh.
    try { sessionStorage.setItem("hasPlayedBefore", "1"); } catch (e) {}
    const base = location.pathname;
    window.location.href = base + "?_=" + Date.now();
}
if (restartBtn) restartBtn.addEventListener("click", hardReload);
document.querySelectorAll(".abort-reset-btn").forEach(b => b.addEventListener("click", hardReload));
document.getElementById("theme-toggle").addEventListener("click", () => {
    document.body.classList.toggle("light-theme");
    document.getElementById("theme-toggle").textContent =
        document.body.classList.contains("light-theme") ? "Dark Mode" : "Light Mode";
    applyHostTheme();
});

// ============================================================
// BOSS STAGE — SANZAAR, LIONS, ALL TIME XV
// ============================================================

const BOSS_TEAMS = {

  // ── SANZAAR Barbarians ──────────────────────────────────────
  // Greatest specialist in each position from NZ, SA & Australia
  // Deliberately spread across all three nations
  sanzaar: {
    name: "SANZAAR Barbarians",
    flavour: "The greatest specialist in every position from New Zealand, South Africa and Australia — the most powerful rugby nations on earth.",
    players: [
      { pos:"Loosehead Prop",    name:"Os Du Randt",                 nation:"SA '99",   r:92 },
      { pos:"Hooker",            name:"Sean Fitzpatrick",             nation:"NZ '95",   r:97 },
      { pos:"Tighthead Prop",    name:"Carl Hayman",                  nation:"NZ '07",   r:94 },
      { pos:"Lock",              name:"Victor Matfield",              nation:"SA '07",   r:97 },
      { pos:"Lock",              name:"John Eales",                   nation:"AUS '99",  r:96 },
      { pos:"Blindside Flanker", name:"Michael Jones",                nation:"NZ '87",   r:95 },
      { pos:"Openside Flanker",  name:"Richie McCaw",                 nation:"NZ '11",   r:99 },
      { pos:"Number 8",          name:"Kieran Read",                  nation:"NZ '15",   r:96 },
      { pos:"Scrum-half",        name:"Joost van der Westhuizen",     nation:"SA '95",   r:96 },
      { pos:"Fly-half",          name:"Dan Carter",                   nation:"NZ '15",   r:99 },
      { pos:"Left Wing",         name:"Jonah Lomu",                   nation:"NZ '95",   r:97 },
      { pos:"Inside Centre",     name:"Tim Horan",                    nation:"AUS '99",  r:95 },
      { pos:"Outside Centre",    name:"Jean de Villiers",             nation:"SA '07",   r:92 },
      { pos:"Right Wing",        name:"Bryan Habana",                 nation:"SA '07",   r:97 },
      { pos:"Fullback",          name:"Christian Cullen",             nation:"NZ '99",   r:94 },
    ]
  },

  // ── British & Irish Lions All Time ──────────────────────────
  // Pre-RWC legends alongside the modern greats — a genuine all-time XV
  lions: {
    name: "British & Irish Lions All Time",
    flavour: "From the 1971 Invincibles to the modern era — the finest specialist in every position from England, Wales, Scotland and Ireland.",
    players: [
      { pos:"Loosehead Prop",    name:"Fran Cotton",                  nation:"ENG '74",  r:94 },
      { pos:"Hooker",            name:"Keith Wood",                   nation:"IRE '03",  r:93 },
      { pos:"Tighthead Prop",    name:"Graham Price",                 nation:"WAL '77",  r:93 },
      { pos:"Lock",              name:"Willie John McBride",           nation:"IRE '74",  r:97 },
      { pos:"Lock",              name:"Martin Johnson",                nation:"ENG '97",  r:97 },
      { pos:"Blindside Flanker", name:"Richard Hill",                 nation:"ENG '03",  r:94 },
      { pos:"Openside Flanker",  name:"Sam Warburton",                nation:"WAL '11",  r:93 },
      { pos:"Number 8",          name:"Mervyn Davies",                nation:"WAL '71",  r:95 },
      { pos:"Scrum-half",        name:"Gareth Edwards",               nation:"WAL '71",  r:99 },
      { pos:"Fly-half",          name:"Barry John",                   nation:"WAL '71",  r:97 },
      { pos:"Left Wing",         name:"Gerald Davies",                nation:"WAL '71",  r:95 },
      { pos:"Inside Centre",     name:"Mike Gibson",                  nation:"IRE '71",  r:94 },
      { pos:"Outside Centre",    name:"Brian O'Driscoll",             nation:"IRE '01",  r:96 },
      { pos:"Right Wing",        name:"Jason Robinson",               nation:"ENG '03",  r:93 },
      { pos:"Fullback",          name:"JPR Williams",                 nation:"WAL '71",  r:96 },
    ]
  },

  // ── All Time World XV ───────────────────────────────────────
  // The single greatest specialist at every position in rugby history
  // Spans pre-RWC greats through to the modern era
  alltimexv: {
    name: "All Time World XV",
    flavour: "The single greatest specialist at every position across all of rugby history. From Gareth Edwards to Dan Carter, from Colin Meads to Richie McCaw.",
    players: [
      { pos:"Loosehead Prop",    name:"Ian McLauchlan",               nation:"SCO '74",  r:94 },
      { pos:"Hooker",            name:"Sean Fitzpatrick",             nation:"NZ '95",   r:97 },
      { pos:"Tighthead Prop",    name:"Os Du Randt",                  nation:"SA '99",   r:93 },
      { pos:"Lock",              name:"Colin Meads",                  nation:"NZ '67",   r:98 },
      { pos:"Lock",              name:"Victor Matfield",              nation:"SA '07",   r:97 },
      { pos:"Blindside Flanker", name:"Willie John McBride",          nation:"IRE '74",  r:97 },
      { pos:"Openside Flanker",  name:"Richie McCaw",                 nation:"NZ '11",   r:99 },
      { pos:"Number 8",          name:"Mervyn Davies",                nation:"WAL '71",  r:95 },
      { pos:"Scrum-half",        name:"Gareth Edwards",               nation:"WAL '71",  r:99 },
      { pos:"Fly-half",          name:"Dan Carter",                   nation:"NZ '15",   r:99 },
      { pos:"Left Wing",         name:"Jonah Lomu",                   nation:"NZ '95",   r:97 },
      { pos:"Inside Centre",     name:"Tim Horan",                    nation:"AUS '99",  r:95 },
      { pos:"Outside Centre",    name:"Brian O'Driscoll",             nation:"IRE '11",  r:96 },
      { pos:"Right Wing",        name:"David Campese",                nation:"AUS '91",  r:96 },
      { pos:"Fullback",          name:"Serge Blanco",                 nation:"FRA '87",  r:97 },
    ]
  }
};

function getBossRating(team) {
    return Math.round(team.players.reduce((s,p) => s + p.r, 0) / team.players.length);
}

// Convert a BOSS_TEAMS entry into the position-map shape used by the
// score breakdown system. Locks/props in BOSS_TEAMS share one "pos" label
// for both starting slots, so split them across Lock 4/Lock 5 etc.
function bossTeamToLineup(team) {
    const lineup = {};
    let lockSlot = 4, propSlot = 0;
    const propOrder = ["Loosehead Prop", "Tighthead Prop"];
    team.players.forEach(p => {
        if (p.pos === "Lock") {
            lineup["Lock " + lockSlot] = { name: p.name, score: p.r };
            lockSlot++;
        } else {
            lineup[p.pos] = { name: p.name, score: p.r };
        }
    });
    return lineup;
}

async function runBossStage() {
    const userR = getUserRating();
    const bossOrder = ["sanzaar","lions","alltimexv"];
    const bossLabels = {
        sanzaar:    "⚫ BONUS MATCH, SANZAAR BARBARIANS",
        lions:      "🔴 BONUS MATCH, BRITISH & IRISH LIONS ALL TIME",
        alltimexv:  "🏆 BONUS MATCH, ALL TIME WORLD XV"
    };

    for (const [bossIndex, bossKey] of bossOrder.entries()) {
        const boss = BOSS_TEAMS[bossKey];
        const bossR = getBossRating(boss);

        await addLog("", null);
        await addLogBlock('<div class="sim-log-divider"></div>');
        await addLog(bossLabels[bossKey], "var(--brand-gold)");
        await addLog(boss.flavour, "var(--text-muted)");
        await addLog("", null);

        // Show their lineup
        await addLog("Their XV:", "var(--brand-gold)");
        for (const p of boss.players) {
            const shortPos = LIONS_SHORT_POS[p.pos] || p.pos;
            await addLogBlock(
                '<div class="lions-lineup-row"><span class="ll-pos">' + shortPos +
                '</span><span class="ll-name">' + p.name +
                '</span><span class="ll-nation">' + p.nation +
                '</span><span class="ll-rating">' + p.r + '</span></div>'
            );
        }

        await addLog("", null);
        await addLog("Their average rating: " + bossR + "  |  Your rating: " + userR, null);
        await addLog("", null);
        const bossProb = winProbability(userR, bossR);
        await addLog(oddsText(bossProb), "var(--text-muted)");
        await addLog(bossProb + "% chance of winning", "var(--text-muted)");
        await addLog("", null);
        await addLog("=== KICK OFF ===", "var(--brand-gold)");

        const res = simulateMatch(userR, bossR);
        await addLog(
            (res.won ? "WIN " : "LOSS") + "  " + res.userScore + "-" + res.oppScore,
            res.won ? "#4ade80" : "#f87171"
        );
        matchHistory.push({ stage:"Ultimate " + (bossIndex + 1), opponent:boss.name, userScore:res.userScore, oppScore:res.oppScore, won:res.won });
        await addScoreBreakdownLogForBoss(userTeam, res.userScore, bossTeamToLineup(boss), res.oppScore);

        if (!res.won) {
            await addLog("", null);
            if (bossKey === "sanzaar") {
                await addLog("The SANZAAR Barbarians were too strong. A valiant effort against the best of the Southern Hemisphere.", "#c5a059");
                await showResultsSummary();
                showShareButton("World Champions, fell to SANZAAR Barbarians", "#c5a059");
            } else if (bossKey === "lions") {
                await addLog("The Lions held firm. You pushed the greatest British & Irish players in history to the limit.", "#c5a059");
                await showResultsSummary();
                showShareButton("World Champions, fell to the Lions", "#c5a059");
            } else {
                await addLog("The All Time XV prevail. No team in history has beaten this side, and yours came closer than most.", "#c5a059");
                await showResultsSummary();
                showShareButton("World Champions, fell to the All Time XV", "#c5a059");
            }
            restartBtn.classList.remove("hidden");
            return;
        }

        if (bossKey === "sanzaar") {
            await addLog("The SANZAAR Barbarians are beaten! Extraordinary. Now face the Lions...", "#4ade80");
        } else if (bossKey === "lions") {
            await addLog("The Lions fall! Your Hybrid XV has conquered British & Irish rugby royalty. One final challenge awaits...", "#4ade80");
        } else {
            await addLog("", null);
            await addLog("THE ALL TIME XV ARE BEATEN.", "var(--brand-gold)");
            await addLog("Your Hybrid XV has done the impossible. World Champions, and conquerors of the greatest teams ever assembled. Legendary.", "var(--brand-gold)");
            await showResultsSummary();
            showShareButton("LEGENDARY, beat the All Time XV", "#c5a059");
            restartBtn.classList.remove("hidden");
            return;
        }
    }
}

const LIONS_TOUR_ORDER = [1989, 1993, 1997, 2001, 2005, 2009, 2013, 2017, 2021, 2025];

// Each entry is the real starting XV from that tour, shown to the user for
// context and flavour, but not used to compute the match rating any more.
// Individual player ratings were dropped since they were never actually shown
// in play, a single hand set teamRating drives the match instead. The numbers
// broadly rise tour on tour, with deliberate dips for the 2001 series loss and
// the 2005 whitewash, a small rise for the 2009 loss reflecting the era rather
// than the result, and clear bumps for the 2013 and 2025 series wins.
const LIONS_TOURS = {
    1989: {
        opponent: "Australia", result: "Won 2-1", teamRating: 82,
        players: [
            { pos:"Loosehead Prop", name:"David Sole", nation:"SCO '89" },
            { pos:"Hooker", name:"Brian Moore", nation:"ENG '89" },
            { pos:"Tighthead Prop", name:"Dai Young", nation:"WAL '89" },
            { pos:"Lock", name:"Paul Ackford", nation:"ENG '89" },
            { pos:"Lock", name:"Wade Dooley", nation:"ENG '89" },
            { pos:"Blindside Flanker", name:"Mike Teague", nation:"ENG '89" },
            { pos:"Openside Flanker", name:"Finlay Calder", nation:"SCO '89" },
            { pos:"Number 8", name:"Dean Richards", nation:"ENG '89" },
            { pos:"Scrum-half", name:"Robert Jones", nation:"WAL '89" },
            { pos:"Fly-half", name:"Rob Andrew", nation:"ENG '89" },
            { pos:"Left Wing", name:"Rory Underwood", nation:"ENG '89" },
            { pos:"Inside Centre", name:"Jeremy Guscott", nation:"ENG '89" },
            { pos:"Outside Centre", name:"Scott Hastings", nation:"SCO '89" },
            { pos:"Right Wing", name:"Ieuan Evans", nation:"WAL '89" },
            { pos:"Fullback", name:"Gavin Hastings", nation:"SCO '89" },
        ]
    },
    1993: {
        opponent: "New Zealand", result: "Lost 2-1", teamRating: 85,
        players: [
            { pos:"Loosehead Prop", name:"Jason Leonard", nation:"ENG '93" },
            { pos:"Hooker", name:"Brian Moore", nation:"ENG '93" },
            { pos:"Tighthead Prop", name:"Graham Rowntree", nation:"ENG '93" },
            { pos:"Lock", name:"Martin Bayfield", nation:"ENG '93" },
            { pos:"Lock", name:"Wade Dooley", nation:"ENG '93" },
            { pos:"Blindside Flanker", name:"Peter Winterbottom", nation:"ENG '93" },
            { pos:"Openside Flanker", name:"Ben Clarke", nation:"ENG '93" },
            { pos:"Number 8", name:"Dean Richards", nation:"ENG '93" },
            { pos:"Scrum-half", name:"Dewi Morris", nation:"ENG '93" },
            { pos:"Fly-half", name:"Rob Andrew", nation:"ENG '93" },
            { pos:"Left Wing", name:"Rory Underwood", nation:"ENG '93" },
            { pos:"Inside Centre", name:"Scott Gibbs", nation:"WAL '93" },
            { pos:"Outside Centre", name:"Jeremy Guscott", nation:"ENG '93" },
            { pos:"Right Wing", name:"Ieuan Evans", nation:"WAL '93" },
            { pos:"Fullback", name:"Gavin Hastings", nation:"SCO '93" },
        ]
    },
    1997: {
        opponent: "South Africa", result: "Won 2-1", teamRating: 88,
        players: [
            { pos:"Loosehead Prop", name:"Tom Smith", nation:"SCO '97" },
            { pos:"Hooker", name:"Keith Wood", nation:"IRE '97" },
            { pos:"Tighthead Prop", name:"Paul Wallace", nation:"IRE '97" },
            { pos:"Lock", name:"Martin Johnson", nation:"ENG '97" },
            { pos:"Lock", name:"Jeremy Davidson", nation:"IRE '97" },
            { pos:"Blindside Flanker", name:"Lawrence Dallaglio", nation:"ENG '97" },
            { pos:"Openside Flanker", name:"Richard Hill", nation:"ENG '97" },
            { pos:"Number 8", name:"Tim Rodber", nation:"ENG '97" },
            { pos:"Scrum-half", name:"Matt Dawson", nation:"ENG '97" },
            { pos:"Fly-half", name:"Gregor Townsend", nation:"SCO '97" },
            { pos:"Left Wing", name:"Alan Tait", nation:"SCO '97" },
            { pos:"Inside Centre", name:"Scott Gibbs", nation:"WAL '97" },
            { pos:"Outside Centre", name:"Jeremy Guscott", nation:"ENG '97" },
            { pos:"Right Wing", name:"Ieuan Evans", nation:"WAL '97" },
            { pos:"Fullback", name:"Neil Jenkins", nation:"WAL '97" },
        ]
    },
    2001: {
        opponent: "Australia", result: "Lost 2-1", teamRating: 85,
        players: [
            { pos:"Loosehead Prop", name:"Tom Smith", nation:"SCO '01" },
            { pos:"Hooker", name:"Keith Wood", nation:"IRE '01" },
            { pos:"Tighthead Prop", name:"Phil Vickery", nation:"ENG '01" },
            { pos:"Lock", name:"Martin Johnson", nation:"ENG '01" },
            { pos:"Lock", name:"Danny Grewcock", nation:"ENG '01" },
            { pos:"Blindside Flanker", name:"Martin Corry", nation:"ENG '01" },
            { pos:"Openside Flanker", name:"Neil Back", nation:"ENG '01" },
            { pos:"Number 8", name:"Scott Quinnell", nation:"WAL '01" },
            { pos:"Scrum-half", name:"Matt Dawson", nation:"ENG '01" },
            { pos:"Fly-half", name:"Jonny Wilkinson", nation:"ENG '01" },
            { pos:"Left Wing", name:"Jason Robinson", nation:"ENG '01" },
            { pos:"Inside Centre", name:"Rob Henderson", nation:"IRE '01" },
            { pos:"Outside Centre", name:"Brian O'Driscoll", nation:"IRE '01" },
            { pos:"Right Wing", name:"Dafydd James", nation:"WAL '01" },
            { pos:"Fullback", name:"Matt Perry", nation:"ENG '01" },
        ]
    },
    2005: {
        opponent: "New Zealand", result: "Lost 3-0", teamRating: 82,
        players: [
            { pos:"Loosehead Prop", name:"Gethin Jenkins", nation:"WAL '05" },
            { pos:"Hooker", name:"Steve Thompson", nation:"ENG '05" },
            { pos:"Tighthead Prop", name:"Julian White", nation:"ENG '05" },
            { pos:"Lock", name:"Donncha O'Callaghan", nation:"IRE '05" },
            { pos:"Lock", name:"Paul O'Connell", nation:"IRE '05" },
            { pos:"Blindside Flanker", name:"Simon Easterby", nation:"IRE '05" },
            { pos:"Openside Flanker", name:"Lewis Moody", nation:"ENG '05" },
            { pos:"Number 8", name:"Ryan Jones", nation:"WAL '05" },
            { pos:"Scrum-half", name:"Dwayne Peel", nation:"WAL '05" },
            { pos:"Fly-half", name:"Stephen Jones", nation:"WAL '05" },
            { pos:"Left Wing", name:"Josh Lewsey", nation:"ENG '05" },
            { pos:"Inside Centre", name:"Gareth Thomas", nation:"WAL '05" },
            { pos:"Outside Centre", name:"Will Greenwood", nation:"ENG '05" },
            { pos:"Right Wing", name:"Mark Cueto", nation:"ENG '05" },
            { pos:"Fullback", name:"Geordan Murphy", nation:"IRE '05" },
        ]
    },
    2009: {
        opponent: "South Africa", result: "Lost 2-1", teamRating: 90,
        players: [
            { pos:"Loosehead Prop", name:"Gethin Jenkins", nation:"WAL '09" },
            { pos:"Hooker", name:"Lee Mears", nation:"ENG '09" },
            { pos:"Tighthead Prop", name:"Phil Vickery", nation:"ENG '09" },
            { pos:"Lock", name:"Alun Wyn Jones", nation:"WAL '09" },
            { pos:"Lock", name:"Paul O'Connell", nation:"IRE '09" },
            { pos:"Blindside Flanker", name:"Tom Croft", nation:"ENG '09" },
            { pos:"Openside Flanker", name:"David Wallace", nation:"IRE '09" },
            { pos:"Number 8", name:"Jamie Heaslip", nation:"IRE '09" },
            { pos:"Scrum-half", name:"Mike Phillips", nation:"WAL '09" },
            { pos:"Fly-half", name:"Stephen Jones", nation:"WAL '09" },
            { pos:"Left Wing", name:"Ugo Monye", nation:"ENG '09" },
            { pos:"Inside Centre", name:"Jamie Roberts", nation:"WAL '09" },
            { pos:"Outside Centre", name:"Brian O'Driscoll", nation:"IRE '09" },
            { pos:"Right Wing", name:"Tommy Bowe", nation:"IRE '09" },
            { pos:"Fullback", name:"Lee Byrne", nation:"WAL '09" },
        ]
    },
    2013: {
        opponent: "Australia", result: "Won 2-1", teamRating: 93,
        players: [
            { pos:"Loosehead Prop", name:"Alex Corbisiero", nation:"ENG '13" },
            { pos:"Hooker", name:"Richard Hibbard", nation:"WAL '13" },
            { pos:"Tighthead Prop", name:"Adam Jones", nation:"WAL '13" },
            { pos:"Lock", name:"Alun Wyn Jones", nation:"WAL '13" },
            { pos:"Lock", name:"Geoff Parling", nation:"ENG '13" },
            { pos:"Blindside Flanker", name:"Dan Lydiate", nation:"WAL '13" },
            { pos:"Openside Flanker", name:"Seán O'Brien", nation:"IRE '13" },
            { pos:"Number 8", name:"Taulupe Faletau", nation:"WAL '13" },
            { pos:"Scrum-half", name:"Mike Phillips", nation:"WAL '13" },
            { pos:"Fly-half", name:"Johnny Sexton", nation:"IRE '13" },
            { pos:"Left Wing", name:"George North", nation:"WAL '13" },
            { pos:"Inside Centre", name:"Jamie Roberts", nation:"WAL '13" },
            { pos:"Outside Centre", name:"Jonathan Davies", nation:"WAL '13" },
            { pos:"Right Wing", name:"Tommy Bowe", nation:"IRE '13" },
            { pos:"Fullback", name:"Leigh Halfpenny", nation:"WAL '13" },
        ]
    },
    2017: {
        opponent: "New Zealand", result: "Drawn 1-1", teamRating: 94,
        players: [
            { pos:"Loosehead Prop", name:"Mako Vunipola", nation:"ENG '17" },
            { pos:"Hooker", name:"Jamie George", nation:"ENG '17" },
            { pos:"Tighthead Prop", name:"Tadhg Furlong", nation:"IRE '17" },
            { pos:"Lock", name:"Maro Itoje", nation:"ENG '17" },
            { pos:"Lock", name:"Alun Wyn Jones", nation:"WAL '17" },
            { pos:"Blindside Flanker", name:"Sam Warburton", nation:"WAL '17" },
            { pos:"Openside Flanker", name:"Seán O'Brien", nation:"IRE '17" },
            { pos:"Number 8", name:"Taulupe Faletau", nation:"WAL '17" },
            { pos:"Scrum-half", name:"Conor Murray", nation:"IRE '17" },
            { pos:"Fly-half", name:"Johnny Sexton", nation:"IRE '17" },
            { pos:"Left Wing", name:"Elliot Daly", nation:"ENG '17" },
            { pos:"Inside Centre", name:"Owen Farrell", nation:"ENG '17" },
            { pos:"Outside Centre", name:"Jonathan Davies", nation:"WAL '17" },
            { pos:"Right Wing", name:"Anthony Watson", nation:"ENG '17" },
            { pos:"Fullback", name:"Liam Williams", nation:"WAL '17" },
        ]
    },
    2021: {
        opponent: "South Africa", result: "Lost 2-1", teamRating: 95,
        players: [
            { pos:"Loosehead Prop", name:"Wyn Jones", nation:"WAL '21" },
            { pos:"Hooker", name:"Ken Owens", nation:"WAL '21" },
            { pos:"Tighthead Prop", name:"Tadhg Furlong", nation:"IRE '21" },
            { pos:"Lock", name:"Maro Itoje", nation:"ENG '21" },
            { pos:"Lock", name:"Alun Wyn Jones", nation:"WAL '21" },
            { pos:"Blindside Flanker", name:"Courtney Lawes", nation:"ENG '21" },
            { pos:"Openside Flanker", name:"Tom Curry", nation:"ENG '21" },
            { pos:"Number 8", name:"Jack Conan", nation:"IRE '21" },
            { pos:"Scrum-half", name:"Ali Price", nation:"SCO '21" },
            { pos:"Fly-half", name:"Dan Biggar", nation:"WAL '21" },
            { pos:"Left Wing", name:"Duhan van der Merwe", nation:"SCO '21" },
            { pos:"Inside Centre", name:"Bundee Aki", nation:"IRE '21" },
            { pos:"Outside Centre", name:"Robbie Henshaw", nation:"IRE '21" },
            { pos:"Right Wing", name:"Josh Adams", nation:"WAL '21" },
            { pos:"Fullback", name:"Liam Williams", nation:"WAL '21" },
        ]
    },
    2025: {
        opponent: "Australia", result: "Won 2-1", teamRating: 97,
        players: [
            { pos:"Loosehead Prop", name:"Andrew Porter", nation:"IRE '25" },
            { pos:"Hooker", name:"Dan Sheehan", nation:"IRE '25" },
            { pos:"Tighthead Prop", name:"Tadhg Furlong", nation:"IRE '25" },
            { pos:"Lock", name:"Maro Itoje", nation:"ENG '25" },
            { pos:"Lock", name:"Ollie Chessum", nation:"ENG '25" },
            { pos:"Blindside Flanker", name:"Tadhg Beirne", nation:"IRE '25" },
            { pos:"Openside Flanker", name:"Tom Curry", nation:"ENG '25" },
            { pos:"Number 8", name:"Jack Conan", nation:"IRE '25" },
            { pos:"Scrum-half", name:"Jamison Gibson-Park", nation:"IRE '25" },
            { pos:"Fly-half", name:"Finn Russell", nation:"SCO '25" },
            { pos:"Left Wing", name:"James Lowe", nation:"IRE '25" },
            { pos:"Inside Centre", name:"Bundee Aki", nation:"IRE '25" },
            { pos:"Outside Centre", name:"Huw Jones", nation:"SCO '25" },
            { pos:"Right Wing", name:"Tommy Freeman", nation:"ENG '25" },
            { pos:"Fullback", name:"Hugo Keenan", nation:"IRE '25" },
        ]
    },
};
const LIONS_SHORT_POS = {
    "Loosehead Prop":"Prop","Tighthead Prop":"Prop","Hooker":"Hooker",
    "Lock":"Lock","Blindside Flanker":"Flanker","Openside Flanker":"Flanker",
    "Number 8":"No.8","Scrum-half":"SH","Fly-half":"FH",
    "Inside Centre":"Centre","Outside Centre":"Centre",
    "Left Wing":"Wing","Right Wing":"Wing","Fullback":"FB"
};

function getLionsTourRating(tour) {
    return tour.teamRating;
}

async function runLionsGauntlet() {
    const userR = getUserRating();
    let rung = 0;

    for (const year of LIONS_TOUR_ORDER) {
        const tour = LIONS_TOURS[year];
        const oppR = getLionsTourRating(tour);

        await addLog("", null);
        await addLogBlock('<div class="sim-log-divider"></div>');
        await addLog("MATCH " + (rung + 1) + " OF " + LIONS_TOUR_ORDER.length + ", " + year + " v " + tour.opponent, "var(--brand-gold)");
        await addLog("The series decider, " + tour.result + " on tour.", "var(--text-muted)");
        await addLog("", null);

        await addLog("Their XV:", "var(--brand-gold)");
        for (const p of tour.players) {
            const shortPos = LIONS_SHORT_POS[p.pos] || p.pos;
            const nation = p.nation.replace(/\s*'\d\d$/, "");
            await addLogBlock(
                '<div class="lions-lineup-row"><span class="ll-pos">' + shortPos +
                '</span><span class="ll-name">' + p.name +
                '</span><span class="ll-nation">' + nation + '</span></div>'
            );
        }

        await addLog("", null);
        await addLog("Their average rating: " + oppR + "  |  Your rating: " + userR, null);
        const prob = winProbability(userR, oppR);
        await addLog(oddsText(prob), "var(--text-muted)");
        await addLog(prob + "% chance of winning", "var(--text-muted)");
        await addLog("", null);
        await addLog("=== KICK OFF ===", "var(--brand-gold)");

        const res = simulateMatch(userR, oppR);
        await addLog(
            (res.won ? "WIN " : "LOSS") + "  " + res.userScore + "-" + res.oppScore,
            res.won ? "#4ade80" : "#f87171"
        );
        matchHistory.push({ stage:"Lions " + year, opponent:"Lions " + year + " v " + tour.opponent, userScore:res.userScore, oppScore:res.oppScore, won:res.won });
        await addScoreBreakdownLogForBoss(userTeam, res.userScore, bossTeamToLineup(tour), res.oppScore);

        if (!res.won) {
            await addLog("", null);
            await addLog("The tour ends there. You reached match " + (rung + 1) + " of " + LIONS_TOUR_ORDER.length + ", beating every Lions team up to " + (rung > 0 ? LIONS_TOUR_ORDER[rung - 1] : "none") + ".", "#f87171");
            await showResultsSummary();
            showShareButton("Lions Tours, reached match " + (rung + 1) + " of " + LIONS_TOUR_ORDER.length, "#c5a059");
            restartBtn.classList.remove("hidden");
            return;
        }

        rung++;
        if (rung < LIONS_TOUR_ORDER.length) {
            await addLog("Onward to the next tour...", "#4ade80");
        }
    }

    await addLog("", null);
    await addLog("EVERY LIONS TOUR SINCE 1989, BEATEN.", "var(--brand-gold)");
    await addLog("One challenge remains: the British & Irish Lions All Time XV.", "var(--brand-gold)");

    const boss = BOSS_TEAMS.lions;
    const bossR = getBossRating(boss);

    await addLog("", null);
    await addLogBlock('<div class="sim-log-divider"></div>');
    await addLog("🔴 BOSS, BRITISH & IRISH LIONS ALL TIME", "var(--brand-gold)");
    await addLog(boss.flavour, "var(--text-muted)");
    await addLog("", null);
    await addLog("Their XV:", "var(--brand-gold)");
    for (const p of boss.players) {
        const shortPos = LIONS_SHORT_POS[p.pos] || p.pos;
        const nation = p.nation.replace(/\s*'\d\d$/, "");
        await addLogBlock(
            '<div class="lions-lineup-row"><span class="ll-pos">' + shortPos +
            '</span><span class="ll-name">' + p.name +
            '</span><span class="ll-nation">' + nation + '</span></div>'
        );
    }
    await addLog("", null);
    await addLog("Their average rating: " + bossR + "  |  Your rating: " + userR, null);
    const bossProb = winProbability(userR, bossR);
    await addLog(oddsText(bossProb), "var(--text-muted)");
    await addLog(bossProb + "% chance of winning", "var(--text-muted)");
    await addLog("", null);
    await addLog("=== KICK OFF ===", "var(--brand-gold)");

    const bres = simulateMatch(userR, bossR);
    await addLog(
        (bres.won ? "WIN " : "LOSS") + "  " + bres.userScore + "-" + bres.oppScore,
        bres.won ? "#4ade80" : "#f87171"
    );
    matchHistory.push({ stage:"Lions Boss", opponent:boss.name, userScore:bres.userScore, oppScore:bres.oppScore, won:bres.won });
    await addScoreBreakdownLogForBoss(userTeam, bres.userScore, bossTeamToLineup(boss), bres.oppScore);

    if (!bres.won) {
        await addLog("", null);
        await addLog("The Lions All Time XV hold firm. Ten tours beaten, but the greatest Lions XV ever assembled was a step too far.", "#c5a059");
        showShareButton("Lions Tours, fell to the Lions All Time XV", "#c5a059");
    } else {
        await addLog("", null);
        await addLog("THE LIONS ALL TIME XV ARE BEATEN. Every Lions tour since 1989, and the greatest Lions side ever picked. Legendary.", "var(--brand-gold)");
        showShareButton("LEGENDARY, Beat the Lions All Time XV", "#c5a059");
    }
    await showResultsSummary();
    restartBtn.classList.remove("hidden");
}

// ============================================================
// LOADING SCREEN
// ============================================================
// Shows the logo full-screen on a genuinely fresh visit, then fades it
// out after a minimum display time so it registers as intentional rather
// than a flicker. Skipped entirely on repeat visits within the same
// session (Play Again / Abandon Campaign trigger a real page reload via
// hardReload(), which sets the sessionStorage flag below) — the user has
// already seen it once and is just restarting a game, not opening the
// site fresh.
(function () {
    const screen = document.getElementById("loading-screen");
    if (!screen) return;

    let hasPlayedBefore = false;
    try { hasPlayedBefore = sessionStorage.getItem("hasPlayedBefore") === "1"; } catch (e) {}

    if (hasPlayedBefore) {
        screen.remove();
        return;
    }

    const MIN_DISPLAY_MS = 1800;
    const shownAt = Date.now();

    function dismissLoadingScreen() {
        const elapsed = Date.now() - shownAt;
        const wait = Math.max(0, MIN_DISPLAY_MS - elapsed);
        setTimeout(() => {
            screen.classList.add("loading-fade-out");
            setTimeout(() => screen.remove(), 450); // matches CSS transition duration
        }, wait);
    }

    if (document.readyState === "complete") {
        dismissLoadingScreen();
    } else {
        window.addEventListener("load", dismissLoadingScreen);
    }
})();

// ============================================================
// ONBOARDING TIPS
// ============================================================
// Small, dismissible instructional popups shown at points in the flow
// that genuinely aren't self-explanatory. Two independent controls:
//   - "Don't show these tips again" checkbox -> localStorage, persists
//     forever until cleared (so it naturally resets in incognito, where
//     localStorage isn't shared with normal browsing — no special-casing
//     needed for that case).
//   - Per-tip "seen" tracking -> sessionStorage, so each distinct tip
//     only shows once per browser session even if the user keeps the
//     opt-out unchecked, rather than re-showing every single time the
//     user reaches that screen again within the same session.
const TIPS = {
    draftIntro: {
        icon: "🎲",
        title: "Building Your Squad",
        body: () => `Click <strong>Spin Team</strong> to draw a random historical squad. Pick any player from it, then click an open position on the pitch to slot them in. ${appMode === "lions" ? "Green" : "Gold"} positions are their natural fit; amber positions carry a rating penalty. Once you've placed them, the button changes back to <strong>Spin Team</strong> again ready for the next pick. Repeat until all 15 spots are filled.`
    },
    simIntro: {
        icon: "🏉",
        title: "Ready to Simulate",
        body: () => appMode === "lions"
            ? `Choose a <strong>Simulation Speed</strong>, then click <strong>Kick Off Tour</strong>. You'll face every Lions series decider since 1989, one tour at a time, until you either lose or clear the lot. Just sit back and watch the results roll in.`
            : `Choose a <strong>Simulation Speed</strong>, then click <strong>Kick Off Tournament</strong>. The whole World Cup, pool stage through to the Final, plays out automatically. Just sit back and watch the results roll in.`
    }
};

function showTip(key) {
    const tip = TIPS[key];
    if (!tip) return;

    let optedOut = false;
    try { optedOut = localStorage.getItem("tipsDisabled") === "1"; } catch (e) {}
    if (optedOut) return;

    let alreadySeen = false;
    try { alreadySeen = sessionStorage.getItem("tipSeen_" + key) === "1"; } catch (e) {}
    if (alreadySeen) return;

    const overlay = document.getElementById("tip-overlay");
    if (!overlay) return;

    document.getElementById("tip-icon").textContent = tip.icon;
    document.getElementById("tip-title").textContent = tip.title;
    document.getElementById("tip-body").innerHTML = typeof tip.body === "function" ? tip.body() : tip.body;
    document.getElementById("tip-dontshow-checkbox").checked = false;
    overlay.classList.remove("hidden");

    try { sessionStorage.setItem("tipSeen_" + key, "1"); } catch (e) {}
}

function setupTipOverlay() {
    const overlay = document.getElementById("tip-overlay");
    const closeBtn = document.getElementById("tip-close-btn");
    const gotItBtn = document.getElementById("tip-gotit-btn");
    const dontShowCheckbox = document.getElementById("tip-dontshow-checkbox");
    if (!overlay || !closeBtn || !gotItBtn || !dontShowCheckbox) return;

    function dismiss() {
        if (dontShowCheckbox.checked) {
            try { localStorage.setItem("tipsDisabled", "1"); } catch (e) {}
        }
        overlay.classList.add("hidden");
    }
    closeBtn.addEventListener("click", dismiss);
    gotItBtn.addEventListener("click", dismiss);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) dismiss(); });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupTipOverlay);
} else {
    setupTipOverlay();
}
