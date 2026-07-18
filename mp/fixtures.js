// ============================================================
// RUGBY XV DRAFT: FIXTURE GENERATION
// Slice 9: competition formats (spec section 12)
// ============================================================
// Leagues scale to any number; knockouts need powers of two. Authentic
// rugby formats are used for the awkward counts rather than bending
// brackets.
//
// Pure logic, deterministic given the same user order. No DOM, no
// network. UK English. No em dashes or en dashes.
// ============================================================

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory();
    else root.MPFixtures = factory();
})(typeof self !== "undefined" ? self : this, function () {

    // ── Round robin (circle method) ─────────────────────────
    // Deterministic: same input order always gives the same schedule.
    function roundRobin(uids) {
        const list = uids.slice();
        if (list.length % 2 === 1) list.push(null);      // bye marker
        const n = list.length;
        const rounds = [];
        for (let r = 0; r < n - 1; r++) {
            const pairs = [];
            for (let i = 0; i < n / 2; i++) {
                const a = list[i], b = list[n - 1 - i];
                if (a && b) pairs.push([a, b]);
            }
            rounds.push(pairs);
            // rotate, holding the first fixed
            list.splice(1, 0, list.pop());
        }
        return rounds;
    }

    function flatten(rounds, stageName) {
        const out = [];
        rounds.forEach(function (pairs, i) {
            pairs.forEach(function (p) {
                out.push({ home: p[0], away: p[1], round: i + 1, stage: stageName || "league" });
            });
        });
        return out;
    }

    // ── Formats ─────────────────────────────────────────────
    // Returns { name, decidedBy, fixtures, stages }
    // Fixtures carry home, away, round and stage. Knockout fixtures that
    // depend on earlier results carry placeholders instead of uids.
    function generate(uids) {
        const n = uids.length;
        switch (n) {
            case 2:  return testSeries(uids);
            case 3:  return triNations(uids);
            case 4:  return poolAndFinal(uids);
            case 5:
            case 6:
            case 7:  return nations(uids);
            case 8:  return twoPools(uids);
            default: return nations(uids);
        }
    }

    // Two users: a best of three Test series.
    function testSeries(uids) {
        const a = uids[0], b = uids[1];
        return {
            name: "Test series, best of three",
            decidedBy: "Series result",
            stages: ["series"],
            fixtures: [
                { home: a, away: b, round: 1, stage: "series", label: "First Test" },
                { home: b, away: a, round: 2, stage: "series", label: "Second Test" },
                { home: a, away: b, round: 3, stage: "series", label: "Third Test" }
            ]
        };
    }

    // Three users: home and away, decided on the table.
    function triNations(uids) {
        const first = flatten(roundRobin(uids), "league");
        const second = first.map(function (f) {
            return { home: f.away, away: f.home, round: f.round + first.length, stage: "league" };
        });
        return {
            name: "Tri Nations, home and away",
            decidedBy: "Table",
            stages: ["league"],
            fixtures: first.concat(second)
        };
    }

    // Four users: single round robin, then a final between the top two.
    function poolAndFinal(uids) {
        const pool = flatten(roundRobin(uids), "pool");
        return {
            name: "Pool of four, then a final",
            decidedBy: "Final",
            stages: ["pool", "final"],
            fixtures: pool.concat([
                { home: "@pool:1", away: "@pool:2", round: 99, stage: "final", label: "Final" }
            ])
        };
    }

    // Five, six or seven users: single round robin, no final. Decided on
    // the table, with a Grand Slam available.
    function nations(uids) {
        const n = uids.length;
        const names = { 5: "Five Nations", 6: "Six Nations", 7: "Seven Nations" };
        return {
            name: (names[n] || n + " Nations") + " round robin",
            decidedBy: "Table, Grand Slam possible",
            stages: ["league"],
            fixtures: flatten(roundRobin(uids), "league")
        };
    }

    // Eight users: two pools of four, then crossover playoffs so every
    // position from 1 to 8 is decided.
    function twoPools(uids) {
        const A = [uids[0], uids[2], uids[4], uids[6]];
        const B = [uids[1], uids[3], uids[5], uids[7]];
        const fixtures = flatten(roundRobin(A), "poolA")
            .concat(flatten(roundRobin(B), "poolB"));
        const playoffs = [
            { home: "@poolA:1", away: "@poolB:1", round: 90, stage: "playoff", label: "Final" },
            { home: "@poolA:2", away: "@poolB:2", round: 90, stage: "playoff", label: "Third place" },
            { home: "@poolA:3", away: "@poolB:3", round: 90, stage: "playoff", label: "Fifth place" },
            { home: "@poolA:4", away: "@poolB:4", round: 90, stage: "playoff", label: "Seventh place" }
        ];
        return {
            name: "Two pools of four, then playoffs",
            decidedBy: "Final, with full 1 to 8 ordering",
            stages: ["poolA", "poolB", "playoff"],
            pools: { poolA: A, poolB: B },
            fixtures: fixtures.concat(playoffs)
        };
    }

    // Is this fixture waiting on an earlier stage?
    function isPlaceholder(uid) {
        return typeof uid === "string" && uid.charAt(0) === "@";
    }

    // Human label for a placeholder, for the fixture list.
    function placeholderLabel(token) {
        const bits = String(token).replace("@", "").split(":");
        const stage = bits[0], place = bits[1];
        const nice = { pool: "the pool", poolA: "Pool A", poolB: "Pool B" }[stage] || stage;
        const ord = { "1": "1st", "2": "2nd", "3": "3rd", "4": "4th" }[place] || place;
        return ord + " in " + nice;
    }

    return {
        generate: generate,
        roundRobin: roundRobin,
        isPlaceholder: isPlaceholder,
        placeholderLabel: placeholderLabel
    };
});
