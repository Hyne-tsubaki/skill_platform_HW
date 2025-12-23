-- 1. 创建数据库（如果不存在）
CREATE DATABASE IF NOT EXISTS skill_task_db DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. 选择要使用的数据库
USE skill_task_db;

-- 3. 创建技能信息表 (skill)
CREATE TABLE `skill` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `description` text,
  `category_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `price` decimal(10,2) DEFAULT NULL,
  `status` tinyint NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_category_id` (`category_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. 创建任务信息表 (task)
CREATE TABLE `task` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `title` varchar(200) NOT NULL,
  `description` text NOT NULL,
  `skill_id` bigint NOT NULL,
  `publisher_id` bigint NOT NULL,
  `receiver_id` bigint DEFAULT NULL,
  `budget` decimal(10,2) NOT NULL,
  `status` tinyint NOT NULL DEFAULT 0,
  `deadline` datetime,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_skill_id` (`skill_id`),
  KEY `idx_publisher_id` (`publisher_id`),
  KEY `idx_receiver_id` (`receiver_id`),
  KEY `idx_status` (`status`),
  KEY `idx_title` (`title`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. 创建技能分类表 (category)
CREATE TABLE `category` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `parent_id` bigint DEFAULT NULL,
  `sort` int NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_parent_id` (`parent_id`),
  UNIQUE KEY `uk_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. 创建标签表 (tag)
CREATE TABLE `tag` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. 创建技能-标签关联表 (skill_tag_relation)
CREATE TABLE `skill_tag_relation` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `skill_id` bigint NOT NULL,
  `tag_id` bigint NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_skill_tag` (`skill_id`,`tag_id`),
  KEY `idx_tag_id` (`tag_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;




-- 1. 技能发布
DELIMITER //
CREATE PROCEDURE `publish_skill`(
    IN p_name VARCHAR(100),
    IN p_description TEXT,
    IN p_category_id BIGINT,
    IN p_user_id BIGINT,
    IN p_price DECIMAL(10,2),
    IN p_tag_ids TEXT, -- 逗号分隔的标签ID列表
    OUT p_skill_id BIGINT
)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;
    
    START TRANSACTION;
    
    -- 插入技能信息
    INSERT INTO `skill` (`name`, `description`, `category_id`, `user_id`, `price`)
    VALUES (p_name, p_description, p_category_id, p_user_id, p_price);
    
    SET p_skill_id = LAST_INSERT_ID();
    
    -- 处理标签关联
    IF p_tag_ids IS NOT NULL AND p_tag_ids != '' THEN
        SET @sql = CONCAT(
            'INSERT INTO skill_tag_relation (skill_id, tag_id) ',
            'SELECT ', p_skill_id, ', id FROM tag WHERE id IN (', p_tag_ids, ')'
        );
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
    
    COMMIT;
END //
DELIMITER ;

-- 2. 技能修改
DELIMITER //
CREATE PROCEDURE `update_skill`(
    IN p_id BIGINT,
    IN p_name VARCHAR(100),
    IN p_description TEXT,
    IN p_category_id BIGINT,
    IN p_price DECIMAL(10,2),
    IN p_status TINYINT,
    IN p_tag_ids TEXT, -- 逗号分隔的标签ID列表
    OUT p_result INT -- 1:成功, 0:失败
)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_result = 0;
    END;
    
    START TRANSACTION;
    
    -- 更新技能基本信息
    UPDATE `skill` 
    SET `name` = p_name,
        `description` = p_description,
        `category_id` = p_category_id,
        `price` = p_price,
        `status` = p_status
    WHERE `id` = p_id;
    
    -- 先删除原有标签关联
    DELETE FROM skill_tag_relation WHERE skill_id = p_id;
    
    -- 添加新的标签关联
    IF p_tag_ids IS NOT NULL AND p_tag_ids != '' THEN
        SET @sql = CONCAT(
            'INSERT INTO skill_tag_relation (skill_id, tag_id) ',
            'SELECT ', p_id, ', id FROM tag WHERE id IN (', p_tag_ids, ')'
        );
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
    
    SET p_result = 1;
    COMMIT;
END //
DELIMITER ;

-- 3. 技能删除
DELIMITER //
CREATE PROCEDURE `delete_skill`(
    IN p_id BIGINT,
    OUT p_result INT -- 1:成功, 0:失败(存在关联任务)
)
BEGIN
    -- 检查是否有关联任务
    SELECT COUNT(*) INTO @task_count FROM task WHERE skill_id = p_id;
    
    IF @task_count > 0 THEN
        SET p_result = 0;
    ELSE
        START TRANSACTION;
        -- 删除标签关联
        DELETE FROM skill_tag_relation WHERE skill_id = p_id;
        -- 删除技能
        DELETE FROM `skill` WHERE id = p_id;
        COMMIT;
        SET p_result = 1;
    END IF;
END //
DELIMITER ;

-- 4. 技能搜索
DELIMITER //
CREATE PROCEDURE `search_skills`(
    IN p_keyword VARCHAR(100), -- 搜索关键词
    IN p_category_id BIGINT, -- 分类ID, 0表示不限
    IN p_tag_id BIGINT, -- 标签ID, 0表示不限
    IN p_min_price DECIMAL(10,2), -- 最低价格, NULL表示不限
    IN p_max_price DECIMAL(10,2), -- 最高价格, NULL表示不限
    IN p_page INT, -- 页码,从1开始
    IN p_page_size INT -- 每页条数
)
BEGIN
    SET @offset = (p_page - 1) * p_page_size;
    
    -- 构建查询条件
    SET @where_clause = 'WHERE s.status = 1';
    
    IF p_keyword IS NOT NULL AND p_keyword != '' THEN
        SET @where_clause = CONCAT(@where_clause, ' AND (s.name LIKE ''%', p_keyword, '%'' OR s.description LIKE ''%', p_keyword, '%'')');
    END IF;
    
    IF p_category_id > 0 THEN
        SET @where_clause = CONCAT(@where_clause, ' AND s.category_id = ', p_category_id);
    END IF;
    
    IF p_tag_id > 0 THEN
        SET @where_clause = CONCAT(@where_clause, ' AND s.id IN (SELECT skill_id FROM skill_tag_relation WHERE tag_id = ', p_tag_id, ')');
    END IF;
    
    IF p_min_price IS NOT NULL THEN
        SET @where_clause = CONCAT(@where_clause, ' AND s.price >= ', p_min_price);
    END IF;
    
    IF p_max_price IS NOT NULL THEN
        SET @where_clause = CONCAT(@where_clause, ' AND s.price <= ', p_max_price);
    END IF;
    
    -- 构建查询SQL
    SET @sql = CONCAT(
        'SELECT s.*, c.name AS category_name ',
        'FROM skill s ',
        'LEFT JOIN category c ON s.category_id = c.id ',
        @where_clause,
        ' ORDER BY s.created_at DESC ',
        'LIMIT ', @offset, ', ', p_page_size
    );
    
    -- 执行查询
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
    
    -- 查询总数
    SET @count_sql = CONCAT(
        'SELECT COUNT(*) AS total FROM skill s ',
        @where_clause
    );
    
    PREPARE count_stmt FROM @count_sql;
    EXECUTE count_stmt;
    DEALLOCATE PREPARE count_stmt;
END //
DELIMITER ;

-- 5. 任务发布
DELIMITER //
CREATE PROCEDURE `publish_task`(
    IN p_title VARCHAR(200),
    IN p_description TEXT,
    IN p_skill_id BIGINT,
    IN p_publisher_id BIGINT,
    IN p_budget DECIMAL(10,2),
    IN p_deadline DATETIME,
    OUT p_task_id BIGINT
)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;
    
    -- 检查技能是否存在且可用
    SELECT COUNT(*) INTO @skill_count FROM skill WHERE id = p_skill_id AND status = 1;
    
    IF @skill_count = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '技能不存在或不可用';
    END IF;
    
    INSERT INTO `task` (
        `title`, `description`, `skill_id`, `publisher_id`, 
        `budget`, `deadline`, `status`
    ) VALUES (
        p_title, p_description, p_skill_id, p_publisher_id,
        p_budget, p_deadline, 0 -- 状态0: 待接单
    );
    
    SET p_task_id = LAST_INSERT_ID();
END //
DELIMITER ;

-- 6. 任务接单
DELIMITER //
CREATE PROCEDURE `accept_task`(
    IN p_task_id BIGINT,
    IN p_receiver_id BIGINT,
    OUT p_result INT -- 1:成功, 0:失败
)
BEGIN
    -- 检查任务状态是否为待接单
    SELECT status INTO @current_status FROM task WHERE id = p_task_id FOR UPDATE;
    
    IF @current_status = 0 THEN
        -- 更新任务状态为已接单
        UPDATE `task` 
        SET `receiver_id` = p_receiver_id, 
            `status` = 1 -- 状态1: 已接单
        WHERE id = p_task_id;
        
        SET p_result = 1;
    ELSE
        SET p_result = 0;
    END IF;
END //
DELIMITER ;

-- 7. 任务完成确认
DELIMITER //
CREATE PROCEDURE `confirm_task_complete`(
    IN p_task_id BIGINT,
    IN p_publisher_id BIGINT, -- 发布者ID,用于验证权限
    OUT p_result INT -- 1:成功, 0:失败
)
BEGIN
    -- 检查任务所有权和当前状态
    SELECT COUNT(*) INTO @task_count 
    FROM task 
    WHERE id = p_task_id 
      AND publisher_id = p_publisher_id
      AND status = 1; -- 必须是已接单状态
    
    IF @task_count > 0 THEN
        -- 更新任务状态为已完成
        UPDATE `task` 
        SET `status` = 2 -- 状态2: 已完成
        WHERE id = p_task_id;
        
        SET p_result = 1;
    ELSE
        SET p_result = 0;
    END IF;
END //
DELIMITER ;

-- 8. 添加技能分类
DELIMITER //
CREATE PROCEDURE `add_category`(
    IN p_name VARCHAR(50),
    IN p_parent_id BIGINT,
    IN p_sort INT,
    OUT p_category_id BIGINT
)
BEGIN
    -- 检查分类名称是否已存在
    SELECT COUNT(*) INTO @name_count FROM category WHERE name = p_name;
    
    IF @name_count > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '分类名称已存在';
    END IF;
    
    INSERT INTO `category` (`name`, `parent_id`, `sort`)
    VALUES (p_name, p_parent_id, p_sort);
    
    SET p_category_id = LAST_INSERT_ID();
END //
DELIMITER ;

-- 9. 添加标签
DELIMITER //
CREATE PROCEDURE `add_tag`(
    IN p_name VARCHAR(50),
    OUT p_tag_id BIGINT
)
BEGIN
    -- 检查标签是否已存在
    SELECT id INTO p_tag_id FROM tag WHERE name = p_name;
    
    IF p_tag_id IS NULL THEN
        INSERT INTO `tag` (`name`) VALUES (p_name);
        SET p_tag_id = LAST_INSERT_ID();
    END IF;
END //
DELIMITER ;

-- 10. 获取分类下的所有子分类
DELIMITER //
CREATE PROCEDURE `get_sub_categories`(
    IN p_parent_id BIGINT
)
BEGIN
    SELECT * FROM category WHERE parent_id = p_parent_id ORDER BY sort ASC;
END //
DELIMITER ;




