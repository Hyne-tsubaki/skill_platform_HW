/**
 * 订单模块控制器（修正版 - 避免字段冲突）
 * 路径：modules/order-trade/controllers/orderControl.js
 */
const ResponseHelper = require('../../../middleware/responseHelper');

const ORDER_STATUS = {
  PENDING: 1,
  PAID: 2,
  IN_PROGRESS: 3,
  COMPLETED: 4,
  REVIEWED: 5,
  CANCELLED: 6
};

// 延迟获取连接池，避免循环依赖
let _pool = null;
function getPool() {
  if (!_pool) {
    const database = require('../../../config/database');
    _pool = database.pool;
    if (!_pool) {
      throw new Error('数据库连接池未初始化');
    }
  }
  return _pool;
}

// 日期格式化函数
function formatDateTimeForMySQL(dateString) {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      throw new Error('无效的日期时间格式');
    }
    return date.toISOString().slice(0, 19).replace('T', ' ');
  } catch (error) {
    console.error('日期格式化错误:', error);
    throw new Error('日期时间格式无效');
  }
}

const orderController = {
  // 创建订单
  createOrder: async (req, res) => {
    try {
      const pool = getPool();
      const { skill_id, employer_id, provider_id, order_amount, service_time, order_remark } = req.body;

      // 验证必填参数
      if (!skill_id || !employer_id || !provider_id || !order_amount || !service_time) {
        return ResponseHelper.send.error(res, '缺少必填参数', 400);
      }
      
      if (order_amount <= 0) {
        return ResponseHelper.send.error(res, '订单金额必须大于0', 400);
      }
      
      // 格式化服务时间
      let mysqlServiceTime;
      try {
        const serviceDate = new Date(service_time);
        if (serviceDate <= new Date()) {
          return ResponseHelper.send.error(res, '服务时间必须是未来时间', 400);
        }
        mysqlServiceTime = formatDateTimeForMySQL(service_time);
      } catch (error) {
        return ResponseHelper.send.error(res, `服务时间格式无效: ${error.message}`, 400);
      }

      // 准备存储过程参数
      const p_task_id = req.body.task_id || null;
      const p_payment_method = 'balance';
      const timestamp = Date.now();
      
      const out_order_no = `@out_order_no_${timestamp}`;
      const out_payment_no = `@out_payment_no_${timestamp}`;
      const out_result_code = `@out_result_code_${timestamp}`;
      const out_message = `@out_message_${timestamp}`;

      // 执行存储过程
      const callSql = `CALL sp_create_order_with_payment(?, ?, ?, ?, ?, ?, ?, ?, ${out_order_no}, ${out_payment_no}, ${out_result_code}, ${out_message})`;
      
      await pool.execute(callSql, [
        skill_id, employer_id, provider_id, order_amount, mysqlServiceTime, 
        order_remark || '', p_payment_method, p_task_id
      ]);

      // 获取存储过程输出
      const [outputRows] = await pool.execute(
        `SELECT ${out_order_no} as order_no, ${out_payment_no} as payment_no, ${out_result_code} as result_code, ${out_message} as message`
      );

      const output = outputRows[0];
      if (output.result_code !== 0) {
        return ResponseHelper.send.error(res, output.message || '订单创建失败', 400);
      }

      ResponseHelper.send.created(res, {
        order_no: output.order_no,
        payment_no: output.payment_no
      }, output.message || '订单创建成功');

    } catch (error) {
      console.error('创建订单错误:', error);
      ResponseHelper.send.error(res, error.message || '服务器内部错误', 500);
    }
  },

  // 根据ID获取订单详情
  getOrderById: async (req, res) => {
  try {
    const pool = getPool();
    const orderId = req.params.id;
    
    if (!orderId || isNaN(orderId)) {
      return ResponseHelper.send.error(res, '订单ID无效', 400);
    }
    
    // 使用别名
    const [orders] = await pool.execute(
      `SELECT 
        order_id, 
        order_no, 
        skill_id, 
        employer_id, 
        provider_id, 
        task_id, 
        order_amount, 
        order_status, 
        service_time, 
        order_remark, 
        is_deleted, 
        created_time as created_at,  -- 使用别名
        updated_time as updated_at   -- 使用别名
      FROM \`order\` 
      WHERE order_id = ? AND is_deleted = 0`,
      [orderId]
    );
    
    if (orders.length === 0) {
      return ResponseHelper.send.notFound(res, '订单不存在');
    }
    
    const order = orders[0];
    
    // 获取支付信息
    const [payments] = await pool.execute(
      'SELECT * FROM payment WHERE order_id = ?',
      [orderId]
    );
    
    // 获取技能信息
    const [skills] = await pool.execute(
      'SELECT s.*, u.username as provider_name FROM skill s LEFT JOIN user u ON s.user_id = u.user_id WHERE s.skill_id = ?',
      [order.skill_id]
    );
    
    order.payment = payments[0] || null;
    order.skill = skills[0] || null;
    
    ResponseHelper.send.success(res, order, '获取订单成功');
    
  } catch (error) {
    console.error('获取订单错误:', error);
    ResponseHelper.send.serverError(res, error.message || '获取订单详情失败');
  }
},

  // 订单统计摘要
  getOrderStats: async (req, res) => {
    try {
      const pool = getPool();
      
      // 状态统计
      const [statusStats] = await pool.execute(`
        SELECT order_status, COUNT(*) as count, COALESCE(SUM(order_amount), 0) as total_amount
        FROM \`order\`
        WHERE is_deleted = 0
        GROUP BY order_status
        ORDER BY order_status
      `);
      
      // 今日统计
      const [todayStats] = await pool.execute(`
        SELECT COUNT(*) as today_orders, COALESCE(SUM(order_amount), 0) as today_amount
        FROM \`order\`
        WHERE DATE(created_time) = CURDATE() AND is_deleted = 0
      `);
      
      // 状态映射
      const statusMap = {
        1: '待支付', 2: '已支付', 3: '进行中', 
        4: '已完成', 5: '已评价', 6: '已取消'
      };
      
      const formattedStatusStats = statusStats.map(stat => ({
        ...stat,
        status_name: statusMap[stat.order_status] || '未知状态'
      }));
      
      const result = {
        status_stats: formattedStatusStats,
        today: todayStats[0] || { today_orders: 0, today_amount: 0 },
        timestamp: new Date().toISOString()
      };
      
      ResponseHelper.send.success(res, result, '获取订单统计成功');
      
    } catch (error) {
      console.error('获取订单统计错误:', error);
      ResponseHelper.send.serverError(res, error.message || '获取订单统计失败');
    }
  },

  // 更新订单状态
  updateOrderStatus: async (req, res) => {
    try {
      const pool = getPool();
      const orderId = req.params.id;
      const { order_status } = req.body;
      
      if (!orderId || isNaN(orderId)) {
        return ResponseHelper.send.error(res, '订单ID无效', 400);
      }
      
      if (order_status === undefined || order_status < 1 || order_status > 6) {
        return ResponseHelper.send.error(res, '订单状态值无效', 400);
      }
      
      const [currentOrder] = await pool.execute(
        'SELECT order_status FROM `order` WHERE order_id = ? AND is_deleted = 0',
        [orderId]
      );
      
      if (currentOrder.length === 0) {
        return ResponseHelper.send.notFound(res, '订单不存在');
      }
      
      // 更新状态
      const [result] = await pool.execute(
        'UPDATE `order` SET order_status = ?, updated_time = NOW() WHERE order_id = ? AND is_deleted = 0',
        [order_status, orderId]
      );
      
      if (result.affectedRows === 0) {
        return ResponseHelper.send.notFound(res, '订单不存在或已删除');
      }
      
      ResponseHelper.send.updated(res, { 
        order_id: orderId, 
        new_status: order_status 
      }, '订单状态更新成功');
      
    } catch (error) {
      console.error('更新订单状态错误:', error);
      ResponseHelper.send.serverError(res, error.message || '更新订单状态失败');
    }
  },

  // 获取用户订单列表
  getUserOrders: async (req, res) => {
  try {
    const pool = getPool();
    const userId = req.params.userId;
    const { type = 'all', page = 1, limit = 10 } = req.query;
    
    if (!userId || isNaN(userId)) {
      return ResponseHelper.send.error(res, '用户ID无效', 400);
    }
    
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 10));
    const offset = (pageNum - 1) * limitNum;
    
    let whereClause = '';
    let params = [];
    
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
      return ResponseHelper.send.error(res, '类型参数必须是 employer、provider 或 all', 400);
    }
    
    const connection = await pool.getConnection();
    
    try {
      // 使用别名
      const [orders] = await connection.query(
        `SELECT 
          o.order_id, 
          o.order_no, 
          o.skill_id, 
          o.employer_id, 
          o.provider_id,
          o.task_id, 
          o.order_amount, 
          o.order_status, 
          o.service_time,
          o.order_remark, 
          o.is_deleted, 
          o.created_time as created_at,  -- 使用别名
          o.updated_time as updated_at,  -- 使用别名
          p.payment_status, 
          p.payment_time, 
          s.title as skill_title
         FROM \`order\` o 
         LEFT JOIN payment p ON o.order_id = p.order_id 
         LEFT JOIN skill s ON o.skill_id = s.skill_id
         ${whereClause}
         ORDER BY o.created_time DESC 
         LIMIT ? OFFSET ?`,
        [...params, limitNum, offset]
      );
      
      const [countResult] = await connection.query(
        `SELECT COUNT(*) as total FROM \`order\` o ${whereClause}`,
        params
      );
      
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
      
    } finally {
      connection.release();
    }
    
  } catch (error) {
    console.error('获取用户订单错误:', error);
    ResponseHelper.send.serverError(res, error.message || '获取用户订单失败');
  }
},


  // 获取所有订单 - 修复版本
 getAllOrders: async (req, res) => {
  let connection;
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
    
    let whereConditions = ['o.is_deleted = 0'];
    let params = [];
    
    if (status && status.trim() !== '') {
      const statusNum = parseInt(status);
      if (!isNaN(statusNum)) {
        whereConditions.push('o.order_status = ?');
        params.push(statusNum);
      }
    }
    
    // 注意：这里查询条件中使用 created_time，但返回时使用别名 created_at
    if (start_date && start_date.trim() !== '') {
      whereConditions.push('o.created_time >= ?');
      params.push(start_date.trim());
    }
    
    if (end_date && end_date.trim() !== '') {
      whereConditions.push('o.created_time <= ?');
      params.push(end_date.trim());
    }
    
    const whereClause = whereConditions.length > 0 
      ? 'WHERE ' + whereConditions.join(' AND ') 
      : '';
    
    connection = await pool.getConnection();
    
    // 关键修改：使用别名
    const [orders] = await connection.query(
      `SELECT 
        o.order_id,
        o.order_no,
        o.skill_id,
        o.employer_id,
        o.provider_id,
        o.task_id,
        o.order_amount,
        o.order_status,
        o.service_time,
        o.order_remark,
        o.is_deleted,
        o.created_time as created_at,  -- 使用别名
        o.updated_time as updated_at,  -- 使用别名
        p.payment_status,
        u1.username as employer_name,
        u2.username as provider_name
       FROM \`order\` o
       LEFT JOIN payment p ON o.order_id = p.order_id
       LEFT JOIN user u1 ON o.employer_id = u1.user_id
       LEFT JOIN user u2 ON o.provider_id = u2.user_id
       ${whereClause}
       ORDER BY o.created_time DESC
       LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );
    
    const [countResult] = await connection.query(
      `SELECT COUNT(*) as total FROM \`order\` o ${whereClause}`,
      params
    );
    
    const total = countResult[0]?.total || 0;
    
    ResponseHelper.send.paginated(
      res,
      orders,
      {
        page: pageNum,
        limit: limitNum,
        total: total,
        pages: Math.ceil(total / limitNum)
      },
      '获取订单列表成功'
    );
    
  } catch (error) {
    console.error('获取所有订单错误详情:', error);
    ResponseHelper.send.serverError(res, '获取订单列表失败');
  } finally {
    if (connection) {
      connection.release();
    }
  }
},


  // 取消订单
  cancelOrder: async (req, res) => {
    try {
      const pool = getPool();
      const orderId = req.params.id;
      
      if (!orderId || isNaN(orderId)) {
        return ResponseHelper.send.error(res, '订单ID无效', 400);
      }
      
      const [order] = await pool.execute(
        'SELECT order_status FROM `order` WHERE order_id = ? AND is_deleted = 0',
        [orderId]
      );
      
      if (order.length === 0) {
        return ResponseHelper.send.notFound(res, '订单不存在');
      }
      
      const currentStatus = order[0].order_status;
      if (currentStatus !== ORDER_STATUS.PENDING && currentStatus !== ORDER_STATUS.PAID) {
        return ResponseHelper.send.error(res, '当前订单状态不允许取消', 400);
      }
      
      const [result] = await pool.execute(
        'UPDATE `order` SET order_status = ?, updated_time = NOW() WHERE order_id = ? AND is_deleted = 0',
        [ORDER_STATUS.CANCELLED, orderId]
      );
      
      if (result.affectedRows === 0) {
        return ResponseHelper.send.notFound(res, '订单不存在或已删除');
      }
      
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
        return ResponseHelper.send.error(res, '订单ID无效', 400);
      }
      
      const [result] = await pool.execute(
        'UPDATE `order` SET is_deleted = 1, updated_time = NOW() WHERE order_id = ? AND is_deleted = 0',
        [orderId]
      );
      
      if (result.affectedRows === 0) {
        return ResponseHelper.send.notFound(res, '订单不存在或已删除');
      }
      
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
        return ResponseHelper.send.error(res, '订单ID无效', 400);
      }
      
      const [order] = await pool.execute(
        'SELECT order_status FROM `order` WHERE order_id = ? AND is_deleted = 0',
        [orderId]
      );
      
      if (order.length === 0) {
        return ResponseHelper.send.notFound(res, '订单不存在');
      }
      
      if (order[0].order_status !== ORDER_STATUS.PENDING) {
        return ResponseHelper.send.error(res, '订单状态不是待支付', 400);
      }
      
      // 更新订单状态
      await pool.execute(
        'UPDATE `order` SET order_status = ?, updated_time = NOW() WHERE order_id = ? AND is_deleted = 0',
        [ORDER_STATUS.PAID, orderId]
      );
      
      // 更新支付记录
      await pool.execute(
        'UPDATE payment SET payment_status = 1, payment_time = NOW() WHERE order_id = ?',
        [orderId]
      );
      
      ResponseHelper.send.updated(res, { 
        order_id: orderId, 
        new_status: ORDER_STATUS.PAID 
      }, '支付确认成功');
      
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
        return ResponseHelper.send.error(res, '订单ID无效', 400);
      }
      
      const [order] = await pool.execute(
        'SELECT order_status FROM `order` WHERE order_id = ? AND is_deleted = 0',
        [orderId]
      );
      
      if (order.length === 0) {
        return ResponseHelper.send.notFound(res, '订单不存在');
      }
      
      if (order[0].order_status !== ORDER_STATUS.PAID) {
        return ResponseHelper.send.error(res, '订单状态不是已支付，无法开始服务', 400);
      }
      
      const [result] = await pool.execute(
        'UPDATE `order` SET order_status = ?, updated_time = NOW() WHERE order_id = ? AND is_deleted = 0',
        [ORDER_STATUS.IN_PROGRESS, orderId]
      );
      
      ResponseHelper.send.updated(res, { 
        order_id: orderId, 
        new_status: ORDER_STATUS.IN_PROGRESS 
      }, '服务开始成功');
      
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
        return ResponseHelper.send.error(res, '订单ID无效', 400);
      }
      
      const [order] = await pool.execute(
        'SELECT order_status FROM `order` WHERE order_id = ? AND is_deleted = 0',
        [orderId]
      );
      
      if (order.length === 0) {
        return ResponseHelper.send.notFound(res, '订单不存在');
      }
      
      if (order[0].order_status !== ORDER_STATUS.IN_PROGRESS) {
        return ResponseHelper.send.error(res, '订单状态不是进行中，无法完成服务', 400);
      }
      
      const [result] = await pool.execute(
        'UPDATE `order` SET order_status = ?, updated_time = NOW() WHERE order_id = ? AND is_deleted = 0',
        [ORDER_STATUS.COMPLETED, orderId]
      );
      
      ResponseHelper.send.updated(res, { 
        order_id: orderId, 
        new_status: ORDER_STATUS.COMPLETED 
      }, '服务完成成功');
      
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
        return ResponseHelper.send.error(res, '用户ID无效', 400);
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

module.exports = orderController;