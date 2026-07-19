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
        { id: "LW",  node: "Left Wing",         num: 11, label: "Left Wing" },
        { id: "IC",  node: "Inside Centre",     num: 12, label: "Inside Centre" },
        { id: "OC",  node: "Outside Centre",    num: 13, label: "Outside Centre" },
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

    // ── Feasibility lookahead (spec 7) ──────────────────────
    // Some rules are requirements, not just limits. "One player from every
    // tournament" needs 10 of your 15 picks to be distinct tournaments,
    // which leaves only 5 spare. Every duplicate spends one of those, and
    // once they are gone the squad can no longer be completed, whatever is
    // left in the pool.
    //
    // The arithmetic is exact and cheap: after any pick, slack equals empty
    // slots minus tournaments still uncovered. Covering a new tournament
    // leaves slack unchanged; a duplicate reduces it by one. So when slack
    // reaches zero, only players from uncovered tournaments are legal.
    function coverageContext(pool, squad, activeConstraints) {
        let rule = null;
        (activeConstraints || []).forEach(function (c) {
            if (c.id === "onePerTournament") rule = c;
        });
        if (!rule) return null;

        const years = {};
        for (let i = 0; i < pool.length; i++) {
            if (pool[i].year) years[pool[i].year] = true;
        }
        const all = Object.keys(years).sort();

        const have = {};
        squadPlayers(squad).forEach(function (p) { if (p.year) have[p.year] = true; });
        const uncovered = all.filter(function (y) { return !have[y]; });
        const empties = emptySlots(squad).length;

        return {
            all: all,
            have: have,
            uncovered: uncovered,
            empties: empties,
            slack: empties - uncovered.length,
            forced: (empties - uncovered.length) <= 0
        };
    }

    // Would taking this player make the squad impossible to complete?
    function wouldStrand(player, coverage) {
        if (!coverage || !coverage.forced) return null;
        if (player.year && !coverage.have[player.year]) return null;   // covers a new one
        return "Only " + coverage.empties + " slot" + (coverage.empties === 1 ? "" : "s")
            + " left and " + coverage.uncovered.length + " tournament"
            + (coverage.uncovered.length === 1 ? "" : "s") + " still to cover ("
            + coverage.uncovered.join(", ") + ")";
    }

    // ── Legality for a specific slot ────────────────────────
    // Combines the front-row law, slot occupancy, the taken set and the
    // room's constraint rules (via MPRules, injected so this stays pure).
    // Returns { eligible, reason, penalty, effective }.
    function evaluate(player, slotId, squad, taken, activeConstraints, ruleCtx, isPickLegal, coverage) {
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

        // Requirement rules need lookahead, not just a limit check.
        const strand = wouldStrand(player, coverage);
        if (strand) {
            return { eligible: false, reason: strand, penalty: null, effective: null };
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
    // Is there any legal pick at all for this squad? Used to detect a
    // deadlock before it strands someone.
    function anyLegalPick(pool, squad, taken, activeConstraints, ruleCtx, isPickLegal) {
        const empties = emptySlots(squad);
        const coverage = coverageContext(pool, squad, activeConstraints);
        for (let s = 0; s < empties.length; s++) {
            for (let i = 0; i < pool.length; i++) {
                const v = evaluate(pool[i], empties[s], squad, taken, activeConstraints, ruleCtx, isPickLegal, coverage);
                if (v.eligible) return true;
            }
        }
        return false;
    }

    // The relaxation ladder, used when a squad cannot legally be completed.
    // The constraint rules are optional extras, so they give way first. The
    // front-row law never gives way, because a centre cannot pack down at
    // loosehead. If even that is impossible, the squad plays a man short.
    // Returns { level, constraints } where level is:
    //   0 all rules apply, 1 rules relaxed, 2 nothing can be picked
    function relaxFor(pool, squad, taken, activeConstraints, ruleCtx, isPickLegal) {
        if (anyLegalPick(pool, squad, taken, activeConstraints, ruleCtx, isPickLegal)) {
            return { level: 0, constraints: activeConstraints, dropped: [] };
        }

        // Relax as little as possible. Dropping every rule when only one is
        // blocking manufactures illegal squads that were avoidable, and an
        // illegal squad cannot win, so the cost of over-relaxing is high.
        const rules = activeConstraints || [];
        for (let i = 0; i < rules.length; i++) {
            const subset = rules.filter(function (r, j) { return j !== i; });
            if (anyLegalPick(pool, squad, taken, subset, ruleCtx, isPickLegal)) {
                return { level: 1, constraints: subset, dropped: [rules[i].id] };
            }
        }

        // Then pairs, before giving up on the rules entirely.
        for (let i = 0; i < rules.length; i++) {
            for (let j = i + 1; j < rules.length; j++) {
                const subset = rules.filter(function (r, k) { return k !== i && k !== j; });
                if (anyLegalPick(pool, squad, taken, subset, ruleCtx, isPickLegal)) {
                    return { level: 1, constraints: subset, dropped: [rules[i].id, rules[j].id] };
                }
            }
        }

        if (rules.length && anyLegalPick(pool, squad, taken, [], ruleCtx, isPickLegal)) {
            return { level: 1, constraints: [], dropped: rules.map(function (r) { return r.id; }) };
        }
        return { level: 2, constraints: [], dropped: rules.map(function (r) { return r.id; }) };
    }

    function autoPick(pool, squad, taken, starred, activeConstraints, ruleCtx, isPickLegal) {
        const empties = emptySlots(squad);
        if (!empties.length) return null;

        // If nothing is legal under the current rules, step down the ladder
        // rather than stranding the squad.
        const relax = relaxFor(pool, squad, taken, activeConstraints, ruleCtx, isPickLegal);
        if (relax.level === 2) return { stuck: true };
        activeConstraints = relax.constraints;
        const relaxed = relax.level > 0;
        const coverage = coverageContext(pool, squad, activeConstraints);

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
                    const v = evaluate(cand, frontFirst[s], squad, taken, activeConstraints, ruleCtx, isPickLegal, coverage);
                    if (v.eligible) return { player: cand, slotId: frontFirst[s], from: "queue", relaxed: relaxed };
                }
            }
        }

        // 2. Highest-rated eligible player for the first slot that needs one.
        for (let s = 0; s < frontFirst.length; s++) {
            const slotId = frontFirst[s];
            let best = null;
            for (let i = 0; i < pool.length; i++) {
                const p = pool[i];
                const v = evaluate(p, slotId, squad, taken, activeConstraints, ruleCtx, isPickLegal, coverage);
                if (!v.eligible) continue;
                // When the coverage rule is in play, prefer players who
                // cover a tournament not yet held, so the auto-picker does
                // not spend its slack early and strand itself.
                const covers = (coverage && p.year && !coverage.have[p.year]) ? 1 : 0;
                const score = v.effective + (coverage ? covers * 1000 : 0);
                if (!best || score > best.score) best = { player: p, effective: v.effective, score: score };
            }
            if (best) return { player: best.player, slotId: slotId, from: "best-available", relaxed: relaxed };
        }
        return null;
    }

    return {
        SLOTS, POS_GROUP, NODE_GROUP,
        slotById, nodeToSlotId, playerGroups,
        isForbidden, oopPenalty, effectiveRating, placementNote, naturalSlots,
        emptySquad, filledSlots, emptySlots, squadPlayers, isComplete, frontRowStillNeeded,
        playerKey, personKey, evaluate, candidatesForSlot, autoPick,
        anyLegalPick, relaxFor, coverageContext, wouldStrand
    };
});
