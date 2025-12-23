const bcrypt = require('bcryptjs');

class BcryptUtil {
  static async hashPassword(password) {
    const salt = bcrypt.genSaltSync(10);
    return {
      hash: bcrypt.hashSync(password, salt),
      salt: salt
    };
  }

  static verifyPassword(password, hash) {
    return bcrypt.compareSync(password, hash);
  }

  static hashWithSalt(password, salt) {
    return bcrypt.hashSync(password, salt);
  }
}

module.exports = BcryptUtil;