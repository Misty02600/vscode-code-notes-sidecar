export interface AnnotationReference {
  pageId: string;
  annotationId: string;
}

export function parseAnnotationReference(href: string): AnnotationReference | undefined {
  if (!href.startsWith("annotation:")) {
    return undefined;
  }

  const target = href.slice("annotation:".length).replace(/^\/\//, "");
  const segments = target.split("/");
  if (segments.length !== 2) {
    return undefined;
  }

  try {
    const pageId = decodeURIComponent(segments[0]!).trim();
    const annotationId = decodeURIComponent(segments[1]!).trim();
    return pageId && annotationId ? { pageId, annotationId } : undefined;
  } catch {
    return undefined;
  }
}
