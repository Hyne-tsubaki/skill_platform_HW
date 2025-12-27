const { query, callProcedure } = require('../../../config/database');
const ResponseHelper = require('../../../middleware/responseHelper.js');

// ========== 获取所有技能列表 ==========
exports.getAllSkills = async (req, res) => {
  try {
    const { page = 1, page_size = 10 } = req.query;
    const pageInt = parseInt(page) || 1;
    const pageSizeInt = parseInt(page_size) || 10;
    const offset = (pageInt - 1) * pageSizeInt;

    const skills = await query(
      `SELECT s.*, c.name AS category_name
       FROM skill s
       LEFT JOIN category c ON s.category_id = c.id
       LIMIT ? OFFSET ?`,
      [pageSizeInt, offset]
    );

    const totalResult = await query('SELECT COUNT(*) AS total FROM skill');
    const total = totalResult[0]?.total || 0;

    ResponseHelper.send.paginated(res, skills || [], {
      page: pageInt,
      limit: pageSizeInt,
      total: total,
      pages: Math.ceil(total / pageSizeInt)
    }, '技能列表查询成功');
  } catch (error) {
    console.error('❌ 获取技能列表失败：', error);
    ResponseHelper.send.serverError(res, `查询失败：${error.message}`);
  }
};

// modules/skill-task/controllers/skillController.js
exports.publishSkill = async (req, res) => {
  // 关键：这里需要获取原始的 connection 以执行非预处理SQL，并确保它在同一个连接上执行事务。
  // 假设你的 config/database.js 导出了 getConnection 方法。
  // 如果只有 `query`，稍后我们再调整。
  const { getConnection } = require('../../../config/database');
  let connection;
  
  try {
    const { name, description, category_id, user_id, price, tag_ids } = req.body;

    // 1. 基本验证
    if (!name || !category_id || !user_id) {
      return ResponseHelper.send.validationError(res, '技能名称、分类和发布者不能为空');
    }

    // 2. 【关键修改】获取一个专属的数据库连接，以便执行事务
    // 请确保你的 database.js 中有类似 `pool.getConnection()` 的方法
    // 如果没有，我将提供一个备用方案。
    const { pool } = require('../../../config/database');
    connection = await pool.getConnection();

    // 3. 使用这个连接开启事务（直接执行，不使用预处理占位符）
    await connection.query('START TRANSACTION');

    try {
      // 4. 插入技能主表（这里仍然可以使用预处理，因为它是标准的INSERT）
      const insertSkillSql = `
        INSERT INTO skill (name, description, category_id, user_id, price, status)
        VALUES (?, ?, ?, ?, ?, 1)
      `;
      const [skillResult] = await connection.query(insertSkillSql, [
        name,
        description || '',
        category_id,
        user_id,
        price || 0.00
      ]);

      const skillId = skillResult.insertId;

      if (!skillId) {
        throw new Error('插入技能记录失败，未获取到ID');
      }

      // 5. 处理标签（如果提供了 tag_ids）
      if (tag_ids && Array.isArray(tag_ids) && tag_ids.length > 0) {
        // 过滤、去重，并确保是有效的数字ID
        const validTagIds = [...new Set(tag_ids.filter(id => Number.isInteger(id) && id > 0))];
        
        if (validTagIds.length > 0) {
          // **安全构建 IN 查询的两种方法**：
          // 方法A（推荐）：使用多个 (?, ?) 占位符
          const valuePlaceholders = validTagIds.map(() => `(?, ?)`).join(', ');
          const insertTagsSql = `
            INSERT INTO skill_tag_relation (skill_id, tag_id)
            VALUES ${valuePlaceholders}
          `;
          // 准备参数数组：[skillId, tagId1, skillId, tagId2, ...]
          const tagParams = [];
          validTagIds.forEach(tagId => {
            tagParams.push(skillId, tagId);
          });
          await connection.query(insertTagsSql, tagParams);
        }
      }

      // 6. 提交事务
      await connection.query('COMMIT');
      
      console.log(`✅ 技能发布成功，ID: ${skillId}`);
      ResponseHelper.send.created(res, { id: skillId }, '技能发布成功');

    } catch (innerError) {
      // 7. 事务回滚
      await connection.query('ROLLBACK');
      // 将内部错误信息传递出去
      throw innerError;
    }

  } catch (error) {
    console.error('❌ 发布技能失败：', error);
    
    // 根据错误类型返回更友好的前端提示
    let userMessage = '发布失败，请稍后重试';
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      userMessage = '指定的分类或用户不存在，请检查ID是否正确';
    } else if (error.code === 'ER_DUP_ENTRY') {
      userMessage = '技能名称可能已存在';
    } else if (error.message.includes('插入技能记录失败')) {
      userMessage = '系统未能创建技能记录';
    }
    // 注意：这里使用外层的 `res` 参数
    ResponseHelper.send.serverError(res, `${userMessage}`);
  } finally {
    // 8. 【非常重要】无论成功与否，都要释放连接回连接池
    if (connection) {
      connection.release();
    }
  }
};

// ========== 修改技能 ==========
exports.updateSkill = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, category_id, price, status, tag_ids } = req.body;

    const tagIdsStr = tag_ids && Array.isArray(tag_ids) ? tag_ids.join(',') : null;

    const result = await callProcedure('update_skill', [
      id, name || '', description || '', category_id || 0, price || 0, status || 0, tagIdsStr, null
    ]);

    const updateResult = result?.[0]?.[0]?.p_result || 1;

    if (updateResult === 1) {
      ResponseHelper.send.updated(res, null, '技能修改成功');
    } else {
      ResponseHelper.send.error(res, '技能修改失败（技能不存在或参数错误）', 400, { skill_id: id });
    }
  } catch (error) {
    console.error('❌ 修改技能失败：', error);
    ResponseHelper.send.serverError(res, `修改失败：${error.message}`);
  }
};

// ========== 删除技能 ==========
exports.deleteSkill = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await callProcedure('delete_skill', [id, null]);
    const deleteResult = result?.[0]?.[0]?.p_result || 1;

    if (deleteResult === 1) {
      ResponseHelper.send.deleted(res, '技能删除成功');
    } else {
      ResponseHelper.send.businessError(res, '该技能关联了任务，无法删除', ResponseHelper.errorCodes.CONFLICT, { skill_id: id });
    }
  } catch (error) {
    console.error('❌ 删除技能失败：', error);
    ResponseHelper.send.serverError(res, `删除失败：${error.message}`);
  }
};

// ========== 搜索技能 ==========
exports.searchSkills = async (req, res) => {
  try {
    const { keyword = '', category_id = 0, tag_id = 0, min_price = null, max_price = null, page = 1, page_size = 10 } = req.query;

    const result = await callProcedure('search_skills', [
      keyword, parseInt(category_id) || 0, parseInt(tag_id) || 0,
      min_price ? parseFloat(min_price) : null,
      max_price ? parseFloat(max_price) : null,
      parseInt(page) || 1, parseInt(page_size) || 10
    ]);

    const skillList = result[0] || [];
    const total = result[1]?.[0]?.total || 0;

    ResponseHelper.send.paginated(res, skillList, {
      page: parseInt(page),
      limit: parseInt(page_size),
      total: total,
      pages: Math.ceil(total / page_size)
    }, '查询成功');
  } catch (error) {
    console.error('❌ 搜索技能失败：', error);
    ResponseHelper.send.serverError(res, `搜索失败：${error.message}`);
  }
};

// ========== 获取技能详情 ==========
exports.getSkillDetail = async (req, res) => {
  try {
    const { id } = req.params;

    const skill = await query(
      'SELECT s.*, c.name AS category_name FROM skill s LEFT JOIN category c ON s.category_id = c.id WHERE s.id = ?',
      [id]
    );

    if (!skill || skill.length === 0) {
      return ResponseHelper.send.notFound(res, '技能不存在');
    }

    const tags = await query(
      'SELECT t.id, t.name FROM tag t JOIN skill_tag_relation str ON t.id = str.tag_id WHERE str.skill_id = ?',
      [id]
    );

    const skillData = skill[0];
    skillData.tags = tags || [];

    ResponseHelper.send.success(res, skillData, '查询成功');
  } catch (error) {
    console.error('❌ 获取技能详情失败：', error);
    ResponseHelper.send.serverError(res, `查询失败：${error.message}`);
  }
};
