const db = require("../database/db");
const { MessageFlags, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require("discord.js");
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
    db.ensureMember(interaction.user.id, interaction.member.displayName);
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

  // --- Vérifier mon statut ---
  if (customId.startsWith("check_status_")) {
    const eveningId = parseInt(customId.replace("check_status_", ""));
    const evening = db.getEvening(eveningId);

    if (!evening) {
      return interaction.reply({
        content: "❌ Soirée introuvable.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Vérifier que le membre est inscrit
    const booking = db.getBookingForMember(eveningId, interaction.user.id);
    if (!booking) {
      return interaction.reply({
        content: "❌ Tu n'es pas inscrit à cette soirée. Inscris-toi d'abord via le message de réservation.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Vérifier le statut
    const status = db.checkMemberStatus(
      interaction.user.id,
      evening.date,
      eveningId
    );

    if (status.covered) {
      return interaction.reply({
        content: `✅ Tu es en règle pour le ${formatDate(evening.date)} !\n${status.reason}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // Pas couvert → proposer le bouton de paiement
    const payBtn = new ButtonBuilder()
      .setCustomId(`confirm_paid_${evening.id}`)
      .setLabel("💰 J'ai payé la soirée")
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder().addComponents(payBtn);

    return interaction.reply({
      content: `🔴 Tu n'as pas encore payé pour le **${formatDate(evening.date)}**.\nSi tu as payé, clique ci-dessous pour confirmer.`,
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  }

  // --- Confirmer le paiement (bouton éphémère) ---
  if (customId.startsWith("confirm_paid_")) {
    const eveningId = parseInt(customId.replace("confirm_paid_", ""));
    const evening = db.getEvening(eveningId);

    if (!evening) {
      return interaction.reply({
        content: "❌ Soirée introuvable.",
        flags: MessageFlags.Ephemeral,
      });
    }

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
        content: `✅ Tu es déjà en règle ! ${status.reason}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // Enregistrer le paiement
    db.ensureMember(interaction.user.id, interaction.member.displayName);
    db.declarePaid(eveningId, interaction.user.id);

    // Mettre à jour l'embed de paiements (message parent du checkin)
    try {
      const checkinChannel = interaction.message.channel;
      // Find the checkin message - the confirm_paid button is in an ephemeral message,
      // so we need to find the original checkin message in the channel
      const { embed, components } = buildPaymentEmbed(evening);
      // Try to update the original interaction message's referenced message
      if (interaction.message.reference?.messageId) {
        const originalMsg = await checkinChannel.messages.fetch(interaction.message.reference.messageId);
        await originalMsg.edit({ embeds: [embed], components });
      }
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
          `💰 **${interaction.member.displayName}** a déclaré avoir payé la soirée du ${formatDate(evening.date)}`
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

    const embed = buildEveningEmbed(evening, channel.name);
    const components = buildReservationComponents(evening);
    await msg.edit({ embeds: [embed], components });
  } catch (err) {
    console.error("Erreur mise à jour message soirée:", err);
  }
}
