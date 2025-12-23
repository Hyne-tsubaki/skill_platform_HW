// 彻底放弃类写法，改用普通函数（避免上下文/导出问题）
const AuthService = require('../services/authService.js');
const ResponseHelper = require('../../../middleware/responseHelper.js');

// 1. 注册接口
async function register(req, res) {
  try {
    const result = await AuthService.register(req.body);
    ResponseHelper.send.success(res, '注册成功', { userId: result.userId }, 201);
  } catch (error) {
    let code = 400;
    if (error.message.includes('已存在')) code = 409;
    else if (error.message.includes('服务器')) code = 500;
    ResponseHelper.send.error(res, error.message, code);
  }
}

// 2. 登录接口
async function login(req, res) {
  try {
    const result = await AuthService.login(req.body);
    ResponseHelper.send.success(res, '登录成功', { token: result.token, userId: result.userId });
  } catch (error) {
    const code = error.message.includes('参数') ? 400 : 401;
    ResponseHelper.send.error(res, error.message, code);
  }
}

// 3. 注销接口
async function logout(req, res) {
  try {
    ResponseHelper.send.success(res, '退出成功', null);
  } catch (error) {
    ResponseHelper.send.error(res, error.message || '退出失败', 500);
  }
}

// ✅ 关键：普通对象导出（确保路由能拿到函数）
module.exports = {
  register: register,
  login: login,
  logout: logout
};