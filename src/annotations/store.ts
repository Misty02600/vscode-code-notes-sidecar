import * as vscode from "vscode";
import {
  AnnotationContentPatch,
  updateAnnotationContentJson
} from "./edit";
import {
  ParseIssue,
  SourceAnnotation,
  parseAnnotationDocument
} from "./format";

export interface ResolvedAnnotation extends SourceAnnotation {
  key: string;
  pageKey: string;
  pageId?: string;
  pageTitle: string;
  pageSortKey: string;
  guideTitle?: string;
  annotationDocumentUri: vscode.Uri;
  sourceUri: vscode.Uri;
}

function uriKey(uri: vscode.Uri): string {
  const value = uri.toString();
  return uri.scheme === "file" && process.platform === "win32" ? value.toLowerCase() : value;
}

function annotationReferenceKey(
  annotationDocumentUri: vscode.Uri,
  pageId: string,
  annotationId: string
): string {
  return JSON.stringify([uriKey(annotationDocumentUri), pageId, annotationId]);
}

export class AnnotationStore implements vscode.Disposable {
  private readonly annotationsBySource = new Map<string, ResolvedAnnotation[]>();
  private readonly annotationsByReference = new Map<string, ResolvedAnnotation>();
  private readonly annotationDocumentKeys = new Set<string>();
  private readonly watchers: vscode.FileSystemWatcher[] = [];
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  private reloadQueue: Promise<void> = Promise.resolve();
  private reloadTimer: ReturnType<typeof setTimeout> | undefined;

  readonly onDidChange = this.changeEmitter.event;

  constructor(private readonly output: vscode.OutputChannel) {}

  async start(): Promise<void> {
    this.resetWatchers();
    await this.reload();
  }

  async refreshConfiguration(): Promise<void> {
    this.resetWatchers();
    await this.reload();
  }

  reload(): Promise<void> {
    this.reloadQueue = this.reloadQueue
      .catch(() => undefined)
      .then(() => this.loadAll());
    return this.reloadQueue;
  }

  getForDocument(uri: vscode.Uri): ResolvedAnnotation[] {
    return [...(this.annotationsBySource.get(uriKey(uri)) ?? [])];
  }

  isAnnotationDocument(uri: vscode.Uri): boolean {
    return this.annotationDocumentKeys.has(uriKey(uri));
  }

  resolveReference(
    annotationDocumentUri: vscode.Uri,
    pageId: string,
    annotationId: string
  ): ResolvedAnnotation | undefined {
    return this.annotationsByReference.get(
      annotationReferenceKey(annotationDocumentUri, pageId, annotationId)
    );
  }

  async updateAnnotationContent(
    annotation: ResolvedAnnotation,
    patch: AnnotationContentPatch
  ): Promise<void> {
    const document = await vscode.workspace.openTextDocument(annotation.annotationDocumentUri);
    const source = document.getText();
    const updated = updateAnnotationContentJson(
      source,
      annotation.id,
      patch,
      annotation.pageId
    );
    if (updated === source) {
      return;
    }

    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      document.uri,
      new vscode.Range(document.positionAt(0), document.positionAt(source.length)),
      updated
    );
    if (!(await vscode.workspace.applyEdit(edit))) {
      throw new Error("VS Code could not apply the annotation edit.");
    }
    if (!(await document.save())) {
      throw new Error("VS Code could not save the annotation document.");
    }
    await this.reload();
  }

  dispose(): void {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
    }
    this.watchers.splice(0).forEach(watcher => watcher.dispose());
    this.changeEmitter.dispose();
  }

  private get annotationGlob(): string {
    return vscode.workspace
      .getConfiguration("sourceAnnotationPreview")
      .get("annotationGlob", ".vscode/source-annotations/**/*.json");
  }

  private resetWatchers(): void {
    this.watchers.splice(0).forEach(watcher => watcher.dispose());

    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folder, this.annotationGlob)
      );
      watcher.onDidCreate(() => this.scheduleReload());
      watcher.onDidChange(() => this.scheduleReload());
      watcher.onDidDelete(() => this.scheduleReload());
      this.watchers.push(watcher);
    }
  }

  private scheduleReload(): void {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
    }
    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = undefined;
      void this.reload();
    }, 120);
  }

  private async loadAll(): Promise<void> {
    const next = new Map<string, ResolvedAnnotation[]>();
    const nextReferences = new Map<string, ResolvedAnnotation>();
    const annotationDocumentKeys = new Set<string>();
    let documentCount = 0;
    let annotationCount = 0;

    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const files = await vscode.workspace.findFiles(
        new vscode.RelativePattern(folder, this.annotationGlob),
        new vscode.RelativePattern(folder, "**/{.git,node_modules}/**")
      );

      for (const file of files) {
        annotationDocumentKeys.add(uriKey(file));
        documentCount += 1;

        try {
          const bytes = await vscode.workspace.fs.readFile(file);
          const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
          const result = parseAnnotationDocument(value);
          this.logIssues(file, result.issues);

          if (!result.document) {
            continue;
          }

          for (const [pageIndex, page] of result.document.pages.entries()) {
            const pageKey = page.id
              ? `${file.toString()}#page:${encodeURIComponent(page.id)}`
              : "legacy";
            const pageSortKey = page.id
              ? `1:${file.toString()}:${String(pageIndex).padStart(6, "0")}`
              : "0:legacy";

            for (const annotation of page.annotations) {
              const sourceUri = vscode.Uri.joinPath(folder.uri, ...annotation.file.split("/"));
              const resolved: ResolvedAnnotation = {
                ...annotation,
                key: `${pageKey}#annotation:${encodeURIComponent(annotation.id)}`,
                pageKey,
                ...(page.id ? { pageId: page.id } : {}),
                pageTitle: page.title,
                pageSortKey,
                guideTitle: result.document.title,
                annotationDocumentUri: file,
                sourceUri
              };
              const key = uriKey(sourceUri);
              const existing = next.get(key) ?? [];
              existing.push(resolved);
              next.set(key, existing);
              if (page.id) {
                nextReferences.set(
                  annotationReferenceKey(file, page.id, annotation.id),
                  resolved
                );
              }
              annotationCount += 1;
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.output.appendLine(`[error] ${file.toString()}: ${message}`);
        }
      }
    }

    for (const annotations of next.values()) {
      annotations.sort(
        (left, right) =>
          left.pageSortKey.localeCompare(right.pageSortKey) ||
          left.range.startLine - right.range.startLine ||
          left.range.endLine - right.range.endLine ||
          left.title.localeCompare(right.title)
      );
    }

    this.annotationsBySource.clear();
    next.forEach((annotations, key) => this.annotationsBySource.set(key, annotations));
    this.annotationsByReference.clear();
    nextReferences.forEach((annotation, key) =>
      this.annotationsByReference.set(key, annotation)
    );
    this.annotationDocumentKeys.clear();
    annotationDocumentKeys.forEach(key => this.annotationDocumentKeys.add(key));
    this.output.appendLine(
      `[info] Loaded ${annotationCount} annotation(s) from ${documentCount} document(s).`
    );
    this.changeEmitter.fire();
  }

  private logIssues(uri: vscode.Uri, issues: ParseIssue[]): void {
    for (const issue of issues) {
      this.output.appendLine(`[warning] ${uri.toString()}: ${issue.message}`);
    }
  }
}
