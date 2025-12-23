// 导入日志记录器模块
// 从 '../utils/logger/appLogger' 导入 appLogger、errorLogger、auditLogger 三个日志记录器实例
const { appLogger, errorLogger, auditLogger } = require('./applog');

// 请求日志中间件 - 记录HTTP请求的开始和结束
const requestLogger = (req, res, next) => {
  // 记录请求开始时间，用于计算请求处理时长
  const start = Date.now();
  
  // 记录请求开始日志
  // 使用 appLogger 的 info 级别记录 API 请求开始信息
  appLogger.info('API_REQUEST_START', {
    method: req.method,            // HTTP请求方法（GET、POST等）
    url: req.url,                  // 请求的URL路径
    ip: req.ip,                    // 客户端IP地址
    userAgent: req.get('User-Agent'), // 客户端用户代理信息
    userId: req.user?.id || 'anonymous' // 用户ID（如果有认证），否则为'anonymous'
  });

  // 监听响应完成事件，当HTTP响应结束时执行
  res.on('finish', () => {
    // 计算请求处理总时长（当前时间减去开始时间）
    const duration = Date.now() - start;
    
    // 记录请求结束日志
    appLogger.info('API_REQUEST_END', {
      method: req.method,          // HTTP请求方法
      url: req.url,                // 请求的URL路径
      statusCode: res.statusCode,  // HTTP响应状态码
      duration: `${duration}ms`,   // 请求处理总时长（毫秒）
      userId: req.user?.id || 'anonymous' // 用户ID
    });

    // 审计日志 - 记录重要操作（如增删改等敏感操作）
    // 使用 shouldAudit 函数判断当前请求是否需要审计
    if (shouldAudit(req)) {
      // 使用 auditLogger 记录审计日志
      auditLogger.info('AUDIT_TRAIL', {
        userId: req.user?.id,           // 执行操作的用户ID
        action: `${req.method} ${req.url}`, // 操作描述（方法 + URL）
        timestamp: new Date().toISOString(), // 操作时间戳（ISO格式）
        ip: req.ip,                    // 操作者IP地址
        userAgent: req.get('User-Agent') // 操作者用户代理
      });
    }
  });

  // 调用 next()，将控制权传递给下一个中间件
  next();
};

// 错误日志中间件 - 捕获并记录未处理的异常
// 此中间件有四个参数，Express 会识别它为错误处理中间件
const errorLoggerMiddleware = (err, req, res, next) => {
  // 使用 errorLogger 的 error 级别记录未处理的异常
  errorLogger.error('UNHANDLED_ERROR', {
    message: err.message,           // 错误描述信息
    stack: err.stack,               // 错误堆栈跟踪（用于调试）
    method: req.method,             // 发生错误时的HTTP请求方法
    url: req.url,                   // 发生错误时的请求URL
    userId: req.user?.id || 'anonymous', // 触发错误的用户ID
    ip: req.ip,                     // 触发错误的客户端IP
    timestamp: new Date().toISOString() // 错误发生时间
  });
  
  // 将错误传递给下一个错误处理中间件
  next(err);
};

// 判断是否需要审计日志的辅助函数
// 根据请求方法和路径判断是否为需要审计的操作
const shouldAudit = (req) => {
  // 需要审计的HTTP方法列表（通常是非幂等的修改操作）
  const auditMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
  // 需要审计的敏感路径前缀列表
  const auditPaths = ['/orders', '/payments', '/reviews', '/credits'];
  
  // 返回布尔值：当前请求方法在审计列表中 且 URL包含任一审计路径
  return auditMethods.includes(req.method) && 
         auditPaths.some(path => req.url.includes(path));
};

// 导出中间件函数，使其可以在其他模块中使用
module.exports = { 
  // 日志记录器实例（如果需要）
  appLogger, 
  errorLogger, 
  auditLogger,
  // 中间件函数（这是app.js真正需要的）
  requestLogger, 
  errorLoggerMiddleware 
};