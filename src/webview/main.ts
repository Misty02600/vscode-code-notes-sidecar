import { layoutAnnotationCards } from "../preview/placement";

interface VsCodeApi {
  postMessage(message: unknown): void;
}

interface PreviewBootstrap {
  initialTargetKey?: string;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();
const scrollContainer = requireElement<HTMLElement>("preview-scroll");
const track = requireElement<HTMLElement>("annotation-track");
const bootstrapElement = requireElement<HTMLElement>("preview-bootstrap");
const bootstrap = JSON.parse(bootstrapElement.textContent || "{}") as PreviewBootstrap;
const initialTargetKey =
  typeof bootstrap.initialTargetKey === "string" ? bootstrap.initialTargetKey : undefined;

let suppressScrollUntil = 0;
let scrollFrame: number | undefined;
let layoutTimer: ReturnType<typeof setTimeout> | undefined;
let layoutShouldSyncEditor = false;

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required preview element: ${id}`);
  }
  return element as T;
}

function requireDescendant<T extends Element>(root: Element, selector: string): T {
  const element = root.querySelector(selector);
  if (!element) {
    throw new Error(`Missing required preview control: ${selector}`);
  }
  return element as T;
}

function allAnnotationCards(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(".annotation-card"));
}

function annotationCards(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(".annotation-card:not([hidden])")
  );
}

function positionCards(): void {
  const cards = annotationCards();
  const sourceAligned = track.dataset.cardLayout === "sourceAligned";
  track.classList.toggle("source-aligned", sourceAligned);
  track.classList.toggle("compact", !sourceAligned);

  if (!sourceAligned) {
    track.style.height = "";
    cards.forEach(card => {
      card.style.top = "";
    });
    return;
  }

  const lineHeight = Math.max(8, Number(track.dataset.lineHeight) || 21);
  const lineCount = Math.max(1, Number(track.dataset.lineCount) || 1);
  const cardLayout = layoutAnnotationCards(
    cards.map(card => ({
      sourceLine: Number(card.dataset.sourceLine),
      height: card.offsetHeight
    })),
    lineHeight
  );
  const sourceHeight = Math.max(
    scrollContainer.clientHeight,
    lineCount * lineHeight - cardLayout.sourceOrigin
  );

  cards.forEach((card, index) => {
    card.style.top = `${cardLayout.placements[index]!.top}px`;
  });

  const nextTop = cardLayout.placements.reduce(
    (maximum, placement, index) =>
      Math.max(maximum, placement.top + cards[index]!.offsetHeight + 16),
    0
  );
  const nextHeight = `${Math.ceil(Math.max(sourceHeight, nextTop))}px`;
  if (track.style.height !== nextHeight) {
    track.style.height = nextHeight;
  }
}

function sendLayout(syncEditor: boolean): void {
  layoutShouldSyncEditor = layoutShouldSyncEditor || syncEditor;
  if (layoutTimer) {
    clearTimeout(layoutTimer);
  }
  layoutTimer = setTimeout(() => {
    const shouldSyncEditor = layoutShouldSyncEditor;
    layoutShouldSyncEditor = false;
    positionCards();
    const containerBounds = scrollContainer.getBoundingClientRect();
    const anchors = annotationCards().map(card => {
      const bounds = card.getBoundingClientRect();
      return {
        sourceLine: Number(card.dataset.sourceLine),
        previewOffset:
          bounds.top - containerBounds.top + scrollContainer.scrollTop + bounds.height / 2
      };
    });
    vscode.postMessage({
      type: "layout",
      anchors,
      scrollHeight: scrollContainer.scrollHeight,
      clientHeight: scrollContainer.clientHeight,
      syncEditor: shouldSyncEditor
    });
  }, 30);
}

function bindAnnotationCard(card: HTMLElement): void {
  const form = requireDescendant<HTMLFormElement>(card, ".annotation-editor");
  const heading = requireDescendant<HTMLElement>(card, ".card-heading");
  const expandButton = requireDescendant<HTMLButtonElement>(card, ".expand-button");
  const editButton = requireDescendant<HTMLButtonElement>(card, ".edit-button");
  const cancelButton = requireDescendant<HTMLButtonElement>(card, ".cancel-button");
  const status = requireDescendant<HTMLElement>(card, ".editor-status");
  const controls = Array.from(
    form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement>(
      "input, textarea, button"
    )
  );
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  function stopSaving(): void {
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    saveTimer = undefined;
    controls.forEach(control => {
      control.disabled = false;
    });
  }

  function setExpanded(expanded: boolean): void {
    if (card.classList.contains("expanded") === expanded) {
      return;
    }
    const previousTop = card.getBoundingClientRect().top;
    card.classList.toggle("expanded", expanded);
    expandButton.setAttribute("aria-expanded", String(expanded));
    expandButton.title = expanded ? "Collapse annotation" : "Expand annotation";
    requestAnimationFrame(() => {
      positionCards();
      const topShift = card.getBoundingClientRect().top - previousTop;
      if (Math.abs(topShift) > 0.5) {
        suppressScrollUntil = performance.now() + 250;
        scrollContainer.scrollTop += topShift;
      }
      sendLayout(false);
    });
  }

  function setEditing(editing: boolean): void {
    if (editing) {
      setExpanded(true);
    }
    card.classList.toggle("editing", editing);
    status.textContent = "";
    if (editing) {
      form.querySelector<HTMLInputElement>('[name="title"]')?.focus();
    } else {
      form.reset();
    }
    requestAnimationFrame(() => sendLayout(false));
  }

  editButton.addEventListener("click", event => {
    event.stopPropagation();
    setEditing(true);
  });
  expandButton.addEventListener("click", event => {
    event.stopPropagation();
    setExpanded(!card.classList.contains("expanded"));
  });
  heading.addEventListener("click", event => {
    if (event.target instanceof Element && event.target.closest("button")) {
      return;
    }
    setExpanded(!card.classList.contains("expanded"));
    vscode.postMessage({ type: "select", annotationKey: card.dataset.annotationKey });
  });
  cancelButton.addEventListener("click", event => {
    event.stopPropagation();
    stopSaving();
    setEditing(false);
  });
  card.addEventListener("annotationEditSaved", () => {
    stopSaving();
    setEditing(false);
    setExpanded(false);
  });
  card.addEventListener("annotationEditError", event => {
    stopSaving();
    status.textContent = String(
      event instanceof CustomEvent ? event.detail : "Could not save annotation."
    );
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    const values = new FormData(form);
    const title = String(values.get("title") || "").trim();
    if (!title) {
      status.textContent = "Title cannot be empty.";
      return;
    }

    controls.forEach(control => {
      control.disabled = true;
    });
    status.textContent = "Saving…";
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(() => {
      stopSaving();
      status.textContent = "Save timed out. You can retry without reopening the preview.";
    }, 15000);
    vscode.postMessage({
      type: "edit",
      annotationKey: card.dataset.annotationKey,
      patch: {
        title,
        description: String(values.get("description") || "")
      }
    });
  });
  form.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.preventDefault();
      setEditing(false);
    } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  card.addEventListener("mouseenter", () => {
    vscode.postMessage({ type: "hover", annotationKey: card.dataset.annotationKey });
  });
  card.addEventListener("mouseleave", () => {
    vscode.postMessage({ type: "leave" });
  });
}

allAnnotationCards().forEach(bindAnnotationCard);

document.addEventListener("click", event => {
  const link = event.target instanceof Element
    ? event.target.closest<HTMLAnchorElement>("a")
    : null;
  if (!link) {
    return;
  }
  event.preventDefault();
  const sourceCard = link.closest<HTMLElement>(".annotation-card");
  vscode.postMessage({
    type: "openLink",
    href: link.getAttribute("href") || "",
    annotationKey: sourceCard?.dataset.annotationKey
  });
});

requireElement<HTMLButtonElement>("lock-button").addEventListener("click", () => {
  vscode.postMessage({ type: "toggleLock" });
});
requireElement<HTMLButtonElement>("reload-button").addEventListener("click", () => {
  vscode.postMessage({ type: "reload" });
});

const pageSelect = document.getElementById("page-select") as HTMLSelectElement | null;
if (pageSelect) {
  pageSelect.addEventListener("change", () => {
    const pageKey = pageSelect.value;
    document.querySelectorAll<HTMLElement>("[data-page-key]").forEach(element => {
      element.hidden = element.dataset.pageKey !== pageKey;
    });
    track.style.height = "";
    positionCards();
    suppressScrollUntil = performance.now() + 500;
    scrollContainer.scrollTo({ top: 0, behavior: "auto" });
    vscode.postMessage({ type: "leave" });
    vscode.postMessage({ type: "pageChange", pageKey });
    requestAnimationFrame(() => sendLayout(true));
  });
}

function takePreviewControl(): void {
  suppressScrollUntil = 0;
}

scrollContainer.addEventListener("wheel", takePreviewControl, { passive: true });
scrollContainer.addEventListener("touchstart", takePreviewControl, { passive: true });
scrollContainer.addEventListener("pointerdown", takePreviewControl, { passive: true });
scrollContainer.addEventListener("scroll", () => {
  if (performance.now() < suppressScrollUntil || scrollFrame !== undefined) {
    return;
  }
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = undefined;
    vscode.postMessage({
      type: "previewScroll",
      scrollTop: scrollContainer.scrollTop,
      clientHeight: scrollContainer.clientHeight
    });
  });
}, { passive: true });

window.addEventListener("message", event => {
  const message = event.data as Record<string, unknown>;
  if (message.type === "scrollTo") {
    const target = Number(message.scrollTop) || 0;
    if (Math.abs(scrollContainer.scrollTop - target) < 0.5) {
      return;
    }
    suppressScrollUntil = performance.now() + 500;
    scrollContainer.scrollTo({ top: target, behavior: "auto" });
  } else if (message.type === "activeAnnotation") {
    annotationCards().forEach(card => {
      card.classList.toggle(
        "active",
        card.dataset.annotationKey === message.annotationKey
      );
    });
  } else if (message.type === "lockState") {
    requireElement<HTMLButtonElement>("lock-button").textContent =
      message.locked === true ? "Unlock" : "Lock";
  } else if (message.type === "editSaved") {
    annotationCards()
      .find(card => card.dataset.annotationKey === message.annotationKey)
      ?.dispatchEvent(new Event("annotationEditSaved"));
  } else if (message.type === "editError") {
    annotationCards()
      .find(card => card.dataset.annotationKey === message.annotationKey)
      ?.dispatchEvent(new CustomEvent("annotationEditError", {
        detail: String(message.message || "Could not save annotation.")
      }));
  }
});

const observer = new ResizeObserver(() => sendLayout(false));
allAnnotationCards().forEach(card => observer.observe(card));
window.addEventListener("resize", () => sendLayout(false));

if (initialTargetKey) {
  requestAnimationFrame(() => {
    positionCards();
    const target = allAnnotationCards().find(
      card => card.dataset.annotationKey === initialTargetKey
    );
    if (!target || target.hidden) {
      sendLayout(true);
      return;
    }
    const containerBounds = scrollContainer.getBoundingClientRect();
    const targetBounds = target.getBoundingClientRect();
    const centeredTop =
      scrollContainer.scrollTop +
      targetBounds.top -
      containerBounds.top -
      Math.max(8, (scrollContainer.clientHeight - targetBounds.height) / 2);
    suppressScrollUntil = performance.now() + 500;
    scrollContainer.scrollTo({ top: Math.max(0, centeredTop), behavior: "auto" });
    sendLayout(false);
    setTimeout(() => target.classList.remove("reference-target"), 1500);
  });
} else {
  sendLayout(true);
}
