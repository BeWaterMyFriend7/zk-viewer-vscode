# zk-viewer-vscode

ZooKeeper 轻量级可视化 VS Code 插件：在编辑器内完成节点树浏览、搜索、JSON 查看与编辑、节点增删改，无需额外部署 Web 工具。

## 功能特性

- **连接管理**：多连接配置、digest 认证（凭据经 VS Code SecretStorage 加密保存）、TLS（`ssl://`）、断线自动重连；侧边栏标题栏一键 **＋ 新建连接**
- **节点树**：侧边栏树形浏览（节点树造型活动栏图标），子节点懒加载，持久/顺序/临时节点图标区分，右键快捷操作
- **查询搜索**：侧边栏标题栏 **放大镜快捷搜索**、路径定位（`zkViewer.gotoPath`）、名称前缀 / 路径通配符 / 正则 / 节点内容搜索
- **JSON 查看与编辑**：详情面板展示 stat 与格式化 JSON；**默认只读，点击 Edit 才进入编辑**，保存带版本号乐观锁（冲突不覆盖）；非 JSON 文本与二进制（十六进制）自动降级
- **节点操作**：新增（四种节点类型）、编辑、删除（含递归删除与二次确认）、复制路径

## 兼容性

- VS Code `>= 1.60`
- ZooKeeper `3.4+`
- Windows / macOS / Linux

## 安装

### 从 VSIX 安装

```bash
npm ci
npm run package
code --install-extension dist/zk-viewer-vscode.vsix
```

### 开发模式（Mock，无需真实 ZooKeeper）

```bash
ZK_VIEWER_USE_MOCK=1 code .        # PowerShell: $env:ZK_VIEWER_USE_MOCK="1"; code .
```

或在 VS Code 设置中开启 `zkViewer.dev.useMockClient`，然后按 `F5` 启动扩展开发宿主。

## 快速开始

1. 点击活动栏的 ZooKeeper 图标打开侧边栏
2. 点击侧边栏标题栏的 **＋** 新建连接，配置服务器地址（如 `localhost:2181`）与认证信息
3. 点击 **连接**（插头图标）建立连接，展开节点树浏览
4. 右键节点执行新增、删除、复制路径；双击打开详情面板查看 JSON（只读），点击 **Edit** 进入编辑
5. 点击侧边栏标题栏的 **放大镜** 或使用 `Search Nodes...` / `Go to Path...` 快速定位

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `zkViewer.connect` / `zkViewer.disconnect` | 连接 / 断开 |
| `zkViewer.addConnection` / `editConnection` / `removeConnection` | 连接配置管理 |
| `zkViewer.refresh` | 刷新节点树 |
| `zkViewer.search` | 搜索节点 |
| `zkViewer.gotoPath` | 按路径定位 |
| `zkViewer.addNode` / `deleteNode` / `editNode` | 节点增删改 |
| `zkViewer.copyPath` | 复制节点路径 |
| `zkViewer.openNodeDetail` | 打开详情面板 |

## 开发

```bash
npm install        # 安装依赖
npm run compile    # 编译 TypeScript
npm run lint       # ESLint
npm run format     # Prettier 格式化
npm run test:unit  # 单元测试（Mocha，无需 VS Code）
npm run test:perf  # 性能测试（500 子节点懒加载 < 500ms）
npm run test:integration  # 集成测试（自动下载 VS Code 1.60.0 验证最低兼容版本）
npm run package    # 生成 dist/*.vsix
```

集成测试默认运行在最低支持版本 VS Code 1.60.0 上，可通过 `VSCODE_TEST_VERSION` 覆盖（如 `stable`）。

## 文档

- [需求文档](docs/REQUIREMENTS.md)
- [设计文档](docs/design.md)（架构、模块设计、关键决策、兼容性与验收）

## 已知限制

- `node-zookeeper-client` 为原生模块，旧版 VS Code 的 Extension Host 可能需要 `electron-rebuild` 匹配其 Electron Node ABI
- 二进制节点数据只读展示（十六进制视图），不可编辑
- 临时节点随会话断开而消失（ZooKeeper 语义）

## 许可证

Apache License 2.0，详见 [LICENSE](LICENSE)。
