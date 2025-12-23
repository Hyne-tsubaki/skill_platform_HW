const { Model, DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database'); // ✅ 取 Sequelize 实例

class SkillTagRelation extends Model {}

SkillTagRelation.init({
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true
  },
  skill_id: {
    type: DataTypes.BIGINT,
    allowNull: false
  },
  tag_id: {
    type: DataTypes.BIGINT,
    allowNull: false
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  sequelize,       // ✅ Sequelize 实例
  modelName: 'SkillTagRelation',
  tableName: 'skill_tag_relation',
  timestamps: true,
  underscored: true,
  indexes: [
    { unique: true, fields: ['skill_id', 'tag_id'] },
    { fields: ['tag_id'] }
  ]
});

module.exports = SkillTagRelation;
