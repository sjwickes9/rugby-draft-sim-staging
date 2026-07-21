// ============================================================
// RUGBY XV DRAFT: MULTIPLAYER CHEMISTRY
// Spec section 15: links between players who actually played together
// ============================================================
// Pure logic. No DOM, no backend. Given a squad it reports which of the
// seven defined links have formed, at what strength, and what the squad
// gains overall.
//
// The design intent is that chemistry decides a close match and never wins
// a tournament on its own. If stacking one nation's 2003 squad were the
// dominant strategy, drafting would stop being interesting, so the total
// gain is capped at a small percentage of the squad rating.
//
// Conventions: UK English. No em dashes or en dashes.
// ============================================================

(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) {
        module.exports = api;          // Node (test harness)
    } else {
        root.MPChem = api;             // browser (script tag)
    }
})(typeof self !== "undefined" ? self : this, function () {

    // The seven links, in the order they read on a team sheet. A link is a
    // pair of slots, or a group from which any two adjacent members count.
    const LINKS = [
        { id: "halves",    label: "Halfbacks",       slots: ["SH", "FH"] },
        { id: "frontRow",  label: "Front row",       slots: ["LH", "HK", "TH"], anyTwo: true },
        { id: "locks",     label: "Locks",           slots: ["L4", "L5"] },
        { id: "backRow",   label: "Back row",        slots: ["BF", "OF", "N8"], anyTwo: true },
        { id: "centres",   label: "Centres",         slots: ["IC", "OC"] },
        { id: "midfield",  label: "10 and 12",       slots: ["FH", "IC"] },
        { id: "backThree", label: "Back three",      slots: ["LW", "RW", "FB"], anyTwo: true }
    ];

    const FULL = 3;        // same nation, same squad: genuinely teammates
    const HALF = 1.5;      // same nation, different tournaments: plausible
    const CAP_FRACTION = 0.05;   // no squad gains more than 5% overall
    const NARROW_WINDOW = 2;     // at this many tournaments or fewer, halve

    // Two players are a full link when they were in the same squad. In
    // career peak mode a player carries no single tournament, so the test
    // becomes "did they ever share a squad", which is arguably the better
    // definition of having played together.
    function pairStrength(a, b, opts) {
        if (!a || !b) return 0;
        if (!a.country || !b.country) return 0;
        if (a.country !== b.country) return 0;

        const career = opts && opts.mode === "career";
        if (career) {
            const ya = yearsOf(a), yb = yearsOf(b);
            for (let i = 0; i < ya.length; i++) {
                if (yb.indexOf(ya[i]) !== -1) return FULL;
            }
            return HALF;
        }

        if (a.year && b.year && a.year === b.year) return FULL;
        return HALF;
    }

    // Every World Cup a player appears at. Career mode entries carry a list;
    // tournament mode entries carry a single year.
    function yearsOf(p) {
        if (Array.isArray(p.years) && p.years.length) return p.years.map(String);
        if (p.year) return [String(p.year)];
        return [];
    }

    // Which links have formed in this squad, and how strongly. Returns one
    // row per link so the draft panel can show them lighting up.
    function analyse(squad, opts) {
        opts = opts || {};
        const narrow = (opts.tournamentCount || 99) <= NARROW_WINDOW;
        const scale = narrow ? 0.5 : 1;

        const rows = LINKS.map(function (link) {
            let best = 0, who = null;

            if (link.anyTwo) {
                // Any two of the group count, and the strongest pair wins.
                for (let i = 0; i < link.slots.length; i++) {
                    for (let j = i + 1; j < link.slots.length; j++) {
                        const a = squad[link.slots[i]], b = squad[link.slots[j]];
                        const v = pairStrength(a, b, opts);
                        if (v > best) { best = v; who = [a, b]; }
                    }
                }
            } else {
                const a = squad[link.slots[0]], b = squad[link.slots[1]];
                best = pairStrength(a, b, opts);
                if (best) who = [a, b];
            }

            return {
                id: link.id,
                label: link.label,
                slots: link.slots,
                tier: best === FULL ? "full" : (best === HALF ? "half" : "none"),
                raw: best,
                value: best * scale,
                players: who ? who.map(function (p) { return p.name; }) : [],
                country: who ? who[0].country : ""
            };
        });

        const raw = rows.reduce(function (t, r) { return t + r.value; }, 0);
        return { links: rows, raw: raw, narrow: narrow };
    }

    // The most any squad could score: every link full.
    const MAX_RAW = LINKS.length * FULL;

    // The bonus actually applied. Raw link points are normalised against the
    // maximum achievable, then scaled to the cap. A flat minimum would let
    // two links saturate the bonus and make chemistry effectively binary;
    // normalising keeps it a gradient where each new link is worth having,
    // and only a fully linked squad reaches the ceiling.
    function bonus(squad, baseRating, opts) {
        const a = analyse(squad, opts);
        const ceiling = Math.max(0, (baseRating || 0) * CAP_FRACTION);
        const applied = ceiling * Math.min(1, a.raw / MAX_RAW);
        return {
            links: a.links,
            raw: Math.round(a.raw * 10) / 10,
            applied: Math.round(applied * 10) / 10,
            capped: a.raw >= MAX_RAW,
            ceiling: Math.round(ceiling * 10) / 10,
            narrow: a.narrow,
            formed: a.links.filter(function (r) { return r.tier !== "none"; }).length
        };
    }

    return {
        LINKS, FULL, HALF, CAP_FRACTION, NARROW_WINDOW, MAX_RAW,
        pairStrength, yearsOf, analyse, bonus
    };
});
