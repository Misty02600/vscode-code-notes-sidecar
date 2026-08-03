# Source Annotation Preview

一个面向 VS Code 的非侵入式源码注解预览扩展。源码保留在普通编辑器中，解释性文字放在独立 JSON 文件里，并在右侧预览栏按代码位置排列。

```text
┌────────────── 源码编辑器 ──────────────┐  ┌──────────── 注解预览 ────────────┐
│ function parsePort(...) {             │  │ Validate before constructing     │
│   const port = ...                    │◀─┼─│ trusted config                    │
│   if (...) {                          │  │ 这段注解对应左侧 13–19 行。        │
│     throw new Error(...)              │  │                                  │
│   }                                   │  │ 点击定位 · 悬停整段高亮            │
│ }                                     │  │                                  │
└───────────────────────────────────────┘  └──────────────────────────────────┘
```

## 能做什么

- 左侧继续使用完整的 VS Code 代码编辑器，右侧显示独立的 Markdown 注解卡片。
- 同一个源码文件可以拥有任意数量、任意名称的注解页面，并在右侧工具栏切换。
- 注解卡片默认折叠为标题和行号，点击标题区域后展开 Markdown 正文。
- 一条注解可以对应连续多行代码，而不只是某一行。
- 悬停右侧卡片时，高亮左侧对应的整个代码范围；移出后恢复。
- 点击卡片标题时展开正文并将对应代码滚入视野，但不保留固定高亮。
- 在右侧卡片中直接编辑标题和 Markdown 正文，并保存回原注解 JSON。
- Markdown 可以通过稳定的页面 ID 和注解 ID 引用另一张卡片；点击后自动切页、展开并定位目标。
- 编辑器滚动时，右侧预览跟随；在双向模式下，右侧滚动也会带动左侧代码。
- 默认按编辑器行高保留卡片之间的相对源码距离，同时去掉第一张卡片之前的无内容留白。
- 注解文件变化后自动刷新，不往源码中插入注释。
- 可锁定预览，使其在切换编辑器时仍保留当前文件。

## 快速开始

1. 在工作区根目录创建 `.code-notes/`。
2. 新建一个 JSON 文件，例如 `.code-notes/config.json`：

```json
{
  "version": 1,
  "title": "Configuration loading",
  "annotations": [
    {
      "id": "validate-port",
      "file": "src/config.ts",
      "title": "先验证，再构造可信配置",
      "description": "这一段先应用默认值，然后验证端口范围。后续代码可以直接信任返回值。",
      "range": {
        "startLine": 13,
        "endLine": 19
      }
    }
  ]
}
```

安装扩展后，默认目录中的 JSON 会自动获得 Schema 校验与补全，不需要手写 `$schema`。`file` 相对于工作区根目录；`startLine` 和 `endLine` 均从 1 开始，且包含首尾行。`description` 支持 Markdown，但不执行内嵌 HTML。

### 自由命名的多页注解

需要从不同角度阅读同一个文件时，将顶层 `annotations` 换成 `pages`。页面名称和数量不受限制；下面的名称只是示例：

```json
{
  "version": 1,
  "title": "Configuration loading",
  "pages": [
    {
      "id": "first-pass",
      "title": "第一次阅读",
      "annotations": [
        {
          "id": "validate-port",
          "file": "src/config.ts",
          "title": "先验证，再构造可信配置",
          "description": "这一段在返回配置前完成运行时校验。",
          "range": { "startLine": 13, "endLine": 19 }
        }
      ]
    },
    {
      "id": "tradeoffs",
      "title": "为什么这样设计",
      "annotations": [
        {
          "id": "trusted-boundary",
          "file": "src/config.ts",
          "title": "把不可信输入限制在边界处",
          "description": "这样下游只需要处理已经验证的 `AppConfig`。",
          "range": { "startLine": 21, "endLine": 32 }
        }
      ]
    }
  ]
}
```

`id` 是稳定身份，`title` 才是显示名称：可以随时修改 `title`，但重命名时最好保留 `id`。同一个注解 `id` 可以在不同页面重复。旧的顶层 `annotations` 格式会继续作为单页显示，不需要迁移。

### 注解交叉引用

在注解的 `description` Markdown 中使用 `annotation:<page-id>/<annotation-id>`：

例如，把 Markdown 链接文字 `[查看环境同步的设计取舍]` 与链接目标 `(annotation:design-decisions/decision-single-locked-environment)` 紧接着写在一起，中间不要添加空格。

点击后，预览会切换到目标页面、展开目标卡片、将它滚动到视野中并短暂强调；目标如果对应同一注解 JSON 中的另一个源码文件，左侧也会打开并定位那个文件。引用按 `page.id` 与 `annotation.id` 解析，不依赖标题或行号，因此标题修改和代码范围调整不会破坏链接。

交叉引用目前限定在同一个注解 JSON 文档内。目标页面必须使用显式 `id`；找不到目标或链接格式错误时，扩展会显示警告，而不是静默跳转到错误位置。

3. 打开对应源码文件，通过以下任一入口打开预览：

   - 按 `Ctrl+K A`；macOS 使用 `Cmd+K A`。
   - 在编辑器中右键，选择 `Source Annotation Preview: Open Annotation Preview to the Side`。
   - 在命令面板运行同名命令。
   - 点击编辑器标题栏中的预览按钮。

仓库自带一个可运行示例，位于 `examples/demo-workspace/`。

## 交互方式

| 操作 | 结果 |
| --- | --- |
| `Ctrl+K A` / `Cmd+K A` | 在右侧打开当前文件的注解预览 |
| 编辑器右键打开预览 | 与快捷键执行相同命令 |
| 悬停注解卡片 | 临时高亮对应的多行代码 |
| 点击卡片标题 | 展开或收起正文，同时将对应代码滚入视野；高亮不会固定保留 |
| 点击展开箭头 | 只展开或收起正文，不改变左侧选择 |
| 点击 `annotation:` 交叉引用 | 切页并定位、展开和短暂强调目标注解 |
| 点击卡片中的 `Edit` | 就地编辑注解；`Ctrl/Cmd+Enter` 保存，`Esc` 取消 |
| 在工具栏选择页面 | 切换当前文件的注解角度，并按新页面重新对齐滚动 |
| 滚动源码 | 右侧按代码中心位置平滑跟随 |
| 滚动预览 | 在 `bidirectional` 模式下，将对应代码移到编辑器中心附近 |
| 点击工具栏锁图标 | 锁定或解锁当前预览文件 |
| 点击工具栏刷新图标 | 重新扫描所有注解文件 |

滚动同步基于“可见源码的分数行中点 ↔ 注解卡片中心”的分段映射。预览滚动事件按浏览器帧发送，反向同步使用较长的驱动锁避免左右两侧互相争抢滚动位置。

默认的 `sourceAligned` 布局按当前 `editor.lineHeight`（未显式配置时由 `editor.fontSize` 推算）保留注解之间的相对源码距离。每个页面都从第一张卡片开始，不复制它之前的源码空白；注解过于密集时，较后的卡片会向下避让，但悬停和点击仍使用保存的真实代码范围。若更喜欢连续列表，可将卡片布局改成 `compact`。

## 命令

- `Source Annotation Preview: Open Annotation Preview to the Side`
- `Source Annotation Preview: Toggle Annotation Preview Lock`
- `Source Annotation Preview: Reload Annotations`
- `Source Annotation Preview: Copy Annotation Stub for Selection`

最后一个命令可在编辑器中选中一段代码后生成注解骨架并复制到剪贴板。

右侧编辑器目前负责注解内容本身：标题和 Markdown 正文。`file`、`id` 与代码范围仍需在 JSON 中修改，以免普通文字编辑意外改变定位身份。保存时扩展通过 VS Code 文档 API 更新原注解文件；如果该 JSON 已经在编辑器中打开且存在未保存修改，会以当前编辑器内容为基础写入。

## 设置

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| `sourceAnnotationPreview.annotationGlob` | `.code-notes/**/*.json` | 注解文件的工作区相对 glob |
| `sourceAnnotationPreview.scrollSync` | `bidirectional` | `off`、`editorToPreview` 或 `bidirectional` |
| `sourceAnnotationPreview.followActiveEditor` | `true` | 未锁定时是否跟随活动源码编辑器 |
| `sourceAnnotationPreview.cardLayout` | `sourceAligned` | 按源码高度放置卡片，或使用紧凑连续列表 |

## 是否提交注解文件

扩展不会修改项目或个人 Git 忽略配置。是否把 `.code-notes/` 纳入版本管理由使用者自己决定：

- 注解是团队共同维护、能长期解释关键设计时，可以提交。
- 注解由个人或 AI 维护时，推荐在 `core.excludesFile` 指向的全局忽略文件中添加 `/.code-notes/`，不要改动项目的 `.gitignore`。

这种选择不会影响扩展功能。

## 当前边界

- 注解使用行号范围；重构导致代码移动后，需要更新对应范围。本版本不会自动迁移锚点。
- VS Code 的稳定扩展 API 只提供可见文本范围和 `revealRange`，不提供编辑器的绝对像素滚动值。因此普通未折叠、未换行源码可以接近逐行对齐；折叠、自动换行以及特别密集的长注解仍会使用近似映射。
- 预览一次聚焦一个源码文件，不提供全仓库注解汇总页。
- 为降低风险，预览禁用 Markdown 内嵌 HTML；内部交叉引用使用 `annotation:`，外部链接仅允许 `http`、`https` 和 `mailto`。

## 本地开发

要求 Node.js 20+ 和 VS Code 1.95+。

项目按运行边界组织：

```text
src/
├─ extension.ts                         # 最小化的 VS Code 激活入口
├─ controller/sourceAnnotationController.ts  # 编辑器、预览和命令的协调层
├─ annotations/                         # 注解格式、编辑、引用与工作区索引
├─ preview/                             # 面板协议、HTML 渲染和滚动映射
└─ webview/main.ts                      # 在右侧 Webview 中运行的浏览器端逻辑
media/
└─ preview.css                          # 独立的 Webview 样式
```

构建会生成两个互相隔离的产物：`dist/extension.js` 运行在 Node.js Extension Host，`media/preview.js` 运行在 Webview 浏览器上下文。二者都由 TypeScript 源码生成，卡片布局算法只保留一份实现。

```powershell
npm install
npm run check
npm test
npm run build
```

在 VS Code 中打开本仓库后按 `F5`，会启动 Extension Development Host。然后在开发宿主中打开 `examples/demo-workspace/` 试用。

生成可安装的 VSIX：

```powershell
npm run package
code --install-extension release/source-annotation-preview.vsix
```

正式版本也可以从 [GitHub Releases](https://github.com/Misty02600/vscode-code-notes-sidecar/releases) 下载 VSIX，
然后在 VS Code 中运行 `Extensions: Install from VSIX...` 安装。

## 数据与网络

扩展在本地读取工作区源码和注解 JSON，仅用 VS Code Webview 渲染；没有遥测，也不会主动上传源码或注解。
