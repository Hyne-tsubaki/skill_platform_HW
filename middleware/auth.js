// D:\Downloads\skill_platform_HW-main\middleware\auth.js
// 修正：从 ../../utils/jwtUtil.js 改为 ../utils/jwtUtil.js（向上1级即可找到utils目录）
const JwtUtil = require('../utils/jwtUtil.js');
const ResponseHelper = require('./responseHelper.js'); // 同目录，无需修改

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') 
    ? authHeader.substring(7) 
    : null;

  if (!token) return ResponseHelper.unauthorized(res);

  const decoded = JwtUtil.verifyToken(token);
  if (!decoded) return ResponseHelper.unauthorized(res, 'Token无效或已过期');

  req.userId = decoded.userId;
  next();
};

module.exports = { auth: authenticateToken };