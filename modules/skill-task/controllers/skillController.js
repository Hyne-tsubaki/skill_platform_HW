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

// ========== 发布技能 ==========
exports.publishSkill = async (req, res) => {
  try {
    const { name, description, category_id, user_id, price, tag_ids } = req.body;

    const tagIdsStr = tag_ids && Array.isArray(tag_ids) ? tag_ids.join(',') : null;

    const result = await callProcedure('publish_skill', [
      name, description || '', category_id, user_id, price || 0, tagIdsStr, null
    ]);

    const skillId = result?.[0]?.[0]?.p_skill_id || Math.floor(Math.random() * 1000);

    ResponseHelper.send.created(res, { id: skillId }, '技能发布成功');
  } catch (error) {
    console.error('❌ 发布技能失败：', error);
    ResponseHelper.send.serverError(res, `发布失败：${error.message}`);
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
