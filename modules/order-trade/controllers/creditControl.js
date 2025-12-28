// modules/order-trade/controllers/creditControl.js
const responseHelper = require('../../../middleware/responseHelper');

// 定义信誉等级常量
const CREDIT_LEVEL = {
  EXCELLENT: { min: 90, name: '优秀' },
  GOOD: { min: 80, name: '良好' },
  AVERAGE: { min: 70, name: '一般' },
  POOR: { min: 60, name: '较差' },
  BAD: { min: 0, name: '差' }
};

// 延迟获取连接池的函数
function getPool() {
  const { pool } = require('../../../config/database');
  if (!pool) {
    throw new Error('数据库连接池未初始化');
  }
  return pool;
}

const creditController = {
  // 获取用户信誉信息
  getUserCredit: async (req, res) => {
    try {
      const pool = getPool();
      const userId = parseInt(req.params.userId);
      
      if (!userId || isNaN(userId)) {
        return responseHelper.send.error(res, '用户ID无效', 400);
      }
      
      // ✅ 使用简单的查询，避免复杂 JOIN
      const [userRows] = await pool.query('SELECT username FROM user WHERE user_id = ?', [userId]);
      
      if (userRows.length === 0) {
        return responseHelper.send.notFound(res, '用户不存在');
      }
      
      const [creditRows] = await pool.query('SELECT * FROM user_credit WHERE user_id = ?', [userId]);
      
      let creditData;
      if (creditRows.length === 0) {
        // 创建默认信誉记录
        await pool.query(
          `INSERT INTO user_credit (user_id, credit_score, total_orders, completed_orders) 
           VALUES (?, 80.0, 0, 0)`,
          [userId]
        );
        
        const [newRows] = await pool.query('SELECT * FROM user_credit WHERE user_id = ?', [userId]);
        creditData = newRows[0];
      } else {
        creditData = creditRows[0];
      }
      
      // 添加额外信息
      const result = {
        ...creditData,
        username: userRows[0].username,
        credit_level: calculateCreditLevel(parseFloat(creditData.credit_score) || 80.0)
      };
      
      responseHelper.send.success(res, result, '获取用户信誉成功');
      
    } catch (error) {
      console.error('获取用户信誉错误:', error.message);
      responseHelper.send.error(res, error.message, 500);
    }
  },

  // 获取信誉排名 - 使用原生查询避免预处理语句问题
  getCreditRanking: async (req, res) => {
    try {
      const pool = getPool();
      const { 
        limit = 10, 
        page = 1, 
        min_orders = 0,
        min_score = 0 
      } = req.query;
      
      // 参数处理
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
      const pageNum = Math.max(1, parseInt(page) || 1);
      const offset = (pageNum - 1) * limitNum;
      const minOrders = Math.max(0, parseInt(min_orders) || 0);
      const minScore = Math.max(0, parseFloat(min_score) || 0);
      
      console.log('查询参数:', { limitNum, pageNum, offset, minOrders, minScore });
      
      // ✅ 方案1: 使用原生 SQL 查询（避免预处理语句）
      // 注意：这种方法有SQL注入风险，但参数经过验证是安全的
      const sql = `
        SELECT uc.*, u.username
        FROM user_credit uc
        LEFT JOIN user u ON uc.user_id = u.user_id
        WHERE uc.total_orders >= ${minOrders} 
          AND uc.credit_score >= ${minScore}
        ORDER BY uc.credit_score DESC, uc.completed_orders DESC
        LIMIT ${limitNum} OFFSET ${offset}
      `;
      
      console.log('执行的SQL:', sql);
      
      // 使用 pool.query 而不是 pool.execute
      const [ranking] = await pool.query(sql);
      
      // 查询总数
      const countSql = `
        SELECT COUNT(*) as total 
        FROM user_credit 
        WHERE total_orders >= ${minOrders} AND credit_score >= ${minScore}
      `;
      const [countResult] = await pool.query(countSql);
      
      const total = countResult[0].total;
      
      // 添加信誉等级和排名
      const rankingWithLevel = ranking.map((user, index) => ({
        ...user,
        credit_level: calculateCreditLevel(parseFloat(user.credit_score) || 0),
        rank: offset + index + 1
      }));
      
      responseHelper.send.success(res, {
        ranking: rankingWithLevel,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: total,
          pages: Math.ceil(total / limitNum)
        },
        filters: {
          min_orders: minOrders,
          min_score: minScore
        }
      }, '获取信誉排名成功');
      
    } catch (error) {
      console.error('信誉排名查询错误详情:', {
        message: error.message,
        code: error.code,
        sqlState: error.sqlState,
        sqlMessage: error.sqlMessage
      });
      
      responseHelper.send.error(res, '查询失败: ' + error.message, 500);
    }
  },

  // 使用存储过程来避免参数问题（如果上述方法不行）
  getCreditRankingUsingSP: async (req, res) => {
    try {
      const pool = getPool();
      const { 
        limit = 10, 
        page = 1, 
        min_orders = 0,
        min_score = 0 
      } = req.query;
      
      // 参数处理
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
      const pageNum = Math.max(1, parseInt(page) || 1);
      const offset = (pageNum - 1) * limitNum;
      const minOrders = Math.max(0, parseInt(min_orders) || 0);
      const minScore = Math.max(0, parseFloat(min_score) || 0);
      
      // ✅ 方案2: 调用存储过程
      // 首先需要创建存储过程
      const [result] = await pool.query(
        'CALL sp_get_credit_ranking(?, ?, ?, ?, @total)',
        [minOrders, minScore, limitNum, offset]
      );
      
      const [ranking] = result;
      
      // 获取总数
      const [totalResult] = await pool.query('SELECT @total as total');
      const total = totalResult[0].total;
      
      const rankingWithLevel = ranking.map((user, index) => ({
        ...user,
        credit_level: calculateCreditLevel(parseFloat(user.credit_score) || 0),
        rank: offset + index + 1
      }));
      
      responseHelper.send.success(res, {
        ranking: rankingWithLevel,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: total,
          pages: Math.ceil(total / limitNum)
        },
        filters: {
          min_orders: minOrders,
          min_score: minScore
        }
      }, '获取信誉排名成功');
      
    } catch (error) {
      console.error('存储过程查询错误:', error.message);
      responseHelper.send.error(res, '查询失败: ' + error.message, 500);
    }
  },

  // 更新用户信誉评分
  updateUserCredit: async (req, res) => {
    try {
      const pool = getPool();
      const userId = parseInt(req.params.userId);
      const { 
        order_completed = false, 
        positive_review = false, 
        negative_review = false,
        cancel_penalty = false 
      } = req.body;
      
      if (!userId || isNaN(userId)) {
        return responseHelper.send.error(res, '用户ID无效', 400);
      }
      
      // 获取当前信誉信息
      const [currentCredit] = await pool.query(
        'SELECT * FROM user_credit WHERE user_id = ?',
        [userId]
      );
      
      if (currentCredit.length === 0) {
        return responseHelper.send.notFound(res, '用户信誉记录不存在');
      }
      
      const credit = currentCredit[0];
      let newScore = parseFloat(credit.credit_score) || 80.0;
      let updates = [];
      let params = [];
      
      if (order_completed) {
        updates.push('total_orders = total_orders + 1', 'completed_orders = completed_orders + 1');
        newScore += 2;
      }
      
      if (positive_review) {
        updates.push('positive_reviews = positive_reviews + 1');
        newScore += 3;
      }
      
      if (negative_review) {
        updates.push('negative_reviews = negative_reviews + 1');
        newScore -= 5;
      }
      
      if (cancel_penalty) {
        newScore -= 3;
      }
      
      // 确保分数在0-100之间
      newScore = Math.max(0, Math.min(100, newScore));
      newScore = parseFloat(newScore.toFixed(1));
      
      updates.push('credit_score = ?', 'updated_at = NOW()');
      params.push(newScore, userId);
      
      const sql = `UPDATE user_credit SET ${updates.join(', ')} WHERE user_id = ?`;
      
      await pool.query(sql, params);
      
      responseHelper.send.success(res, {
        user_id: userId,
        new_credit_score: newScore,
        credit_level: calculateCreditLevel(newScore)
      }, '用户信誉更新成功');
      
    } catch (error) {
      console.error('更新信誉错误:', error.message);
      responseHelper.send.error(res, '更新失败: ' + error.message, 500);
    }
  },

  // 获取信誉统计数据
  getCreditStats: async (req, res) => {
    try {
      const pool = getPool();
      
      const [totalUsers] = await pool.query('SELECT COUNT(*) as count FROM user_credit');
      const [activeUsers] = await pool.query('SELECT COUNT(*) as count FROM user_credit WHERE total_orders > 0');
      const [averageScore] = await pool.query('SELECT AVG(credit_score) as avg_score FROM user_credit WHERE total_orders > 0');
      
      const [scoreDistribution] = await pool.query(`
        SELECT 
          COUNT(CASE WHEN credit_score >= 90 THEN 1 END) as excellent,
          COUNT(CASE WHEN credit_score >= 80 AND credit_score < 90 THEN 1 END) as good,
          COUNT(CASE WHEN credit_score >= 70 AND credit_score < 80 THEN 1 END) as average,
          COUNT(CASE WHEN credit_score >= 60 AND credit_score < 70 THEN 1 END) as poor,
          COUNT(CASE WHEN credit_score < 60 THEN 1 END) as bad
        FROM user_credit WHERE total_orders > 0
      `);
      
      const stats = {
        total_users: totalUsers[0].count,
        active_users: activeUsers[0].count,
        average_score: parseFloat(averageScore[0].avg_score || 0).toFixed(2),
        score_distribution: scoreDistribution[0]
      };
      
      responseHelper.send.success(res, stats, '获取信誉统计数据成功');
      
    } catch (error) {
      console.error('获取统计错误:', error.message);
      responseHelper.send.error(res, '获取统计失败: ' + error.message, 500);
    }
  }
};

// 辅助函数：计算信誉等级
function calculateCreditLevel(score) {
  if (score >= CREDIT_LEVEL.EXCELLENT.min) {
    return {
      level: 'excellent',
      name: CREDIT_LEVEL.EXCELLENT.name,
      color: '#52c41a'
    };
  } else if (score >= CREDIT_LEVEL.GOOD.min) {
    return {
      level: 'good',
      name: CREDIT_LEVEL.GOOD.name,
      color: '#1890ff'
    };
  } else if (score >= CREDIT_LEVEL.AVERAGE.min) {
    return {
      level: 'average',
      name: CREDIT_LEVEL.AVERAGE.name,
      color: '#faad14'
    };
  } else if (score >= CREDIT_LEVEL.POOR.min) {
    return {
      level: 'poor',
      name: CREDIT_LEVEL.POOR.name,
      color: '#fa8c16'
    };
  } else {
    return {
      level: 'bad',
      name: CREDIT_LEVEL.BAD.name,
      color: '#f5222d'
    };
  }
}

module.exports = creditController;