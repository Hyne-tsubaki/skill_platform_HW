const { Model, DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database'); // ✅ 解构 Sequelize 实例

class Tag extends Model {}

Tag.init({
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    onUpdate: DataTypes.NOW
  }
}, {
  sequelize,      // ✅ 这里一定是 Sequelize 实例
  modelName: 'Tag',
  tableName: 'tag'
});

module.exports = Tag;
