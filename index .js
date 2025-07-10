import { Telegraf } from 'telegraf';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Telegram bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// Google Sheets setup
const creds = JSON.parse(fs.readFileSync(path.join(__dirname, 'n8n-assistant-465403-835ca294442f.json')));
const doc = new GoogleSpreadsheet('1q4GCoGWB5TY0_SlZdc6kO1WaPT1byvtV'); // ID твоей таблицы

async function addTaskToSheet(user, message, isFromAI = false) {
  try {
    await doc.useServiceAccountAuth(creds);
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['CEO']; // Название вкладки
    await sheet.addRow({
      Date: new Date().toLocaleString(),
      From: isFromAI ? 'AI' : user,
      Message: message
    });
  } catch (error) {
    console.error('Error writing to sheet:', error);
  }
}

// OpenRouter (DeepSeek) — AI ответ
async function askAI(prompt) {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7
      })
    });

    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'Что-то пошло не так...';
  } catch (error) {
    console.error('AI error:', error);
    return 'Произошла ошибка при обращении к AI.';
  }
}

// Обработка сообщений
bot.on('text', async (ctx) => {
  const user = ctx.from.first_name || 'User';
  const message = ctx.message.text;

  // Если команда /start
  if (message === '/start') {
    ctx.reply('👋 AI-CEO онлайн. Напишите мне, и я предложу задачи или помогу вам!');
    return;
  }

  // Добавим в таблицу
  await addTaskToSheet(user, message, false);

  // Ответ AI
  const aiReply = await askAI(message);
  ctx.reply(aiReply);

  // Запишем ответ AI тоже
  await addTaskToSheet('AI', aiReply, true);
});

bot.launch();
console.log('✅ AI-CEO бот запущен!');