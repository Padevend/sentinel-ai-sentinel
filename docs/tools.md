# Sentinel Tools Reference

Sentinel provides a collection of deterministic tools for interacting with filesystems, shells, and version control.

---

## 1. Tool Interface

```ts
interface Tool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly permissions: PermissionLevel;
  execute(input: unknown, context: ToolContext): Promise<ToolResult>;
}
```

---

## 2. Filesystem Tools

### `list_directory`
- **Permissions**: `safe`
- **Input**:
  - `path`: string (relative path, defaults to `"."`)
  - `recursive`: boolean (defaults to `false`, max depth 3)
- **Description**: Lists directory entries. Automatically skips `node_modules`, `.git`, and `dist`.

### `read_file`
- **Permissions**: `safe`
- **Input**:
  - `path`: string (required)
  - `startLine`: number (optional, 1-indexed)
  - `endLine`: number (optional, 1-indexed)
- **Description**: Reads file contents formatted with line numbers.

### `search_text`
- **Permissions**: `safe`
- **Input**:
  - `pattern`: string (required)
  - `path`: string (optional, defaults to `"."`)
  - `caseSensitive`: boolean (defaults to `true`)
  - `maxResults`: number (defaults to `50`)
- **Description**: Searches text and regex across text files.

### `write_file`
- **Permissions**: `confirm_recommended`
- **Input**:
  - `path`: string (required)
  - `content`: string (required)
- **Description**: Creates or replaces a file. Automatically creates parent directories.

### `patch_file`
- **Permissions**: `confirm_recommended`
- **Input**:
  - `path`: string (required)
  - `patches`: Array of `{ search: string, replace: string }`
- **Description**: Performs targeted text replacement.

### `delete_file`
- **Permissions**: `confirm_required`
- **Input**:
  - `path`: string (required)
- **Description**: Deletes a file. Requires user confirmation.

---

## 3. Shell Tool

### `execute_command`
- **Permissions**: `confirm_recommended`
- **Input**:
  - `command`: string (required)
  - `cwd`: string (optional)
  - `timeout`: number (optional, defaults to 60000ms)
- **Description**: Executes a shell command with output buffering, timeout, and abort signal cancellation.

---

## 4. Git Tools

### `git_status`
- **Permissions**: `safe`
- **Description**: Returns repository branch, tracking info, and staged/unstaged changes.

### `git_diff`
- **Permissions**: `safe`
- **Input**:
  - `staged`: boolean (optional)
  - `file`: string (optional)
- **Description**: Returns standard Git diff output.

### `git_log`
- **Permissions**: `safe`
- **Input**:
  - `count`: number (optional, default 10)
- **Description**: Returns recent commit log entries with hash, author, date, and commit message.

### `git_branch`
- **Permissions**: `safe`
- **Description**: Returns active branch and list of local/remote branches.
