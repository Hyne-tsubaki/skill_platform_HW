// 应用日志
const winston = require('winston');
const path = require('path');

// 引入 winston-daily-rotate-file
require('winston-daily-rotate-file');

// 定义日志级别
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// 定义日志格式
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// 不同日志类型的传输配置
const transports = [
  // 应用日志 - 按日期分割
  new winston.transports.DailyRotateFile({
    filename: path.join(__dirname, '../../logs/app-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'info',
    maxSize: '20m',
    maxFiles: '14d'
  }),
  
  // 错误日志 - 单独文件
  new winston.transports.DailyRotateFile({
    filename: path.join(__dirname, '../../logs/error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'error',
    maxSize: '20m',
    maxFiles: '30d'
  }),
  
  // 审计日志 - 单独文件
  new winston.transports.DailyRotateFile({
    filename: path.join(__dirname, '../../logs/audit-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'info',
    maxSize: '20m',
    maxFiles: '90d' // 审计日志保留更久
  }),
];

// 创建不同的logger实例
const appLogger = winston.createLogger({
  level: 'info',
  levels,
  format,
  defaultMeta: { service: 'skill-platform-api' },
  transports: [transports[0]],
});

const errorLogger = winston.createLogger({
  level: 'error',
  levels,
  format,
  defaultMeta: { service: 'skill-platform-api' },
  transports: [transports[1]],
});

const auditLogger = winston.createLogger({
  level: 'info',
  levels,
  format,
  defaultMeta: { service: 'skill-platform-audit' },
  transports: [transports[2]],
});

// 开发环境添加控制台输出
if (process.env.NODE_ENV !== 'production') {
  const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.simple()
  );
  
  appLogger.add(new winston.transports.Console({ format: consoleFormat }));
  errorLogger.add(new winston.transports.Console({ format: consoleFormat }));
}

module.exports = { appLogger, errorLogger, auditLogger };