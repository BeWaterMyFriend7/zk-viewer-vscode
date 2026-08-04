# 仓库指南

## 项目概述

zk-viewer-vscode 是一个 VS Code 扩展，为 Apache ZooKeeper 提供轻量级可视化客户端。项目采用 Apache 2.0 许可证，`main` 为稳定分支。

## 项目结构与模块组织

扩展遵循标准 VS Code 扩展布局：

- `src/` — TypeScript 源码：激活入口、命令处理、树视图与 ZooKeeper 客户端封装
- `media/` — Webview 静态资源（样式与脚本）
- `test/` — 在扩展开发宿主（Extension Development Host）中运行的集成测试
- `docs/` — `REQUIREMENTS.md`（需求文档）与 `design.md`（架构与设计决策）
- `package.json` — 扩展清单：贡献点、激活事件、命令与配置
- `.vscode/` — 共享的调试启动与任务配置

逻辑应放在 `src/` 下职责单一的小模块中（如 `src/tree/`、`src/commands/`），避免文件过大。

## 构建、测试与开发命令

- `npm install` — 安装依赖
- `npm run compile` — 类型检查并编译 TypeScript
- `npm test` — 在扩展开发宿主中运行集成测试（通过 `@vscode/test-electron`）
- `npm run test:perf` — 运行懒加载性能断言（500 个子节点层级耗时低于 500ms）
- `npm run test:unit:cov` — 运行单元测试并输出 c8 覆盖率报告
- `npm run lint` — 运行 ESLint
- 在 VS Code 中按 `F5` — 启动扩展开发宿主进行手动测试
- `vsce package` — 打包可安装的 `.vsix` 文件

## 编码风格与命名约定

- TypeScript：2 空格缩进、分号、单引号
- 变量与函数使用 `camelCase`，类与类型使用 `PascalCase`，文件名使用 `kebab-case`
- VS Code 命令使用 `zkViewer.` 前缀，如 `zkViewer.refresh`
- 提交前需通过 ESLint 与 Prettier 检查

## 测试规范

- 集成测试使用 Mocha + `@vscode/test-electron`
- 按功能使用 `describe` 分组，`it` 用例名描述预期行为
- 覆盖命令处理器与树视图行为；通过 Mock 客户端保持测试与真实 ZooKeeper 集群无关

## 提交与 Pull Request 规范

### Commit 信息

所有 Commit 信息必须使用**中文**总结：

- 首行为一句话中文总结，描述本次改动做了什么（如「优化搜索逻辑」）
- 如有多个修改点，空一行后以列表逐条列出；改动较小（如单文件小修复）可以只写总结，不必列出明细

示例：

```text
优化搜索逻辑
- 优化图标
- 修复搜索展示逻辑
- 调整文档
```
- 相关 Issue 编号写入提交正文

### Pull Request

- 关联相关 Issue，说明变更内容与影响
- UI 变更需附截图
- 合并前必须通过 `npm test` 与 `npm run lint`
