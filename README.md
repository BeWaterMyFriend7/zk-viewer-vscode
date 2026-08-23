# zk-viewer-vscode

ZooKeeper 轻量级可视化 VS Code 插件：在编辑器内完成节点树浏览、搜索、JSON 查看与编辑、节点增删改，无需额外部署 Web 工具。

## 功能特性

- **连接管理**：多连接配置、digest 认证（凭据经 VS Code SecretStorage 加密保存）、TLS（`ssl://`）、断线自动重连；侧边栏标题栏一键 **加号新建连接**
- **节点树**：侧边栏树形浏览（节点树造型活动栏图标），子节点懒加载，持久/顺序/临时节点图标区分，支持按名称 / 创建时间 / 更新时间排序（正序、倒序或服务器顺序，设置或侧边栏菜单切换），右键快捷操作
- **查询搜索**：侧边栏标题栏 **放大镜快捷搜索**、路径定位（`zkViewer.gotoPath`）、名称前缀 / 路径通配符 / 正则 / 节点内容搜索；遍历并发化，内容搜索自动跳过空数据与超大节点
- **JSON 查看与编辑**：详情面板展示 stat 与格式化 JSON；支持 JSON / TXT 显示切换、换行开关和安全的一键 JSON 紧凑化；**默认只读，点击 Edit 才进入编辑**，保存带版本号乐观锁（冲突不覆盖）；非 JSON 文本与二进制（十六进制）自动降级
- **节点操作**：新增（四种节点类型）、编辑、删除（含递归删除与二次确认）、复制路径；可将单节点或完整子树的路径与数据无损导出为 JSON

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

## 用户操作手册

### 快速上手

1. 点击活动栏的 ZooKeeper 图标打开侧边栏
2. 点击侧边栏标题栏的 **加号** 新建连接，配置服务器地址（如 `localhost:2181`）与认证信息
3. 点击 **连接**（插头图标）建立连接，展开节点树浏览
4. 右键节点执行新增、删除、复制路径；双击打开详情面板查看 JSON（只读），点击 **Edit** 进入编辑
5. 点击侧边栏标题栏的 **放大镜**，或在命令面板（`Ctrl+Shift+P`）使用 `ZooKeeper: Search Nodes...` 快速定位

### 连接管理

**新建连接**

点击侧边栏标题栏的 **加号** 或执行 `ZooKeeper: Add Connection...`，按提示填写：

| 字段 | 说明 | 示例 |
| --- | --- | --- |
| 连接名称 | 便于识别的别名 | `开发环境` |
| 主机列表 | 逗号分隔的 `host:port`，可填多个 | `zk1:2181,zk2:2181` |
| Chroot（可选） | 根路径前缀，进入指定子树 | `/app` |
| 用户名 / 密码（可选） | digest 认证凭据 | `admin` / `******` |
| 使用 TLS | 开启后连接串使用 `ssl://` 前缀 | 开启 / 关闭 |

密码经 VS Code 加密存储（SecretStorage），不会写入配置或日志。

**连接 / 断开**

- 点击标题栏的 **连接**（插头图标）建立连接；已连接时标题栏显示 **断开**（断连图标）
- 连接状态同步显示在状态栏：`ZK: 已连接` / `ZK: 连接中...` / `ZK: 已断开`

**编辑 / 删除连接**

点击侧边栏标题栏的 **省略号菜单** 选择 `Edit Connection...` / `Remove Connection...`；删除连接会同时清除其加密保存的密码。

**断线重连**

网络抖动或会话超时后自动重连，次数与间隔通过设置 `zkViewer.maxReconnectAttempts`、`zkViewer.reconnectDelayMs` 调整。

### 浏览节点树

- 点击节点展开子节点，子节点按需懒加载，不会一次拉取整棵树
- 节点图标区分类型：文件夹（持久）、结构符号（持久顺序）、事件符号（临时）、类符号（临时顺序）
- 右键节点可执行 **新增节点 / 编辑节点数据 / 删除节点 / 复制路径 / 导出节点数据 / 导出完整子树 / 刷新**
- 右键节点 → **Search in this subtree...** 可在该节点子树范围内精准搜索（遍历范围小，速度快且结果完整）
- **排序**：点击侧边栏标题栏 **省略号菜单** 的 `Sort Nodes...`，或修改设置 `zkViewer.treeSort`，支持按名称、创建时间、更新时间正序 / 倒序，以及服务器顺序

### 搜索与定位

**搜索节点**

点击侧边栏标题栏的 **放大镜** 或执行 `ZooKeeper: Search Nodes...`，先选择搜索模式，再输入关键字：

| 模式 | 匹配范围 | 示例 |
| --- | --- | --- |
| 精确路径 | 输入完整路径直接定位节点 | `/app/config` |
| 名称前缀 | 节点名称以关键字开头 | `config` |
| 路径通配符 | `*` / `?` 匹配路径段 | `/app/*/config` |
| 路径正则 | 正则表达式匹配完整路径 | `^/svc-\d+$` |
| 内容 | 节点数据包含关键字（可限定子树） | `role` |

搜索结果按路径排序展示，点击结果后树视图自动展开并定位到对应节点。「精确路径」模式直接输入完整路径（如 `/app/config`）即可直达并选中该节点，不会做模糊匹配。

**完整性保证**：内容搜索默认不过滤任何节点（`zkViewer.maxNodeDataBytes` 为 0），搜索默认最多遍历 500000 个节点（`zkViewer.maxSearchNodes`），也可设为 0 表示无限制；若达到上限，界面会明确提示结果可能不完整。搜索过程中显示进度条，可随时按 Esc 取消。

**提速建议**：搜索范围越小越快。在树节点上右键选择 **Search in this subtree...**，或内容搜索时限定子树根路径，可大幅减少遍历量。

**路径定位**

执行 `ZooKeeper: Go to Path...` 输入完整路径（如 `/app/config`），树视图直接展开并选中目标节点。

### 查看与编辑节点数据

1. 双击节点，或右键选择 `Open Details`，打开详情面板
2. 面板展示节点路径、stat 信息（版本、创建 / 修改时间、数据长度、子节点数等）与数据内容
3. 默认以 **JSON** 模式格式化展示，可切换 **TXT** 查看原始文本；格式化仅作用于显示，不会把缩进空格写入原始数据
4. **Wrap** 控制是否自动换行，默认开启；**Minify JSON** 可安全移除 JSON 结构中的多余空格与换行，同时保留字符串值内部的空白
5. 数据默认**只读**，点击 **Edit** 按钮才进入编辑模式；JSON 模式保存时自动紧凑序列化，TXT 模式按编辑内容原样保存
6. 点击 **Save** 保存：写入携带节点版本号（乐观锁），若期间被其他端修改则提示版本冲突且**不会覆盖**，刷新后重新编辑即可
7. 面板会持续监测节点：若编辑期间节点被其他端删除，立即弹出错误提示并自动关闭面板；保存失败也会弹出 VS Code 错误通知

### 导出节点数据

- 右键选择 `Export Node Data...`：仅导出当前节点
- 右键选择 `Export Node and Descendant Data...`：导出当前节点及所有层级的子节点，直到叶子节点
- 导出文件为 JSON，每项包含完整 `path`、`data` 和 `encoding`；普通文本使用 `utf8`，无法无损表示为 UTF-8 的数据使用 `base64`

### 节点管理

**新增节点**

右键目标父节点，选择 `Add Node...`，填写节点名并选择类型：

| 类型 | 特点 |
| --- | --- |
| 持久 | 默认类型，数据持久保存 |
| 持久顺序 | 名称自动追加递增序号，持久保存 |
| 临时 | 会话断开即消失，通常用于服务注册 |
| 临时顺序 | 会话断开即消失，名称自动追加递增序号 |

节点名不能包含 `/`，不能为 `.` 或 `..`。

**删除节点**

- 右键节点，选择 `Delete Node`，弹窗确认后删除
- 节点含子节点时选择 **Delete Recursively** 递归删除整个子树（子节点先删、父节点后删）
- 取消确认不会执行任何删除操作

**复制路径**

右键节点，选择 `Copy Path`，将节点完整路径复制到剪贴板。

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
| `zkViewer.exportNodeData` / `exportSubtreeData` | 导出单节点 / 完整子树数据 |
| `zkViewer.openNodeDetail` | 打开详情面板 |
| `zkViewer.setTreeSort` | 选择节点排序方式 |

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
