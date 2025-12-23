const { Model, DataTypes } = require('sequelize');
const sequelize = require('../../../config/database');

class Category extends Model {}

Category.init({
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
  parent_id: {
    type: DataTypes.BIGINT,
    allowNull: true
  },
  sort: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
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
  sequelize,
  modelName: 'Category',
  tableName: 'category'
});

// 自关联：父分类-子分类
Category.hasMany(Category, { foreignKey: 'parent_id', as: 'children' });
Category.belongsTo(Category, { foreignKey: 'parent_id', as: 'parent' });

module.exports = Category;