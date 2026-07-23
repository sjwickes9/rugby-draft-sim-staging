// ============================================================
// RUGBY XV DRAFT: MULTIPLAYER HELP
// ============================================================
// One body of explanatory text, used in three places:
//
//   1. the first run walkthrough, shown as a sequence of cards
//   2. the information circles dotted around the interface
//   3. the full instructions page reached from the home screen
//
// Writing it once means the walkthrough and the reference can never
// drift apart, and an information circle can offer a short answer with
// a route through to the longer one.
//
// IMPORTANT: the single player app on the same domain stores its own
// walkthrough opt out under localStorage "tipsDisabled". Both apps share
// an origin, so this module namespaces every key with "mp". Turning the
// tour off in one app must never turn it off in the other.
//
// Conventions: UK English. No em dashes or en dashes.
// ============================================================

(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) {
        module.exports = api;
    } else {
        root.MPHelp = api;
    }
})(typeof self !== "undefined" ? self : this, function () {

    // Namespaced so the single player walkthrough is untouched.
    const OPT_OUT_KEY = "mpTipsDisabled";
    const SEEN_PREFIX = "mpTipSeen_";

    // ── The content ─────────────────────────────────────────
    // Each topic can appear as a tip card, behind an information circle,
    // or as a section of the instructions page. "short" is the one or two
    // sentence answer an information circle shows; "body" is the full
    // explanation. Where there is no short form, the body is used.
    const TOPICS = {

        welcome: {
            title: "Drafting against other people",
            icon: "\u{1F3C9}",
            section: "Getting started",
            body: "<p>You and up to seven others build a starting fifteen by taking turns "
                + "to pick from a shared pool of World Cup players. Once a player is gone, "
                + "they are gone, so a squad is shaped as much by what your opponents take "
                + "as by what you want.</p>"
                + "<p>The sides then play each other and the results are simulated. A room "
                + "can run a single competition or a season of up to fifteen, with a champion "
                + "at the end.</p>"
        },

        rooms: {
            title: "Rooms, codes and invitations",
            icon: "\u{1F517}",
            section: "Getting started",
            short: "The host creates a room and shares its four character code. "
                + "Everyone else joins with that code.",
            body: "<p>One person creates the room and becomes the host. They choose the pool, "
                + "the rules and the length of the season, so it is worth agreeing those "
                + "beforehand if people care.</p>"
                + "<p>The room has a four character code. You can read it aloud, copy it with "
                + "the Share code button, or send a link with Share link. The link opens the "
                + "app with the code already filled in, but it does not join automatically, "
                + "because the newcomer still needs to enter a name and pick their colours.</p>"
        },

        mode: {
            title: "Career peak or tournament",
            icon: "\u{1F4C5}",
            section: "The pool",
            short: "Career peak gives one card per player at their best. Tournament "
                + "treats each World Cup appearance as a separate pick.",
            body: "<p><strong>Career peak</strong> collapses each player to a single card, "
                + "rated at their best. Jonny Wilkinson is simply Jonny Wilkinson.</p>"
                + "<p><strong>Tournament</strong> treats every World Cup appearance as its own "
                + "pick, so Wilkinson in 2003 and Wilkinson in 2011 are different cards at "
                + "different ratings. Only one of them can be drafted, because they are the "
                + "same man, but which version you get matters.</p>"
                + "<p>Tournament mode makes the year rules meaningful and rewards knowing "
                + "when a player actually peaked. Career peak is simpler and faster.</p>"
        },

        pool: {
            title: "Choosing the pool",
            icon: "\u{1F30D}",
            section: "The pool",
            short: "Narrow the pool by nation and by World Cup year to change what is "
                + "available to everyone.",
            body: "<p>The pool can be limited by geography, such as the Six Nations or the "
                + "Rugby Championship, and by which World Cups are included.</p>"
                + "<p>A narrow pool makes for a sharper contest, because the good players run "
                + "out quickly and the later picks really hurt. A wide pool is more forgiving "
                + "and produces stronger squads all round.</p>"
                + "<p>The pool is taken afresh at the start of each competition, so a season "
                + "does not slowly empty it.</p>"
        },

        rules: {
            title: "Squad rules",
            icon: "\u{2696}",
            section: "The pool",
            short: "Optional limits on how many players you can take from one nation "
                + "or one World Cup, and how many nations you must include.",
            body: "<p>The host can switch on any of these:</p>"
                + "<ul>"
                + "<li><strong>Maximum from one nation.</strong> Stops a squad being fifteen "
                + "All Blacks.</li>"
                + "<li><strong>Maximum from one World Cup.</strong> The same idea across years.</li>"
                + "<li><strong>At least one from each World Cup.</strong> Forces a spread "
                + "across the eras in the pool.</li>"
                + "<li><strong>Minimum nations.</strong> Your fifteen must represent at least "
                + "this many countries.</li>"
                + "</ul>"
                + "<p>Rules are checked as you pick, and the draft panel shows how you are "
                + "doing against each one. When a rule is close to forcing your hand, the "
                + "panel warns you before it is too late to satisfy it.</p>"
        },

        illegal: {
            title: "Squads that break the rules",
            icon: "\u{1F6A9}",
            section: "The pool",
            short: "An illegal squad still plays, and its results still count for "
                + "everyone else, but it cannot win the competition.",
            body: "<p>The draft works hard to stop you finishing with an illegal squad, "
                + "steering picks when a rule is about to become impossible to meet. It is "
                + "still possible to end up in breach in an awkward pool.</p>"
                + "<p>If that happens the squad plays its matches as normal and the results "
                + "count for its opponents, so nobody else is penalised. The squad itself "
                + "cannot win the competition, and the title passes to the highest placed "
                + "legal side. A rating penalty also applies for each breach.</p>"
        },

        draft: {
            title: "How the draft runs",
            icon: "\u{1F504}",
            section: "Drafting",
            short: "Picks go in snake order: last in one round picks first in the next.",
            body: "<p>The order is drawn at random for the first competition and runs as a "
                + "snake, so whoever picks last in a round picks first in the next. That keeps "
                + "an early position from being an overwhelming advantage.</p>"
                + "<p>In later competitions the order is reversed standings, so the side that "
                + "finished bottom picks first.</p>"
                + "<p>Pick by choosing a shirt number first, then the player for it. The list "
                + "is never sorted by rating, because working out who is actually best is the "
                + "point of the game.</p>"
        },

        board: {
            title: "The Big Board",
            icon: "\u{1F4CB}",
            section: "Drafting",
            short: "Your ordered shortlist. If your turn times out, it picks for you "
                + "from the top down.",
            body: "<p>The Big Board is a list of players you want, in priority order. You can "
                + "reorder it freely.</p>"
                + "<p>It matters more than a shortlist because it is what picks for you if "
                + "your turn runs out. The auto pick takes the highest board entry that is "
                + "legal and fits a position you still need. If the board is empty, it takes "
                + "the best available player instead.</p>"
                + "<p>So a well kept board is the difference between missing a turn and losing "
                + "a competition.</p>"
        },

        clock: {
            title: "The turn clock",
            icon: "\u{23F1}",
            section: "Drafting",
            short: "Each pick has a time limit. If it runs out, your Big Board picks "
                + "for you and the draft moves on.",
            body: "<p>The host sets how long each pick may take, ten minutes by default, and "
                + "it can be switched off entirely.</p>"
                + "<p>When a turn expires the pick is made automatically from that person's "
                + "Big Board, so one person stepping away cannot stall a room indefinitely. "
                + "The countdown shows usable time rather than wall clock time, so it pauses "
                + "during quiet hours rather than burning through the night.</p>"
        },

        positions: {
            title: "Positions and playing out of position",
            icon: "\u{1F455}",
            section: "Drafting",
            short: "Players can fill positions they did not play, but they are rated "
                + "lower for it.",
            body: "<p>Every shirt can be filled by anyone, but a player away from their "
                + "natural position is rated down, and the further the move the bigger the "
                + "penalty. A wing at fullback is a small adjustment. A prop at fly half is "
                + "not.</p>"
                + "<p>One hard limit: only players who genuinely played in the front row can "
                + "be picked at loosehead, hooker or tighthead. That is a safety law in the "
                + "real game and the app respects it.</p>"
        },

        chemistry: {
            title: "Chemistry",
            icon: "\u{1F91D}",
            section: "Drafting",
            short: "Players who actually played together give a small bonus. Full links "
                + "shared a squad, half links share a nation.",
            body: "<p>Seven partnerships are worth a bonus if you fill both ends of them: "
                + "the halfbacks, the front row, the locks, the back row, the centres, "
                + "ten and twelve, and the back three.</p>"
                + "<p>A <strong>full link</strong> means the two players were in the same World "
                + "Cup squad. Real teammates. In career peak mode that means they shared a "
                + "squad at any World Cup, not one particular year.</p>"
                + "<p>A <strong>half link</strong> means the same nation but different "
                + "tournaments. Plausible together, never actually confirmed.</p>"
                + "<p>A fully linked fifteen is worth about five per cent, so chemistry can "
                + "decide a close match but will never rescue a weak squad. The host can turn "
                + "it off entirely, in which case no bonus applies anywhere.</p>"
        },

        kicker: {
            title: "Goal kicker and strategy",
            icon: "\u{1F3AF}",
            section: "After the draft",
            short: "Pick who takes the kicks and whether you play through the forwards "
                + "or the backs.",
            body: "<p>Once your fifteen is complete you choose a goal kicker and a strategy.</p>"
                + "<p>Kicking success rates are deliberately not shown. Knowing who could "
                + "actually kick is part of the skill, so the choice is made on your own "
                + "knowledge rather than a number on the screen.</p>"
                + "<p>The strategy slider weights your forwards against your backs. A pack "
                + "heavy squad usually wants the weighting to match, but pushing it against "
                + "your strength is a legitimate gamble.</p>"
        },

        simulation: {
            title: "How matches are decided",
            icon: "\u{1F3DF}",
            section: "Results",
            short: "Ratings, strategy, chemistry and your kicker feed a simulation that "
                + "every player sees identically.",
            body: "<p>Each side gets an overall rating from its players, adjusted for anyone "
                + "out of position, the strategy weighting and any chemistry. The kicker "
                + "determines how many points come from conversions and penalties.</p>"
                + "<p>The simulation is seeded, which means every person in the room sees "
                + "exactly the same results in the same order. Nobody can reroll a bad "
                + "afternoon.</p>"
                + "<p>Results play out game by game, and you can speed that up or slow it "
                + "down. Scores stay hidden until you have watched, so nothing is spoiled by "
                + "someone else finishing first.</p>"
        },

        formats: {
            title: "Formats and standings",
            icon: "\u{1F3C6}",
            section: "Results",
            short: "Two sides play a Test series. More sides play a league or pools "
                + "with a final.",
            body: "<p>The format follows the number of sides. Two play a three Test series. "
                + "Larger numbers play a league, or pools followed by knockout matches.</p>"
                + "<p>League and pool tables use four points for a win and two for a draw, "
                + "with a bonus point for scoring four tries and another for losing by seven "
                + "or less. The BP column shows how many of your points came from bonuses. "
                + "Knockout matches do not award bonus points.</p>"
                + "<p>A Test series is decided on matches won. If the Tests are split, the "
                + "aggregate score settles it, and that is the only time the aggregate is "
                + "shown.</p>"
        },

        season: {
            title: "Seasons and the champion",
            icon: "\u{1F451}",
            section: "Results",
            short: "A season is several competitions. The champion is whoever wins most.",
            body: "<p>A room can run up to fifteen competitions. Each one is a fresh draft "
                + "from a fresh pool, so a bad first draft is not the end of your season.</p>"
                + "<p>After each competition you see that competition's winner and its leading "
                + "players. The season standings, the champion and the season wide statistics "
                + "live on the season outcome screen, so the two are never muddled.</p>"
                + "<p>The champion is whoever has won the most competitions.</p>"
        },

        ai: {
            title: "AI sides",
            icon: "\u{1F916}",
            section: "Other players",
            short: "Computer opponents with their own drafting personalities. Add them "
                + "to fill a room or play alone.",
            body: "<p>You can add up to seven AI sides, so a room works with one human or "
                + "eight. They are named after real clubs and wear their colours.</p>"
                + "<p>Each has a randomly generated personality: some favour a nation or a "
                + "hemisphere, some prefer older or more recent World Cups, some chase "
                + "chemistry, some build around the pack. Some draft erratically, which means "
                + "they value players correctly but are less consistent about taking their top "
                + "choice.</p>"
                + "<p>They will never draft an illegal squad, even where breaking a rule would "
                + "give them a stronger one. Their personalities are revealed at the end of the "
                + "season, so you can see afterwards whether you read them correctly.</p>"
        },

        cover: {
            title: "When somebody drops out",
            icon: "\u{1F464}",
            section: "Other players",
            short: "The host can assign an AI to cover an absent player's seat. They "
                + "can take it back when they return.",
            body: "<p>If somebody goes quiet, the host can assign an AI to cover their seat. "
                + "It is offered once they have been away long enough to miss a turn.</p>"
                + "<p>The seat still belongs to them. Their name and colours stay, with an AI "
                + "cover marker, and the AI drafts and plays on their behalf.</p>"
                + "<p>If they come back they are offered their seat again between "
                + "competitions, which is a clean handover point with nobody on the clock. "
                + "Take it back and you draft the next competition yourself.</p>"
                + "<p>The app cannot tell the difference between leaving for good and a phone "
                + "going to sleep, so this is always the host's judgement rather than "
                + "something that happens automatically.</p>"
        },

        host: {
            title: "The host",
            icon: "\u{1F3E0}",
            section: "Other players",
            short: "The host sets things up and starts each stage. If they go quiet, "
                + "somebody else can take over.",
            body: "<p>The host chooses the pool and rules, starts the draft, and moves the "
                + "room on between competitions. They can also push things along if somebody "
                + "is holding the room up.</p>"
                + "<p>If the host goes quiet for long enough, another player can take the role "
                + "over, so a room is never permanently stuck behind one person. If the host "
                + "leaves, the role passes automatically to another human.</p>"
        },

        quiet: {
            title: "Quiet hours",
            icon: "\u{1F319}",
            section: "Other players",
            short: "Set hours when your turn clock pauses, so a draft can run over days "
                + "without waking you.",
            body: "<p>Quiet hours are personal to you rather than set for the room, because "
                + "people play from different time zones.</p>"
                + "<p>Your turn clock pauses during your quiet hours and resumes afterwards, "
                + "so a slow draft played over several days does not cost you a pick "
                + "overnight. You must leave at least eight active hours a day, so quiet hours "
                + "cannot be used to stall a room indefinitely.</p>"
        }
    };

    // The walkthrough, in the order a new player meets these ideas. Kept
    // short on purpose: the reference page is there for the rest.
    const TOUR = ["welcome", "rooms", "mode", "rules", "draft", "board", "chemistry", "kicker"];

    // ── Opt out state ───────────────────────────────────────
    function optedOut() {
        try { return localStorage.getItem(OPT_OUT_KEY) === "1"; }
        catch (e) { return false; }
    }

    function setOptedOut(v) {
        try {
            if (v) localStorage.setItem(OPT_OUT_KEY, "1");
            else localStorage.removeItem(OPT_OUT_KEY);
        } catch (e) {}
    }

    function seen(key) {
        try { return sessionStorage.getItem(SEEN_PREFIX + key) === "1"; }
        catch (e) { return false; }
    }

    function markSeen(key) {
        try { sessionStorage.setItem(SEEN_PREFIX + key, "1"); } catch (e) {}
    }

    // Has the tour ever been completed or dismissed on this device?
    function tourDone() {
        try { return localStorage.getItem(OPT_OUT_KEY + "Tour") === "1"; }
        catch (e) { return false; }
    }
    function setTourDone() {
        try { localStorage.setItem(OPT_OUT_KEY + "Tour", "1"); } catch (e) {}
    }

    // ── Rendering ───────────────────────────────────────────
    function topic(key) { return TOPICS[key] || null; }

    function bodyOf(key) {
        const t = TOPICS[key];
        if (!t) return "";
        return t.body || ("<p>" + (t.short || "") + "</p>");
    }

    function shortOf(key) {
        const t = TOPICS[key];
        if (!t) return "";
        return t.short || stripTags(t.body).slice(0, 180);
    }

    function stripTags(html) {
        return String(html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    }

    // The full instructions page, grouped by section in the order the
    // sections first appear.
    function guideHtml() {
        const order = [];
        Object.keys(TOPICS).forEach(function (k) {
            const sec = TOPICS[k].section || "Other";
            if (order.indexOf(sec) === -1) order.push(sec);
        });
        return order.map(function (sec) {
            const keys = Object.keys(TOPICS).filter(function (k) {
                return (TOPICS[k].section || "Other") === sec;
            });
            return "<section class='guide-sec'>"
                + "<h2>" + sec + "</h2>"
                + keys.map(function (k) {
                    const t = TOPICS[k];
                    return "<details class='guide-item' id='guide_" + k + "'>"
                        + "<summary><span class='gicon'>" + (t.icon || "") + "</span>"
                        + t.title + "</summary>"
                        + "<div class='guide-body'>" + bodyOf(k) + "</div>"
                        + "</details>";
                }).join("")
                + "</section>";
        }).join("");
    }

    return {
        TOPICS, TOUR, OPT_OUT_KEY, SEEN_PREFIX,
        optedOut, setOptedOut, seen, markSeen, tourDone, setTourDone,
        topic, bodyOf, shortOf, guideHtml
    };
});
