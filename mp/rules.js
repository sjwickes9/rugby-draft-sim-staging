// ============================================================
// RUGBY XV DRAFT: MULTIPLAYER RULES ENGINE
// Slice 2: declarative constraint rules (spec section 7)
// ============================================================
// Three rules, each a declarative spec that self-disables or
// self-adjusts as the pool context changes:
//   7.1 Max 3 per tournament
//   7.2 Max N per country (self-adjusting)
//   7.3 One player from each tournament
//
// Also provides the pick-time validator the draft board calls to
// mark a candidate ineligible with an inline reason (spec section 9).
//
// Pure logic. No backend, no DOM. Reuses MPEngine for constants.
// UK English. No em dashes or en dashes.
// ============================================================

(function (root, factory) {
    let engine = null;
    if (typeof module === "object" && module.exports) {
        engine = require("./engine.js");
        module.exports = factory(engine);
    } else {
        root.MPRules = factory(root.MPEngine);
    }
})(typeof self !== "undefined" ? self : this, function (MPEngine) {

    const SQUAD_SIZE = (MPEngine && MPEngine.SQUAD_SIZE) || 15;
    const ALL_YEARS = (MPEngine && MPEngine.ALL_YEARS) ||
        ["1987", "1991", "1995", "1999", "2003", "2007", "2011", "2015", "2019", "2023"];

    // ── Derivation helpers (spec 7.2) ───────────────────────
    // Cap by window width: the more tournaments in play, the more
    // versions of a country exist, so the cap tightens.
    function windowWidthCap(tournaments) {
        if (tournaments >= 9) return 3;   // 9 to 10
        if (tournaments >= 6) return 4;   // 6 to 8
        if (tournaments >= 3) return 5;   // 3 to 5
        return 6;                          // 1 to 2
    }

    // Hard floor by group size: a cap below this cannot fill fifteen
    // slots no matter how positions are juggled.
    function countryFloor(countriesPresent) {
        return Math.ceil(SQUAD_SIZE / Math.max(1, countriesPresent));
    }

    // The effective max-per-country cap. The engine takes the stricter of
    // the two derivations, then never drops below the hard floor, so a
    // small group self-adjusts the cap upward rather than becoming
    // unfillable. In career mode there is no window-width axis, so a flat
    // default stands in for it.
    function effectiveCountryCap(ctx) {
        const base = ctx.mode === "career" ? 3 : windowWidthCap(ctx.tournaments);
        const floor = countryFloor(ctx.countriesPresent);
        return { cap: Math.max(base, floor), base: base, floor: floor };
    }

    // ── Rule registry (spec 7) ──────────────────────────────
    // Each rule: id, label, requires (availability), warnIf, value, a
    // pick-time check returning null (ok) or a reason string, and any
    // conflicts. None of these three conflict with each other.
    const RULES = [
        {
            id: "maxPerTournament",
            label: "Max 3 per tournament",
            requires: ctx => ctx.mode === "tournament" && ctx.tournaments >= 5,
            warnIf:   ctx => ctx.mode === "tournament" && ctx.tournaments === 5,
            warnText: "At exactly 5 tournaments this forces 3 from each, a partition rather than a cap. Allowed, but deliberate.",
            value:    ctx => 3,
            conflicts: [],
            check: (picks, cand, val) => {
                const n = picks.filter(p => p.year === cand.year).length;
                return n >= val ? ("would break max " + val + " from " + cand.year) : null;
            }
        },
        {
            id: "maxPerCountry",
            label: "Max N per country",
            requires: ctx => true,                 // always available, self-adjusts
            warnIf:   ctx => false,
            warnText: "",
            value:    ctx => effectiveCountryCap(ctx).cap,
            conflicts: [],
            check: (picks, cand, val) => {
                const n = picks.filter(p => p.country === cand.country).length;
                return n >= val ? ("would break max " + val + " " + cand.country) : null;
            }
        },
        {
            id: "onePerTournament",
            label: "One player from each tournament",
            // Auto-satisfied at a single tournament, and cannot ask for
            // more distinct tournaments than there are squad slots.
            requires: ctx => ctx.mode === "tournament" && ctx.tournaments >= 2 && ctx.tournaments <= SQUAD_SIZE,
            warnIf:   ctx => false,
            warnText: "",
            value:    ctx => ctx.tournaments,       // locks T of the 15 slots
            conflicts: [],
            // Feasibility guard: a pick from an already-covered tournament
            // is ineligible if it would leave too few free slots to still
            // cover every remaining tournament.
            check: (picks, cand, val, ctx) => {
                const covered = new Set(picks.map(p => p.year));
                if (!covered.has(cand.year)) return null;      // covering a new tournament is always fine
                const slotsAfter = SQUAD_SIZE - picks.length - 1;
                const uncovered = ctx.yearsInWindow.filter(y => !covered.has(y)).length;
                return slotsAfter < uncovered
                    ? "would leave too few slots to cover every tournament"
                    : null;
            }
        }
    ];

    // ── Context ─────────────────────────────────────────────
    // Build the evaluation context from the room's pool filters and the
    // engine's pool analysis.
    function buildContext(filters, analysis) {
        const f = filters || {};
        const mode = f.mode === "career" ? "career" : "tournament";
        const yMin = f.yearMin != null ? String(f.yearMin) : ALL_YEARS[0];
        const yMax = f.yearMax != null ? String(f.yearMax) : ALL_YEARS[ALL_YEARS.length - 1];
        const yearsInWindow = mode === "career" ? [] : ALL_YEARS.filter(y => y >= yMin && y <= yMax);
        return {
            mode: mode,
            tournaments: yearsInWindow.length,
            yearsInWindow: yearsInWindow,
            countriesPresent: analysis ? analysis.uniqueCountries : 26
        };
    }

    // ── Evaluate rules for the settings screen ──────────────
    // enabledMap: { ruleId: boolean } of what the host has toggled on.
    // Returns one row per rule describing availability, effective enabled
    // state, resolved value and any warning, so the settings UI can grey
    // out unavailable rules and show self-adjusted values.
    function evaluateRules(context, enabledMap) {
        const em = enabledMap || {};
        // First pass: availability and requested state.
        const rows = RULES.map(rule => {
            const available = !!rule.requires(context);
            const requested = !!em[rule.id];
            return {
                id: rule.id,
                label: rule.label,
                available: available,
                enabled: available && requested,   // may be cleared by conflicts below
                value: available ? rule.value(context) : null,
                warn: available && requested && !!rule.warnIf(context),
                warnText: (available && requested && rule.warnIf(context)) ? rule.warnText : "",
                unavailableReason: available ? "" : unavailableReason(rule, context)
            };
        });
        // Second pass: disable any rule that conflicts with an enabled one.
        for (const row of rows) {
            if (!row.enabled) continue;
            const rule = RULES.find(r => r.id === row.id);
            for (const cid of rule.conflicts) {
                const other = rows.find(r => r.id === cid && r.enabled);
                if (other) { row.enabled = false; row.conflictedWith = cid; }
            }
        }
        return rows;
    }

    function unavailableReason(rule, ctx) {
        if (ctx.mode === "career" && (rule.id === "maxPerTournament" || rule.id === "onePerTournament")) {
            return "Not available in career peak mode (no tournament identity).";
        }
        if (rule.id === "maxPerTournament") return "Needs at least 5 tournaments in the window.";
        if (rule.id === "onePerTournament") return "Auto-satisfied at a single tournament.";
        return "Not available for this window.";
    }

    // ── Are the chosen rules satisfiable at all? ────────────
    // Some combinations cannot produce a legal XV no matter how well you
    // draft. Three nations with a cap of four each is twelve players for
    // fifteen shirts. That must be caught before a room starts, not
    // discovered at pick thirteen.
    function rulesFeasible(context, enabledMap, analysis) {
        const reasons = [];
        const active = activeConstraints(context, enabledMap || {});
        const byId = {};
        active.forEach(function (r) { byId[r.id] = r.value; });

        const nations = (analysis && analysis.uniqueCountries) || context.countriesPresent || 0;
        if (byId.maxPerCountry != null && nations) {
            const capacity = nations * byId.maxPerCountry;
            if (capacity < SQUAD_SIZE) {
                reasons.push("Max " + byId.maxPerCountry + " per nation across "
                    + nations + " nation" + (nations === 1 ? "" : "s")
                    + " allows only " + capacity + " players, and an XV needs " + SQUAD_SIZE + ".");
            } else if (capacity === SQUAD_SIZE) {
                // Exactly fifteen means every nation must contribute exactly
                // the cap, with no room to work around a shortage at any
                // position. In practice that cannot be drafted legally.
                reasons.push("Max " + byId.maxPerCountry + " per nation across " + nations
                    + " nations allows exactly " + SQUAD_SIZE + " players, so every nation must "
                    + "supply exactly " + byId.maxPerCountry + ". Any shortage at one position "
                    + "makes a legal XV impossible. Widen the pool or drop this rule.");
            }
        }

        const tourns = context.tournaments || 0;
        if (byId.maxPerTournament != null && tourns) {
            const capacity = tourns * byId.maxPerTournament;
            if (capacity < SQUAD_SIZE) {
                reasons.push("Max " + byId.maxPerTournament + " per tournament across "
                    + tourns + " tournament" + (tourns === 1 ? "" : "s")
                    + " allows only " + capacity + " players, and an XV needs " + SQUAD_SIZE + ".");
            }
        }

        if (byId.onePerTournament != null && byId.onePerTournament > SQUAD_SIZE) {
            reasons.push("One from each of " + byId.onePerTournament
                + " tournaments cannot fit into " + SQUAD_SIZE + " slots.");
        }

        // The two caps can also fight each other.
        if (byId.maxPerCountry != null && byId.onePerTournament != null && nations) {
            if (nations * byId.maxPerCountry < byId.onePerTournament) {
                reasons.push("Covering " + byId.onePerTournament + " tournaments needs more players "
                    + "than " + byId.maxPerCountry + " per nation allows across " + nations + " nations.");
            }
        }

        return { ok: reasons.length === 0, reasons: reasons };
    }

    // ── Pick-time validation (spec section 9) ───────────────
    // Resolve the active constraints once per draft, then call isPickLegal
    // for each candidate. picks = this drafter's entries so far. Returns
    // { eligible, reason } with the first violated rule's inline reason.
    function activeConstraints(context, enabledMap) {
        return evaluateRules(context, enabledMap)
            .filter(r => r.enabled)
            .map(r => ({ id: r.id, value: r.value, check: RULES.find(x => x.id === r.id).check }));
    }

    function isPickLegal(picks, candidate, active, context) {
        for (const c of active) {
            const reason = c.check(picks, candidate, c.value, context);
            if (reason) return { eligible: false, reason: reason };
        }
        return { eligible: true, reason: "" };
    }

    return {
        RULES,
        windowWidthCap, countryFloor, effectiveCountryCap,
        buildContext, evaluateRules, activeConstraints, isPickLegal, rulesFeasible
    };
});
