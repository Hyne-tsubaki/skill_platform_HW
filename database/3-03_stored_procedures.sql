-- database/03_stored_procedures.sql
-- 存储过程与函数文件
USE `skill_platform`;

DELIMITER //

-- 创建订单和支付的存储过程
CREATE PROCEDURE sp_create_order_with_payment(
    IN p_skill_id BIGINT,
    IN p_employer_id BIGINT,
    IN p_provider_id BIGINT,
    IN p_order_amount DECIMAL(10,2),
    IN p_service_time DATETIME,
    IN p_order_remark TEXT,
    IN p_payment_method VARCHAR(20),
    OUT p_order_no VARCHAR(64),
    OUT p_payment_no VARCHAR(64)
)
BEGIN
    DECLARE v_order_id BIGINT;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;
    
    START TRANSACTION;
    
    -- 生成订单号
    SET p_order_no = CONCAT('ORD', DATE_FORMAT(NOW(), '%Y%m%d%H%i%s'), LPAD(FLOOR(RAND() * 10000), 4, '0'));
    
    -- 插入订单
    INSERT INTO `order` (
        order_no, skill_id, employer_id, provider_id, 
        order_amount, service_time, order_remark
    ) VALUES (
        p_order_no, p_skill_id, p_employer_id, p_provider_id,
        p_order_amount, p_service_time, p_order_remark
    );
    
    SET v_order_id = LAST_INSERT_ID();
    
    -- 生成支付流水号
    SET p_payment_no = CONCAT('PAY', DATE_FORMAT(NOW(), '%Y%m%d%H%i%s'), LPAD(FLOOR(RAND() * 10000), 4, '0'));
    
    -- 插入支付记录（资金冻结状态）
    INSERT INTO `payment` (
        order_id, payment_no, payment_amount, payment_method, freeze_status
    ) VALUES (
        v_order_id, p_payment_no, p_order_amount, p_payment_method, 1
    );
    
    -- 记录系统日志
    INSERT INTO `log` (
        log_level, log_type, user_id, module, action, description
    ) VALUES (
        'INFO', 'order', p_employer_id, 'order_service', 'create_order', 
        CONCAT('用户创建订单，订单号：', p_order_no)
    );
    
    COMMIT;
END //

-- 模拟支付的存储过程
CREATE PROCEDURE sp_simulate_payment(
    IN p_payment_id BIGINT,
    IN p_payment_status TINYINT
)
BEGIN
    DECLARE v_order_id BIGINT;
    DECLARE v_employer_id BIGINT;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;
    
    START TRANSACTION;
    
    -- 获取订单信息
    SELECT order_id, employer_id INTO v_order_id, v_employer_id
    FROM payment p 
    JOIN `order` o ON p.order_id = o.order_id 
    WHERE p.payment_id = p_payment_id;
    
    IF v_order_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '支付记录不存在';
    END IF;
    
    -- 更新支付状态
    UPDATE payment 
    SET payment_status = p_payment_status, 
        payment_time = NOW()
    WHERE payment_id = p_payment_id;
    
    -- 如果支付成功，更新订单状态
    IF p_payment_status = 2 THEN
        UPDATE `order` 
        SET order_status = 2  -- 已支付
        WHERE order_id = v_order_id;
    END IF;
    
    -- 记录日志
    INSERT INTO `log` (
        log_level, log_type, user_id, module, action, description
    ) VALUES (
        'INFO', 'payment', v_employer_id, 'payment_service', 'update_payment', 
        CONCAT('更新支付状态为：', p_payment_status)
    );
    
    COMMIT;
END //

-- 创建评价的存储过程
CREATE PROCEDURE sp_create_review(
    IN p_order_id BIGINT,
    IN p_reviewer_id BIGINT,
    IN p_reviewed_id BIGINT,
    IN p_rating TINYINT,
    IN p_comment TEXT,
    IN p_review_type TINYINT,
    IN p_is_anonymous BOOLEAN
)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;
    
    START TRANSACTION;
    
    -- 检查是否已经评价过
    IF EXISTS (
        SELECT 1 FROM review 
        WHERE order_id = p_order_id 
        AND reviewer_id = p_reviewer_id 
        AND review_type = p_review_type
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '您已经对该订单进行过评价';
    END IF;
    
    -- 检查评分范围
    IF p_rating < 1 OR p_rating > 5 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '评分必须在1-5之间';
    END IF;
    
    -- 插入评价
    INSERT INTO `review` (
        order_id, reviewer_id, reviewed_id, rating, 
        comment, review_type, is_anonymous
    ) VALUES (
        p_order_id, p_reviewer_id, p_reviewed_id, p_rating,
        p_comment, p_review_type, p_is_anonymous
    );
    
    -- 更新用户信誉
    CALL sp_update_user_credit(p_reviewed_id);
    
    -- 记录日志
    INSERT INTO `log` (
        log_level, log_type, user_id, module, action, description
    ) VALUES (
        'INFO', 'review', p_reviewer_id, 'review_service', 'create_review', 
        CONCAT('用户评价，被评价用户ID：', p_reviewed_id)
    );
    
    COMMIT;
END //

-- 更新用户信誉的存储过程
CREATE PROCEDURE sp_update_user_credit(
    IN p_user_id BIGINT
)
BEGIN
    DECLARE v_avg_rating DECIMAL(2,1);
    DECLARE v_positive_count INT;
    DECLARE v_negative_count INT;
    DECLARE v_credit_score DECIMAL(3,1);
    DECLARE v_total_reviews INT;
    
    -- 计算平均评分
    SELECT AVG(rating) INTO v_avg_rating
    FROM review WHERE reviewed_id = p_user_id;
    
    -- 统计好评数（4-5星）
    SELECT COUNT(*) INTO v_positive_count
    FROM review 
    WHERE reviewed_id = p_user_id AND rating >= 4;
    
    -- 统计差评数（1-2星）
    SELECT COUNT(*) INTO v_negative_count
    FROM review 
    WHERE reviewed_id = p_user_id AND rating <= 2;
    
    SET v_total_reviews = v_positive_count + v_negative_count;
    
    -- 计算信誉分数
    IF v_total_reviews > 0 THEN
        SET v_credit_score = ROUND(v_avg_rating * 2 * (v_positive_count / v_total_reviews), 1);
    ELSE
        SET v_credit_score = 5.0;
    END IF;
    
    -- 限制分数范围
    IF v_credit_score > 10 THEN SET v_credit_score = 10.0; END IF;
    IF v_credit_score < 0 THEN SET v_credit_score = 0.0; END IF;
    
    -- 更新或插入用户信誉记录
    INSERT INTO `user_credit` (
        user_id, credit_score, avg_rating, positive_reviews, negative_reviews
    ) VALUES (
        p_user_id, v_credit_score, ROUND(COALESCE(v_avg_rating, 0), 1), 
        v_positive_count, v_negative_count
    )
    ON DUPLICATE KEY UPDATE
        credit_score = v_credit_score,
        avg_rating = ROUND(COALESCE(v_avg_rating, 0), 1),
        positive_reviews = v_positive_count,
        negative_reviews = v_negative_count,
        updated_time = NOW();
END //

DELIMITER ;