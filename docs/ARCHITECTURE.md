# opencli-admin 架构文档

> 版本: 0.1.0
> 日期: 2026-06-19
> 状态: 进行中

---

## 1. 概述

### 1.1 项目定位

opencli-admin 是一个现代化的多渠道数据采集管理系统，支持 AI 智能体处理、分布式节点调度和实时通知推送。

### 1.2 核心能力

- 多渠道数据采集 (opencli / RSS / API / Web 爬虫 / CLI)
- 定时计划调度 (Cron)
- AI 智能体处理 (Claude / OpenAI / DeepSeek 等)
- 分布式边缘节点管理
- 通知推送 (Webhook / 飞书 / 钉钉 / 企微 / Email)

### 1.3 设计原则

| 原则 | 说明 |
|------|------|
| **模块化** | 每个功能独立部署，按需启停 |
| **类型安全** | 前后端共享类型定义 |
| **可观测性** | 结构化日志、链路追踪、指标监控 |
| **容错性** | 重试、降级、超时处理 |
| **可扩展性** | 边缘节点按需扩缩 |

---

## 2. 系统架构

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           用户层                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│   │  Web 管理界面   │    │  Tauri 桌面端   │    │    CLI 工具     │  │
│   │  (Next.js)     │    │   (Rust+Web)    │    │   (Rust)       │  │
│   └────────┬────────┘    └────────┬────────┘    └────────┬────────┘  │
│            │                      │                      │              │
│            └──────────────────────┼──────────────────────┘              │
│                                   │                                       │
└───────────────────────────────────┼─────────────────────────────────────┘
                                    │ HTTPS/WSS
┌───────────────────────────────────┼─────────────────────────────────────┐
│                           边缘计算层                                     │
├───────────────────────────────────┼─────────────────────────────────────┤
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                     API 网关层 (Hono)                            │  │
│   │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │  │
│   │  │  Auth    │  │  CRUD    │  │  实时    │  │  Webhook │       │  │
│   │  │  中间件   │  │  操作    │  │  SSE/WS  │  │  回调    │       │  │
│   │  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                    │                                    │
│   ┌────────────────────────────────┼────────────────────────────────┐  │
│   │                        控制面 (Python)                         │  │
│   │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │  │
│   │  │   III    │  │ Scheduler │  │  AI      │  │ Notifier │   │  │
│   │  │  调度    │  │  定时器   │  │ Processors│  │  推送    │   │  │
│   │  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                    │                                    │
│   ┌────────────────────────────────┼────────────────────────────────┐  │
│   │                        数据面 (Rust)                            │  │
│   │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │  │
│   │  │ odp-     │  │  Dedup   │  │ odp-     │  │  Redis  │   │  │
│   │  │ ingest   │  │  去重     │  │ store    │  │  Streams│   │  │
│   │  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                    │                                    │
└────────────────────────────────────┼────────────────────────────────────┘
                                     │
┌────────────────────────────────────┼────────────────────────────────────┐
│                           存储层                                          │
├────────────────────────────────────┼────────────────────────────────────┤
│                                                                         │
│   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐   │
│   │   PostgreSQL     │    │     Redis      │    │    DuckDB      │   │
│   │  (关系数据)     │    │  (缓存/队列)   │    │   (冷存储)     │   │
│   └─────────────────┘    └─────────────────┘    └─────────────────┘   │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                        文件存储                                   │  │
│   │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │  │
│   │  │ Chrome   │  │  采集    │  │  AI      │  │  备份    │     │  │
│   │  │ Profiles │  │  缓存    │  │  模型    │  │  文件    │     │  │
│   │  └──────────┘  └──────────┘  └──────────┘  └──────────┘     │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
┌────────────────────────────────────┼────────────────────────────────────┐
│                           采集节点层                                     │
├────────────────────────────────────┼────────────────────────────────────┤
│                                                                         │
│   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐   │
│   │   NAS 节点      │    │   PC 边缘       │    │   云服务器      │   │
│   │  (主控节点)     │    │  (Discord)      │    │  (高并发)       │   │
│   │                 │    │                 │    │                 │   │
│   │ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │   │
│   │ │ opencli    │ │    │ │ Discord CLI│ │    │ │ opencli    │ │   │
│   │ │ + Chrome   │ │    │ │ + opencli  │ │    │ │ + Chrome   │ │   │
│   │ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │   │
│   └─────────────────┘    └─────────────────┘    └─────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           采集流程                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. 触发源                                                               │
│     ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│     │  定时    │  │  手动    │  │  Webhook │  │  API     │           │
│     │  Cron    │  │  触发    │  │  回调    │  │  调用    │           │
│     └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘           │
│          │              │              │              │                 │
│          └──────────────┴──────────────┴──────────────┘               │
│                                │                                        │
│                                ▼                                        │
│  2. 任务调度 (III)                                                   │
│     ┌─────────────────────────────────────────────────────────────┐   │
│     │  - 解析 cron 表达式                                           │   │
│     │  - 节点路由 (按站点/优先级/空闲度)                          │   │
│     │  - 任务分发 (WS / HTTP)                                      │   │
│     └─────────────────────────────────────────────────────────────┘   │
│                                │                                        │
│                                ▼                                        │
│  3. 节点执行 (odp-rs)                                               │
│     ┌────────────┐    ┌────────────┐    ┌────────────┐                │
│     │  opencli  │───▶│  Bridge/   │───▶│  目标平台  │                │
│     │  CLI      │    │  CDP       │    │  (抓取)   │                │
│     └────────────┘    └────────────┘    └────────────┘                │
│                                │                                        │
│                                ▼                                        │
│  4. 数据归一化                                                         │
│     ┌─────────────────────────────────────────────────────────────┐   │
│     │  - 字段映射 (title/url/content/author/published_at)         │   │
│     │  - 数据清洗 (HTML 解析/敏感词过滤)                         │   │
│     │  - SHA-256 内容哈希 (去重)                                 │   │
│     └─────────────────────────────────────────────────────────────┘   │
│                                │                                        │
│                                ▼                                        │
│  5. 存储写入                                                         │
│     ┌────────────┐    ┌────────────┐    ┌────────────┐                │
│     │  Redis    │───▶│  PostgreSQL │───▶│  DuckDB    │                │
│     │  (实时)   │    │  (热数据)   │    │  (冷数据)   │                │
│     └────────────┘    └────────────┘    └────────────┘                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 组件架构

### 3.1 API 网关层 (Hono)

```
apps/api/
├── src/
│   ├── index.ts                 # 入口
│   ├── routes/
│   │   ├── auth.ts             # 认证
│   │   ├── sources.ts          # 数据源
│   │   ├── schedules.ts         # 定时计划
│   │   ├── records.ts          # 采集记录
│   │   ├── nodes.ts            # 节点管理
│   │   ├── notifications.ts     # 通知
│   │   └── webhooks.ts         # Webhook
│   ├── middleware/
│   │   ├── auth.ts            # JWT 验证
│   │   ├── cors.ts            # CORS
│   │   ├── rate-limit.ts      # 限流
│   │   └── logger.ts          # 请求日志
│   ├── services/                # 业务逻辑
│   └── types/                  # 类型定义
```

**职责**:
- HTTP 请求处理
- 请求验证 (Zod)
- 认证授权
- 限流熔断
- 请求日志

### 3.2 控制面 (Python/III)

```
iii/
├── config.yaml                  # III 引擎配置
├── lib/                        # 共享库
│   ├── odp_record.py          # ODP 数据格式
│   ├── discord_cli.py          # Discord CLI 封装
│   ├── opencli_cli.py         # opencli CLI 封装
│   └── schedules.py            # 计划管理
├── schedules/                   # 定时配置
│   ├── discord.yaml            # Discord 采集计划
│   └── opencli.yaml           # opencli 采集计划
├── workers/                     # III Worker
│   ├── odp-ingest-bridge/    # ODP 摄入桥接
│   ├── collector-discord/      # Discord 采集器
│   ├── collector-opencli/      # opencli 采集器
│   └── schedule-bootstrap/     # 计划引导
└── scripts/                    # 运维脚本
    ├── start-local.ps1        # 本地启动
    ├── deploy-nas.sh          # NAS 部署
    └── restart-workers.ps1     # 重启 Worker
```

**职责**:
- 定时任务调度
- 任务分发路由
- 节点健康检查
- 失败重试

### 3.3 数据面 (Rust)

```
odp-rs/
├── crates/
│   ├── odp-bus/              # Redis Streams 总线
│   │   ├── lib.rs
│   │   └── redis_streams.rs
│   ├── odp-contracts/        # 数据契约
│   │   └── src/lib.rs        # ODP Record v2
│   ├── odp-ingest/           # 摄入服务
│   │   ├── src/
│   │   │   ├── main.rs       # 入口
│   │   │   ├── handlers.rs   # HTTP 处理
│   │   │   ├── dedup.rs     # 去重
│   │   │   └── state.rs     # 状态管理
│   │   └── Cargo.toml
│   ├── odp-store/            # 存储服务
│   │   ├── src/
│   │   │   ├── main.rs
│   │   │   └── writer.rs    # PostgreSQL 写入
│   │   └── Cargo.toml
│   └── odp-egress/          # 导出服务 (待实现)
│       └── src/lib.rs
├── Dockerfile.ingest
├── Dockerfile.store
└── Cargo.toml
```

**职责**:
- 高并发数据摄入
- 幂等去重
- PostgreSQL 写入
- Redis Streams 缓冲

### 3.4 前端 (Next.js)

```
apps/web/
├── src/
│   ├── app/                   # App Router
│   │   ├── (auth)/           # 认证路由组
│   │   │   ├── login/
│   │   │   └── register/
│   │   ├── (dashboard)/      # Dashboard 路由组
│   │   │   ├── layout.tsx    # 侧边栏布局
│   │   │   ├── page.tsx      # 首页
│   │   │   ├── sources/      # 数据源
│   │   │   ├── schedules/    # 定时计划
│   │   │   ├── records/      # 采集记录
│   │   │   ├── nodes/        # 节点管理
│   │   │   ├── settings/     # 设置
│   │   │   └── providers/    # AI 提供商
│   │   └── api/             # API Routes (可选)
│   ├── components/
│   │   ├── ui/              # shadcn/ui 组件
│   │   └── features/         # 业务组件
│   │       ├── sources/
│   │       ├── schedules/
│   │       ├── records/
│   │       └── nodes/
│   ├── hooks/                # 自定义 Hooks
│   ├── lib/                 # 工具库
│   │   ├── api.ts           # API 客户端
│   │   └── utils.ts         # 工具函数
│   └── types/               # 前端类型
└── public/                   # 静态资源
```

---

## 4. 数据模型

### 4.1 ODP Record v2

```typescript
// contracts/record_v2.schema.json
interface ODPRecord {
  schema_version: 1;
  provider: string;           // e.g., "opencli/bilibili"
  source_id: string;         // UUID5 from channel_id
  event_id: string;           // Stable id for idempotency
  ingest_mode: "snapshot" | "stream";
  source_ts: string;         // ISO 8601
  cursor?: string;            // Pagination cursor
  payload: {
    title?: string;
    url?: string;
    content?: string;
    author?: string;
    published_at?: string;
    [key: string]: unknown;  // Provider-specific fields
  };
  raw_data?: object;          // Original data
  trace_id?: string;         // For distributed tracing
  task_id?: string;          // Collection task reference
}
```

### 4.2 数据库 Schema (Drizzle)

```typescript
// packages/db/src/schema.ts
import { pgTable, uuid, text, timestamp, jsonb, boolean } from 'drizzle-orm/pg-core';

export const sources = pgTable('sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  type: text('type').notNull(),  // opencli, rss, api, web, cli
  config: jsonb('config').notNull(),
  enabled: boolean('enabled').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const schedules = pgTable('schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id').references(() => sources.id),
  cron: text('cron').notNull(),
  timezone: text('timezone').default('Asia/Shanghai'),
  enabled: boolean('enabled').default(true),
  nodeId: uuid('node_id').references(() => nodes.id),
  createdAt: timestamp('created_at').defaultNow(),
});

export const records = pgTable('records', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id').references(() => sources.id),
  taskId: uuid('task_id').references(() => tasks.id),
  provider: text('provider').notNull(),
  eventId: text('event_id').notNull(),  // For dedup
  title: text('title'),
  url: text('url'),
  content: text('content'),
  author: text('author'),
  rawData: jsonb('raw_data'),
  aiSummary: text('ai_summary'),
  aiTags: text('ai_tags').array(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const nodes = pgTable('nodes', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  host: text('host').notNull(),
  port: text('port').notNull(),
  status: text('status').default('offline'),  // online, offline, busy
  capabilities: text('capabilities').array(),
  lastSeen: timestamp('last_seen'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id').references(() => sources.id),
  scheduleId: uuid('schedule_id').references(() => schedules.id),
  nodeId: uuid('node_id').references(() => nodes.id),
  status: text('status').notNull(),  // pending, running, success, failed
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow(),
});
```

---

## 5. API 设计

### 5.1 RESTful 端点

```
认证:
POST   /api/v1/auth/login          # 登录
POST   /api/v1/auth/register       # 注册
POST   /api/v1/auth/logout        # 登出
POST   /api/v1/auth/refresh       # 刷新 Token

数据源:
GET    /api/v1/sources             # 列表
POST   /api/v1/sources            # 创建
GET    /api/v1/sources/:id        # 详情
PUT    /api/v1/sources/:id        # 更新
DELETE /api/v1/sources/:id        # 删除
POST   /api/v1/sources/:id/test   # 测试连接

定时计划:
GET    /api/v1/schedules          # 列表
POST   /api/v1/schedules          # 创建
GET    /api/v1/schedules/:id      # 详情
PUT    /api/v1/schedules/:id      # 更新
DELETE /api/v1/schedules/:id      # 删除

采集记录:
GET    /api/v1/records             # 列表 (分页/搜索)
GET    /api/v1/records/:id         # 详情
DELETE /api/v1/records/:id        # 删除
POST   /api/v1/records/batch-delete # 批量删除

节点管理:
GET    /api/v1/nodes              # 列表
POST   /api/v1/nodes              # 注册
GET    /api/v1/nodes/:id          # 详情
DELETE /api/v1/nodes/:id         # 删除
POST   /api/v1/nodes/:id/heartbeat # 心跳

任务:
GET    /api/v1/tasks              # 列表
GET    /api/v1/tasks/:id          # 详情
POST   /api/v1/tasks/:id/cancel  # 取消

通知:
GET    /api/v1/notifications      # 列表
POST   /api/v1/notifications      # 创建
PUT    /api/v1/notifications/:id  # 更新
DELETE /api/v1/notifications/:id # 删除

Webhook:
POST   /api/v1/webhooks/:id/trigger  # 手动触发
```

### 5.2 响应格式

```typescript
// 成功响应
interface ApiResponse<T> {
  data: T;
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
    hasMore?: boolean;
  };
}

// 错误响应
interface ApiError {
  error: {
    code: string;           // e.g., "VALIDATION_ERROR"
    message: string;
    details?: Array<{
      field: string;
      issue: string;
    }>;
  };
}
```

---

## 6. 部署架构

### 6.1 开发环境

```
┌─────────────────────────────────────────────────────────────┐
│                     开发机器 (本地)                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  Next.js    │  │   Hono     │  │   III       │        │
│  │  Dev Server │  │   API      │  │   Engine   │        │
│  │  :3000      │  │   :8000    │  │   :49134   │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  PostgreSQL │  │   Redis    │  │  odp-rs    │        │
│  │   :5432     │  │   :6379    │  │   :8040    │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 生产环境 (NAS)

```
┌─────────────────────────────────────────────────────────────┐
│                        NAS (192.168.50.130)                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                    Docker Compose                     │    │
│  │                                                       │    │
│  │  ┌─────────────┐  ┌─────────────┐                 │    │
│  │  │   Nginx     │  │   Hono     │                 │    │
│  │  │   端口 80   │  │   API      │                 │    │
│  │  └─────────────┘  └─────────────┘                 │    │
│  │         │                 │                          │    │
│  │         ▼                 ▼                          │    │
│  │  ┌─────────────────────────────────────────────┐   │    │
│  │  │           III 调度 + Workers                │   │    │
│  │  │  (schedule-bootstrap, collector-*)          │   │    │
│  │  └─────────────────────────────────────────────┘   │    │
│  │         │                                           │    │
│  │         ▼                                           │    │
│  │  ┌─────────────┐  ┌─────────────┐                 │    │
│  │  │  odp-ingest │  │  odp-store │                 │    │
│  │  └─────────────┘  └─────────────┘                 │    │
│  │         │                 │                          │    │
│  │         ▼                 ▼                          │    │
│  │  ┌─────────────┐  ┌─────────────┐                 │    │
│  │  │  PostgreSQL │  │   Redis    │                 │    │
│  │  │  + TimescaleDB              │                 │    │
│  │  └─────────────┘  └─────────────┘                 │    │
│  │                                                       │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                   opencli-agent                       │    │
│  │  ┌─────────────┐  ┌─────────────┐                 │    │
│  │  │   Chrome    │  │  opencli   │                 │    │
│  │  │   Profile   │  │  Daemon    │                 │    │
│  │  └─────────────┘  └─────────────┘                 │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 6.3 分布式环境

```
┌─────────────────────────────────────────────────────────────────────┐
│                           控制中心 (NAS)                              │
├─────────────────────────────────────────────────────────────────────┤
│  Hono API + III + PostgreSQL + Redis + odp-rs                       │
└─────────────────────────────────────────────────────────────────────┘
                    │                    │                    │
         WS/HTTP    │                    │                    │ WS/HTTP
                    ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   PC 边缘       │  │   云服务器      │  │   移动设备      │
├─────────────────┤  ├─────────────────┤  ├─────────────────┤
│ Discord CLI     │  │ opencli + Chrome│  │ (监控/查看)     │
│ opencli + Chrome│  │ (高并发采集)    │  │                │
│ (实时任务)      │  │ (公开数据)      │  │                │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

---

## 7. 安全

### 7.1 认证流程

```
┌─────────────────────────────────────────────────────────────┐
│                     认证流程                                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 登录请求                                                │
│     ┌──────────┐                                            │
│     │  用户    │──▶ /api/v1/auth/login                     │
│     └──────────┘       │                                    │
│                        ▼                                    │
│  2. 验证凭证                                                │
│     ┌────────────────────────────────────────────────┐    │
│     │  - 邮箱/密码 → bcrypt 验证                       │    │
│     │  - OAuth → 第三方验证                            │    │
│     │  - API Key → 签名验证                           │    │
│     └────────────────────────────────────────────────┘    │
│                        │                                    │
│                        ▼                                    │
│  3. 生成 Token                                              │
│     ┌────────────────────────────────────────────────┐    │
│     │  - Access Token (15min, JWT)                   │    │
│     │  - Refresh Token (7d, HttpOnly Cookie)           │    │
│     └────────────────────────────────────────────────┘    │
│                        │                                    │
│                        ▼                                    │
│  4. 返回响应                                                │
│     ┌────────────────────────────────────────────────┐    │
│     │  { accessToken, expiresIn, user }             │    │
│     └────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 权限模型

| 角色 | 权限 |
|------|------|
| **Admin** | 全部权限 |
| **Operator** | 源/计划/记录 CRUD，节点查看 |
| **Viewer** | 只读访问 |

---

## 8. 监控与可观测性

### 8.1 日志层级

```typescript
// 使用 Pino 结构化日志
logger.info({
  level: "info",
  service: "opencli-api",
  requestId: "req-123",
  userId: "user-456",
  action: "source.create",
  duration: 150,
}, "Source created");

// 级别:
enum LogLevel {
  TRACE = 10,  // 调试详情
  DEBUG = 20,  // 开发调试
  INFO = 30,   // 业务事件
  WARN = 40,   // 可恢复问题
  ERROR = 50,  // 失败
}
```

### 8.2 指标

| 指标 | 类型 | 说明 |
|------|------|------|
| `http_requests_total` | Counter | HTTP 请求总数 |
| `http_request_duration_seconds` | Histogram | 请求延迟 |
| `task_queue_size` | Gauge | 任务队列大小 |
| `task_success_total` | Counter | 成功任务数 |
| `task_failed_total` | Counter | 失败任务数 |
| `node_online_count` | Gauge | 在线节点数 |
| `collection_rate` | Gauge | 采集速率 (records/s) |

### 8.3 链路追踪

```
Trace: task-abc123
├── Span: iii.schedule.tick (100ms)
│   └── Span: iii.route.select_node (10ms)
│       └── Span: node.dispatch (50ms)
│           └── Span: odp.collect (500ms)
│               ├── Span: opencli.execute (400ms)
│               └── Span: odp.ingest (100ms)
│                   └── Span: postgres.insert (50ms)
└── Span: notifier.dispatch (20ms)
```

---

## 9. 扩展阅读

- [调研报告](./SURVEY_superset.md) - 完整技术选型分析
- [API 文档](./API.md) - 详细 API 参考
- [部署指南](./DEPLOYMENT.md) - 部署配置
- [开发指南](./DEVELOPMENT.md) - 开发环境配置

---

## 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 0.1.0 | 2026-06-19 | 初始架构文档 |
