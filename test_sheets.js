require('dotenv').config();
const { google } = require('googleapis');

const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

async function testGoogleSheets() {
  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    const res = await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'Test!A1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[new Date().toISOString(), "🧪 Test entry from test_sheets.js"]],
      },
    });

    console.log("✅ Google Sheets test succeeded:", res.status);
  } catch (err) {
    console.error("❌ Google Sheets error:", err.message);
  }
}

testGoogleSheets();
