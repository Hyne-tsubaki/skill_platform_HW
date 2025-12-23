-- 技能交换平台 - 用户与权限管理模块数据库设计
-- 兼容MySQL 5.6+

-- 设置分隔符
DELIMITER $$
DROP DATABASE IF EXISTS skill_exchange_platform;

-- 创建数据库
CREATE DATABASE IF NOT EXISTS skill_exchange_platform 
CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE skill_exchange_platform;
-- 角色表：存储用户角色信息
CREATE TABLE role (
    role_id INT AUTO_INCREMENT PRIMARY KEY,
    role_name VARCHAR(50) NOT NULL UNIQUE COMMENT '角色名称：admin, skill_provider, skill_demander, moderator',
    role_description VARCHAR(255) NOT NULL COMMENT '角色描述',
    is_active TINYINT(1) DEFAULT 1 NOT NULL COMMENT '角色是否激活',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_role_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色表';

-- 用户信息表：存储用户基本信息
CREATE TABLE user (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE COMMENT '用户名',
    email VARCHAR(100) NOT NULL UNIQUE COMMENT '邮箱',
    phone VARCHAR(20) NOT NULL COMMENT '手机号',
    real_name VARCHAR(50) COMMENT '真实姓名（实名认证用）',
    gender ENUM('male', 'female', 'other') DEFAULT 'other' NOT NULL COMMENT '性别',
    id_card_verified TINYINT(1) DEFAULT 0 NOT NULL COMMENT '实名认证状态',
    role_id INT NOT NULL COMMENT '角色ID',
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

-- 用户认证表：存储登录认证信息
CREATE TABLE user_auth (
    auth_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE COMMENT '用户ID',
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

-- 用户会话表
CREATE TABLE user_session (
    session_id VARCHAR(128) PRIMARY KEY COMMENT '会话ID',
    user_id INT NOT NULL COMMENT '用户ID',
    session_data TEXT NOT NULL COMMENT '会话数据',
    ip_address VARCHAR(45) NOT NULL COMMENT 'IP地址',
    user_agent TEXT NOT NULL COMMENT '用户代理',
    expires_at TIMESTAMP NOT NULL COMMENT '会话过期时间',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user(user_id) ON DELETE CASCADE,
    INDEX idx_session_user (user_id),
    INDEX idx_session_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户会话表';

-- 权限表：存储具体的权限信息
CREATE TABLE permission (
    permission_id INT AUTO_INCREMENT PRIMARY KEY,
    permission_code VARCHAR(50) NOT NULL UNIQUE COMMENT '权限代码',
    permission_name VARCHAR(100) NOT NULL COMMENT '权限名称',
    permission_description VARCHAR(255) COMMENT '权限描述',
    module VARCHAR(50) NOT NULL COMMENT '所属模块',
    is_active TINYINT(1) DEFAULT 1 NOT NULL COMMENT '是否激活',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='权限表';

-- 角色权限关联表
CREATE TABLE role_permission (
    role_id INT NOT NULL,
    permission_id INT NOT NULL,
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    granted_by INT COMMENT '授权人用户ID',
    PRIMARY KEY (role_id, permission_id),
    FOREIGN KEY (role_id) REFERENCES role(role_id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permission(permission_id) ON DELETE CASCADE,
    FOREIGN KEY (granted_by) REFERENCES user(user_id) ON DELETE SET NULL,
    INDEX idx_role_perm_role (role_id),
    INDEX idx_role_perm_permission (permission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色权限关联表';

-- =============================================================================
-- 触发器设计
-- =============================================================================

-- 触发器1: 在用户注册时自动创建用户认证记录
-- 首先设置分隔符
DELIMITER $$

CREATE TRIGGER trg_after_user_insert
AFTER INSERT ON user
FOR EACH ROW
BEGIN
    -- 为用户自动创建认证记录，初始密码设为随机值
    INSERT INTO user_auth (
        user_id, 
        password_hash, 
        password_salt, 
        email_verified, 
        phone_verified,
        last_password_change
    ) VALUES (
        NEW.user_id,
        -- 默认密码为随机哈希，用户首次登录需要重置密码
        SHA2(CONCAT(NEW.user_id, RAND(), NOW()), 256),
        SUBSTRING(MD5(RAND()) FROM 1 FOR 16),
        0,
        0,
        NOW()
    );
END$$

-- 触发器2: 用户状态变更时记录日志
-- 首先设置分隔符
DELIMITER $$

CREATE TRIGGER trg_after_user_status_update
AFTER UPDATE ON user
FOR EACH ROW
BEGIN
    IF OLD.user_status != NEW.user_status THEN
        -- 如果用户被暂停，同时锁定认证账户
        IF NEW.user_status = 'suspended' THEN
            UPDATE user_auth 
            SET account_locked_until = DATE_ADD(NOW(), INTERVAL 30 DAY)
            WHERE user_id = NEW.user_id;
        END IF;
        
        -- 如果用户重新激活，解除账户锁定
        IF NEW.user_status = 'active' AND OLD.user_status = 'suspended' THEN
            UPDATE user_auth 
            SET account_locked_until = NULL,
                failed_login_attempts = 0
            WHERE user_id = NEW.user_id;
        END IF;
    END IF;
END$$

-- 触发器3: 登录失败次数过多时自动锁定账户
-- 首先设置分隔符
DELIMITER $$

CREATE TRIGGER trg_before_auth_update
BEFORE UPDATE ON user_auth
FOR EACH ROW
BEGIN
    -- 如果登录失败次数达到5次，自动锁定账户30分钟
    IF NEW.failed_login_attempts >= 5 AND OLD.failed_login_attempts < 5 THEN
        SET NEW.account_locked_until = DATE_ADD(NOW(), INTERVAL 30 MINUTE);
    END IF;
    
    -- 当用户成功登录时重置失败次数
    IF NEW.failed_login_attempts = 0 AND OLD.failed_login_attempts > 0 THEN
        SET NEW.account_locked_until = NULL;
    END IF;
END$$

-- =============================================================================
-- 存储过程设计
-- =============================================================================

-- 存储过程1: 用户注册流程
-- 首先设置分隔符
DELIMITER $$

CREATE PROCEDURE sp_register_user(
    IN p_username VARCHAR(50),
    IN p_email VARCHAR(100),
    IN p_phone VARCHAR(20),
    IN p_real_name VARCHAR(50),
    IN p_gender ENUM('male', 'female', 'other'),
    IN p_role_name VARCHAR(50),
    IN p_password VARCHAR(255),
    OUT p_user_id INT,
    OUT p_result_code INT,
    OUT p_message VARCHAR(255)
)
BEGIN
    DECLARE v_role_id INT;
    DECLARE v_user_count INT;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_result_code = -1;
        SET p_message = '系统错误，注册失败';
    END;
    
    START TRANSACTION;
    
    -- 检查用户名是否已存在
    SELECT COUNT(*) INTO v_user_count FROM user WHERE username = p_username;
    IF v_user_count > 0 THEN
        SET p_result_code = 1;
        SET p_message = '用户名已存在';
        ROLLBACK;
    ELSE
        -- 检查邮箱是否已存在
        SELECT COUNT(*) INTO v_user_count FROM user WHERE email = p_email;
        IF v_user_count > 0 THEN
            SET p_result_code = 2;
            SET p_message = '邮箱已被注册';
            ROLLBACK;
        ELSE
            -- 获取角色ID
            SELECT role_id INTO v_role_id FROM role WHERE role_name = p_role_name AND is_active = 1;
            IF v_role_id IS NULL THEN
                SET p_result_code = 3;
                SET p_message = '无效的角色';
                ROLLBACK;
            ELSE
                -- 插入用户信息
                INSERT INTO user (
                    username, email, phone, real_name, gender, role_id, user_status
                ) VALUES (
                    p_username, p_email, p_phone, p_real_name, p_gender, v_role_id, 'pending'
                );
                
                SET p_user_id = LAST_INSERT_ID();
                
                -- 更新认证信息（密码）
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

-- 存储过程2: 用户登录验证
DELIMITER $$
CREATE PROCEDURE sp_authenticate_user(
    IN p_login VARCHAR(100),  -- 可以是用户名或邮箱
    IN p_password VARCHAR(255),
    OUT p_user_id INT,
    OUT p_result_code INT,
    OUT p_message VARCHAR(255)
)
BEGIN
    DECLARE v_user_record_id INT;
    DECLARE v_password_hash VARCHAR(255);
    DECLARE v_password_salt VARCHAR(50);
    DECLARE v_account_locked_until TIMESTAMP;
    DECLARE v_user_status ENUM('active', 'inactive', 'suspended', 'pending');
    DECLARE v_failed_attempts INT;
    
    -- 查找用户
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
        -- 检查账户状态
        IF v_user_status != 'active' THEN
            SET p_result_code = 2;
            SET p_message = CONCAT('账户状态异常: ', v_user_status);
            SET p_user_id = NULL;
        ELSEIF v_account_locked_until IS NOT NULL AND v_account_locked_until > NOW() THEN
            SET p_result_code = 3;
            SET p_message = CONCAT('账户已被锁定，请于 ', DATE_FORMAT(v_account_locked_until, '%Y-%m-%d %H:%i:%s'), ' 后重试');
            SET p_user_id = NULL;
        ELSE
            -- 验证密码
            IF v_password_hash = SHA2(CONCAT(p_password, v_password_salt), 256) THEN
                -- 密码正确
                UPDATE user_auth 
                SET failed_login_attempts = 0,
                    account_locked_until = NULL
                WHERE user_id = v_user_record_id;
                
                UPDATE user 
                SET last_login_at = NOW(),
                    login_count = login_count + 1
                WHERE user_id = v_user_record_id;
                
                SET p_user_id = v_user_record_id;
                SET p_result_code = 0;
                SET p_message = '登录成功';
            ELSE
                -- 密码错误
                UPDATE user_auth 
                SET failed_login_attempts = failed_login_attempts + 1
                WHERE user_id = v_user_record_id;
                
                SET p_result_code = 4;
                SET p_message = '密码错误';
                SET p_user_id = NULL;
            END IF;
        END IF;
    END IF;
END$$

-- 存储过程3: 修改用户密码
DELIMITER $$
CREATE PROCEDURE sp_change_password(
    IN p_user_id INT,
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
    
    -- 获取当前密码信息
    SELECT password_hash, password_salt 
    INTO v_current_hash, v_salt
    FROM user_auth 
    WHERE user_id = p_user_id;
    
    IF v_current_hash IS NULL THEN
        SET p_result_code = 1;
        SET p_message = '用户不存在';
        ROLLBACK;
    ELSE
        -- 验证旧密码
        IF v_current_hash != SHA2(CONCAT(p_old_password, v_salt), 256) THEN
            SET p_result_code = 2;
            SET p_message = '旧密码错误';
            ROLLBACK;
        ELSE
            -- 更新密码
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
    END IF;
END$$

-- 存储过程4: 分配用户角色
DELIMITER $$
CREATE PROCEDURE sp_assign_user_role(
    IN p_user_id INT,
    IN p_role_name VARCHAR(50),
    IN p_modified_by INT,  -- 操作者用户ID
    OUT p_result_code INT,
    OUT p_message VARCHAR(255)
)
BEGIN
    DECLARE v_role_id INT;
    DECLARE v_user_count INT;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_result_code = -1;
        SET p_message = '系统错误，角色分配失败';
    END;
    
    START TRANSACTION;
    
    -- 检查用户是否存在
    SELECT COUNT(*) INTO v_user_count FROM user WHERE user_id = p_user_id;
    IF v_user_count = 0 THEN
        SET p_result_code = 1;
        SET p_message = '用户不存在';
        ROLLBACK;
    ELSE
        -- 获取角色ID
        SELECT role_id INTO v_role_id FROM role WHERE role_name = p_role_name AND is_active = 1;
        IF v_role_id IS NULL THEN
            SET p_result_code = 2;
            SET p_message = '无效的角色';
            ROLLBACK;
        ELSE
            -- 更新用户角色
            UPDATE user SET role_id = v_role_id WHERE user_id = p_user_id;
            
            SET p_result_code = 0;
            SET p_message = '角色分配成功';
            COMMIT;
        END IF;
    END IF;
END$$

-- =============================================================================
-- 函数设计
-- =============================================================================

-- 函数1: 检查用户是否有特定权限
DELIMITER $$
CREATE FUNCTION fn_check_user_permission(
    p_user_id INT,
    p_permission_code VARCHAR(50)
) 
RETURNS BOOLEAN
READS SQL DATA
DETERMINISTIC
BEGIN
    DECLARE v_has_permission BOOLEAN DEFAULT FALSE;
    
    SELECT COUNT(*) > 0 INTO v_has_permission
    FROM user u
    JOIN role r ON u.role_id = r.role_id
    JOIN role_permission rp ON r.role_id = rp.role_id
    JOIN permission p ON rp.permission_id = p.permission_id
    WHERE u.user_id = p_user_id
      AND u.user_status = 'active'
      AND r.is_active = 1
      AND p.is_active = 1
      AND p.permission_code = p_permission_code;
    
    RETURN v_has_permission;
END$$

-- 函数2: 获取用户角色名称
DELIMITER $$
CREATE FUNCTION fn_get_user_role(p_user_id INT) 
RETURNS VARCHAR(50)
READS SQL DATA
DETERMINISTIC
BEGIN
    DECLARE v_role_name VARCHAR(50);
    
    SELECT r.role_name INTO v_role_name
    FROM user u
    JOIN role r ON u.role_id = r.role_id
    WHERE u.user_id = p_user_id;
    
    RETURN v_role_name;
END$$

-- 函数3: 验证邮箱是否可用
DELIMITER $$
CREATE FUNCTION fn_check_email_available(p_email VARCHAR(100)) 
RETURNS BOOLEAN
READS SQL DATA
DETERMINISTIC
BEGIN
    DECLARE v_email_count INT DEFAULT 0;
    
    SELECT COUNT(*) INTO v_email_count 
    FROM user 
    WHERE email = p_email;
    
    RETURN v_email_count = 0;
END$$

-- 函数4: 验证用户名是否可用
DELIMITER $$
CREATE FUNCTION fn_check_username_available(p_username VARCHAR(50)) 
RETURNS BOOLEAN
READS SQL DATA
DETERMINISTIC
BEGIN
    DECLARE v_username_count INT DEFAULT 0;
    
    SELECT COUNT(*) INTO v_username_count 
    FROM user 
    WHERE username = p_username;
    
    RETURN v_username_count = 0;
END$$

-- 函数5: 计算用户活跃度分数
DELIMITER $$
CREATE FUNCTION fn_calculate_user_activity_score(p_user_id INT) 
RETURNS INT
READS SQL DATA
DETERMINISTIC
BEGIN
    DECLARE v_score INT DEFAULT 0;
    DECLARE v_login_count INT;
    DECLARE v_user_status VARCHAR(20);
    DECLARE v_last_login_days INT;
    
    SELECT login_count, user_status, 
           DATEDIFF(NOW(), COALESCE(last_login_at, created_at))
    INTO v_login_count, v_user_status, v_last_login_days
    FROM user 
    WHERE user_id = p_user_id;
    
    -- 基础分数计算逻辑
    SET v_score = v_login_count * 10;  -- 每次登录加10分
    
    -- 状态加分
    IF v_user_status = 'active' THEN
        SET v_score = v_score + 50;
    ELSEIF v_user_status = 'suspended' THEN
        SET v_score = v_score - 100;
    END IF;
    
    -- 近期活跃度加分（30天内登录过）
    IF v_last_login_days <= 30 THEN
        SET v_score = v_score + (30 - v_last_login_days);
    END IF;
    
    RETURN GREATEST(v_score, 0);  -- 确保分数不为负
END$$

-- 恢复分隔符
DELIMITER ;

-- =============================================================================
-- 插入默认数据
-- =============================================================================

-- 插入默认角色数据
INSERT INTO role (role_name, role_description) VALUES 
('admin', '系统管理员'),
('skill_provider', '技能提供者'),
('skill_demander', '技能需求者'),
('moderator', '内容审核员');

-- 插入默认权限数据
INSERT INTO permission (permission_code, permission_name, permission_description, module) VALUES 
('user:manage', '用户管理', '管理用户账户和信息', 'user'),
('role:manage', '角色管理', '管理角色和权限分配', 'system'),
('system:config', '系统配置', '修改系统配置参数', 'system'),
('skill:create', '创建技能', '发布新的技能服务', 'skill'),
('skill:update', '更新技能', '修改已发布的技能信息', 'skill'),
('skill:delete', '删除技能', '删除已发布的技能', 'skill'),
('skill:browse', '浏览技能', '查看和搜索技能服务', 'skill'),
('order:create', '创建订单', '发起技能交换订单', 'order'),
('order:manage', '管理订单', '处理和管理订单状态', 'order'),
('chat:access', '聊天权限', '使用聊天功能沟通', 'chat'),
('content:review', '内容审核', '审核用户发布的内容', 'moderation'),
('user:review', '用户审核', '审核用户注册和认证', 'moderation'),
('report:handle', '处理举报', '处理用户举报内容', 'moderation');

-- 为管理员角色分配所有权限
INSERT INTO role_permission (role_id, permission_id)
SELECT r.role_id, p.permission_id 
FROM role r, permission p 
WHERE r.role_name = 'admin';

-- =============================================================================
-- 创建视图
-- =============================================================================

-- 创建视图方便查询
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
    u.created_at
FROM user u
JOIN role r ON u.role_id = r.role_id
JOIN user_auth ua ON u.user_id = ua.user_id;

-- =============================================================================
-- 显示数据库对象信息
-- =============================================================================

-- 显示表结构描述
SHOW TABLES;

SELECT '角色表结构' as '';
DESC role;

SELECT '用户表结构' as '';
DESC user;

SELECT '用户认证表结构' as '';
DESC user_auth;

SELECT '权限表结构' as '';
DESC permission;

SELECT '角色权限表结构' as '';
DESC role_permission;

-- 显示创建的存储过程和函数
SELECT '存储过程列表' as '';
SHOW PROCEDURE STATUS WHERE Db = 'skill_exchange_platform';

SELECT '函数列表' as '';
SHOW FUNCTION STATUS WHERE Db = 'skill_exchange_platform';

SELECT '触发器列表' as '';
SHOW TRIGGERS FROM skill_exchange_platform;

-- =============================================================================
-- 测试用例
-- =============================================================================

SELECT '开始测试...' as '';

-- 测试用户注册
CALL sp_register_user(
    'testuser', 
    'test@example.com', 
    '13800138000', 
    '测试用户', 
    'male', 
    'skill_provider', 
    'password123', 
    @user_id, 
    @result_code, 
    @message
);

SELECT @user_id as '注册用户ID', @result_code as '结果代码', @message as '消息';

-- 测试用户登录
CALL sp_authenticate_user(
    'testuser',
    'password123',
    @login_user_id,
    @login_result,
    @login_message
);

SELECT @login_user_id as '登录用户ID', @login_result as '登录结果', @login_message as '登录消息';

-- 测试权限检查
SELECT 
    fn_check_user_permission(@login_user_id, 'skill:create') as '能否创建技能',
    fn_check_user_permission(@login_user_id, 'user:manage') as '能否管理用户';

-- 测试用户角色获取
SELECT fn_get_user_role(@login_user_id) as '用户角色';

-- 测试邮箱和用户名验证
SELECT 
    fn_check_email_available('newuser@example.com') as '邮箱是否可用',
    fn_check_username_available('newuser') as '用户名是否可用';

-- 测试活跃度计算
SELECT fn_calculate_user_activity_score(@login_user_id) as '用户活跃度分数';

-- 显示测试用户信息
SELECT '测试用户完整信息:' as '';
SELECT * FROM user_profile_view WHERE user_id = @user_id;

SELECT '数据库初始化完成!' as '';