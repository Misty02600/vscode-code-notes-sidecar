export const DEFAULT_ANNOTATION_GLOB = ".code-notes/**/*.json";
export const LEGACY_ANNOTATION_GLOB = ".vscode/source-annotations/**/*.json";

export function resolveAnnotationGlobs(configuredGlob: string): string[] {
  return configuredGlob === DEFAULT_ANNOTATION_GLOB
    ? [DEFAULT_ANNOTATION_GLOB, LEGACY_ANNOTATION_GLOB]
    : [configuredGlob];
}
