const { body, validationResult } = require('express-validator');
const Joi = require('joi');
const ResponseHelper = require('./responseHelper.js');

// ======== express-validator 注册/登录校验 ========
const validateRegister = [
  body('username').isLength({ min: 3, max: 50 }).withMessage('用户名长度必须为3-50位')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('用户名只能包含字母、数字和下划线'),
  body('email').isEmail().withMessage('请输入有效的邮箱地址'),
  body('password').isLength({ min: 6, max: 20 }).withMessage('密码长度必须为6-20位'),
  body('roleName').isIn(['skill_provider', 'skill_demander', 'admin']).withMessage('角色不合法'),
  body('phone').matches(/^1[3-9]\d{9}$/).withMessage('手机号格式不正确')
];

const validateLogin = [
  body('login').notEmpty().withMessage('用户名或邮箱不能为空'),
  body('password').notEmpty().withMessage('密码不能为空')
];

// 通用错误处理
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorList = errors.array().map(err => ({ field: err.path, message: err.msg }));
    return ResponseHelper.send.validationError(res, errorList);
  }
  next();
};

// ======== Joi 技能/任务校验 ========
const validatePublishSkill = (req, res, next) => {
  const schema = Joi.object({
    name: Joi.string().max(100).required(),
    description: Joi.string().allow('', null),
    category_id: Joi.number().integer().positive().required(),
    user_id: Joi.number().integer().positive().required(),
    price: Joi.number().precision(2).min(0).allow(null),
    tag_ids: Joi.array().items(Joi.number().integer().positive()).allow(null)
  });
  const { error } = schema.validate(req.body, { abortEarly: false });
  if (error) {
    const errorList = error.details.map(item => ({ field: item.path[0], message: item.message }));
    return ResponseHelper.send.validationError(res, errorList);
  }
  next();
};

const validatePublishTask = (req, res, next) => {
  const schema = Joi.object({
    title: Joi.string().max(200).required(),
    description: Joi.string().required(),
    skill_id: Joi.number().integer().positive().required(),
    publisher_id: Joi.number().integer().positive().required(),
    budget: Joi.number().precision(2).positive().required(),
    deadline: Joi.date().iso().allow(null)
  });
  const { error } = schema.validate(req.body, { abortEarly: false });
  if (error) {
    const errorList = error.details.map(item => ({ field: item.path[0], message: item.message }));
    return ResponseHelper.send.validationError(res, errorList);
  }
  next();
};

// 通用 ID 参数校验
const validateIdParam = (req, res, next) => {
  const { id } = req.params;
  if (!id || isNaN(id) || parseInt(id) <= 0) {
    return ResponseHelper.send.error(res, 'ID必须为正整数', ResponseHelper.errorCodes.BAD_REQUEST, { field: 'id', value: id });
  }
  next();
};

module.exports = {
  validateRegister,
  validateLogin,
  handleValidationErrors,
  validatePublishSkill,
  validatePublishTask,
  validateIdParam
};
