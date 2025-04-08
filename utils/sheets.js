const { GoogleSpreadsheet } = require('google-spreadsheet');
const credentials = require('../credentials.json');

const SPREADSHEET_ID = '1Vh5OPCiiPp2bWPJZyWtP9F6JU_Ebiu_J8_9CaeSrv4E';

async function addToSheet(username, bankAccount) {
    try {
        const doc = new GoogleSpreadsheet(SPREADSHEET_ID);

        // Используем сервисный аккаунт
        await doc.useServiceAccountAuth(credentials);

        await doc.loadInfo();
        const sheet = doc.sheetsByIndex[0];

        await sheet.addRow({
            'Имя пользователя': username,
            'Банковский счет': bankAccount
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
