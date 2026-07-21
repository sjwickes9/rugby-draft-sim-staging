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

    // ── Quiet hours (spec 16) ───────────────────────────────
    // A snake draft has exactly one person on the clock at any moment, so
    // only that person's schedule is ever evaluated and multiple time zones
    // never have to be reconciled. The deadline counts down only during
    // their waking window: quiet hours pause it rather than shortening it.
    const MIN_ACTIVE_MINUTES = 8 * 60;   // quiet hours can never exceed 16h

    // Minutes past local midnight, from "HH:MM".
    function hhmmToMin(t) {
        const bits = String(t || "").split(":");
        const h = parseInt(bits[0], 10), m = parseInt(bits[1], 10);
        if (isNaN(h) || isNaN(m)) return null;
        return (h * 60) + m;
    }

    function minToHhmm(mins) {
        const m = ((mins % 1440) + 1440) % 1440;
        return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
    }

    // How long the quiet window lasts, allowing for it crossing midnight.
    function quietLength(startMin, endMin) {
        return ((endMin - startMin) + 1440) % 1440;
    }

    // Reject a window that would leave less than eight active hours.
    function quietValid(q) {
        if (!q || !q.on) return true;
        const s = hhmmToMin(q.start), e = hhmmToMin(q.end);
        if (s === null || e === null) return false;
        return (1440 - quietLength(s, e)) >= MIN_ACTIVE_MINUTES;
    }

    // Is this instant inside the person's quiet window?
    function inQuiet(atMs, q) {
        if (!q || !q.on) return false;
        const s = hhmmToMin(q.start), e = hhmmToMin(q.end);
        if (s === null || e === null) return false;
        if (s === e) return false;
        // tzOffset is minutes to ADD to UTC to get their local time.
        const local = new Date(atMs + ((q.tzOffset || 0) * 60000));
        const mins = (local.getUTCHours() * 60) + local.getUTCMinutes();
        const len = quietLength(s, e);
        const since = ((mins - s) + 1440) % 1440;
        return since < len;
    }

    // When does the current quiet window end, from this instant?
    function quietEnds(atMs, q) {
        const e = hhmmToMin(q.end);
        const local = new Date(atMs + ((q.tzOffset || 0) * 60000));
        const mins = (local.getUTCHours() * 60) + local.getUTCMinutes();
        let ahead = ((e - mins) + 1440) % 1440;
        if (ahead === 0) ahead = 1440;
        return atMs + (ahead * 60000);
    }

    // The deadline for a turn starting now, consuming only active time.
    function deadlineFrom(startMs, turnMs, q) {
        if (!turnMs) return 0;
        if (!q || !q.on || !quietValid(q)) return startMs + turnMs;
        let cursor = startMs;
        let remaining = turnMs;
        let guard = 0;
        while (remaining > 0 && guard++ < 40) {
            if (inQuiet(cursor, q)) { cursor = quietEnds(cursor, q); continue; }
            // Active until the quiet window next begins.
            const s = hhmmToMin(q.start);
            const local = new Date(cursor + ((q.tzOffset || 0) * 60000));
            const mins = (local.getUTCHours() * 60) + local.getUTCMinutes();
            let untilQuiet = ((s - mins) + 1440) % 1440;
            if (untilQuiet === 0) untilQuiet = 1440;
            const activeMs = untilQuiet * 60000;
            if (remaining <= activeMs) return cursor + remaining;
            cursor += activeMs;
            remaining -= activeMs;
        }
        return cursor;
    }

    // How much usable time is left before the deadline, ignoring any quiet
    // hours in between. This is the number a person actually cares about:
    // "you have eight minutes to pick", not "the deadline is 10 hours away
    // because you will be asleep for most of it".
    function activeLeft(nowMs, deadlineMs, q) {
        if (!deadlineMs) return null;
        if (!q || !q.on) return deadlineMs - nowMs;
        let cursor = nowMs, active = 0, guard = 0;
        while (cursor < deadlineMs && guard++ < 40) {
            if (inQuiet(cursor, q)) { cursor = Math.min(quietEnds(cursor, q), deadlineMs); continue; }
            const s = hhmmToMin(q.start);
            const local = new Date(cursor + ((q.tzOffset || 0) * 60000));
            const mins = (local.getUTCHours() * 60) + local.getUTCMinutes();
            let until = ((s - mins) + 1440) % 1440;
            if (until === 0) until = 1440;
            const next = Math.min(cursor + (until * 60000), deadlineMs);
            active += next - cursor;
            cursor = next;
        }
        return active;
    }

    // How long until this person's quiet hours begin, or null if not set.
    function msUntilQuiet(nowMs, q) {
        if (!q || !q.on) return null;
        if (inQuiet(nowMs, q)) return 0;
        const s = hhmmToMin(q.start);
        const local = new Date(nowMs + ((q.tzOffset || 0) * 60000));
        const mins = (local.getUTCHours() * 60) + local.getUTCMinutes();
        let until = ((s - mins) + 1440) % 1440;
        if (until === 0) until = 1440;
        return until * 60000;
    }

    return {
        activeLeft, msUntilQuiet,
        MIN_ACTIVE_MINUTES, hhmmToMin, minToHhmm, quietLength,
        quietValid, inQuiet, quietEnds, deadlineFrom,
        SQUAD_SIZE, FORMATS,
        makeRng, newSeed,
        lottery, reverseStandingsOrder,
        pickerAt, totalPicks, roundOf, fullOrder,
        formatFor
    };
});
