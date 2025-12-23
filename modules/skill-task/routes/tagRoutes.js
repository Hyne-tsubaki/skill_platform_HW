const express = require('express');
const router = express.Router();
const tagController = require('../controllers/tagController');
// 修正：middlewares → middleware（去掉多余的s）
const { auth } = require('../../../middleware/auth');

// 添加标签（需认证）
router.post('/', auth, tagController.addTag);

// 获取标签列表（公开）
router.get('/', tagController.getTagList);

// 修改标签（需认证）
router.put('/:id', auth, tagController.updateTag);

// 删除标签（需认证）
router.delete('/:id', auth, tagController.deleteTag);

// 可选：添加存储过程版标签列表路由
// router.get('/proc', tagController.getTagListByProc);

module.exports = router;