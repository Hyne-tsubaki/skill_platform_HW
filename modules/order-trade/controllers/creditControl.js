//用户信誉评级业务逻辑

// ✅ 修复1：数据库连接池路径（向上3级）
// ✅ 修复2：日志模块路径（向上3级，若不存在可注释）
const responseHelper = require('../../../middleware/responseHelper');
// const { appLogger, errorLogger } = require('../../../utils/logger/applog'); // 日志路径修复（若不存在可注释）

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
  const { pool } = require('../../../config/database'); // ✅ 修复：数据库路径向上3级
  if (!pool) {
    throw new Error('数据库连接池未初始化，请先调用 initializeDatabase()');
  }
  return pool;
}

const creditController = {
  // 获取用户信誉信息
  // 获取用户信誉信息
getUserCredit: async (req, res) => {
  try {
    const pool = getPool();
    const userId = req.params.userId;
    
    if (!userId || isNaN(userId)) {
      return responseHelper.send.error(res, '用户ID无效', 400);
    }
    
    const [credits] = await pool.execute(
      `SELECT uc.*, u.username
       FROM user_credit uc
       LEFT JOIN user u ON uc.user_id = u.user_id
       WHERE uc.user_id = ?`,
      [userId]
    );
    
    if (credits.length === 0) {
      // 检查用户是否存在
      const [users] = await pool.execute(
        'SELECT user_id FROM user WHERE user_id = ?',
        [userId]
      );
      
      if (users.length === 0) {
        return responseHelper.send.notFound(res, '用户不存在');
      }

      // 如果用户存在但信誉记录不存在，创建默认记录
      // ✅ 修复：确保参数类型正确
      await pool.execute(
        `INSERT INTO user_credit 
         (user_id, credit_score, total_orders, completed_orders, positive_reviews, negative_reviews) 
         VALUES (?, 80.0, 0, 0, 0, 0)`,
        [parseInt(userId)]  // 确保是整数
      );
      
      // 重新查询新创建的信誉记录
      const [newCredits] = await pool.execute(
        'SELECT * FROM user_credit WHERE user_id = ?',
        [userId]
      );
      
      const creditWithLevel = {
        ...newCredits[0],
        credit_level: calculateCreditLevel(parseFloat(newCredits[0].credit_score))
      };
      
      return responseHelper.send.success(res, creditWithLevel, '获取用户信誉成功');
    }
    
    // 添加信誉等级信息
    const creditWithLevel = {
      ...credits[0],
      credit_level: calculateCreditLevel(parseFloat(credits[0].credit_score))
    };
    
    responseHelper.send.success(res, creditWithLevel, '获取用户信誉成功');
    
  } catch (error) {
    console.error('获取用户信誉时出错详情:', {
      message: error.message,
      code: error.code,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage
    });
    
    let statusCode = 500;
    let errorMessage = error.message;
    
    if (error.code === 'ER_NO_REFERENCED_ROW') {
      statusCode = 404;
      errorMessage = '用户不存在';
    }
    
    responseHelper.send.error(res, errorMessage, statusCode);
  }
},

  // 获取信誉排名
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
    const limitNum = parseInt(limit) || 10;
    const pageNum = parseInt(page) || 1;
    const offset = (pageNum - 1) * limitNum;
    const minOrders = parseInt(min_orders) || 0;
    let minScore = parseFloat(min_score);
    if (isNaN(minScore)) minScore = 0;
    
    // ✅ 添加详细的参数输出
    console.log('================= DEBUG START =================');
    console.log('原始查询参数:', req.query);
    console.log('转换后参数:');
    console.log('  limitNum:', limitNum, '类型:', typeof limitNum);
    console.log('  pageNum:', pageNum, '类型:', typeof pageNum);
    console.log('  offset:', offset, '类型:', typeof offset);
    console.log('  minOrders:', minOrders, '类型:', typeof minOrders);
    console.log('  minScore:', minScore, '类型:', typeof minScore);
    
    // ✅ 测试数据库连接和简单查询
    console.log('测试数据库连接...');
    const [testResult] = await pool.execute('SELECT 1 as test');
    console.log('数据库连接测试成功:', testResult);
    
    // ✅ 先执行一个简单的查询测试
    console.log('执行简单查询测试...');
    const [simpleQuery] = await pool.execute(
      'SELECT user_id, credit_score FROM user_credit LIMIT ?',
      [5]
    );
    console.log('简单查询结果:', simpleQuery);
    
    // ✅ 逐步构建复杂查询
    console.log('执行第一步：只使用 WHERE 条件...');
    const [step1] = await pool.execute(
      `SELECT uc.*, u.username
       FROM user_credit uc
       LEFT JOIN user u ON uc.user_id = u.user_id
       WHERE uc.total_orders >= ? AND uc.credit_score >= ?
       LIMIT 5`,
      [minOrders, minScore]
    );
    console.log('第一步结果:', step1);
    
    // ✅ 执行完整查询
    console.log('执行完整查询...');
    const [ranking] = await pool.execute(
      `SELECT uc.*, u.username
       FROM user_credit uc
       LEFT JOIN user u ON uc.user_id = u.user_id
       WHERE uc.total_orders >= ? AND uc.credit_score >= ?
       ORDER BY uc.credit_score DESC, uc.completed_orders DESC
       LIMIT ? OFFSET ?`,
      [minOrders, minScore, limitNum, offset]
    );
    
    console.log('查询成功，结果数量:', ranking.length);
    console.log('================= DEBUG END =================');
    
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total 
       FROM user_credit 
       WHERE total_orders >= ? AND credit_score >= ?`,
      [minOrders, minScore]
    );
    
    const total = countResult[0].total;
    
    const rankingWithLevel = ranking.map((user, index) => ({
      ...user,
      credit_level: calculateCreditLevel(parseFloat(user.credit_score)),
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
    console.error('================= ERROR DETAILS =================');
    console.error('错误消息:', error.message);
    console.error('错误代码:', error.code);
    console.error('SQL状态:', error.sqlState);
    console.error('SQL消息:', error.sqlMessage);
    console.error('SQL语句:', error.sql);
    console.error('错误堆栈:', error.stack);
    console.error('================= ERROR END =================');
    
    // 尝试修复参数类型问题
    if (error.code === 'ER_WRONG_ARGUMENTS') {
      // 重新尝试查询，确保参数类型正确
      try {
        console.log('尝试使用字符串参数重新查询...');
        const pool = getPool();
        const { limit = 10, page = 1, min_orders = 0, min_score = 0 } = req.query;
        
        const limitNum = parseInt(limit) || 10;
        const pageNum = parseInt(page) || 1;
        const offset = (pageNum - 1) * limitNum;
        const minOrders = parseInt(min_orders) || 0;
        let minScore = parseFloat(min_score);
        if (isNaN(minScore)) minScore = 0;
        
        // 将所有参数转换为字符串
        const [ranking] = await pool.execute(
          `SELECT uc.*, u.username
           FROM user_credit uc
           LEFT JOIN user u ON uc.user_id = u.user_id
           WHERE uc.total_orders >= ? AND uc.credit_score >= ?
           ORDER BY uc.credit_score DESC, uc.completed_orders DESC
           LIMIT ? OFFSET ?`,
          [
            minOrders.toString(),
            minScore.toString(),
            limitNum.toString(),
            offset.toString()
          ]
        );
        
        // ... 处理结果
        
      } catch (retryError) {
        console.error('重试也失败:', retryError.message);
        responseHelper.send.error(res, '数据库查询参数错误', 500);
      }
    } else {
      responseHelper.send.error(res, error.message, 500);
    }
  }
},


  // 新增：更新用户信誉评分（通常在订单完成或评价后调用）
  updateUserCredit: async (req, res) => {
    // const logContext = {
    //   operation: 'updateUserCredit',
    //   userId: req.params.userId,
    //   updateData: req.body
    // };

    try {
      const pool = getPool();
      const userId = req.params.userId;
      const { 
        order_completed = false, 
        positive_review = false, 
        negative_review = false,
        cancel_penalty = false 
      } = req.body;
      
      // 验证用户ID
      if (!userId || isNaN(userId)) {
        // appLogger?.warn('VALIDATION_FAILED', { ...logContext, reason: '用户ID无效' });
        return responseHelper.send.error(res, '用户ID无效', 400);
      }

      // appLogger?.info('UPDATE_USER_CREDIT_START', logContext);
      
      // 先获取当前信誉信息
      const [currentCredit] = await pool.execute(
        'SELECT * FROM user_credit WHERE user_id = ?',
        [userId]
      );
      
      if (currentCredit.length === 0) {
        // appLogger?.warn('CREDIT_RECORD_NOT_FOUND', logContext);
        return responseHelper.send.notFound(res, '用户信誉记录不存在');
      }
      
      const credit = currentCredit[0];
      let newScore = credit.credit_score;
      let updateFields = {};
      
      // 根据不同的行为更新信誉分
      if (order_completed) {
        updateFields.total_orders = credit.total_orders + 1;
        updateFields.completed_orders = credit.completed_orders + 1;
        newScore += 2; // 完成订单加2分
      }
      
      if (positive_review) {
        updateFields.positive_reviews = credit.positive_reviews + 1;
        newScore += 3; // 好评加3分
      }
      
      if (negative_review) {
        updateFields.negative_reviews = credit.negative_reviews + 1;
        newScore -= 5; // 差评减5分
      }
      
      if (cancel_penalty) {
        newScore -= 3; // 取消订单罚3分
      }
      
      // 确保分数在0-100之间
      newScore = Math.max(0, Math.min(100, newScore));
      updateFields.credit_score = newScore;
      updateFields.updated_at = new Date();
      
      // 构建动态更新SQL
      const setClause = Object.keys(updateFields)
        .map(key => `${key} = ?`)
        .join(', ');
      
      const values = [...Object.values(updateFields), userId];
      
      // 更新信誉记录
      await pool.execute(
        `UPDATE user_credit SET ${setClause} WHERE user_id = ?`,
        values
      );
      
      // appLogger?.info('USER_CREDIT_UPDATED', { ...logContext, oldScore: credit.credit_score, newScore: newScore, changes: updateFields });
      
      responseHelper.send.success(res, {
        user_id: parseInt(userId),
        new_credit_score: newScore,
        credit_level: calculateCreditLevel(newScore)
      }, '用户信誉更新成功');
      
    } catch (error) {
      // errorLogger?.error('UPDATE_USER_CREDIT_FAILED', {
      //   ...logContext,
      //   errorMessage: error.message,
      //   errorCode: error.code,
      //   errorStack: error.stack
      // });
      
      responseHelper.send.serverError(res, error.message);
    }
  },

  // 新增：获取信誉统计数据
  getCreditStats: async (req, res) => {
    // const logContext = {
    //   operation: 'getCreditStats'
    // };

    try {
      const pool = getPool(); // ✅ 修复：新增pool获取（原代码缺失）
      // appLogger?.info('GET_CREDIT_STATS_START', logContext);
      
      // 获取各种统计信息
      const [totalUsers] = await pool.execute(
        'SELECT COUNT(*) as count FROM user_credit'
      );
      
      const [activeUsers] = await pool.execute(
        'SELECT COUNT(*) as count FROM user_credit WHERE total_orders > 0'
      );
      
      const [averageScore] = await pool.execute(
        'SELECT AVG(credit_score) as avg_score FROM user_credit WHERE total_orders > 0'
      );
      
      const [scoreDistribution] = await pool.execute(
        `SELECT 
          COUNT(CASE WHEN credit_score >= 90 THEN 1 END) as excellent,
          COUNT(CASE WHEN credit_score >= 80 AND credit_score < 90 THEN 1 END) as good,
          COUNT(CASE WHEN credit_score >= 70 AND credit_score < 80 THEN 1 END) as average,
          COUNT(CASE WHEN credit_score >= 60 AND credit_score < 70 THEN 1 END) as poor,
          COUNT(CASE WHEN credit_score < 60 THEN 1 END) as bad
         FROM user_credit WHERE total_orders > 0`
      );
      
      const stats = {
        total_users: totalUsers[0].count,
        active_users: activeUsers[0].count,
        average_score: parseFloat(averageScore[0].avg_score || 0).toFixed(2),
        score_distribution: scoreDistribution[0]
      };
      
      // appLogger?.info('GET_CREDIT_STATS_SUCCESS', logContext);
      
      responseHelper.send.success(res, stats, '获取信誉统计数据成功');
      
    } catch (error) {
      // errorLogger?.error('GET_CREDIT_STATS_FAILED', {
      //   ...logContext,
      //   errorMessage: error.message,
      //   errorCode: error.code,
      //   errorStack: error.stack
      // });
      
      responseHelper.send.serverError(res, error.message);
    }
  }
};

// 辅助函数：计算信誉等级
function calculateCreditLevel(score) {
  if (score >= CREDIT_LEVEL.EXCELLENT.min) {
    return {
      level: 'excellent',
      name: CREDIT_LEVEL.EXCELLENT.name,
      color: '#52c41a' // 绿色
    };
  } else if (score >= CREDIT_LEVEL.GOOD.min) {
    return {
      level: 'good',
      name: CREDIT_LEVEL.GOOD.name,
      color: '#1890ff' // 蓝色
    };
  } else if (score >= CREDIT_LEVEL.AVERAGE.min) {
    return {
      level: 'average',
      name: CREDIT_LEVEL.AVERAGE.name,
      color: '#faad14' // 橙色
    };
  } else if (score >= CREDIT_LEVEL.POOR.min) {
    return {
      level: 'poor',
      name: CREDIT_LEVEL.POOR.name,
      color: '#fa8c16' // 深橙色
    };
  } else {
    return {
      level: 'bad',
      name: CREDIT_LEVEL.BAD.name,
      color: '#f5222d' // 红色
    };
  }
}

// ✅ 修复4：导出名称错误（creditControlle → creditController）
module.exports = creditController;