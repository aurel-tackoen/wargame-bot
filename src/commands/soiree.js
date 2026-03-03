const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require("discord.js");
const db = require("../database/db");
const {
  buildEveningEmbed,
  buildReservationComponents,
  buildPaymentEmbed,
  formatDate,
  isAdmin,
} = require("../utils");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("soiree")
    .setDescription("Gestion des soirées wargame")
    .addSubcommand((sub) =>
      sub
        .setName("creer")
        .setDescription("Créer une nouvelle soirée")
        .addStringOption((opt) =>
          opt
            .setName("date")
            .setDescription("Date de la soirée (YYYY-MM-DD, ex: 2025-03-15)")
            .setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("tables")
            .setDescription("Nombre de tables disponibles")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(50)
        )
        .addStringOption((opt) =>
          opt
            .setName("type")
            .setDescription("Type de soirée (jeudi ou samedi)")
            .setRequired(true)
            .addChoices(
              { name: "Jeudi (5€)", value: "jeudi" },
              { name: "Samedi (7€)", value: "samedi" }
            )
        )
        .addStringOption((opt) =>
          opt
            .setName("horaires")
            .setDescription("Horaires (HH:MM-HH:MM) — par défaut depuis la config")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("checkin")
        .setDescription("Lancer la vérification des paiements pour une soirée")
        .addStringOption((opt) =>
          opt
            .setName("date")
            .setDescription("Date de la soirée (YYYY-MM-DD) — par défaut aujourd'hui")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("relance")
        .setDescription("Envoyer un DM de rappel aux membres qui n'ont pas payé (admin)")
        .addStringOption((opt) =>
          opt
            .setName("date")
            .setDescription("Date de la soirée (YYYY-MM-DD) — par défaut aujourd'hui")
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "creer") {
      await handleCreer(interaction);
    } else if (sub === "checkin") {
      await handleCheckin(interaction);
    } else if (sub === "relance") {
      await handleRelance(interaction);
    }
  },
};

async function handleCreer(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({
      content: "❌ Seuls les admins peuvent créer une soirée.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const dateStr = interaction.options.getString("date");
  const tables = interaction.options.getInteger("tables");
  const dayType = interaction.options.getString("type");
  const horaires = interaction.options.getString("horaires") || process.env.DEFAULT_EVENT_TIME || "18:30-23:30";

  // Validation du format de date
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return interaction.reply({
      content: "❌ Format de date invalide. Utilise **YYYY-MM-DD** (ex: 2025-03-15).",
      flags: MessageFlags.Ephemeral,
    });
  }

  // Vérifier que la date est valide
  const testDate = new Date(dateStr + "T12:00:00");
  if (isNaN(testDate.getTime())) {
    return interaction.reply({
      content: "❌ Date invalide.",
      flags: MessageFlags.Ephemeral,
    });
  }

  // Vérifier qu'il n'y a pas déjà une soirée ce jour
  const existing = db.getEveningByDate(dateStr);
  if (existing) {
    return interaction.reply({
      content: `❌ Il y a déjà une soirée le ${formatDate(dateStr)}.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // Créer la soirée
  db.ensureMember(interaction.user.id, interaction.member.displayName);
  const eveningId = db.createEvening(dateStr, tables, interaction.user.id, dayType, horaires);
  const evening = db.getEvening(eveningId);

  // Poster le message de réservation dans le channel dédié
  const channelId = process.env.CHANNEL_RESERVATIONS;
  const channel = interaction.guild.channels.cache.get(channelId);

  if (!channel) {
    return interaction.reply({
      content: `✅ Soirée créée, mais je n'ai pas trouvé le channel de réservation. Vérifie CHANNEL_RESERVATIONS dans la config.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const embed = buildEveningEmbed(evening, channel.name);
  const components = buildReservationComponents(evening);

  // Mentions des rôles configurés
  const rolePingIds = (process.env.ROLE_PING_IDS || "").split(",").filter(Boolean);
  const roleMentions = rolePingIds.map((id) => `<@&${id.trim()}>`).join(" ");

  let msg;
  try {
    msg = await channel.send({
      content: roleMentions || undefined,
      embeds: [embed],
      components,
    });
  } catch (err) {
    console.error("Erreur envoi message réservation:", err);
    return interaction.reply({
      content: `✅ Soirée créée, mais je n'ai pas pu poster dans <#${channelId}>. Vérifie que j'ai la permission **Envoyer des messages** dans ce salon.`,
      flags: MessageFlags.Ephemeral,
    });
  }
  db.updateEveningMessage(eveningId, msg.id, channel.id);

  await interaction.reply({
    content: `✅ Soirée du **${formatDate(dateStr)}** créée avec **${tables} tables** ! Le message de réservation a été posté dans <#${channelId}>.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleRelance(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({
      content: "❌ Seuls les admins peuvent envoyer des relances.",
      flags: MessageFlags.Ephemeral,
    });
  }

  let dateStr = interaction.options.getString("date");
  if (!dateStr) {
    dateStr = new Date().toISOString().split("T")[0];
  }

  const evening = db.getEveningByDate(dateStr);
  if (!evening) {
    return interaction.reply({
      content: `❌ Aucune soirée trouvée pour le ${formatDate(dateStr)}.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const bookings = db.getBookings(evening.id);
  if (bookings.length === 0) {
    return interaction.reply({
      content: `❌ Aucun inscrit pour la soirée du ${formatDate(dateStr)}.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // Trouver les membres qui doivent payer
  const unpaid = [];
  for (const b of bookings) {
    const status = db.checkMemberStatus(b.member_id, evening.date, evening.id);
    if (!status.covered) {
      unpaid.push(b);
    }
  }

  if (unpaid.length === 0) {
    return interaction.reply({
      content: `✅ Tout le monde est en règle pour le ${formatDate(dateStr)} ! Aucune relance nécessaire.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const isJeudi = (evening.day_type || "jeudi") === "jeudi";
  const price = isJeudi ? "5€" : "7€";
  let sent = 0;
  let failed = 0;
  const failedUsers = [];

  for (const b of unpaid) {
    try {
      const member = await interaction.guild.members.fetch(b.member_id);

      const embed = new EmbedBuilder()
        .setTitle("💰 Rappel de paiement")
        .setDescription(
          `Salut **${member.displayName}** !\n\n` +
          `Tu es inscrit(e) à la soirée du **${formatDate(evening.date)}** (Table ${b.table_number}) ` +
          `mais ton paiement de **${price}** n'a pas encore été enregistré.\n\n` +
          `Si tu as déjà payé, clique sur le bouton ci-dessous pour confirmer.`
        )
        .setColor(0xe74c3c)
        .setFooter({ text: "Wargame Bot • Rappel automatique" })
        .setTimestamp();

      const payBtn = new ButtonBuilder()
        .setCustomId(`confirm_paid_${evening.id}`)
        .setLabel("J'ai payé la soirée")
        .setStyle(ButtonStyle.Success)
        .setEmoji("💰");

      const row = new ActionRowBuilder().addComponents(payBtn);

      await member.send({ embeds: [embed], components: [row] });
      sent++;
    } catch (err) {
      console.error(`Erreur envoi DM à ${b.username}:`, err.message);
      failed++;
      failedUsers.push(b.username);
    }
  }

  let report = `📨 Relance envoyée pour le **${formatDate(dateStr)}** :\n`;
  report += `• ✅ ${sent} DM${sent > 1 ? "s" : ""} envoyé${sent > 1 ? "s" : ""}\n`;
  if (failed > 0) {
    report += `• ❌ ${failed} échec${failed > 1 ? "s" : ""} (DMs désactivés ou erreur) : ${failedUsers.join(", ")}\n`;
  }

  await interaction.editReply({ content: report });
}

async function handleCheckin(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({
      content: "❌ Seuls les admins peuvent lancer un check-in.",
      flags: MessageFlags.Ephemeral,
    });
  }

  let dateStr = interaction.options.getString("date");
  if (!dateStr) {
    dateStr = new Date().toISOString().split("T")[0];
  }

  const evening = db.getEveningByDate(dateStr);
  if (!evening) {
    return interaction.reply({
      content: `❌ Aucune soirée trouvée pour le ${formatDate(dateStr)}.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const { embed, components } = buildPaymentEmbed(evening);
  await interaction.reply({ embeds: [embed], components });
}
