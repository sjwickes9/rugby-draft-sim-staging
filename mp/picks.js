// ============================================================
// RUGBY XV DRAFT: MULTIPLAYER PICK ENGINE
// Slice 5: slot eligibility, penalties and legality (spec 8, 9)
// ============================================================
// The out-of-position penalty scheme is a faithful port of the
// single-player app.js, not a reimplementation. Inherit the existing
// scheme; do not invent a second scale.
//
// Pure logic. No DOM, no network.
// UK English. No em dashes or en dashes.
// ============================================================

(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory();
    else root.MPPicks = factory();
})(typeof self !== "undefined" ? self : this, function () {

    // ── The fifteen slots, in team-sheet order ──────────────
    const SLOTS = [
        { id: "LH",  node: "Loosehead Prop",    num: 1,  label: "Loosehead" },
        { id: "HK",  node: "Hooker",            num: 2,  label: "Hooker" },
        { id: "TH",  node: "Tighthead Prop",    num: 3,  label: "Tighthead" },
        { id: "L4",  node: "Lock 4",            num: 4,  label: "Lock" },
        { id: "L5",  node: "Lock 5",            num: 5,  label: "Lock" },
        { id: "BF",  node: "Blindside Flanker", num: 6,  label: "Blindside" },
        { id: "OF",  node: "Openside Flanker",  num: 7,  label: "Openside" },
        { id: "N8",  node: "Number 8",          num: 8,  label: "Number 8" },
        { id: "SH",  node: "Scrum-half",        num: 9,  label: "Scrum-half" },
        { id: "FH",  node: "Fly-half",          num: 10, label: "Fly-half" },
        { id: "IC",  node: "Inside Centre",     num: 12, label: "Inside Centre" },
        { id: "OC",  node: "Outside Centre",    num: 13, label: "Outside Centre" },
        { id: "LW",  node: "Left Wing",         num: 11, label: "Left Wing" },
        { id: "RW",  node: "Right Wing",        num: 14, label: "Right Wing" },
        { id: "FB",  node: "Fullback",          num: 15, label: "Fullback" }
    ];

    function slotById(id) {
        for (let i = 0; i < SLOTS.length; i++) if (SLOTS[i].id === id) return SLOTS[i];
        return null;
    }

    // ── Group maps (ported verbatim from app.js) ────────────
    const POS_GROUP = {
        "Loosehead Prop": "front-row", "Tighthead Prop": "front-row", "Hooker": "front-row",
        "Lock": "lock",
        "Blindside Flanker": "back-row", "Openside Flanker": "back-row", "Number 8": "back-row",
        "Scrum-half": "half-back", "Fly-half": "half-back",
        "Inside Centre": "centre", "Outside Centre": "centre",
        "Left Wing": "wing", "Right Wing": "wing",
        "Fullback": "fullback"
    };

    const NODE_GROUP = {
        "Loosehead Prop": "front-row", "Hooker": "front-row", "Tighthead Prop": "front-row",
        "Lock 4": "lock", "Lock 5": "lock",
        "Blindside Flanker": "back-row", "Openside Flanker": "back-row", "Number 8": "back-row",
        "Scrum-half": "half-back", "Fly-half": "half-back",
        "Inside Centre": "centre", "Outside Centre": "centre",
        "Left Wing": "wing", "Right Wing": "wing",
        "Fullback": "fullback"
    };

    function positionsOf(player) {
        return Array.isArray(player.positions) ? player.positions : [];
    }

    function playerGroups(player) {
        const seen = {}, out = [];
        positionsOf(player).forEach(function (p) {
            const g = POS_GROUP[p];
            if (g && !seen[g]) { seen[g] = 1; out.push(g); }
        });
        return out;
    }

    // Front-row safety law: only players with a front-row position listed
    // may play there. This is the only hard forbidden case in the game.
    function isForbidden(player, nodePos) {
        return NODE_GROUP[nodePos] === "front-row" && playerGroups(player).indexOf("front-row") === -1;
    }

    // Penalty points for placing a player at a pitch node.
    // Verbatim port of oopPenalty from app.js.
    function oopPenalty(player, nodePos) {
        const ng = NODE_GROUP[nodePos];
        const pg = playerGroups(player);
        const pos = positionsOf(player);

        if (pos.indexOf(nodePos) !== -1) return 0;

        // Both half-backs share a group, but the other half-back slot is
        // still out of position: a flat 3 applies.
        if (ng === "half-back" && pg.indexOf("half-back") !== -1) return 3;

        // Hooker and prop share the front-row group, but a pure hooker at
        // prop (or vice versa) is still out of position: a flat 3 applies.
        // Genuine prop to prop swaps are unaffected.
        if (ng === "front-row" && pg.indexOf("front-row") !== -1) {
            const wantsHooker = (nodePos === "Hooker");
            const hasHooker = pos.indexOf("Hooker") !== -1;
            const hasProp = pos.some(function (p) { return p === "Loosehead Prop" || p === "Tighthead Prop"; });
            if (wantsHooker && hasProp && !hasHooker) return 3;
            if (!wantsHooker && hasHooker && !hasProp) return 3;
        }

        if (pg.indexOf(ng) !== -1) return 0;

        if (pg.indexOf("front-row") !== -1) {
            if (ng === "lock" || ng === "back-row") return 10;
            return 15;
        }
        if (pg.indexOf("lock") !== -1) {
            if (ng === "back-row") return 5;
            return 10;
        }
        if (pg.indexOf("back-row") !== -1) {
            if (ng === "lock") return 5;
            return 10;
        }
        if (pg.indexOf("half-back") !== -1) {
            if (ng === "front-row" || ng === "lock" || ng === "back-row") return 15;
            return 5;
        }
        if (pg.indexOf("centre") !== -1) {
            if (ng === "lock") return 15;
            if (ng === "back-row") return 10;
            if (ng === "half-back") return 7;
            if (ng === "fullback") return 5;
            if (ng === "wing") return 3;
            return 15;
        }
        if (pg.indexOf("wing") !== -1) {
            if (ng === "front-row" || ng === "lock" || ng === "back-row") return 15;
            if (ng === "half-back") return 10;
            if (ng === "centre") return 5;
            if (ng === "fullback") return 3;
            return 10;
        }
        if (pg.indexOf("fullback") !== -1) {
            if (ng === "front-row" || ng === "lock" || ng === "back-row") return 15;
            if (ng === "half-back" && nodePos === "Scrum-half") return 10;
            if (ng === "half-back") return 5;
            if (ng === "centre") return 5;
            if (ng === "wing") return 2;
            return 10;
        }
        return 10;
    }

    // ── Effective rating for a slot ─────────────────────────
    function effectiveRating(player, nodePos) {
        const base = player.rating || 0;
        if (isForbidden(player, nodePos)) return null;
        return Math.max(0, base - oopPenalty(player, nodePos));
    }

    // A short human-readable note for the panel, per spec 8.
    // "Fly-half, rated 91. Placed at Centre: 84."
    function placementNote(player, nodePos) {
        if (isForbidden(player, nodePos)) return "Cannot play in the front row.";
        const pen = oopPenalty(player, nodePos);
        const base = player.rating || 0;
        const primary = positionsOf(player)[0] || "Player";
        if (pen === 0) return primary + ", rated " + base + ". In position.";
        const slot = slotById(nodeToSlotId(nodePos));
        return primary + ", rated " + base + ". Placed at "
            + (slot ? slot.label : nodePos) + ": " + (base - pen) + ".";
    }

    function nodeToSlotId(nodePos) {
        for (let i = 0; i < SLOTS.length; i++) if (SLOTS[i].node === nodePos) return SLOTS[i].id;
        return null;
    }

    // Every slot a player can fill with no penalty. Makes utility players
    // visibly valuable (spec 8).
    function naturalSlots(player) {
        return SLOTS.filter(function (s) {
            return !isForbidden(player, s.node) && oopPenalty(player, s.node) === 0;
        }).map(function (s) { return s.id; });
    }

    // ── Squad state ─────────────────────────────────────────
    // squad is { slotId: pickEntry }. A pick entry carries the player plus
    // the slot it was committed to.
    function emptySquad() {
        const sq = {};
        SLOTS.forEach(function (s) { sq[s.id] = null; });
        return sq;
    }

    function filledSlots(squad) {
        return SLOTS.filter(function (s) { return squad[s.id]; }).map(function (s) { return s.id; });
    }

    function emptySlots(squad) {
        return SLOTS.filter(function (s) { return !squad[s.id]; }).map(function (s) { return s.id; });
    }

    function squadPlayers(squad) {
        return SLOTS.map(function (s) { return squad[s.id]; }).filter(Boolean);
    }

    function isComplete(squad) {
        return emptySlots(squad).length === 0;
    }

    // How many front-row-eligible players the squad still needs. Used by
    // auto-pick to honour the front-row guarantee (spec 8).
    function frontRowStillNeeded(squad) {
        let need = 0;
        SLOTS.forEach(function (s) {
            if (NODE_GROUP[s.node] === "front-row" && !squad[s.id]) need++;
        });
        return need;
    }

    // ── Legality for a specific slot ────────────────────────
    // Combines the front-row law, slot occupancy, the taken set and the
    // room's constraint rules (via MPRules, injected so this stays pure).
    // Returns { eligible, reason, penalty, effective }.
    function evaluate(player, slotId, squad, taken, activeConstraints, ruleCtx, isPickLegal) {
        const slot = slotById(slotId);
        if (!slot) return { eligible: false, reason: "Unknown slot", penalty: null, effective: null };
        if (squad && squad[slotId]) return { eligible: false, reason: "Slot already filled", penalty: null, effective: null };

        const key = personKey(player);
        if (taken && taken[key]) {
            return { eligible: false, reason: "Taken by " + taken[key], penalty: null, effective: null };
        }

        if (isForbidden(player, slot.node)) {
            // Front-row law: absent rather than greyed in the panel.
            return { eligible: false, reason: "Not a front-row player", penalty: null, effective: null, hide: true };
        }

        if (activeConstraints && activeConstraints.length && isPickLegal) {
            const picks = squadPlayers(squad || {});
            const verdict = isPickLegal(picks, player, activeConstraints, ruleCtx);
            if (!verdict.eligible) {
                return { eligible: false, reason: verdict.reason, penalty: null, effective: null };
            }
        }

        const pen = oopPenalty(player, slot.node);
        return {
            eligible: true,
            reason: "",
            penalty: pen,
            effective: Math.max(0, (player.rating || 0) - pen)
        };
    }

    // Stable identity for a pool entry. Tournament mode distinguishes
    // versions of the same player by year; career mode has no year.
    // Used for starring and for referring to a specific version.
    function playerKey(p) {
        return p.country + "|" + p.name + "|" + (p.year || "");
    }

    // Identity of the person, ignoring which tournament version this is.
    // The taken check uses this: you pick a version, but once any version
    // of a man is drafted, every version of him leaves the pool. Nobody
    // appears in two squads, and nobody appears twice in one squad.
    function personKey(p) {
        return p.country + "|" + p.name;
    }

    // ── Candidates for a slot ───────────────────────────────
    // Returns every pool entry with its verdict for this slot. The panel
    // is responsible for ordering (never by rating, per spec 9); this
    // returns pool order untouched.
    function candidatesForSlot(pool, slotId, squad, taken, activeConstraints, ruleCtx, isPickLegal) {
        const out = [];
        for (let i = 0; i < pool.length; i++) {
            const p = pool[i];
            const v = evaluate(p, slotId, squad, taken, activeConstraints, ruleCtx, isPickLegal);
            if (v.hide) continue;                   // front-row law: omit entirely
            out.push({ player: p, index: i, verdict: v });
        }
        return out;
    }

    // ── Auto-pick (spec 8) ──────────────────────────────────
    // Draw from the starred queue first; otherwise take the highest-rated
    // available player for a slot still needed. Honours the front-row
    // guarantee: if the remaining empty slots include front-row ones and
    // supply is tightening, fill those first.
    function autoPick(pool, squad, taken, starred, activeConstraints, ruleCtx, isPickLegal) {
        const empties = emptySlots(squad);
        if (!empties.length) return null;

        // Front-row slots first when they are still outstanding, so a user
        // cannot be left with unfillable front-row slots.
        const frontFirst = empties.slice().sort(function (a, b) {
            const fa = NODE_GROUP[slotById(a).node] === "front-row" ? 0 : 1;
            const fb = NODE_GROUP[slotById(b).node] === "front-row" ? 0 : 1;
            return fa - fb;
        });

        // 1. Starred queue.
        if (starred && starred.length) {
            for (let s = 0; s < frontFirst.length; s++) {
                for (let k = 0; k < starred.length; k++) {
                    const cand = starred[k];
                    const v = evaluate(cand, frontFirst[s], squad, taken, activeConstraints, ruleCtx, isPickLegal);
                    if (v.eligible) return { player: cand, slotId: frontFirst[s], from: "queue" };
                }
            }
        }

        // 2. Highest-rated eligible player for the first slot that needs one.
        for (let s = 0; s < frontFirst.length; s++) {
            const slotId = frontFirst[s];
            let best = null;
            for (let i = 0; i < pool.length; i++) {
                const p = pool[i];
                const v = evaluate(p, slotId, squad, taken, activeConstraints, ruleCtx, isPickLegal);
                if (!v.eligible) continue;
                if (!best || v.effective > best.effective) best = { player: p, effective: v.effective };
            }
            if (best) return { player: best.player, slotId: slotId, from: "best-available" };
        }
        return null;
    }

    return {
        SLOTS, POS_GROUP, NODE_GROUP,
        slotById, nodeToSlotId, playerGroups,
        isForbidden, oopPenalty, effectiveRating, placementNote, naturalSlots,
        emptySquad, filledSlots, emptySlots, squadPlayers, isComplete, frontRowStillNeeded,
        playerKey, personKey, evaluate, candidatesForSlot, autoPick
    };
});
