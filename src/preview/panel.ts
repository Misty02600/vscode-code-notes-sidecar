import path from "node:path";
import * as vscode from "vscode";
import { ResolvedAnnotation } from "../annotations/store";
import { renderPreviewHtml } from "./renderHtml";
import { AnnotationPreviewHandlers, CardLayout } from "./types";

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export class AnnotationPreviewPanel implements vscode.Disposable {
  private readonly panel: vscode.WebviewPanel;
  private currentDocument: vscode.TextDocument | undefined;
  private currentAnnotations: ResolvedAnnotation[] = [];
  private readonly activePageByDocument = new Map<string, string>();
  private activePageKey: string | undefined;
  private pendingRevealAnnotationKey: string | undefined;
  private locked = false;
  private sourceLineHeight = 21;
  private cardLayout: CardLayout = "sourceAligned";

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly handlers: AnnotationPreviewHandlers
  ) {
    this.panel = vscode.window.createWebviewPanel(
      "sourceAnnotationPreview",
      "Source Annotations",
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri]
      }
    );

    this.panel.webview.onDidReceiveMessage(message => this.receiveMessage(message));
    this.panel.onDidDispose(() => this.handlers.dispose());
  }

  update(
    document: vscode.TextDocument,
    annotations: ResolvedAnnotation[],
    locked: boolean,
    sourceLineHeight: number,
    cardLayout: CardLayout
  ): void {
    this.currentDocument = document;
    this.currentAnnotations = annotations;
    const documentKey = document.uri.toString();
    const pageKeys = [...new Set(annotations.map(annotation => annotation.pageKey))];
    const previousPageKey = this.activePageByDocument.get(documentKey);
    this.activePageKey =
      previousPageKey && pageKeys.includes(previousPageKey) ? previousPageKey : pageKeys[0];
    if (this.activePageKey) {
      this.activePageByDocument.set(documentKey, this.activePageKey);
    } else {
      this.activePageByDocument.delete(documentKey);
    }
    this.locked = locked;
    this.sourceLineHeight = sourceLineHeight;
    this.cardLayout = cardLayout;
    this.panel.title = `Annotations — ${path.basename(document.uri.fsPath || document.uri.path)}`;
    this.panel.webview.html = renderPreviewHtml({
      extensionUri: this.extensionUri,
      webview: this.panel.webview,
      document,
      annotations,
      activePageKey: this.activePageKey,
      revealAnnotationKey: this.pendingRevealAnnotationKey,
      locked,
      sourceLineHeight,
      cardLayout
    });
    this.pendingRevealAnnotationKey = undefined;
  }

  reveal(preserveFocus = true): void {
    this.panel.reveal(this.panel.viewColumn, preserveFocus);
  }

  setLocked(locked: boolean): void {
    this.locked = locked;
    void this.panel.webview.postMessage({ type: "lockState", locked });
  }

  scrollTo(scrollTop: number): void {
    void this.panel.webview.postMessage({ type: "scrollTo", scrollTop });
  }

  setActiveAnnotation(annotationKey: string | undefined): void {
    void this.panel.webview.postMessage({ type: "activeAnnotation", annotationKey });
  }

  showEditError(annotationKey: string, message: string): void {
    void this.panel.webview.postMessage({ type: "editError", annotationKey, message });
  }

  showEditSuccess(annotationKey: string): void {
    void this.panel.webview.postMessage({ type: "editSaved", annotationKey });
  }

  prepareAnnotationReveal(
    documentUri: vscode.Uri,
    pageKey: string,
    annotationKey: string
  ): void {
    this.activePageByDocument.set(documentUri.toString(), pageKey);
    this.pendingRevealAnnotationKey = annotationKey;
  }

  dispose(): void {
    this.panel.dispose();
  }

  private receiveMessage(message: unknown): void {
    if (typeof message !== "object" || message === null) {
      return;
    }
    const candidate = message as Record<string, unknown>;

    switch (candidate.type) {
      case "hover":
        if (typeof candidate.annotationKey === "string") {
          this.handlers.hover(candidate.annotationKey);
        }
        break;
      case "leave":
        this.handlers.leave();
        break;
      case "pageChange":
        this.handlePageChange(candidate.pageKey);
        break;
      case "select":
        if (typeof candidate.annotationKey === "string") {
          this.handlers.select(candidate.annotationKey);
        }
        break;
      case "previewScroll":
        if (finiteNumber(candidate.scrollTop) && finiteNumber(candidate.clientHeight)) {
          this.handlers.previewScroll(candidate.scrollTop, candidate.clientHeight);
        }
        break;
      case "layout":
        this.handleLayout(candidate);
        break;
      case "toggleLock":
        this.handlers.toggleLock();
        break;
      case "reload":
        this.handlers.reload();
        break;
      case "edit":
        this.handleEdit(candidate);
        break;
      case "openLink":
        if (typeof candidate.href === "string") {
          this.handlers.openLink(
            candidate.href,
            typeof candidate.annotationKey === "string"
              ? candidate.annotationKey
              : undefined
          );
        }
        break;
    }
  }

  private handlePageChange(pageKey: unknown): void {
    if (
      typeof pageKey !== "string" ||
      !this.currentAnnotations.some(annotation => annotation.pageKey === pageKey)
    ) {
      return;
    }
    this.activePageKey = pageKey;
    if (this.currentDocument) {
      this.activePageByDocument.set(this.currentDocument.uri.toString(), pageKey);
    }
    this.handlers.pageChange();
  }

  private handleLayout(candidate: Record<string, unknown>): void {
    if (
      !Array.isArray(candidate.anchors) ||
      !finiteNumber(candidate.scrollHeight) ||
      !finiteNumber(candidate.clientHeight)
    ) {
      return;
    }
    const anchors = candidate.anchors.flatMap(anchor => {
      if (typeof anchor !== "object" || anchor === null) {
        return [];
      }
      const item = anchor as Record<string, unknown>;
      return finiteNumber(item.sourceLine) && finiteNumber(item.previewOffset)
        ? [{ sourceLine: item.sourceLine, previewOffset: item.previewOffset }]
        : [];
    });
    this.handlers.layout(
      {
        anchors,
        scrollHeight: candidate.scrollHeight,
        clientHeight: candidate.clientHeight
      },
      candidate.syncEditor === true
    );
  }

  private handleEdit(candidate: Record<string, unknown>): void {
    const patch = candidate.patch;
    if (
      typeof candidate.annotationKey !== "string" ||
      typeof patch !== "object" ||
      patch === null
    ) {
      return;
    }
    const content = patch as Record<string, unknown>;
    if (typeof content.title !== "string" || typeof content.description !== "string") {
      return;
    }
    this.handlers.edit(candidate.annotationKey, {
      title: content.title,
      description: content.description
    });
  }
}
