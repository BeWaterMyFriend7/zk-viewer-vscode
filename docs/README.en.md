[中文](../README.md) | [English](README.en.md)

# ZooKeeper Viewer

Browse and manage Apache ZooKeeper directly in VS Code. No separate web console is required: manage multiple connections, search nodes, view and edit JSON/TXT data, create or delete nodes, and import or export complete subtrees.

![ZooKeeper Viewer feature demo](../media/demo.gif)

The demo covers the ZooKeeper view toolbar, node context-menu actions, node details, and the complete search flow. The **More Actions** menu includes connection editing and removal, sorting, node-data import, and import-format help.

## Why ZooKeeper Viewer

- **Stay in VS Code**: browse and operate ZooKeeper without switching tools.
- **Secure connections**: supports multiple hosts, chroot, digest authentication, and TLS; passwords are stored in VS Code SecretStorage.
- **Efficient browsing**: lazily loads only expanded levels and sorts by name, creation time, or modification time.
- **Flexible search**: supports exact paths, name prefixes, path wildcards, regular expressions, and node-content search.
- **Safe editing**: details are read-only by default, and saves use ZooKeeper version checks to prevent overwriting concurrent changes.
- **Lossless migration**: export one node or a complete subtree to JSON and restore it later.
- **Chinese and English UI**: follow the VS Code display language or choose a language explicitly.

## Requirements

- VS Code `1.60.0` or later
- Apache ZooKeeper `3.4` or later
- Windows, macOS, or Linux

## Installation

Search for **ZooKeeper Viewer** in the VS Code Extensions view and select **Install**, or open its [Visual Studio Marketplace page](https://marketplace.visualstudio.com/items?itemName=BeWater.zk-viewer-vscode).

To install a downloaded VSIX:

```bash
code --install-extension zk-viewer-vscode.vsix
```

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

### Browsing and sorting

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

### Viewing and editing data

1. Double-click a node or select **Open Details**.
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
