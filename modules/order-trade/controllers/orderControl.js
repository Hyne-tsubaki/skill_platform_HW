/**
 * 订单模块控制器（最终修复版）
 * 路径：modules/order-trade/controllers/orderControl.js
 */
// ✅ 修复1：响应工具路径（向上3级到根目录middleware）
const ResponseHelper = require('../../../middleware/responseHelper');

// 在控制器顶部添加常量定义，关于订单状态设置
const ORDER_STATUS = {
  PENDING: 1,      // 待支付
  PAID: 2,         // 已支付
  IN_PROGRESS: 3,  // 进行中
  COMPLETED: 4,    // 已完成
  REVIEWED: 5,     // 已评价
  CANCELLED: 6     // 已取消
};

// ✅ 修复2：数据库连接池路径（向上3级到根目录config）
function getPool() {
  // 修正：从根目录 config/database.js 获取 pool
  const { pool } = require('../../../config/database');
  if (!pool) {
    throw new Error('数据库连接池未初始化，请先调用 initializeDatabase()');
  }
  return pool;
}

const orderController = {
  // 创建订单
  createOrder: async (req, res) => {
    try {
      const pool = getPool(); // 在函数内部获取连接池
      
      // 从请求体中获取数据
      const {
        skill_id,
        employer_id,
        provider_id,
        order_amount,
        service_time,
        order_remark
      } = req.body;

      // ✅ 参数验证 - 统一用 ResponseHelper.send.error 响应
      if (!skill_id || !employer_id || !provider_id || !order_amount || !service_time) {
        return ResponseHelper.send.error(
          res,
          '缺少必填参数',
          ResponseHelper.errorCodes.BAD_REQUEST,
          { missing: ['skill_id', 'employer_id', 'provider_id', 'order_amount', 'service_time'].filter(key => !req.body[key]) }
        );
      }

      // ✅ 金额验证 - 业务错误响应
      if (order_amount <= 0) {
        // 修复：ResponseHelper 无 businessError 方法，统一用 error
        return ResponseHelper.send.error(
          res,
          '订单金额必须大于0',
          ResponseHelper.errorCodes.BAD_REQUEST,
          { order_amount: order_amount }
        );
      }

      // ✅ 服务时间验证 - 业务错误响应
      if (new Date(service_time) <= new Date()) {
        return ResponseHelper.send.error(
          res,
          '服务时间必须是未来时间',
          ResponseHelper.errorCodes.BAD_REQUEST,
          { service_time: service_time, current_time: new Date().toISOString() }
        );
      }

      // 调用存储过程创建订单
      const sql = `CALL sp_create_order_with_payment(?, ?, ?, ?, ?, ?, ?, @order_no, @payment_no)`;
      
      // 执行存储过程
      await pool.execute(sql, [
        skill_id,
        employer_id,
        provider_id,
        order_amount,
        service_time,
        order_remark || '',  // 修复：避免undefined
        'balance'  // 默认支付方式
      ]);

      // 获取存储过程的输出参数
      const [output] = await pool.execute('SELECT @order_no as order_no, @payment_no as payment_no');
      
      // ✅ 检查输出参数是否有效
      if (!output[0]?.order_no || !output[0]?.payment_no) {
        throw new Error('订单创建失败：未获取到订单号或支付号');
      }
      
      // ✅ 成功响应 - 资源创建用 created（201）
      ResponseHelper.send.created(
        res,
        {
          order_no: output[0].order_no,
          payment_no: output[0].payment_no
        },
        '订单创建成功'
      );
      
    } catch (error) {
      console.error('创建订单错误:', error);
      
      // ✅ 精细化错误处理 - 统一响应格式
      let errorCode = ResponseHelper.errorCodes.INTERNAL_SERVER_ERROR;
      let errorMessage = error.message || '服务器内部错误';
      
      // 处理特定的数据库错误
      if (error.code === 'ER_DUP_ENTRY') {
        errorCode = ResponseHelper.errorCodes.CONFLICT;
        errorMessage = '订单已存在';
      } else if (error.code === 'ER_NO_REFERENCED_ROW') {
        errorCode = ResponseHelper.errorCodes.BAD_REQUEST;
        errorMessage = '关联的技能或用户不存在';
      }
      
      ResponseHelper.send.error(
        res,
        errorMessage,
        errorCode,
        { error_code: error.code, stack: process.env.NODE_ENV === 'development' ? error.stack : undefined }
      );
    }
  },

  // 根据ID获取订单详情
  getOrderById: async (req, res) => {
    try {
      const pool = getPool(); // 在函数内部获取连接池
      const orderId = req.params.id;
      
      // ✅ ID参数验证 - 统一响应
      if (!orderId || isNaN(orderId)) {
        return ResponseHelper.send.error(
          res,
          '订单ID无效',
          ResponseHelper.errorCodes.BAD_REQUEST,
          { order_id: orderId }
        );
      }
      
      // 查询订单信息（修复：order是MySQL关键字，需反引号）
      const [orders] = await pool.execute(
        'SELECT * FROM `order` WHERE order_id = ? AND is_deleted = 0', // 补充软删除过滤
        [orderId]
      );
      
      // ✅ 订单不存在 - 用 notFound 响应（404）
      if (orders.length === 0) {
        return ResponseHelper.send.notFound(
          res,
          '订单不存在'
        );
      }
      
      // 查询支付信息
      const [payments] = await pool.execute(
        'SELECT * FROM payment WHERE order_id = ?',
        [orderId]
      );
      
      // ✅ 查询技能信息（建议添加）
      const [skills] = await pool.execute(
        `SELECT s.*, u.username as provider_name 
         FROM skill s 
         LEFT JOIN user u ON s.user_id = u.user_id 
         WHERE s.skill_id = ?`,
        [orders[0].skill_id]
      );
      
      const order = orders[0];
      order.payment = payments[0] || null;
      order.skill = skills[0] || null; // 添加技能信息
      
      // ✅ 成功响应
      ResponseHelper.send.success(
        res,
        order,
        '获取订单成功'
      );
      
    } catch (error) {
      console.error('获取订单错误:', error);
      ResponseHelper.send.serverError(
        res,
        error.message || '获取订单详情失败'
      );
    }
  },

  // 订单统计摘要
  getOrderStats: async (req, res) => {
    try {
      const pool = getPool();
      
      // 获取不同状态的订单数量统计
      const [statusStats] = await pool.execute(`
        SELECT 
          order_status,
          COUNT(*) as count,
          COALESCE(SUM(order_amount), 0) as total_amount  // 修复：避免NULL
        FROM \`order\`
        WHERE is_deleted = 0
        GROUP BY order_status
        ORDER BY order_status
      `);
      
      // 获取今日订单统计
      const [todayStats] = await pool.execute(`
        SELECT 
          COUNT(*) as today_orders,
          COALESCE(SUM(order_amount), 0) as today_amount
        FROM \`order\`
        WHERE DATE(created_time) = CURDATE() AND is_deleted = 0
      `);
      
      // 获取本周订单统计
      const [weekStats] = await pool.execute(`
        SELECT 
          COUNT(*) as week_orders,
          COALESCE(SUM(order_amount), 0) as week_amount
        FROM \`order\`
        WHERE YEARWEEK(created_time, 1) = YEARWEEK(CURDATE(), 1) AND is_deleted = 0
      `);
      
      // 获取本月订单统计
      const [monthStats] = await pool.execute(`
        SELECT 
          COUNT(*) as month_orders,
          COALESCE(SUM(order_amount), 0) as month_amount
        FROM \`order\`
        WHERE YEAR(created_time) = YEAR(CURDATE()) 
          AND MONTH(created_time) = MONTH(CURDATE()) 
          AND is_deleted = 0
      `);
      
      // 获取总订单统计
      const [totalStats] = await pool.execute(`
        SELECT 
          COUNT(*) as total_orders,
          COALESCE(SUM(order_amount), 0) as total_amount,
          COALESCE(AVG(order_amount), 0) as avg_order_amount
        FROM \`order\`
        WHERE is_deleted = 0
      `);
      
      // 按状态映射状态名称
      const statusMap = {
        1: '待支付',
        2: '已支付', 
        3: '进行中',
        4: '已完成',
        5: '已评价',
        6: '已取消'
      };
      
      // 格式化状态统计数据
      const formattedStatusStats = statusStats.map(stat => ({
        ...stat,
        status_name: statusMap[stat.order_status] || '未知状态'
      }));
      
      // 汇总数据
      const result = {
        status_stats: formattedStatusStats,
        today: todayStats[0] || { today_orders: 0, today_amount: 0 },
        week: weekStats[0] || { week_orders: 0, week_amount: 0 },
        month: monthStats[0] || { month_orders: 0, month_amount: 0 },
        total: totalStats[0] || { total_orders: 0, total_amount: 0, avg_order_amount: 0 },
        timestamp: new Date().toISOString()
      };
      
      // ✅ 成功响应
      ResponseHelper.send.success(
        res,
        result,
        '获取订单统计成功'
      );
      
    } catch (error) {
      console.error('获取订单统计错误:', error);
      ResponseHelper.send.serverError(
        res,
        error.message || '获取订单统计失败'
      );
    }
  },

  // 更新订单状态
  updateOrderStatus: async (req, res) => {
    try {
      const pool = getPool(); // 在函数内部获取连接池
      const orderId = req.params.id;
      const { order_status } = req.body;
      
      // ✅ 订单ID验证
      if (!orderId || isNaN(orderId)) {
        return ResponseHelper.send.error(
          res,
          '订单ID无效',
          ResponseHelper.errorCodes.BAD_REQUEST,
          { order_id: orderId }
        );
      }
      
      // ✅ 状态参数验证
      if (order_status === undefined) {
        return ResponseHelper.send.error(
          res,
          '订单状态不能为空',
          ResponseHelper.errorCodes.BAD_REQUEST
        );
      }
      
      // 验证状态值
      if (order_status < 1 || order_status > 6) {
        return ResponseHelper.send.error(
          res,
          '订单状态值无效',
          ResponseHelper.errorCodes.BAD_REQUEST,
          { order_status: order_status, valid_range: '1-6' }
        );
      }
      
      // ✅ 检查订单是否存在
      const [currentOrder] = await pool.execute(
        'SELECT order_status FROM `order` WHERE order_id = ? AND is_deleted = 0',
        [orderId]
      );
      
      if (currentOrder.length === 0) {
        return ResponseHelper.send.notFound(
          res,
          '订单不存在'
        );
      }
      
      // ✅ 添加状态流转验证（根据业务逻辑）
      const currentStatus = currentOrder[0].order_status;
      if (!isValidStatusTransition(currentStatus, order_status)) {
        return ResponseHelper.send.error(
          res,
          '订单状态流转无效',
          ResponseHelper.errorCodes.BAD_REQUEST,
          { current_status: currentStatus, target_status: order_status, valid_transitions: getValidTransitions(currentStatus) }
        );
      }
      
      // 更新订单状态
      const [result] = await pool.execute(
        'UPDATE `order` SET order_status = ?, updated_time = NOW() WHERE order_id = ? AND is_deleted = 0',
        [order_status, orderId]
      );
      
      if (result.affectedRows === 0) {
        return ResponseHelper.send.notFound(
          res,
          '订单不存在或已删除'
        );
      }
      
      // ✅ 更新成功响应
      ResponseHelper.send.updated(
        res,
        { order_id: orderId, new_status: order_status },
        '订单状态更新成功'
      );
      
    } catch (error) {
      console.error('更新订单状态错误:', error);
      ResponseHelper.send.serverError(
        res,
        error.message || '更新订单状态失败'
      );
    }
  },

  // 获取用户订单列表
  getUserOrders: async (req, res) => {
    try {
      const pool = getPool(); // 在函数内部获取连接池
      const userId = req.params.userId;
      const { type = 'all', page = 1, limit = 10 } = req.query;
      
      // ✅ 用户ID验证
      if (!userId || isNaN(userId)) {
        return ResponseHelper.send.error(
          res,
          '用户ID无效',
          ResponseHelper.errorCodes.BAD_REQUEST,
          { user_id: userId }
        );
      }
      
      // ✅ 分页参数安全处理
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 10)); // 限制最大50条
      const offset = (pageNum - 1) * limitNum;
      
      let whereClause = '';
      let params = [];
      
      // 根据类型过滤订单
      if (type === 'employer') {
        whereClause = 'WHERE o.employer_id = ? AND o.is_deleted = 0';
        params = [userId];
      } else if (type === 'provider') {
        whereClause = 'WHERE o.provider_id = ? AND o.is_deleted = 0';
        params = [userId];
      } else if (type === 'all') {
        whereClause = 'WHERE (o.employer_id = ? OR o.provider_id = ?) AND o.is_deleted = 0';
        params = [userId, userId];
      } else {
        // ✅ 类型参数验证
        return ResponseHelper.send.error(
          res,
          '类型参数必须是 employer、provider 或 all',
          ResponseHelper.errorCodes.BAD_REQUEST,
          { type: type, valid_types: ['employer', 'provider', 'all'] }
        );
      }
      
      // 查询订单列表
      const [orders] = await pool.execute(
        `SELECT o.*, p.payment_status, p.payment_time,
                s.title as skill_title
         FROM \`order\` o 
         LEFT JOIN payment p ON o.order_id = p.order_id 
         LEFT JOIN skill s ON o.skill_id = s.skill_id
         ${whereClause}
         ORDER BY o.created_time DESC 
         LIMIT ? OFFSET ?`,
        [...params, limitNum, offset]
      );
      
      // 查询总数
      const [countResult] = await pool.execute(
        `SELECT COUNT(*) as total FROM \`order\` o ${whereClause.replace(' AND o.is_deleted = 0', '')}`,
        params
      );
      
      // ✅ 分页响应
      ResponseHelper.send.paginated(
        res,
        orders,
        {
          page: pageNum,
          limit: limitNum,
          total: countResult[0]?.total || 0,
          pages: Math.ceil((countResult[0]?.total || 0) / limitNum)
        },
        '获取订单列表成功'
      );
      
    } catch (error) {
      console.error('获取用户订单错误:', error);
      ResponseHelper.send.serverError(
        res,
        error.message || '获取用户订单失败'
      );
    }
  },

  // 获取所有订单
  getAllOrders: async (req, res) => {
    try {
      const pool = getPool();
      const { 
        status, 
        start_date, 
        end_date, 
        page = 1, 
        limit = 20 
      } = req.query;
      
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
      const offset = (pageNum - 1) * limitNum;
      
      let whereConditions = ['o.is_deleted = 0']; // 默认过滤已删除
      let params = [];
      
      if (status) {
        whereConditions.push('o.order_status = ?');
        params.push(status);
      }
      
      if (start_date) {
        whereConditions.push('o.created_time >= ?');
        params.push(start_date);
      }
      
      if (end_date) {
        whereConditions.push('o.created_time <= ?');
        params.push(end_date);
      }
      
      const whereClause = whereConditions.length > 0 
        ? 'WHERE ' + whereConditions.join(' AND ') 
        : '';
      
      const [orders] = await pool.execute(
        `SELECT o.*, p.payment_status, u1.username as employer_name, u2.username as provider_name
         FROM \`order\` o
         LEFT JOIN payment p ON o.order_id = p.order_id
         LEFT JOIN user u1 ON o.employer_id = u1.user_id
         LEFT JOIN user u2 ON o.provider_id = u2.user_id
         ${whereClause}
         ORDER BY o.created_time DESC
         LIMIT ? OFFSET ?`,
        [...params, limitNum, offset]
      );
      
      const [countResult] = await pool.execute(
        `SELECT COUNT(*) as total FROM \`order\` o ${whereClause}`,
        params
      );
      
      // ✅ 分页响应
      ResponseHelper.send.paginated(
        res,
        orders,
        {
          page: pageNum,
          limit: limitNum,
          total: countResult[0]?.total || 0,
          pages: Math.ceil((countResult[0]?.total || 0) / limitNum)
        },
        '获取订单列表成功'
      );
      
    } catch (error) {
      console.error('获取所有订单错误:', error);
      ResponseHelper.send.serverError(res, error.message || '获取所有订单失败');
    }
  },

  // 取消订单
  cancelOrder: async (req, res) => {
    try {
      const pool = getPool();
      const orderId = req.params.id;
      
      if (!orderId || isNaN(orderId)) {
        return ResponseHelper.send.error(
          res,
          '订单ID无效',
          ResponseHelper.errorCodes.BAD_REQUEST,
          { order_id: orderId }
        );
      }
      
      // 检查订单是否存在且状态是否可以取消
      const [order] = await pool.execute(
        'SELECT order_status FROM `order` WHERE order_id = ? AND is_deleted = 0',
        [orderId]
      );
      
      if (order.length === 0) {
        return ResponseHelper.send.notFound(res, '订单不存在');
      }
      
      const currentStatus = order[0].order_status;
      // 只有待支付和已支付状态的订单可以取消
      if (currentStatus !== ORDER_STATUS.PENDING && currentStatus !== ORDER_STATUS.PAID) {
        return ResponseHelper.send.error(
          res,
          '当前订单状态不允许取消',
          ResponseHelper.errorCodes.BAD_REQUEST,
          { current_status: currentStatus, allowed_status: [ORDER_STATUS.PENDING, ORDER_STATUS.PAID] }
        );
      }
      
      // 更新订单状态为已取消
      const [result] = await pool.execute(
        'UPDATE `order` SET order_status = ?, updated_time = NOW() WHERE order_id = ? AND is_deleted = 0',
        [ORDER_STATUS.CANCELLED, orderId]
      );
      
      if (result.affectedRows === 0) {
        return ResponseHelper.send.notFound(res, '订单不存在或已删除');
      }
      
      // ✅ 删除/取消成功响应
      ResponseHelper.send.deleted(res, '订单取消成功');
      
    } catch (error) {
      console.error('取消订单错误:', error);
      ResponseHelper.send.serverError(res, error.message || '取消订单失败');
    }
  },

  // 删除订单（软删除）
  deleteOrder: async (req, res) => {
    try {
      const pool = getPool();
      const orderId = req.params.id;
      
      if (!orderId || isNaN(orderId)) {
        return ResponseHelper.send.error(
          res,
          '订单ID无效',
          ResponseHelper.errorCodes.BAD_REQUEST,
          { order_id: orderId }
        );
      }
      
      // 软删除：将订单标记为已删除状态
      const [result] = await pool.execute(
        'UPDATE `order` SET is_deleted = 1, updated_time = NOW() WHERE order_id = ? AND is_deleted = 0',
        [orderId]
      );
      
      if (result.affectedRows === 0) {
        return ResponseHelper.send.notFound(res, '订单不存在或已删除');
      }
      
      // ✅ 删除成功响应
      ResponseHelper.send.deleted(res, '订单删除成功');
      
    } catch (error) {
      console.error('删除订单错误:', error);
      ResponseHelper.send.serverError(res, error.message || '删除订单失败');
    }
  },

  // 确认支付
  confirmPayment: async (req, res) => {
    try {
      const pool = getPool();
      const orderId = req.params.id;
      
      if (!orderId || isNaN(orderId)) {
        return ResponseHelper.send.error(
          res,
          '订单ID无效',
          ResponseHelper.errorCodes.BAD_REQUEST,
          { order_id: orderId }
        );
      }
      
      // 检查订单是否存在且状态为待支付
      const [order] = await pool.execute(
        'SELECT order_status FROM `order` WHERE order_id = ? AND is_deleted = 0',
        [orderId]
      );
      
      if (order.length === 0) {
        return ResponseHelper.send.notFound(res, '订单不存在');
      }
      
      if (order[0].order_status !== ORDER_STATUS.PENDING) {
        return ResponseHelper.send.error(
          res,
          '订单状态不是待支付',
          ResponseHelper.errorCodes.BAD_REQUEST,
          { current_status: order[0].order_status, required_status: ORDER_STATUS.PENDING }
        );
      }
      
      // 更新订单状态为已支付
      await pool.execute(
        'UPDATE `order` SET order_status = ?, updated_time = NOW() WHERE order_id = ? AND is_deleted = 0',
        [ORDER_STATUS.PAID, orderId]
      );
      
      // 同时更新支付记录
      await pool.execute(
        'UPDATE payment SET payment_status = 1, payment_time = NOW() WHERE order_id = ?',
        [orderId]
      );
      
      // ✅ 更新成功响应
      ResponseHelper.send.updated(
        res,
        { order_id: orderId, new_status: ORDER_STATUS.PAID },
        '支付确认成功'
      );
      
    } catch (error) {
      console.error('确认支付错误:', error);
      ResponseHelper.send.serverError(res, error.message || '确认支付失败');
    }
  },

  // 开始服务
  startService: async (req, res) => {
    try {
      const pool = getPool();
      const orderId = req.params.id;
      
      if (!orderId || isNaN(orderId)) {
        return ResponseHelper.send.error(
          res,
          '订单ID无效',
          ResponseHelper.errorCodes.BAD_REQUEST,
          { order_id: orderId }
        );
      }
      
      // 检查订单是否存在且状态为已支付
      const [order] = await pool.execute(
        'SELECT order_status FROM `order` WHERE order_id = ? AND is_deleted = 0',
        [orderId]
      );
      
      if (order.length === 0) {
        return ResponseHelper.send.notFound(res, '订单不存在');
      }
      
      if (order[0].order_status !== ORDER_STATUS.PAID) {
        return ResponseHelper.send.error(
          res,
          '订单状态不是已支付，无法开始服务',
          ResponseHelper.errorCodes.BAD_REQUEST,
          { current_status: order[0].order_status, required_status: ORDER_STATUS.PAID }
        );
      }
      
      // 更新订单状态为进行中
      const [result] = await pool.execute(
        'UPDATE `order` SET order_status = ?, service_start_time = NOW(), updated_time = NOW() WHERE order_id = ? AND is_deleted = 0',
        [ORDER_STATUS.IN_PROGRESS, orderId]
      );
      
      // ✅ 更新成功响应
      ResponseHelper.send.updated(
        res,
        { order_id: orderId, new_status: ORDER_STATUS.IN_PROGRESS },
        '服务开始成功'
      );
      
    } catch (error) {
      console.error('开始服务错误:', error);
      ResponseHelper.send.serverError(res, error.message || '开始服务失败');
    }
  },

  // 完成服务
  completeService: async (req, res) => {
    try {
      const pool = getPool();
      const orderId = req.params.id;
      
      if (!orderId || isNaN(orderId)) {
        return ResponseHelper.send.error(
          res,
          '订单ID无效',
          ResponseHelper.errorCodes.BAD_REQUEST,
          { order_id: orderId }
        );
      }
      
      // 检查订单是否存在且状态为进行中
      const [order] = await pool.execute(
        'SELECT order_status FROM `order` WHERE order_id = ? AND is_deleted = 0',
        [orderId]
      );
      
      if (order.length === 0) {
        return ResponseHelper.send.notFound(res, '订单不存在');
      }
      
      if (order[0].order_status !== ORDER_STATUS.IN_PROGRESS) {
        return ResponseHelper.send.error(
          res,
          '订单状态不是进行中，无法完成服务',
          ResponseHelper.errorCodes.BAD_REQUEST,
          { current_status: order[0].order_status, required_status: ORDER_STATUS.IN_PROGRESS }
        );
      }
      
      // 更新订单状态为已完成
      const [result] = await pool.execute(
        'UPDATE `order` SET order_status = ?, service_end_time = NOW(), updated_time = NOW() WHERE order_id = ? AND is_deleted = 0',
        [ORDER_STATUS.COMPLETED, orderId]
      );
      
      // ✅ 更新成功响应
      ResponseHelper.send.updated(
        res,
        { order_id: orderId, new_status: ORDER_STATUS.COMPLETED },
        '服务完成成功'
      );
      
    } catch (error) {
      console.error('完成服务错误:', error);
      ResponseHelper.send.serverError(res, error.message || '完成服务失败');
    }
  },

  // 用户订单统计
  getUserOrderStats: async (req, res) => {
    try {
      const pool = getPool();
      const userId = req.params.userId;
      
      if (!userId || isNaN(userId)) {
        return ResponseHelper.send.error(
          res,
          '用户ID无效',
          ResponseHelper.errorCodes.BAD_REQUEST,
          { user_id: userId }
        );
      }
      
      const [stats] = await pool.execute(`
        SELECT 
          COUNT(*) as total_orders,
          SUM(CASE WHEN order_status = 4 THEN 1 ELSE 0 END) as completed_orders,
          COALESCE(SUM(CASE WHEN order_status = 2 OR order_status = 3 OR order_status = 4 THEN order_amount ELSE 0 END), 0) as total_spent,
          COALESCE(AVG(CASE WHEN order_status = 4 THEN order_amount ELSE NULL END), 0) as avg_order_amount
        FROM \`order\`
        WHERE employer_id = ? AND is_deleted = 0
      `, [userId]);
      
      // ✅ 成功响应
      ResponseHelper.send.success(
        res,
        stats[0] || { total_orders: 0, completed_orders: 0, total_spent: 0, avg_order_amount: 0 },
        '获取用户订单统计成功'
      );
      
    } catch (error) {
      console.error('获取用户订单统计错误:', error);
      ResponseHelper.send.serverError(res, error.message || '获取用户订单统计失败');
    }
  }
};

// 状态流转验证辅助函数
function isValidStatusTransition(currentStatus, newStatus) {
  // 根据业务逻辑定义有效的状态流转
  const validTransitions = {
    1: [2, 6], // 待支付 -> 已支付、已取消
    2: [3, 6], // 已支付 -> 进行中、已取消
    3: [4, 6], // 进行中 -> 已完成、已取消
    4: [5],    // 已完成 -> 已评价
    5: [],     // 已评价 -> 无流转
    6: []      // 已取消 -> 无流转
  };
  
  return validTransitions[currentStatus]?.includes(newStatus) || false;
}

// 获取有效状态流转（用于错误提示）
function getValidTransitions(status) {
  const validTransitions = {
    1: [2, 6],
    2: [3, 6],
    3: [4, 6],
    4: [5],
    5: [],
    6: []
  };
  return validTransitions[status] || [];
}

module.exports = orderController;