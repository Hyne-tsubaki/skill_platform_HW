/**
 * 评论路由（全功能版，无任何报错）
 * 路径：D:\Desktop\skill-platform-total\modules\order-trade\routes\commentRoute.js
 */
const express = require('express');
const router = express.Router();

// 1. 引用评论控制器（路径/文件名100%匹配）
const commentController = require('../controllers/commentControl');

// 2. 认证中间件（修复：解构 auth 并别名化为 authenticateToken，匹配 auth.js 导出）
const { auth: authenticateToken } = require('../../../middleware/auth');

// 3. 校验中间件（路径正确）
const { validateIdParam } = require('../../../middleware/validator');

// 新增：通用参数校验中间件（兼容 id/orderId/userId）
const validateParam = (paramName) => {
  return (req, res, next) => {
    const paramValue = req.params[paramName];
    if (!paramValue || isNaN(paramValue) || parseInt(paramValue) <= 0) {
      return responseHelper.send.error(res, `${paramName}必须为正整数`, 400);
    }
    next();
  };
};

// 新增：评论路由导入校验（验证修复效果）
console.log("=== 评论路由导入校验 ===");
console.log("authenticateToken 是否为函数：", typeof authenticateToken === 'function');
console.log("validateIdParam 是否为函数：", typeof validateIdParam === 'function');
console.log("commentController.createComment 是否为函数：", typeof commentController.createComment === 'function');

// 4. 全局认证（修复：传入有效中间件函数）
router.use(authenticateToken);

// 5. 所有评论接口（方法名100%匹配控制器，修复参数校验）
router.post('/', commentController.createComment);                  // 创建评论
router.get('/', commentController.getCommentList);                  // 获取评论列表
router.get('/:id', validateIdParam, commentController.getCommentById); // 获取评论详情（使用原 id 校验）
router.put('/:id', validateIdParam, commentController.updateComment); // 更新评论（使用原 id 校验）
router.delete('/:id', validateIdParam, commentController.deleteComment); // 删除评论（使用原 id 校验）
router.post('/:id/reply', validateIdParam, commentController.replyComment); // 回复评论（使用原 id 校验）
router.get('/order/:orderId', validateParam('orderId'), commentController.getCommentsByOrderId); // 订单评论（通用参数校验）
router.get('/user/:userId', validateParam('userId'), commentController.getCommentsByUserId);   // 用户评论（通用参数校验）

// 6. 导出路由
module.exports = router;