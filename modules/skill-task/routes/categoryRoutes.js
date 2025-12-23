// skill-platform-total/modules/skill-task/routes/categoryRoutes.js
const express = require('express');
const router = express.Router();

// 修正：从 ../../../middleware/auth 改为 ../../../../middleware/auth（向上4层到根目录，再进入middleware）
// 路径解析：routes → skill-task → modules → 根目录 → middleware
const { auth } = require('../../../middleware/auth');
// 导入categoryController（同级controllers目录，路径正确，无需修改）
const categoryController = require('../controllers/categoryController');

// 导入有效性校验（快速定位问题，上线后可删除）
console.log("=== 路由导入校验 ===");
console.log("auth中间件是否为函数：", typeof auth === 'function');
console.log("addCategory是否为函数：", typeof categoryController.addCategory === 'function');
console.log("getCategoryList是否为函数：", typeof categoryController.getCategoryList === 'function');

// ================================
// 分类路由（修正后）
// ================================

// 添加分类（需认证）- 第11行，回调函数均有效
router.post('/', auth, categoryController.addCategory);

// 获取分类列表（公开接口）
router.get('/', categoryController.getCategoryList);

// 子分类功能
router.get('/sub', categoryController.getSubCategories);

// 修改分类（需认证）
router.put('/:id', auth, categoryController.updateCategory);

// 删除分类（需认证）
router.delete('/:id', auth, categoryController.deleteCategory);

module.exports = router;