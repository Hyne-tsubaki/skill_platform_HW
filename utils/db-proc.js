const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');

async function callProcedure(procName, params = []) {
  const placeholders = params.map(() => '?').join(',');
  const sql = `CALL ${procName}(${placeholders})`;
  try {
    const [results] = await sequelize.query(sql, {
      replacements: params,
      type: QueryTypes.SELECT
    });
    return results;
  } catch (err) {
    console.error(`❌ 调用存储过程 ${procName} 失败:`, err.message);
    throw err;
  }
}

module.exports = { callProcedure };
