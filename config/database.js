/**
 * 数据库配置（Sequelize + mysql2 query）
 */

const { Sequelize } = require('sequelize');
const mysql = require('mysql2/promise');

// ================================
// 1️⃣ Sequelize ORM 实例（Category / Skill / Tag 等模型用）
// ================================
const sequelize = new Sequelize(
  'skill_task_db', // 数据库名
  'root',          // 用户名
  'yjLe0215',      // 密码
  {
    host: 'localhost',
    port: 3306,
    dialect: 'mysql',
    logging: false, // 可改为 console.log 查看 SQL
    define: {
      timestamps: true,   // 自动管理 created_at / updated_at
      underscored: true   // 自动生成下划线字段名
    },
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
);

// ================================
// 2️⃣ 原生 mysql2 连接池（用于 query / callProcedure）
// ================================
const config = {
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'yjLe0215',
  database: 'skill_task_db'
};

let pool;
try {
  pool = mysql.createPool(config);
  console.log('✅ mysql2 连接池创建成功');
} catch (err) {
  console.error('❌ mysql2 连接池创建失败：', err.message);
  pool = null;
}

// 测试原生连接
async function testConnection() {
  if (!pool) throw new Error('连接池未初始化');
  try {
    await pool.execute('SELECT 1');
    console.log('✅ mysql2 数据库连接测试成功');
    return true;
  } catch (err) {
    console.error('❌ mysql2 数据库连接失败', err.message);
    throw err;
  }
}

// 原生查询
async function query(sql, params) {
  if (!pool) return [];
  try {
    const result = await pool.execute(sql, params || []);
    return result && result[0] ? result[0] : [];
  } catch (err) {
    console.error('❌ 查询失败：', err);
    return [];
  }
}

// 调用存储过程
async function callProcedure(procName, params) {
  if (!pool) return [];
  const placeholders = params?.map(() => '?').join(',') || '';
  const sql = `CALL ${procName}(${placeholders})`;
  try {
    const result = await pool.execute(sql, params || []);
    return result && result[0] ? result[0] : [];
  } catch (err) {
    console.error('❌ 存储过程调用失败：', err);
    return [];
  }
}

// ================================
// 3️⃣ 导出
// ================================
module.exports = {
  sequelize,        // ✅ Sequelize 实例，用于 Model.init()
  testConnection,   // ✅ mysql2 测试
  query,            // ✅ 原生查询
  callProcedure,    // ✅ 调用存储过程
  pool              // ✅ mysql2 连接池（可选）
};
