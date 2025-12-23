//信誉部分路由
const express = require('express');
const router = express.Router();
const creditController = require('../controllers/creditControl');

// ✅ 简化的验证中间件（直接写在路由文件中）
const validateUserId = (req, res, next) => {
  const userId = req.params.userId;
  if (!userId || isNaN(userId)) {
    return res.status(400).json({ 
      success: false,
      message: '用户ID无效' 
    });
  }
  next();
};

const validatePagination = (req, res, next) => {
  const { limit = 10, page = 1, min_orders = 0, min_score = 0 } = req.query;
  
  // 简单的参数验证
  if (limit && isNaN(limit)) {
    return res.status(400).json({ 
      success: false,
      message: 'limit参数必须为数字' 
    });
  }
  if (page && isNaN(page)) {
    return res.status(400).json({ 
      success: false,
      message: 'page参数必须为数字' 
    });
  }
  
  next();
};

// ✅ 修复5：添加认证中间件（可选，若需要）
// const { authenticateToken } = require('../../../middleware/auth');
// router.use(authenticateToken); // 如需认证则取消注释

// 公开的信誉路由（无需认证）
router.get('/user/:userId', validateUserId, creditController.getUserCredit);          // 获取用户信誉信息
router.get('/ranking', validatePagination, creditController.getCreditRanking);        // 获取信誉排名
router.get('/stats', creditController.getCreditStats);                                // 获取信誉统计数据

// 内部更新路由（通常由系统在订单完成时调用）
router.put('/user/:userId', validateUserId, creditController.updateUserCredit);       // 更新用户信誉评分

module.exports = router;