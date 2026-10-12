const express = require('express');
const noblox = require('noblox.js');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY;
const ROBLOSECURITY = process.env.ROBLOSECURITY;

let botUser = null;

// Initialisation de la connexion au compte Bot Roblox
async function startBot() {
    if (!ROBLOSECURITY) {
        console.error("❌ ERREUR : La variable ROBLOSECURITY est manquante dans l'environnement !");
        return;
    }

    try {
        // Connexion initiale avec le cookie
        await noblox.setCookie(ROBLOSECURITY);
        
        // On force la récupération des infos de l'utilisateur pour être sûr à 100%
        botUser = await noblox.getCurrentUser();
        
        if (botUser) {
            console.log(`✅ Bot Roblox connecté avec succès ! Pseudo : ${botUser.UserName} (ID: ${botUser.UserID})`);
        } else {
            console.error("❌ Impossible de charger les informations de l'utilisateur.");
        }
    } catch (err) {
        console.error("❌ Échec de connexion au bot Roblox (Cookie invalide ou expiré) :", err.message);
    }
}

// Route de test (Health Check)
app.get('/', (req, res) => {
    res.json({
        status: "Online",
        bot: botUser ? botUser.UserName : "Non connecté",
        timestamp: new Date().toISOString()
    });
});

// Route de Cash Out appelés depuis Roblox Studio
app.post('/api/cashout', async (req, res) => {
    try {
        // 1. Vérification de la clé d'API
        const clientApiKey = req.headers['x-api-key'];
        if (!API_KEY || clientApiKey !== API_KEY) {
            return res.status(401).json({ success: false, error: "Clé API non autorisée." });
        }

        const { requestId, userId, username, gamePassId, amount } = req.body;

        if (!gamePassId || !amount || amount <= 0) {
            return res.status(400).json({ success: false, error: "Paramètres de requête invalides." });
        }

        if (!botUser) {
            return res.status(500).json({ success: false, error: "Le bot Roblox n'est pas connecté." });
        }

        console.log(`[CashOut] Demande reçue : ${username} (ID: ${userId}) veut retirer ${amount} Robux via Game Pass #${gamePassId}`);

        // 2. Récupérer les informations du Game Pass
        let passInfo;
        try {
            passInfo = await noblox.getGamePassInfo(gamePassId);
        } catch (e) {
            return res.status(400).json({ success: false, error: "Game Pass introuvable ou ID invalide." });
        }

        if (!passInfo || !passInfo.PriceInRobux) {
            return res.status(400).json({ success: false, error: "Le Game Pass n'est pas en vente ou n'a pas de prix défini." });
        }

        // 3. Vérifier si le prix du Game Pass correspond au montant demandé
        if (passInfo.PriceInRobux !== amount) {
            return res.status(400).json({
                success: false,
                error: `Le prix du Game Pass (${passInfo.PriceInRobux} R$) ne correspond pas au montant demandé (${amount} R$).`
            });
        }

        // 4. Procéder à l'achat automatique du Game Pass avec les Robux du Bot
        const productId = passInfo.ProductId;
        console.log(`[CashOut] Achat du ProductId ${productId} au prix de ${passInfo.PriceInRobux} Robux...`);

        await noblox.buy(productId, passInfo.PriceInRobux);

        console.log(`✅ [CashOut Réussi] Game Pass #${gamePassId} acheté pour ${username} !`);

        return res.json({
            success: true,
            message: "Game Pass acheté avec succès !",
            purchaseId: requestId
        });

    } catch (error) {
        console.error("❌ Erreur lors du Cash Out :", error);
        return res.status(500).json({
            success: false,
            error: error.message || "Erreur interne du serveur de retrait."
        });
    }
});

// Démarrer le serveur
app.listen(PORT, () => {
    console.log(`🚀 Serveur écoute sur le port ${PORT}`);
    startBot();
});