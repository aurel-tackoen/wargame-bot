const db = require("../database/db");
const { MessageFlags } = require("discord.js");
const {
  buildEveningEmbed,
  buildReservationComponents,
  buildPaymentEmbed,
  formatDate,
  MAX_PLAYERS_PER_TABLE,
} = require("../utils");

module.exports = {
  name: "interactionCreate",

  async execute(interaction) {
    // Gérer les menus déroulants (sélection de table)
    if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction);
      return;
    }

    // Gérer les boutons
    if (interaction.isButton()) {
      await handleButton(interaction);
      return;
    }
  },
};

// ============================================
// MENU DÉROULANT — Choix de table
// ============================================

async function handleSelectMenu(interaction) {
  const customId = interaction.customId;

  if (customId.startsWith("select_table_")) {
    const eveningId = parseInt(customId.replace("select_table_", ""));
    const value = interaction.values[0]; // "join_table_{eveningId}_{tableNum}"
    const parts = value.split("_");
    const tableNumber = parseInt(parts[parts.length - 1]);

    const evening = db.getEvening(eveningId);
    if (!evening) {
      return interaction.reply({
        content: "❌ Soirée introuvable.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Vérifier si le membre est déjà inscrit
    db.ensureMember(interaction.user.id, interaction.user.username);
    const existing = db.getBookingForMember(eveningId, interaction.user.id);
    if (existing) {
      return interaction.reply({
        content: `❌ Tu es déjà inscrit à la **Table ${existing.table_number}**. Annule d'abord ta réservation si tu veux changer.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // Vérifier la capacité de la table
    const occupancy = db.getTableOccupancy(eveningId, tableNumber);
    if (occupancy >= MAX_PLAYERS_PER_TABLE) {
      return interaction.reply({
        content: `❌ La **Table ${tableNumber}** est complète !`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // Inscrire le membre
    db.addBooking(eveningId, interaction.user.id, tableNumber);

    // Mettre à jour l'embed
    await updateEveningMessage(interaction, evening);

    await interaction.reply({
      content: `✅ Tu es inscrit à la **Table ${tableNumber}** pour le ${formatDate(evening.date)} !`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

// ============================================
// BOUTONS
// ============================================

async function handleButton(interaction) {
  const customId = interaction.customId;

  // --- Annuler une réservation ---
  if (customId.startsWith("cancel_booking_")) {
    const eveningId = parseInt(customId.replace("cancel_booking_", ""));
    const evening = db.getEvening(eveningId);

    if (!evening) {
      return interaction.reply({
        content: "❌ Soirée introuvable.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const existing = db.getBookingForMember(eveningId, interaction.user.id);
    if (!existing) {
      return interaction.reply({
        content: "❌ Tu n'es pas inscrit à cette soirée.",
        flags: MessageFlags.Ephemeral,
      });
    }

    db.removeBooking(eveningId, interaction.user.id);

    // Mettre à jour l'embed
    await updateEveningMessage(interaction, evening);

    await interaction.reply({
      content: `✅ Ta réservation pour le ${formatDate(evening.date)} a été annulée.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // --- Déclarer un paiement ---
  if (customId.startsWith("declare_paid_")) {
    const eveningId = parseInt(customId.replace("declare_paid_", ""));
    const evening = db.getEvening(eveningId);

    if (!evening) {
      return interaction.reply({
        content: "❌ Soirée introuvable.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Vérifier que le membre est inscrit à cette soirée
    const booking = db.getBookingForMember(eveningId, interaction.user.id);
    if (!booking) {
      return interaction.reply({
        content: "❌ Tu n'es pas inscrit à cette soirée.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Vérifier si déjà couvert
    const status = db.checkMemberStatus(
      interaction.user.id,
      evening.date,
      eveningId
    );
    if (status.covered) {
      return interaction.reply({
        content: `Tu es déjà en règle : ${status.reason}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // Enregistrer le paiement
    db.ensureMember(interaction.user.id, interaction.user.username);
    db.declarePaid(eveningId, interaction.user.id);

    // Mettre à jour l'embed de paiements
    const { embed, components } = buildPaymentEmbed(evening);
    try {
      await interaction.message.edit({ embeds: [embed], components });
    } catch (err) {
      console.error("Erreur mise à jour embed paiements:", err);
    }

    await interaction.reply({
      content: `✅ Paiement déclaré pour le ${formatDate(evening.date)}. Merci !`,
      flags: MessageFlags.Ephemeral,
    });

    // Log dans le journal
    try {
      const channelId = process.env.CHANNEL_JOURNAL;
      const channel = interaction.guild.channels.cache.get(channelId);
      if (channel) {
        await channel.send(
          `💰 **${interaction.user.username}** a déclaré avoir payé la soirée du ${formatDate(evening.date)}`
        );
      }
    } catch (err) {
      console.error("Erreur log journal:", err);
    }
  }
}

// ============================================
// MISE À JOUR DE L'EMBED DE SOIRÉE
// ============================================

async function updateEveningMessage(interaction, evening) {
  try {
    if (!evening.message_id || !evening.channel_id) return;

    const channel = interaction.guild.channels.cache.get(evening.channel_id);
    if (!channel) return;

    const msg = await channel.messages.fetch(evening.message_id);
    if (!msg) return;

    const embed = buildEveningEmbed(evening);
    const components = buildReservationComponents(evening);
    await msg.edit({ embeds: [embed], components });
  } catch (err) {
    console.error("Erreur mise à jour message soirée:", err);
  }
}
