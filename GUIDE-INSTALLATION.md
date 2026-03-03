# 🎲 Guide d'installation — Bot Wargame Discord

## Pré-requis

- Un ordinateur (ou petit serveur) qui restera allumé quand le bot doit fonctionner
- **Node.js** version 18 ou supérieure ([télécharger ici](https://nodejs.org/))
- Un compte Discord avec les droits admin sur le serveur du club

---

## Étape 1 — Créer l'application Discord

1. Va sur **https://discord.com/developers/applications**
2. Clique **"New Application"**, donne-lui un nom (ex: `Wargame Bot`)
3. Note le **Application ID** (page "General Information") → c'est ton `CLIENT_ID`
4. Va dans **"Bot"** (menu de gauche)
   - Clique **"Reset Token"** et copie le token → c'est ton `DISCORD_TOKEN`
   - ⚠️ **Ne partage jamais ce token !**
5. Toujours dans "Bot", active ces options :
   - ✅ **Server Members Intent**
   - ✅ **Message Content Intent**
6. Va dans **"OAuth2" > "URL Generator"**
   - Coche les scopes : `bot` et `applications.commands`
   - Coche les permissions : `Send Messages`, `Embed Links`, `Read Message History`, `Use Slash Commands`, `Manage Messages`
   - Copie l'URL générée et ouvre-la dans ton navigateur pour **inviter le bot sur ton serveur**

---

## Étape 2 — Préparer le serveur Discord

1. **Crée 2 channels texte** (si pas déjà fait) :
   - `#réservations` — où le bot postera les messages de réservation
   - `#journal-paiements` — où le bot loguera les paiements

2. **Crée un rôle admin** (ex: `Gestionnaire Wargame`) et attribue-le aux personnes qui doivent gérer les soirées et abonnements

3. **Récupère les IDs** (il faut activer le mode développeur dans Discord : Paramètres > Avancés > Mode développeur) :
   - **ID du serveur** : clic droit sur le nom du serveur > "Copier l'identifiant"
   - **ID du channel réservations** : clic droit sur le channel > "Copier l'identifiant"
   - **ID du channel journal** : idem
   - **ID du rôle admin** : Paramètres du serveur > Rôles > clic droit sur le rôle > "Copier l'identifiant"

---

## Étape 3 — Installer le bot

Ouvre un terminal (ou Invite de commandes / PowerShell sur Windows).

```bash
# 1. Télécharge ou copie le dossier du projet, puis entre dedans
cd wargame-bot

# 2. Installe les dépendances
npm install

# 3. Crée le fichier de configuration
cp .env.example .env
```

Ouvre le fichier `.env` avec un éditeur de texte (Notepad, VS Code, nano…) et remplis les valeurs :

```env
DISCORD_TOKEN=ton_vrai_token_ici
CLIENT_ID=ton_application_id_ici
GUILD_ID=id_de_ton_serveur
CHANNEL_RESERVATIONS=id_du_channel_reservations
CHANNEL_JOURNAL=id_du_channel_journal
ADMIN_ROLE_ID=id_du_role_admin
ROLE_PING_IDS=id_role_1,id_role_2
EVENT_ADDRESS=227 Avenue de la Couronne à Ixelles, dans le bâtiment L
DEFAULT_EVENT_TIME=18:30-23:30
```

---

## Étape 4 — Enregistrer les commandes

Cette étape dit à Discord quelles commandes le bot propose. À faire **une seule fois** (ou quand on ajoute de nouvelles commandes) :

```bash
node src/deploy-commands.js
```

Tu devrais voir :
```
🔄 Enregistrement de 4 commande(s)...
✅ 4 commande(s) enregistrée(s) avec succès !
Commandes : /soiree, /abo, /paiement, /recap
```

---

## Étape 5 — Lancer le bot

```bash
npm start
```

Tu devrais voir :
```
📦 Commande chargée : /soiree
📦 Commande chargée : /abo
📦 Commande chargée : /paiement
📦 Commande chargée : /recap
📡 Event chargé : interactionCreate

🎲 Bot connecté en tant que Wargame Bot#1234
📡 Serveurs : 1
✅ Prêt !
```

Le bot est maintenant en ligne. **Il doit rester lancé** pour fonctionner.

---

## Utilisation quotidienne

### Créer une soirée (admin)

Dans n'importe quel channel, tape :
```
/soiree creer date:2026-03-12 tables:9 type:Jeudi (5€)
```
Tu peux aussi spécifier des horaires personnalisés :
```
/soiree creer date:2026-03-14 tables:9 type:Samedi (7€) horaires:19:00-00:00
```

Le bot poste automatiquement un message d'annonce dans `#réservations` avec les infos (tarifs, adresse, horaires, lien Google Calendar) et les tables disponibles pour s'inscrire. Les rôles configurés dans `ROLE_PING_IDS` sont automatiquement mentionnés.

### Les membres s'inscrivent

Ils cliquent simplement sur le menu déroulant dans le message de réservation, choisissent une table, et c'est fait. Le message se met à jour en temps réel.

### Check-in de la soirée (admin)

Le jour de la soirée (ou le lendemain) :
```
/soiree checkin
```
ou pour une date précise :
```
/soiree checkin date:2025-03-15
```

Le bot affiche la liste des présents avec leur statut de paiement. Ceux qui n'ont pas d'abonnement voient un bouton **"💰 J'ai payé la soirée"**.

### Gérer les abonnements (admin)

```
/abo annuel @NomDuMembre    → enregistre un abonnement annuel (12 mois)
/abo mensuel @NomDuMembre   → enregistre un abonnement mensuel (1 mois)
/abo status @NomDuMembre    → vérifie le statut d'un membre
/abo liste                   → vue d'ensemble de tous les abonnements
```

### Corriger un paiement (admin)

```
/paiement corriger @NomDuMembre date:2025-03-15 action:Marquer comme payé
/paiement corriger @NomDuMembre date:2025-03-15 action:Supprimer le paiement
```

### Voir le récapitulatif

```
/recap                → récap global des dernières soirées (admin)
/recap @NomDuMembre   → historique d'un membre spécifique
```

---

## Garder le bot allumé en permanence

### Option A — Sur un PC / serveur personnel

Utilise **PM2** pour que le bot redémarre automatiquement :

```bash
npm install -g pm2
pm2 start src/index.js --name wargame-bot
pm2 save
pm2 startup    # Suivre les instructions affichées pour démarrage auto
```

Commandes utiles :
```bash
pm2 status          # Voir si le bot tourne
pm2 logs wargame-bot  # Voir les logs
pm2 restart wargame-bot  # Redémarrer
```

### Option B — Sur un VPS (serveur en ligne)

Loue un petit VPS chez OVH, Hetzner, ou DigitalOcean (2-5€/mois) et suis la même procédure que ci-dessus.

### Option C — Hébergement gratuit

Des plateformes comme **Railway** ou **Fly.io** proposent des tiers gratuits suffisants pour un petit bot Discord.

---

## Structure du projet

```
wargame-bot/
├── .env                  ← Ta configuration (ne jamais partager !)
├── .env.example          ← Modèle de configuration
├── package.json          ← Dépendances du projet
├── data/
│   └── wargame.db        ← Base de données (créée automatiquement)
├── src/
│   ├── index.js          ← Point d'entrée du bot
│   ├── deploy-commands.js ← Script d'enregistrement des commandes
│   ├── utils.js          ← Fonctions utilitaires (embeds, boutons)
│   ├── commands/
│   │   ├── soiree.js     ← /soiree creer, /soiree checkin
│   │   ├── abo.js        ← /abo annuel, mensuel, status, liste
│   │   ├── paiement.js   ← /paiement corriger
│   │   ├── recap.js      ← /recap
│   │   └── bot-help.js   ← /bot-help
│   ├── database/
│   │   └── db.js         ← Base de données et requêtes
│   └── events/
│       └── interactions.js ← Gestion des boutons et menus
```

---

## Dépannage

| Problème | Solution |
|----------|----------|
| Les commandes n'apparaissent pas | Relance `node src/deploy-commands.js`. Attends quelques minutes. |
| Le bot est hors ligne | Vérifie qu'il tourne (`pm2 status` ou relance `npm start`). |
| "Missing Permissions" | Vérifie que le bot a les permissions dans les channels (Envoyer des messages, Intégrer des liens). |
| Les boutons ne marchent plus | Le bot a peut-être redémarré. Les boutons des anciens messages restent visuels mais liés au bot actif. |
| "GUILD_ID manquant" | Vérifie ton fichier `.env`. |

---

## Sauvegardes

La base de données est un fichier unique : `data/wargame.db`. Pour sauvegarder tes données, copie simplement ce fichier régulièrement.

```bash
# Exemple de sauvegarde manuelle
cp data/wargame.db data/backup-$(date +%Y%m%d).db
```
