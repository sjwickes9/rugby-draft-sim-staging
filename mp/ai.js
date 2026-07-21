// ============================================================
// RUGBY XV DRAFT: MULTIPLAYER AI USERS
// Spec section 18
// ============================================================
// The auto-pick engine already drafts competently. This module gives
// several AI seats a reason to draft differently from one another, so a
// room of them does not produce near-identical squads.
//
// Everything here is seeded, because the whole simulation is deterministic
// and an unseeded AI would break replayability.
//
// Traits reorder legal candidates. They never widen the set: an AI may
// never draft an illegal squad, even where breaking a rule would produce
// a stronger one.
//
// Conventions: UK English. No em dashes or en dashes.
// ============================================================

(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) {
        module.exports = api;          // Node (test harness)
    } else {
        root.MPAI = api;               // browser (script tag)
    }
})(typeof self !== "undefined" ? self : this, function () {

    // Club sides from around the world. Deliberately decoupled from
    // personality, so nobody learns that a given name drafts a given way.
    // Nation names are avoided to prevent confusion with the squad data.
    const NAMES = [
        "Leinster", "Munster", "Ulster", "Connacht", "Glasgow", "Edinburgh",
        "Cardiff", "Ospreys", "Scarlets", "Dragons", "Saracens", "Harlequins",
        "Leicester", "Northampton", "Bath", "Bristol", "Exeter", "Gloucester",
        "Sale", "Newcastle", "Toulouse", "Toulon", "Clermont", "Racing",
        "Bordeaux", "Montpellier", "La Rochelle", "Castres", "Lyon", "Perpignan",
        "Crusaders", "Blues", "Chiefs", "Hurricanes", "Highlanders",
        "Brumbies", "Waratahs", "Reds", "Force", "Rebels",
        "Stormers", "Bulls", "Sharks", "Lions", "Cheetahs",
        "Benetton", "Zebre", "Jaguares", "Sunwolves", "Moana"
    ];

    // ── Seeded randomness ───────────────────────────────────
    function mulberry32(a) {
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    const NORTH = ["England", "Scotland", "Wales", "Ireland", "France", "Italy",
                   "Georgia", "Romania", "Russia", "Spain", "Portugal", "Canada",
                   "United States", "Japan", "Namibia", "Zimbabwe", "Ivory Coast",
                   "Tonga", "Samoa", "Fiji"];

    // ── Trait generation ────────────────────────────────────
    // Most traits are off most of the time. An AI with every trait active
    // would be a caricature rather than an opponent.
    function makeTraits(rng, pool) {
        const countries = {};
        (pool || []).forEach(function (p) { if (p.country) countries[p.country] = 1; });
        const list = Object.keys(countries);

        const t = {
            hemisphere: null,
            nation: null,
            era: null,
            history: Math.round(rng() * 100) / 100,
            pack: Math.round((rng() * 2 - 1) * 100) / 100,
            chemistry: Math.round(rng() * 100) / 100,
            discipline: Math.round((0.55 + rng() * 0.45) * 100) / 100
        };
        if (rng() < 0.30) t.hemisphere = rng() < 0.5 ? "north" : "south";
        if (rng() < 0.25 && list.length) t.nation = list[Math.floor(rng() * list.length)];
        if (rng() < 0.25) t.era = rng() < 0.5 ? "early" : "late";
        return t;
    }

    // Generate a set of AI seats with a spread of personalities rather than
    // three similar ones by chance.
    function makeSeats(count, pool, seed, usedNames) {
        const rng = mulberry32(seed || Math.floor(Math.random() * 1e9));
        const taken = {};
        (usedNames || []).forEach(function (n) { taken[n] = 1; });
        const seats = [];
        let guard = 0;
        while (seats.length < count && guard++ < 400) {
            const traits = makeTraits(rng, pool);
            // Reject a personality too close to one already drawn, so the
            // room gets variety rather than three of the same opponent.
            const clash = seats.some(function (s) { return similar(s.traits, traits); });
            if (clash && seats.length < NAMES.length) continue;

            let name = NAMES[Math.floor(rng() * NAMES.length)];
            let n = 0;
            while (taken[name] && n++ < NAMES.length) {
                name = NAMES[Math.floor(rng() * NAMES.length)];
            }
            taken[name] = 1;
            seats.push({
                uid: "ai_" + Math.floor(rng() * 1e9).toString(36) + "_" + seats.length,
                name: name,
                traits: traits,
                seed: Math.floor(rng() * 1e9)
            });
        }
        return seats;
    }

    function similar(a, b) {
        return a.hemisphere === b.hemisphere
            && a.nation === b.nation
            && a.era === b.era
            && Math.abs(a.pack - b.pack) < 0.3
            && Math.abs(a.chemistry - b.chemistry) < 0.3;
    }

    // ── Trait scoring ───────────────────────────────────────
    // Modifiers are small relative to rating gaps, for the same reason
    // chemistry is capped: a trait should shape a squad's character, not
    // override player quality. A strong England bias should mean more
    // English players than average, not fifteen of them.
    const W = {
        hemisphere: 3,
        nation: 5,
        era: 3,
        history: 3,
        pack: 3,
        chemistry: 6
    };

    function isNorth(country) { return NORTH.indexOf(country) !== -1; }

    // A nation's tournament record, used by the history trait. Derived from
    // the pool rather than hard coded, so it follows the data.
    function historyScore(country, strength) {
        return (strength && strength[country]) || 0;
    }

    function score(player, slotId, traits, ctx) {
        let s = 0;
        if (!traits) return s;

        if (traits.hemisphere) {
            const north = isNorth(player.country);
            if ((traits.hemisphere === "north") === north) s += W.hemisphere;
        }
        if (traits.nation && player.country === traits.nation) s += W.nation;

        if (traits.era && ctx && ctx.years && ctx.years.length > 1) {
            const yrs = (player.years && player.years.length)
                ? player.years.map(Number)
                : (player.year ? [Number(player.year)] : []);
            if (yrs.length) {
                const mid = (Number(ctx.years[0]) + Number(ctx.years[ctx.years.length - 1])) / 2;
                const avg = yrs.reduce(function (a, b) { return a + b; }, 0) / yrs.length;
                if ((traits.era === "early") === (avg < mid)) s += W.era;
            }
        }
        if (traits.history) s += traits.history * W.history * historyScore(player.country, ctx && ctx.strength);

        if (traits.pack) {
            const num = (ctx && ctx.slotNum) ? ctx.slotNum : 0;
            const forward = num > 0 && num <= 8;
            if ((traits.pack < 0) === forward) s += Math.abs(traits.pack) * W.pack;
        }
        return s;
    }

    // How much a candidate would improve chemistry, for AI that chase links.
    function chemGain(player, slotId, squad, traits, opts) {
        if (!traits || !traits.chemistry || typeof MPChemRef() === "undefined") return 0;
        const C = MPChemRef();
        if (!C) return 0;
        const before = C.analyse(squad, opts).raw;
        const trial = {};
        Object.keys(squad).forEach(function (k) { trial[k] = squad[k]; });
        trial[slotId] = player;
        const after = C.analyse(trial, opts).raw;
        return Math.max(0, after - before) * traits.chemistry * (W.chemistry / 3);
    }

    function MPChemRef() {
        return (typeof MPChem !== "undefined") ? MPChem
            : (typeof require === "function" ? require("./chem.js") : null);
    }

    // ── Picking ─────────────────────────────────────────────
    // Traits reorder what auto-pick already considers legal. The legality
    // machinery, including the feasibility lookahead, runs unchanged.
    function pick(MPPicks, MPRules, pool, squad, taken, active, ruleCtx, seat, opts) {
        const traits = seat && seat.traits;
        const rng = mulberry32((seat && seat.seed || 1) + Object.keys(squad).length);

        // Every legal option auto-pick would entertain, scored by taste.
        const empties = MPPicks.emptySlots(squad);
        if (!empties.length) return null;

        const cands = [];
        for (let s = 0; s < empties.length; s++) {
            const slotId = empties[s];
            const slot = MPPicks.slotById(slotId);
            for (let i = 0; i < pool.length; i++) {
                const p = pool[i];
                if (taken[MPPicks.personKey(p)]) continue;
                const v = MPPicks.evaluate(p, slotId, squad, taken, active, ruleCtx,
                    MPRules.isPickLegal);
                if (!v.eligible) continue;
                if (MPPicks.wouldStrand && MPPicks.wouldStrand(pool, squad, taken, p, slotId,
                    active, ruleCtx, MPRules.isPickLegal)) continue;
                const ctx = Object.assign({ slotNum: slot.num }, opts || {});
                cands.push({
                    player: p, slotId: slotId,
                    s: v.effective + score(p, slotId, traits, ctx)
                        + chemGain(p, slotId, squad, traits, opts || {})
                });
            }
        }
        if (!cands.length) return null;

        cands.sort(function (a, b) { return b.s - a.s; });

        // Discipline decides how strictly it takes its own top choice. Low
        // discipline is what stops similar personalities drafting alike and
        // stops a human predicting them exactly.
        const d = (traits && traits.discipline) || 1;
        const window = Math.max(1, Math.round((1 - d) * 8));
        const idx = window > 1 ? Math.floor(rng() * Math.min(window, cands.length)) : 0;
        const chosen = cands[idx];
        return { player: chosen.player, slotId: chosen.slotId, from: "ai" };
    }

    // A readable personality, shown on the season summary once it is over.
    function describe(traits) {
        if (!traits) return "";
        const bits = [];
        if (traits.nation) bits.push("favours " + traits.nation);
        if (traits.hemisphere) bits.push(traits.hemisphere + "ern hemisphere");
        if (traits.era) bits.push(traits.era === "early" ? "older World Cups" : "recent World Cups");
        if (traits.chemistry > 0.6) bits.push("chases partnerships");
        if (traits.pack < -0.4) bits.push("builds around the pack");
        if (traits.pack > 0.4) bits.push("builds around the backs");
        if (traits.discipline < 0.7) bits.push("unpredictable");
        return bits.length ? bits.join(", ") : "no strong preferences";
    }

    return {
        NAMES, NORTH, mulberry32, makeTraits, makeSeats, similar,
        score, chemGain, pick, describe
    };
});
