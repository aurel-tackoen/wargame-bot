const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const db = require("../database/db");
const { isAdmin, formatDate } = require("../utils");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("abo")
    .setDescription("Gestion des abonnements")
    .addSubcommand((sub) =>
      sub
        .setName("annuel")
        .setDescription("Enregistrer un abonnement annuel")
        .addUserOption((opt) =>
          opt.setName("membre").setDescription("Le membre").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("mensuel")
        .setDescription("Enregistrer un abonnement mensuel")
        .addUserOption((opt) =>
          opt.setName("membre").setDescription("Le membre").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("status")
        .setDescription("Voir le statut d'abonnement d'un membre")
        .addUserOption((opt) =>
          opt
            .setName("membre")
            .setDescription("Le membre (toi-même si omis)")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("liste")
        .setDescription("Vue d'ensemble de tous les abonnements actifs")
    )
    .addSubcommand((sub) =>
      sub
        .setName("supprimer")
        .setDescription("Supprimer l'abonnement actif d'un membre (admin)")
        .addUserOption((opt) =>
          opt.setName("membre").setDescription("Le membre").setRequired(true)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "annuel" || sub === "mensuel") {
      await handleAdd(interaction, sub);
    } else if (sub === "status") {
      await handleStatus(interaction);
    } else if (sub === "liste") {
      await handleListe(interaction);
    } else if (sub === "supprimer") {
      await handleSupprimer(interaction);
    }
  },
};

async function handleAdd(interaction, type) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({
      content: "❌ Seuls les admins peuvent enregistrer un abonnement.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const targetUser = interaction.options.getUser("membre");
  const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
  const targetDisplayName = targetMember ? targetMember.displayName : targetUser.username;
  db.ensureMember(targetUser.id, targetDisplayName);

  const { start, end } = db.addSubscription(
    targetUser.id,
    type,
    interaction.user.id
  );

  const emoji = type === "annuel" ? "👑" : "📅";
  await interaction.reply({
    content: `${emoji} Abonnement **${type}** enregistré pour **${targetDisplayName}**\n📆 Du **${start}** au **${end}**`,
  });

  // Log dans le journal
  await logToJournal(
    interaction,
    `${emoji} **Abonnement ${type}** enregistré pour **${targetDisplayName}** (par ${interaction.member.displayName}) — du ${start} au ${end}`
  );
}

async function handleStatus(interaction) {
  const targetUser = interaction.options.getUser("membre") || interaction.user;
  const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
  const targetDisplayName = targetMember ? targetMember.displayName : targetUser.username;
  const today = new Date().toISOString().split("T")[0];
  const sub = db.getActiveSubscription(targetUser.id, today);

  const embed = new EmbedBuilder()
    .setTitle(`📋 Statut — ${targetDisplayName}`)
    .setColor(sub ? 0x2ecc71 : 0xe74c3c)
    .setThumbnail(targetUser.displayAvatarURL());

  if (sub) {
    const emoji = sub.type === "annuel" ? "👑" : "📅";
    embed.setDescription(
      `${emoji} Abonnement **${sub.type}** actif\n\n` +
        `📆 Du **${sub.start_date}** au **${sub.end_date}**`
    );
  } else {
    embed.setDescription(
      "🔴 Aucun abonnement actif.\n\nLe paiement à la soirée sera requis."
    );
  }

  // Ajouter un mini historique
  const history = db.getMemberHistory(targetUser.id);
  if (history.bookings.length > 0) {
    const last5 = history.bookings.slice(0, 5);
    const histStr = last5
      .map(
        (b) =>
          `${b.status === "impayé" ? "🔴" : "🟢"} ${formatDate(b.date)} — ${b.status}`
      )
      .join("\n");
    embed.addFields({
      name: "Dernières soirées",
      value: histStr,
    });
  }

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handleListe(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({
      content: "❌ Seuls les admins peuvent voir la liste complète.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const subs = db.getAllSubscriptions();

  if (subs.length === 0) {
    return interaction.reply({
      content: "Aucun membre enregistré.",
      flags: MessageFlags.Ephemeral,
    });
  }

  // Grouper par statut
  const withSub = subs.filter((s) => s.type);
  const without = subs.filter((s) => !s.type);

  let desc = "";

  if (withSub.length > 0) {
    desc += "**Abonnements actifs :**\n";
    for (const s of withSub) {
      const emoji = s.type === "annuel" ? "👑" : "📅";
      desc += `${emoji} **${s.username}** — ${s.type} (jusqu'au ${s.end_date})\n`;
    }
  }

  if (without.length > 0) {
    desc += "\n**Sans abonnement :**\n";
    for (const s of without) {
      desc += `🔴 **${s.username}**\n`;
    }
  }

  const embed = new EmbedBuilder()
    .setTitle("📋 Abonnements du club")
    .setDescription(desc)
    .setColor(0x2b5797)
    .setTimestamp();

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handleSupprimer(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({
      content: "❌ Seuls les admins peuvent supprimer un abonnement.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const targetUser = interaction.options.getUser("membre");
  const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
  const targetDisplayName = targetMember ? targetMember.displayName : targetUser.username;
  const today = new Date().toISOString().split("T")[0];
  const activeSub = db.getActiveSubscription(targetUser.id, today);

  if (!activeSub) {
    return interaction.reply({
      content: `❌ **${targetDisplayName}** n'a aucun abonnement actif.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const result = db.removeActiveSubscription(targetUser.id);

  const emoji = activeSub.type === "annuel" ? "👑" : "📅";
  await interaction.reply({
    content: `🗑️ Abonnement **${activeSub.type}** de **${targetDisplayName}** supprimé (était valide jusqu'au ${activeSub.end_date}).`,
  });

  await logToJournal(
    interaction,
    `🗑️ **Abonnement ${activeSub.type}** de **${targetDisplayName}** supprimé par ${interaction.member.displayName}`
  );
}

async function logToJournal(interaction, message) {
  try {
    const channelId = process.env.CHANNEL_JOURNAL;
    const channel = interaction.guild.channels.cache.get(channelId);
    if (channel) {
      await channel.send(message);
    }
  } catch (err) {
    console.error("Erreur log journal:", err);
  }
}
