// ============================================================
// RUGBY XV DRAFT: MATCH SIMULATION
// Slice 10: deterministic seeded simulation (spec section 11)
// ============================================================
// A faithful port of simulateMatch from the single-player app.js, made
// deterministic so every client computes identical results:
//
//   1. Math.random is replaced by the room's seeded PRNG.
//   2. The one Math.pow call in the blowout curve is replaced by a
//      precomputed integer table. A non-integer exponent is the one
//      transcendental the ECMAScript spec allows engines to approximate
//      differently, so it could desync two devices on a lopsided
//      scoreline. Everything else in the sim uses round, floor, max, min
//      and abs, which are bit-identical across browsers.
//
// Pure logic. No DOM, no network.
// UK English. No em dashes or en dashes.
// ============================================================

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory();
    else root.MPSim = factory();
})(typeof self !== "undefined" ? self : this, function () {

    // Math.pow(extra, 1.7) * 0.04, in tenths of a point, for extra 0 to 200.
    // Precomputed so no transcendental runs at simulation time.
    var BLOWOUT_TENTHS = [
        0,0,1,3,4,6,8,11,14,17,20,24,27,31,36,40,45,49,54,60,
        65,71,77,83,89,95,102,108,115,123,130,137,145,153,161,169,177,185,194,203,
        212,221,230,239,249,259,268,278,289,299,309,320,331,341,352,364,375,386,398,410,
        422,434,446,458,471,483,496,509,522,535,548,561,575,588,602,616,630,644,659,673,
        688,702,717,732,747,762,778,793,809,824,840,856,872,888,904,921,937,954,971,988,
        1005,1022,1039,1057,1074,1092,1109,1127,1145,1163,1181,1200,1218,1237,1255,1274,1293,1312,1331,1350,
        1370,1389,1409,1429,1448,1468,1488,1508,1529,1549,1570,1590,1611,1632,1652,1674,1695,1716,1737,1759,
        1780,1802,1824,1846,1868,1890,1912,1934,1957,1979,2002,2025,2047,2070,2093,2117,2140,2163,2187,2210,
        2234,2258,2282,2306,2330,2354,2378,2403,2427,2452,2476,2501,2526,2551,2576,2602,2627,2652,2678,2703,
        2729,2755,2781,2807,2833,2859,2886,2912,2939,2965,2992,3019,3046,3073,3100,3127,3154,3182,3209,3237,
        3264
    ];

    function blowoutCurve(extra) {
        var e = extra < 0 ? 0 : (extra > 200 ? 200 : Math.round(extra));
        return BLOWOUT_TENTHS[e] / 10;
    }

    // ── Team rating ─────────────────────────────────────────
    // Forwards are shirts 1 to 8, backs 9 to 15. The strategy weighting is
    // inherited from app.js: 0 gives forwards 0.75 of the weight, 100 gives
    // them 0.25, 50 is balanced.
    function strategyForwardWeight(v) {
        return 0.75 - (v / 100) * 0.50;
    }

    function teamRating(squad, strategy) {
        var fwd = 0, fwdN = 0, bck = 0, bckN = 0;
        MPPicksRef().SLOTS.forEach(function (s) {
            var p = squad[s.id];
            if (!p) return;
            var eff = Math.max(0, (p.rating || 0) - MPPicksRef().oopPenalty(p, s.node));
            if (s.num <= 8) { fwd += eff; fwdN++; } else { bck += eff; bckN++; }
        });
        var f = fwdN ? Math.round(fwd / fwdN) : 0;
        var b = bckN ? Math.round(bck / bckN) : 0;
        var w = strategyForwardWeight(strategy == null ? 50 : strategy);
        return { forwards: f, backs: b, overall: Math.round(f * w + b * (1 - w)) };
    }

    function MPPicksRef() {
        return (typeof MPPicks !== "undefined") ? MPPicks : require("./picks.js");
    }

    // ── Kicker effect (spec section 10) ─────────────────────
    // Around 10.8 points a match come from the tee at a 72% success rate.
    // A kicker's deviation from that baseline is worth 0.15 points per
    // percentage point, which reproduces the calibration in the spec:
    // 50% costs about 3.3 points, 40% costs about 4.8.
    function kickerDelta(rate) {
        return (rate - 72) * 0.15;
    }

    // ── Match simulation ────────────────────────────────────
    // rng is the seeded generator for this fixture. Returns scores for
    // both sides plus league points.
    function simulateMatch(rng, ratingA, ratingB, kickA, kickB) {
        var diff = ratingA - ratingB;
        var absd = Math.abs(diff);
        var sign = diff >= 0 ? 1 : -1;
        var base = 22;

        var aBase, bBase;
        if (absd <= 15) {
            aBase = base + sign * absd * 0.75;
            bBase = base - sign * absd * 0.75;
        } else {
            var extra = absd - 15;
            var blowout = extra * 1.9 + blowoutCurve(extra);
            var winnerBase = base + 15 * 0.75 + blowout;
            var loserBase = Math.max(3, base - 15 * 0.75 - extra * 0.3);
            if (sign > 0) { aBase = winnerBase; bBase = loserBase; }
            else { aBase = loserBase; bBase = winnerBase; }
        }

        // The goal kicker shifts the points taken from the tee.
        aBase += kickerDelta(kickA == null ? 72 : kickA);
        bBase += kickerDelta(kickB == null ? 72 : kickB);

        var varRange;
        if (absd <= 10) varRange = 10;
        else if (absd <= 20) varRange = 8;
        else if (absd <= 30) varRange = 6;
        else varRange = 5;

        var v = function () { return Math.floor(rng() * (varRange * 2 + 1)) - varRange; };
        var aS = Math.max(3, Math.round(aBase + v()));
        var bS = Math.max(3, Math.round(bBase + v()));

        return finish(aS, bS);
    }

    function finish(aS, bS) {
        var margin = Math.abs(aS - bS);
        var drawn = aS === bS;
        return {
            a: aS, b: bS, drawn: drawn,
            winner: drawn ? null : (aS > bS ? "a" : "b"),
            margin: margin,
            // Four-try bonus approximated by margin, losing bonus within 7.
            aPts: drawn ? 2 : (aS > bS ? (margin > 21 ? 5 : 4) : (margin <= 7 ? 1 : 0)),
            bPts: drawn ? 2 : (bS > aS ? (margin > 21 ? 5 : 4) : (margin <= 7 ? 1 : 0))
        };
    }

    // ── Knockout resolution (spec section 11) ───────────────
    // World Cup law: twenty minutes of extra time, then sudden death, then
    // a place-kicking competition of five kicks each, then sudden death.
    function resolveKnockout(rng, result, kickA, kickB) {
        if (!result.drawn) return { result: result, path: "normal" };

        // Extra time: two tens, scored at a reduced rate.
        var aET = 0, bET = 0;
        for (var half = 0; half < 2; half++) {
            aET += Math.floor(rng() * 4) * 3;
            bET += Math.floor(rng() * 4) * 3;
        }
        if (aET !== bET) {
            var r1 = finish(result.a + aET, result.b + bET);
            return { result: r1, path: "extra time", extra: { a: aET, b: bET } };
        }

        // Sudden death: ten minutes, first score wins.
        var sd = rng();
        if (sd < 0.4) return { result: finish(result.a + aET + 3, result.b + bET), path: "sudden death", extra: { a: aET + 3, b: bET } };
        if (sd > 0.6) return { result: finish(result.a + aET, result.b + bET + 3), path: "sudden death", extra: { a: aET, b: bET + 3 } };

        // Place-kicking competition. This is where the kicker mechanic pays
        // off: a tighthead on the tee at 40% loses roughly two times in three.
        var shootout = kickingCompetition(rng, kickA, kickB);
        var res = finish(result.a + aET, result.b + bET);
        res.drawn = false;
        res.winner = shootout.winner;
        return { result: res, path: "kicking competition", shootout: shootout, extra: { a: aET, b: bET } };
    }

    function kickingCompetition(rng, kickA, kickB) {
        var rA = (kickA == null ? 72 : kickA) / 100;
        var rB = (kickB == null ? 72 : kickB) / 100;
        var a = 0, b = 0;
        var kicksA = [], kicksB = [];
        for (var i = 0; i < 5; i++) {
            var ha = rng() < rA; if (ha) a++; kicksA.push(ha);
            var hb = rng() < rB; if (hb) b++; kicksB.push(hb);
        }
        // Sudden death pairs until one misses and the other scores.
        var rounds = 0;
        while (a === b && rounds < 20) {
            var sa = rng() < rA, sb = rng() < rB;
            if (sa) a++; if (sb) b++;
            kicksA.push(sa); kicksB.push(sb);
            rounds++;
        }
        return { a: a, b: b, kicksA: kicksA, kicksB: kicksB, winner: a > b ? "a" : (b > a ? "b" : "a") };
    }

    // ── League table (spec sections 11, 14) ─────────────────
    function emptyRow(uid) {
        return { uid: uid, played: 0, won: 0, drawn: 0, lost: 0, pf: 0, pa: 0, pd: 0, bonus: 0, points: 0 };
    }

    function buildTable(uids, results) {
        var rows = {};
        uids.forEach(function (u) { rows[u] = emptyRow(u); });
        results.forEach(function (r) {
            var A = rows[r.home], B = rows[r.away];
            if (!A || !B) return;
            A.played++; B.played++;
            A.pf += r.a; A.pa += r.b;
            B.pf += r.b; B.pa += r.a;
            if (r.drawn) { A.drawn++; B.drawn++; }
            else if (r.winner === "a") { A.won++; B.lost++; }
            else { B.won++; A.lost++; }
            A.points += r.aPts; B.points += r.bPts;
        });
        return Object.keys(rows).map(function (u) {
            var row = rows[u];
            row.pd = row.pf - row.pa;
            return row;
        }).sort(function (x, y) {
            if (y.points !== x.points) return y.points - x.points;
            if (y.pd !== x.pd) return y.pd - x.pd;
            if (y.pf !== x.pf) return y.pf - x.pf;
            return x.uid.localeCompare(y.uid);
        });
    }

    return {
        BLOWOUT_TENTHS: BLOWOUT_TENTHS,
        blowoutCurve: blowoutCurve,
        strategyForwardWeight: strategyForwardWeight,
        teamRating: teamRating,
        kickerDelta: kickerDelta,
        simulateMatch: simulateMatch,
        resolveKnockout: resolveKnockout,
        kickingCompetition: kickingCompetition,
        buildTable: buildTable
    };
});
