const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require("discord.js");
const db = require("../database/db");

const MAX_PLAYERS_PER_TABLE = 4;

/**
 * Construit l'embed de réservation pour une soirée
 */
function buildEveningEmbed(evening) {
  const bookings = db.getBookings(evening.id);
  const tables = {};

  // Grouper les bookings par table
  for (let i = 1; i <= evening.total_tables; i++) {
    tables[i] = [];
  }
  for (const b of bookings) {
    if (!tables[b.table_number]) tables[b.table_number] = [];
    tables[b.table_number].push(b.username);
  }

  // Construire la description
  let desc = "";
  for (let i = 1; i <= evening.total_tables; i++) {
    const players = tables[i];
    const slots = MAX_PLAYERS_PER_TABLE - players.length;
    const playerList =
      players.length > 0
        ? players.map((p) => `> 🎲 ${p}`).join("\n")
        : "> _Libre_";
    const slotsText =
      slots > 0 ? `(${slots} place${slots > 1 ? "s" : ""} dispo)` : "(Complète)";
    desc += `\n**Table ${i}** ${slotsText}\n${playerList}\n`;
  }

  const totalPlayers = bookings.length;
  const totalSlots = evening.total_tables * MAX_PLAYERS_PER_TABLE;

  const embed = new EmbedBuilder()
    .setTitle(`🎲 Soirée Wargame — ${formatDate(evening.date)}`)
    .setDescription(desc)
    .setColor(0x2b5797)
    .setFooter({
      text: `${totalPlayers}/${totalSlots} joueurs inscrits • ${evening.total_tables} tables`,
    })
    .setTimestamp();

  return embed;
}

/**
 * Construit les boutons/menu de réservation
 */
function buildReservationComponents(evening) {
  const bookings = db.getBookings(evening.id);
  const components = [];

  // Menu déroulant pour choisir une table
  const options = [];
  for (let i = 1; i <= evening.total_tables; i++) {
    const count = bookings.filter((b) => b.table_number === i).length;
    const remaining = MAX_PLAYERS_PER_TABLE - count;
    if (remaining > 0) {
      options.push({
        label: `Table ${i}`,
        description: `${remaining} place${remaining > 1 ? "s" : ""} disponible${remaining > 1 ? "s" : ""}`,
        value: `join_table_${evening.id}_${i}`,
        emoji: "🎲",
      });
    }
  }

  if (options.length > 0) {
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`select_table_${evening.id}`)
      .setPlaceholder("Choisis une table pour t'inscrire…")
      .addOptions(options);

    components.push(
      new ActionRowBuilder().addComponents(selectMenu)
    );
  }

  // Bouton pour annuler sa résa
  const cancelBtn = new ButtonBuilder()
    .setCustomId(`cancel_booking_${evening.id}`)
    .setLabel("Annuler ma réservation")
    .setStyle(ButtonStyle.Danger)
    .setEmoji("❌");

  components.push(new ActionRowBuilder().addComponents(cancelBtn));

  return components;
}

/**
 * Construit l'embed de check-in / paiements pour une soirée
 */
function buildPaymentEmbed(evening) {
  const bookings = db.getBookings(evening.id);

  if (bookings.length === 0) {
    return {
      embed: new EmbedBuilder()
        .setTitle(`💰 Paiements — ${formatDate(evening.date)}`)
        .setDescription("Aucun inscrit pour cette soirée.")
        .setColor(0x999999),
      components: [],
    };
  }

  let desc = "";
  const needsPayment = [];

  for (const b of bookings) {
    const status = db.checkMemberStatus(b.member_id, evening.date, evening.id);
    desc += `**${b.username}** (Table ${b.table_number}) — ${status.reason}\n`;
    if (!status.covered) {
      needsPayment.push(b);
    }
  }

  const embed = new EmbedBuilder()
    .setTitle(`💰 Paiements — ${formatDate(evening.date)}`)
    .setDescription(desc)
    .setColor(needsPayment.length > 0 ? 0xe74c3c : 0x2ecc71)
    .setFooter({
      text: needsPayment.length > 0
        ? `${needsPayment.length} paiement(s) en attente`
        : "Tout le monde est en règle !",
    })
    .setTimestamp();

  const components = [];

  if (needsPayment.length > 0) {
    const payBtn = new ButtonBuilder()
      .setCustomId(`declare_paid_${evening.id}`)
      .setLabel("💰 J'ai payé la soirée")
      .setStyle(ButtonStyle.Success);

    components.push(new ActionRowBuilder().addComponents(payBtn));
  }

  return { embed, components };
}

/**
 * Formate une date YYYY-MM-DD en format lisible
 */
function formatDate(dateStr) {
  const days = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const months = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
  ];
  const d = new Date(dateStr + "T12:00:00");
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Vérifie qu'un membre a le rôle admin
 */
function isAdmin(member) {
  const adminRoleId = process.env.ADMIN_ROLE_ID;
  if (!adminRoleId) return false;
  return member.roles.cache.has(adminRoleId);
}

module.exports = {
  buildEveningEmbed,
  buildReservationComponents,
  buildPaymentEmbed,
  formatDate,
  isAdmin,
  MAX_PLAYERS_PER_TABLE,
};
