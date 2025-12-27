// skill-platform-total/modules/skill-task/controllers/categoryController.js
// 修正：从 ../../../config/database 改为 ../../../../config/database（向上4层到根目录，再进入config）
// 路径解析：controllers → skill-task → modules → 根目录 → config
const { query } = require('../../../config/database');
// 修正：从 ../../../middleware/responseHelper 改为 ../../../../middleware/responseHelper（向上4层到根目录，再进入middleware）
const ResponseHelper = require('../../../middleware/responseHelper');

exports.addCategory = async (req, res) => {
  try {
    const { name, parent_id = null } = req.body;
    if (!name) {
      return ResponseHelper.send.validationError(res, [
        { field: 'name', message: '分类名称不能为空' }
      ]);
    }

    const result = await query('INSERT INTO category (name, parent_id) VALUES (?, ?)', [name, parent_id]);

    ResponseHelper.send.created(res, { id: result.insertId }, '分类添加成功');
  } catch (err) {
    console.error(err);
    ResponseHelper.send.serverError(res, '添加分类失败');
  }
};

exports.getCategoryList = async (req, res) => {
  try {
    const categories = await query('SELECT * FROM category');
    ResponseHelper.send.success(res, categories, '分类列表获取成功');
  } catch (err) {
    console.error(err);
    ResponseHelper.send.serverError(res, '获取分类列表失败');
  }
};

exports.getSubCategories = async (req, res) => {
  try {
    const { parent_id } = req.query;
    const subCategories = await query('SELECT * FROM category WHERE parent_id = ?', [parent_id]);
    ResponseHelper.send.success(res, subCategories, '子分类获取成功');
  } catch (err) {
    console.error(err);
    ResponseHelper.send.serverError(res, '获取子分类失败');
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, parent_id, sort } = req.body;  // 添加sort参数
    
    if (!id || isNaN(id)) {
      return ResponseHelper.send.validationError(res, [
        { field: 'id', message: 'ID必须为正整数' }
      ]);
    }
    // 修正：使用正确的字段名 category_id，并添加sort字段更新
    await query(
      'UPDATE category SET name = ?, parent_id = ?, sort = ? WHERE category_id = ?', 
      [name, parent_id || null, sort || 0, id]
    );
    
    ResponseHelper.send.updated(res, null, '分类修改成功');
  } catch (err) {
    console.error('更新分类失败:', err);
    ResponseHelper.send.serverError(res, '修改分类失败');
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || isNaN(id)) {
      return ResponseHelper.send.validationError(res, [
        { field: 'id', message: 'ID必须为正整数' }
      ]);
    }
    await query('DELETE FROM category WHERE category_id = ?', [id]);
    ResponseHelper.send.deleted(res, '分类删除成功');
  } catch (err) {
    console.error(err);
    ResponseHelper.send.serverError(res, '删除分类失败');
  }
};