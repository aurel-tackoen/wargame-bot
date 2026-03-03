const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const db = require("../database/db");
const { isAdmin, formatDate } = require("../utils");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("recap")
    .setDescription("Récapitulatif des soirées et paiements")
    .addUserOption((opt) =>
      opt
        .setName("membre")
        .setDescription("Voir le récap d'un membre spécifique")
        .setRequired(false)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser("membre");

    if (targetUser) {
      await handleMemberRecap(interaction, targetUser);
    } else {
      await handleGlobalRecap(interaction);
    }
  },
};

async function handleMemberRecap(interaction, targetUser) {
  const history = db.getMemberHistory(targetUser.id);

  const embed = new EmbedBuilder()
    .setTitle(`📊 Récap — ${targetUser.username}`)
    .setColor(0x2b5797)
    .setThumbnail(targetUser.displayAvatarURL());

  // Abonnements
  if (history.subscriptions.length > 0) {
    const subStr = history.subscriptions
      .map((s) => {
        const emoji = s.type === "annuel" ? "👑" : "📅";
        const today = new Date().toISOString().split("T")[0];
        const active = s.end_date >= today ? " *(actif)*" : "";
        return `${emoji} ${s.type} : ${s.start_date} → ${s.end_date}${active}`;
      })
      .join("\n");
    embed.addFields({ name: "Abonnements", value: subStr });
  } else {
    embed.addFields({
      name: "Abonnements",
      value: "Aucun abonnement enregistré",
    });
  }

  // Présences
  if (history.bookings.length > 0) {
    const bookStr = history.bookings
      .map((b) => {
        const icon =
          b.status === "abonnement"
            ? "👑"
            : b.status === "payé"
              ? "🟢"
              : "🔴";
        return `${icon} ${formatDate(b.date)} — Table ${b.table_number} — ${b.status}`;
      })
      .join("\n");
    embed.addFields({
      name: "Dernières soirées (max 20)",
      value: bookStr,
    });
  } else {
    embed.addFields({
      name: "Soirées",
      value: "Aucune participation enregistrée",
    });
  }

  // Compteurs
  const total = history.bookings.length;
  const unpaid = history.bookings.filter((b) => b.status === "impayé").length;
  embed.setFooter({
    text: `${total} soirée(s) au total • ${unpaid} impayée(s)`,
  });

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handleGlobalRecap(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({
      content:
        "❌ Le récap global est réservé aux admins. Tu peux utiliser `/recap @membre` pour voir ton propre historique, ou `/abo status` pour ton abonnement.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const d = db.getDb ? db.getDb() : require("../database/db").getDb();

  // Dernières soirées
  const recentEvenings = d
    .prepare(
      `SELECT e.*,
        (SELECT COUNT(*) FROM bookings WHERE evening_id = e.id) as player_count,
        (SELECT COUNT(*) FROM bookings b2
         WHERE b2.evening_id = e.id
         AND NOT EXISTS (
           SELECT 1 FROM subscriptions s
           WHERE s.member_id = b2.member_id AND s.start_date <= e.date AND s.end_date >= e.date
         )
         AND NOT EXISTS (
           SELECT 1 FROM payments p WHERE p.evening_id = e.id AND p.member_id = b2.member_id
         )
        ) as unpaid_count
       FROM evenings e
       ORDER BY e.date DESC LIMIT 10`
    )
    .all();

  if (recentEvenings.length === 0) {
    return interaction.reply({
      content: "Aucune soirée enregistrée pour le moment.",
      flags: MessageFlags.Ephemeral,
    });
  }

  let desc = "";
  for (const e of recentEvenings) {
    const status =
      e.unpaid_count > 0 ? `🔴 ${e.unpaid_count} impayé(s)` : "🟢 Tout payé";
    desc += `**${formatDate(e.date)}** — ${e.player_count} joueurs — ${status}\n`;
  }

  // Stats globales
  const totalMembers = d
    .prepare(`SELECT COUNT(*) as c FROM members`)
    .get().c;
  const totalEvenings = d
    .prepare(`SELECT COUNT(*) as c FROM evenings`)
    .get().c;

  const embed = new EmbedBuilder()
    .setTitle("📊 Récapitulatif du club")
    .setDescription(desc)
    .setColor(0x2b5797)
    .setFooter({
      text: `${totalMembers} membres enregistrés • ${totalEvenings} soirée(s) au total`,
    })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
