const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
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
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "creer") {
      await handleCreer(interaction);
    } else if (sub === "checkin") {
      await handleCheckin(interaction);
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
  db.ensureMember(interaction.user.id, interaction.user.username);
  const eveningId = db.createEvening(dateStr, tables, interaction.user.id);
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

  const embed = buildEveningEmbed(evening);
  const components = buildReservationComponents(evening);

  let msg;
  try {
    msg = await channel.send({ embeds: [embed], components });
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
