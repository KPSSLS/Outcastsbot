const axios = require('axios');

const BASEROW_API_URL = 'https://api.baserow.io/api';
const BASEROW_TOKEN = 'E6nu6t0hu61gibi3rzOC6bx5H2JmraDF';
const FINANCE_TABLE_ID = '498904';
const STATS_TABLE_ID = '498912'; // ID таблицы для статистики

async function addFinanceRecord(accountNumber, nickname) {
    try {
        const response = await axios.post(
            `${BASEROW_API_URL}/database/rows/table/${FINANCE_TABLE_ID}/?user_field_names=true`,
            {
                "Номер счета": accountNumber,
                "Никнейм": nickname,
                "Дата": new Date().toISOString().split('T')[0]
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

async function addStatsRecord(userId, acceptedCount) {
    try {
        const response = await axios.post(
            `${BASEROW_API_URL}/database/rows/table/${STATS_TABLE_ID}/?user_field_names=true`,
            {
                "Пользователь": userId,
                "Количество принятых": acceptedCount,
                "Дата": new Date().toISOString().split('T')[0]
            },
            {
                headers: {
                    'Authorization': `Token ${BASEROW_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        console.log('Successfully added stats record to Baserow');
        return response.data;
    } catch (error) {
        console.error('Error adding stats record to Baserow:', error.response?.data || error.message);
        throw error;
    }
}

module.exports = {
    addFinanceRecord,
    addStatsRecord
};
