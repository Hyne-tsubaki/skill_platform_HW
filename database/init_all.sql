-- =============================================
-- 技能交换平台 数据库一键初始化脚本
-- 执行顺序：认证模块 → 技能/任务模块 → 订单/交易模块（初始化→核心表→约束索引→存储过程→触发器）
-- 使用方式：mysql -u root -p < init_all.sql
-- 注意：执行前确保所有SQL文件与本脚本在同一目录（database/）
-- =============================================

-- 解决中文乱码问题（全局生效）
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- 1. 执行认证模块表初始化（用户/角色/认证信息）
source 1-01_auth_tables.sql;
SELECT '✅ 认证模块表创建完成' AS step1;

-- 2. 执行技能/任务模块表初始化（技能/任务/分类/标签）
source 2-skill-task.sql;
SELECT '✅ 技能/任务模块表创建完成' AS step2;

-- 3. 执行订单/交易模块初始化（按依赖顺序）
-- 3.1 订单模块基础初始化（建库/基础配置）
source 3-00_init.sql;
SELECT '✅ 订单模块基础初始化完成' AS step3_1;

-- 3.2 订单模块核心表（订单/支付/评价/信誉）
source 3-01_core_tables.sql;
SELECT '✅ 订单模块核心表创建完成' AS step3_2;

-- 3.3 订单模块约束/索引（外键/索引，保证数据完整性）
source 3-02_constraint_index.sql;
SELECT '✅ 订单模块约束/索引创建完成' AS step3_3;

-- 3.4 订单模块存储过程（业务逻辑封装）
source 3-03_stored_procedures.sql;
SELECT '✅ 订单模块存储过程创建完成' AS step3_4;

-- 3.5 订单模块触发器（自动数据变更处理）
source 3-04_triggers.sql;
SELECT '✅ 订单模块触发器创建完成' AS step3_5;

-- 最终完成提示
SELECT '🎉 技能交换平台数据库初始化全部完成！所有表/约束/存储过程/触发器已创建' AS final_result;