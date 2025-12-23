// 修正路径 + 引入连接池
const { pool } = require('../../../config/database');
const JwtUtil = require('../../../utils/jwtUtil'); // 修正JWT路径（若需要）
const bcrypt = require('bcryptjs');

// 封装 query 方法
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

class AuthService {
  static async register(userData) {
    try {
      const { username, email, phone, password, roleName, realName, gender } = userData;
      
      // 检查用户名是否存在
      const usernameCheck = await query('SELECT COUNT(*) AS count FROM user WHERE username = ?', [username]);
      if (usernameCheck[0].count > 0) throw new Error('用户名已存在');
      
      // 检查邮箱是否存在
      const emailCheck = await query('SELECT COUNT(*) AS count FROM user WHERE email = ?', [email]);
      if (emailCheck[0].count > 0) throw new Error('邮箱已被注册');
      
      // 验证角色
      const roleResult = await query('SELECT role_id FROM role WHERE role_name = ? AND is_active = 1', [roleName]);
      if (!roleResult.length) throw new Error('无效的角色');
      
      const roleId = roleResult[0].role_id;
      const hash = bcrypt.hashSync(password, 10); // bcrypt 自动生成盐值
      
      // 插入用户表
      const userResult = await query(
        'INSERT INTO user (username, email, phone, real_name, gender, role_id, user_status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [username, email, phone, realName || null, gender || 'other', roleId, 'active']
      );
      
      const userId = userResult.insertId;
      
      // 插入用户认证表（移除无用的 password_salt）
      await query(
        'INSERT INTO user_auth (user_id, password_hash, email_verified, phone_verified) VALUES (?, ?, 0, 0)',
        [userId, hash]
      );
      
      return { success: true, userId, message: '注册成功' };
    } catch (error) {
      console.error('注册失败:', error);
      throw new Error(error.message || '注册失败，请重试');
    }
  }

  static async login(loginData) {
    try {
      const { login, password } = loginData;
      
      const userSql = `
        SELECT u.user_id, ua.password_hash, u.user_status, ua.account_locked_until, ua.failed_login_attempts
        FROM user u
        JOIN user_auth ua ON u.user_id = ua.user_id
        WHERE u.username = ? OR u.email = ?
      `;
      
      const [user] = await query(userSql, [login, login]);
      if (!user) throw new Error('用户不存在');
      
      // 检查账户状态
      if (user.user_status !== 'active') throw new Error(`账户状态异常: ${user.user_status}`);
      if (user.account_locked_until && new Date(user.account_locked_until) > new Date()) {
        throw new Error('账户已被锁定，请1小时后重试');
      }
      
      // 验证密码
      if (!bcrypt.compareSync(password, user.password_hash)) {
        // 增加失败次数
        await query('UPDATE user_auth SET failed_login_attempts = failed_login_attempts + 1 WHERE user_id = ?', [user.user_id]);
        
        // 超过5次失败，锁定1小时
        const newFailedCount = (user.failed_login_attempts || 0) + 1;
        if (newFailedCount >= 5) {
          const lockUntil = new Date();
          lockUntil.setHours(lockUntil.getHours() + 1);
          await query(
            'UPDATE user_auth SET account_locked_until = ? WHERE user_id = ?',
            [lockUntil, user.user_id]
          );
          throw new Error('密码错误次数过多，账户已锁定1小时');
        }
        
        throw new Error('密码错误');
      }
      
      // 登录成功，重置失败次数/锁定状态
      await query('UPDATE user_auth SET failed_login_attempts = 0, account_locked_until = NULL WHERE user_id = ?', [user.user_id]);
      await query('UPDATE user SET last_login_at = NOW(), login_count = login_count + 1 WHERE user_id = ?', [user.user_id]);
      
      // 生成JWT Token
      const token = JwtUtil.generateToken(user.user_id);
      
      return { success: true, token, userId: user.user_id };
    } catch (error) {
      console.error('登录失败:', error);
      throw new Error(error.message || '登录失败，请重试');
    }
  }
}

module.exports = AuthService;