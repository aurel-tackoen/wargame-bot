const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("bot-help")
    .setDescription("Affiche la liste de toutes les commandes disponibles"),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle("📖 Commandes du bot Wargame")
      .setColor(0x2b5797)
      .setDescription("Voici toutes les commandes disponibles et leurs options.")
      .addFields(
        {
          name: "🎲 /soiree creer",
          value:
            "Créer une nouvelle soirée *(admin)*\n" +
            "• `date` — Date de la soirée (YYYY-MM-DD) *(obligatoire)*\n" +
            "• `tables` — Nombre de tables disponibles, 1-50 *(obligatoire)*",
        },
        {
          name: "🎲 /soiree checkin",
          value:
            "Lancer la vérification des paiements pour une soirée *(admin)*\n" +
            "• `date` — Date de la soirée (YYYY-MM-DD) *(par défaut : aujourd'hui)*",
        },
        {
          name: "👑 /abo annuel",
          value:
            "Enregistrer un abonnement annuel *(admin)*\n" +
            "• `membre` — Le membre *(obligatoire)*",
        },
        {
          name: "📅 /abo mensuel",
          value:
            "Enregistrer un abonnement mensuel *(admin)*\n" +
            "• `membre` — Le membre *(obligatoire)*",
        },
        {
          name: "📋 /abo status",
          value:
            "Voir le statut d'abonnement d'un membre\n" +
            "• `membre` — Le membre *(par défaut : toi-même)*",
        },
        {
          name: "📋 /abo liste",
          value: "Vue d'ensemble de tous les abonnements actifs *(admin)*",
        },
        {
          name: "💰 /paiement corriger",
          value:
            "Corriger le statut de paiement d'un membre *(admin)*\n" +
            "• `membre` — Le membre *(obligatoire)*\n" +
            "• `date` — Date de la soirée (YYYY-MM-DD) *(par défaut : aujourd'hui)*\n" +
            "• `action` — Marquer comme payé / Supprimer le paiement *(par défaut : payé)*",
        },
        {
          name: "📊 /recap",
          value:
            "Récapitulatif des soirées et paiements\n" +
            "• `membre` — Voir le récap d'un membre spécifique *(optionnel, récap global si omis — admin)*",
        },
        {
          name: "📖 /bot-help",
          value: "Affiche ce message d'aide",
        }
      )
      .setFooter({ text: "Les commandes marquées (admin) nécessitent le rôle administrateur." })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
