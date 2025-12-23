/**
 * 任务模块路由（最终修复版）
 * 路径：modules/skill-task/routes/taskRoutes.js
 */
const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');

// ✅ 修复核心：解构 auth 并别名化为 authenticateToken（匹配 auth.js 导出）
const { auth: authenticateToken } = require('../../../middleware/auth');
// ✅ 修复2：引入通用ID参数校验（可选，提升接口健壮性）
const { validateIdParam } = require('../../../middleware/validator');

// 新增：任务路由导入校验（验证修复效果）
console.log("=== 任务路由导入校验 ===");
console.log("authenticateToken 是否为函数：", typeof authenticateToken === 'function');
console.log("validateIdParam 是否为函数：", typeof validateIdParam === 'function');
console.log("publishTask 是否为函数：", typeof taskController.publishTask === 'function');

// 发布任务（需认证）- 路由简化为 /publish 更语义化
router.post('/publish', authenticateToken, taskController.publishTask);

// 任务接单（需认证 + ID参数校验）
router.put('/:id/accept', authenticateToken, validateIdParam, taskController.acceptTask);

// 确认任务完成（需认证 + ID参数校验）
router.put('/:id/complete', authenticateToken, validateIdParam, taskController.confirmTaskComplete);

// 获取任务列表（公开）- 路由简化为 /list 避免与根路径冲突
router.get('/list', taskController.getTaskList);

// 【可选】获取单个任务详情（公开 + ID校验）
router.get('/:id', validateIdParam, taskController.getTaskDetail);

module.exports = router;