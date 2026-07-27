import { applyEdits, modify, type FormattingOptions } from "jsonc-parser";

export interface AnnotationContentPatch {
  title: string;
  description: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formattingOptions(text: string): FormattingOptions {
  const indentation = text.match(/\r?\n([ \t]+)"/)?.[1] ?? "  ";
  const usesTabs = indentation.includes("\t");
  return {
    insertSpaces: !usesTabs,
    tabSize: usesTabs ? 1 : Math.max(1, indentation.length),
    eol: text.includes("\r\n") ? "\r\n" : "\n"
  };
}

function normalizePatch(patch: AnnotationContentPatch): AnnotationContentPatch {
  const title = patch.title.trim();
  if (!title) {
    throw new Error("Annotation title cannot be empty.");
  }
  if (typeof patch.description !== "string") {
    throw new Error("Annotation description must be text.");
  }
  return {
    title,
    description: patch.description
  };
}

export function updateAnnotationContentJson(
  source: string,
  annotationId: string,
  patch: AnnotationContentPatch,
  pageId?: string
): string {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("The annotation document is not valid JSON. Fix it before saving here.");
  }
  if (!isRecord(value)) {
    throw new Error("The annotation document root is not an object.");
  }

  let annotations: unknown[];
  let annotationPath: (string | number)[];
  if (pageId === undefined) {
    if (!Array.isArray(value.annotations)) {
      throw new Error("The annotation document no longer contains its annotations array.");
    }
    annotations = value.annotations;
    annotationPath = ["annotations"];
  } else {
    if (!Array.isArray(value.pages)) {
      throw new Error("The annotation document no longer contains its pages array.");
    }
    const pageIndex = value.pages.findIndex(
      candidate => isRecord(candidate) && candidate.id === pageId
    );
    if (pageIndex < 0) {
      throw new Error(`Annotation page "${pageId}" no longer exists in its JSON document.`);
    }
    const page = value.pages[pageIndex];
    if (!isRecord(page) || !Array.isArray(page.annotations)) {
      throw new Error(`Annotation page "${pageId}" no longer contains an annotations array.`);
    }
    annotations = page.annotations;
    annotationPath = ["pages", pageIndex, "annotations"];
  }

  const annotationIndex = annotations.findIndex(
    candidate => isRecord(candidate) && candidate.id === annotationId
  );
  if (annotationIndex < 0) {
    throw new Error(`Annotation "${annotationId}" no longer exists in its JSON document.`);
  }

  const normalized = normalizePatch(patch);
  const options = { formattingOptions: formattingOptions(source) };
  const propertyPath = (property: string): (string | number)[] => [
    ...annotationPath,
    annotationIndex,
    property
  ];
  let updated = source;
  updated = applyEdits(
    updated,
    modify(updated, propertyPath("title"), normalized.title, options)
  );
  updated = applyEdits(
    updated,
    modify(
      updated,
      propertyPath("description"),
      normalized.description,
      options
    )
  );
  updated = applyEdits(
    updated,
    modify(
      updated,
      propertyPath("tags"),
      undefined,
      options
    )
  );
  return updated;
}
