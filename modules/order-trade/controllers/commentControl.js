/**
 * 评论控制器（全功能版，包含所有缺失方法）
 * 路径：D:\Desktop\skill-platform-total\modules\order-trade\controllers\commentControl.js
 */
const responseHelper = require('../../../middleware/responseHelper');

// 延迟获取数据库连接池
function getPool() {
  const { pool } = require('../../../config/database');
  if (!pool) {
    throw new Error('数据库连接池未初始化，请先调用 initializeDatabase()');
  }
  return pool;
}

// 定义评论控制器对象（包含所有路由需要的方法）
const commentController = {
  // 1. 创建评论
  createComment: async (req, res) => {
    try {
      const pool = getPool();
      const { order_id, user_id, content } = req.body;

      if (!order_id || !user_id || !content) {
        return responseHelper.send.error(res, '订单ID、用户ID、评论内容不能为空', 400);
      }

      const [result] = await pool.execute(
        `INSERT INTO comment (order_id, user_id, content, created_time, is_deleted) 
         VALUES (?, ?, ?, NOW(), 0)`,
        [order_id, user_id, content]
      );

      responseHelper.send.created(res, { comment_id: result.insertId }, '评论创建成功');
    } catch (error) {
      console.error('创建评论错误:', error);
      responseHelper.send.serverError(res, '创建评论失败');
    }
  },

  // 2. 获取评论列表
  getCommentList: async (req, res) => {
    try {
      const pool = getPool();
      const [comments] = await pool.execute(
        'SELECT * FROM comment WHERE is_deleted = 0 ORDER BY created_time DESC'
      );
      responseHelper.send.success(res, comments, '获取评论列表成功');
    } catch (error) {
      console.error('获取评论列表错误:', error);
      responseHelper.send.serverError(res, '获取评论列表失败');
    }
  },

  // 3. 获取评论详情
  getCommentById: async (req, res) => {
    try {
      const pool = getPool();
      const commentId = req.params.id;
      const [comments] = await pool.execute(
        'SELECT * FROM comment WHERE comment_id = ? AND is_deleted = 0',
        [commentId]
      );

      if (comments.length === 0) {
        return responseHelper.send.notFound(res, '评论不存在');
      }

      responseHelper.send.success(res, comments[0], '获取评论详情成功');
    } catch (error) {
      console.error('获取评论详情错误:', error);
      responseHelper.send.serverError(res, '获取评论详情失败');
    }
  },

  // 4. 更新评论
  updateComment: async (req, res) => {
    try {
      const pool = getPool();
      const commentId = req.params.id;
      const { content } = req.body;

      if (!content) {
        return responseHelper.send.error(res, '评论内容不能为空', 400);
      }

      const [result] = await pool.execute(
        'UPDATE comment SET content = ?, updated_time = NOW() WHERE comment_id = ? AND is_deleted = 0',
        [content, commentId]
      );

      if (result.affectedRows === 0) {
        return responseHelper.send.notFound(res, '评论不存在');
      }

      responseHelper.send.success(res, null, '评论更新成功');
    } catch (error) {
      console.error('更新评论错误:', error);
      responseHelper.send.serverError(res, '更新评论失败');
    }
  },

  // 5. 删除评论（软删除）
  deleteComment: async (req, res) => {
    try {
      const pool = getPool();
      const commentId = req.params.id;
      const [result] = await pool.execute(
        'UPDATE comment SET is_deleted = 1, updated_time = NOW() WHERE comment_id = ?',
        [commentId]
      );

      if (result.affectedRows === 0) {
        return responseHelper.send.notFound(res, '评论不存在');
      }

      responseHelper.send.success(res, null, '评论删除成功');
    } catch (error) {
      console.error('删除评论错误:', error);
      responseHelper.send.serverError(res, '删除评论失败');
    }
  },

  // 6. 回复评论（之前缺失的核心方法）
  replyComment: async (req, res) => {
    try {
      const pool = getPool();
      const commentId = req.params.id;
      const { user_id, content } = req.body;

      if (!user_id || !content) {
        return responseHelper.send.error(res, '用户ID、回复内容不能为空', 400);
      }

      // 检查原评论是否存在
      const [comment] = await pool.execute(
        'SELECT * FROM comment WHERE comment_id = ? AND is_deleted = 0',
        [commentId]
      );
      if (comment.length === 0) {
        return responseHelper.send.notFound(res, '评论不存在或已删除');
      }

      // 插入回复
      const [result] = await pool.execute(
        `INSERT INTO comment_reply (comment_id, user_id, content, created_time) 
         VALUES (?, ?, ?, NOW())`,
        [commentId, user_id, content]
      );

      responseHelper.send.created(res, {
        reply_id: result.insertId,
        comment_id: commentId
      }, '回复评论成功');
    } catch (error) {
      console.error('回复评论错误:', error);
      responseHelper.send.serverError(res, '回复评论失败');
    }
  },

  // 7. 根据订单ID获取评论
  getCommentsByOrderId: async (req, res) => {
    try {
      const pool = getPool();
      const orderId = req.params.orderId;
      const [comments] = await pool.execute(
        'SELECT * FROM comment WHERE order_id = ? AND is_deleted = 0',
        [orderId]
      );
      responseHelper.send.success(res, comments, '获取订单评论成功');
    } catch (error) {
      console.error('获取订单评论错误:', error);
      responseHelper.send.serverError(res, '获取订单评论失败');
    }
  },

  // 8. 根据用户ID获取评论
  getCommentsByUserId: async (req, res) => {
    try {
      const pool = getPool();
      const userId = req.params.userId;
      const [comments] = await pool.execute(
        'SELECT * FROM comment WHERE user_id = ? AND is_deleted = 0',
        [userId]
      );
      responseHelper.send.success(res, comments, '获取用户评论成功');
    } catch (error) {
      console.error('获取用户评论错误:', error);
      responseHelper.send.serverError(res, '获取用户评论失败');
    }
  }
};

// 必须导出控制器对象
module.exports = commentController;