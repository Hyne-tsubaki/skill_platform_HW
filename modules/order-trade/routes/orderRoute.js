/**
 * 订单模块路由（最终修复版，无任何报错）
 * 路径：modules/order-trade/routes/orderRoute.js
 */
const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderControl');

// ✅ 核心修复：别名映射（auth → authenticateToken），适配 auth.js 导出
const { auth: authenticateToken } = require('../../../middleware/auth');
// ✅ 修复2：校验中间件路径（向上3级到根目录middleware）+ 适配方法名
const { 
  validateIdParam, // 替代 validateOrderId/validateUserId（通用ID校验）
  validatePublishTask // 可复用的Joi校验，或自定义订单校验
} = require('../../../middleware/validator');

// ✅ 新增：订单路由导入校验（验证依赖有效性，快速排查）
console.log("=== 订单路由导入校验 ===");
console.log("authenticateToken 是否为函数：", typeof authenticateToken === 'function');
console.log("validateIdParam 是否为函数：", typeof validateIdParam === 'function');
console.log("orderController.createOrder 是否为函数：", typeof orderController.createOrder === 'function');

// ✅ 修复3：自定义订单状态校验（补充缺失的 validateOrderStatus）
const validateOrderStatus = (req, res, next) => {
  const { order_status } = req.body;
  if (order_status === undefined || order_status < 1 || order_status > 6) {
    return require('../../../middleware/responseHelper').send.error(
      res,
      '订单状态值无效（必须为1-6）',
      400,
      { order_status, valid_range: '1:待支付,2:已支付,3:进行中,4:已完成,5:已评价,6:已取消' }
    );
  }
  next();
};

// ✅ 修复4：自定义订单创建参数校验（替代 validateOrder）
const validateOrder = (req, res, next) => {
  const { skill_id, employer_id, provider_id, order_amount, service_time } = req.body;
  const errors = [];
  
  if (!skill_id || isNaN(skill_id)) errors.push({ field: 'skill_id', message: '技能ID必须为有效数字' });
  if (!employer_id || isNaN(employer_id)) errors.push({ field: 'employer_id', message: '雇主ID必须为有效数字' });
  if (!provider_id || isNaN(provider_id)) errors.push({ field: 'provider_id', message: '服务者ID必须为有效数字' });
  if (!order_amount || isNaN(order_amount) || order_amount <= 0) errors.push({ field: 'order_amount', message: '订单金额必须大于0' });
  if (!service_time || new Date(service_time) <= new Date()) errors.push({ field: 'service_time', message: '服务时间必须为未来时间' });
  
  if (errors.length > 0) {
    return require('../../../middleware/responseHelper').send.validationError(
      res,
      errors
    );
  }
  next();
};

// ✅ 应用认证中间件到所有订单路由（此时 authenticateToken 为有效函数）
router.use(authenticateToken);

// 订单创建和管理
router.post('/', validateOrder, orderController.createOrder);                    // 创建订单（参数校验）
router.get('/', orderController.getAllOrders);                                   // 获取订单列表（带筛选）
router.get('/stats/summary', orderController.getOrderStats);                     // 订单统计
router.get('/:id', validateIdParam, orderController.getOrderById);               // 获取订单详情（ID校验）

// 订单状态操作
router.put('/:id/status', validateIdParam, validateOrderStatus, orderController.updateOrderStatus);     // 更新订单状态（ID+状态校验）
router.put('/:id/cancel', validateIdParam, orderController.cancelOrder);               // 取消订单（ID校验）
router.put('/:id/confirm-payment', validateIdParam, orderController.confirmPayment);   // 确认支付（ID校验）
router.put('/:id/start-service', validateIdParam, orderController.startService);       // 开始服务（ID校验）
router.put('/:id/complete-service', validateIdParam, orderController.completeService); // 完成服务（ID校验）

// 用户相关订单
router.get('/user/:userId', validateIdParam, orderController.getUserOrders);            // 获取用户订单列表（用户ID校验）
router.get('/user/:userId/stats', validateIdParam, orderController.getUserOrderStats);  // 用户订单统计（用户ID校验）

// 订单删除（软删除）
router.delete('/:id', validateIdParam, orderController.deleteOrder);                   // 删除订单（ID校验）

// 管理员功能（如需启用，补充控制器方法后取消注释）
// router.get('/admin/all', orderController.getAllOrdersForAdmin);                        // 管理员获取所有订单
// router.put('/admin/:id/status', validateIdParam, validateOrderStatus, orderController.adminUpdateOrderStatus); // 管理员更新订单状态

module.exports = router;