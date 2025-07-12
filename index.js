require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs');
const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const speech = require('@google-cloud/speech');
const https = require('https');
const cron = require('node-cron');

const bot = new Telegraf(process.env.BOT_TOKEN);

const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const SHEET_ID = '1-wCeJih8Np60e17YdynvkSWz8zGSnsU4xDZPvm4uHMQ';

const speechClient = new speech.SpeechClient({
  keyFilename: process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH
});

async function getSystemPrompt() {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });
  const about = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'AboutCompany!A2:B20' });
  const strategy = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'StrategyPlan!A2:E20' });

  const aboutText = about.data.values.map(([key, value]) => `${key}: ${value}`).join('\n');
  const strategyText = strategy.data.values.map(([week, focus, goal]) => `Week ${week} [${focus}]: ${goal}`).join('\n');

  return `Ты — AI CEO компании Unique Landscaping 4U. Вот информация о компании:\n${aboutText}\n\nТекущая стратегия по неделям:\n${strategyText}`;
}

async function askOpenRouter(message) {
  try {
    const systemPrompt = await getSystemPrompt();
    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: "deepseek/deepseek-r1-0528-qwen3-8b:free",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ]
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data?.choices?.length > 0) {
      return response.data.choices[0].message.content;
    } else {
      return "🤖 ИИ не дал ответа.";
    }
  } catch (error) {
    console.error("OpenRouter error:", error.message);
    return "⚠️ Ошибка запроса к OpenRouter.";
  }
}

function isPotentialTask(text) {
  const keywords = ['надо', 'нужно', 'сделай', 'запланируй', 'создать', 'отправить', 'добавь', 'сформируй', 'встретиться', 'обсудить', 'напомни'];
  return keywords.some(word => text.toLowerCase().includes(word));
}

bot.start((ctx) => ctx.reply('🤖 AI CEO активен и готов помочь!'));

bot.command('about', async (ctx) => {
  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });
    const about = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'AboutCompany!A2:B20' });
    const text = about.data.values.map(([k, v]) => `📌 *${k}*: ${v}`).join('\n');
    await ctx.replyWithMarkdown(text);
  } catch (err) {
    console.error("Ошибка чтения AboutCompany:", err.message);
    await ctx.reply("⚠️ Не удалось загрузить описание компании.");
  }
});

bot.command('strategy', async (ctx) => {
  try {
    const today = new Date();
    const weekNumber = Math.ceil((((today - new Date(today.getFullYear(), 0, 1)) / 86400000) + 1) / 7);
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });
    const strategy = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'StrategyPlan!A2:E100' });
    const rows = strategy.data.values;
    const currentWeek = rows.find(row => row[0]?.toLowerCase().includes(`w${weekNumber}`.toLowerCase()));

    if (currentWeek) {
      const [week, focus, goal, tasks, done] = currentWeek;
      await ctx.reply(`📆 *${week}*\n🎯 Цель: ${goal}\n🔧 Задачи: ${tasks}\n✅ Выполнено: ${done || 'не указано'}`, { parse_mode: 'Markdown' });
    } else {
      await ctx.reply(`📅 Нет цели для текущей недели (W${weekNumber}).`);
    }
  } catch (err) {
    console.error("Ошибка получения StrategyPlan:", err.message);
    await ctx.reply("⚠️ Не удалось загрузить стратегию недели.");
  }
});

bot.on('text', async (ctx) => {
  const userMessage = ctx.message.text;
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
        ctx.reply(`🎙️ Распознано: ${transcription}`);

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
              ctx.from.username || 'CEO',
              'new'
            ]]
          }
        });
        ctx.reply('✅ Задача добавлена из голосового.');
      } catch (err) {
        console.error('Speech error:', err.message);
        ctx.reply('⚠️ Ошибка при обработке голоса.');
      }
    });
  });
});

cron.schedule('0 8 * * *', async () => {
  const prompt = `Проанализируй рынок ландшафтных услуг в районе GTA (Торонто, Канада). Используй ключевые слова: lawn care, landscaping, interlock, fences, spring cleanup. Выведи на русском языке краткий отчёт, с рекомендациями как улучшить бизнес.`;
  const report = await askOpenRouter(prompt);
  bot.telegram.sendMessage(process.env.TELEGRAM_OWNER_ID, `📊 Ежедневный отчёт:\n\n${report}`);
});

bot.launch({
  webhook: {
    domain: process.env.RENDER_EXTERNAL_HOSTNAME,
    port: process.env.PORT || 10000
  }
});

console.log("✅ Полный AI CEO бот запущен и включает стратегию, голос, задачи и OpenRouter контекст");
