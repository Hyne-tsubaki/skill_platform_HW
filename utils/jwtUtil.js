const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = parseInt(process.env.JWT_EXPIRES_IN);

class JwtUtil {
  static generateToken(userId) {
    return jwt.sign({ userId }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN
    });
  }

  static verifyToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return null;
    }
  }

  static getTokenExpiresIn() {
    return JWT_EXPIRES_IN;
  }
}

module.exports = JwtUtil;