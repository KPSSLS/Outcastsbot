const axios = require('axios');

const BASEROW_API_URL = 'https://api.baserow.io/api';
const BASEROW_TOKEN = 'E6nu6t0hu61gibi3rzOC6bx5H2JmraDF'; // Замените на ваш токен
const TABLE_ID = '498904'; // Замените на ID вашей таблицы

async function addFinanceRecord(accountNumber, nickname) {
    try {
        const response = await axios.post(
            `${BASEROW_API_URL}/database/rows/table/${TABLE_ID}/?user_field_names=true`,
            {
                "Номер счета": accountNumber,
                "Никнейм": nickname,
                "Дата": new Date().toISOString()
            },
            {
                headers: {
                    'Authorization': `Token ${BASEROW_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        console.log('Successfully added record to Baserow');
        return response.data;
    } catch (error) {
        console.error('Error adding record to Baserow:', error.response?.data || error.message);
        throw error;
    }
}

module.exports = {
    addFinanceRecord
};
