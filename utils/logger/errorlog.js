// utils/logger/errorLogger.js
// 错误日志专用记录器模块
// 专门处理不同类型的错误日志，提供详细的错误上下文信息

// 导入winston日志库，用于创建和管理日志记录器
const winston = require('winston');
// 导入path模块，用于处理文件和目录路径
const path = require('path');
// 导入winston-daily-rotate-file插件，支持按日期轮转日志文件
// 需要先安装：npm install winston-daily-rotate-file
require('winston-daily-rotate-file');

// ==================== 错误类型常量定义 ====================
// 定义所有可能的错误类型常量，便于分类和筛选错误
const ERROR_TYPES = {
  // 数据库相关错误类型
  DB_CONNECTION: 'DATABASE_CONNECTION_ERROR', // 数据库连接错误
  DB_QUERY: 'DATABASE_QUERY_ERROR',           // 数据库查询错误
  DB_VALIDATION: 'DATABASE_VALIDATION_ERROR', // 数据库验证错误
  DB_TRANSACTION: 'DATABASE_TRANSACTION_ERROR', // 数据库事务错误
  
  // 业务逻辑错误类型
  VALIDATION: 'VALIDATION_ERROR',             // 数据验证错误
  BUSINESS_LOGIC: 'BUSINESS_LOGIC_ERROR',     // 业务逻辑错误
  WORKFLOW: 'WORKFLOW_ERROR',                 // 工作流程错误
  
  // API相关错误类型
  API_REQUEST: 'API_REQUEST_ERROR',           // API请求错误
  API_RESPONSE: 'API_RESPONSE_ERROR',         // API响应错误
  API_VALIDATION: 'API_VALIDATION_ERROR',     // API验证错误
  
  // 认证授权错误类型
  AUTHENTICATION: 'AUTHENTICATION_ERROR',     // 认证错误
  AUTHORIZATION: 'AUTHORIZATION_ERROR',       // 授权错误
  
  // 系统错误类型
  UNEXPECTED: 'UNEXPECTED_ERROR',             // 未预期的错误
  CONFIGURATION: 'CONFIGURATION_ERROR',       // 配置错误
  RESOURCE: 'RESOURCE_ERROR',                 // 资源错误
  
  // 外部服务错误类型
  EXTERNAL_SERVICE: 'EXTERNAL_SERVICE_ERROR', // 外部服务错误
  PAYMENT: 'PAYMENT_PROCESSING_ERROR',        // 支付处理错误
  
  // 文件操作错误类型
  FILE_OPERATION: 'FILE_OPERATION_ERROR',     // 文件操作错误
  LOG_PROCESSING: 'LOG_PROCESSING_ERROR'      // 日志处理错误
};

// ==================== 错误严重级别 ====================
// 定义错误严重级别，用于优先级排序和警报处理
const SEVERITY_LEVELS = {
  CRITICAL: 'critical',   // 系统崩溃，需要立即处理
  HIGH: 'high',           // 主要功能受影响，需要尽快处理
  MEDIUM: 'medium',       // 次要功能受影响，需要安排处理
  LOW: 'low',             // 轻微问题，不影响主要功能，可以稍后处理
  INFO: 'info'            // 信息性错误，仅用于记录和监控
};

// ==================== 日志格式配置 ====================
// 使用winston.format.combine组合多个格式处理器
const errorFormat = winston.format.combine(
  // 添加时间戳格式处理器，精确到毫秒
  winston.format.timestamp({ 
    format: 'YYYY-MM-DD HH:mm:ss.SSS' // 时间戳格式：年-月-日 时:分:秒.毫秒
  }),
  
  // 捕获错误堆栈信息处理器，确保错误堆栈被正确记录
  winston.format.errors({ 
    stack: true // 启用堆栈跟踪
  }),
  
  // 自定义日志格式处理器，定义最终的日志输出格式
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    // 构建基础日志信息对象
    let logEntry = {
      timestamp, // 时间戳
      level: level.toUpperCase(), // 日志级别（转换为大写）
      message, // 错误消息
      errorType: meta.errorType || ERROR_TYPES.UNEXPECTED, // 错误类型，默认为未预期错误
      severity: meta.severity || SEVERITY_LEVELS.MEDIUM // 严重级别，默认为中等
    };
    
    // 如果有错误堆栈，将堆栈信息添加到日志条目中
    if (stack) {
      logEntry.stackTrace = stack;
    }
    
    // 如果存在上下文信息，将其添加到日志条目中
    if (meta.context) {
      logEntry.context = meta.context;
    }
    
    // 如果存在请求信息，构建请求信息对象并添加到日志条目中
    if (meta.request) {
      logEntry.request = {
        method: meta.request.method, // HTTP请求方法
        url: meta.request.url, // 请求URL
        ip: meta.request.ip, // 客户端IP地址
        userId: meta.request.userId || 'anonymous', // 用户ID，默认为匿名
        userAgent: meta.request.userAgent // 客户端用户代理信息
      };
    }
    
    // 如果存在数据库信息，将其添加到日志条目中
    if (meta.database) {
      logEntry.database = meta.database;
    }
    
    // 如果存在业务数据，将其添加到日志条目中
    if (meta.businessData) {
      logEntry.businessData = meta.businessData;
    }
    
    // 添加环境信息到日志条目
    logEntry.environment = {
      nodeEnv: process.env.NODE_ENV || 'development', // Node.js环境（开发/生产）
      service: 'skill-platform-api', // 服务名称
      hostname: require('os').hostname(), // 主机名
      pid: process.pid // 进程ID
    };
    
    // 将日志条目对象转换为格式化的JSON字符串
    // 参数2为null表示不使用替换函数，参数3表示缩进2个空格
    return JSON.stringify(logEntry, null, 2);
  })
);

// ==================== 日志传输配置 ====================
// 配置日志输出目标（传输器）
const transports = [
  // 1. 通用错误日志传输器 - 按日期分割，存储所有错误级别日志
  new winston.transports.DailyRotateFile({
    filename: path.join(process.cwd(), 'logs/errors/error-%DATE%.log'), // 日志文件路径和名称模式
    datePattern: 'YYYY-MM-DD', // 日期模式，每天一个文件
    level: 'error', // 只记录error级别及以上的日志
    maxSize: '50m', // 单个日志文件最大50MB
    maxFiles: '30d', // 保留30天的日志文件
    zippedArchive: true, // 自动压缩旧日志文件
    format: errorFormat // 使用上面定义的错误格式
  }),
  
  // 2. 严重错误日志传输器 - 单独存储CRITICAL级别错误
  new winston.transports.DailyRotateFile({
    filename: path.join(process.cwd(), 'logs/errors/critical-%DATE%.log'), // 严重错误日志文件路径
    datePattern: 'YYYY-MM-DD', // 日期模式
    level: 'error', // 只记录error级别及以上的日志
    maxSize: '20m', // 单个文件最大20MB
    maxFiles: '90d', // 严重错误日志保留90天，便于长期分析
    zippedArchive: true, // 自动压缩
    format: errorFormat, // 使用错误格式
    filter: (log) => log.severity === SEVERITY_LEVELS.CRITICAL // 过滤函数，只记录CRITICAL级别
  }),
  
  // 3. 警告日志传输器 - 单独存储警告级别日志
  new winston.transports.DailyRotateFile({
    filename: path.join(process.cwd(), 'logs/errors/warn-%DATE%.log'), // 警告日志文件路径
    datePattern: 'YYYY-MM-DD', // 日期模式
    level: 'warn', // 只记录warn级别及以上的日志
    maxSize: '30m', // 单个文件最大30MB
    maxFiles: '14d', // 警告日志保留14天
    zippedArchive: true, // 自动压缩
    format: errorFormat // 使用错误格式
  }),
  
  // 4. 数据库错误日志传输器 - 单独存储数据库相关错误
  new winston.transports.DailyRotateFile({
    filename: path.join(process.cwd(), 'logs/errors/db-error-%DATE%.log'), // 数据库错误日志文件路径
    datePattern: 'YYYY-MM-DD', // 日期模式
    level: 'error', // 只记录error级别及以上的日志
    maxSize: '50m', // 单个文件最大50MB
    maxFiles: '30d', // 保留30天
    zippedArchive: true, // 自动压缩
    format: errorFormat, // 使用错误格式
    filter: (log) => log.errorType?.startsWith('DATABASE_') // 过滤函数，只记录以DATABASE_开头的错误类型
    // ?. 是可选链操作符，防止errorType为undefined时出错
  })
];

// ==================== 创建错误记录器实例 ====================
// 使用winston.createLogger创建主错误日志记录器实例
const errorLogger = winston.createLogger({
  // 默认日志级别：只记录error级别及以上的日志
  level: 'error',
  
  // 自定义日志级别定义，数字越小优先级越高
  levels: {
    error: 0, // 错误级别
    warn: 1,  // 警告级别
    info: 2   // 信息级别
  },
  
  // 默认元数据，会附加到每条日志记录中
  defaultMeta: { 
    service: 'skill-platform-error-logger', // 服务名称
    version: '1.0.0' // 记录器版本
  },
  
  // 传输器配置，定义日志输出到哪里
  transports: transports, // 使用上面定义的传输器数组
  
  // 异常处理器配置，处理未捕获的异常
  exceptionHandlers: [
    new winston.transports.DailyRotateFile({
      filename: path.join(process.cwd(), 'logs/errors/exceptions-%DATE%.log'), // 异常日志文件路径
      datePattern: 'YYYY-MM-DD', // 日期模式
      maxSize: '20m', // 单个文件最大20MB
      maxFiles: '30d' // 保留30天
    })
  ],
  
  // 拒绝处理器配置，处理未处理的Promise拒绝
  rejectionHandlers: [
    new winston.transports.DailyRotateFile({
      filename: path.join(process.cwd(), 'logs/errors/rejections-%DATE%.log'), // Promise拒绝日志文件路径
      datePattern: 'YYYY-MM-DD', // 日期模式
      maxSize: '20m', // 单个文件最大20MB
      maxFiles: '30d' // 保留30天
    })
  ],
  
  // 是否在捕获到未处理异常时退出进程，false表示不退出
  exitOnError: false
});

// ==================== 开发环境控制台输出 ====================
// 非生产环境（开发/测试）时添加控制台输出，便于调试
if (process.env.NODE_ENV !== 'production') {
  // 定义控制台输出格式
  const consoleFormat = winston.format.combine(
    winston.format.colorize(), // 添加颜色，使不同级别的日志在控制台显示不同颜色
    winston.format.timestamp({ format: 'HH:mm:ss.SSS' }), // 时间戳格式（仅时间部分）
    winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
      // 构建日志前缀：[时间] 级别:
      const prefix = `[${timestamp}] ${level}:`;
      // 构建基本日志消息
      let logMessage = `${prefix} ${message}`;
      
      // 如果有错误类型，追加到消息中
      if (meta.errorType) {
        logMessage += ` (${meta.errorType})`;
      }
      
      // 如果有堆栈信息，追加到消息中（换行显示）
      if (stack) {
        logMessage += `\n${stack}`;
      }
      
      // 返回最终的日志消息字符串
      return logMessage;
    })
  );
  
  // 添加控制台传输器到错误记录器
  errorLogger.add(new winston.transports.Console({
    format: consoleFormat, // 使用控制台格式
    level: process.env.NODE_ENV === 'development' ? 'info' : 'warn' // 开发环境记录info及以上，其他非生产环境记录warn及以上
  }));
}

// ==================== 错误日志记录器类 ====================
// 提供静态方法封装常见错误类型的记录逻辑
class ErrorLogger {
  /**
   * 记录数据库错误
   * @param {Error} error - 错误对象
   * @param {Object} context - 错误上下文
   * @param {string} context.query - SQL查询语句
   * @param {Array} context.params - 查询参数
   * @param {Object} context.request - 请求信息
   */
  static logDatabaseError(error, context = {}) {
    // 使用errorLogger记录错误消息
    errorLogger.error(error.message, {
      errorType: ERROR_TYPES.DB_QUERY, // 错误类型为数据库查询错误
      severity: this._determineDbSeverity(error.code), // 根据错误代码确定严重级别
      context: { // 上下文信息
        operation: context.operation || 'database_query', // 操作名称，默认数据库查询
        query: context.query, // SQL查询语句
        params: context.params, // 查询参数
        errorCode: error.code, // 数据库错误代码
        sqlState: error.sqlState, // SQL状态
        sqlMessage: error.sqlMessage // SQL错误消息
      },
      request: context.request, // 请求信息
      database: { // 数据库特定信息
        code: error.code, // 错误代码
        errno: error.errno, // 错误编号
        sqlState: error.sqlState // SQL状态
      }
    });
  }
  
  /**
   * 记录验证错误
   * @param {Error|string} error - 错误信息（可以是Error对象或字符串）
   * @param {Object} context - 验证上下文
   * @param {Object} context.validationErrors - 验证错误详情
   * @param {Object} context.request - 请求信息
   */
  static logValidationError(error, context = {}) {
    // 判断error是字符串还是Error对象，提取消息
    const message = typeof error === 'string' ? error : error.message;
    // 记录警告级别日志（验证错误通常不严重）
    errorLogger.warn(message, {
      errorType: ERROR_TYPES.VALIDATION, // 错误类型为验证错误
      severity: SEVERITY_LEVELS.LOW, // 严重级别为低
      context: { // 上下文信息
        operation: context.operation || 'validation', // 操作名称，默认验证
        validationErrors: context.validationErrors, // 验证错误详情
        inputData: context.inputData // 输入数据
      },
      request: context.request, // 请求信息
      businessData: { // 业务数据
        field: context.field, // 字段名
        expected: context.expected, // 期望值
        actual: context.actual // 实际值
      }
    });
  }
  
  /**
   * 记录业务逻辑错误
   * @param {Error|string} error - 错误信息
   * @param {Object} context - 业务上下文
   * @param {string} context.operation - 操作名称
   * @param {Object} context.businessData - 业务数据
   * @param {Object} context.request - 请求信息
   */
  static logBusinessError(error, context = {}) {
    const message = typeof error === 'string' ? error : error.message;
    errorLogger.error(message, {
      errorType: ERROR_TYPES.BUSINESS_LOGIC, // 错误类型为业务逻辑错误
      severity: SEVERITY_LEVELS.MEDIUM, // 严重级别为中等
      context: { // 上下文信息
        operation: context.operation || 'business_operation', // 操作名称，默认业务操作
        businessRule: context.businessRule, // 业务规则
        businessState: context.businessState // 业务状态
      },
      request: context.request, // 请求信息
      businessData: context.businessData, // 业务数据
      stack: error.stack // 错误堆栈（如果是Error对象）
    });
  }
  
  /**
   * 记录API请求错误
   * @param {Error} error - 错误对象
   * @param {Object} request - 请求对象
   * @param {number} statusCode - HTTP状态码
   */
  static logApiError(error, request, statusCode = 500) {
    // 根据状态码确定严重级别和错误类型
    const severity = statusCode >= 500 ? SEVERITY_LEVELS.HIGH : SEVERITY_LEVELS.MEDIUM;
    const errorType = statusCode >= 500 ? ERROR_TYPES.API_RESPONSE : ERROR_TYPES.API_VALIDATION;
    
    errorLogger.error(error.message, {
      errorType, // 错误类型
      severity, // 严重级别
      context: { // 上下文信息
        operation: 'api_request', // 操作名称：API请求
        statusCode, // HTTP状态码
        responseTime: Date.now() - (request.startTime || Date.now()) // 响应时间
      },
      request: { // 请求信息
        method: request.method, // HTTP方法
        url: request.url, // 请求URL
        ip: request.ip, // 客户端IP
        userId: request.user?.id || 'anonymous', // 用户ID，使用可选链和空值合并
        userAgent: request.get('User-Agent'), // 用户代理
        query: request.query, // 查询参数
        body: request.body, // 请求体
        params: request.params // URL参数
      },
      stack: error.stack // 错误堆栈
    });
  }
  
  /**
   * 记录支付处理错误
   * @param {Error} error - 错误对象
   * @param {Object} context - 支付上下文
   * @param {string} context.paymentId - 支付ID
   * @param {string} context.orderId - 订单ID
   * @param {string} context.paymentMethod - 支付方式
   */
  static logPaymentError(error, context = {}) {
    errorLogger.error(error.message, {
      errorType: ERROR_TYPES.PAYMENT, // 错误类型为支付处理错误
      severity: SEVERITY_LEVELS.HIGH, // 严重级别为高（支付错误通常较严重）
      context: { // 上下文信息
        operation: 'payment_processing', // 操作名称：支付处理
        paymentId: context.paymentId, // 支付ID
        orderId: context.orderId, // 订单ID
        paymentMethod: context.paymentMethod, // 支付方式
        amount: context.amount, // 支付金额
        paymentStatus: context.paymentStatus // 支付状态
      },
      request: context.request, // 请求信息
      stack: error.stack // 错误堆栈
    });
  }
  
  /**
   * 记录订单处理错误
   * @param {Error} error - 错误对象
   * @param {Object} context - 订单上下文
   * @param {string} context.orderId - 订单ID
   * @param {string} context.orderStatus - 订单状态
   * @param {string} context.operation - 操作类型
   */
  static logOrderError(error, context = {}) {
    errorLogger.error(error.message, {
      errorType: ERROR_TYPES.BUSINESS_LOGIC, // 错误类型为业务逻辑错误
      severity: SEVERITY_LEVELS.MEDIUM, // 严重级别为中等
      context: { // 上下文信息
        operation: context.operation || 'order_processing', // 操作名称，默认订单处理
        orderId: context.orderId, // 订单ID
        orderStatus: context.orderStatus, // 订单状态
        userId: context.userId, // 用户ID
        skillId: context.skillId // 技能ID
      },
      request: context.request, // 请求信息
      stack: error.stack, // 错误堆栈
      businessData: { // 业务数据
        orderData: context.orderData, // 订单数据
        transition: { // 状态转换
          from: context.fromStatus, // 原状态
          to: context.toStatus // 目标状态
        }
      }
    });
  }
  
  /**
   * 记录评价处理错误
   * @param {Error} error - 错误对象
   * @param {Object} context - 评价上下文
   */
  static logReviewError(error, context = {}) {
    errorLogger.error(error.message, {
      errorType: ERROR_TYPES.BUSINESS_LOGIC, // 错误类型为业务逻辑错误
      severity: SEVERITY_LEVELS.LOW, // 严重级别为低（评价错误通常不严重）
      context: { // 上下文信息
        operation: context.operation || 'review_processing', // 操作名称，默认评价处理
        reviewId: context.reviewId, // 评价ID
        orderId: context.orderId, // 订单ID
        reviewerId: context.reviewerId, // 评价人ID
        reviewedId: context.reviewedId, // 被评价人ID
        rating: context.rating // 评分
      },
      request: context.request, // 请求信息
      database: { // 数据库信息
        errorCode: error.code, // 错误代码
        sqlMessage: error.sqlMessage // SQL错误消息
      },
      stack: error.stack // 错误堆栈
    });
  }
  
  /**
   * 记录信誉处理错误
   * @param {Error} error - 错误对象
   * @param {Object} context - 信誉上下文
   */
  static logCreditError(error, context = {}) {
    errorLogger.error(error.message, {
      errorType: ERROR_TYPES.BUSINESS_LOGIC, // 错误类型为业务逻辑错误
      severity: SEVERITY_LEVELS.MEDIUM, // 严重级别为中等
      context: { // 上下文信息
        operation: context.operation || 'credit_processing', // 操作名称，默认信誉处理
        userId: context.userId, // 用户ID
        creditId: context.creditId, // 信誉记录ID
        creditScore: context.creditScore, // 信誉分数
        action: context.action // 操作类型：'update', 'calculate', 'ranking'
      },
      request: context.request, // 请求信息
      businessData: { // 业务数据
        oldScore: context.oldScore, // 旧分数
        newScore: context.newScore, // 新分数
        changeReason: context.changeReason // 变更原因
      },
      stack: error.stack // 错误堆栈
    });
  }
  
  /**
   * 记录未处理的异常
   * @param {Error} error - 错误对象
   * @param {Object} request - 请求对象
   */
  static logUnhandledError(error, request = null) {
    errorLogger.error(error.message, {
      errorType: ERROR_TYPES.UNEXPECTED, // 错误类型为未预期错误
      severity: SEVERITY_LEVELS.CRITICAL, // 严重级别为严重（未处理异常很严重）
      context: { // 上下文信息
        operation: 'unhandled_exception', // 操作名称：未处理的异常
        isUnhandled: true // 标记为未处理
      },
      request: request ? { // 如果提供了请求对象，记录请求信息
        method: request.method, // HTTP方法
        url: request.url, // 请求URL
        ip: request.ip, // 客户端IP
        userId: request.user?.id || 'anonymous' // 用户ID
      } : null, // 否则为null
      stack: error.stack // 错误堆栈
    });
  }
  
  /**
   * 记录警告信息
   * @param {string} message - 警告信息
   * @param {Object} context - 警告上下文
   */
  static logWarning(message, context = {}) {
    errorLogger.warn(message, {
      errorType: context.errorType || 'WARNING', // 错误类型，默认WARNING
      severity: SEVERITY_LEVELS.LOW, // 严重级别为低
      context: { // 上下文信息
        operation: context.operation || 'warning', // 操作名称，默认warning
        ...context // 展开其他上下文属性
      },
      request: context.request // 请求信息
    });
  }
  
  /**
   * 记录信息性错误
   * @param {string} message - 信息
   * @param {Object} context - 上下文
   */
  static logInfo(message, context = {}) {
    errorLogger.info(message, {
      errorType: context.errorType || 'INFO', // 错误类型，默认INFO
      severity: SEVERITY_LEVELS.INFO, // 严重级别为信息
      context: { // 上下文信息
        operation: context.operation || 'info', // 操作名称，默认info
        ...context // 展开其他上下文属性
      },
      request: context.request // 请求信息
    });
  }
  
  /**
   * 确定数据库错误的严重级别
   * @param {string} errorCode - 数据库错误代码
   * @returns {string} 严重级别
   * @private
   */
  static _determineDbSeverity(errorCode) {
    // 定义严重级别的错误代码数组
    const criticalCodes = ['ER_DBACCESS_DENIED_ERROR', 'ER_ACCESS_DENIED_ERROR'];
    const highCodes = ['ER_NO_REFERENCED_ROW', 'ER_DUP_ENTRY', 'ER_LOCK_WAIT_TIMEOUT'];
    
    // 根据错误代码返回相应的严重级别
    if (criticalCodes.includes(errorCode)) {
      return SEVERITY_LEVELS.CRITICAL; // 如果错误代码在严重数组中，返回CRITICAL
    } else if (highCodes.includes(errorCode)) {
      return SEVERITY_LEVELS.HIGH; // 如果错误代码在高优先级数组中，返回HIGH
    } else {
      return SEVERITY_LEVELS.MEDIUM; // 其他情况返回MEDIUM
    }
  }
}

// ==================== 导出模块 ====================
// 导出模块内容，使其他文件可以导入使用
module.exports = {
  errorLogger,      // 原始的winston logger实例，可以直接使用
  ErrorLogger,      // 错误日志记录器类，提供静态方法
  ERROR_TYPES,      // 错误类型常量
  SEVERITY_LEVELS   // 严重级别常量
};