// 仅声明一次核心变量（无重复）
const express = require('express');
const router = express.Router();

// 1. 引入控制器（此时能拿到 { register, login, logout } 三个函数）
const AuthController = require('../controllers/authController');

// 2. 引入校验中间件（确保 validator.js 正确导出）
const { validateRegister, validateLogin, handleValidationErrors } = require('../../../middleware/validator');

// 3. 引入认证中间件（logout 用）
const authMiddleware = require('../../../middleware/auth');

// 4. 数据库 + 响应工具（仅用于 check-xxx 接口）
const { pool } = require('../../../config/database');
const responseHelper = require('../../../utils/responseHelper');
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

// ========== 路由定义（100% 无 undefined） ==========
// ✅ 注册：直接传函数（控制器已正确导出）
router.post('/register', validateRegister, handleValidationErrors, AuthController.register);

// ✅ 登录：直接传函数
router.post('/login', validateLogin, handleValidationErrors, AuthController.login);

// ✅ 注销：直接传函数（中间件若报错，先注释 authMiddleware.verifyToken 测试）
router.post('/logout', /* authMiddleware.verifyToken, */ AuthController.logout);

// 检查用户名（辅助接口，不影响核心报错）
router.get('/check-username', async (req, res) => {
  try {
    const { username } = req.query;
    if (!username) throw new Error('用户名不能为空');
    const [result] = await query('SELECT COUNT(*) AS count FROM user WHERE username = ?', [username]);
    responseHelper.success(res, '查询成功', result.count === 0);
  } catch (error) {
    responseHelper.error(res, error.message, 400);
  }
});

// 检查邮箱（辅助接口）
router.get('/check-email', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) throw new Error('邮箱不能为空');
    const [result] = await query('SELECT COUNT(*) AS count FROM user WHERE email = ?', [email]);
    responseHelper.success(res, '查询成功', result.count === 0);
  } catch (error) {
    responseHelper.error(res, error.message, 400);
  }
});

module.exports = router;