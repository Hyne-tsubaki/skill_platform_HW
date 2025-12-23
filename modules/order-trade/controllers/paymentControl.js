//支付业务逻辑

const ResponseHelper = require('../../../middleware/responseHelper');// 导入响应格式统一处理工具，确保所有 API 返回格式一致

// 延迟获取连接池的函数
function getPool() {
  const { pool } = require('../../../config/database');
  if (!pool) {
    throw new Error('数据库连接池未初始化，请先调用 initializeDatabase()');
  }
  return pool;
}

// 定义支付控制器对象，包含所有支付相关的业务逻辑处理函数
const paymentController = {
  // ✅ 1. 创建支付订单
  createPayment: async (req, res) => {
    try {
      const pool = getPool();
      
      const { 
        order_id, 
        payment_method, 
        payment_amount, 
        payment_channel = 'balance'  // 默认余额支付
      } = req.body;

      // 验证必填参数
      if (!order_id || !payment_method || !payment_amount) {
        return res.status(400).json(
          responseHelper.error('缺少必填参数: order_id, payment_method, payment_amount')
        );
      }

      // 验证金额
      if (payment_amount <= 0) {
        return res.status(400).json(
          responseHelper.error('支付金额必须大于0')
        );
      }

      // 检查订单是否存在
      const [order] = await pool.execute(
        'SELECT order_status, order_amount FROM `order` WHERE order_id = ? AND is_deleted = 0',
        [order_id]
      );

      if (order.length === 0) {
        return res.status(404).json(
          responseHelper.error('订单不存在')
        );
      }

      // 检查订单状态是否允许支付（待支付状态）
      if (order[0].order_status !== 1) { // 1=待支付
        return res.status(400).json(
          responseHelper.error('订单状态不允许支付')
        );
      }

      // 检查支付金额是否匹配订单金额
      if (order[0].order_amount !== payment_amount) {
        return res.status(400).json(
          responseHelper.error('支付金额与订单金额不匹配')
        );
      }

      // 检查是否已存在支付记录
      const [existingPayment] = await pool.execute(
        'SELECT * FROM payment WHERE order_id = ? AND payment_status != 3', // 3=已退款
        [order_id]
      );

      if (existingPayment.length > 0) {
        return res.status(400).json(
          responseHelper.error('该订单已有支付记录')
        );
      }

      // 生成支付流水号
      const payment_no = `P${Date.now()}${Math.floor(Math.random() * 1000)}`;

      // 创建支付记录
      const [result] = await pool.execute(
        `INSERT INTO payment (
          order_id, payment_no, payment_method, 
          payment_amount, payment_channel, payment_status
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [order_id, payment_no, payment_method, payment_amount, payment_channel, 0] // 0=待支付
      );

      const payment_id = result.insertId;

      res.status(201).json(
        responseHelper.success({
          payment_id: payment_id,
          payment_no: payment_no,
          order_id: order_id,
          payment_status: 0 // 待支付
        }, '支付订单创建成功')
      );

    } catch (error) {
      console.error('创建支付订单错误:', error);
      
      let statusCode = 500;
      let errorMessage = error.message;
      
      if (error.code === 'ER_DUP_ENTRY') {
        statusCode = 400;
        errorMessage = '支付订单已存在';
      } else if (error.code === 'ER_NO_REFERENCED_ROW') {
        statusCode = 400;
        errorMessage = '关联的订单不存在';
      }
      
      res.status(statusCode).json(
        responseHelper.error(errorMessage)
      );
    }
  },

  // ✅ 2. 获取支付详情（根据支付ID）
  getPaymentById: async (req, res) => {
    try {
      const pool = getPool();
      const paymentId = req.params.paymentId;

      if (!paymentId || isNaN(paymentId)) {
        return res.status(400).json(
          responseHelper.error('支付ID无效')
        );
      }

      // 查询支付详情，关联订单信息
      const [payments] = await pool.execute(
        `SELECT p.*, 
                o.order_no, o.order_amount, o.order_status,
                e.username as employer_name, 
                pr.username as provider_name
         FROM payment p
         JOIN \`order\` o ON p.order_id = o.order_id
         LEFT JOIN user e ON o.employer_id = e.user_id
         LEFT JOIN user pr ON o.provider_id = pr.user_id
         WHERE p.payment_id = ?`,
        [paymentId]
      );

      if (payments.length === 0) {
        return res.status(404).json(
          responseHelper.error('支付记录不存在')
        );
      }

      // 如果有退款记录，查询退款信息
      const [refunds] = await pool.execute(
        'SELECT * FROM refund WHERE payment_id = ? ORDER BY created_time DESC',
        [paymentId]
      );

      const payment = payments[0];
      if (refunds.length > 0) {
        payment.refunds = refunds;
      }

      res.json(
        responseHelper.success(payment, '获取支付详情成功')
      );

    } catch (error) {
      console.error('获取支付详情错误:', error);
      res.status(500).json(
        responseHelper.error(error.message)
      );
    }
  },

  // ✅ 3. 取消支付
  cancelPayment: async (req, res) => {
    try {
      const pool = getPool();
      const paymentId = req.params.paymentId;

      if (!paymentId || isNaN(paymentId)) {
        return res.status(400).json(
          responseHelper.error('支付ID无效')
        );
      }

      // 检查支付记录是否存在
      const [payments] = await pool.execute(
        'SELECT * FROM payment WHERE payment_id = ?',
        [paymentId]
      );

      if (payments.length === 0) {
        return res.status(404).json(
          responseHelper.error('支付记录不存在')
        );
      }

      const payment = payments[0];

      // 只有待支付的订单才能取消
      if (payment.payment_status !== 0) { // 0=待支付
        return res.status(400).json(
          responseHelper.error('只有待支付的订单才能取消')
        );
      }

      // 更新支付状态为已取消（假设状态码2为已取消）
      const [result] = await pool.execute(
        'UPDATE payment SET payment_status = 2, updated_time = NOW() WHERE payment_id = ?',
        [paymentId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json(
          responseHelper.error('支付记录不存在')
        );
      }

      res.json(
        responseHelper.success(null, '支付取消成功')
      );

    } catch (error) {
      console.error('取消支付错误:', error);
      res.status(500).json(
        responseHelper.error(error.message)
      );
    }
  },

  // ✅ 4. 查询支付状态
  getPaymentStatus: async (req, res) => {
    try {
      const pool = getPool();
      const paymentId = req.params.paymentId;

      if (!paymentId || isNaN(paymentId)) {
        return res.status(400).json(
          responseHelper.error('支付ID无效')
        );
      }

      // 查询支付状态
      const [payments] = await pool.execute(
        `SELECT p.payment_id, p.payment_no, p.payment_status, 
                p.payment_amount, p.payment_time,
                o.order_no, o.order_status,
                CASE p.payment_status 
                  WHEN 0 THEN '待支付'
                  WHEN 1 THEN '支付成功'
                  WHEN 2 THEN '支付取消'
                  WHEN 3 THEN '已退款'
                  WHEN 4 THEN '支付失败'
                  ELSE '未知状态'
                END as status_name
         FROM payment p
         JOIN \`order\` o ON p.order_id = o.order_id
         WHERE p.payment_id = ?`,
        [paymentId]
      );

      if (payments.length === 0) {
        return res.status(404).json(
          responseHelper.error('支付记录不存在')
        );
      }

      const payment = payments[0];

      // 如果是支付成功状态，检查是否有退款
      if (payment.payment_status === 1) {
        const [refunds] = await pool.execute(
          'SELECT refund_status FROM refund WHERE payment_id = ? AND refund_status != 3 ORDER BY created_time DESC LIMIT 1',
          [paymentId]
        );
        if (refunds.length > 0) {
          payment.has_active_refund = true;
          payment.active_refund_status = refunds[0].refund_status;
        }
      }

      res.json(
        responseHelper.success(payment, '获取支付状态成功')
      );

    } catch (error) {
      console.error('查询支付状态错误:', error);
      res.status(500).json(
        responseHelper.error(error.message)
      );
    }
  },

  // ✅ 5. 处理退款
  processRefund: async (req, res) => {
    try {
      const pool = getPool();
      const paymentId = req.params.paymentId;
      
      const { 
        refund_amount, 
        refund_reason,
        refund_type = 1  // 1=全额退款, 2=部分退款
      } = req.body;

      if (!paymentId || isNaN(paymentId)) {
        return res.status(400).json(
          responseHelper.error('支付ID无效')
        );
      }

      if (!refund_amount || refund_amount <= 0) {
        return res.status(400).json(
          responseHelper.error('退款金额必须大于0')
        );
      }

      if (!refund_reason || refund_reason.trim() === '') {
        return res.status(400).json(
          responseHelper.error('退款原因不能为空')
        );
      }

      // 检查支付记录是否存在且状态为支付成功
      const [payments] = await pool.execute(
        'SELECT * FROM payment WHERE payment_id = ?',
        [paymentId]
      );

      if (payments.length === 0) {
        return res.status(404).json(
          responseHelper.error('支付记录不存在')
        );
      }

      const payment = payments[0];

      if (payment.payment_status !== 1) { // 1=支付成功
        return res.status(400).json(
          responseHelper.error('只有支付成功的订单才能退款')
        );
      }

      // 检查是否已经有处理中的退款
      const [activeRefunds] = await pool.execute(
        'SELECT * FROM refund WHERE payment_id = ? AND refund_status = 0', // 0=处理中
        [paymentId]
      );

      if (activeRefunds.length > 0) {
        return res.status(400).json(
          responseHelper.error('该支付已有处理中的退款申请')
        );
      }

      // 检查退款金额是否超过支付金额
      if (refund_amount > payment.payment_amount) {
        return res.status(400).json(
          responseHelper.error('退款金额不能超过支付金额')
        );
      }

      // 生成退款流水号
      const refund_no = `R${Date.now()}${Math.floor(Math.random() * 1000)}`;

      // 创建退款记录
      const [result] = await pool.execute(
        `INSERT INTO refund (
          payment_id, refund_no, refund_amount, 
          refund_reason, refund_type, refund_status
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [paymentId, refund_no, refund_amount, refund_reason, refund_type, 0] // 0=处理中
      );

      const refund_id = result.insertId;

      // 更新支付状态为退款中
      await pool.execute(
        'UPDATE payment SET payment_status = 3, updated_time = NOW() WHERE payment_id = ?',
        [paymentId]
      );

      res.status(201).json(
        responseHelper.success({
          refund_id: refund_id,
          refund_no: refund_no,
          payment_id: paymentId,
          refund_amount: refund_amount,
          refund_status: 0 // 处理中
        }, '退款申请提交成功')
      );

    } catch (error) {
      console.error('处理退款错误:', error);
      res.status(500).json(
        responseHelper.error(error.message)
      );
    }
  },

  // ✅ 6. 获取退款历史
  getRefundHistory: async (req, res) => {
    try {
      const pool = getPool();
      const paymentId = req.params.paymentId;

      if (!paymentId || isNaN(paymentId)) {
        return res.status(400).json(
          responseHelper.error('支付ID无效')
        );
      }

      // 检查支付记录是否存在
      const [payments] = await pool.execute(
        'SELECT * FROM payment WHERE payment_id = ?',
        [paymentId]
      );

      if (payments.length === 0) {
        return res.status(404).json(
          responseHelper.error('支付记录不存在')
        );
      }

      // 获取退款历史
      const [refunds] = await pool.execute(
        `SELECT r.*, 
                p.payment_no, p.payment_amount,
                CASE r.refund_status 
                  WHEN 0 THEN '处理中'
                  WHEN 1 THEN '退款成功'
                  WHEN 2 THEN '退款失败'
                  WHEN 3 THEN '退款取消'
                  ELSE '未知状态'
                END as status_name
         FROM refund r
         JOIN payment p ON r.payment_id = p.payment_id
         WHERE r.payment_id = ?
         ORDER BY r.created_time DESC`,
        [paymentId]
      );

      // 获取支付基本信息
      const paymentInfo = payments[0];

      res.json(
        responseHelper.success({
          payment_info: {
            payment_id: paymentInfo.payment_id,
            payment_no: paymentInfo.payment_no,
            payment_amount: paymentInfo.payment_amount,
            payment_status: paymentInfo.payment_status
          },
          refunds: refunds,
          total_refunds: refunds.length,
          total_refund_amount: refunds.reduce((sum, refund) => sum + refund.refund_amount, 0)
        }, '获取退款历史成功')
      );

    } catch (error) {
      console.error('获取退款历史错误:', error);
      res.status(500).json(
        responseHelper.error(error.message)
      );
    }
  },

  // ✅ 7. 获取支付统计摘要
  getPaymentSummary: async (req, res) => {
    try {
      const pool = getPool();

      // 获取不同状态的支付数量统计
      const [statusStats] = await pool.execute(`
        SELECT 
          payment_status,
          COUNT(*) as count,
          SUM(payment_amount) as total_amount
        FROM payment
        WHERE is_deleted = 0
        GROUP BY payment_status
        ORDER BY payment_status
      `);

      // 获取今日支付统计
      const [todayStats] = await pool.execute(`
        SELECT 
          COUNT(*) as today_payments,
          SUM(payment_amount) as today_amount
        FROM payment
        WHERE DATE(created_time) = CURDATE() AND is_deleted = 0
      `);

      // 获取本周支付统计
      const [weekStats] = await pool.execute(`
        SELECT 
          COUNT(*) as week_payments,
          SUM(payment_amount) as week_amount
        FROM payment
        WHERE YEARWEEK(created_time, 1) = YEARWEEK(CURDATE(), 1) AND is_deleted = 0
      `);

      // 获取本月支付统计
      const [monthStats] = await pool.execute(`
        SELECT 
          COUNT(*) as month_payments,
          SUM(payment_amount) as month_amount
        FROM payment
        WHERE YEAR(created_time) = YEAR(CURDATE()) 
          AND MONTH(created_time) = MONTH(CURDATE()) 
          AND is_deleted = 0
      `);

      // 获取总支付统计
      const [totalStats] = await pool.execute(`
        SELECT 
          COUNT(*) as total_payments,
          SUM(payment_amount) as total_amount,
          AVG(payment_amount) as avg_payment_amount
        FROM payment
        WHERE is_deleted = 0
      `);

      // 获取各支付方式的统计
      const [methodStats] = await pool.execute(`
        SELECT 
          payment_method,
          COUNT(*) as count,
          SUM(payment_amount) as total_amount
        FROM payment
        WHERE is_deleted = 0
        GROUP BY payment_method
        ORDER BY total_amount DESC
      `);

      // 状态码映射
      const statusMap = {
        0: '待支付',
        1: '支付成功', 
        2: '支付取消',
        3: '已退款',
        4: '支付失败'
      };

      // 格式化状态统计数据
      const formattedStatusStats = statusStats.map(stat => ({
        ...stat,
        status_name: statusMap[stat.payment_status] || '未知状态'
      }));

      // 汇总数据
      const result = {
        status_stats: formattedStatusStats,
        method_stats: methodStats,
        today: todayStats[0] || { today_payments: 0, today_amount: 0 },
        week: weekStats[0] || { week_payments: 0, week_amount: 0 },
        month: monthStats[0] || { month_payments: 0, month_amount: 0 },
        total: totalStats[0] || { total_payments: 0, total_amount: 0, avg_payment_amount: 0 },
        timestamp: new Date().toISOString()
      };

      res.json(
        responseHelper.success(result, '获取支付统计摘要成功')
      );

    } catch (error) {
      console.error('获取支付统计摘要错误:', error);
      res.status(500).json(
        responseHelper.error(error.message)
      );
    }
  },

  // ✅ 8. 获取每日支付统计
  getDailyPaymentStats: async (req, res) => {
    try {
      const pool = getPool();
      const { start_date, end_date, days = 30 } = req.query;

      let dateCondition = '';
      let params = [];

      // 设置日期范围
      if (start_date && end_date) {
        dateCondition = 'WHERE DATE(created_time) BETWEEN ? AND ?';
        params = [start_date, end_date];
      } else {
        // 默认最近30天
        dateCondition = 'WHERE created_time >= DATE_SUB(CURDATE(), INTERVAL ? DAY)';
        params = [parseInt(days) || 30];
      }

      // 获取每日支付统计
      const [dailyStats] = await pool.execute(`
        SELECT 
          DATE(created_time) as date,
          COUNT(*) as payment_count,
          SUM(payment_amount) as total_amount,
          AVG(payment_amount) as avg_amount,
          SUM(CASE WHEN payment_status = 1 THEN payment_amount ELSE 0 END) as success_amount,
          COUNT(CASE WHEN payment_status = 1 THEN 1 END) as success_count,
          SUM(CASE WHEN payment_status = 4 THEN payment_amount ELSE 0 END) as failed_amount,
          COUNT(CASE WHEN payment_status = 4 THEN 1 END) as failed_count
        FROM payment
        ${dateCondition}
          AND is_deleted = 0
        GROUP BY DATE(created_time)
        ORDER BY DATE(created_time) DESC
      `, params);

      // 获取统计摘要
      const [summary] = await pool.execute(`
        SELECT 
          COUNT(*) as total_count,
          SUM(payment_amount) as total_amount,
          AVG(payment_amount) as overall_avg,
          MIN(payment_amount) as min_amount,
          MAX(payment_amount) as max_amount,
          COUNT(DISTINCT DATE(created_time)) as active_days
        FROM payment
        ${dateCondition}
          AND is_deleted = 0
      `, params);

      const result = {
        daily_stats: dailyStats,
        summary: summary[0] || {
          total_count: 0,
          total_amount: 0,
          overall_avg: 0,
          min_amount: 0,
          max_amount: 0,
          active_days: 0
        },
        query_params: {
          start_date: start_date || `最近${days}天`,
          end_date: end_date || '至今'
        },
        timestamp: new Date().toISOString()
      };

      res.json(
        responseHelper.success(result, '获取每日支付统计成功')
      );

    } catch (error) {
      console.error('获取每日支付统计错误:', error);
      res.status(500).json(
        responseHelper.error(error.message)
      );
    }
  },

  handleAlipayCallback: async (req, res) => {
    try {
      // 后续补充支付宝回调逻辑（验签、更新支付状态等）
      ResponseHelper.send.success(res, { received: true, message: '支付宝回调已接收' }, '回调处理成功');
    } catch (error) {
      console.error('支付宝回调错误:', error);
      ResponseHelper.send.serverError(res, '回调处理失败');
    }
  },
  handleWechatCallback: async (req, res) => {
    try {
      ResponseHelper.send.success(res, { received: true, message: '微信支付回调已接收' }, '回调处理成功');
    } catch (error) {
      console.error('微信支付回调错误:', error);
      ResponseHelper.send.serverError(res, '回调处理失败');
    }
  },
  handleBankCallback: async (req, res) => {
    try {
      ResponseHelper.send.success(res, { received: true, message: '网银回调已接收' }, '回调处理成功');
    } catch (error) {
      console.error('网银回调错误:', error);
      ResponseHelper.send.serverError(res, '回调处理失败');
    }
  },

  // ✅ 原有的三个方法（已修复连接池问题）

  // 模拟支付（更新支付状态）
  simulatePayment: async (req, res) => {
    try {
      const pool = getPool();
      const paymentId = req.params.paymentId; // 注意路由参数名
      const { payment_status } = req.body;
      
      // 验证支付状态
      if (payment_status === undefined || ![0, 1, 2, 3, 4].includes(payment_status)) {
        return res.status(400).json(
          responseHelper.error('支付状态值无效（必须是0-4）')
        );
      }

      // 检查支付记录是否存在
      const [existingPayment] = await pool.execute(
        'SELECT * FROM payment WHERE payment_id = ?',
        [paymentId]
      );

      if (existingPayment.length === 0) {
        return res.status(404).json(
          responseHelper.error('支付记录不存在')
        );
      }

      const sql = `CALL sp_simulate_payment(?, ?)`;
      await pool.execute(sql, [paymentId, payment_status]);
      
      res.json(
        responseHelper.success(null, '支付状态更新成功')
      );
      
    } catch (error) {
      console.error('模拟支付错误:', error);
      res.status(500).json(
        responseHelper.error(error.message)
      );
    }
  },

  // 根据订单ID获取支付信息
  getPaymentByOrderId: async (req, res) => {
    try {
      const pool = getPool();
      const orderId = req.params.orderId;
      
      if (!orderId || isNaN(orderId)) {
        return res.status(400).json(
          responseHelper.error('订单ID无效')
        );
      }
      
      const [payments] = await pool.execute(
        'SELECT * FROM payment WHERE order_id = ?',
        [orderId]
      );
      
      if (payments.length === 0) {
        return res.status(404).json(
          responseHelper.error('支付记录不存在')
        );
      }
      
      res.json(
        responseHelper.success(payments[0], '获取支付信息成功')
      );
      
    } catch (error) {
      console.error('获取支付信息错误:', error);
      res.status(500).json(
        responseHelper.error(error.message)
      );
    }
  },

  // 获取支付记录列表（支持分页和状态过滤）
  getPaymentList: async (req, res) => {
    try {
      const pool = getPool();
      const { page = 1, limit = 10, status, start_date, end_date, payment_method } = req.query;
      
      // 分页参数处理
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
      const offset = (pageNum - 1) * limitNum;
      
      // 构建WHERE条件
      let whereConditions = [];
      let params = [];
      
      if (status) {
        whereConditions.push('p.payment_status = ?');
        params.push(status);
      }
      
      if (payment_method) {
        whereConditions.push('p.payment_method = ?');
        params.push(payment_method);
      }
      
      if (start_date) {
        whereConditions.push('DATE(p.created_time) >= ?');
        params.push(start_date);
      }
      
      if (end_date) {
        whereConditions.push('DATE(p.created_time) <= ?');
        params.push(end_date);
      }
      
      whereConditions.push('p.is_deleted = 0');
      
      const whereClause = whereConditions.length > 0 
        ? 'WHERE ' + whereConditions.join(' AND ') 
        : '';
      
      // 查询支付记录列表
      const [payments] = await pool.execute(
        `SELECT p.*, o.order_no, o.employer_id, o.provider_id,
                e.username as employer_name, 
                pr.username as provider_name
         FROM payment p 
         JOIN \`order\` o ON p.order_id = o.order_id
         LEFT JOIN user e ON o.employer_id = e.user_id
         LEFT JOIN user pr ON o.provider_id = pr.user_id
         ${whereClause}
         ORDER BY p.created_time DESC 
         LIMIT ? OFFSET ?`,
        [...params, limitNum, offset]
      );
      
      // 查询总数
      const [countResult] = await pool.execute(
        `SELECT COUNT(*) as total FROM payment p ${whereClause}`,
        params
      );
      
      // 格式化返回数据
      const formattedPayments = payments.map(payment => {
        // 添加状态名称
        const statusMap = {
          0: '待支付',
          1: '支付成功',
          2: '支付取消',
          3: '已退款',
          4: '支付失败'
        };
        
        return {
          ...payment,
          payment_status_name: statusMap[payment.payment_status] || '未知状态'
        };
      });
      
      res.json(
        responseHelper.success({
          payments: formattedPayments,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: countResult[0].total,
            pages: Math.ceil(countResult[0].total / limitNum)
          }
        }, '获取支付记录成功')
      );
      
    } catch (error) {
      console.error('获取支付记录错误:', error);
      res.status(500).json(
        responseHelper.error(error.message)
      );
    }
  }
};

// 导出支付控制器对象，使其可以被其他文件引用
module.exports = paymentController;