const path = require('path');
console.log("=== 标签控制器导入校验 ===");
console.log("tagController 所在目录：", __dirname);

// 验证响应工具导入
try {
  const ResponseHelper = require('../../../middleware/responseHelper.js');
  console.log("responseHelper 导入成功：", typeof ResponseHelper.send === 'object');
} catch (err) {
  console.log("responseHelper 导入失败：", err.message);
}

// 验证db-proc导入
try {
  const { callProcedure } = require('../../../utils/db-proc');
  console.log("db-proc 导入成功：", typeof callProcedure === 'function');
} catch (err) {
  console.log("db-proc 导入失败：", err.message);
}

// 验证模型导入
try {
  const Tag = require('../models/Tag');
  console.log("Tag 模型导入成功：", typeof Tag === 'function');
} catch (err) {
  console.log("Tag 模型导入失败：", err.message);
}

// 后续原有代码...
const Tag = require('../models/Tag');
const SkillTagRelation = require('../models/SkillTagRelation');
// 修正1：正确解构导出的 sendResponse 方法（路径向上3级到根目录utils）
const { sendResponse } = require('../../../utils/responseHelper.js');
const { Op } = require('sequelize');
// 修正2：db-proc 路径（向上3级到根目录utils）
const { callProcedure } = require('../../../utils/db-proc');
const sequelize = require('../../../config/database');
const { QueryTypes } = require('sequelize');

// 添加标签（调用存储过程 add_tag，已存在则返回现有标签）
exports.addTag = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return sendResponse(res, 400, '标签名称不能为空');

    // 调用存储过程 add_tag（OUT参数 p_tag_id 放最后）
    const [result] = await callProcedure('add_tag', [
      name,
      null // OUT参数占位符
    ]);

    // 解析存储过程返回的标签ID
    const tagId = result && result[0] ? result[0].p_tag_id : null;
    if (!tagId) {
      return sendResponse(res, 500, '标签创建失败');
    }

    // 查询标签详情返回给前端（保持返回格式一致）
    const tag = await Tag.findByPk(tagId);
    const message = tag ? (tag.created_at === tag.updated_at ? '标签添加成功' : '标签已存在') : '标签添加成功';
    
    sendResponse(res, 200, message, tag);
  } catch (error) {
    console.error('添加标签失败：', error);
    // 捕获存储过程抛出的自定义错误（如重复）
    const errMsg = error.message.includes('45000') ? error.message : '服务器内部错误';
    sendResponse(res, 500, errMsg, error.message);
  }
};

// 获取标签列表（支持模糊搜索+分页）- 保留ORM逻辑（也可改存储过程，按需选择）
exports.getTagList = async (req, res) => {
  try {
    const { keyword, page = 1, page_size = 20 } = req.query;
    const where = keyword ? { name: { [Op.like]: `%${keyword}%` } } : {};

    const offset = (page - 1) * page_size;
    const { count, rows } = await Tag.findAndCountAll({
      where,
      offset: parseInt(offset),
      limit: parseInt(page_size),
      order: [['created_at', 'DESC']]
    });

    sendResponse(res, 200, '查询成功', {
      list: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        page_size: parseInt(page_size),
        total_pages: Math.ceil(count / page_size)
      }
    });
  } catch (error) {
    console.error('查询标签失败：', error);
    sendResponse(res, 500, '服务器内部错误', error.message);
  }
};

// 修改标签 - 保留原有ORM逻辑（如需改存储过程可补充）
exports.updateTag = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name) return sendResponse(res, 400, '标签名称不能为空');

    const tag = await Tag.findByPk(id);
    if (!tag) return sendResponse(res, 404, '标签不存在');

    // 检查名称重复
    const exist = await Tag.findOne({ where: { name, id: { [Op.ne]: id } } });
    if (exist) return sendResponse(res, 400, '标签名称已存在');

    await tag.update({ name });
    sendResponse(res, 200, '标签修改成功', tag);
  } catch (error) {
    console.error('修改标签失败：', error);
    sendResponse(res, 500, '服务器内部错误', error.message);
  }
};

// 删除标签（检查关联技能）- 保留原有ORM逻辑
exports.deleteTag = async (req, res) => {
  try {
    const { id } = req.params;

    // 检查关联技能
    const relationCount = await SkillTagRelation.count({ where: { tag_id: id } });
    if (relationCount > 0) return sendResponse(res, 400, '该标签关联了技能，无法删除');

    await Tag.destroy({ where: { id } });
    sendResponse(res, 200, '标签删除成功');
  } catch (error) {
    console.error('删除标签失败：', error);
    sendResponse(res, 500, '服务器内部错误', error.message);
  }
};

// 【可选】如果需要全量改用存储过程，补充以下方法（替换原有getTagList/updateTag/deleteTag）
// 示例：存储过程版获取标签列表
exports.getTagListByProc = async (req, res) => {
  try {
    const { keyword = '', page = 1, page_size = 20 } = req.query;
    const offset = (page - 1) * page_size;
    
    // 调用自定义的标签列表存储过程（需先在MySQL创建）
    const [results] = await sequelize.query(
      `CALL get_tag_list(?, ?, ?)`,
      {
        replacements: [keyword, offset, page_size],
        type: QueryTypes.RAW
      }
    );

    const tagList = results[0] || [];
    const total = results[1] && results[1][0] ? results[1][0].total : 0;

    sendResponse(res, 200, '查询成功', {
      list: tagList,
      pagination: {
        total,
        page: parseInt(page),
        page_size: parseInt(page_size),
        total_pages: Math.ceil(total / page_size)
      }
    });
  } catch (error) {
    console.error('查询标签失败：', error);
    sendResponse(res, 500, '服务器内部错误', error.message);
  }
};