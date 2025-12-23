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
  getUserCredit: async (req, res) => {
    // 日志模块若不存在可注释
    // const logContext = {
    //   operation: 'getUserCredit',
    //   userId: req.params.userId
    // };

    try {
      const pool = getPool();
      const userId = req.params.userId;
      
      // ✅ 修复3：responseHelper调用格式（适配send方法）
      if (!userId || isNaN(userId)) {
        // appLogger?.warn('VALIDATION_FAILED', { ...logContext, reason: '用户ID无效' });
        return responseHelper.send.error(res, '用户ID无效', 400);
      }

      // appLogger?.info('GET_USER_CREDIT_START', logContext);
      
      // 查询用户信誉信息，关联用户表获取用户名和头像
      const [credits] = await pool.execute(
        `SELECT uc.*, u.username, u.avatar
         FROM user_credit uc
         LEFT JOIN user u ON uc.user_id = u.user_id
         WHERE uc.user_id = ?`,
        [userId]
      );
      
      // 检查是否找到用户的信誉记录
      if (credits.length === 0) {
        // appLogger?.info('CREDIT_RECORD_NOT_FOUND', logContext);
        
        // 先检查用户是否存在
        const [users] = await pool.execute(
          'SELECT user_id FROM user WHERE user_id = ?',
          [userId]
        );
        
        if (users.length === 0) {
          // appLogger?.warn('USER_NOT_FOUND', logContext);
          return responseHelper.send.notFound(res, '用户不存在');
        }

        // 如果用户存在但信誉记录不存在，创建默认记录
        // appLogger?.info('CREATING_DEFAULT_CREDIT_RECORD', logContext);
        
        await pool.execute(
          `INSERT INTO user_credit 
           (user_id, credit_score, total_orders, completed_orders, positive_reviews, negative_reviews) 
           VALUES (?, 80, 0, 0, 0, 0)`, // 默认信誉分80
          [userId]
        );
        
        // 重新查询新创建的信誉记录
        const [newCredits] = await pool.execute(
          'SELECT * FROM user_credit WHERE user_id = ?',
          [userId]
        );
        
        // appLogger?.info('CREDIT_RECORD_CREATED', { ...logContext, creditId: newCredits[0]?.credit_id });
        
        // 添加信誉等级信息
        const creditWithLevel = {
          ...newCredits[0],
          credit_level: calculateCreditLevel(newCredits[0].credit_score)
        };
        
        return responseHelper.send.success(res, creditWithLevel, '获取用户信誉成功');
      }
      
      // 添加信誉等级信息
      const creditWithLevel = {
        ...credits[0],
        credit_level: calculateCreditLevel(credits[0].credit_score)
      };
      
      // appLogger?.info('GET_USER_CREDIT_SUCCESS', logContext);
      
      // 返回找到的用户信誉信息
      responseHelper.send.success(res, creditWithLevel, '获取用户信誉成功');
      
    } catch (error) {
      // errorLogger?.error('GET_USER_CREDIT_FAILED', {
      //   ...logContext,
      //   errorMessage: error.message,
      //   errorCode: error.code,
      //   errorStack: error.stack
      // });
      
      let statusCode = 500;
      let errorMessage = error.message;
      
      // 处理特定的数据库错误
      if (error.code === 'ER_NO_REFERENCED_ROW') {
        statusCode = 404;
        errorMessage = '用户不存在';
      }
      
      responseHelper.send.error(res, errorMessage, statusCode);
    }
  },

  // 获取信誉排名
  getCreditRanking: async (req, res) => {
    // const logContext = {
    //   operation: 'getCreditRanking',
    //   queryParams: req.query
    // };

    try {
      const pool = getPool(); // ✅ 修复：新增pool获取（原代码缺失）
      // 从查询参数获取分页信息和过滤条件
      const { 
        limit = 10, 
        page = 1, 
        min_orders = 0,
        min_score = 0 
      } = req.query;
      
      // 安全的分页参数处理
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
      const pageNum = Math.max(1, parseInt(page) || 1);
      const offset = (pageNum - 1) * limitNum;
      const minOrders = Math.max(0, parseInt(min_orders) || 0);
      const minScore = Math.max(0, Math.min(100, parseInt(min_score) || 0));
      
      // appLogger?.info('GET_CREDIT_RANKING_START', { ...logContext, processedParams: { limitNum, pageNum, minOrders, minScore } });
      
      // 查询信誉排名数据
      const [ranking] = await pool.execute(
        `SELECT uc.*, u.username, u.avatar
         FROM user_credit uc
         LEFT JOIN user u ON uc.user_id = u.user_id
         WHERE uc.total_orders >= ? AND uc.credit_score >= ?
         ORDER BY uc.credit_score DESC, uc.completed_orders DESC
         LIMIT ? OFFSET ?`,
        [minOrders, minScore, limitNum, offset]
      );
      
      // 查询总数用于完整分页
      const [countResult] = await pool.execute(
        `SELECT COUNT(*) as total 
         FROM user_credit 
         WHERE total_orders >= ? AND credit_score >= ?`,
        [minOrders, minScore]
      );
      
      // 为每个用户添加信誉等级
      const rankingWithLevel = ranking.map((user, index) => ({
        ...user,
        credit_level: calculateCreditLevel(user.credit_score),
        rank: index + 1 + offset // 计算实际排名（修复indexOf性能问题）
      }));
      
      // appLogger?.info('GET_CREDIT_RANKING_SUCCESS', { ...logContext, totalUsers: countResult[0].total, returnedUsers: ranking.length });
      
      responseHelper.send.success(res, {
        ranking: rankingWithLevel,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: countResult[0].total,
          pages: Math.ceil(countResult[0].total / limitNum)
        },
        filters: {
          min_orders: minOrders,
          min_score: minScore
        }
      }, '获取信誉排名成功');
      
    } catch (error) {
      // errorLogger?.error('GET_CREDIT_RANKING_FAILED', {
      //   ...logContext,
      //   errorMessage: error.message,
      //   errorCode: error.code,
      //   errorStack: error.stack
      // });
      
      responseHelper.send.serverError(res, error.message);
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
      updateFields.updated_time = new Date();
      
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