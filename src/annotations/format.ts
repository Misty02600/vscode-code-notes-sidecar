export interface AnnotationRange {
  startLine: number;
  endLine: number;
}

export interface SourceAnnotation {
  id: string;
  file: string;
  title: string;
  description: string;
  range: AnnotationRange;
}

export interface AnnotationPage {
  /** Undefined only for a legacy document that uses the top-level annotations array. */
  id?: string;
  title: string;
  annotations: SourceAnnotation[];
}

export interface AnnotationDocument {
  version: 1;
  title?: string;
  description?: string;
  pages: AnnotationPage[];
}

export interface ParseIssue {
  message: string;
  pageIndex?: number;
  annotationIndex?: number;
}

export interface ParseResult {
  document?: AnnotationDocument;
  issues: ParseIssue[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

export function normalizeRelativeFilePath(value: string): string | undefined {
  const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "");
  const segments = normalized.split("/");

  if (
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalized) ||
    segments.some(segment => segment === "" || segment === "..")
  ) {
    return undefined;
  }

  return normalized;
}

function parseAnnotations(
  value: unknown[],
  prefix: string,
  issues: ParseIssue[],
  pageIndex?: number
): SourceAnnotation[] {
  const annotations: SourceAnnotation[] = [];
  const seenIds = new Set<string>();

  value.forEach((candidate, annotationIndex) => {
    const annotationPrefix = `${prefix}[${annotationIndex}]`;
    const issue = (message: string): void => {
      issues.push({ pageIndex, annotationIndex, message });
    };

    if (!isRecord(candidate)) {
      issue(`${annotationPrefix} must be an object.`);
      return;
    }

    if (!nonEmptyString(candidate.id)) {
      issue(`${annotationPrefix}.id must be a non-empty string.`);
      return;
    }
    const id = candidate.id.trim();
    if (seenIds.has(id)) {
      issue(`${annotationPrefix}.id duplicates "${id}" within this page.`);
      return;
    }

    if (!nonEmptyString(candidate.file)) {
      issue(`${annotationPrefix}.file must be a non-empty string.`);
      return;
    }
    const file = normalizeRelativeFilePath(candidate.file);
    if (!file) {
      issue(`${annotationPrefix}.file must stay inside the workspace and use a relative path.`);
      return;
    }

    if (!nonEmptyString(candidate.title)) {
      issue(`${annotationPrefix}.title must be a non-empty string.`);
      return;
    }
    if (typeof candidate.description !== "string") {
      issue(`${annotationPrefix}.description must be a string.`);
      return;
    }
    if (!isRecord(candidate.range)) {
      issue(`${annotationPrefix}.range must be an object.`);
      return;
    }

    const startLine = candidate.range.startLine;
    const endLine = candidate.range.endLine;
    if (!positiveInteger(startLine) || !positiveInteger(endLine)) {
      issue(`${annotationPrefix}.range startLine and endLine must be positive integers.`);
      return;
    }
    if (endLine < startLine) {
      issue(`${annotationPrefix}.range.endLine must be greater than or equal to startLine.`);
      return;
    }

    seenIds.add(id);
    annotations.push({
      id,
      file,
      title: candidate.title.trim(),
      description: candidate.description,
      range: { startLine, endLine }
    });
  });

  return annotations;
}

export function parseAnnotationDocument(value: unknown): ParseResult {
  const issues: ParseIssue[] = [];

  if (!isRecord(value)) {
    return { issues: [{ message: "The document root must be an object." }] };
  }

  if (value.version !== 1) {
    return { issues: [{ message: "The document version must be 1." }] };
  }

  const hasAnnotations = value.annotations !== undefined;
  const hasPages = value.pages !== undefined;
  if (hasAnnotations === hasPages) {
    return {
      issues: [
        {
          message:
            "The document must contain either a top-level annotations array or a pages array, but not both."
        }
      ]
    };
  }

  const pages: AnnotationPage[] = [];
  if (hasAnnotations) {
    if (!Array.isArray(value.annotations)) {
      return { issues: [{ message: "The annotations property must be an array." }] };
    }
    pages.push({
      title: "Annotations",
      annotations: parseAnnotations(value.annotations, "annotations", issues)
    });
  } else {
    if (!Array.isArray(value.pages)) {
      return { issues: [{ message: "The pages property must be an array." }] };
    }

    const seenPageIds = new Set<string>();
    value.pages.forEach((candidate, pageIndex) => {
      const prefix = `pages[${pageIndex}]`;
      const issue = (message: string): void => {
        issues.push({ pageIndex, message });
      };

      if (!isRecord(candidate)) {
        issue(`${prefix} must be an object.`);
        return;
      }
      if (!nonEmptyString(candidate.id)) {
        issue(`${prefix}.id must be a non-empty string.`);
        return;
      }
      const id = candidate.id.trim();
      if (seenPageIds.has(id)) {
        issue(`${prefix}.id duplicates "${id}".`);
        return;
      }
      if (!nonEmptyString(candidate.title)) {
        issue(`${prefix}.title must be a non-empty string.`);
        return;
      }
      if (!Array.isArray(candidate.annotations)) {
        issue(`${prefix}.annotations must be an array.`);
        return;
      }

      seenPageIds.add(id);
      pages.push({
        id,
        title: candidate.title.trim(),
        annotations: parseAnnotations(
          candidate.annotations,
          `${prefix}.annotations`,
          issues,
          pageIndex
        )
      });
    });
  }

  const title = nonEmptyString(value.title) ? value.title.trim() : undefined;
  const description = typeof value.description === "string" ? value.description : undefined;

  return {
    document: {
      version: 1,
      ...(title ? { title } : {}),
      ...(description !== undefined ? { description } : {}),
      pages
    },
    issues
  };
}
