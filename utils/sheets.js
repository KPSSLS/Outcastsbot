const fs = require('fs');
const { google } = require('googleapis');
const paths = require('../config/paths');

// Настройка Google Sheets
const SPREADSHEET_ID = '1Vh5OPCiiPp2bWPJZyWtP9F6JU_Ebiu_J8_9CaeSrv4E';

async function addToSheet(username, bankAccount) {
    try {
        const credentials = require(paths.credentialsPath);
        const { client_email, private_key } = credentials;

        const auth = new google.auth.JWT(
            client_email,
            null,
            private_key,
            ['https://www.googleapis.com/auth/spreadsheets']
        );

        const sheets = google.sheets({ version: 'v4', auth });

        const values = [[username, bankAccount, new Date().toLocaleString()]];

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Лист1!A:C',
            valueInputOption: 'USER_ENTERED',
            resource: { values }
        });

        console.log('Successfully added data to sheet');
        return true;
    } catch (error) {
        console.error('Error adding to sheet:', error);
        return false;
    }
}

module.exports = {
    addToSheet
};
