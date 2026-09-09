# ZooKeeper Viewer

<p align="center">
  <img src="../media/icon-source.svg" width="200">
</p>

[中文 README](../README.md) | [English README](README.en.md)

Browse and manage Apache ZooKeeper data directly in VS Code. Manage multiple connections, search nodes, view and edit node data in JSON or TXT format, create or delete nodes, and import or export data.

![ZooKeeper Viewer feature demo](../media/demo.gif)

## Why ZooKeeper Viewer

- **Lightweight and agile**: built on VS Code, with no additional dependencies required.
- **Efficient browsing**: lazily loads only expanded levels and sorts by name, creation time, or modification time.
- **Secure connections**: supports multiple hosts, chroot, digest authentication, and TLS; passwords are stored in VS Code SecretStorage.
- **Flexible search**: supports exact paths, name prefixes, path wildcards, regular expressions, and node-content search.
- **Friendly visualization**: view node data as JSON or TXT, toggle line wrapping as needed, remove unnecessary line breaks with one action, and edit data conveniently.
- **Lossless migration**: export one node or a complete subtree to JSON and restore it later.
- **Chinese and English UI**: follow the VS Code display language or choose a language explicitly.

## Environment

- VS Code `1.60.0` or later
- Apache ZooKeeper `3.4` or later
- Windows, macOS, or Linux

## Installation

- **Install from VS Code**:
  Search for **ZooKeeper Viewer** in the VS Code Extensions view and select **Install**.

- **Install from the online marketplace**:
  Open the [Visual Studio Marketplace page](https://marketplace.visualstudio.com/items?itemName=BeWater.zk-viewer-vscode).

- **Download a release package from GitHub for offline installation**:
  - Download the latest package from [GitHub Releases](https://github.com/BeWaterMyFriend7/zk-viewer-vscode/releases).
  - In the VS Code Extensions view, select **Install from VSIX...**, or run:

    ```bash
    code --install-extension zk-viewer-vscode.vsix
    ```

- **Build and install from source**:
  - Download or clone the [source repository](https://github.com/BeWaterMyFriend7/zk-viewer-vscode.git).
  - In the project root, run:

    ```bash
    npm run package          # Generates dist/zk-viewer-vscode.vsix
    ```

  - Install the generated VSIX in VS Code.

## Quick start

1. Select the ZooKeeper icon in the Activity Bar.
2. Select **+** in the view title, then enter a connection name and hosts such as `localhost:2181`.
3. Select **Connect**.
4. Expand the tree. Double-click a node to open details, or use its context menu for node operations.
5. Select **Search** to locate a path or search node names and content.

## User guide

### Connection management

Select **+** in the view title or run `ZooKeeper: Add Connection...` from the Command Palette.

The connection form includes the name, hosts, chroot, digest credentials, TLS, and session timeout. Before saving, **Test Connection** can verify the current form values against the server. When editing, leaving the password blank reuses the saved password.

| Field | Description | Example |
| --- | --- | --- |
| Name | Local display name | `Development` |
| Hosts | Comma-separated `host:port` entries | `zk1:2181,zk2:2181` |
| Chroot | Optional root-path prefix | `/app` |
| Username / password | Optional digest credentials | `admin` / `******` |
| TLS | Connect through `ssl://` | On / Off |
| Session timeout | Connection and heartbeat timeout | Default: `3000` ms |

Connection settings are stored in the VS Code workspace state. Passwords are encrypted separately through VS Code SecretStorage and are not written to ordinary settings or logs.

After a network interruption, the underlying client first attempts to recover the existing session within a bounded observation window. A new session is created only after session expiration, authentication failure, or observation timeout. Configure the window with `zkViewer.maxReconnectAttempts` and `zkViewer.reconnectDelayMs`.

### Node browsing and management

- Expanding a node loads only its direct children.
- Persistent nodes use folder or file icons depending on whether they have children. Sequential and ephemeral node types keep distinct icons.
- The node context menu provides details, add, edit, delete, copy path, subtree search, export, and refresh actions.
- Use **Sort Nodes...** from **More Actions** to sort by name, creation time, or modification time in either direction, or retain server order.

### Search and navigation

Select **Search** or run `ZooKeeper: Search Nodes...`.

| Mode | Matching rule | Example |
| --- | --- | --- |
| Exact path | Locate one complete path directly | `/app/config` |
| Name prefix | Node name starts with the query | `config` |
| Path wildcard | `*` and `?` match paths | `/app/*/config` |
| Path regex | Regular expression against the full path | `^/svc-\d+$` |
| Content | Node data contains the query | `role` |

Results are sorted by path. Selecting a result expands the tree and reveals the node. Content search may be scoped to one subtree and can be cancelled with Esc.

`zkViewer.maxSearchNodes` defaults to 500000 visited nodes; set it to `0` for no limit. `zkViewer.maxNodeDataBytes` limits the amount of data read from each node during content search and defaults to `0` (unlimited).

### Viewing and editing node data

1. Select a node, then choose **Open Details** or **Open Details in New Tab**.
2. Deep paths use a compact VS Code tab title such as `.../parent/current`. The panel retains the complete path, truncates it to one line when necessary, and exposes the full value on hover and for text selection.
3. Node metadata is collapsed by default. Expand **Details** to see readable node type, timestamps, data size, direct-child count, data/children/ACL versions, and creation/modification transaction IDs.
4. Valid JSON is displayed with two-space indentation. Switch to TXT for the original text and use the wrap control as needed.
5. Details are read-only by default. **Edit / Save** remain grouped on the left of the data toolbar; display controls remain grouped on the right.
6. JSON mode validates and compacts data before saving. TXT mode saves the entered text unchanged.
7. Saves include the loaded node version. A concurrent remote update reports a version conflict instead of overwriting data.

Non-JSON text opens in TXT mode. Binary data is displayed as a read-only hexadecimal dump.

The current JSON editor is a lightweight text area. Valid JSON is formatted when loaded or when JSON display mode is selected; invalid JSON is preserved and reported. It does not provide VS Code editor syntax highlighting, completion, or live formatting.

### Creating and deleting nodes

Use **Add Node...** on a parent node. The form includes a read-only parent path, node name, node type, and the shared JSON/TXT data editor. Names cannot contain `/` and cannot be `.` or `..`.

| Type | Behaviour |
| --- | --- |
| Persistent | Remains after the session disconnects |
| Persistent sequential | Appends a sequence number and remains persistent |
| Ephemeral | ZooKeeper removes it when the session ends |
| Ephemeral sequential | Appends a sequence number and is removed when the session ends |

Deletion requires confirmation. Recursive deletion removes descendants before their parent.

### Import and export

- **Export Node Data...** exports the selected node.
- **Export Node and All Child Data...** exports the selected node and its complete subtree.
- **Import Node Data...** in **More Actions** restores a standard export document.
- **View Import Format** shows the accepted format and downloads a template.

Exports include each node's complete `path`, `data`, and `encoding`. Text uses `utf8`; bytes that cannot be represented losslessly as UTF-8 use `base64`.

Before writing, import validates the format version, path scope, duplicate paths, Base64 data, and external parents. Missing nodes are created parent-first as persistent nodes. Existing nodes can be skipped or overwritten.

### Language

Use the language action in the view title to choose:

- Follow VS Code
- 中文
- English

The selection updates menus, notifications, search, import/export flows, and open detail panels immediately.

## Privacy and security

- The extension includes no telemetry or usage reporting.
- ZooKeeper data travels only between VS Code and the configured ZooKeeper server.
- Digest passwords are stored with VS Code SecretStorage.
- Node details are read-only by default; edits and deletions require explicit actions.

Use least-privilege ZooKeeper accounts for routine browsing.

## Known limitations

- Binary node data is available only as a read-only hexadecimal view.
- ZooKeeper removes ephemeral nodes after their owning session ends.
- Full-tree content search may take time on very large ensembles; prefer searching from a relevant subtree.

## Support

See [Support](SUPPORT.md) or open a [GitHub issue](https://github.com/BeWaterMyFriend7/zk-viewer-vscode/issues).

## License

[Apache License 2.0](../LICENSE)
