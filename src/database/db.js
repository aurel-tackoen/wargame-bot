const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "..", "data", "wargame.db");

let db;

function getDb() {
  if (!db) {
    const fs = require("fs");
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initTables();
  }
  return db;
}

function initTables() {
  db.exec(`
    -- Membres du club
    CREATE TABLE IF NOT EXISTS members (
      discord_id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Abonnements (annuel / mensuel)
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id TEXT NOT NULL REFERENCES members(discord_id),
      type TEXT NOT NULL CHECK(type IN ('annuel', 'mensuel')),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      registered_by TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Soirées
    CREATE TABLE IF NOT EXISTS evenings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      total_tables INTEGER NOT NULL,
      day_type TEXT NOT NULL DEFAULT 'jeudi',
      horaires TEXT,
      message_id TEXT,
      channel_id TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Réservations (un membre par ligne, rattaché à une table)
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      evening_id INTEGER NOT NULL REFERENCES evenings(id),
      member_id TEXT NOT NULL REFERENCES members(discord_id),
      table_number INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(evening_id, member_id)
    );

    -- Paiements à la soirée (déclaratif)
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      evening_id INTEGER NOT NULL REFERENCES evenings(id),
      member_id TEXT NOT NULL REFERENCES members(discord_id),
      declared_at TEXT DEFAULT (datetime('now')),
      UNIQUE(evening_id, member_id)
    );
  `);

  // Migration : ajouter day_type si la colonne n'existe pas encore
  const cols = db.prepare(`PRAGMA table_info(evenings)`).all();
  if (!cols.find((c) => c.name === "day_type")) {
    db.exec(`ALTER TABLE evenings ADD COLUMN day_type TEXT NOT NULL DEFAULT 'jeudi'`);
  }
  if (!cols.find((c) => c.name === "horaires")) {
    db.exec(`ALTER TABLE evenings ADD COLUMN horaires TEXT`);
  }
}

// ============================================
// HELPERS - MEMBRES
// ============================================

function ensureMember(discordId, username) {
  const d = getDb();
  d.prepare(
    `INSERT INTO members (discord_id, username) VALUES (?, ?)
     ON CONFLICT(discord_id) DO UPDATE SET username = excluded.username`
  ).run(discordId, username);
}

// ============================================
// HELPERS - ABONNEMENTS
// ============================================

function addSubscription(memberId, type, registeredBy) {
  const d = getDb();
  const now = new Date();
  const start = now.toISOString().split("T")[0];
  let end;
  if (type === "annuel") {
    const endDate = new Date(now);
    endDate.setFullYear(endDate.getFullYear() + 1);
    end = endDate.toISOString().split("T")[0];
  } else {
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + 1);
    end = endDate.toISOString().split("T")[0];
  }
  d.prepare(
    `INSERT INTO subscriptions (member_id, type, start_date, end_date, registered_by)
     VALUES (?, ?, ?, ?, ?)`
  ).run(memberId, type, start, end, registeredBy);
  return { start, end };
}

function getActiveSubscription(memberId, date) {
  const d = getDb();
  return d.prepare(
    `SELECT * FROM subscriptions
     WHERE member_id = ? AND start_date <= ? AND end_date >= ?
     ORDER BY
       CASE type WHEN 'annuel' THEN 0 ELSE 1 END,
       end_date DESC
     LIMIT 1`
  ).get(memberId, date, date);
}

function getAllSubscriptions() {
  const d = getDb();
  const today = new Date().toISOString().split("T")[0];
  return d.prepare(
    `SELECT m.username, m.discord_id, s.type, s.start_date, s.end_date
     FROM members m
     LEFT JOIN subscriptions s ON m.discord_id = s.member_id
       AND s.start_date <= ? AND s.end_date >= ?
     ORDER BY m.username`
  ).all(today, today);
}

// ============================================
// HELPERS - SOIRÉES
// ============================================

function createEvening(date, totalTables, createdBy, dayType = "jeudi", horaires = null) {
  const d = getDb();
  const result = d.prepare(
    `INSERT INTO evenings (date, total_tables, day_type, horaires, created_by) VALUES (?, ?, ?, ?, ?)`
  ).run(date, totalTables, dayType, horaires, createdBy);
  return result.lastInsertRowid;
}

function getEvening(eveningId) {
  return getDb().prepare(`SELECT * FROM evenings WHERE id = ?`).get(eveningId);
}

function getEveningByDate(date) {
  return getDb().prepare(`SELECT * FROM evenings WHERE date = ?`).get(date);
}

function updateEveningMessage(eveningId, messageId, channelId) {
  getDb().prepare(
    `UPDATE evenings SET message_id = ?, channel_id = ? WHERE id = ?`
  ).run(messageId, channelId, eveningId);
}

// ============================================
// HELPERS - RÉSERVATIONS
// ============================================

function addBooking(eveningId, memberId, tableNumber) {
  const d = getDb();
  d.prepare(
    `INSERT INTO bookings (evening_id, member_id, table_number) VALUES (?, ?, ?)`
  ).run(eveningId, memberId, tableNumber);
}

function removeBooking(eveningId, memberId) {
  const d = getDb();
  return d.prepare(
    `DELETE FROM bookings WHERE evening_id = ? AND member_id = ?`
  ).run(eveningId, memberId);
}

function getBookings(eveningId) {
  return getDb().prepare(
    `SELECT b.*, m.username FROM bookings b
     JOIN members m ON b.member_id = m.discord_id
     WHERE b.evening_id = ?
     ORDER BY b.table_number, b.created_at`
  ).all(eveningId);
}

function getBookingForMember(eveningId, memberId) {
  return getDb().prepare(
    `SELECT * FROM bookings WHERE evening_id = ? AND member_id = ?`
  ).get(eveningId, memberId);
}

function getTableOccupancy(eveningId, tableNumber) {
  return getDb().prepare(
    `SELECT COUNT(*) as count FROM bookings
     WHERE evening_id = ? AND table_number = ?`
  ).get(eveningId, tableNumber).count;
}

// ============================================
// HELPERS - PAIEMENTS
// ============================================

function declarePaid(eveningId, memberId) {
  const d = getDb();
  d.prepare(
    `INSERT OR IGNORE INTO payments (evening_id, member_id) VALUES (?, ?)`
  ).run(eveningId, memberId);
}

function removePaid(eveningId, memberId) {
  return getDb().prepare(
    `DELETE FROM payments WHERE evening_id = ? AND member_id = ?`
  ).run(eveningId, memberId);
}

function hasPaid(eveningId, memberId) {
  return !!getDb().prepare(
    `SELECT 1 FROM payments WHERE evening_id = ? AND member_id = ?`
  ).get(eveningId, memberId);
}

/**
 * Vérifie si un membre est "en règle" pour une soirée donnée.
 * Retourne { covered: true/false, reason: string }
 */
function checkMemberStatus(memberId, eveningDate, eveningId) {
  const sub = getActiveSubscription(memberId, eveningDate);
  if (sub) {
    return {
      covered: true,
      reason: sub.type === "annuel" ? "🟢 Abonnement annuel" : "🟢 Abonnement mensuel",
    };
  }
  if (hasPaid(eveningId, memberId)) {
    return { covered: true, reason: "🟢 Soirée payée" };
  }
  return { covered: false, reason: "🔴 Paiement requis" };
}

// ============================================
// HELPERS - HISTORIQUE
// ============================================

function getMemberHistory(memberId) {
  const d = getDb();
  const bookings = d.prepare(
    `SELECT e.date, b.table_number,
       CASE
         WHEN EXISTS (
           SELECT 1 FROM subscriptions s
           WHERE s.member_id = b.member_id AND s.start_date <= e.date AND s.end_date >= e.date
         ) THEN 'abonnement'
         WHEN EXISTS (
           SELECT 1 FROM payments p WHERE p.evening_id = e.id AND p.member_id = b.member_id
         ) THEN 'payé'
         ELSE 'impayé'
       END as status
     FROM bookings b
     JOIN evenings e ON b.evening_id = e.id
     WHERE b.member_id = ?
     ORDER BY e.date DESC
     LIMIT 20`
  ).all(memberId);

  const subs = d.prepare(
    `SELECT type, start_date, end_date FROM subscriptions
     WHERE member_id = ? ORDER BY end_date DESC LIMIT 5`
  ).all(memberId);

  return { bookings, subscriptions: subs };
}

module.exports = {
  getDb,
  ensureMember,
  addSubscription,
  getActiveSubscription,
  getAllSubscriptions,
  createEvening,
  getEvening,
  getEveningByDate,
  updateEveningMessage,
  addBooking,
  removeBooking,
  getBookings,
  getBookingForMember,
  getTableOccupancy,
  declarePaid,
  removePaid,
  hasPaid,
  checkMemberStatus,
  getMemberHistory,
};
