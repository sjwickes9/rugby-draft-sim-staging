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

    function teamRating(squad, strategy, pool, activeConstraints) {
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
        var base = Math.round(f * w + b * (1 - w));
        var breaches = (pool && activeConstraints)
            ? squadBreaches(squad, pool, activeConstraints) : [];
        var penalty = breachPenalty(breaches);
        return {
            forwards: f, backs: b,
            base: base,
            penalty: penalty,
            breaches: breaches,
            overall: Math.max(0, base - penalty)
        };
    }

    function MPPicksRef() {
        return (typeof MPPicks !== "undefined") ? MPPicks : require("./picks.js");
    }

    // ── Illegal squad penalty ───────────────────────────────
    // Prevention comes first: the draft blocks picks that would strand a
    // squad. But the constraint rules step aside rather than freeze when a
    // pool is genuinely over-constrained, so a squad can still finish
    // outside the rules. It is not disqualified, it is penalised, which
    // keeps the room playable while making the rules matter.
    // An illegal XV is penalised on rating AND cannot win the competition.
    // Without ineligibility the rules are decoration: a user could ignore
    // them, field the strongest possible side and take the title anyway,
    // which defeats the point of setting restrictions at all.
    var PENALTY_PER_BREACH = 3;

    function squadBreaches(squad, pool, activeConstraints) {
        var out = [];
        if (!activeConstraints || !activeConstraints.length) return out;
        var picked = MPPicksRef().squadPlayers(squad);

        activeConstraints.forEach(function (c) {
            if (c.id === "onePerTournament") {
                var years = {};
                (pool || []).forEach(function (p) { if (p.year) years[p.year] = true; });
                var all = Object.keys(years);
                var have = {};
                picked.forEach(function (p) { if (p.year) have[p.year] = true; });
                var missing = all.filter(function (y) { return !have[y]; });
                if (missing.length) {
                    out.push({
                        rule: "One from every tournament",
                        detail: missing.length + " missing (" + missing.join(", ") + ")",
                        count: missing.length
                    });
                }
            }
            if (c.id === "minPerCountry") {
                var nats = {};
                picked.forEach(function (p) { if (p.country) nats[p.country] = true; });
                var have = Object.keys(nats).length;
                if (have < c.value) {
                    out.push({
                        rule: "Minimum nations",
                        detail: have + " nation" + (have === 1 ? "" : "s") + " used, " + c.value + " required",
                        count: c.value - have
                    });
                }
            }
            if (c.id === "maxPerCountry" || c.id === "maxPerTournament") {
                var field = (c.id === "maxPerCountry") ? "country" : "year";
                var counts = {};
                picked.forEach(function (p) {
                    if (p[field]) counts[p[field]] = (counts[p[field]] || 0) + 1;
                });
                var over = 0, who = [];
                Object.keys(counts).forEach(function (k) {
                    if (counts[k] > c.value) { over += counts[k] - c.value; who.push(k + " " + counts[k]); }
                });
                if (over) {
                    out.push({
                        rule: (c.id === "maxPerCountry" ? "Max per nation" : "Max per tournament"),
                        detail: who.join(", ") + " over the limit of " + c.value,
                        count: over
                    });
                }
            }
        });

        // A squad short of fifteen is penalised for the empty shirts too.
        var short = MPPicksRef().emptySlots(squad).length;
        if (short) {
            out.push({ rule: "Incomplete XV", detail: short + " slot" + (short === 1 ? "" : "s") + " unfilled", count: short });
        }
        return out;
    }

    function breachPenalty(breaches) {
        var total = 0;
        (breaches || []).forEach(function (b) { total += b.count * PENALTY_PER_BREACH; });
        return total;
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

    // ── Score breakdown (ported from app.js) ────────────────
    // Attributes a final score to tries, conversions and penalties, and
    // names the try scorers by position weighting. Seeded, so every
    // client derives the same scorers.
    var TRY_WEIGHTS = {
        "Left Wing": 16.67, "Right Wing": 16.67,
        "Inside Centre": 10.19, "Outside Centre": 10.19,
        "Fullback": 10.19,
        "Number 8": 6.48,
        "Scrum-half": 5.56,
        "Hooker": 4.63,
        "Blindside Flanker": 3.70, "Openside Flanker": 3.70,
        "Fly-half": 4.63,
        "Lock 4": 1.85, "Lock 5": 1.85,
        "Loosehead Prop": 1.85, "Tighthead Prop": 1.85
    };

    function pickWeightedScorer(rng, squad) {
        var entries = [];
        MPPicksRef().SLOTS.forEach(function (s) {
            var p = squad[s.id];
            var w = TRY_WEIGHTS[s.node];
            if (p && w) entries.push({ name: p.name, weight: w });
        });
        if (!entries.length) return null;
        var total = 0;
        entries.forEach(function (e) { total += e.weight; });
        var r = rng() * total;
        for (var i = 0; i < entries.length; i++) {
            if (r < entries[i].weight) return entries[i];
            r -= entries[i].weight;
        }
        return entries[entries.length - 1];
    }

    function buildScoreBreakdown(rng, finalScore, squad, kickerName) {
        var remaining = finalScore;
        var tryScorers = {};
        var tries = 0, conversions = 0, penalties = 0;

        var maxTries = Math.max(1, Math.floor(finalScore / 6));
        while (remaining >= 5 && tries < maxTries) {
            var canConvert = remaining - 7 >= 0;
            if (canConvert && rng() < 0.78) { remaining -= 7; tries++; conversions++; }
            else { remaining -= 5; tries++; }
            var scorer = pickWeightedScorer(rng, squad);
            if (scorer) tryScorers[scorer.name] = (tryScorers[scorer.name] || 0) + 1;
        }
        while (remaining >= 3) { remaining -= 3; penalties++; }
        if (remaining === 2 && conversions === 0 && tries > 0) { conversions++; remaining -= 2; }

        var list = Object.keys(tryScorers).map(function (n) {
            return { name: n, count: tryScorers[n] };
        });
        return { tries: list, tryCount: tries, conversions: conversions, penalties: penalties, kicker: kickerName || null };
    }

    // ── Test series (two users, spec section 12) ────────────
    // A drawn Test stands. If the series finishes level, aggregate points
    // decide it. Rugby would call it a drawn series, but the room tally
    // needs a winner.
    function seriesResult(uids, results) {
        var a = uids[0], b = uids[1];
        var winsA = 0, winsB = 0, draws = 0, ptsA = 0, ptsB = 0;
        results.forEach(function (r) {
            var scoreA = (r.home === a) ? r.a : r.b;
            var scoreB = (r.home === a) ? r.b : r.a;
            ptsA += scoreA; ptsB += scoreB;
            if (scoreA === scoreB) draws++;
            else if (scoreA > scoreB) winsA++;
            else winsB++;
        });
        var winner = null, decidedBy = "series result";
        if (winsA !== winsB) winner = winsA > winsB ? a : b;
        else if (ptsA !== ptsB) { winner = ptsA > ptsB ? a : b; decidedBy = "aggregate points"; }
        else decidedBy = "level, a kicking competition would decide it";
        return {
            a: a, b: b, winsA: winsA, winsB: winsB, draws: draws,
            aggregateA: ptsA, aggregateB: ptsB,
            winner: winner, decidedBy: decidedBy,
            scoreline: winsA + " to " + winsB + (draws ? " with " + draws + " drawn" : "")
        };
    }

    // ── Resolving knockout placeholders ─────────────────────
    // Pool fixtures are played first, then "@poolA:1" style tokens are
    // replaced with whoever actually finished there.
    function resolvePlaceholder(token, standingsByStage) {
        var bits = String(token).replace("@", "").split(":");
        var stage = bits[0], place = parseInt(bits[1], 10);
        var table = standingsByStage[stage];
        if (!table || !table[place - 1]) return null;
        return table[place - 1].uid;
    }

    // Standings for one stage only, from that stage's results.
    function stageStandings(uids, results, stage) {
        var subset = results.filter(function (r) { return r.stage === stage; });
        var involved = {};
        subset.forEach(function (r) { involved[r.home] = 1; involved[r.away] = 1; });
        var list = uids.filter(function (u) { return involved[u]; });
        return buildTable(list, subset);
    }

    // Who won the competition, by format.
    // illegal is a map of uid -> true. Those squads still play, and their
    // results still count for everyone else, but they cannot take the title.
    function competitionWinner(uids, comp, results, illegal) {
        illegal = illegal || {};
        var eligible = uids.filter(function (u) { return !illegal[u]; });
        if (!eligible.length) return null;               // title vacant

        var fixtures = comp.fixtures || [];
        var decider = null;
        fixtures.forEach(function (f, i) {
            if (f.label === "Final") decider = i;
        });
        if (decider !== null) {
            var r = results.filter(function (x) { return x.i === decider; })[0];
            if (r) {
                var won = r.winner === "a" ? r.home : r.away;
                var lost = r.winner === "a" ? r.away : r.home;
                if (!illegal[won]) return won;
                // The winner is ineligible, so the title passes to the
                // beaten finalist if they are legal, otherwise it is vacant.
                return illegal[lost] ? null : lost;
            }
        }
        if (uids.length === 2) {
            var sr = seriesResult(uids, results);
            if (sr.winner && !illegal[sr.winner]) return sr.winner;
            var other = uids.filter(function (u) { return u !== sr.winner; })[0];
            return (sr.winner && !illegal[other]) ? other : null;
        }
        // League: the highest placed legal side takes it.
        var table = buildTable(uids, results);
        for (var i = 0; i < table.length; i++) {
            if (!illegal[table[i].uid]) return table[i].uid;
        }
        return null;
    }

    // ── Room tally (spec section 14) ────────────────────────
    // Accumulates across the season: titles won, competitions played, and
    // aggregate points difference as the tie-break.
    function updateTally(previous, uids, winner, standings, illegal) {
        illegal = illegal || {};
        var out = {};
        uids.forEach(function (u) {
            var prev = (previous && previous[u]) || { titles: 0, played: 0, points: 0, pd: 0 };
            var row = null;
            (standings || []).forEach(function (r) { if (r.uid === u) row = r; });
            out[u] = {
                titles: (prev.titles || 0) + (u === winner ? 1 : 0),
                played: (prev.played || 0) + 1,
                points: (prev.points || 0) + (row ? row.points : 0),
                pd: (prev.pd || 0) + (row ? row.pd : 0),
                illegal: (prev.illegal || 0) + (illegal[u] ? 1 : 0)
            };
        });
        return out;
    }

    function tallyOrder(tally) {
        return Object.keys(tally || {}).map(function (u) {
            var t = tally[u];
            return { uid: u, titles: t.titles || 0, played: t.played || 0,
                     points: t.points || 0, pd: t.pd || 0, illegal: t.illegal || 0 };
        }).sort(function (a, b) {
            if (b.titles !== a.titles) return b.titles - a.titles;
            if (b.points !== a.points) return b.points - a.points;
            if (b.pd !== a.pd) return b.pd - a.pd;
            return a.uid.localeCompare(b.uid);
        });
    }

    // ── League table (spec sections 11, 14) ─────────────────
    function emptyRow(uid) {
        return { uid: uid, played: 0, won: 0, drawn: 0, lost: 0, pf: 0, pa: 0, pd: 0, bonus: 0, points: 0 };
    }

    // A league table records league matches only. Finals and playoffs are
    // decided by the table, so counting them in it makes the finalists look
    // as though they qualified by playing an extra game.
    function isLeagueStage(stage) {
        return stage !== "final" && stage !== "playoff";
    }

    function buildTable(uids, results) {
        var rows = {};
        uids.forEach(function (u) { rows[u] = emptyRow(u); });
        results.filter(function (r) { return isLeagueStage(r.stage); }).forEach(function (r) {
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
        squadBreaches: squadBreaches,
        breachPenalty: breachPenalty,
        PENALTY_PER_BREACH: PENALTY_PER_BREACH,
        kickerDelta: kickerDelta,
        simulateMatch: simulateMatch,
        resolveKnockout: resolveKnockout,
        kickingCompetition: kickingCompetition,
        buildTable: buildTable,
        isLeagueStage: isLeagueStage,
        TRY_WEIGHTS: TRY_WEIGHTS,
        buildScoreBreakdown: buildScoreBreakdown,
        seriesResult: seriesResult,
        resolvePlaceholder: resolvePlaceholder,
        stageStandings: stageStandings,
        competitionWinner: competitionWinner,
        updateTally: updateTally,
        tallyOrder: tallyOrder
    };
});
