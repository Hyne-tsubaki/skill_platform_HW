-- database/04_triggers.sql
-- 触发器文件 - 自动执行业务逻辑
USE `skill_platform`;

DELIMITER //

-- =============================================================================
-- 触发器1: 订单状态更新时自动处理相关业务
-- 功能: 当订单状态变更时，自动记录日志、更新用户订单统计、处理资金冻结状态
-- =============================================================================
CREATE TRIGGER `trg_order_after_update`
AFTER UPDATE ON `order`
FOR EACH ROW
BEGIN
    -- 检查订单状态是否发生变化
    IF OLD.order_status != NEW.order_status THEN
        -- 记录订单状态变更日志
        INSERT INTO `log` (
            log_level, log_type, user_id, module, action, description
        ) VALUES (
            'INFO', 
            'order', 
            NEW.employer_id, 
            'order_trigger', 
            'status_change',
            -- 构建详细的描述信息
            CONCAT('订单状态变更：', 
                   OLD.order_status, ' → ', NEW.order_status, 
                   '，订单号：', NEW.order_no)
        );
        
        -- 情况1: 订单完成时，自动解冻资金给技能提供者
        IF NEW.order_status = 4 THEN  -- 订单已完成
            UPDATE `payment` 
            SET freeze_status = 2,  -- 2-已解冻给提供者
                updated_time = NOW()
            WHERE order_id = NEW.order_id 
            AND freeze_status = 1;  -- 只处理当前冻结状态的资金
            
            -- 更新技能提供者的完成订单数
            UPDATE `user_credit` 
            SET completed_orders = completed_orders + 1,
                updated_time = NOW()
            WHERE user_id = NEW.provider_id;
            
        -- 情况2: 订单取消时，处理资金退款逻辑  
        ELSEIF NEW.order_status = 5 THEN  -- 订单已取消
            UPDATE `payment` 
            SET freeze_status = 3,  -- 3-已退款给雇主
                updated_time = NOW()
            WHERE order_id = NEW.order_id 
            AND freeze_status = 1;  -- 只处理当前冻结状态的资金
            
        -- 情况3: 订单开始进行时，更新用户总订单数
        ELSEIF NEW.order_status = 3 THEN  -- 订单进行中
            -- 更新雇主的总订单数
            UPDATE `user_credit` 
            SET total_orders = total_orders + 1,
                updated_time = NOW()
            WHERE user_id = NEW.employer_id;
            
            -- 更新技能提供者的总订单数  
            UPDATE `user_credit` 
            SET total_orders = total_orders + 1,
                updated_time = NOW()
            WHERE user_id = NEW.provider_id;
        END IF;
    END IF;
END //

-- =============================================================================
-- 触发器2: 支付状态更新时自动同步相关数据
-- 功能: 当支付状态变更时，自动更新订单状态、记录支付日志
-- =============================================================================
CREATE TRIGGER `trg_payment_after_update`
AFTER UPDATE ON `payment`
FOR EACH ROW
BEGIN
    -- 检查支付状态是否发生变化
    IF OLD.payment_status != NEW.payment_status THEN
        -- 获取订单信息用于日志记录
        SELECT employer_id INTO @v_employer_id 
        FROM `order` 
        WHERE order_id = NEW.order_id;
        
        -- 记录支付状态变更日志
        INSERT INTO `log` (
            log_level, log_type, user_id, module, action, description, request_params
        ) VALUES (
            'INFO',
            'payment', 
            @v_employer_id,
            'payment_trigger', 
            'status_change',
            CONCAT('支付状态变更：', 
                   OLD.payment_status, ' → ', NEW.payment_status),
            -- 使用JSON格式记录关键信息
            JSON_OBJECT(
                'payment_no', NEW.payment_no,
                'order_id', NEW.order_id,
                'amount', NEW.payment_amount
            )
        );
        
        -- 情况1: 支付成功时，自动更新订单状态为已支付
        IF NEW.payment_status = 2 THEN  -- 支付成功
            UPDATE `order` 
            SET order_status = 2,  -- 2-已支付
                updated_time = NOW()
            WHERE order_id = NEW.order_id;
            
        -- 情况2: 支付退款时，自动更新订单状态为已取消
        ELSEIF NEW.payment_status = 4 THEN  -- 已退款
            UPDATE `order` 
            SET order_status = 5,  -- 5-已取消
                updated_time = NOW()
            WHERE order_id = NEW.order_id;
        END IF;
    END IF;
END //

-- =============================================================================
-- 触发器3: 新评价创建时自动处理信誉相关逻辑
-- 功能: 当有新评价时，自动更新被评价用户的信誉分数
-- =============================================================================
CREATE TRIGGER `trg_review_after_insert`
AFTER INSERT ON `review`
FOR EACH ROW
BEGIN
    -- 记录评价创建日志
    INSERT INTO `log` (
        log_level, log_type, user_id, module, action, description
    ) VALUES (
        'INFO',
        'review',
        NEW.reviewer_id,
        'review_trigger',
        'create_review',
        CONCAT('用户创建评价，评分：', NEW.rating, '星，被评价用户：', NEW.reviewed_id)
    );
    
    -- 自动更新被评价用户的信誉数据
    -- 调用存储过程来更新用户信誉（确保逻辑一致性）
    CALL sp_update_user_credit(NEW.reviewed_id);
    
    -- 额外逻辑：如果是差评（1-2星），记录特殊日志
    IF NEW.rating <= 2 THEN
        INSERT INTO `log` (
            log_level, log_type, user_id, module, action, description
        ) VALUES (
            'WARN',  -- 警告级别日志
            'review',
            NEW.reviewed_id,
            'review_trigger',
            'low_rating_alert',
            CONCAT('用户收到差评，评分：', NEW.rating, '星，评价ID：', NEW.review_id)
        );
    END IF;
END //

-- =============================================================================
-- 触发器4: 评价更新时重新计算信誉分数
-- 功能: 当评价信息被修改时，重新计算相关用户的信誉分数
-- =============================================================================
CREATE TRIGGER `trg_review_after_update`
AFTER UPDATE ON `review`
FOR EACH ROW
BEGIN
    -- 检查评分是否发生变化
    IF OLD.rating != NEW.rating THEN
        -- 记录评价修改日志
        INSERT INTO `log` (
            log_level, log_type, user_id, module, action, description
        ) VALUES (
            'INFO',
            'review',
            NEW.reviewer_id,
            'review_trigger',
            'update_rating',
            CONCAT('评价评分变更：', OLD.rating, ' → ', NEW.rating)
        );
        
        -- 重新计算被评价用户的信誉分数
        CALL sp_update_user_credit(NEW.reviewed_id);
    END IF;
END //

-- =============================================================================
-- 触发器5: 评价删除时更新信誉数据
-- 功能: 当评价被删除时，重新计算相关用户的信誉分数
-- =============================================================================
CREATE TRIGGER `trg_review_after_delete`
AFTER DELETE ON `review`
FOR EACH ROW
BEGIN
    -- 记录评价删除日志
    INSERT INTO `log` (
        log_level, log_type, user_id, module, action, description
    ) VALUES (
        'WARN',  -- 警告级别，因为评价删除是敏感操作
        'review',
        OLD.reviewer_id,
        'review_trigger',
        'delete_review',
        CONCAT('评价被删除，原评分：', OLD.rating, '星')
    );
    
    -- 重新计算被评价用户的信誉分数
    CALL sp_update_user_credit(OLD.reviewed_id);
END //

DELIMITER ;