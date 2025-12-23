# 技能交换平台（skill-platform-total）

## 项目介绍
这是一个技能交换平台的后端项目，支持用户注册/登录、技能发布/交易、订单管理、信誉评价等核心功能，采用模块化架构设计，便于维护与扩展。


## 目录结构
```
skill-platform-total/
├── config/                # 配置文件（数据库连接）
│   └── database.js        # MySQL数据库连接配置
├── database/              # 数据库初始化SQL脚本
│   ├── 1-01_auth_tables.sql       # 认证模块表（用户/角色）
│   ├── 2-skill-task.sql           # 技能/任务模块表
│   ├── 3-00_init.sql              # 订单模块初始化
│   ├── 3-01_core_tables.sql       # 订单模块核心表
│   ├── 3-02_constraint_index.sql  # 订单模块约束/索引
│   ├── 3-03_stored_procedures.sql # 订单模块存储过程
│   ├── 3-04_triggers.sql          # 订单模块触发器
│   └── init_all.sql               # 一键初始化数据库脚本
├── middleware/            # 全局中间件
│   ├── auth.js            # JWT认证中间件
│   ├── errorHandler.js    # 错误处理中间件
│   ├── responseHelper.js  # 统一响应格式工具
│   └── validator.js       # 参数校验中间件
├── modules/               # 业务模块（按功能拆分）
│   ├── auth/              # 认证模块
│   │   ├── controllers/   # 认证控制器（注册/登录）
│   │   ├── routes/        # 认证路由
│   │   ├── services/      # 认证业务逻辑
│   │   └── test/          # 测试脚本
│   ├── order-trade/       # 订单/交易模块
│   │   ├── controllers/   # 订单控制器
│   │   ├── logs/          # 日志存储目录
│   │   └── routes/        # 订单路由
│   └── skill-task/       # 技能/任务模块
│       ├── controllers/   # 技能/任务控制器
│       ├── models/        # 数据模型
│       └── routes/        # 技能/任务路由
├── utils/                 # 工具类
│   ├── logger/            # 日志工具
│   │   ├── applog.js      # 应用日志
│   │   ├── errorlog.js    # 错误日志
│   │   └── loggerconf.js  # 日志配置
│   ├── bcryptUtil.js      # 密码加密工具
│   ├── db-proc.js         # 存储过程调用工具
│   ├── jwtUtil.js         # JWT工具
│   └── responseHelper.js  # 响应工具（兼容旧版）
├── .env                   # 环境变量配置（需手动修改）
├── app.js                 # 项目入口文件
└── package.json           # 依赖配置
```


## 环境准备
### 1. 依赖安装
在项目根目录执行：
```bash
npm install
```


### 2. 环境变量配置（必须修改）
打开根目录的 `.env` 文件，修改以下配置：
```ini
# 数据库配置（根据本地MySQL修改）
DB_HOST=localhost
DB_PORT=3306
DB_USER=root          # 本地MySQL用户名
DB_PASSWORD=你的密码   # 本地MySQL密码
DB_NAME=skill_exchange_platform

# JWT配置（可自定义）
JWT_SECRET=生成的32位密钥  # 可通过node生成：require('crypto').randomBytes(16).toString('hex')
JWT_EXPIRES_IN=86400  # Token有效期（秒）

# 服务配置
PORT=3000  # 服务端口
```


### 3. 数据库初始化（必须执行）
1. 确保本地MySQL服务已启动；
2. 进入项目根目录，执行一键初始化脚本：
```bash
mysql -u root -p < database/init_all.sql
```
（执行时需输入本地MySQL密码）


## 启动项目
在项目根目录执行：
```bash
node app.js
```
启动后，可通过以下接口验证服务健康：
```bash
curl http://localhost:3000/health
```


## 核心模块接口示例
### 1. 认证模块
- 注册：`POST /api/auth/register`
- 登录：`POST /api/auth/login`
- 检查用户名：`GET /api/auth/check-username?username=xxx`


### 2. 技能模块
- 发布技能：`POST /api/skills/publish`（需携带JWT Token）
- 搜索技能：`GET /api/skills?keyword=xxx&page=1`


### 3. 订单模块
- 创建订单：`POST /api/orders`（需携带JWT Token）
- 获取订单列表：`GET /api/orders/user/1`（用户ID=1）


## 注意事项
1. 本地开发时，确保 `.env` 中的数据库密码与本地MySQL一致；
2. 日志文件会自动生成在 `modules/order-trade/logs/` 目录；
3. 若初始化数据库失败，可手动逐个执行 `database/` 下的SQL脚本；
4. 生产环境需修改 `JWT_SECRET` 为更安全的密钥，并关闭调试日志。