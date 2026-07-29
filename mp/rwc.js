// ============================================================
// RUGBY XV DRAFT: MULTIPLAYER WORLD CUP MODE
// Spec section 19
// ============================================================
// Users' drafted XVs take the place of real nations in an actual World
// Cup, and the whole tournament is played out around them, including the
// matches between nations nobody replaced.
//
// Almost all of the tournament data already exists and is shared with the
// single player app:
//
//   poolStandingsByYear   the real pool composition for every World Cup
//   teamStrengthsByYear   each nation's rating for that tournament
//   tournamentMeta        format rules: teams, pool size, bonus points,
//                         fixed quarter final pairings, win points
//
// Two rules from the spec that this module exists to enforce:
//
//   1. A real World Cup keeps its nation ratings exactly as calibrated.
//      Drafting Matt Dawson does not weaken England. It only means Dawson
//      cannot score for them, so Kyran Bracken plays instead.
//   2. The all time World Cup has no fixed ratings to preserve, so a
//      nation is rated on the XV it can actually field. Taking Dan Carter
//      genuinely weakens New Zealand.
//
// Conventions: UK English. No em dashes or en dashes.
// ============================================================

(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) {
        module.exports = api;
    } else {
        root.MPRWC = api;
    }
})(typeof self !== "undefined" ? self : this, function () {

    const ALL_TIME = "alltime";
    // The all time tournament borrows the 2023 structure.
    const ALL_TIME_STRUCTURE = "2023";

    // ── Access to the shared tournament data ────────────────
    // In the browser these are globals from data.js. Under Node the test
    // harness passes them in, so every function takes an explicit data
    // bundle rather than reaching for globals.
    function dataOf(d) {
        if (d) return d;
        return {
            allSquads: typeof allSquads !== "undefined" ? allSquads : {},
            positionFamilyMap: typeof positionFamilyMap !== "undefined" ? positionFamilyMap : {},
            poolStandingsByYear: typeof poolStandingsByYear !== "undefined" ? poolStandingsByYear : {},
            teamStrengthsByYear: typeof teamStrengthsByYear !== "undefined" ? teamStrengthsByYear : {},
            tournamentMeta: typeof tournamentMeta !== "undefined" ? tournamentMeta : {}
        };
    }

    function structureYear(tournament) {
        return tournament === ALL_TIME ? ALL_TIME_STRUCTURE : tournament;
    }

    function metaFor(tournament, d) {
        d = dataOf(d);
        const m = d.tournamentMeta[structureYear(tournament)] || {};
        return {
            teams: m.teams || 20,
            poolsOf: m.poolsOf || 5,
            bonusPoints: !!m.bonusPoints,
            hasFixedQfPairing: !!m.hasFixedQfPairing,
            // Rugby awarded two for a win before the bonus point era.
            winPoints: m.winPoints || (m.bonusPoints ? 4 : 2),
            triesTiebreak: !!m.triesTiebreak,
            host: m.host || ""
        };
    }

    function poolsFor(tournament, d) {
        d = dataOf(d);
        const src = d.poolStandingsByYear[structureYear(tournament)] || {};
        const out = {};
        Object.keys(src).forEach(function (k) { out[k] = src[k].slice(); });
        return out;
    }

    function nationsIn(tournament, d) {
        const pools = poolsFor(tournament, d);
        return Object.keys(pools).reduce(function (a, k) { return a.concat(pools[k]); }, []);
    }

    // Which pool a given nation sits in for a tournament, or null.
    function poolOfNation(tournament, nation, d) {
        const pools = poolsFor(tournament, d);
        const keys = Object.keys(pools);
        for (let i = 0; i < keys.length; i++) {
            if (pools[keys[i]].indexOf(nation) !== -1) return keys[i];
        }
        return null;
    }

    // Every tournament this mode can offer.
    function tournaments(d) {
        d = dataOf(d);
        const years = Object.keys(d.poolStandingsByYear).sort();
        return years.concat([ALL_TIME]);
    }

    // ── Nation line ups ─────────────────────────────────────
    // The best XV a nation can field, skipping anyone a user has drafted.
    // This is the multiplayer equivalent of getOppositionLineup in the
    // single player app, with the drafted exclusion added.
    //
    // For a real World Cup the result is used only to name try scorers and
    // the goal kicker. For the all time tournament it also rates the side.
    function nationXV(nation, tournament, drafted, d, MPPicks) {
        d = dataOf(d);
        const taken = drafted || {};
        const byNation = d.allSquads[nation];
        if (!byNation) return null;

        // Which squads feed this XV: one tournament, or every appearance.
        let players = [];
        if (tournament === ALL_TIME) {
            Object.keys(byNation).forEach(function (yr) {
                byNation[yr].forEach(function (p) {
                    players.push(expand(p, nation, yr, true));
                });
            });
            players = bestPerPerson(players);
        } else {
            const squad = byNation[tournament];
            if (!squad) return null;
            players = squad.map(function (p) { return expand(p, nation, tournament, false); });
        }

        // Drop anyone a user has drafted. Keyed by name within the nation,
        // which is how the drafted list is supplied.
        players = players.filter(function (p) { return !taken[p.name]; });
        if (players.length < 15) return null;

        return greedyXV(players, MPPicks);
    }

    function expand(p, nation, year, career) {
        return {
            name: p.name,
            country: nation,
            year: career ? null : String(year),
            years: [String(year)],
            positions: p.positions || [],
            rating: career ? (p.careerRating || p.rating) : p.rating,
            careerRating: p.careerRating || p.rating,
            kicker: !!p.kicker
        };
    }

    // One card per person, at their best, carrying every year they played.
    function bestPerPerson(list) {
        const by = {};
        list.forEach(function (p) {
            const k = p.name;
            if (!by[k]) { by[k] = p; return; }
            const acc = by[k];
            p.positions.forEach(function (x) {
                if (acc.positions.indexOf(x) === -1) acc.positions.push(x);
            });
            p.years.forEach(function (y) {
                if (acc.years.indexOf(y) === -1) acc.years.push(y);
            });
            if (p.rating > acc.rating) acc.rating = p.rating;
            acc.kicker = acc.kicker || p.kicker;
        });
        return Object.keys(by).map(function (k) { return by[k]; });
    }

    // Fill the scarcest positions first, so a specialist is never stranded
    // behind a versatile player who could have gone elsewhere.
    function greedyXV(players, MPPicks) {
        const P = MPPicks || (typeof MPPicks !== "undefined" ? MPPicks : null);
        if (!P) return null;
        const squad = P.emptySquad();
        const used = {};

        const supply = {};
        P.SLOTS.forEach(function (s) {
            supply[s.id] = players.filter(function (p) {
                return P.naturalSlots(p).indexOf(s.id) !== -1;
            }).length;
        });
        const order = P.SLOTS.slice().sort(function (a, b) {
            return supply[a.id] - supply[b.id];
        });

        order.forEach(function (s) {
            let best = null;
            players.forEach(function (p) {
                if (used[p.name]) return;
                if (P.naturalSlots(p).indexOf(s.id) === -1) return;
                if (!best || p.rating > best.rating) best = p;
            });
            if (!best) {
                // Nobody natural left, so take the best remaining body.
                players.forEach(function (p) {
                    if (used[p.name]) return;
                    if (!best || p.rating > best.rating) best = p;
                });
            }
            if (best) { squad[s.id] = best; used[best.name] = true; }
        });
        return squad;
    }

    // A nation's rating. A real World Cup keeps its calibrated figure,
    // untouched by drafting. The all time tournament has no such figure,
    // so it is rated on the XV it can field.
    function nationRating(nation, tournament, drafted, d, MPPicks, MPSim) {
        d = dataOf(d);
        if (tournament !== ALL_TIME) {
            const table = d.teamStrengthsByYear[tournament] || {};
            return table[nation] || 72;
        }
        const xv = nationXV(nation, ALL_TIME, drafted, d, MPPicks);
        if (!xv) return 72;
        return MPSim.teamRating(xv, 50, null, null, {
            mode: "career", tournamentCount: 10, chemistry: false
        }).overall;
    }

    // ── Which nations the users replace ─────────────────────
    // A draw must not stack one pool. Up to four users take different
    // pools; beyond that the rest are spread at random across the pools.
    // allowed: an optional array of nation names to restrict assignment to.
    // When given, only those nations may be drawn, and pools contribute only
    // their members that appear in the list. This lets a host limit the World
    // Cup to a chosen set of nations.
    function drawReplacements(tournament, count, rng, d, allowed) {
        const pools = poolsFor(tournament, d);
        let keys = Object.keys(pools).sort();
        if (!keys.length || count < 1) return [];

        const allowSet = (allowed && allowed.length) ? {} : null;
        if (allowSet) allowed.forEach(function (n) { allowSet[n] = true; });
        const inPool = function (poolKey) {
            return pools[poolKey].filter(function (n) {
                return !allowSet || allowSet[n];
            });
        };
        // Drop pools that have no eligible nation, so the one-per-pool spread
        // only walks pools that can actually supply a side.
        if (allowSet) keys = keys.filter(function (k) { return inPool(k).length > 0; });
        if (!keys.length) return [];

        const pick = function (arr) { return arr[Math.floor(rng() * arr.length)]; };
        const shuffled = keys.slice();
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            const t = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = t;
        }

        const out = [];
        const usedByPool = {};
        let guard = 0;
        for (let i = 0; i < count; i++) {
            // One per pool while pools last, then anywhere.
            const poolKey = i < shuffled.length ? shuffled[i] : pick(keys);
            const already = usedByPool[poolKey] || [];
            const available = inPool(poolKey).filter(function (n) {
                return already.indexOf(n) === -1;
            });
            if (!available.length) {
                // This pool is exhausted. Bail out if every pool is now full,
                // otherwise retry this seat against another pool.
                guard++;
                if (guard > count + keys.length + 5) break;
                i--; continue;
            }
            const nation = pick(available);
            already.push(nation);
            usedByPool[poolKey] = already;
            out.push({ nation: nation, pool: poolKey });
        }
        return out;
    }

    // The greatest number of distinct sides that can be drawn from a
    // tournament, optionally limited to an allow-list of nations. Used to cap
    // the number of users a within-nation World Cup can seat.
    function maxReplacements(tournament, d, allowed) {
        const pools = poolsFor(tournament, d);
        const allowSet = (allowed && allowed.length) ? {} : null;
        if (allowSet) allowed.forEach(function (n) { allowSet[n] = true; });
        let total = 0;
        Object.keys(pools).forEach(function (k) {
            total += pools[k].filter(function (n) { return !allowSet || allowSet[n]; }).length;
        });
        return total;
    }

    // ── Running the tournament ──────────────────────────────
    // replacements: { uid -> nation }. Everything else is a real nation.
    function runTournament(opts) {
        const d = dataOf(opts.data);
        const P = opts.MPPicks, Sim = opts.MPSim;
        const tournament = opts.tournament;
        const meta = metaFor(tournament, d);
        const pools = poolsFor(tournament, d);
        const rng = opts.rng;
        const replacements = opts.replacements || {};
        const userRating = opts.userRating || {};
        const userKicker = opts.userKicker || {};
        const userSquad = opts.userSquad || {};
        const userKickerSlot = opts.userKickerSlot || {};
        const drafted = opts.drafted || {};       // nation -> { name: true }

        // Map a nation to whoever is playing as it.
        const owner = {};
        Object.keys(replacements).forEach(function (u) { owner[replacements[u]] = u; });

        // Everything needed to play a side, whether user or nation.
        const sides = {};
        nationsIn(tournament, d).forEach(function (nation) {
            const uid = owner[nation];
            if (uid) {
                sides[nation] = {
                    key: nation, uid: uid, isUser: true,
                    label: opts.nameOf ? opts.nameOf(uid) : nation,
                    rating: userRating[uid] || 80,
                    kicker: userKicker[uid] || 0.7,
                    kickerSlot: userKickerSlot[uid] || null,
                    squad: userSquad[uid] || null
                };
            } else {
                const xv = nationXV(nation, tournament, drafted[nation] || {}, d, P);
                sides[nation] = {
                    key: nation, uid: null, isUser: false,
                    label: nation,
                    rating: nationRating(nation, tournament, drafted[nation] || {}, d, P, Sim),
                    kicker: 0.72,
                    squad: xv
                };
            }
        });

        const results = [];
        const tables = {};

        // ── Pool stage ──
        Object.keys(pools).sort().forEach(function (key) {
            const teams = pools[key];
            const rows = {};
            teams.forEach(function (t) {
                rows[t] = { key: t, label: sides[t].label, isUser: sides[t].isUser,
                    p: 0, w: 0, d: 0, l: 0, pf: 0, pa: 0, bonus: 0, pts: 0 };
            });

            for (let i = 0; i < teams.length; i++) {
                for (let j = i + 1; j < teams.length; j++) {
                    const A = sides[teams[i]], B = sides[teams[j]];
                    const m = Sim.simulateMatch(rng, A.rating, B.rating, A.kicker, B.kicker);
                    const bdA = Sim.buildScoreBreakdown(rng, m.a, A.squad, kickerNameOf(A, P));
                    const bdB = Sim.buildScoreBreakdown(rng, m.b, B.squad, kickerNameOf(B, P));

                    let aPts, bPts;
                    if (meta.bonusPoints) {
                        const lp = Sim.leaguePoints(m.a, m.b,
                            bdA ? bdA.tryCount : 0, bdB ? bdB.tryCount : 0);
                        aPts = lp.aPts; bPts = lp.bPts;
                    } else {
                        // Pre bonus point era: win points, half for a draw.
                        aPts = m.drawn ? meta.winPoints / 2 : (m.winner === "a" ? meta.winPoints : 0);
                        bPts = m.drawn ? meta.winPoints / 2 : (m.winner === "b" ? meta.winPoints : 0);
                    }

                    results.push({
                        stage: "pool", pool: key,
                        home: A.key, away: B.key,
                        a: m.a, b: m.b, drawn: m.drawn, winner: m.winner,
                        aPts: aPts, bPts: bPts, bdA: bdA, bdB: bdB
                    });

                    const rA = rows[A.key], rB = rows[B.key];
                    rA.p++; rB.p++;
                    rA.pf += m.a; rA.pa += m.b; rB.pf += m.b; rB.pa += m.a;
                    rA.pts += aPts; rB.pts += bPts;
                    rA.bonus += Math.max(0, aPts - (m.drawn ? meta.winPoints / 2
                        : (m.winner === "a" ? meta.winPoints : 0)));
                    rB.bonus += Math.max(0, bPts - (m.drawn ? meta.winPoints / 2
                        : (m.winner === "b" ? meta.winPoints : 0)));
                    if (m.drawn) { rA.d++; rB.d++; }
                    else if (m.winner === "a") { rA.w++; rB.l++; }
                    else { rB.w++; rA.l++; }
                }
            }

            tables[key] = Object.keys(rows).map(function (k) { return rows[k]; })
                .sort(function (x, y) {
                    return (y.pts - x.pts) || ((y.pf - y.pa) - (x.pf - x.pa)) || (y.pf - x.pf);
                });
        });

        // ── Qualifiers ──
        const poolKeys = Object.keys(tables).sort();
        let qualifiers = [];
        if (poolKeys.length === 4) {
            // The standard bracket: A1 v D2, B1 v C2, C1 v B2, D1 v A2.
            const w = {}, r = {};
            poolKeys.forEach(function (k) { w[k] = tables[k][0]; r[k] = tables[k][1]; });
            qualifiers = [
                [w[poolKeys[0]], r[poolKeys[3]]],
                [w[poolKeys[1]], r[poolKeys[2]]],
                [w[poolKeys[2]], r[poolKeys[1]]],
                [w[poolKeys[3]], r[poolKeys[0]]]
            ];
        } else {
            // Any other shape, such as the five pools of 1999: seed the best
            // eight across all pools and pair one against eight.
            const seeded = [];
            poolKeys.forEach(function (k) {
                tables[k].forEach(function (row, i) { seeded.push({ row: row, place: i }); });
            });
            seeded.sort(function (x, y) {
                return (x.place - y.place) || (y.row.pts - x.row.pts)
                    || ((y.row.pf - y.row.pa) - (x.row.pf - x.row.pa));
            });
            const top8 = seeded.slice(0, 8).map(function (s) { return s.row; });
            qualifiers = [[top8[0], top8[7]], [top8[1], top8[6]],
                          [top8[2], top8[5]], [top8[3], top8[4]]];
        }

        // ── Knockouts ──
        function play(stage, aKey, bKey) {
            const A = sides[aKey], B = sides[bKey];
            let m = Sim.simulateMatch(rng, A.rating, B.rating, A.kicker, B.kicker);
            let note = null;
            let decider = null; // "a" or "b" if the match was decided by a kick
            if (m.drawn) {
                const res = Sim.resolveKnockout(rng, m, A.kicker, B.kicker);
                m = res.result; note = res.path;
                // Sudden death and extra time are won by a kick. Record which
                // side landed it so its breakdown shows that penalty or drop
                // goal, rather than a decomposition with no kick at all.
                if (res.deciderKick) decider = res.deciderKick;
                else if (res.path === "extra time") {
                    // The winning side kicked the deciding points in extra time.
                    decider = (m.a > m.b) ? "a" : (m.b > m.a ? "b" : null);
                }
            }
            const bdA = Sim.buildScoreBreakdown(rng, m.a, A.squad, kickerNameOf(A, P), decider === "a" ? 1 : 0);
            const bdB = Sim.buildScoreBreakdown(rng, m.b, B.squad, kickerNameOf(B, P), decider === "b" ? 1 : 0);
            results.push({
                stage: stage, home: aKey, away: bKey,
                a: m.a, b: m.b, drawn: false,
                winner: m.winner, note: note, bdA: bdA, bdB: bdB
            });
            return m.winner === "a" ? aKey : bKey;
        }

        const qfWinners = qualifiers.map(function (pair, i) {
            return play("quarter", pair[0].key, pair[1].key);
        });
        const sf1 = play("semi", qfWinners[0], qfWinners[1]);
        const sf2 = play("semi", qfWinners[2], qfWinners[3]);
        const loser1 = sf1 === qfWinners[0] ? qfWinners[1] : qfWinners[0];
        const loser2 = sf2 === qfWinners[2] ? qfWinners[3] : qfWinners[2];
        const third = play("bronze", loser1, loser2);
        const champion = play("final", sf1, sf2);

        return {
            tournament: tournament,
            meta: meta,
            tables: tables,
            results: results,
            bracket: {
                quarters: qualifiers.map(function (p) { return [p[0].key, p[1].key]; }),
                semis: [[qfWinners[0], qfWinners[1]], [qfWinners[2], qfWinners[3]]],
                final: [sf1, sf2],
                third: third,
                champion: champion
            },
            sides: sides
        };
    }

    function kickerNameOf(side, P) {
        if (!side.squad) return null;
        if (side.kickerSlot && side.squad[side.kickerSlot]) return side.squad[side.kickerSlot].name;
        // Nations kick with their best available kicker, then best fly half.
        let best = null;
        P.SLOTS.forEach(function (s) {
            const p = side.squad[s.id];
            if (!p) return;
            if (p.kicker && (!best || p.rating > best.rating)) best = p;
        });
        if (best) return best.name;
        return side.squad.FH ? side.squad.FH.name : null;
    }

    return {
        ALL_TIME, ALL_TIME_STRUCTURE,
        metaFor, poolsFor, nationsIn, poolOfNation, tournaments,
        nationXV, nationRating, drawReplacements, maxReplacements, runTournament,
        greedyXV, bestPerPerson
    };
});
