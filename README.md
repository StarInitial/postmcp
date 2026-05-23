# PostMCP

PostMCP 是一个基于 Wails、Go 和 React 构建的桌面调试工具，用于把传统 HTTP 接口调试与 Model Context Protocol (MCP) 工具调试放到同一个工作台里。

它适合需要同时处理 API 请求、MCP Server 工具调用、Prompt/Resource 检查，以及多工作空间配置管理的开发者。项目当前聚焦于桌面端本地工作流：本地保存、快速切换、可选 Git 同步，以及对 MCP 生态更友好的调试体验。

## 功能特性

- 同时支持 HTTP 请求调试与 MCP 工具调用
- 支持 MCP Server 发现：Tools、Prompts、Resources 一站式浏览
- 支持 `stdio`、`SSE`、`Streamable HTTP` 三类 MCP 传输方式
- 支持导入 MCP JSON 配置，便于迁移已有服务器定义
- 支持 HTTP 请求参数、请求头、认证、Cookie、表单、原始 Body、二进制 Body 编辑
- 支持将 `curl` 命令导入为 HTTP 请求
- 支持为 HTTP 与 MCP 请求生成代码片段
- 支持请求历史记录、按天归档与回放
- 支持收藏集管理，可保存 HTTP/MCP 请求预设
- 支持多工作空间管理与快速切换
- 支持为工作空间绑定 Git 仓库，预览、提交并推送变更
- 支持主题色、主题模式、请求超时、响应大小上限等桌面设置

## 适用场景

- 调试普通 REST / HTTP 接口，同时验证与大模型工具链相关的 MCP Server
- 管理多个本地或 Git 绑定的测试工作空间
- 检查某个 MCP Server 暴露了哪些工具、提示模板与资源
- 归档团队内部接口请求与 MCP 调用模板
- 在一个桌面应用里替代分散的 HTTP 调试、JSON 配置编辑与 MCP 验证流程

## 技术栈

- Backend: Go 1.25, Wails v2
- Frontend: React 18, Vite, Fluent UI, Monaco Editor
- MCP SDK: `github.com/modelcontextprotocol/go-sdk`
- Package Manager: `pnpm`

## 快速开始

### 环境要求

- Go `1.25.0`
- Node.js `18+`
- `pnpm` `9+`
- Wails CLI

安装 Wails CLI：

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

### 安装依赖

```bash
pnpm --dir frontend install
```

### 开发模式

```bash
wails dev
```

这会启动 Wails 桌面应用，并同时运行前端 Vite 开发服务。

如果只想单独调试前端：

```bash
pnpm --dir frontend dev
```

### 构建应用

```bash
wails build
```

Windows 默认产物路径：

```text
build/bin/post-mcp.exe
```

## 测试与校验

后端测试：

```bash
go test ./...
```

单独构建前端：

```bash
pnpm --dir frontend build
```

Go 代码格式化：

```bash
gofmt -w *.go
```

## 使用说明

### HTTP 调试

- 创建 HTTP 标签页并填写 URL、Method、Query、Headers、Auth、Body
- 支持 `Basic`、`Bearer`、`API Key` 认证
- 支持 `form-data`、`x-www-form-urlencoded`、原始文本、JSON、HTML、XML、二进制请求体
- 支持自动追加认证头、查询参数、Cookie 与 `Content-Type`
- 响应区可查看状态码、响应头、响应体、耗时和大小

### MCP 调试

- 新建或导入 MCP Server 配置
- 可使用 `stdio` 启动本地 MCP Server，也可连接远程 `SSE` / `Streamable HTTP` 服务
- 对单个 MCP Server 执行连通性测试与能力发现
- 浏览 Tools、Prompts、Resources，并直接执行 Tool / 获取 Prompt / 读取 Resource
- MCP 调用结果会写入历史记录，便于回放与沉淀模板

### 工作空间

- 工作空间用于隔离收藏集、MCP 配置、历史记录和应用内元数据
- 默认工作空间存在且为只读管理对象，不能删除
- 可创建本地工作空间，也可从本地目录或远端 Git 仓库导入工作空间
- 启用 Git 集成后，可对工作空间执行拉取、变更预览、提交与推送

## 数据存储

PostMCP 默认把运行数据保存在用户配置目录，而不是仓库目录中。

关键目录约定：

- 应用配置根目录：用户配置目录下的 `post-mcp`
- 运行时目录：`workspace-runtime`
- 工作空间目录：`workspace-runtime/workspaces`
- 旧版 `data` 目录仅作为迁移来源，不再作为新数据写入目标

每个工作空间会保存：

- `workspace.json`
- `setting.json`
- `collections/`
- `mcp/`
- `history/`

这意味着应用更适合本地优先的桌面调试场景，同时也方便将工作空间本身纳入 Git 管理。

## 项目结构

```text
.
├─ main.go                  # Wails 入口
├─ app.go                   # 应用生命周期与前后端桥接
├─ http_debug.go            # HTTP 请求执行逻辑
├─ mcp_debug.go             # MCP 发现与调用逻辑
├─ workspace_manager.go     # 工作空间管理
├─ workspace_git.go         # 工作空间 Git 集成
├─ store.go                 # 持久化与文件读写
├─ models.go                # 数据模型
└─ frontend/
   ├─ src/features/workbench/App.jsx
   ├─ src/services/backend.js
   └─ ...
```

## 开发命令

```bash
pnpm --dir frontend install
pnpm --dir frontend dev
pnpm --dir frontend build
pnpm --dir frontend preview
wails dev
wails build
go test ./...
```

## 路线方向

当前版本已经可用于本地桌面调试，但项目仍有继续演进空间，例如：

- 更完整的请求集合导入导出能力
- 更细粒度的工作空间协作与同步策略
- 更完善的测试覆盖
- 更成熟的发布流程与跨平台安装包

如果你准备将它用于团队协作，建议优先把工作空间目录纳入版本控制，而不是依赖单机状态。

## 贡献

欢迎提交 Issue 与 Pull Request。

提交变更前，建议至少完成以下检查：

```bash
go test ./...
pnpm --dir frontend build
```

如果你在修改 Go 文件，请运行：

```bash
gofmt -w *.go
```

## 许可证

本项目基于 [Apache License 2.0](./LICENSE) 开源。
