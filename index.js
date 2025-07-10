const { Telegraf } = require('telegraf');
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// === AI-помощник через OpenRouter (DeepSeek или др.) ===
async function askOpenRouter(prompt) {
    try {
        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions',
            {
                model: "deepseek-chat",
                messages: [
                    { role: "system", content: "You are a helpful AI CEO assistant that communicates like a human." },
                    { role: "user", content: prompt }
                ]
            },
            {
                headers: {
                    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data.choices[0].message.content.trim();
    } catch (error) {
        console.error("OpenRouter API error:", error.message);
        return "⚠️ Sorry, I couldn't get a response from the AI.";
    }
}

// === Ответы на все текстовые сообщения ===
bot.on('text', async (ctx) => {
    const userMessage = ctx.message.text;
    if (userMessage === '/start') {
        return ctx.reply('🤖 AI CEO онлайн. Жду ваших задач!');
    }

    // Ответ от OpenRouter
    const aiResponse = await askOpenRouter(userMessage);
    ctx.reply(aiResponse);
});

// === Webhook ===
app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
    bot.handleUpdate(req.body, res);
});

// Запуск сервера Express
app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);
    const webhookUrl = `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/bot${process.env.BOT_TOKEN}`;
    await bot.telegram.setWebhook(webhookUrl);
    console.log(`Webhook set to: ${webhookUrl}`);
});