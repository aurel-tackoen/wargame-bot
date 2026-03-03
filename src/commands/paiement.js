const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const db = require("../database/db");
const { isAdmin, formatDate } = require("../utils");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("paiement")
    .setDescription("Gestion des paiements")
    .addSubcommand((sub) =>
      sub
        .setName("corriger")
        .setDescription("Corriger le statut de paiement d'un membre (admin)")
        .addUserOption((opt) =>
          opt.setName("membre").setDescription("Le membre").setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("date")
            .setDescription("Date de la soirée (YYYY-MM-DD) — par défaut aujourd'hui")
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName("action")
            .setDescription("Ajouter ou supprimer le paiement")
            .setRequired(false)
            .addChoices(
              { name: "Marquer comme payé", value: "ajouter" },
              { name: "Supprimer le paiement", value: "supprimer" }
            )
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "corriger") {
      await handleCorriger(interaction);
    }
  },
};

async function handleCorriger(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({
      content: "❌ Seuls les admins peuvent corriger un paiement.",
      ephemeral: true,
    });
  }

  const targetUser = interaction.options.getUser("membre");
  let dateStr = interaction.options.getString("date");
  const action = interaction.options.getString("action") || "ajouter";

  if (!dateStr) {
    dateStr = new Date().toISOString().split("T")[0];
  }

  const evening = db.getEveningByDate(dateStr);
  if (!evening) {
    return interaction.reply({
      content: `❌ Aucune soirée trouvée pour le ${formatDate(dateStr)}.`,
      ephemeral: true,
    });
  }

  db.ensureMember(targetUser.id, targetUser.username);

  if (action === "ajouter") {
    db.declarePaid(evening.id, targetUser.id);
    await interaction.reply({
      content: `✅ Paiement de **${targetUser.username}** pour le ${formatDate(dateStr)} marqué comme **payé** (par ${interaction.user.username}).`,
    });
  } else {
    db.removePaid(evening.id, targetUser.id);
    await interaction.reply({
      content: `🔄 Paiement de **${targetUser.username}** pour le ${formatDate(dateStr)} **supprimé** (par ${interaction.user.username}).`,
    });
  }

  // Log dans le journal
  try {
    const channelId = process.env.CHANNEL_JOURNAL;
    const channel = interaction.guild.channels.cache.get(channelId);
    if (channel) {
      const emoji = action === "ajouter" ? "✅" : "🔄";
      await channel.send(
        `${emoji} **Correction admin** : paiement de **${targetUser.username}** pour le ${formatDate(dateStr)} — ${action === "ajouter" ? "marqué payé" : "supprimé"} (par ${interaction.user.username})`
      );
    }
  } catch (err) {
    console.error("Erreur log journal:", err);
  }
}
