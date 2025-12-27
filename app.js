/**
 * 最终版 app.js（绑定IPv4 + 端口3001 + Sequelize兼容）
 * 路径：app.js
 */
require('dotenv').config();
const express = require('express');
const app = express();
const PORT = 3001;
const HOST = '127.0.0.1'; // ✅ 强制绑定IPv4，避免IPv6(::)占用

// 导入数据库工具（极简版 + Sequelize 实例）
const { testConnection, query, sequelize } = require('./config/database');

// 全局中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ================================
// ✅ 导入路由模块
// ================================
const authRoutes = require('./modules/auth/routes/authRoutes');
const categoryRoutes = require('./modules/skill-task/routes/categoryRoutes');
const skills = require('./modules/skill-task/routes/skillRoutes');
const tagRoutes = require('./modules/skill-task/routes/tagRoutes');
const taskRoutes = require('./modules/skill-task/routes/taskRoutes');
const comments = require('./modules/order-trade/routes/commentRoute');
const paymentRoutes = require('./modules/order-trade/routes/paymentRoute');
const orders = require('./modules/order-trade/routes/orderRoute');
const credit = require('./modules/order-trade/routes/creditRoute');
const log = require('./modules/order-trade/routes/logRoute');

// ================================
// ✅ 挂载路由
// ================================
app.use('/api/auth', authRoutes);
app.use('/api/skills', skills);
app.use('/api/categories', categoryRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/comments', comments);
app.use('/api/payments', paymentRoutes);
app.use('/api/orders', orders);
app.use('/api/credit', credit);
app.use('/api/logs', log);

// ================================
// 健康检查接口
// ================================
app.get('/health', (req, res) => {
  res.json({
    success: true,
    code: 200,
    message: '服务运行中',
    data: { port: PORT, host: HOST },
    timestamp: new Date().toISOString()
  });
});

// ================================
// 技能列表接口（原生 mysql2 查询示例）
// ================================
app.get('/api/skills', async (req, res) => {
  try {
    const skillsList = await query('SELECT * FROM skill LIMIT 10');
    res.json({
      success: true,
      code: 200,
      data: skillsList,
      message: '技能列表查询成功'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      code: 500,
      message: '技能列表查询失败'
    });
  }
});

// ================================
// ✅ 启动服务并绑定 IPv4
// ================================
const server = app.listen(PORT, HOST, async () => {
  console.log('===================================================');
  console.log(`🚀 服务已启动：http://${HOST}:${PORT}`);
  console.log('===================================================');

  // 异步测试 Sequelize 连接
  try {
    await sequelize.authenticate();
    console.log('✅ Sequelize 数据库连接成功');
  } catch (err) {
    console.warn('⚠️ Sequelize 数据库暂不可用：', err.message);
  }

  // 异步测试原生 mysql2 连接（不阻塞服务）
  try {
    await testConnection();
    console.log('✅ mysql2 数据库连接成功');
  } catch (err) {
    console.warn('⚠️ mysql2 数据库暂不可用：', err.message);
  }
});

// ================================
// 捕获端口占用错误
// ================================
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ 端口 ${PORT} 被占用，请执行：`);
    console.error(`   1. 管理员 CMD 执行：taskkill /F /IM node.exe`);
    console.error(`   2. 或更换端口：修改 app.js 中的 PORT`);
  } else {
    console.error('❌ 服务启动失败：', err.message);
  }
  process.exit(1);
});
