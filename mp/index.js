/* Rugby XV Draft: turn notifications.
 *
 * One Cloud Function watches the draft's current picker in every room. When it
 * changes to a new user, it looks up that user's stored push tokens and sends
 * each device a "your pick" notification via Firebase Cloud Messaging.
 *
 * It also handles the nation draft (users drafting their nations) and the
 * parallel within-nation draft's shared start, so a user is told when it is
 * their turn in those phases too.
 *
 * Deploy notes are in functions/README.md.
 *
 * This uses the Firebase Admin SDK and the v2 Realtime Database triggers.
 */

const { onValueWritten } = require("firebase-functions/v2/database");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

// Send a "your turn" push to every device a user has registered in this room.
async function notifyUser(code, uid, title, body) {
  if (!uid) return;
  const db = getDatabase();

  const [tokensSnap, memberSnap] = await Promise.all([
    db.ref(`rooms/${code}/pushTokens/${uid}`).get(),
    db.ref(`rooms/${code}/members/${uid}`).get(),
  ]);

  // AI seats have no tokens; nothing to do.
  const member = memberSnap.val();
  if (!member || member.ai) return;

  const tokensObj = tokensSnap.val();
  if (!tokensObj) return;

  const entries = Object.entries(tokensObj);
  const tokens = entries.map(([, v]) => (v && v.token)).filter(Boolean);
  if (!tokens.length) return;

  // Data-only message so the service worker renders it consistently on every
  // platform. The URL sends the user back into the app.
  const message = {
    tokens,
    data: {
      title: title,
      body: body,
      tag: `turn-${code}`,
      url: "./index.html",
    },
    // A high priority nudge; it is a turn prompt, not marketing.
    android: { priority: "high" },
    apns: { headers: { "apns-priority": "10" } },
    webpush: { headers: { Urgency: "high" } },
  };

  try {
    const res = await getMessaging().sendEachForMulticast(message);
    // Clean up tokens the service rejected as no longer valid, so we do not
    // keep trying dead devices.
    const stale = [];
    res.responses.forEach((r, i) => {
      if (!r.success) {
        const codeStr = r.error && r.error.code ? r.error.code : "";
        if (
          codeStr.includes("registration-token-not-registered") ||
          codeStr.includes("invalid-registration-token") ||
          codeStr.includes("invalid-argument")
        ) {
          stale.push(entries[i][0]);
        }
      }
    });
    await Promise.all(
      stale.map((key) => db.ref(`rooms/${code}/pushTokens/${uid}/${key}`).remove())
    );
  } catch (e) {
    console.error("Push send failed for", uid, "in", code, e);
  }
}

const roomName = async (code) => {
  const snap = await getDatabase().ref(`rooms/${code}/settings/roomName`).get();
  return snap.val() || "your room";
};

// The main snake / sequential player draft: fires whenever currentPicker
// changes, and notifies the new picker.
exports.onPlayerTurn = onValueWritten(
  "/rooms/{code}/draft/currentPicker",
  async (event) => {
    const before = event.data.before.val();
    const after = event.data.after.val();
    if (!after || after === before) return;
    const code = event.params.code;
    await notifyUser(
      code,
      after,
      "Your pick",
      "It is your turn to draft. Tap to make your pick."
    );
  }
);

// The nation draft (users drafting their nations): the picker is the user at
// nationDraft.order[pickIndex]. Fire when pickIndex changes.
exports.onNationTurn = onValueWritten(
  "/rooms/{code}/nationDraft/pickIndex",
  async (event) => {
    const after = event.data.after.val();
    if (after === null || after === undefined) return;
    if (event.data.before.val() === after) return;
    const code = event.params.code;
    const db = getDatabase();
    const orderSnap = await db.ref(`rooms/${code}/nationDraft/order`).get();
    const order = orderSnap.val() || [];
    const uid = order[after];
    if (!uid) return;
    await notifyUser(
      code,
      uid,
      "Pick your nation",
      "It is your turn to choose a nation. Tap to pick."
    );
  }
);

// When a competition is announced (status becomes drafting), the first picker
// is set via currentPicker, which onPlayerTurn already covers. Nothing extra
// needed here.
