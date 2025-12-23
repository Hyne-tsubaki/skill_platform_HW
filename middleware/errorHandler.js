/**
 * 统一错误处理器中间件
 * 用于集中处理应用程序中的所有错误，提供一致的错误响应格式和日志记录
 */

// 导入依赖模块（若logger不存在，可注释errorLogger相关代码）
// const { errorLogger } = require('../utils/logger/applog.js');
const ResponseHelper = require('../utils/responseHelper.js');

// 定义常见的HTTP状态码和对应的错误类型
const ERROR_TYPES = {
  VALIDATION_ERROR: 400,        // 客户端请求参数错误
  AUTHENTICATION_ERROR: 401,    // 认证失败
  AUTHORIZATION_ERROR: 403,     // 权限不足
  NOT_FOUND_ERROR: 404,         // 资源未找到
  CONFLICT_ERROR: 409,          // 资源冲突（如重复创建）
  INTERNAL_SERVER_ERROR: 500,   // 服务器内部错误
  DATABASE_ERROR: 503,          // 数据库错误
  EXTERNAL_SERVICE_ERROR: 502   // 外部服务错误
};

// 定义常见的错误消息
const ERROR_MESSAGES = {
  VALIDATION_FAILED: '请求参数验证失败',
  RESOURCE_NOT_FOUND: '请求的资源不存在',
  DUPLICATE_ENTRY: '资源已存在，请勿重复创建',
  UNAUTHORIZED: '用户未认证或登录已过期',
  FORBIDDEN: '权限不足，无法访问该资源',
  INTERNAL_ERROR: '服务器内部错误，请稍后重试',
  DATABASE_ERROR: '数据库操作失败，请稍后重试',
  INVALID_TRANSITION: '状态流转无效'
};

/**
 * 自定义错误类 - AppError
 * 扩展原生Error类，添加更多错误上下文信息
 */
class AppError extends Error {
  constructor(message, statusCode, errorCode = null, details = null) {
    super(message);
    
    // 错误状态码（HTTP状态码）
    this.statusCode = statusCode;
    
    // 内部错误代码（用于前端识别错误类型）
    this.errorCode = errorCode;
    
    // 错误详情（用于调试）
    this.details = details;
    
    // 错误是否可操作（用户可见的错误）
    this.isOperational = true;
    
    // 错误发生时间戳
    this.timestamp = new Date().toISOString();
    
    // 捕获错误堆栈（用于调试）
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 验证错误类 - ValidationError
 * 专门用于处理请求参数验证失败的情况
 */
class ValidationError extends AppError {
  constructor(message, details = null) {
    super(
      message || ERROR_MESSAGES.VALIDATION_FAILED,
      ERROR_TYPES.VALIDATION_ERROR,
      'VALIDATION_ERROR',
      details
    );
  }
}

/**
 * 资源未找到错误类 - NotFoundError
 * 专门用于处理请求的资源不存在的情况
 */
class NotFoundError extends AppError {
  constructor(message, details = null) {
    super(
      message || ERROR_MESSAGES.RESOURCE_NOT_FOUND,
      ERROR_TYPES.NOT_FOUND_ERROR,
      'RESOURCE_NOT_FOUND',
      details
    );
  }
}

/**
 * 重复条目错误类 - DuplicateEntryError
 * 专门用于处理重复创建资源的情况
 */
class DuplicateEntryError extends AppError {
  constructor(message, details = null) {
    super(
      message || ERROR_MESSAGES.DUPLICATE_ENTRY,
      ERROR_TYPES.CONFLICT_ERROR,
      'DUPLICATE_ENTRY',
      details
    );
  }
}

/**
 * 数据库错误类 - DatabaseError
 * 专门用于处理数据库操作失败的情况
 */
class DatabaseError extends AppError {
  constructor(message, details = null, originalError = null) {
    super(
      message || ERROR_MESSAGES.DATABASE_ERROR,
      ERROR_TYPES.DATABASE_ERROR,
      'DATABASE_ERROR',
      {
        ...details,
        originalError: originalError ? {
          code: originalError.code,
          message: originalError.message
        } : null
      }
    );
  }
}

/**
 * 状态流转错误类 - InvalidTransitionError
 * 专门用于处理无效的状态流转（如订单状态）
 */
class InvalidTransitionError extends AppError {
  constructor(message, details = null) {
    super(
      message || ERROR_MESSAGES.INVALID_TRANSITION,
      ERROR_TYPES.VALIDATION_ERROR,
      'INVALID_TRANSITION',
      details
    );
  }
}

/**
 * 错误处理器中间件
 * 捕获应用程序中的所有错误，提供统一的错误响应和日志记录
 */
const errorHandler = (err, req, res, next) => {
  // 控制台打印错误信息（保留原有逻辑）
  console.error('错误信息:', err.message);
  
  // 记录错误上下文信息（用于日志记录）
  const errorContext = {
    // 请求信息
    request: {
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id || 'anonymous'
    },
    // 错误信息
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack,
      code: err.code,
      statusCode: err.statusCode,
      errorCode: err.errorCode,
      details: err.details,
      isOperational: err.isOperational
    },
    // 环境信息
    environment: {
      node_env: process.env.NODE_ENV,
      timestamp: new Date().toISOString()
    }
  };

  // 根据错误类型设置默认值
  let statusCode = err.statusCode || ERROR_TYPES.INTERNAL_SERVER_ERROR;
  let message = err.message || ERROR_MESSAGES.INTERNAL_ERROR;
  let errorCode = err.errorCode || 'UNKNOWN_ERROR';
  let errorDetails = err.details || null;

  // 处理不同类型的数据库错误
  if (err.code) {
    switch (err.code) {
      case 'ER_DUP_ENTRY':
        // 重复条目错误（优先使用原有ResponseHelper逻辑）
        statusCode = ERROR_TYPES.CONFLICT_ERROR;
        message = '数据已存在'; // 匹配原有提示文案
        errorCode = 'DUPLICATE_ENTRY';
        // 尝试从错误消息中提取详细信息
        if (err.message.includes('for key')) {
          errorDetails = {
            constraint: err.message.match(/for key '(.+)'/)?.[1] || 'unknown'
          };
        }
        // 检查响应是否已发送，避免重复
        if (res.headersSent) return next(err);
        // 直接返回ResponseHelper响应（保留原有核心逻辑）
        return ResponseHelper.error(res, message, statusCode);
        
      case 'ER_NO_REFERENCED_ROW':
        // 外键约束错误（关联的资源不存在）
        statusCode = ERROR_TYPES.VALIDATION_ERROR;
        message = '关联的资源不存在';
        errorCode = 'REFERENTIAL_INTEGRITY_ERROR';
        break;
        
      case 'ER_DATA_TOO_LONG':
        // 数据过长错误
        statusCode = ERROR_TYPES.VALIDATION_ERROR;
        message = '输入数据过长';
        errorCode = 'DATA_TOO_LONG';
        break;
        
      case 'ER_BAD_NULL_ERROR':
        // 非空约束错误
        statusCode = ERROR_TYPES.VALIDATION_ERROR;
        message = '缺少必需的字段';
        errorCode = 'NULL_CONSTRAINT_VIOLATION';
        break;
        
      case 'ECONNREFUSED':
      case 'ETIMEDOUT':
        // 数据库连接错误
        statusCode = ERROR_TYPES.DATABASE_ERROR;
        message = ERROR_MESSAGES.DATABASE_ERROR;
        errorCode = 'DATABASE_CONNECTION_ERROR';
        break;
    }
  }

  // 处理Joi验证错误（如果使用了Joi验证库）
  if (err.isJoi) {
    statusCode = ERROR_TYPES.VALIDATION_ERROR;
    message = ERROR_MESSAGES.VALIDATION_FAILED;
    errorCode = 'JOI_VALIDATION_ERROR';
    errorDetails = err.details?.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
      type: detail.type
    })) || null;
  }

  // 处理Express验证错误
  if (err.name === 'ValidationError') {
    statusCode = ERROR_TYPES.VALIDATION_ERROR;
    errorCode = 'EXPRESS_VALIDATION_ERROR';
  }

  // 处理JWT认证错误
  if (err.name === 'JsonWebTokenError') {
    statusCode = ERROR_TYPES.AUTHENTICATION_ERROR;
    message = '无效的认证令牌';
    errorCode = 'INVALID_TOKEN';
  }
  
  if (err.name === 'TokenExpiredError') {
    statusCode = ERROR_TYPES.AUTHENTICATION_ERROR;
    message = '认证令牌已过期';
    errorCode = 'TOKEN_EXPIRED';
  }

  // 记录错误日志（若logger不存在，注释以下代码）
  // if (statusCode >= 500) {
  //   errorLogger.error('SERVER_ERROR', errorContext);
  // } else if (statusCode >= 400) {
  //   errorLogger.warn('CLIENT_ERROR', errorContext);
  // } else {
  //   errorLogger.info('OTHER_ERROR', errorContext);
  // }

  // 核心修复：检查响应是否已发送，避免重复返回
  if (res.headersSent) {
    console.warn('响应已发送，跳过重复返回');
    return next(err);
  }

  // 核心修改：统一使用ResponseHelper返回错误响应
  // 区分开发/生产环境，补充必要的错误信息
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  // 构建错误响应参数
  let responseMessage = message;
  let responseStatusCode = statusCode;
  
  // 开发环境下补充详细信息到响应头或消息中（根据ResponseHelper支持程度）
  if (isDevelopment) {
    responseMessage = `${message} | 详情: ${JSON.stringify({
      errorCode,
      details: errorDetails,
      stack: err.stack?.substring(0, 500) // 截断堆栈信息避免过长
    })}`;
  }

  // 默认使用ResponseHelper返回（匹配原有逻辑）
  if (statusCode === ERROR_TYPES.INTERNAL_SERVER_ERROR) {
    responseMessage = '服务器内部错误'; // 匹配原有默认提示
  }
  
  ResponseHelper.error(res, responseMessage, responseStatusCode);
};

/**
 * 全局异步错误处理器包装器
 * 用于包装异步路由处理器，自动捕获异步错误并传递给错误处理器
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    // 将异步函数包装成Promise，并捕获任何错误
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 404错误处理器中间件（核心修复：只发送一次响应，不调用next()）
 */
const notFoundHandler = (req, res, next) => {
  // 只执行ResponseHelper.error发送响应，删除next(err)
  ResponseHelper.error(res, '接口不存在', 404);
};

/**
 * 全局请求验证错误处理器
 * 用于处理请求参数验证失败的情况
 */
const validationErrorHandler = (validationResult, req, res, next) => {
  if (!validationResult.isEmpty()) {
    const errors = validationResult.array().map(err => ({
      field: err.path,
      message: err.msg,
      value: err.value
    }));
    
    throw new ValidationError('请求参数验证失败', errors);
  }
  next();
};

// 导出所有模块
module.exports = {
  // 错误处理中间件（保留原有导出）
  errorHandler,
  
  // 辅助函数
  asyncHandler,
  notFoundHandler,
  validationErrorHandler,
  
  // 错误类
  AppError,
  ValidationError,
  NotFoundError,
  DuplicateEntryError,
  DatabaseError,
  InvalidTransitionError,
  
  // 常量
  ERROR_TYPES,
  ERROR_MESSAGES
};