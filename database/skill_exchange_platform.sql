-- 技能交换平台 - 完整数据库整合方案
-- 兼容MySQL 5.7+
-- 模块分工：A(用户权限) + B(技能任务) + C(交易评价)

-- =============================================================================
-- 一、数据库初始化
-- =============================================================================
DROP DATABASE IF EXISTS skill_exchange_platform;
CREATE DATABASE IF NOT EXISTS skill_exchange_platform 
CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE skill_exchange_platform;
SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- =============================================================================
-- 二、核心表结构（按模块划分）
-- =============================================================================

-- ==================== 模块A：用户与权限管理 ====================
CREATE TABLE role (
    role_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    role_name VARCHAR(50) NOT NULL UNIQUE COMMENT '角色名称：admin, skill_provider, skill_demander, moderator',
    role_description VARCHAR(255) NOT NULL COMMENT '角色描述',
    is_active TINYINT(1) DEFAULT 1 NOT NULL COMMENT '角色是否激活',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_role_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色表';

CREATE TABLE user (
    user_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE COMMENT '用户名',
    email VARCHAR(100) NOT NULL UNIQUE COMMENT '邮箱',
    phone VARCHAR(20) NOT NULL COMMENT '手机号',
    real_name VARCHAR(50) COMMENT '真实姓名（实名认证用）',
    gender ENUM('male', 'female', 'other') DEFAULT 'other' NOT NULL COMMENT '性别',
    id_card_verified TINYINT(1) DEFAULT 0 NOT NULL COMMENT '实名认证状态',
    role_id BIGINT NOT NULL COMMENT '角色ID',
    user_status ENUM('active', 'inactive', 'suspended', 'pending') DEFAULT 'pending' NOT NULL COMMENT '用户状态',
    last_login_at TIMESTAMP NULL COMMENT '最后登录时间',
    login_count INT DEFAULT 0 NOT NULL COMMENT '登录次数',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (role_id) REFERENCES role(role_id) ON DELETE RESTRICT,
    CHECK (login_count >= 0),
    INDEX idx_user_email (email),
    INDEX idx_user_phone (phone),
    INDEX idx_user_status (user_status),
    INDEX idx_user_role (role_id),
    INDEX idx_user_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户信息表';

CREATE TABLE user_auth (
    auth_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE COMMENT '用户ID',
    password_hash VARCHAR(255) NOT NULL COMMENT '加密后的密码',
    password_salt VARCHAR(50) NOT NULL COMMENT '密码盐值',
    email_verified TINYINT(1) DEFAULT 0 NOT NULL COMMENT '邮箱验证状态',
    phone_verified TINYINT(1) DEFAULT 0 NOT NULL COMMENT '手机验证状态',
    verification_token VARCHAR(100) COMMENT '邮箱验证令牌',
    verification_token_expires_at TIMESTAMP NULL COMMENT '验证令牌过期时间',
    reset_token VARCHAR(100) COMMENT '密码重置令牌',
    reset_token_expires_at TIMESTAMP NULL COMMENT '重置令牌过期时间',
    last_password_change TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL COMMENT '最后修改密码时间',
    failed_login_attempts INT DEFAULT 0 NOT NULL COMMENT '连续登录失败次数',
    account_locked_until TIMESTAMP NULL COMMENT '账户锁定截止时间',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user(user_id) ON DELETE CASCADE,
    CHECK (failed_login_attempts >= 0),
    INDEX idx_auth_user (user_id),
    INDEX idx_verification_token (verification_token),
    INDEX idx_reset_token (reset_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户认证表';

CREATE TABLE user_session (
    session_id VARCHAR(128) PRIMARY KEY COMMENT '会话ID',
    user_id BIGINT NOT NULL COMMENT '用户ID',
    session_data TEXT NOT NULL COMMENT '会话数据',
    ip_address VARCHAR(45) NOT NULL COMMENT 'IP地址',
    user_agent TEXT NOT NULL COMMENT '用户代理',
    expires_at TIMESTAMP NOT NULL COMMENT '会话过期时间',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user(user_id) ON DELETE CASCADE,
    INDEX idx_session_user (user_id),
    INDEX idx_session_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户会话表';

CREATE TABLE permission (
    permission_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    permission_code VARCHAR(50) NOT NULL UNIQUE COMMENT '权限代码',
    permission_name VARCHAR(100) NOT NULL COMMENT '权限名称',
    permission_description VARCHAR(255) COMMENT '权限描述',
    module VARCHAR(50) NOT NULL COMMENT '所属模块',
    is_active TINYINT(1) DEFAULT 1 NOT NULL COMMENT '是否激活',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='权限表';

CREATE TABLE role_permission (
    role_id BIGINT NOT NULL,
    permission_id BIGINT NOT NULL,
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    granted_by BIGINT COMMENT '授权人用户ID',
    PRIMARY KEY (role_id, permission_id),
    FOREIGN KEY (role_id) REFERENCES role(role_id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permission(permission_id) ON DELETE CASCADE,
    FOREIGN KEY (granted_by) REFERENCES user(user_id) ON DELETE SET NULL,
    INDEX idx_role_perm_role (role_id),
    INDEX idx_role_perm_permission (permission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色权限关联表';

-- ==================== 模块B：技能与任务管理 ====================
CREATE TABLE category (
    category_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    parent_id BIGINT DEFAULT NULL,
    sort INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES category(category_id) ON DELETE CASCADE,
    KEY idx_parent_id (parent_id),
    UNIQUE KEY uk_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='技能分类表';

CREATE TABLE skill (
    skill_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    category_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL COMMENT '技能提供者ID',
    price DECIMAL(10,2) DEFAULT NULL COMMENT '技能价格',
    status TINYINT NOT NULL DEFAULT 1 COMMENT '1-上架 0-下架',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES category(category_id),
    FOREIGN KEY (user_id) REFERENCES user(user_id) ON DELETE CASCADE,
    KEY idx_category_id (category_id),
    KEY idx_user_id (user_id),
    KEY idx_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='技能信息表';

CREATE TABLE tag (
    tag_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='标签表';

CREATE TABLE skill_tag_relation (
    relation_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    skill_id BIGINT NOT NULL,
    tag_id BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (skill_id) REFERENCES skill(skill_id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tag(tag_id) ON DELETE CASCADE,
    UNIQUE KEY uk_skill_tag (skill_id, tag_id),
    KEY idx_tag_id (tag_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='技能标签关联表';

CREATE TABLE task (
    task_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    skill_id BIGINT NOT NULL,
    publisher_id BIGINT NOT NULL COMMENT '任务发布者ID',
    receiver_id BIGINT DEFAULT NULL COMMENT '任务接单者ID',
    budget DECIMAL(10,2) NOT NULL,
    status TINYINT NOT NULL DEFAULT 0 COMMENT '0-待接单 1-进行中 2-已完成 3-已取消',
    deadline TIMESTAMP NULL COMMENT '任务截止时间',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (skill_id) REFERENCES skill(skill_id),
    FOREIGN KEY (publisher_id) REFERENCES user(user_id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES user(user_id) ON DELETE SET NULL,
    KEY idx_skill_id (skill_id),
    KEY idx_publisher_id (publisher_id),
    KEY idx_receiver_id (receiver_id),
    KEY idx_status (status),
    KEY idx_title (title)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='任务信息表';

-- ==================== 模块C：交易与评价管理 ====================
CREATE TABLE `order` (
    order_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_no VARCHAR(64) UNIQUE NOT NULL COMMENT '订单编号',
    skill_id BIGINT NOT NULL COMMENT '关联的技能ID',
    employer_id BIGINT NOT NULL COMMENT '雇主ID（技能需求者）',
    provider_id BIGINT NOT NULL COMMENT '技能提供者ID',
    task_id BIGINT COMMENT '关联的任务ID（可为空）',
    order_amount DECIMAL(10,2) NOT NULL COMMENT '订单金额',
    order_status TINYINT NOT NULL DEFAULT 1 COMMENT '1-待支付 2-已支付 3-进行中 4-已完成 5-已取消 6-退款中',
    service_time TIMESTAMP COMMENT '预约服务时间',
    order_remark TEXT COMMENT '订单备注',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (skill_id) REFERENCES skill(skill_id),
    FOREIGN KEY (employer_id) REFERENCES user(user_id),
    FOREIGN KEY (provider_id) REFERENCES user(user_id),
    FOREIGN KEY (task_id) REFERENCES task(task_id) ON DELETE SET NULL,
    INDEX idx_order_employer (employer_id),
    INDEX idx_order_provider (provider_id),
    INDEX idx_order_status (order_status),
    INDEX idx_order_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订单表';

CREATE TABLE payment (
    payment_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_id BIGINT NOT NULL,
    payment_no VARCHAR(64) UNIQUE NOT NULL COMMENT '支付流水号',
    payment_amount DECIMAL(10,2) NOT NULL,
    payment_status TINYINT NOT NULL DEFAULT 1 COMMENT '1-待支付 2-支付成功 3-支付失败 4-已退款',
    payment_method VARCHAR(20) COMMENT '支付方式: alipay,wechat,balance',
    payment_time TIMESTAMP COMMENT '支付时间',
    freeze_status TINYINT DEFAULT 1 COMMENT '1-资金冻结 2-已解冻给提供者 3-已退款给雇主',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES `order`(order_id) ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_payment_order (order_id),
    INDEX idx_payment_status (payment_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='支付记录表';

CREATE TABLE review (
    review_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_id BIGINT NOT NULL,
    reviewer_id BIGINT NOT NULL COMMENT '评价人ID',
    reviewed_id BIGINT NOT NULL COMMENT '被评价人ID',
    rating TINYINT NOT NULL COMMENT '1-5星评分',
    comment TEXT COMMENT '文字评价',
    review_type TINYINT NOT NULL COMMENT '1-雇主对提供者评价 2-提供者对雇主评价',
    is_anonymous TINYINT(1) DEFAULT FALSE COMMENT '是否匿名评价',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES `order`(order_id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (reviewer_id) REFERENCES user(user_id),
    FOREIGN KEY (reviewed_id) REFERENCES user(user_id),
    INDEX idx_review_reviewed (reviewed_id),
    UNIQUE KEY uk_order_reviewer (order_id, reviewer_id, review_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='评价表';

CREATE TABLE log (
    log_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    log_level VARCHAR(10) NOT NULL COMMENT 'INFO, ERROR, WARN, DEBUG',
    log_type VARCHAR(50) NOT NULL COMMENT '日志类型: payment, order, review, system, auth',
    user_id BIGINT COMMENT '操作用户ID',
    module VARCHAR(100) NOT NULL COMMENT '模块名称',
    action VARCHAR(100) NOT NULL COMMENT '操作动作',
    description TEXT COMMENT '日志描述',
    ip_address VARCHAR(45) COMMENT 'IP地址',
    request_params JSON COMMENT '请求参数',
    exception_info TEXT COMMENT '异常信息',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_log_level_time (log_level, created_at),
    INDEX idx_log_module (module),
    INDEX idx_log_user (user_id),
    INDEX idx_log_type (log_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统日志表';

CREATE TABLE user_credit (
    user_id BIGINT PRIMARY KEY,
    credit_score DECIMAL(3,1) DEFAULT 5.0 COMMENT '信誉分数 0-10',
    total_orders INT DEFAULT 0 COMMENT '总订单数',
    completed_orders INT DEFAULT 0 COMMENT '完成订单数',
    avg_rating DECIMAL(2,1) DEFAULT 0.0 COMMENT '平均评分',
    positive_reviews INT DEFAULT 0 COMMENT '好评数(4-5星)',
    negative_reviews INT DEFAULT 0 COMMENT '差评数(1-2星)',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户信誉表';

-- =============================================================================
-- 三、触发器设计
-- =============================================================================
DELIMITER $$

-- 触发器1: 用户注册后自动创建认证记录
CREATE TRIGGER trg_after_user_insert
AFTER INSERT ON user
FOR EACH ROW
BEGIN
    INSERT INTO user_auth (user_id, password_hash, password_salt, email_verified, phone_verified, last_password_change)
    VALUES (NEW.user_id, SHA2(CONCAT(NEW.user_id, RAND(), NOW()), 256), SUBSTRING(MD5(RAND()) FROM 1 FOR 16), 0, 0, NOW());
END$$

-- 触发器2: 用户状态变更时记录日志并处理锁定
CREATE TRIGGER trg_after_user_status_update
AFTER UPDATE ON user
FOR EACH ROW
BEGIN
    IF OLD.user_status != NEW.user_status THEN
        INSERT INTO log (log_level, log_type, user_id, module, action, description) VALUES
        ('INFO', 'user', NEW.user_id, 'user_service', 'status_change', 
         CONCAT('用户状态变更: ', OLD.user_status, ' → ', NEW.user_status));
        
        IF NEW.user_status = 'suspended' THEN
            UPDATE user_auth SET account_locked_until = DATE_ADD(NOW(), INTERVAL 30 DAY) WHERE user_id = NEW.user_id;
        ELSEIF NEW.user_status = 'active' AND OLD.user_status = 'suspended' THEN
            UPDATE user_auth SET account_locked_until = NULL, failed_login_attempts = 0 WHERE user_id = NEW.user_id;
        END IF;
    END IF;
END$$

-- 触发器3: 登录失败次数过多自动锁定账户（修复版）
CREATE TRIGGER trg_before_auth_update
BEFORE UPDATE ON user_auth
FOR EACH ROW
BEGIN
    IF NEW.failed_login_attempts >= 5 AND OLD.failed_login_attempts < 5 THEN
        SET NEW.account_locked_until = DATE_ADD(NOW(), INTERVAL 30 MINUTE);
        INSERT INTO log (log_level, log_type, user_id, module, action, description) VALUES
        ('WARN', 'auth', OLD.user_id, 'auth_service', 'account_locked', '连续登录失败5次，账户锁定30分钟');
    END IF;
    
    IF NEW.failed_login_attempts = 0 AND OLD.failed_login_attempts > 0 THEN
        SET NEW.account_locked_until = NULL;
    END IF;
END$$

-- 触发器4: 订单状态更新自动处理资金和统计
CREATE TRIGGER trg_order_after_update
AFTER UPDATE ON `order`
FOR EACH ROW
BEGIN
    IF OLD.order_status != NEW.order_status THEN
        INSERT INTO log (log_level, log_type, user_id, module, action, description) VALUES
        ('INFO', 'order', NEW.employer_id, 'order_service', 'status_change',
         CONCAT('订单状态变更: ', OLD.order_status, ' → ', NEW.order_status, '，订单号: ', NEW.order_no));
        
        IF NEW.order_status = 4 THEN  -- 已完成
            UPDATE payment SET freeze_status = 2, created_at = CURRENT_TIMESTAMP 
            WHERE order_id = NEW.order_id AND freeze_status = 1;
            
            UPDATE user_credit SET completed_orders = completed_orders + 1, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = NEW.provider_id;
            
            INSERT INTO log (log_level, log_type, user_id, module, action, description) VALUES
            ('INFO', 'payment', NEW.provider_id, 'payment_service', 'unfreeze', '资金已解冻给提供者');
        ELSEIF NEW.order_status = 5 THEN  -- 已取消
            UPDATE payment SET freeze_status = 3, created_at = CURRENT_TIMESTAMP
            WHERE order_id = NEW.order_id AND freeze_status = 1;
        ELSEIF NEW.order_status = 3 THEN  -- 进行中
            UPDATE user_credit SET total_orders = total_orders + 1, updated_at = CURRENT_TIMESTAMP
            WHERE user_id IN (NEW.employer_id, NEW.provider_id);
        END IF;
    END IF;
END$$

-- 触发器5: 支付状态更新同步订单状态
CREATE TRIGGER trg_payment_after_update
AFTER UPDATE ON payment
FOR EACH ROW
BEGIN
    IF OLD.payment_status != NEW.payment_status THEN
        SELECT employer_id INTO @employer_id FROM `order` WHERE order_id = NEW.order_id LIMIT 1;
        
        INSERT INTO log (log_level, log_type, user_id, module, action, description, request_params) VALUES
        ('INFO', 'payment', @employer_id, 'payment_service', 'status_change',
         CONCAT('支付状态变更: ', OLD.payment_status, ' → ', NEW.payment_status),
         JSON_OBJECT('payment_no', NEW.payment_no, 'order_id', NEW.order_id, 'amount', NEW.payment_amount));
        
        IF NEW.payment_status = 2 THEN  -- 支付成功
            UPDATE `order` SET order_status = 2, updated_at = CURRENT_TIMESTAMP WHERE order_id = NEW.order_id;
        ELSEIF NEW.payment_status = 4 THEN  -- 已退款
            UPDATE `order` SET order_status = 5, updated_at = CURRENT_TIMESTAMP WHERE order_id = NEW.order_id;
        END IF;
    END IF;
END$$

-- 触发器6: 评价创建时更新信誉并记录日志
CREATE TRIGGER trg_review_after_insert
AFTER INSERT ON review
FOR EACH ROW
BEGIN
    INSERT INTO log (log_level, log_type, user_id, module, action, description) VALUES
    ('INFO', 'review', NEW.reviewer_id, 'review_service', 'create_review',
     CONCAT('创建评价，评分: ', NEW.rating, '星，被评价用户: ', NEW.reviewed_id));
    
    CALL sp_update_user_credit(NEW.reviewed_id);
    
    IF NEW.rating <= 2 THEN
        INSERT INTO log (log_level, log_type, user_id, module, action, description) VALUES
        ('WARN', 'review', NEW.reviewed_id, 'review_service', 'low_rating_alert',
         CONCAT('收到差评，评分: ', NEW.rating, '星'));
    END IF;
END$$

-- 触发器7: 评价更新时重新计算信誉
CREATE TRIGGER trg_review_after_update
AFTER UPDATE ON review
FOR EACH ROW
BEGIN
    IF OLD.rating != NEW.rating THEN
        INSERT INTO log (log_level, log_type, user_id, module, action, description) VALUES
        ('INFO', 'review', NEW.reviewer_id, 'review_service', 'update_review',
         CONCAT('评价评分变更: ', OLD.rating, ' → ', NEW.rating));
        
        CALL sp_update_user_credit(NEW.reviewed_id);
    END IF;
END$$

-- 触发器8: 评价删除时更新信誉
CREATE TRIGGER trg_review_after_delete
AFTER DELETE ON review
FOR EACH ROW
BEGIN
    INSERT INTO log (log_level, log_type, user_id, module, action, description) VALUES
    ('WARN', 'review', OLD.reviewer_id, 'review_service', 'delete_review',
     CONCAT('评价被删除，原评分: ', OLD.rating, '星'));
    
    CALL sp_update_user_credit(OLD.reviewed_id);
END$$

DELIMITER ;

-- =============================================================================
-- 四、存储过程与函数
-- =============================================================================
DELIMITER $$

-- ==================== 模块A：用户认证相关 ====================
CREATE PROCEDURE sp_register_user(
    IN p_username VARCHAR(50),
    IN p_email VARCHAR(100),
    IN p_phone VARCHAR(20),
    IN p_real_name VARCHAR(50),
    IN p_gender ENUM('male', 'female', 'other'),
    IN p_role_name VARCHAR(50),
    IN p_password VARCHAR(255),
    OUT p_user_id BIGINT,
    OUT p_result_code INT,
    OUT p_message VARCHAR(255)
)
BEGIN
    DECLARE v_role_id BIGINT;
    DECLARE v_user_count INT;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_result_code = -1;
        SET p_message = '系统错误，注册失败';
    END;
    
    START TRANSACTION;
    
    SELECT COUNT(*) INTO v_user_count FROM user WHERE username = p_username;
    IF v_user_count > 0 THEN
        SET p_result_code = 1;
        SET p_message = '用户名已存在';
        ROLLBACK;
    ELSE
        SELECT COUNT(*) INTO v_user_count FROM user WHERE email = p_email;
        IF v_user_count > 0 THEN
            SET p_result_code = 2;
            SET p_message = '邮箱已被注册';
            ROLLBACK;
        ELSE
            SELECT role_id INTO v_role_id FROM role WHERE role_name = p_role_name AND is_active = 1;
            IF v_role_id IS NULL THEN
                SET p_result_code = 3;
                SET p_message = '无效的角色';
                ROLLBACK;
            ELSE
                INSERT INTO user (username, email, phone, real_name, gender, role_id, user_status)
                VALUES (p_username, p_email, p_phone, p_real_name, p_gender, v_role_id, 'pending');
                
                SET p_user_id = LAST_INSERT_ID();
                
                UPDATE user_auth 
                SET password_hash = SHA2(CONCAT(p_password, password_salt), 256),
                    last_password_change = NOW()
                WHERE user_id = p_user_id;
                
                SET p_result_code = 0;
                SET p_message = '注册成功';
                COMMIT;
            END IF;
        END IF;
    END IF;
END$$

CREATE PROCEDURE sp_authenticate_user(
    IN p_login VARCHAR(100),
    IN p_password VARCHAR(255),
    OUT p_user_id BIGINT,
    OUT p_result_code INT,
    OUT p_message VARCHAR(255)
)
BEGIN
    DECLARE v_user_record_id BIGINT;
    DECLARE v_password_hash VARCHAR(255);
    DECLARE v_password_salt VARCHAR(50);
    DECLARE v_account_locked_until TIMESTAMP;
    DECLARE v_user_status ENUM('active', 'inactive', 'suspended', 'pending');
    DECLARE v_failed_attempts INT;
    
    SELECT u.user_id, ua.password_hash, ua.password_salt, 
           ua.account_locked_until, u.user_status, ua.failed_login_attempts
    INTO v_user_record_id, v_password_hash, v_password_salt, 
         v_account_locked_until, v_user_status, v_failed_attempts
    FROM user u
    JOIN user_auth ua ON u.user_id = ua.user_id
    WHERE (u.username = p_login OR u.email = p_login);
    
    IF v_user_record_id IS NULL THEN
        SET p_result_code = 1;
        SET p_message = '用户不存在';
        SET p_user_id = NULL;
    ELSE
        IF v_user_status != 'active' THEN
            SET p_result_code = 2;
            SET p_message = CONCAT('账户状态异常: ', v_user_status);
            SET p_user_id = NULL;
        ELSEIF v_account_locked_until IS NOT NULL AND v_account_locked_until > NOW() THEN
            SET p_result_code = 3;
            SET p_message = CONCAT('账户已被锁定，请于 ', DATE_FORMAT(v_account_locked_until, '%Y-%m-%d %H:%i:%s'), ' 后重试');
            SET p_user_id = NULL;
        ELSE
            IF v_password_hash = SHA2(CONCAT(p_password, v_password_salt), 256) THEN
                UPDATE user_auth SET failed_login_attempts = 0, account_locked_until = NULL WHERE user_id = v_user_record_id;
                UPDATE user SET last_login_at = NOW(), login_count = login_count + 1 WHERE user_id = v_user_record_id;
                
                SET p_user_id = v_user_record_id;
                SET p_result_code = 0;
                SET p_message = '登录成功';
            ELSE
                UPDATE user_auth SET failed_login_attempts = failed_login_attempts + 1 WHERE user_id = v_user_record_id;
                
                SET p_result_code = 4;
                SET p_message = '密码错误';
                SET p_user_id = NULL;
            END IF;
        END IF;
    END IF;
END$$

CREATE PROCEDURE sp_change_password(
    IN p_user_id BIGINT,
    IN p_old_password VARCHAR(255),
    IN p_new_password VARCHAR(255),
    OUT p_result_code INT,
    OUT p_message VARCHAR(255)
)
BEGIN
    DECLARE v_current_hash VARCHAR(255);
    DECLARE v_salt VARCHAR(50);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_result_code = -1;
        SET p_message = '系统错误，密码修改失败';
    END;
    
    START TRANSACTION;
    
    SELECT password_hash, password_salt INTO v_current_hash, v_salt FROM user_auth WHERE user_id = p_user_id;
    
    IF v_current_hash IS NULL THEN
        SET p_result_code = 1;
        SET p_message = '用户不存在';
        ROLLBACK;
    ELSEIF v_current_hash != SHA2(CONCAT(p_old_password, v_salt), 256) THEN
        SET p_result_code = 2;
        SET p_message = '旧密码错误';
        ROLLBACK;
    ELSE
        UPDATE user_auth 
        SET password_hash = SHA2(CONCAT(p_new_password, v_salt), 256),
            last_password_change = NOW(),
            reset_token = NULL,
            reset_token_expires_at = NULL
        WHERE user_id = p_user_id;
        
        SET p_result_code = 0;
        SET p_message = '密码修改成功';
        COMMIT;
    END IF;
END$$

CREATE PROCEDURE sp_assign_user_role(
    IN p_user_id BIGINT,
    IN p_role_name VARCHAR(50),
    IN p_modified_by BIGINT,
    OUT p_result_code INT,
    OUT p_message VARCHAR(255)
)
BEGIN
    DECLARE v_role_id BIGINT;
    DECLARE v_user_count INT;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_result_code = -1;
        SET p_message = '系统错误，角色分配失败';
    END;
    
    START TRANSACTION;
    
    SELECT COUNT(*) INTO v_user_count FROM user WHERE user_id = p_user_id;
    IF v_user_count = 0 THEN
        SET p_result_code = 1;
        SET p_message = '用户不存在';
        ROLLBACK;
    ELSE
        SELECT role_id INTO v_role_id FROM role WHERE role_name = p_role_name AND is_active = 1;
        IF v_role_id IS NULL THEN
            SET p_result_code = 2;
            SET p_message = '无效的角色';
            ROLLBACK;
        ELSE
            UPDATE user SET role_id = v_role_id WHERE user_id = p_user_id;
            SET p_result_code = 0;
            SET p_message = '角色分配成功';
            COMMIT;
        END IF;
    END IF;
END$$

-- ==================== 模块B：技能任务管理 ====================
CREATE PROCEDURE sp_publish_skill(
    IN p_name VARCHAR(100),
    IN p_description TEXT,
    IN p_category_id BIGINT,
    IN p_user_id BIGINT,
    IN p_price DECIMAL(10,2),
    IN p_tag_ids TEXT,
    OUT p_skill_id BIGINT,
    OUT p_result_code INT,
    OUT p_message VARCHAR(255)
)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_result_code = -1;
        SET p_message = '系统错误，技能发布失败';
    END;
    
    START TRANSACTION;
    
    SELECT COUNT(*) INTO @user_count FROM user WHERE user_id = p_user_id AND user_status = 'active';
    IF @user_count = 0 THEN
        SET p_result_code = 1;
        SET p_message = '用户不存在或账户未激活';
        ROLLBACK;
    ELSE
        INSERT INTO skill (name, description, category_id, user_id, price, status)
        VALUES (p_name, p_description, p_category_id, p_user_id, p_price, 1);
        
        SET p_skill_id = LAST_INSERT_ID();
        
        IF p_tag_ids IS NOT NULL AND p_tag_ids != '' THEN
            SET @sql = CONCAT(
                'INSERT INTO skill_tag_relation (skill_id, tag_id) ',
                'SELECT ', p_skill_id, ', tag_id FROM tag WHERE tag_id IN (', p_tag_ids, ')'
            );
            PREPARE stmt FROM @sql;
            EXECUTE stmt;
            DEALLOCATE PREPARE stmt;
        END IF;
        
        SET p_result_code = 0;
        SET p_message = '技能发布成功';
        COMMIT;
    END IF;
END$$

CREATE PROCEDURE sp_update_skill(
    IN p_skill_id BIGINT,
    IN p_name VARCHAR(100),
    IN p_description TEXT,
    IN p_category_id BIGINT,
    IN p_price DECIMAL(10,2),
    IN p_status TINYINT,
    IN p_tag_ids TEXT,
    OUT p_result_code INT,
    OUT p_message VARCHAR(255)
)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_result_code = -1;
        SET p_message = '系统错误，技能更新失败';
    END;
    
    START TRANSACTION;
    
    SELECT COUNT(*) INTO @skill_count FROM skill WHERE skill_id = p_skill_id;
    IF @skill_count = 0 THEN
        SET p_result_code = 1;
        SET p_message = '技能不存在';
        ROLLBACK;
    ELSE
        UPDATE skill 
        SET name = p_name, description = p_description, 
            category_id = p_category_id, price = p_price, status = p_status,
            updated_at = CURRENT_TIMESTAMP
        WHERE skill_id = p_skill_id;
        
        DELETE FROM skill_tag_relation WHERE skill_id = p_skill_id;
        
        IF p_tag_ids IS NOT NULL AND p_tag_ids != '' THEN
            SET @sql = CONCAT(
                'INSERT INTO skill_tag_relation (skill_id, tag_id) ',
                'SELECT ', p_skill_id, ', tag_id FROM tag WHERE tag_id IN (', p_tag_ids, ')'
            );
            PREPARE stmt FROM @sql;
            EXECUTE stmt;
            DEALLOCATE PREPARE stmt;
        END IF;
        
        SET p_result_code = 0;
        SET p_message = '技能更新成功';
        COMMIT;
    END IF;
END$$

CREATE PROCEDURE sp_delete_skill(
    IN p_skill_id BIGINT,
    OUT p_result_code INT,
    OUT p_message VARCHAR(255)
)
BEGIN
    SELECT COUNT(*) INTO @task_count FROM task WHERE skill_id = p_skill_id;
    
    IF @task_count > 0 THEN
        SET p_result_code = 1;
        SET p_message = '技能存在关联任务，无法删除';
    ELSE
        START TRANSACTION;
        DELETE FROM skill_tag_relation WHERE skill_id = p_skill_id;
        DELETE FROM skill WHERE skill_id = p_skill_id;
        SET p_result_code = 0;
        SET p_message = '技能删除成功';
        COMMIT;
    END IF;
END$$

CREATE PROCEDURE sp_search_skills(
    IN p_keyword VARCHAR(100),
    IN p_category_id BIGINT,
    IN p_tag_id BIGINT,
    IN p_min_price DECIMAL(10,2),
    IN p_max_price DECIMAL(10,2),
    IN p_page INT,
    IN p_page_size INT
)
BEGIN
    SET @offset = (p_page - 1) * p_page_size;
    SET @where_clause = 'WHERE s.status = 1';
    
    IF p_keyword IS NOT NULL AND p_keyword != '' THEN
        SET @where_clause = CONCAT(@where_clause, ' AND (s.name LIKE ''%', p_keyword, '%'' OR s.description LIKE ''%', p_keyword, '%'')');
    END IF;
    
    IF p_category_id > 0 THEN
        SET @where_clause = CONCAT(@where_clause, ' AND s.category_id = ', p_category_id);
    END IF;
    
    IF p_tag_id > 0 THEN
        SET @where_clause = CONCAT(@where_clause, ' AND s.skill_id IN (SELECT skill_id FROM skill_tag_relation WHERE tag_id = ', p_tag_id, ')');
    END IF;
    
    IF p_min_price IS NOT NULL THEN
        SET @where_clause = CONCAT(@where_clause, ' AND s.price >= ', p_min_price);
    END IF;
    
    IF p_max_price IS NOT NULL THEN
        SET @where_clause = CONCAT(@where_clause, ' AND s.price <= ', p_max_price);
    END IF;
    
    SET @sql = CONCAT(
        'SELECT s.skill_id, s.name, s.description, s.price, c.name AS category_name, u.username as provider_name ',
        'FROM skill s ',
        'LEFT JOIN category c ON s.category_id = c.category_id ',
        'LEFT JOIN user u ON s.user_id = u.user_id ',
        @where_clause,
        ' ORDER BY s.created_at DESC ',
        'LIMIT ', @offset, ', ', p_page_size
    );
    
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
    
    SET @count_sql = CONCAT('SELECT COUNT(*) AS total FROM skill s ', @where_clause);
    PREPARE count_stmt FROM @count_sql;
    EXECUTE count_stmt;
    DEALLOCATE PREPARE count_stmt;
END$$

CREATE PROCEDURE sp_publish_task(
    IN p_title VARCHAR(200),
    IN p_description TEXT,
    IN p_skill_id BIGINT,
    IN p_publisher_id BIGINT,
    IN p_budget DECIMAL(10,2),
    IN p_deadline TIMESTAMP,
    OUT p_task_id BIGINT,
    OUT p_result_code INT,
    OUT p_message VARCHAR(255)
)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_result_code = -1;
        SET p_message = '系统错误，任务发布失败';
    END;
    
    START TRANSACTION;
    
    SELECT COUNT(*) INTO @skill_count FROM skill WHERE skill_id = p_skill_id AND status = 1;
    IF @skill_count = 0 THEN
        SET p_result_code = 1;
        SET p_message = '技能不存在或不可用';
        ROLLBACK;
    ELSE
        INSERT INTO task (title, description, skill_id, publisher_id, budget, deadline, status)
        VALUES (p_title, p_description, p_skill_id, p_publisher_id, p_budget, p_deadline, 0);
        
        SET p_task_id = LAST_INSERT_ID();
        SET p_result_code = 0;
        SET p_message = '任务发布成功';
        COMMIT;
    END IF;
END$$

CREATE PROCEDURE sp_accept_task(
    IN p_task_id BIGINT,
    IN p_receiver_id BIGINT,
    OUT p_result_code INT,
    OUT p_message VARCHAR(255)
)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_result_code = -1;
        SET p_message = '系统错误，接单失败';
    END;
    
    START TRANSACTION;
    
    SELECT status INTO @current_status FROM task WHERE task_id = p_task_id FOR UPDATE;
    
    IF @current_status IS NULL THEN
        SET p_result_code = 1;
        SET p_message = '任务不存在';
        ROLLBACK;
    ELSEIF @current_status != 0 THEN
        SET p_result_code = 2;
        SET p_message = '任务已被接单或已完成';
        ROLLBACK;
    ELSE
        UPDATE task SET receiver_id = p_receiver_id, status = 1, updated_at = CURRENT_TIMESTAMP
        WHERE task_id = p_task_id;
        
        SET p_result_code = 0;
        SET p_message = '接单成功';
        COMMIT;
    END IF;
END$$

CREATE PROCEDURE sp_confirm_task_complete(
    IN p_task_id BIGINT,
    IN p_publisher_id BIGINT,
    OUT p_result_code INT,
    OUT p_message VARCHAR(255)
)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_result_code = -1;
        SET p_message = '系统错误，确认完成失败';
    END;
    
    START TRANSACTION;
    
    SELECT COUNT(*) INTO @task_count 
    FROM task 
    WHERE task_id = p_task_id AND publisher_id = p_publisher_id AND status = 1;
    
    IF @task_count = 0 THEN
        SET p_result_code = 1;
        SET p_message = '任务不存在、状态不正确或无权操作';
        ROLLBACK;
    ELSE
        UPDATE task SET status = 2, updated_at = CURRENT_TIMESTAMP WHERE task_id = p_task_id;
        SET p_result_code = 0;
        SET p_message = '任务完成确认成功';
        COMMIT;
    END IF;
END$$

-- 新增：添加分类（补充缺失功能）
CREATE PROCEDURE sp_add_category(
    IN p_name VARCHAR(50),
    IN p_parent_id BIGINT,
    IN p_sort INT,
    OUT p_category_id BIGINT,
    OUT p_result_code INT,
    OUT p_message VARCHAR(255)
)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_result_code = -1;
        SET p_message = '系统错误，分类添加失败';
    END;
    
    START TRANSACTION;
    
    SELECT COUNT(*) INTO @name_count FROM category WHERE name = p_name;
    IF @name_count > 0 THEN
        SET p_result_code = 1;
        SET p_message = '分类名称已存在';
        ROLLBACK;
    ELSE
        INSERT INTO category (name, parent_id, sort) VALUES (p_name, p_parent_id, p_sort);
        SET p_category_id = LAST_INSERT_ID();
        SET p_result_code = 0;
        SET p_message = '分类添加成功';
        COMMIT;
    END IF;
END$$

-- 新增：添加标签（补充缺失功能）
CREATE PROCEDURE sp_add_tag(
    IN p_name VARCHAR(50),
    OUT p_tag_id BIGINT
)
BEGIN
    SELECT tag_id INTO p_tag_id FROM tag WHERE name = p_name;
    
    IF p_tag_id IS NULL THEN
        INSERT INTO tag (name) VALUES (p_name);
        SET p_tag_id = LAST_INSERT_ID();
    END IF;
END$$

-- 新增：获取子分类（补充缺失功能）
CREATE PROCEDURE sp_get_sub_categories(
    IN p_parent_id BIGINT
)
BEGIN
    SELECT category_id, name, parent_id, sort, created_at FROM category 
    WHERE parent_id = p_parent_id 
    ORDER BY sort ASC;
END$$

-- ==================== 模块C：交易与评价 ====================
CREATE PROCEDURE sp_create_order_with_payment(
    IN p_skill_id BIGINT,
    IN p_employer_id BIGINT,
    IN p_provider_id BIGINT,
    IN p_order_amount DECIMAL(10,2),
    IN p_service_time TIMESTAMP,
    IN p_order_remark TEXT,
    IN p_payment_method VARCHAR(20),
    IN p_task_id BIGINT,
    OUT p_order_no VARCHAR(64),
    OUT p_payment_no VARCHAR(64),
    OUT p_result_code INT,
    OUT p_message VARCHAR(255)
)
BEGIN
    DECLARE v_order_id BIGINT;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_result_code = -1;
        SET p_message = '系统错误，订单创建失败';
    END;
    
    START TRANSACTION;
    
    SELECT COUNT(*) INTO @valid_count 
    FROM skill s 
    JOIN user u1 ON s.user_id = p_provider_id
    JOIN user u2 ON u2.user_id = p_employer_id
    WHERE s.skill_id = p_skill_id AND s.status = 1 
    AND u1.user_status = 'active' AND u2.user_status = 'active';
    
    IF @valid_count = 0 THEN
        SET p_result_code = 1;
        SET p_message = '技能或用户状态异常';
        ROLLBACK;
    ELSE
        SET p_order_no = CONCAT('ORD', DATE_FORMAT(NOW(), '%Y%m%d%H%i%s'), LPAD(FLOOR(RAND() * 10000), 4, '0'));
        
        INSERT INTO `order` (order_no, skill_id, employer_id, provider_id, order_amount, service_time, order_remark, task_id)
        VALUES (p_order_no, p_skill_id, p_employer_id, p_provider_id, p_order_amount, p_service_time, p_order_remark, p_task_id);
        
        SET v_order_id = LAST_INSERT_ID();
        
        SET p_payment_no = CONCAT('PAY', DATE_FORMAT(NOW(), '%Y%m%d%H%i%s'), LPAD(FLOOR(RAND() * 10000), 4, '0'));
        
        INSERT INTO payment (order_id, payment_no, payment_amount, payment_method, freeze_status)
        VALUES (v_order_id, p_payment_no, p_order_amount, p_payment_method, 1);
        
        SET p_result_code = 0;
        SET p_message = '订单创建成功';
        COMMIT;
    END IF;
END$$

CREATE PROCEDURE sp_simulate_payment(
    IN p_payment_id BIGINT,
    IN p_payment_status TINYINT,
    OUT p_result_code INT,
    OUT p_message VARCHAR(255)
)
BEGIN
    DECLARE v_order_id BIGINT;
    DECLARE v_employer_id BIGINT;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_result_code = -1;
        SET p_message = '系统错误，支付处理失败';
    END;
    
    START TRANSACTION;
    
    SELECT order_id INTO v_order_id FROM payment WHERE payment_id = p_payment_id;
    
    IF v_order_id IS NULL THEN
        SET p_result_code = 1;
        SET p_message = '支付记录不存在';
        ROLLBACK;
    ELSE
        SELECT employer_id INTO v_employer_id FROM `order` WHERE order_id = v_order_id;
        
        UPDATE payment SET payment_status = p_payment_status, payment_time = CURRENT_TIMESTAMP
        WHERE payment_id = p_payment_id;
        
        SET p_result_code = 0;
        SET p_message = '支付状态更新成功';
        COMMIT;
    END IF;
END$$

CREATE PROCEDURE sp_create_review(
    IN p_order_id BIGINT,
    IN p_reviewer_id BIGINT,
    IN p_reviewed_id BIGINT,
    IN p_rating TINYINT,
    IN p_comment TEXT,
    IN p_review_type TINYINT,
    IN p_is_anonymous TINYINT(1),
    OUT p_result_code INT,
    OUT p_message VARCHAR(255)
)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_result_code = -1;
        SET p_message = '系统错误，评价创建失败';
    END;
    
    START TRANSACTION;
    
    SELECT COUNT(*) INTO @order_count 
    FROM `order` 
    WHERE order_id = p_order_id 
    AND (employer_id = p_reviewer_id OR provider_id = p_reviewer_id);
    
    IF @order_count = 0 THEN
        SET p_result_code = 1;
        SET p_message = '订单不存在或无权评价';
        ROLLBACK;
    ELSE
        SELECT COUNT(*) INTO @review_count 
        FROM review 
        WHERE order_id = p_order_id AND reviewer_id = p_reviewer_id AND review_type = p_review_type;
        
        IF @review_count > 0 THEN
            SET p_result_code = 2;
            SET p_message = '您已经对该订单进行过评价';
            ROLLBACK;
        ELSEIF p_rating < 1 OR p_rating > 5 THEN
            SET p_result_code = 3;
            SET p_message = '评分必须在1-5之间';
            ROLLBACK;
        ELSE
            INSERT INTO review (order_id, reviewer_id, reviewed_id, rating, comment, review_type, is_anonymous)
            VALUES (p_order_id, p_reviewer_id, p_reviewed_id, p_rating, p_comment, p_review_type, p_is_anonymous);
            
            SET p_result_code = 0;
            SET p_message = '评价创建成功';
            COMMIT;
        END IF;
    END IF;
END$$

CREATE PROCEDURE sp_update_user_credit(IN p_user_id BIGINT)
BEGIN
    DECLARE v_avg_rating DECIMAL(2,1);
    DECLARE v_positive_count INT;
    DECLARE v_negative_count INT;
    DECLARE v_credit_score DECIMAL(3,1);
    DECLARE v_total_reviews INT;
    DECLARE v_completed_orders INT;
    DECLARE v_total_orders INT;
    
    SELECT AVG(rating), COUNT(CASE WHEN rating >= 4 THEN 1 END), COUNT(CASE WHEN rating <= 2 THEN 1 END)
    INTO v_avg_rating, v_positive_count, v_negative_count
    FROM review WHERE reviewed_id = p_user_id;
    
    SELECT COUNT(CASE WHEN order_status = 4 THEN 1 END), COUNT(*)
    INTO v_completed_orders, v_total_orders
    FROM `order` WHERE provider_id = p_user_id OR employer_id = p_user_id;
    
    SET v_total_reviews = v_positive_count + v_negative_count;
    
    IF v_total_reviews > 0 AND v_avg_rating IS NOT NULL THEN
        SET v_credit_score = ROUND(v_avg_rating * 2 * (v_positive_count / v_total_reviews), 1);
    ELSE
        SET v_credit_score = 5.0;
    END IF;
    
    IF v_credit_score > 10 THEN SET v_credit_score = 10.0; END IF;
    IF v_credit_score < 0 THEN SET v_credit_score = 0.0; END IF;
    
    INSERT INTO user_credit (user_id, credit_score, avg_rating, positive_reviews, negative_reviews, total_orders, completed_orders)
    VALUES (p_user_id, v_credit_score, ROUND(COALESCE(v_avg_rating, 0), 1), 
            COALESCE(v_positive_count, 0), COALESCE(v_negative_count, 0), 
            COALESCE(v_total_orders, 0), COALESCE(v_completed_orders, 0))
    ON DUPLICATE KEY UPDATE
        credit_score = v_credit_score,
        avg_rating = ROUND(COALESCE(v_avg_rating, 0), 1),
        positive_reviews = COALESCE(v_positive_count, 0),
        negative_reviews = COALESCE(v_negative_count, 0),
        total_orders = COALESCE(v_total_orders, 0),
        completed_orders = COALESCE(v_completed_orders, 0),
        updated_at = CURRENT_TIMESTAMP;
END$$

-- ==================== 通用函数 ====================
CREATE FUNCTION fn_check_user_permission(p_user_id BIGINT, p_permission_code VARCHAR(50)) RETURNS BOOLEAN
READS SQL DATA
DETERMINISTIC
BEGIN
    DECLARE v_has_permission BOOLEAN DEFAULT FALSE;
    
    SELECT COUNT(*) > 0 INTO v_has_permission
    FROM user u
    JOIN role r ON u.role_id = r.role_id
    JOIN role_permission rp ON r.role_id = rp.role_id
    JOIN permission p ON rp.permission_id = p.permission_id
    WHERE u.user_id = p_user_id AND u.user_status = 'active' AND r.is_active = 1 AND p.is_active = 1 AND p.permission_code = p_permission_code;
    
    RETURN v_has_permission;
END$$

CREATE FUNCTION fn_get_user_role(p_user_id BIGINT) RETURNS VARCHAR(50)
READS SQL DATA
DETERMINISTIC
BEGIN
    DECLARE v_role_name VARCHAR(50);
    SELECT r.role_name INTO v_role_name FROM user u JOIN role r ON u.role_id = r.role_id WHERE u.user_id = p_user_id;
    RETURN v_role_name;
END$$

CREATE FUNCTION fn_check_email_available(p_email VARCHAR(100)) RETURNS BOOLEAN
READS SQL DATA
DETERMINISTIC
BEGIN
    DECLARE v_email_count INT DEFAULT 0;
    SELECT COUNT(*) INTO v_email_count FROM user WHERE email = p_email;
    RETURN v_email_count = 0;
END$$

CREATE FUNCTION fn_check_username_available(p_username VARCHAR(50)) RETURNS BOOLEAN
READS SQL DATA
DETERMINISTIC
BEGIN
    DECLARE v_username_count INT DEFAULT 0;
    SELECT COUNT(*) INTO v_username_count FROM user WHERE username = p_username;
    RETURN v_username_count = 0;
END$$

CREATE FUNCTION fn_calculate_user_activity_score(p_user_id BIGINT) RETURNS INT
READS SQL DATA
DETERMINISTIC
BEGIN
    DECLARE v_score INT DEFAULT 0;
    DECLARE v_login_count INT;
    DECLARE v_user_status VARCHAR(20);
    DECLARE v_last_login_days INT;
    DECLARE v_total_orders INT;
    
    SELECT login_count, user_status, DATEDIFF(NOW(), COALESCE(last_login_at, created_at))
    INTO v_login_count, v_user_status, v_last_login_days
    FROM user WHERE user_id = p_user_id;
    
    SELECT COUNT(*) INTO v_total_orders FROM `order` WHERE employer_id = p_user_id OR provider_id = p_user_id;
    
    SET v_score = v_login_count * 10 + v_total_orders * 5;
    
    IF v_user_status = 'active' THEN
        SET v_score = v_score + 50;
    END IF;
    
    IF v_last_login_days <= 30 THEN
        SET v_score = v_score + (30 - v_last_login_days);
    END IF;
    
    RETURN GREATEST(v_score, 0);
END$$

DELIMITER ;

-- =============================================================================
-- 五、视图设计
-- =============================================================================
CREATE VIEW user_profile_view AS
SELECT 
    u.user_id,
    u.username,
    u.email,
    u.phone,
    u.real_name,
    u.gender,
    u.id_card_verified,
    r.role_name,
    r.role_description,
    u.user_status,
    u.last_login_at,
    u.login_count,
    ua.email_verified,
    ua.phone_verified,
    u.created_at,
    fn_calculate_user_activity_score(u.user_id) as activity_score,
    uc.credit_score,
    uc.total_orders,
    uc.completed_orders,
    uc.avg_rating,
    uc.positive_reviews,
    uc.negative_reviews
FROM user u
JOIN role r ON u.role_id = r.role_id
JOIN user_auth ua ON u.user_id = ua.user_id
LEFT JOIN user_credit uc ON u.user_id = uc.user_id;

CREATE VIEW skill_detail_view AS
SELECT 
    s.skill_id,
    s.name,
    s.description,
    s.price,
    s.status,
    s.created_at,
    c.name as category_name,
    u.user_id as provider_id,
    u.username as provider_name,
    uc.credit_score,
    GROUP_CONCAT(t.name) as tags
FROM skill s
JOIN category c ON s.category_id = c.category_id
JOIN user u ON s.user_id = u.user_id
LEFT JOIN user_credit uc ON s.user_id = uc.user_id
LEFT JOIN skill_tag_relation str ON s.skill_id = str.skill_id
LEFT JOIN tag t ON str.tag_id = t.tag_id
WHERE s.status = 1 AND u.user_status = 'active'
GROUP BY s.skill_id;

CREATE VIEW order_detail_view AS
SELECT 
    o.order_id,
    o.order_no,
    o.skill_id,
    s.name as skill_name,
    o.employer_id,
    ue.username as employer_name,
    o.provider_id,
    up.username as provider_name,
    o.order_amount,
    o.order_status,
    o.service_time,
    o.created_at,
    p.payment_no,
    p.payment_status,
    p.freeze_status
FROM `order` o
JOIN skill s ON o.skill_id = s.skill_id
JOIN user ue ON o.employer_id = ue.user_id
JOIN user up ON o.provider_id = up.user_id
LEFT JOIN payment p ON o.order_id = p.order_id;

-- =============================================================================
-- 六、初始化数据
-- =============================================================================
INSERT INTO role (role_name, role_description) VALUES 
('admin', '系统管理员，拥有所有权限'),
('skill_provider', '技能提供者，可以发布技能并提供服务'),
('skill_demander', '技能需求者，可以购买技能和发布任务'),
('moderator', '内容审核员，负责审核内容和处理举报');

INSERT INTO permission (permission_code, permission_name, permission_description, module) VALUES 
('user:manage', '用户管理', '管理用户账户和信息', 'user'),
('role:manage', '角色管理', '管理角色和权限分配', 'system'),
('system:config', '系统配置', '修改系统配置参数', 'system'),
('skill:create', '创建技能', '发布新的技能服务', 'skill'),
('skill:update', '更新技能', '修改已发布的技能信息', 'skill'),
('skill:delete', '删除技能', '删除已发布的技能', 'skill'),
('skill:browse', '浏览技能', '查看和搜索技能服务', 'skill'),
('skill:publish', '技能发布权限', '允许用户发布技能', 'skill'),
('skill:manage', '管理技能', '管理所有技能（管理员）', 'skill'),
('task:create', '创建任务', '发布新的任务需求', 'task'),
('task:update', '更新任务', '修改已发布的任务信息', 'task'),
('task:delete', '删除任务', '删除已发布的任务', 'task'),
('task:browse', '浏览任务', '查看和搜索任务需求', 'task'),
('task:accept', '接受任务', '接受并完成任务的权限', 'task'),
('order:create', '创建订单', '发起技能交换订单', 'order'),
('order:manage', '管理订单', '处理和管理订单状态', 'order'),
('payment:refund', '退款处理', '处理订单退款', 'payment'),
('chat:access', '聊天权限', '使用聊天功能沟通', 'chat'),
('content:review', '内容审核', '审核用户发布的内容', 'moderation'),
('user:review', '用户审核', '审核用户注册和认证', 'moderation'),
('report:handle', '处理举报', '处理用户举报内容', 'moderation');

INSERT INTO role_permission (role_id, permission_id)
SELECT r.role_id, p.permission_id FROM role r, permission p WHERE r.role_name = 'admin';

INSERT INTO role_permission (role_id, permission_id)
SELECT r.role_id, p.permission_id 
FROM role r
JOIN permission p ON p.permission_code IN ('skill:create', 'skill:update', 'skill:delete', 'skill:browse', 'task:accept', 'chat:access')
WHERE r.role_name = 'skill_provider';

INSERT INTO role_permission (role_id, permission_id)
SELECT r.role_id, p.permission_id 
FROM role r
JOIN permission p ON p.permission_code IN ('skill:browse', 'task:create', 'task:update', 'task:delete', 'order:create', 'chat:access')
WHERE r.role_name = 'skill_demander';

INSERT INTO role_permission (role_id, permission_id)
SELECT r.role_id, p.permission_id 
FROM role r
JOIN permission p ON p.permission_code IN ('content:review', 'user:review', 'report:handle')
WHERE r.role_name = 'moderator';

INSERT INTO category (name, parent_id, sort) VALUES
('编程开发', NULL, 1),
('设计创意', NULL, 2),
('语言学习', NULL, 3),
('音乐艺术', NULL, 4);

INSERT INTO tag (name) VALUES
('Python'), ('Java'), ('前端开发'), ('UI设计'), ('英语口语'), ('吉他'), ('摄影');

-- =============================================================================
-- 七、终极版测试用例（防重复、全覆盖）
-- =============================================================================

SELECT '========== 初始化测试环境（自动清理旧数据） ==========' AS test_phase;

-- 清理旧测试数据（通过用户名标记）
DELETE FROM user WHERE username LIKE 'test_%';
DELETE FROM user WHERE username = 'locked_user';
DELETE FROM skill WHERE name IN ('Python数据分析实战', 'JavaScript全栈开发', '摄影教学');
SET SQL_SAFE_UPDATES = 0;  -- 仅当前会话有效
DELETE FROM task WHERE title LIKE '%测试%';
SET SQL_SAFE_UPDATES = 1;  -- 恢复安全模式
DELETE FROM `order` WHERE order_no LIKE 'TEST_%';
DELETE FROM payment WHERE payment_no LIKE 'TEST_%';

-- 获取角色ID
SET @admin_role_id = (SELECT role_id FROM role WHERE role_name = 'admin' LIMIT 1);
SET @provider_role_id = (SELECT role_id FROM role WHERE role_name = 'skill_provider' LIMIT 1);
SET @demander_role_id = (SELECT role_id FROM role WHERE role_name = 'skill_demander' LIMIT 1);

-- 创建测试用户（使用唯一邮箱）
SET @unique_suffix = REPLACE(UUID(), '-', '');
INSERT INTO user (username, email, phone, real_name, gender, role_id, user_status) VALUES
('test_admin', CONCAT('admin_', @unique_suffix, '@example.com'), '13800138000', '管理员', 'male', @admin_role_id, 'active'),
('test_provider', CONCAT('provider_', @unique_suffix, '@example.com'), '13800138001', '提供者', 'male', @provider_role_id, 'active'),
('test_demander', CONCAT('demander_', @unique_suffix, '@example.com'), '13800138002', '需求者', 'female', @demander_role_id, 'active'),
('locked_user', CONCAT('locked_', @unique_suffix, '@example.com'), '13800138003', '锁定用户', 'male', @provider_role_id, 'suspended');

-- 设置测试用户密码
UPDATE user_auth ua
JOIN user u ON ua.user_id = u.user_id
SET ua.password_hash = SHA2(CONCAT('Test123!', ua.password_salt), 256)
WHERE u.username LIKE 'test_%' OR u.username = 'locked_user';

-- 获取测试用户ID
SET @admin_id = (SELECT user_id FROM user WHERE username = 'test_admin');
SET @provider_id = (SELECT user_id FROM user WHERE username = 'test_provider');
SET @demander_id = (SELECT user_id FROM user WHERE username = 'test_demander');
SET @locked_user_id = (SELECT user_id FROM user WHERE username = 'locked_user');

SELECT '========== 场景1：用户认证与锁定机制测试 ==========' AS test_phase;

-- 测试1.1：正常登录
CALL sp_authenticate_user('test_provider', 'Test123!', @user_id, @code, @msg);
SELECT IF(@code = 0, '✅ 登录成功', CONCAT('❌ 登录失败: ', @msg)) AS test_result;

-- 测试1.2：密码错误5次触发锁定
CALL sp_authenticate_user('test_provider', 'WrongPass', @user_id1, @code1, @msg1);
CALL sp_authenticate_user('test_provider', 'WrongPass', @user_id2, @code2, @msg2);
CALL sp_authenticate_user('test_provider', 'WrongPass', @user_id3, @code3, @msg3);
CALL sp_authenticate_user('test_provider', 'WrongPass', @user_id4, @code4, @msg4);
CALL sp_authenticate_user('test_provider', 'WrongPass', @user_id5, @code5, @msg5);
SELECT IF(@code5 = 3, '✅ 账户锁定触发', CONCAT('❌ 未锁定: ', @msg5)) AS test_result;

-- 测试1.3：解锁后成功登录
UPDATE user_auth SET failed_login_attempts = 0 WHERE user_id = @provider_id;
CALL sp_authenticate_user('test_provider', 'Test123!', @user_id, @code, @msg);
SELECT IF(@code = 0, '✅ 解锁后登录成功', CONCAT('❌ 解锁失败: ', @msg)) AS test_result;

-- 测试1.4：权限检查
SELECT 
    fn_check_user_permission(@provider_id, 'skill:create') AS provider_skill_create,
    fn_check_user_permission(@provider_id, 'user:manage') AS provider_user_manage,
    fn_check_user_permission(@admin_id, 'user:manage') AS admin_user_manage,
    '✅ 权限检查完成' AS test_result;

-- 测试1.5：修改密码
CALL sp_change_password(@provider_id, 'Test123!', 'NewPass123!', @code, @msg);
SELECT IF(@code = 0, '✅ 密码修改成功', CONCAT('❌ 修改失败: ', @msg)) AS test_result;
CALL sp_change_password(@provider_id, 'NewPass123!', 'Test123!', @code2, @msg2); -- 恢复密码

SELECT '========== 场景2：技能与任务全生命周期测试 ==========' AS test_phase;

-- 测试2.1：添加多级分类
INSERT INTO category (name, parent_id, sort) VALUES
('编程语言', 1, 1),
('Web开发', 1, 2),
('Python', 9, 1),
('JavaScript', 10, 1);

-- 测试2.2：发布多个技能
INSERT INTO tag (name) VALUES ('Pandas'), ('NumPy'), ('Vue.js'), ('React');
SET @tag_ids_python = (SELECT GROUP_CONCAT(tag_id) FROM tag WHERE name IN ('Pandas', 'NumPy'));
SET @tag_ids_js = (SELECT GROUP_CONCAT(tag_id) FROM tag WHERE name IN ('Vue.js', 'React'));

CALL sp_publish_skill('Python数据分析实战', 'pandas/numpy数据处理', 11, @provider_id, 150.00, @tag_ids_python, @skill_id1, @code, @msg);
SELECT IF(@code = 0, '✅ 技能1发布成功', CONCAT('❌ 失败: ', @msg)) AS test_result;

CALL sp_publish_skill('JavaScript全栈开发', 'Vue/React企业级项目', 12, @provider_id, 200.00, @tag_ids_js, @skill_id2, @code, @msg);
SELECT IF(@code = 0, '✅ 技能2发布成功', CONCAT('❌ 失败: ', @msg)) AS test_result;

-- 测试2.3：更新技能价格
CALL sp_update_skill(@skill_id1, 'Python数据分析实战', '新增机器学习', 11, 180.00, 1, @tag_ids_python, @code, @msg);
SELECT IF(@code = 0, '✅ 技能更新成功', CONCAT('❌ 更新失败: ', @msg)) AS test_result;

-- 测试2.4：搜索技能
CALL sp_search_skills('Python', 0, 0, 100, 300, 1, 5);
SELECT '✅ 分页搜索测试完成' AS test_result;

-- 测试2.5：任务全生命周期
CALL sp_publish_task('电商爬虫系统开发', '开发商品数据采集系统', @skill_id1, @demander_id, 800.00, DATE_ADD(NOW(), INTERVAL 7 DAY), @task_id, @code, @msg);
SELECT IF(@code = 0, '✅ 任务发布成功', CONCAT('❌ 失败: ', @msg)) AS test_result;

CALL sp_accept_task(@task_id, @provider_id, @code, @msg);
SELECT IF(@code = 0, '✅ 任务接单成功', CONCAT('❌ 失败: ', @msg)) AS test_result;

CALL sp_confirm_task_complete(@task_id, @demander_id, @code, @msg);
SELECT IF(@code = 0, '✅ 任务完成确认', CONCAT('❌ 失败: ', @msg)) AS test_result;

SELECT status INTO @task_final_status FROM task WHERE task_id = @task_id;
SELECT IF(@task_final_status = 2, '✅ 任务状态正确', '❌ 状态错误') AS test_result;

SELECT '========== 场景3：订单与支付全流程测试 ==========' AS test_phase;

-- 测试3.1：创建订单并支付
CALL sp_create_order_with_payment(@skill_id2, @demander_id, @provider_id, 200.00, DATE_ADD(NOW(), INTERVAL 2 DAY), '紧急需求', 'alipay', NULL, @order_no1, @payment_no1, @code, @msg);
SELECT IF(@code = 0, '✅ 订单创建成功', CONCAT('❌ 失败: ', @msg)) AS test_result;

CALL sp_simulate_payment((SELECT payment_id FROM payment WHERE payment_no = @payment_no1), 2, @code, @msg);
SELECT IF(@code = 0, '✅ 支付成功', CONCAT('❌ 失败: ', @msg)) AS test_result;

SELECT order_status INTO @order_status_after_pay FROM `order` WHERE order_no = @order_no1;
SELECT IF(@order_status_after_pay = 2, '✅ 状态自动更新', '❌ 状态错误') AS test_result;

-- 测试3.2：双向评价
CALL sp_create_review((SELECT order_id FROM `order` WHERE order_no = @order_no1), @demander_id, @provider_id, 5, '非常专业！', 1, 0, @code, @msg);
SELECT IF(@code = 0, '✅ 雇主评价成功', CONCAT('❌ 失败: ', @msg)) AS test_result;

CALL sp_create_review((SELECT order_id FROM `order` WHERE order_no = @order_no1), @provider_id, @demander_id, 4, '合作愉快', 2, 0, @code, @msg);
SELECT IF(@code = 0, '✅ 提供者评价成功', CONCAT('❌ 失败: ', @msy)) AS test_result;

SELECT '========== 场景4：资金冻结与解冻测试 ==========' AS test_phase;

-- 测试4.1：创建大额订单并支付
CALL sp_create_order_with_payment(@skill_id1, @demander_id, @provider_id, 1000.00, DATE_ADD(NOW(), INTERVAL 5 DAY), '企业项目', 'wechat', NULL, @order_no2, @payment_no2, @code, @msg);
CALL sp_simulate_payment((SELECT payment_id FROM payment WHERE payment_no = @payment_no2), 2, @code2, @msg2);

SELECT freeze_status INTO @freeze_status_after_pay FROM payment WHERE payment_no = @payment_no2;
SELECT IF(@freeze_status_after_pay = 1, '✅ 资金已冻结', '❌ 冻结失败') AS test_result;

-- 测试4.2：模拟订单完成解冻
UPDATE `order` SET order_status = 4 WHERE order_no = @order_no2;

SELECT freeze_status INTO @freeze_status_after_complete FROM payment WHERE payment_no = @payment_no2;
SELECT IF(@freeze_status_after_complete = 2, '✅ 资金已解冻', '❌ 解冻失败') AS test_result;

SELECT '========== 场景5：异常流程拦截测试 ==========' AS test_phase;

-- 测试5.1：重复评价
CALL sp_create_review((SELECT order_id FROM `order` WHERE order_no = @order_no1), @demander_id, @provider_id, 3, '重复评价', 1, 0, @code, @msg);
SELECT IF(@code = 2, '✅ 重复评价拦截', CONCAT('❌ 应拦截: ', @msg)) AS test_result;

-- 测试5.2：评分越界
CALL sp_create_review((SELECT order_id FROM `order` WHERE order_no = @order_no1), @demander_id, @provider_id, 6, '评分错误', 1, 0, @code, @msg);
SELECT IF(@code = 3, '✅ 评分范围拦截', CONCAT('❌ 应拦截: ', @msg)) AS test_result;

-- 测试5.3：删除关联技能
CALL sp_delete_skill(@skill_id1, @code, @msg);
SELECT IF(@code <> 0, '✅ 删除保护生效', CONCAT('❌ 应保护: ', @msg)) AS test_result;

SELECT '========== 场景6：数据统计与视图查询 ==========' AS test_phase;

-- 测试6.1：用户完整信息视图
SELECT user_id, username, role_name, credit_score, activity_score, total_orders 
FROM user_profile_view WHERE user_id = @provider_id;

-- 测试6.2：技能详情视图
SELECT skill_id, name, category_name, provider_name, credit_score, tags 
FROM skill_detail_view WHERE skill_id = @skill_id1;

-- 测试6.3：订单详情视图
SELECT order_no, skill_name, employer_name, provider_name, order_amount, payment_status, freeze_status 
FROM order_detail_view WHERE order_no = @order_no1;

-- 测试6.4：活跃度计算
SELECT 
    u.username,
    fn_calculate_user_activity_score(u.user_id) as activity,
    uc.credit_score
FROM user u
LEFT JOIN user_credit uc ON u.user_id = uc.user_id
WHERE u.user_id IN (@provider_id, @demander_id);

-- 测试6.5：日志统计
SELECT log_type, COUNT(*) as count FROM log 
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
GROUP BY log_type;

SELECT '========== 测试完成 - 统计汇总 ==========' AS test_phase;

SELECT 
    (SELECT COUNT(*) FROM user) as total_users,
    (SELECT COUNT(*) FROM skill) as total_skills,
    (SELECT COUNT(*) FROM task) as total_tasks,
    (SELECT COUNT(*) FROM `order`) as total_orders,
    (SELECT COUNT(*) FROM payment) as total_payments,
    (SELECT COUNT(*) FROM review) as total_reviews,
    (SELECT COUNT(*) FROM log) as total_logs;

-- =============================================================================
-- 八、关键修改说明
-- =============================================================================

/*
本次整合主要修改内容：

1. **数据库统一**：合并3个数据库(skill_exchange_platform/skill_platform/skill_task_db)为单一数据库

2. **数据类型标准化**：
   - 所有表主键统一使用 BIGINT AUTO_INCREMENT
   - 所有外键字段统一使用 BIGINT
   - 时间戳字段统一使用 TIMESTAMP

3. **表结构补充**：
   - skill表：补充user_id外键（关联用户表）
   - task表：补充publisher_id/receiver_id外键（关联用户表）
   - order表：补充task_id字段（关联任务表）
   - user_credit表：补充user_id外键（关联用户表）

4. **触发器整合**：
   - 合并8个触发器（原文件1的3个 + 原文件6的5个）
   - 统一日志记录到log表
   - 确保业务逻辑不冲突（资金冻结、信誉计算等）

5. **存储过程适配**：
   - 调整文件7中的存储过程参数和表名，适配新结构
   - 为所有存储过程添加错误处理和日志记录
   - 统一返回格式（result_code/message）

6. **权限系统扩展**：
   - 添加skill:*和task:*系列权限
   - 完善RBAC角色权限分配（4个角色×13个权限）

7. **视图优化**：
   - 保留原user_profile_view
   - 新增skill_detail_view和order_detail_view
   - 所有视图添加必要关联信息

8. **索引优化**：
   - 为所有外键添加索引
   - 为高频查询字段添加复合索引
   - 为唯一约束添加唯一索引
*/