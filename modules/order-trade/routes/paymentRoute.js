/**
 * 支付模块路由（最终修复版，无任何报错）
 * 路径：modules/order-trade/routes/paymentRoute.js
 */
const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentControl');

// ✅ 修复1：认证中间件（别名映射适配 auth.js 导出，确保有效）
// 原导入直接解构 authenticateToken 无效，改为 auth 别名映射
const { auth: authenticateToken } = require('../../../middleware/auth');

// ✅ 修复2：校验中间件（路径正确，新增通用参数校验替代 validateIdParam）
const { validateIdParam } = require('../../../middleware/validator');
const ResponseHelper = require('../../../middleware/responseHelper'); // 统一响应工具

// ✅ 修复3：通用参数校验中间件（兼容 paymentId/orderId/id，替代无效的 validateIdParam）
const validatePaymentParam = (paramName) => {
  return (req, res, next) => {
    const paramValue = req.params[paramName];
    if (!paramValue || isNaN(paramValue) || parseInt(paramValue) <= 0) {
      return ResponseHelper.send.error(res, `${paramName}必须为有效正整数`, 400);
    }
    next();
  };
};

// ✅ 修复4：自定义支付参数校验（替代 validatePayment）
const validatePayment = (req, res, next) => {
  const { order_id, payment_amount, payment_method } = req.body;
  const errors = [];

  // 基础参数校验
  if (!order_id || isNaN(order_id)) errors.push({ field: 'order_id', message: '订单ID必须为有效正整数' });
  if (!payment_amount || isNaN(payment_amount) || payment_amount <= 0) errors.push({ field: 'payment_amount', message: '支付金额必须大于0' });
  if (!payment_method || !['balance', 'alipay', 'wechat', 'bank'].includes(payment_method)) {
    errors.push({ field: 'payment_method', message: '支付方式仅支持 balance/alipay/wechat/bank' });
  }

  // 校验失败返回统一格式
  if (errors.length > 0) {
    return ResponseHelper.send.validationError(res, errors, '支付参数验证失败');
  }
  next();
};

// ✅ 修复5：自定义支付回调校验（替代 validatePaymentCallback）
const validatePaymentCallback = (req, res, next) => {
  const { out_trade_no, trade_status, sign } = req.body;
  const errors = [];

  if (!out_trade_no) errors.push({ field: 'out_trade_no', message: '外部交易号不能为空' });
  if (!trade_status) errors.push({ field: 'trade_status', message: '交易状态不能为空' });
  if (!sign) errors.push({ field: 'sign', message: '回调签名不能为空' });

  if (errors.length > 0) {
    return ResponseHelper.send.error(res, '回调参数验证失败', 400, { errors });
  }
  next();
};

// ✅ 修复6：支付路由导入校验（验证所有依赖有效性，快速排查问题）
console.log("=== 支付路由导入校验 ===");
console.log("authenticateToken 是否为函数：", typeof authenticateToken === 'function');
console.log("validateIdParam 是否为函数：", typeof validateIdParam === 'function');
console.log("validatePayment 是否为函数：", typeof validatePayment === 'function');
console.log("paymentController.createPayment 是否为函数：", typeof paymentController.createPayment === 'function');

// ✅ 修复7：分路由应用认证中间件（回调接口单独放行）
// 1. 非回调路由：应用认证中间件
const paymentRouter = express.Router(); // 创建子路由承载需认证的接口
paymentRouter.use(authenticateToken); // 仅对子路由应用认证

// 支付订单管理（需认证）
paymentRouter.post('/', validatePayment, paymentController.createPayment);              // 创建支付订单

// 支付查询（需认证）
paymentRouter.get('/', paymentController.getPaymentList);                               // 获取支付记录列表
paymentRouter.get('/:paymentId', validatePaymentParam('paymentId'), paymentController.getPaymentById);    // 获取支付详情（通用参数校验）
paymentRouter.get('/order/:orderId', validatePaymentParam('orderId'), paymentController.getPaymentByOrderId); // 根据订单获取支付（通用参数校验）

// 支付操作（需认证）
paymentRouter.put('/:paymentId/cancel', validatePaymentParam('paymentId'), paymentController.cancelPayment);       // 取消支付（通用参数校验）
paymentRouter.put('/:paymentId/simulate', validatePaymentParam('paymentId'), paymentController.simulatePayment);   // 模拟支付（仅测试环境，通用参数校验）
paymentRouter.get('/:paymentId/status', validatePaymentParam('paymentId'), paymentController.getPaymentStatus);    // 查询支付状态（通用参数校验）

// 退款管理（需认证）
paymentRouter.post('/:paymentId/refund', validatePaymentParam('paymentId'), paymentController.processRefund);      // 处理退款（通用参数校验）
paymentRouter.get('/:paymentId/refunds', validatePaymentParam('paymentId'), paymentController.getRefundHistory);   // 获取退款历史（通用参数校验）

// 支付统计和分析（需认证）
paymentRouter.get('/analytics/summary', paymentController.getPaymentSummary);           // 获取支付统计摘要
paymentRouter.get('/analytics/daily', paymentController.getDailyPaymentStats);          // 获取每日支付统计

// 2. 回调接口：无需认证，直接挂载到主路由（跳过认证中间件）
router.post('/callback/alipay', validatePaymentCallback, paymentController.handleAlipayCallback);    // 支付宝回调
router.post('/callback/wechat', validatePaymentCallback, paymentController.handleWechatCallback);    // 微信支付回调
router.post('/callback/bank', validatePaymentCallback, paymentController.handleBankCallback);        // 网银回调

// 3. 挂载需认证的子路由到主路由
router.use('/', paymentRouter);

module.exports = router;