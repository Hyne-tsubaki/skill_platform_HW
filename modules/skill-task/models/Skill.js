const { Model, DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');// ✅ 修改为整合数据库
const Category = require('./Category');
const Tag = require('./Tag');
const SkillTagRelation = require('./SkillTagRelation');

class Skill extends Model {}

Skill.init(
  {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    category_id: {
      type: DataTypes.BIGINT,
      allowNull: false
    },
    user_id: {
      type: DataTypes.BIGINT,
      allowNull: false
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    status: {
      type: DataTypes.TINYINT,
      defaultValue: 1,
      allowNull: false,
      comment: '1-启用 0-禁用'
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  },
  {
    sequelize,
    modelName: 'Skill',
    tableName: 'skill',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['category_id'] },
      { fields: ['user_id'] },
      { fields: ['name'] }
    ]
  }
);

// ================================
// 关联关系
// ================================
Skill.belongsTo(Category, { foreignKey: 'category_id', as: 'category' });
Skill.belongsToMany(Tag, {
  through: SkillTagRelation,
  foreignKey: 'skill_id',
  otherKey: 'tag_id',
  as: 'tags'
});

module.exports = Skill;
