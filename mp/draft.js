// ============================================================
// RUGBY XV DRAFT: MULTIPLAYER DRAFT ORDER
// Slice 4: the lobby-to-draft bridge (spec 8, 12)
// ============================================================
// Pure logic: snake order, the draft lottery, the seeded PRNG and
// turn resolution. No DOM, no network. Shared by the bridge now and
// by the draft board and simulation later.
//
// UK English. No em dashes or en dashes.
// ============================================================

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory();
    else root.MPDraft = factory();
})(typeof self !== "undefined" ? self : this, function () {

    const SQUAD_SIZE = 15;   // fifteen rounds, XV only, no bench

    // ── Seeded PRNG (mulberry32) ────────────────────────────
    // Integer arithmetic only, so it is bit-identical across browsers.
    // Every client replays the same sequence from the room's stored seed.
    function makeRng(seed) {
        let a = seed >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), 1 | t);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function newSeed() {
        // One-off, host-side only. The value is stored on the room and
        // every client replays from it, so this call is never repeated.
        return Math.floor(Math.random() * 4294967296) >>> 0;
    }

    // ── Draft lottery (spec 8) ──────────────────────────────
    // First competition in a room: randomised order, presented as a
    // lottery. Seeded so every client can verify the same result.
    function lottery(uids, seed) {
        const rng = makeRng(seed);
        const out = uids.slice();
        for (let i = out.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            const t = out[i]; out[i] = out[j]; out[j] = t;
        }
        return out;
    }

    // Subsequent competitions: reverse standings, so bottom picks first.
    // tally is { uid: points }. Ties break on the previous order, which
    // keeps it deterministic.
    function reverseStandingsOrder(uids, tally, previousOrder) {
        const prev = previousOrder || uids;
        return uids.slice().sort(function (a, b) {
            const pa = (tally && tally[a]) || 0;
            const pb = (tally && tally[b]) || 0;
            if (pa !== pb) return pa - pb;                 // fewest points first
            return prev.indexOf(a) - prev.indexOf(b);
        });
    }

    // ── Snake order (spec 8) ────────────────────────────────
    // 1-2-3-4, 4-3-2-1, repeating, for fifteen rounds.
    function pickerAt(order, pickIndex) {
        const n = order.length;
        if (!n) return null;
        const round = Math.floor(pickIndex / n);           // 0-based
        const slot = pickIndex % n;
        const idx = (round % 2 === 0) ? slot : (n - 1 - slot);
        return order[idx];
    }

    function totalPicks(order) { return order.length * SQUAD_SIZE; }

    function roundOf(order, pickIndex) {
        return Math.floor(pickIndex / order.length) + 1;   // 1-based
    }

    // The full running order, useful for the draft board.
    function fullOrder(order) {
        const out = [];
        for (let i = 0; i < totalPicks(order); i++) out.push(pickerAt(order, i));
        return out;
    }

    // ── Competition format (spec 12) ────────────────────────
    const FORMATS = {
        1: { name: "Solo draft", decidedBy: "No competition" },
        2: { name: "Test series, best of three", decidedBy: "Series result" },
        3: { name: "Tri Nations, home and away", decidedBy: "Table" },
        4: { name: "Pool of four, then a final", decidedBy: "Final" },
        5: { name: "Five Nations round robin", decidedBy: "Table, Grand Slam possible" },
        6: { name: "Six Nations round robin", decidedBy: "Table, Grand Slam possible" },
        7: { name: "Seven Nations round robin", decidedBy: "Table, Grand Slam possible" },
        8: { name: "Two pools of four, then playoffs", decidedBy: "Final, with full 1 to 8 ordering" }
    };

    function formatFor(userCount) {
        return FORMATS[userCount] || FORMATS[8];
    }

    return {
        SQUAD_SIZE, FORMATS,
        makeRng, newSeed,
        lottery, reverseStandingsOrder,
        pickerAt, totalPicks, roundOf, fullOrder,
        formatFor
    };
});
