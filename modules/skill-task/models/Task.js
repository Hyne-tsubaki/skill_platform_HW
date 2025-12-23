const { Model, DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database'); // ✅ 解构出 Sequelize 实例
const Skill = require('./Skill');

class Task extends Model {}

Task.init({
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  skill_id: {
    type: DataTypes.BIGINT,
    allowNull: false
  },
  publisher_id: {
    type: DataTypes.BIGINT,
    allowNull: false
  },
  receiver_id: {
    type: DataTypes.BIGINT,
    allowNull: true
  },
  budget: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  status: {
    type: DataTypes.TINYINT,
    defaultValue: 0,
    allowNull: false,
    comment: '0-待接单 1-已接单 2-已完成'
  },
  deadline: {
    type: DataTypes.DATE,
    allowNull: true
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  sequelize,      // ✅ 一定要是 Sequelize 实例
  modelName: 'Task',
  tableName: 'task',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['skill_id'] },
    { fields: ['publisher_id'] },
    { fields: ['receiver_id'] },
    { fields: ['status'] },
    { fields: ['title'] }
  ]
});

// 关联技能
Task.belongsTo(Skill, { foreignKey: 'skill_id', as: 'skill' });

module.exports = Task;
