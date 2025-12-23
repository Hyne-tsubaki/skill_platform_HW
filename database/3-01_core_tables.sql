-- database/01_core_tables.sql
-- 核心业务表表结构，所有表结构都在此文件中定义

USE `skill_platform`;


-- 用户表
CREATE TABLE IF NOT EXISTS `user` (
    `user_id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `username` VARCHAR(50) UNIQUE NOT NULL COMMENT '用户名',
    `email` VARCHAR(100) UNIQUE COMMENT '邮箱',
    `phone` VARCHAR(20) UNIQUE COMMENT '手机号',
    `password_hash` VARCHAR(255) NOT NULL COMMENT '密码哈希',
    `real_name` VARCHAR(50) COMMENT '真实姓名',
    `avatar` VARCHAR(255) COMMENT '头像URL',
    `gender` TINYINT COMMENT '性别: 0-未知 1-男 2-女',
    `birthday` DATE COMMENT '生日',
    `introduction` TEXT COMMENT '个人简介',
    `user_type` TINYINT NOT NULL DEFAULT 1 COMMENT '用户类型: 1-普通用户 2-技能提供者 3-管理员',
    `is_verified` BOOLEAN DEFAULT FALSE COMMENT '是否已实名认证',
    `balance` DECIMAL(10,2) DEFAULT 0.00 COMMENT '账户余额',
    `created_time` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 技能表
CREATE TABLE IF NOT EXISTS `skill` (
    `skill_id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL COMMENT '技能提供者ID',
    `title` VARCHAR(100) NOT NULL COMMENT '技能标题',
    `description` TEXT COMMENT '技能描述',
    `category` VARCHAR(50) COMMENT '技能分类',
    `price` DECIMAL(10,2) NOT NULL COMMENT '服务价格',
    `price_unit` VARCHAR(20) DEFAULT '次' COMMENT '价格单位: 次/小时/天',
    `experience_years` INT COMMENT '经验年限',
    `is_available` BOOLEAN DEFAULT TRUE COMMENT '是否可用',
    `view_count` INT DEFAULT 0 COMMENT '浏览数',
    `order_count` INT DEFAULT 0 COMMENT '接单数',
    `avg_rating` DECIMAL(2,1) DEFAULT 0.0 COMMENT '平均评分',
    `created_time` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 订单表
CREATE TABLE `order` (
    `order_id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `order_no` VARCHAR(64) UNIQUE NOT NULL COMMENT '订单编号',
    `skill_id` BIGINT NOT NULL COMMENT '技能ID',
    `employer_id` BIGINT NOT NULL COMMENT '雇主ID',
    `provider_id` BIGINT NOT NULL COMMENT '技能提供者ID',
    `order_amount` DECIMAL(10,2) NOT NULL COMMENT '订单金额',
    `order_status` TINYINT NOT NULL DEFAULT 1 COMMENT '1-待支付 2-已支付 3-进行中 4-已完成 5-已取消 6-退款中',
    `service_time` DATETIME COMMENT '预约服务时间',
    `order_remark` TEXT COMMENT '订单备注',
    `created_time` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 支付记录表
CREATE TABLE `payment` (
    `payment_id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `order_id` BIGINT NOT NULL,
    `payment_no` VARCHAR(64) UNIQUE NOT NULL COMMENT '支付流水号',
    `payment_amount` DECIMAL(10,2) NOT NULL,
    `payment_status` TINYINT NOT NULL DEFAULT 1 COMMENT '1-待支付 2-支付成功 3-支付失败 4-已退款',
    `payment_method` VARCHAR(20) COMMENT '支付方式: alipay,wechat,balance',
    `payment_time` DATETIME COMMENT '支付时间',
    `freeze_status` TINYINT DEFAULT 1 COMMENT '1-资金冻结 2-已解冻给提供者 3-已退款给雇主',
    `created_time` DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 评价表
CREATE TABLE `review` (
    `review_id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `order_id` BIGINT NOT NULL,
    `reviewer_id` BIGINT NOT NULL COMMENT '评价人ID',
    `reviewed_id` BIGINT NOT NULL COMMENT '被评价人ID',
    `rating` TINYINT NOT NULL COMMENT '1-5星评分',
    `comment` TEXT COMMENT '文字评价',
    `review_type` TINYINT NOT NULL COMMENT '1-雇主对提供者评价 2-提供者对雇主评价',
    `is_anonymous` BOOLEAN DEFAULT FALSE COMMENT '是否匿名评价',
    `created_time` DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 系统日志表
CREATE TABLE `log` (
    `log_id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `log_level` VARCHAR(10) NOT NULL COMMENT 'INFO, ERROR, WARN, DEBUG',
    `log_type` VARCHAR(50) NOT NULL COMMENT '日志类型: payment, order, review, system',
    `user_id` BIGINT COMMENT '操作用户ID',
    `module` VARCHAR(100) NOT NULL COMMENT '模块名称',
    `action` VARCHAR(100) NOT NULL COMMENT '操作动作',
    `description` TEXT COMMENT '日志描述',
    `ip_address` VARCHAR(45) COMMENT 'IP地址',
    `request_params` JSON COMMENT '请求参数',
    `exception_info` TEXT COMMENT '异常信息',
    `created_time` DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 用户信誉表
CREATE TABLE `user_credit` (
    `user_id` BIGINT PRIMARY KEY,
    `credit_score` DECIMAL(3,1) DEFAULT 5.0 COMMENT '信誉分数 0-10',
    `total_orders` INT DEFAULT 0 COMMENT '总订单数',
    `completed_orders` INT DEFAULT 0 COMMENT '完成订单数',
    `avg_rating` DECIMAL(2,1) DEFAULT 0.0 COMMENT '平均评分',
    `positive_reviews` INT DEFAULT 0 COMMENT '好评数',
    `negative_reviews` INT DEFAULT 0 COMMENT '差评数',
    `updated_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);