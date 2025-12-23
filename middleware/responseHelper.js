/**
 * 统一响应格式处理工具
 * 路径: middleware/responseHelper.js
 * 功能: 生成标准响应对象 + 直接发送响应封装
 */

// ================================
// 1️⃣ 标准响应对象模板
// ================================
const standardResponse = {
  success: (data = null, message = '操作成功') => ({
    success: true,
    code: 200,
    message,
    data,
    timestamp: new Date().toISOString()
  }),

  error: (message = '操作失败', errorCode = 400, details = null) => ({
    success: false,
    code: errorCode,
    message,
    data: null,
    details,
    timestamp: new Date().toISOString()
  }),

  notFound: (message = '资源不存在') => ({
    success: false,
    code: 404,
    message,
    data: null,
    timestamp: new Date().toISOString()
  }),

  unauthorized: (message = '无访问权限') => ({
    success: false,
    code: 401,
    message,
    data: null,
    timestamp: new Date().toISOString()
  }),

  forbidden: (message = '权限不足') => ({
    success: false,
    code: 403,
    message,
    data: null,
    timestamp: new Date().toISOString()
  }),

  serverError: (message = '服务器内部错误') => ({
    success: false,
    code: 500,
    message,
    data: null,
    timestamp: new Date().toISOString()
  }),

  validationError: (errors = []) => ({
    success: false,
    code: 422,
    message: '参数验证失败',
    errors,
    data: null,
    timestamp: new Date().toISOString()
  }),

  paginated: (data, pagination, message = '获取数据成功') => ({
    success: true,
    code: 200,
    message,
    data,
    pagination: {
      page: pagination.page || 1,
      limit: pagination.limit || 10,
      total: pagination.total || 0,
      pages: pagination.pages || 0
    },
    timestamp: new Date().toISOString()
  }),

  created: (data = null, message = '创建成功') => ({
    success: true,
    code: 201,
    message,
    data,
    timestamp: new Date().toISOString()
  }),

  updated: (data = null, message = '更新成功') => ({
    success: true,
    code: 200,
    message,
    data,
    timestamp: new Date().toISOString()
  }),

  deleted: (message = '删除成功') => ({
    success: true,
    code: 200,
    message,
    data: null,
    timestamp: new Date().toISOString()
  }),

  custom: (success, code, message, data = null) => ({
    success,
    code,
    message,
    data,
    timestamp: new Date().toISOString()
  })
};

// ================================
// 2️⃣ 业务错误对象生成
// ================================
const businessErrorObj = (message, businessCode, details = null) => ({
  success: false,
  code: 400,
  businessCode,
  message,
  data: null,
  details,
  timestamp: new Date().toISOString()
});

// ================================
// 3️⃣ 错误码常量
// ================================
const errorCodes = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_FAILED: 422,
  INTERNAL_SERVER_ERROR: 500,
  // 自定义业务错误码
  INSUFFICIENT_BALANCE: 1001,
  ORDER_CANNOT_BE_CANCELLED: 1002,
  REVIEW_ALREADY_EXISTS: 1003,
  CREDIT_SCORE_TOO_LOW: 1004
};

// ================================
// 4️⃣ 直接发送响应封装（Express res）
// ================================
const send = {
  success: (res, data = null, message) => res.status(200).json(standardResponse.success(data, message)),
  created: (res, data = null, message) => res.status(201).json(standardResponse.created(data, message)),
  updated: (res, data = null, message) => res.status(200).json(standardResponse.updated(data, message)),
  deleted: (res, message) => res.status(200).json(standardResponse.deleted(message)),
  paginated: (res, data, pagination, message) => res.status(200).json(standardResponse.paginated(data, pagination, message)),
  notFound: (res, message) => res.status(404).json(standardResponse.notFound(message)),
  unauthorized: (res, message) => res.status(401).json(standardResponse.unauthorized(message)),
  forbidden: (res, message) => res.status(403).json(standardResponse.forbidden(message)),
  validationError: (res, errors) => res.status(422).json(standardResponse.validationError(errors)),
  error: (res, message, code = 400, details = null) => res.status(code).json(standardResponse.error(message, code, details)),
  serverError: (res, message) => res.status(500).json(standardResponse.serverError(message)),
  businessError: (res, message, businessCode, details = null) => res.status(400).json(businessErrorObj(message, businessCode, details)),
  custom: (res, success, code, message, data) => res.status(code).json(standardResponse.custom(success, code, message, data))
};

// ================================
// 5️⃣ 导出模块
// ================================
module.exports = {
  ...standardResponse,   // 生成响应对象
  send,                  // 直接发送响应
  errorCodes,
  businessError: businessErrorObj
};
