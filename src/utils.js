const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require("discord.js");
const db = require("./database/db");

const MAX_PLAYERS_PER_TABLE = 4;

/**
 * Construit l'embed de réservation pour une soirée (style annonce)
 */
function buildEveningEmbed(evening, channelName) {
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

  const dayType = evening.day_type || "jeudi";
  const isJeudi = dayType === "jeudi";
  const title = isJeudi ? "Tabletop Night" : "Tabletop Afternoon";
  const address = process.env.EVENT_ADDRESS || "227 Avenue de la Couronne à Ixelles, dans le bâtiment L";
  const time = evening.horaires || process.env.DEFAULT_EVENT_TIME || "18:30-23:30";
  const [startTime, endTime] = time.split("-");

  // Format time for display (24h → 12h AM/PM)
  const formatTime = (t) => {
    const [h, m] = t.trim().split(":");
    const hour = parseInt(h);
    const suffix = hour >= 12 ? "PM" : "AM";
    const h12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${h12}:${m} ${suffix}`;
  };

  // Info section
  let desc = `Rejoignez-nous ce ${isJeudi ? "jeudi" : "samedi"} pour jouer à des jeux de guerre dans notre tout nouveau local !\n`;
  desc += `Nous avons jusqu'à **${evening.total_tables} tables** de jeu complètes prêtes pour vous.\n`;
  desc += `Nous sommes situés au **${address}**.\n\n`;
  desc += `• Première fois: **Gratis!**\n`;
  desc += `• Jeudis: **5€**\n`;
  desc += `• Samedis: **7€**\n`;
  desc += `• Mensuel: **15€**\n`;
  desc += `• Annuel: **120€**\n`;

  // Tables section
  desc += `\n━━━━━━━━━━━━━━━━━━━\n`;
  desc += `📋 **Réservations**\n`;
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

  // Google Calendar link
  const googleStart = evening.date.replace(/-/g, "") + "T" + startTime.trim().replace(":", "") + "00";
  const googleEnd = evening.date.replace(/-/g, "") + "T" + endTime.trim().replace(":", "") + "00";
  const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${googleStart}/${googleEnd}&location=${encodeURIComponent(address)}`;

  // Days until
  const dateObj = new Date(evening.date + "T12:00:00");
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const daysUntil = Math.round((dateObj - now) / (1000 * 60 * 60 * 24));
  let daysText;
  if (daysUntil === 0) daysText = "aujourd'hui !";
  else if (daysUntil === 1) daysText = "demain !";
  else if (daysUntil < 0) daysText = "passée";
  else daysText = `dans ${daysUntil} jours`;

  const price = isJeudi ? "5€" : "7€";

  const embed = new EmbedBuilder()
    .setTitle(`🎲 ${title}`)
    .setDescription(desc)
    .setColor(0x2b5797);

  if (channelName) {
    embed.setAuthor({ name: `#${channelName}` });
  }

  embed.addFields({
      name: "🕐 Horaires",
      value: `**${formatDate(evening.date)}** de ${formatTime(startTime)} à ${formatTime(endTime)}\n[Ajouter à Google Calendar](${googleUrl})\n⏳ ${daysText}`,
    })
    .setFooter({
      text: `${totalPlayers}/${totalSlots} joueurs inscrits • ${evening.total_tables} tables • Entrée: ${price}`,
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

  const statusBtn = new ButtonBuilder()
    .setCustomId(`check_status_${evening.id}`)
    .setLabel("📋 Vérifier mon statut")
    .setStyle(ButtonStyle.Primary);

  components.push(new ActionRowBuilder().addComponents(statusBtn));

  return { embed, components };
}

/**
 * Formate une date YYYY-MM-DD en format lisible
 */
function formatDate(dateStr) {
  if (!dateStr) return "date inconnue";
  const days = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const months = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
  ];
  const d = new Date(dateStr + "T12:00:00");
  if (isNaN(d.getTime())) return dateStr;
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
