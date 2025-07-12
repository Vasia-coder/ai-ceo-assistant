require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs');
const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const speech = require('@google-cloud/speech');
const https = require('https');
const cron = require('node-cron');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Google Sheets Setup
const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const SHEET_ID = '1-wCeJih8Np60e17YdynvkSWz8zGSnsU4xDZPvm4uHMQ';

// Speech to Text client
const speechClient = new speech.SpeechClient({
  keyFilename: process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH
});

// ChatGPT via OpenRouter
async function askOpenRouter(message) {
  try {
    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: "deepseek/deepseek-r1-0528-qwen3-8b:free",
      messages: [{ role: "user", content: message }]
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data && response.data.choices && response.data.choices.length > 0) {
      return response.data.choices[0].message.content;
    } else {
      return "🤖 Извините, я не получил ответа от ИИ.";
    }
  } catch (error) {
    console.error("❌ OpenRouter API error:", error.message);
    return "🤖 Ошибка при обращении к ИИ.";
  }
}

// Start command
bot.start((ctx) => ctx.reply('🤖 AI CEO активен и готов помочь!'));

// Voice messages
bot.on('voice', async (ctx) => {
  const fileId = ctx.message.voice.file_id;
  const fileLink = await ctx.telegram.getFileLink(fileId);
  const filePath = `./voice_${Date.now()}.ogg`;

  const file = fs.createWriteStream(filePath);
  https.get(fileLink.href, (response) => {
    response.pipe(file);
    file.on('finish', async () => {
      file.close();

      const audioBytes = fs.readFileSync(filePath).toString('base64');
      const audio = { content: audioBytes };
      const config = {
        encoding: 'OGG_OPUS',
        sampleRateHertz: 48000,
        languageCode: 'ru-RU'
      };
      const request = { audio, config };

      try {
        const [response] = await speechClient.recognize(request);
        const transcription = response.results.map(r => r.alternatives[0].transcript).join(' ');
        ctx.reply(`🗣️ Распознано: ${transcription}`);

        const client = await auth.getClient();
        const sheets = google.sheets({ version: 'v4', auth: client });
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID,
          range: 'CEO!A1',
          valueInputOption: 'RAW',
          requestBody: {
            values: [[
              new Date().toLocaleDateString(),
              transcription,
              ctx.message.from.username || 'CEO',
              'new'
            ]]
          }
        });

        ctx.reply('✅ Задача добавлена из голосового сообщения.');
      } catch (err) {
        console.error('❌ Ошибка распознавания или записи:', err.message);
        ctx.reply('⚠️ Не удалось обработать голосовое сообщение.');
      }
    });
  });
});

// Task detection
function isPotentialTask(text) {
  const keywords = ['надо', 'нужно', 'сделай', 'запланируй', 'создать', 'отправить', 'добавь', 'сформируй', 'встретиться', 'обсудить', 'напомни'];
  return keywords.some(word => text.toLowerCase().includes(word));
}

// Text messages
bot.on('text', async (ctx) => {
  const userMessage = ctx.message.text;
  const chatId = ctx.chat.id;

  const aiResponse = await askOpenRouter(userMessage);
  ctx.reply(aiResponse);

  if (isPotentialTask(userMessage)) {
    ctx.reply('📌 Сохранить это как задачу?', Markup.inlineKeyboard([
      Markup.button.callback('✅ Да', `save_task:${userMessage}`),
      Markup.button.callback('❌ Нет', 'cancel_task')
    ]));
  }
});

bot.action(/save_task:(.+)/, async (ctx) => {
  const task = ctx.match[1];
  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'CEO!A1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          new Date().toLocaleDateString(),
          task,
          ctx.from.username || 'CEO',
          'new'
        ]]
      }
    });
    await ctx.editMessageText('✅ Задача сохранена.');
  } catch (err) {
    console.error("❌ Google Sheets error:", err.message);
    await ctx.reply("❌ Ошибка при сохранении задачи.");
  }
});

bot.action('cancel_task', async (ctx) => {
  await ctx.editMessageText('❎ Отмена задачи.');
});

// Show tasks
bot.command('show_tasks', async (ctx) => {
  ctx.reply('Выберите статус задач:', Markup.inlineKeyboard([
    [Markup.button.callback('📌 Новые', 'tasks:new')],
    [Markup.button.callback('🔧 В работе', 'tasks:inprogress')],
    [Markup.button.callback('✅ Готово', 'tasks:done')]
  ]));
});

bot.action(/tasks:(.+)/, async (ctx) => {
  const status = ctx.match[1];
  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'CEO!A1:D1000'
    });

    const rows = response.data.values || [];
    const filtered = rows.filter(row => row[3] && row[3].toLowerCase() === status);

    if (filtered.length === 0) {
      await ctx.reply('📭 Задач с таким статусом нет.');
    } else {
      const message = filtered.map(row => `📅 ${row[0]} — ${row[1]} (👤 ${row[2]})`).join('\n\n');
      await ctx.reply(`📋 Задачи со статусом "${status}":\n\n${message}`);
    }
  } catch (err) {
    console.error("❌ Google Sheets read error:", err.message);
    await ctx.reply("❌ Не удалось получить задачи.");
  }
});

// Ежедневный анализ рынка в 08:00 AM
cron.schedule('0 8 * * *', async () => {
  const prompt = `Проанализируй рынок ландшафтных услуг в районе GTA (Торонто, Канада). Используй ключевые слова: lawn care, landscaping, interlock, fences, spring cleanup. Выведи на русском языке краткий отчёт, с рекомендациями как улучшить бизнес.`;
  const report = await askOpenRouter(prompt);
  bot.telegram.sendMessage(process.env.TELEGRAM_OWNER_ID, `📊 Ежедневный отчёт:\n\n${report}`);
});

// Webhook
bot.launch({
  webhook: {
    domain: process.env.RENDER_EXTERNAL_HOSTNAME,
    port: process.env.PORT || 10000
  }
});

console.log(`✅ Bot is running via webhook at https://${process.env.RENDER_EXTERNAL_HOSTNAME}`);
