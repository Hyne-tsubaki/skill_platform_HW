-- database/02_constraints_indexes.sql
-- 所有表的索引和总共的外键约束
-- 外键约束
-- 添加 order 表的外键约束
USE `skill_platform`;

ALTER TABLE `order`
ADD CONSTRAINT `fk_order_skill` FOREIGN KEY (`skill_id`) REFERENCES `skill`(`skill_id`) 
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `order`
ADD CONSTRAINT `fk_order_employer` FOREIGN KEY (`employer_id`) REFERENCES `user`(`user_id`) 
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `order`
ADD CONSTRAINT `fk_order_provider` FOREIGN KEY (`provider_id`) REFERENCES `user`(`user_id`) 
ON DELETE CASCADE ON UPDATE CASCADE;

-- 为技能表添加外键约束
ALTER TABLE `skill`
ADD CONSTRAINT `fk_skill_user` FOREIGN KEY (`user_id`) REFERENCES `user`(`user_id`) 
ON DELETE CASCADE ON UPDATE CASCADE;
-- 为支付表添加外键约束
ALTER TABLE `payment` 
ADD CONSTRAINT `fk_payment_order` 
FOREIGN KEY (`order_id`) REFERENCES `order`(`order_id`) 
ON DELETE CASCADE ON UPDATE CASCADE;

-- 为评价表添加外键约束
ALTER TABLE `review` 
ADD CONSTRAINT `fk_review_order` 
FOREIGN KEY (`order_id`) REFERENCES `order`(`order_id`) 
ON DELETE CASCADE ON UPDATE CASCADE;

-- 为用户表添加索引
CREATE INDEX `idx_user_username` ON `user`(`username`);
CREATE INDEX `idx_user_email` ON `user`(`email`);
CREATE INDEX `idx_user_phone` ON `user`(`phone`);
CREATE INDEX `idx_user_type` ON `user`(`user_type`);

-- 为技能表添加索引
CREATE INDEX `idx_skill_user` ON `skill`(`user_id`);
CREATE INDEX `idx_skill_category` ON `skill`(`category`);
CREATE INDEX `idx_skill_price` ON `skill`(`price`);
CREATE INDEX `idx_skill_rating` ON `skill`(`avg_rating`);

-- 订单表索引
CREATE INDEX `idx_order_employer` ON `order`(`employer_id`);
CREATE INDEX `idx_order_provider` ON `order`(`provider_id`);
CREATE INDEX `idx_order_status` ON `order`(`order_status`);
CREATE INDEX `idx_order_created` ON `order`(`created_time`);

-- 支付表索引
CREATE INDEX `idx_payment_order` ON `payment`(`order_id`);
CREATE INDEX `idx_payment_status` ON `payment`(`payment_status`);

-- 评价表索引
CREATE INDEX `idx_review_reviewed` ON `review`(`reviewed_id`);
CREATE UNIQUE INDEX `uk_order_reviewer` ON `review`(`order_id`, `reviewer_id`, `review_type`);

-- 日志表索引
CREATE INDEX `idx_log_level_time` ON `log`(`log_level`, `created_time`);
CREATE INDEX `idx_log_module` ON `log`(`module`);