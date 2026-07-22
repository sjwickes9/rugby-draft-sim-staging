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

    // Club sides grouped by the nation they belong to, each with kit
    // colours. A personality that favours a nation or hemisphere is named
    // for a club that fits, so the name and colours reflect the bias.
    const CLUBS = {
        "Ireland":      [["Leinster","#0C3D2E","#8AB8E6"],["Munster","#7B0000","#FFFFFF"],["Ulster","#D20000","#FFFFFF"],["Connacht","#12724C","#FFFFFF"]],
        "Scotland":     [["Glasgow","#003865","#E8A200"],["Edinburgh","#8C1D40","#111111"]],
        "Wales":        [["Cardiff","#0033A0","#111111"],["Ospreys","#111111","#E8A200"],["Scarlets","#D0103A","#111111"],["Dragons","#C8102E","#111111"]],
        "England":      [["Saracens","#111111","#D0103A"],["Harlequins","#0B1E3B","#7BC143"],["Leicester","#00573F","#FFFFFF"],["Northampton","#5C0F2E","#111111"],["Bath","#0033A0","#111111"],["Bristol","#C8102E","#111111"],["Exeter","#111111","#E8A200"],["Sale","#0033A0","#FFFFFF"]],
        "France":       [["Toulouse","#C8102E","#111111"],["Toulon","#C8102E","#111111"],["Clermont","#0B1E3B","#E8A200"],["Racing","#87CEEB","#FFFFFF"],["Bordeaux","#7B0000","#111111"],["Montpellier","#004B87","#E8820A"],["La Rochelle","#111111","#E8A200"],["Lyon","#C8102E","#0033A0"]],
        "New Zealand":  [["Crusaders","#C8102E","#111111"],["Blues","#0033A0","#FFFFFF"],["Chiefs","#111111","#E8A200"],["Hurricanes","#E8A200","#111111"],["Highlanders","#0B1E3B","#E8A200"]],
        "Australia":    [["Brumbies","#111111","#E8A200"],["Waratahs","#0033A0","#FFFFFF"],["Reds","#7B0000","#111111"],["Force","#0B1E3B","#E8A200"],["Rebels","#C8102E","#111111"]],
        "South Africa": [["Stormers","#004B87","#FFFFFF"],["Bulls","#7B0000","#111111"],["Sharks","#111111","#000000"],["Lions","#C8102E","#111111"],["Cheetahs","#E8820A","#FFFFFF"]],
        "Italy":        [["Benetton","#12724C","#FFFFFF"],["Zebre","#FFFFFF","#111111"]],
        "Argentina":    [["Jaguares","#6CACE4","#FFFFFF"]],
        "Japan":        [["Sunwolves","#C8102E","#111111"]]
    };
    const SOUTH_NAMES = ["New Zealand", "Australia", "South Africa", "Argentina"];

    // A flat fallback list, used when a bias has no clubs to draw from.
    const NAMES = Object.keys(CLUBS).reduce(function (a, k) {
        return a.concat(CLUBS[k].map(function (c) { return c[0]; }));
    }, []);

    // Choose a club that suits a personality, returning name and kit. A
    // nation bias picks from that nation; a hemisphere bias picks from that
    // hemisphere; otherwise anywhere. Falls back to random when a bias has
    // no clubs.
    function clubFor(traits, rng, taken) {
        let nations = Object.keys(CLUBS);
        if (traits && traits.nation && CLUBS[traits.nation]) {
            nations = [traits.nation];
        } else if (traits && traits.hemisphere) {
            const south = traits.hemisphere === "south";
            nations = nations.filter(function (n) {
                return (SOUTH_NAMES.indexOf(n) !== -1) === south;
            });
            if (!nations.length) nations = Object.keys(CLUBS);
        }
        // gather candidate clubs not already used
        let clubs = [];
        nations.forEach(function (n) {
            CLUBS[n].forEach(function (c) { if (!taken[c[0]]) clubs.push(c); });
        });
        if (!clubs.length) {
            // every fitting club taken: fall back to any free club
            Object.keys(CLUBS).forEach(function (n) {
                CLUBS[n].forEach(function (c) { if (!taken[c[0]]) clubs.push(c); });
            });
        }
        if (!clubs.length) return { name: "Invitational", kit: "#8899AA", kit2: "#FFFFFF" };
        const c = clubs[Math.floor(rng() * clubs.length)];
        return { name: c[0], kit: c[1], kit2: c[2] };
    }

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

            const club = clubFor(traits, rng, taken);
            taken[club.name] = 1;
            seats.push({
                uid: "ai_" + Math.floor(rng() * 1e9).toString(36) + "_" + seats.length,
                name: club.name,
                kit: club.kit,
                kit2: club.kit2,
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

        // The same forced-nations guard the ordinary auto-pick uses. Without
        // it an AI chasing its traits will happily finish a nation short of
        // a minimum-nations rule, since traits reorder but do not enforce.
        const needNations = MPPicks.nationsStillForced
            ? MPPicks.nationsStillForced(squad, active, empties.length)
            : null;
        function nationOk(player) {
            if (!needNations) return true;
            return !!(player.country && !needNations[player.country]);
        }

        const cands = [];
        for (let s = 0; s < empties.length; s++) {
            const slotId = empties[s];
            const slot = MPPicks.slotById(slotId);
            for (let i = 0; i < pool.length; i++) {
                const p = pool[i];
                if (taken[MPPicks.personKey(p)] || !nationOk(p)) continue;
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
        if (traits.discipline < 0.7) bits.push("drafts erratically");
        return bits.length ? bits.join(", ") : "no strong preferences";
    }

    return {
        NAMES, CLUBS, NORTH, mulberry32, makeTraits, makeSeats, similar, clubFor,
        score, chemGain, pick, describe
    };
});
