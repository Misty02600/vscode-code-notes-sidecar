import { randomBytes } from "node:crypto";
import MarkdownIt from "markdown-it";
import * as vscode from "vscode";
import { ResolvedAnnotation } from "../annotations/store";
import { CardLayout } from "./types";

interface PreviewHtmlState {
  extensionUri: vscode.Uri;
  webview: vscode.Webview;
  document: vscode.TextDocument;
  annotations: ResolvedAnnotation[];
  activePageKey?: string;
  revealAnnotationKey?: string;
  locked: boolean;
  sourceLineHeight: number;
  cardLayout: CardLayout;
  layoutRevision: number;
}

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: true
});

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function annotationPages(
  annotations: ResolvedAnnotation[]
): Array<{ key: string; title: string }> {
  const pages = new Map<string, string>();
  for (const annotation of annotations) {
    if (!pages.has(annotation.pageKey)) {
      pages.set(annotation.pageKey, annotation.pageTitle);
    }
  }
  return [...pages].map(([key, title]) => ({ key, title }));
}

function renderPageControl(
  pages: Array<{ key: string; title: string }>,
  activePageKey: string | undefined
): string {
  if (pages.length === 0) {
    return "";
  }
  if (pages.length === 1) {
    return `<span class="page-name" title="${escapeHtml(pages[0]!.title)}">${escapeHtml(pages[0]!.title)}</span>`;
  }

  const options = pages
    .map(
      page =>
        `<option value="${escapeHtml(page.key)}"${page.key === activePageKey ? " selected" : ""}>${escapeHtml(page.title)}</option>`
    )
    .join("");
  return `<label class="page-picker">
    <span class="page-picker-label">Page</span>
    <select id="page-select" class="page-select" aria-label="Annotation page">${options}</select>
  </label>`;
}

function renderAnnotationCard(
  annotation: ResolvedAnnotation,
  lineCount: number,
  visible: boolean,
  expanded: boolean
): string {
  const invalid =
    annotation.range.startLine > lineCount || annotation.range.endLine > lineCount;
  const rangeLabel =
    annotation.range.startLine === annotation.range.endLine
      ? `L${annotation.range.startLine}`
      : `L${annotation.range.startLine}–${annotation.range.endLine}`;
  const guide = annotation.guideTitle
    ? `<div class="guide-badge">${escapeHtml(annotation.guideTitle)}</div>`
    : "";
  const warning = invalid
    ? `<div class="warning">The saved range is outside the current file.</div>`
    : "";
  return `<article class="annotation-card${invalid ? " invalid" : ""}${expanded ? " expanded reference-target" : ""}"
    data-annotation-key="${escapeHtml(annotation.key)}"
    data-page-key="${escapeHtml(annotation.pageKey)}"${visible ? "" : " hidden"}
    data-start-line="${annotation.range.startLine - 1}"
    data-end-line="${annotation.range.endLine - 1}">
    <div class="card-view">
      <div class="card-heading">
        <button class="expand-button" type="button" aria-expanded="${expanded ? "true" : "false"}" title="${expanded ? "Collapse" : "Expand"} annotation">›</button>
        <h2>${escapeHtml(annotation.title)}</h2>
        <span class="line-badge">${rangeLabel}</span>
        <button class="edit-button" type="button" title="Edit this annotation">Edit</button>
      </div>
      <div class="card-details">
        ${guide}
        <div class="markdown">${markdown.render(annotation.description)}</div>
        ${warning}
      </div>
    </div>
    <form class="annotation-editor">
      <label>Title
        <input name="title" type="text" required value="${escapeHtml(annotation.title)}">
      </label>
      <label>Markdown
        <textarea name="description">${escapeHtml(annotation.description)}</textarea>
      </label>
      <div class="editor-actions">
        <button class="save-button" type="submit">Save</button>
        <button class="cancel-button" type="button">Cancel</button>
        <span class="editor-hint">Ctrl/Cmd+Enter to save · Esc to cancel</span>
        <span class="editor-status" role="status" aria-live="polite"></span>
      </div>
    </form>
  </article>`;
}

function renderEmptyState(): string {
  return `<section class="empty">
    <h2>No annotations for this file</h2>
    <p>Add a JSON document under <code>.code-notes/</code>, then reload.</p>
  </section>`;
}

export function renderPreviewHtml(state: PreviewHtmlState): string {
  const nonce = randomBytes(16).toString("hex");
  const styleUri = state.webview.asWebviewUri(
    vscode.Uri.joinPath(state.extensionUri, "media", "preview.css")
  );
  const scriptUri = state.webview.asWebviewUri(
    vscode.Uri.joinPath(state.extensionUri, "media", "preview.js")
  );
  const fileLabel = vscode.workspace
    .asRelativePath(state.document.uri, false)
    .replace(/\\/g, "/");
  const pages = annotationPages(state.annotations);
  const initialTargetKey = state.annotations.some(
    annotation => annotation.key === state.revealAnnotationKey
  )
    ? state.revealAnnotationKey
    : undefined;
  const cards = state.annotations
    .map(annotation =>
      renderAnnotationCard(
        annotation,
        state.document.lineCount,
        annotation.pageKey === state.activePageKey,
        annotation.key === initialTargetKey
      )
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: ${state.webview.cspSource}; style-src ${state.webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <header class="toolbar">
    <span class="file-label" title="${escapeHtml(fileLabel)}">${escapeHtml(fileLabel)}</span>
    ${renderPageControl(pages, state.activePageKey)}
    <span class="toolbar-actions">
      <button id="lock-button" type="button" title="Keep the preview attached to this file">${state.locked ? "Unlock" : "Lock"}</button>
      <button id="reload-button" type="button" title="Reload annotation JSON files">Reload</button>
    </span>
  </header>
  <div id="preview-scroll">
    <main id="annotation-track"
      data-line-count="${state.document.lineCount}"
      data-line-height="${state.sourceLineHeight}"
      data-card-layout="${state.cardLayout}">${cards || renderEmptyState()}</main>
  </div>
  <script id="preview-bootstrap" type="application/json" nonce="${nonce}">${scriptJson({
    initialTargetKey,
    layoutRevision: state.layoutRevision
  })}</script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
