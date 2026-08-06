import path from "node:path";
import * as vscode from "vscode";
import { AnnotationContentPatch } from "../annotations/edit";
import { parseAnnotationReference } from "../annotations/reference";
import { ResolvedAnnotation, AnnotationStore } from "../annotations/store";
import { AnnotationPreviewPanel } from "../preview/panel";
import {
  PreviewLayout,
  previewScrollTopToSourceLine,
  sourceLineToPreviewScrollTop
} from "../preview/scrollMap";
import { CardLayout } from "../preview/types";

type ScrollSyncMode = "off" | "editorToPreview" | "bidirectional";

const SCROLL_TARGET_TTL_MS = 500;

interface PendingEditorScroll {
  editor: vscode.TextEditor;
  targetLine: number;
  expiresAt: number;
}

function sameUri(left: vscode.Uri, right: vscode.Uri): boolean {
  const leftValue = left.toString();
  const rightValue = right.toString();
  if (left.scheme === "file" && right.scheme === "file" && process.platform === "win32") {
    return leftValue.toLowerCase() === rightValue.toLowerCase();
  }
  return leftValue === rightValue;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export class SourceAnnotationController implements vscode.Disposable {
  private readonly output = vscode.window.createOutputChannel("Code Notes Sidecar");
  private readonly store = new AnnotationStore(this.output);
  private readonly hoverDecoration = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: new vscode.ThemeColor("editor.findMatchHighlightBackground"),
    border: "1px solid",
    borderColor: new vscode.ThemeColor("editor.findMatchBorder"),
    overviewRulerColor: new vscode.ThemeColor("editorOverviewRuler.findMatchForeground"),
    overviewRulerLane: vscode.OverviewRulerLane.Center,
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
  });
  private readonly disposables: vscode.Disposable[] = [];

  private preview: AnnotationPreviewPanel | undefined;
  private sourceEditor: vscode.TextEditor | undefined;
  private annotations = new Map<string, ResolvedAnnotation>();
  private previewLayout: PreviewLayout | undefined;
  private previewLocked = false;
  private pendingEditorScrolls: PendingEditorScroll[] = [];
  private renderedLineCount = 0;
  private renderTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  async start(): Promise<void> {
    this.registerCommands();
    this.registerEvents();
    await this.store.start();
  }

  dispose(): void {
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
    }
    this.preview?.dispose();
    this.preview = undefined;
    this.clearDecorations();
    this.disposables.splice(0).forEach(disposable => disposable.dispose());
    this.store.dispose();
    this.hoverDecoration.dispose();
    this.output.dispose();
  }

  private registerCommands(): void {
    this.disposables.push(
      vscode.commands.registerCommand(
        "codeNotesSidecar.openPreviewToSide",
        () => this.openPreviewToSide()
      ),
      vscode.commands.registerCommand(
        "codeNotesSidecar.togglePreviewLock",
        () => this.togglePreviewLock()
      ),
      vscode.commands.registerCommand(
        "codeNotesSidecar.reloadAnnotations",
        async () => {
          await this.store.reload();
          void vscode.window.showInformationMessage("Source annotations reloaded.");
        }
      ),
      vscode.commands.registerCommand(
        "codeNotesSidecar.copyAnnotationStub",
        () => this.copyAnnotationStub()
      )
    );
  }

  private registerEvents(): void {
    this.disposables.push(
      this.store.onDidChange(() => this.renderCurrentDocument()),
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (!editor || !this.preview || !this.canPreview(editor)) {
          return;
        }
        if (
          this.sourceEditor &&
          sameUri(editor.document.uri, this.sourceEditor.document.uri)
        ) {
          this.sourceEditor = editor;
          this.pendingEditorScrolls = this.pendingEditorScrolls.filter(
            pending => pending.editor === editor
          );
          if (this.pendingEditorScrolls.length === 0) {
            this.syncEditorToPreview(editor.visibleRanges);
          }
          return;
        }
        if (!this.previewLocked && this.followActiveEditor) {
          this.bindSourceEditor(editor);
        }
      }),
      vscode.window.onDidChangeTextEditorVisibleRanges(event =>
        this.handleEditorVisibleRanges(event)
      ),
      vscode.workspace.onDidSaveTextDocument(document => {
        if (this.sourceEditor && sameUri(document.uri, this.sourceEditor.document.uri)) {
          this.renderCurrentDocument();
        }
      }),
      vscode.workspace.onDidChangeTextDocument(event => {
        if (
          this.sourceEditor &&
          sameUri(event.document.uri, this.sourceEditor.document.uri) &&
          event.document.lineCount !== this.renderedLineCount
        ) {
          this.previewLayout = undefined;
          this.scheduleRender();
        }
      }),
      vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration("codeNotesSidecar.annotationGlob")) {
          void this.store.refreshConfiguration();
        }
        if (event.affectsConfiguration("codeNotesSidecar.scrollSync")) {
          this.syncEditorToPreview();
        }
        if (
          event.affectsConfiguration("codeNotesSidecar.cardLayout") ||
          event.affectsConfiguration("editor.lineHeight") ||
          event.affectsConfiguration("editor.fontSize")
        ) {
          this.renderCurrentDocument();
        }
      })
    );
  }

  private get followActiveEditor(): boolean {
    return vscode.workspace
      .getConfiguration("codeNotesSidecar")
      .get("followActiveEditor", true);
  }

  private get scrollSyncMode(): ScrollSyncMode {
    return vscode.workspace
      .getConfiguration("codeNotesSidecar")
      .get<ScrollSyncMode>("scrollSync", "bidirectional");
  }

  private get cardLayout(): CardLayout {
    return vscode.workspace
      .getConfiguration("codeNotesSidecar")
      .get<CardLayout>("cardLayout", "sourceAligned");
  }

  private async openPreviewToSide(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.canPreview(editor)) {
      void vscode.window.showWarningMessage(
        "Open a workspace source file before opening its annotation preview."
      );
      return;
    }

    this.previewLocked = false;
    if (!this.preview) {
      this.preview = new AnnotationPreviewPanel(this.context.extensionUri, {
        hover: key => this.highlightAnnotation(key),
        leave: () => this.clearDecorations(),
        pageChange: () => {
          this.previewLayout = undefined;
          this.pendingEditorScrolls = [];
          this.clearDecorations();
        },
        select: key => void this.selectAnnotation(key),
        previewScroll: (scrollTop, clientHeight) =>
          this.handlePreviewScroll(scrollTop, clientHeight),
        layout: (layout, syncEditor) => {
          if (
            !this.sourceEditor ||
            layout.lineCount !== this.sourceEditor.document.lineCount
          ) {
            return;
          }
          this.previewLayout = layout;
          if (syncEditor) {
            this.syncEditorToPreview();
          }
        },
        toggleLock: () => this.togglePreviewLock(),
        reload: () => void this.store.reload(),
        edit: (key, patch) => void this.updateAnnotationContent(key, patch),
        openLink: (href, annotationKey) => void this.openLink(href, annotationKey),
        dispose: () => this.handlePreviewDisposed()
      });
    } else {
      this.preview.reveal(true);
      this.preview.setLocked(false);
    }

    this.bindSourceEditor(editor);
  }

  private togglePreviewLock(): void {
    if (!this.preview) {
      void vscode.window.showInformationMessage(
        "Open an annotation preview before toggling its lock."
      );
      return;
    }
    this.previewLocked = !this.previewLocked;
    this.preview.setLocked(this.previewLocked);
    void vscode.window.setStatusBarMessage(
      this.previewLocked
        ? "Annotation preview locked to the current source file."
        : "Annotation preview now follows the active source editor.",
      2500
    );
  }

  private bindSourceEditor(editor: vscode.TextEditor): void {
    if (this.sourceEditor && !sameUri(this.sourceEditor.document.uri, editor.document.uri)) {
      this.clearDecorations();
    }
    this.sourceEditor = editor;
    this.previewLayout = undefined;
    this.pendingEditorScrolls = [];
    this.renderCurrentDocument();
  }

  private renderCurrentDocument(): void {
    if (!this.preview || !this.sourceEditor) {
      return;
    }
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
      this.renderTimer = undefined;
    }
    const current = this.store.getForDocument(this.sourceEditor.document.uri);
    this.annotations = new Map(current.map(annotation => [annotation.key, annotation]));
    this.renderedLineCount = this.sourceEditor.document.lineCount;
    this.previewLayout = undefined;
    this.pendingEditorScrolls = [];
    this.preview.update(
      this.sourceEditor.document,
      current,
      this.previewLocked,
      this.editorLineHeight(this.sourceEditor),
      this.cardLayout
    );
  }

  private scheduleRender(): void {
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
    }
    this.renderTimer = setTimeout(() => {
      this.renderTimer = undefined;
      this.renderCurrentDocument();
    }, 100);
  }

  private editorLineHeight(editor: vscode.TextEditor): number {
    const configuration = vscode.workspace.getConfiguration("editor", editor.document.uri);
    const configured = configuration.get<number>("lineHeight", 0);
    if (configured && configured > 0) {
      return configured;
    }
    const fontSize = configuration.get<number>("fontSize", 14);
    return Math.max(8, Math.round(fontSize * 1.5));
  }

  private canPreview(editor: vscode.TextEditor): boolean {
    return (
      !editor.document.isUntitled &&
      vscode.workspace.getWorkspaceFolder(editor.document.uri) !== undefined &&
      !this.store.isAnnotationDocument(editor.document.uri)
    );
  }

  private handleEditorVisibleRanges(event: vscode.TextEditorVisibleRangesChangeEvent): void {
    if (
      !this.preview ||
      !this.sourceEditor ||
      this.scrollSyncMode === "off" ||
      event.textEditor !== this.sourceEditor ||
      event.visibleRanges.length === 0
    ) {
      return;
    }
    if (this.consumePendingEditorScroll(event)) {
      return;
    }
    this.syncEditorToPreview(event.visibleRanges);
  }

  private syncEditorToPreview(ranges?: readonly vscode.Range[]): void {
    if (
      !this.preview ||
      !this.previewLayout ||
      !this.sourceEditor ||
      this.scrollSyncMode === "off" ||
      this.previewLayout.lineCount !== this.sourceEditor.document.lineCount ||
      this.previewLayout.anchors.length === 0
    ) {
      return;
    }

    const visibleRanges = ranges ?? this.sourceEditor.visibleRanges;
    if (visibleRanges.length === 0) {
      return;
    }
    const topLine = this.visibleTopLine(visibleRanges, this.sourceEditor.document);
    const targetScroll = sourceLineToPreviewScrollTop(
      topLine,
      this.previewLayout,
      this.sourceEditor.document.lineCount
    );
    this.preview.scrollTo(targetScroll);
  }

  private handlePreviewScroll(scrollTop: number, clientHeight: number): void {
    if (
      !this.previewLayout ||
      !this.sourceEditor ||
      this.scrollSyncMode !== "bidirectional" ||
      this.previewLayout.lineCount !== this.sourceEditor.document.lineCount ||
      this.previewLayout.anchors.length === 0
    ) {
      return;
    }

    const editor = this.getVisibleSourceEditor();
    if (!editor) {
      return;
    }
    const layout = { ...this.previewLayout, clientHeight };
    const targetLine = previewScrollTopToSourceLine(
      scrollTop,
      layout,
      editor.document.lineCount
    );
    const line = Math.round(
      clamp(targetLine, 0, Math.max(0, editor.document.lineCount - 1))
    );
    if (editor.visibleRanges.length > 0) {
      const currentTop = this.visibleTopLine(editor.visibleRanges, editor.document);
      if (Math.floor(currentTop) === line) {
        return;
      }
    }

    this.expectEditorScroll(editor, line);
    const position = new vscode.Position(line, 0);
    const end =
      line + 1 < editor.document.lineCount
        ? new vscode.Position(line + 1, 0)
        : editor.document.lineAt(line).range.end;
    editor.revealRange(
      new vscode.Range(position, end),
      vscode.TextEditorRevealType.AtTop
    );
  }

  private visibleTopLine(
    ranges: readonly vscode.Range[],
    document: vscode.TextDocument
  ): number {
    const first = ranges[0]!;
    return this.fractionalLine(first.start, document);
  }

  private consumePendingEditorScroll(
    event: vscode.TextEditorVisibleRangesChangeEvent
  ): boolean {
    const now = Date.now();
    this.pendingEditorScrolls = this.pendingEditorScrolls.filter(
      pending => pending.expiresAt >= now
    );
    const pendingForEditor = this.pendingEditorScrolls.filter(
      pending => pending.editor === event.textEditor
    );
    if (pendingForEditor.length === 0) {
      return false;
    }

    const actualTop = this.visibleTopLine(
      event.visibleRanges,
      event.textEditor.document
    );
    const matched = pendingForEditor.find(
      pending => Math.floor(actualTop) === Math.floor(pending.targetLine)
    );
    if (matched) {
      this.pendingEditorScrolls = this.pendingEditorScrolls.filter(
        pending => pending !== matched
      );
      return true;
    }

    this.pendingEditorScrolls = this.pendingEditorScrolls.filter(
      pending => pending.editor !== event.textEditor
    );
    return false;
  }

  private expectEditorScroll(editor: vscode.TextEditor, targetLine: number): void {
    const now = Date.now();
    this.pendingEditorScrolls = this.pendingEditorScrolls.filter(
      pending =>
        pending.expiresAt >= now &&
        (pending.editor !== editor || pending.targetLine !== targetLine)
    );
    this.pendingEditorScrolls.push({
      editor,
      targetLine,
      expiresAt: now + SCROLL_TARGET_TTL_MS
    });
    if (this.pendingEditorScrolls.length > 32) {
      this.pendingEditorScrolls.splice(0, this.pendingEditorScrolls.length - 32);
    }
  }

  private fractionalLine(position: vscode.Position, document: vscode.TextDocument): number {
    const line = clamp(position.line, 0, Math.max(0, document.lineCount - 1));
    const textLength = document.lineAt(line).text.length;
    return line + clamp(position.character / (textLength + 2), 0, 0.999);
  }

  private highlightAnnotation(annotationKey: string): void {
    this.clearDecorations();
    const annotation = this.annotations.get(annotationKey);
    const editor = this.getVisibleSourceEditor();
    if (!annotation || !editor) {
      return;
    }
    const range = this.resolveRange(annotation, editor.document);
    editor.setDecorations(this.hoverDecoration, range ? [range] : []);
  }

  private async selectAnnotation(annotationKey: string): Promise<void> {
    const annotation = this.annotations.get(annotationKey);
    if (!annotation) {
      return;
    }
    if (await this.revealAnnotationSource(annotation)) {
      this.preview?.setActiveAnnotation(annotationKey);
    }
  }

  private async updateAnnotationContent(
    annotationKey: string,
    patch: AnnotationContentPatch
  ): Promise<void> {
    const annotation = this.annotations.get(annotationKey);
    if (!annotation) {
      this.preview?.showEditError(annotationKey, "The annotation is no longer available.");
      return;
    }

    try {
      await this.store.updateAnnotationContent(annotation, patch);
      this.preview?.showEditSuccess(annotationKey);
      void vscode.window.setStatusBarMessage(`Saved annotation: ${patch.title.trim()}`, 2500);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.output.appendLine(`[error] Could not edit ${annotation.key}: ${message}`);
      this.preview?.showEditError(annotationKey, message);
    }
  }

  private resolveRange(
    annotation: ResolvedAnnotation,
    document: vscode.TextDocument
  ): vscode.Range | undefined {
    const startLine = annotation.range.startLine - 1;
    const endLine = annotation.range.endLine - 1;
    if (
      startLine < 0 ||
      endLine < startLine ||
      startLine >= document.lineCount ||
      endLine >= document.lineCount
    ) {
      return undefined;
    }
    return new vscode.Range(
      document.lineAt(startLine).range.start,
      document.lineAt(endLine).range.end
    );
  }

  private getVisibleSourceEditor(): vscode.TextEditor | undefined {
    if (!this.sourceEditor) {
      return undefined;
    }
    if (vscode.window.visibleTextEditors.includes(this.sourceEditor)) {
      return this.sourceEditor;
    }
    const editor = vscode.window.visibleTextEditors.find(candidate =>
      sameUri(candidate.document.uri, this.sourceEditor!.document.uri)
    );
    if (editor) {
      this.sourceEditor = editor;
    }
    return editor;
  }

  private clearDecorations(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      editor.setDecorations(this.hoverDecoration, []);
    }
  }

  private handlePreviewDisposed(): void {
    this.preview = undefined;
    this.previewLayout = undefined;
    this.previewLocked = false;
    this.pendingEditorScrolls = [];
    this.renderedLineCount = 0;
    this.annotations.clear();
    this.clearDecorations();
  }

  private async copyAnnotationStub(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty || !this.canPreview(editor)) {
      void vscode.window.showWarningMessage(
        "Select a source range before copying an annotation stub."
      );
      return;
    }

    const selection = editor.selection;
    const startLine = selection.start.line + 1;
    const endLine =
      selection.end.character === 0 && selection.end.line > selection.start.line
        ? selection.end.line
        : selection.end.line + 1;
    const relativePath = vscode.workspace
      .asRelativePath(editor.document.uri, false)
      .replace(/\\/g, "/");
    const baseName = path.basename(relativePath, path.extname(relativePath));
    const slug = baseName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "annotation";
    const stub = {
      id: `${slug}-${startLine}-${endLine}`,
      file: relativePath,
      title: "TODO: annotation title",
      description: "TODO: explain what this range does, why it matters, and what must remain true.",
      range: { startLine, endLine }
    };

    await vscode.env.clipboard.writeText(JSON.stringify(stub, null, 2));
    void vscode.window.showInformationMessage(
      `Copied an annotation stub for ${relativePath}:${startLine}-${endLine}.`
    );
  }

  private async openLink(href: string, originAnnotationKey?: string): Promise<void> {
    if (href.startsWith("annotation:")) {
      const reference = parseAnnotationReference(href);
      if (!reference) {
        void vscode.window.showWarningMessage(
          `Invalid annotation reference: ${href}`
        );
        return;
      }

      const origin = originAnnotationKey
        ? this.annotations.get(originAnnotationKey)
        : undefined;
      if (!origin) {
        void vscode.window.showWarningMessage(
          "Could not determine which annotation document contains this reference."
        );
        return;
      }

      const target = this.store.resolveReference(
        origin.annotationDocumentUri,
        reference.pageId,
        reference.annotationId
      );
      if (!target) {
        void vscode.window.showWarningMessage(
          `Annotation reference not found: ${reference.pageId}/${reference.annotationId}`
        );
        return;
      }

      await this.revealReferencedAnnotation(target);
      return;
    }

    try {
      const uri = vscode.Uri.parse(href, true);
      if (!["https", "http", "mailto"].includes(uri.scheme)) {
        void vscode.window.showWarningMessage(
          `Blocked unsupported annotation link scheme: ${uri.scheme || "relative"}`
        );
        return;
      }
      await vscode.env.openExternal(uri);
    } catch {
      void vscode.window.showWarningMessage("The annotation link is not a valid URI.");
    }
  }

  private async revealReferencedAnnotation(target: ResolvedAnnotation): Promise<void> {
    const document = await this.revealAnnotationSource(target);
    if (!document) {
      return;
    }
    this.previewLayout = undefined;
    this.preview?.prepareAnnotationReveal(document.uri, target.pageKey, target.key);
    this.renderCurrentDocument();
  }

  private async revealAnnotationSource(
    annotation: ResolvedAnnotation
  ): Promise<vscode.TextDocument | undefined> {
    const document = await vscode.workspace.openTextDocument(annotation.sourceUri);
    const range = this.resolveRange(annotation, document);
    if (!range) {
      void vscode.window.showWarningMessage(
        `Annotation "${annotation.title}" points outside the current file.`
      );
      return undefined;
    }

    let editor =
      this.sourceEditor &&
      sameUri(this.sourceEditor.document.uri, document.uri) &&
      vscode.window.visibleTextEditors.includes(this.sourceEditor)
        ? this.sourceEditor
        : vscode.window.visibleTextEditors.find(candidate =>
            sameUri(candidate.document.uri, document.uri)
          );
    if (!editor) {
      editor = await vscode.window.showTextDocument(document, {
        viewColumn: this.sourceEditor?.viewColumn ?? vscode.ViewColumn.One,
        preserveFocus: true,
        preview: false,
        selection: new vscode.Range(range.start, range.start)
      });
    } else {
      editor.selection = new vscode.Selection(range.start, range.start);
    }

    this.sourceEditor = editor;
    this.pendingEditorScrolls = this.pendingEditorScrolls.filter(
      pending => pending.editor !== editor
    );
    this.clearDecorations();
    const currentTop = editor.visibleRanges[0]
      ? this.visibleTopLine(editor.visibleRanges, editor.document)
      : undefined;
    if (currentTop === undefined || Math.floor(currentTop) !== range.start.line) {
      this.expectEditorScroll(editor, range.start.line);
    }
    editor.revealRange(range, vscode.TextEditorRevealType.AtTop);
    return document;
  }
}
