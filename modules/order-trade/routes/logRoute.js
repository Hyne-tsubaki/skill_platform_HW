/**
 * 日志路由（完整可运行版）
 * 路径：D:\Desktop\skill-platform-total\modules\order-trade\routes\logRoute.js
 * 注意：你的原文件名是 logRoutes.js，需统一为 logRoute.js 或修改引用
 */
const express = require('express');
const router = express.Router();
const logController = require('../controllers/loggerControl');

// ✅ 若需要认证，添加以下代码（路径向上3级）
// const { authenticateToken } = require('../../../middleware/auth');
// router.use(authenticateToken); // 所有日志接口需认证

// 所有日志接口（方法名与控制器完全匹配）
router.get('/', logController.getLogs);                    // 获取日志列表
router.get('/stats', logController.getLogStats);           // 获取日志统计
router.get('/download', logController.downloadLogs);       // 下载日志文件
router.delete('/cleanup', logController.cleanupLogs);      // 清理旧日志

module.exports = router;