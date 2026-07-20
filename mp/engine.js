// ============================================================
// RUGBY XV DRAFT: MULTIPLAYER ENGINE
// Slice 1: pool analysis and supply logic
// ============================================================
// Pure logic over the shared data.js. No backend, no DOM.
// Reads the global `allSquads` and `positionFamilyMap` when loaded
// via a script tag, and also exports for Node so it can be tested
// against the real data before it is wired to any screen.
//
// Conventions: UK English. No em dashes or en dashes.
// ============================================================

(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) {
        module.exports = api;          // Node (test harness)
    } else {
        root.MPEngine = api;           // browser (script tag)
    }
})(typeof self !== "undefined" ? self : this, function () {

    // ── Position grouping ───────────────────────────────────
    // The seven finer penalty groups (mirrors app.js POS_GROUP).
    // front-row merges props and hookers; half-back merges the two
    // half-backs; the back three splits into wing and fullback.
    const POS_GROUP = {
        "Loosehead Prop": "front-row", "Tighthead Prop": "front-row", "Hooker": "front-row",
        "Lock": "lock",
        "Blindside Flanker": "back-row", "Openside Flanker": "back-row", "Number 8": "back-row",
        "Scrum-half": "half-back", "Fly-half": "half-back",
        "Inside Centre": "centre", "Outside Centre": "centre",
        "Left Wing": "wing", "Right Wing": "wing",
        "Fullback": "fullback"
    };

    const PROP_POS = ["Loosehead Prop", "Tighthead Prop"];
    const ALL_YEARS = ["1987", "1991", "1995", "1999", "2003", "2007", "2011", "2015", "2019", "2023"];

    // ── Geography groups (spec 5.2) ─────────────────────────
    const GEO_GROUPS = {
        "Six Nations":        ["England", "France", "Ireland", "Italy", "Scotland", "Wales"],
        "Home Nations":       ["England", "Ireland", "Scotland", "Wales"],
        "Rugby Championship": ["Argentina", "Australia", "New Zealand", "South Africa"],
        "Tri Nations":        ["Australia", "New Zealand", "South Africa"],
        "Pacific Islands":    ["Fiji", "Samoa", "Tonga"],
        "Africa":             ["South Africa", "Namibia", "Zimbabwe", "Ivory Coast"],
        "Americas":           ["Argentina", "Canada", "USA", "Uruguay", "Chile"],
        "Europe":             ["England", "France", "Ireland", "Italy", "Scotland", "Wales", "Romania", "Georgia", "Portugal", "Russia", "Spain"],
        "Asia Pacific":       ["Japan", "Australia", "New Zealand", "Fiji", "Samoa", "Tonga"]
    };

    // ── Squad requirements ──────────────────────────────────
    // Fifteen slots. The front row is the only hard constraint:
    // 2 props + 1 hooker = 3 front-row bodies per drafter. Any
    // front-row-eligible player can fill any front-row node (a
    // prop-hooker cross is a flat 3-point penalty, not forbidden),
    // so the hard supply unit is simply "front-row-eligible player".
    const SQUAD_SIZE = 15;
    const FRONT_ROW_PER_SQUAD = 3;

    // Below this many nations present, warn about variety. This is NOT a
    // start gate. A window with two well-stocked nations (for example
    // Africa from 2007, which is South Africa and Namibia) supports a full
    // draft comfortably. Viability is decided by player supply alone;
    // nation count only affects how varied the pool feels.
    const NATION_VARIETY_WARN = 3;

    // ── Player predicates ───────────────────────────────────
    function positionsOf(player) {
        return Array.isArray(player.positions) ? player.positions : [];
    }

    function isFrontRow(player) {
        return positionsOf(player).some(p => POS_GROUP[p] === "front-row");
    }

    function isPropCapable(player) {
        return positionsOf(player).some(p => PROP_POS.indexOf(p) !== -1);
    }

    function isHookerCapable(player) {
        return positionsOf(player).indexOf("Hooker") !== -1;
    }

    function isKicker(entry) {
        return entry.kicker === true;
    }

    // Unique families a player is recognised in, using positionFamilyMap
    // (the eight draft families). Falls back gracefully if the map is absent.
    function familiesOf(player, familyMap) {
        const map = familyMap || (typeof positionFamilyMap !== "undefined" ? positionFamilyMap : {});
        const out = [];
        for (const p of positionsOf(player)) {
            const fam = map[p];
            if (fam && out.indexOf(fam) === -1) out.push(fam);
        }
        return out;
    }

    // ── Pool construction ───────────────────────────────────
    // Filters: { yearMin, yearMax, countries (array or null for all),
    //            mode: "tournament" | "career" }
    // Returns an array of pool entries. In tournament mode each entry
    // is one player-tournament. In career mode entries are collapsed to
    // one per player (keyed on country + name); positions are unioned
    // across the player's in-window appearances so the career-peak
    // version is their most complete self, and kicker is true if flagged
    // in any in-window appearance.
    function buildPool(allSquadsData, filters) {
        const f = filters || {};
        const mode = f.mode === "career" ? "career" : "tournament";
        const yearMin = f.yearMin != null ? String(f.yearMin) : ALL_YEARS[0];
        const yearMax = f.yearMax != null ? String(f.yearMax) : ALL_YEARS[ALL_YEARS.length - 1];
        const countrySet = f.countries && f.countries.length
            ? new Set(f.countries)
            : null;

        const yearsInWindow = ALL_YEARS.filter(y => y >= yearMin && y <= yearMax);

        const tournamentEntries = [];
        for (const country of Object.keys(allSquadsData)) {
            if (countrySet && !countrySet.has(country)) continue;
            const byYear = allSquadsData[country];
            for (const year of yearsInWindow) {
                const squad = byYear[year];
                if (!squad) continue;
                for (const player of squad) {
                    tournamentEntries.push({
                        name: player.name,
                        country: country,
                        year: year,
                        positions: positionsOf(player).slice(),
                        rating: player.rating,
                        careerRating: player.careerRating,
                        kicker: player.kicker === true
                    });
                }
            }
        }

        if (mode === "tournament") return tournamentEntries;

        // Career peak: collapse to one entry per player.
        const byPlayer = new Map();
        for (const e of tournamentEntries) {
            const key = e.country + "|" + e.name;
            let acc = byPlayer.get(key);
            if (!acc) {
                acc = {
                    name: e.name,
                    country: e.country,
                    year: null,               // tournament identity removed
                    positions: [],
                    rating: e.careerRating,   // career peak uses careerRating
                    careerRating: e.careerRating,
                    kicker: false
                };
                byPlayer.set(key, acc);
            }
            for (const p of e.positions) if (acc.positions.indexOf(p) === -1) acc.positions.push(p);
            if (e.kicker) acc.kicker = true;
            // careerRating is constant per player, but guard anyway
            if (e.careerRating > acc.careerRating) { acc.careerRating = e.careerRating; acc.rating = e.careerRating; }
        }
        return Array.from(byPlayer.values());
    }

    // ── Supply analysis ─────────────────────────────────────
    // Given a built pool, report the numbers the lobby needs and derive
    // the supported number of drafters. The hard ceiling is front-row
    // supply, not kicker supply (see spec 5.3 and 8).
    function analysePool(pool, familyMap) {
        const perCountry = {};
        let frontRow = 0, propCapable = 0, hookerCapable = 0, kickers = 0;

        for (const p of pool) {
            perCountry[p.country] = (perCountry[p.country] || 0) + 1;
            if (isFrontRow(p)) {
                frontRow++;
                if (isPropCapable(p)) propCapable++;
                if (isHookerCapable(p)) hookerCapable++;
            }
            if (isKicker(p)) kickers++;
        }

        const countriesPresent = Object.keys(perCountry).sort();

        // Derive supported drafters. Two independent ceilings:
        //  - headcount: each drafter needs 15 players
        //  - front row: each drafter needs 3 front-row-eligible players
        // The supported number is the stricter of the two. Front row is
        // almost always the binding one in a narrow window.
        // A pool with exactly enough players deadlocks: the last user is
        // left with whatever remains, and the front-row law means the
        // residue may not fit the slots still empty. Testing across 410
        // scenarios found deadlocks only at zero slack, and none once a
        // pool had any spare at all, so every user needs a spare player.
        const maxByHeadcount = Math.floor(pool.length / (SQUAD_SIZE + 1));
        const maxByFrontRow  = Math.floor(frontRow / FRONT_ROW_PER_SQUAD);
        const supportedPlayers = Math.min(maxByHeadcount, maxByFrontRow);

        let limitingFactor;
        if (maxByFrontRow < maxByHeadcount) limitingFactor = "front-row";
        else if (maxByHeadcount < maxByFrontRow) limitingFactor = "headcount";
        else limitingFactor = "balanced";

        return {
            entries: pool.length,
            uniqueCountries: countriesPresent.length,
            countriesPresent: countriesPresent,
            perCountry: perCountry,
            frontRow: { total: frontRow, propCapable: propCapable, hookerCapable: hookerCapable },
            kickers: kickers,
            maxByHeadcount: maxByHeadcount,
            maxByFrontRow: maxByFrontRow,
            supportedPlayers: supportedPlayers,
            limitingFactor: limitingFactor,
            viable: supportedPlayers >= 2,     // supply supports at least a two-player game
            thinCountries: countriesPresent.length < NATION_VARIETY_WARN
        };
    }

    // Convenience: filters straight to analysis.
    function feasibility(allSquadsData, filters, familyMap) {
        return analysePool(buildPool(allSquadsData, filters), familyMap);
    }

    // ── Start gate ──────────────────────────────────────────
    // The lobby calls this with the current room size. Returns whether
    // the draft may start and, if not, plain-language reasons the UI can
    // show. Two gates: enough nations present, and enough players for the
    // room. Front row is handled during the draft (the auto-pick
    // guarantee), not here, because it is not the binding supply ceiling.
    function canStart(analysis, roomSize) {
        const reasons = [];
        const warnings = [];
        if (analysis.supportedPlayers < roomSize) {
            reasons.push("This window supports " + analysis.supportedPlayers
                + " user" + (analysis.supportedPlayers === 1 ? "" : "s")
                + ", but the room has " + roomSize + ". Widen the window or remove a user.");
        }
        if (analysis.thinCountries) {
            warnings.push("Only " + analysis.uniqueCountries + " nation"
                + (analysis.uniqueCountries === 1 ? "" : "s")
                + " in this window, so squads will look alike.");
        }
        // A tight squeeze is playable but worth flagging: below roughly
        // twice the required supply, the later rounds get thin and forced
        // out-of-position picks become common.
        if (reasons.length === 0 && analysis.supportedPlayers < roomSize * 2) {
            warnings.push("Supply is tight for " + roomSize + " users, so expect forced out-of-position picks late on.");
        }
        return { ok: reasons.length === 0, reasons: reasons, warnings: warnings };
    }

    // Three-state verdict for the lobby: "ready", "advisory" or "blocked".
    // Advisory means the draft is possible but not advised.
    function poolStatus(analysis, roomSize) {
        const gate = canStart(analysis, roomSize);
        if (!analysis.viable || !gate.ok) {
            return { state: "blocked", label: "Fix pool", reasons: gate.reasons, warnings: gate.warnings };
        }
        if (gate.warnings.length) {
            return { state: "advisory", label: "Advisory", reasons: [], warnings: gate.warnings };
        }
        return { state: "ready", label: "Ready", reasons: [], warnings: [] };
    }

    // ── Readout text (spec 5.3) ─────────────────────────────
    // Kicker count is an advertisement, never a blocker. The block is on
    // nations present and on player supply, via canStart.
    function readoutText(analysis, filters) {
        const f = filters || {};
        const geo = f.geoLabel || (f.countries && f.countries.length ? f.countries.length + " nations" : "All nations");
        const yr = (f.yearMin != null && f.yearMax != null)
            ? (f.yearMin === f.yearMax ? String(f.yearMin) : f.yearMin + " to " + f.yearMax)
            : "1987 to 2023";

        if (!analysis.viable) {
            return geo + ", " + yr + ". Not enough players for a draft ("
                + analysis.entries + " players, " + analysis.frontRow.total + " front-row). Widen the window.";
        }
        const note = analysis.limitingFactor === "front-row" ? " (front-row supply)" : "";
        return geo + ", " + yr + ". Comfortable for up to "
            + analysis.supportedPlayers + " user" + (analysis.supportedPlayers === 1 ? "" : "s")
            + note + ". " + analysis.kickers + " recognised kickers available.";
    }

    // Per-tournament kicker counts, for validation and for any UI that
    // wants them. Mirrors the confirmed facts in spec section 2.
    function kickersByTournament(allSquadsData) {
        const out = {};
        for (const y of ALL_YEARS) out[y] = 0;
        for (const country of Object.keys(allSquadsData)) {
            for (const year of Object.keys(allSquadsData[country])) {
                for (const p of allSquadsData[country][year]) {
                    if (p.kicker === true) out[year] = (out[year] || 0) + 1;
                }
            }
        }
        return out;
    }

    return {
        POS_GROUP, GEO_GROUPS, ALL_YEARS,
        SQUAD_SIZE, FRONT_ROW_PER_SQUAD, NATION_VARIETY_WARN,
        isFrontRow, isPropCapable, isHookerCapable, isKicker, familiesOf,
        buildPool, analysePool, feasibility, canStart, poolStatus, readoutText, kickersByTournament
    };
});
