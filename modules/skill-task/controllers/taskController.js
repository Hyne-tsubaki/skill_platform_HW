/**
 * 任务模块控制器（最终修复版）
 * 路径：modules/skill-task/controllers/taskController.js
 */
// ✅ 修复1：替换为项目统一响应工具（向上3级到根目录middleware）
const ResponseHelper = require('../../../middleware/responseHelper');
// ✅ 修复2：db-proc路径（向上3级到根目录utils）
const { callProcedure } = require('../../../utils/db-proc');
// ✅ 修复3：sequelize路径（向上3级到根目录config）
const sequelize = require('../../../config/database');
const { QueryTypes } = require('sequelize');

// 适配旧的 sendResponse 方法（避免大面积修改业务代码）
const sendResponse = (res, code, message, data = null) => {
  // 映射状态码到统一响应方法
  if (code === 200) {
    return ResponseHelper.send.success(res, data, message);
  } else if (code === 400) {
    return ResponseHelper.send.error(res, message, 400);
  } else if (code === 404) {
    return ResponseHelper.send.notFound(res, message);
  } else if (code === 500) {
    return ResponseHelper.send.serverError(res, message);
  } else {
    return ResponseHelper.send.custom(res, code >= 200 && code < 300, code, message, data);
  }
};

// 发布任务（调用publish_task存储过程）
exports.publishTask = async (req, res) => {
  try {
    const { title, description, skill_id, publisher_id, budget, deadline } = req.body;
    
    // 入参校验（补充，避免空值调用存储过程）
    if (!title || !description || !skill_id || !publisher_id || !budget) {
      return sendResponse(res, 400, '标题、描述、技能ID、发布者ID、预算为必填项');
    }
    
    // 调用存储过程
    const [result] = await callProcedure('publish_task', [
      title,
      description,
      skill_id,
      publisher_id,
      budget,
      deadline || null, // 处理deadline为空的情况
      null // OUT参数p_task_id占位符
    ]);
    
    // ✅ 修复OUT参数取值（兼容多层结果集）
    const taskId = result?.[0]?.[0]?.p_task_id || null;
    if (!taskId) throw new Error('任务发布成功，但未生成任务ID');
    
    sendResponse(res, 200, '任务发布成功', { id: taskId });
  } catch (error) {
    console.error('发布任务失败：', error);
    // 捕获存储过程自定义错误（如技能不存在）
    const errMsg = error.message.includes('45000') ? error.message : '服务器内部错误';
    sendResponse(res, 500, errMsg);
  }
};

// 任务接单（调用accept_task存储过程）
exports.acceptTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { receiver_id } = req.body;
    
    if (!receiver_id) {
      return sendResponse(res, 400, '接单者ID为必填项');
    }
    
    // 调用存储过程
    const [result] = await callProcedure('accept_task', [
      id,
      receiver_id,
      null // OUT参数p_result占位符
    ]);
    
    // ✅ 修复OUT参数取值
    const acceptResult = result?.[0]?.[0]?.p_result || 0;
    if (acceptResult === 1) {
      sendResponse(res, 200, '接单成功');
    } else {
      sendResponse(res, 400, '任务已被接单/不存在，无法重复操作');
    }
  } catch (error) {
    console.error('接单失败：', error);
    sendResponse(res, 500, error.message || '服务器内部错误');
  }
};

// 确认任务完成（调用confirm_task_complete存储过程）
exports.confirmTaskComplete = async (req, res) => {
  try {
    const { id } = req.params;
    const { publisher_id } = req.body;
    
    if (!publisher_id) {
      return sendResponse(res, 400, '发布者ID为必填项');
    }
    
    // 调用存储过程
    const [result] = await callProcedure('confirm_task_complete', [
      id,
      publisher_id,
      null // OUT参数p_result占位符
    ]);
    
    // ✅ 修复OUT参数取值
    const confirmResult = result?.[0]?.[0]?.p_result || 0;
    if (confirmResult === 1) {
      sendResponse(res, 200, '任务确认完成成功');
    } else {
      sendResponse(res, 400, '任务不存在/无权限确认/非接单状态');
    }
  } catch (error) {
    console.error('确认任务完成失败：', error);
    sendResponse(res, 500, error.message || '服务器内部错误');
  }
};

// 获取任务列表（原生SQL，兼容分页+多条件筛选）
exports.getTaskList = async (req, res) => {
  try {
    const {
      keyword = '',
      skill_id = 0,
      status = -1,
      publisher_id = 0,
      receiver_id = 0,
      page = 1,
      page_size = 10
    } = req.query;
    
    // 构建WHERE条件（防SQL注入，仅用参数替换）
    let whereClause = '1=1';
    const replacements = [];
    
    if (keyword) {
      whereClause += ' AND (t.title LIKE ? OR t.description LIKE ?)';
      replacements.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (skill_id > 0) {
      whereClause += ' AND t.skill_id = ?';
      replacements.push(skill_id);
    }
    if (status >= 0) {
      whereClause += ' AND t.status = ?';
      replacements.push(status);
    }
    if (publisher_id > 0) {
      whereClause += ' AND t.publisher_id = ?';
      replacements.push(publisher_id);
    }
    if (receiver_id > 0) {
      whereClause += ' AND t.receiver_id = ?';
      replacements.push(receiver_id);
    }
    
    // 分页参数（防负数/非数字）
    const pageNum = Math.max(parseInt(page) || 1, 1);
    const pageSize = Math.max(parseInt(page_size) || 10, 1);
    const offset = (pageNum - 1) * pageSize;
    replacements.push(offset, pageSize);
    
    // 查询列表
    const [taskList] = await sequelize.query(
      `SELECT t.*, s.name AS skill_name 
       FROM task t 
       LEFT JOIN skill s ON t.skill_id = s.id 
       WHERE ${whereClause} 
       ORDER BY t.created_at DESC 
       LIMIT ?, ?`,
      {
        replacements,
        type: QueryTypes.SELECT
      }
    );
    
    // 查询总数（移除分页参数）
    const [totalResult] = await sequelize.query(
      `SELECT COUNT(*) AS total 
       FROM task t 
       WHERE ${whereClause}`,
      {
        replacements: replacements.slice(0, -2),
        type: QueryTypes.SELECT
      }
    );
    const total = totalResult[0]?.total || 0;
    
    sendResponse(res, 200, '查询成功', {
      list: taskList,
      pagination: {
        total,
        page: pageNum,
        page_size: pageSize,
        total_pages: Math.ceil(total / pageSize)
      }
    });
  } catch (error) {
    console.error('查询任务失败：', error);
    sendResponse(res, 500, error.message || '服务器内部错误');
  }
};

// 【可选】补充任务详情接口（如需路由调用，需导出）
exports.getTaskDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const [task] = await sequelize.query(
      `SELECT t.*, s.name AS skill_name 
       FROM task t 
       LEFT JOIN skill s ON t.skill_id = s.id 
       WHERE t.id = ?`,
      {
        replacements: [id],
        type: QueryTypes.SELECT
      }
    );
    
    if (!task) {
      return sendResponse(res, 404, '任务不存在');
    }
    sendResponse(res, 200, '查询成功', task);
  } catch (error) {
    console.error('查询任务详情失败：', error);
    sendResponse(res, 500, error.message || '服务器内部错误');
  }
};