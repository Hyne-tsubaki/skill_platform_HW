const express = require('express');
const router = express.Router();
const skillController = require('../controllers/skillController');
// 修正：解构 auth 并别名化为 authenticateToken，匹配路由中的使用
const { auth: authenticateToken } = require('../../../middleware/auth');
const { validatePublishSkill, validateIdParam } = require('../../../middleware/validator');

// 导入有效性校验（验证修复效果）
console.log("=== 技能路由最终校验 ===");
console.log("authenticateToken 是否有效：", typeof authenticateToken === 'function');
console.log("validatePublishSkill 是否有效：", typeof validatePublishSkill === 'function');
console.log("validateIdParam 是否有效：", typeof validateIdParam === 'function');
console.log("publishSkill 是否有效：", typeof skillController.publishSkill === 'function');

// 根路径：获取所有技能列表
router.get('/', skillController.getAllSkills);

// 发布技能（需认证 + 校验）- 所有回调均为有效函数
router.post('/publish', authenticateToken, validatePublishSkill, skillController.publishSkill);

// 修改技能（需认证 + ID参数校验）
router.put('/:id', authenticateToken, validateIdParam, skillController.updateSkill);

// 删除技能（需认证 + ID参数校验）
router.delete('/:id', authenticateToken, validateIdParam, skillController.deleteSkill);

// 搜索技能（公开）
router.get('/search', skillController.searchSkills);

// 获取技能详情（公开 + ID参数校验）
router.get('/:id', validateIdParam, skillController.getSkillDetail);

module.exports = router;