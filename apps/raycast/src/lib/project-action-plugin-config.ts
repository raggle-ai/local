import { normalizeFolders, normalizeSubpaths, normalizeTags, type ProjectActionConfig } from "@raggle-ai/local";

function stripComments(sourceText: string) {
  return sourceText.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function findMatchingBrace(sourceText: string, openIndex: number) {
  let depth = 0;
  let quote: string | undefined;
  let isEscaped = false;

  for (let index = openIndex; index < sourceText.length; index += 1) {
    const char = sourceText[index];

    if (quote) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === "\\") {
        isEscaped = true;
      } else if (char === quote) {
        quote = undefined;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function objectLiteralAfter(sourceText: string, marker: RegExp) {
  const match = marker.exec(sourceText);
  if (!match) return undefined;

  const openIndex = sourceText.indexOf("{", match.index + match[0].length);
  if (openIndex === -1) return undefined;

  const closeIndex = findMatchingBrace(sourceText, openIndex);
  if (closeIndex === -1) return undefined;

  return sourceText.slice(openIndex, closeIndex + 1);
}

function parseQuotedStrings(input: string) {
  const values: string[] = [];
  const stringPattern = /(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  let match: RegExpExecArray | null;

  while ((match = stringPattern.exec(input))) {
    values.push(match[2].replace(/\\(["'`\\])/g, "$1"));
  }

  return values;
}

function splitArrayElements(input: string) {
  const values: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: string | undefined;
  let isEscaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (quote) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === "\\") {
        isEscaped = true;
      } else if (char === quote) {
        quote = undefined;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "{" || char === "[") depth += 1;
    if (char === "}" || char === "]") depth -= 1;
    if (char !== "," || depth !== 0) continue;

    const value = input.slice(start, index).trim();
    if (value) values.push(value);
    start = index + 1;
  }

  const value = input.slice(start).trim();
  if (value) values.push(value);
  return values;
}

function parseSubpathItems(input: string) {
  return splitArrayElements(input)
    .map((item) => {
      const quotedStringMatch = /^\s*(["'`])((?:\\.|(?!\1)[\s\S])*?)\1\s*$/.exec(item);
      if (quotedStringMatch) return quotedStringMatch[2].replace(/\\(["'`\\])/g, "$1");

      const pathMatch = /["']?path["']?\s*:\s*(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/.exec(item);
      if (!pathMatch) return undefined;

      const allSubpathMatch = /["']?allSubpath["']?\s*:\s*(true|false)\b/.exec(item);
      const removePathFromNameMatch = /["']?removePathFromName["']?\s*:\s*(true|false)\b/.exec(item);

      return {
        path: pathMatch[2].replace(/\\(["'`\\])/g, "$1"),
        ...(allSubpathMatch ? { allSubpath: allSubpathMatch[1] === "true" } : {}),
        ...(removePathFromNameMatch ? { removePathFromName: removePathFromNameMatch[1] === "true" } : {}),
      };
    })
    .filter(Boolean);
}

function projectActionConfigFromObjectText(objectText: string): ProjectActionConfig | undefined {
  const config: ProjectActionConfig = {};

  const ignoredSubpathsArrayMatch = /["']?ignoredSubpaths["']?\s*:\s*\[([\s\S]*?)\]/.exec(objectText);
  if (ignoredSubpathsArrayMatch) config.ignoredSubpaths = parseQuotedStrings(ignoredSubpathsArrayMatch[1]);

  const ignoredSubpathsStringMatch = /["']?ignoredSubpaths["']?\s*:\s*(["'`])([\s\S]*?)\1/.exec(objectText);
  if (!ignoredSubpathsArrayMatch && ignoredSubpathsStringMatch) {
    config.ignoredSubpaths = ignoredSubpathsStringMatch[2].replace(/\\(["'`\\])/g, "$1");
  }

  const tagsArrayMatch = /["']?tags["']?\s*:\s*\[([\s\S]*?)\]/.exec(objectText);
  if (tagsArrayMatch) config.tags = normalizeTags(parseQuotedStrings(tagsArrayMatch[1]));

  const foldersArrayMatch = /["']?folders["']?\s*:\s*\[([\s\S]*?)\]/.exec(objectText);
  if (foldersArrayMatch) config.folders = normalizeFolders(parseQuotedStrings(foldersArrayMatch[1]));

  const subpathsArrayMatch = /["']?subpaths["']?\s*:\s*\[([\s\S]*?)\]/.exec(objectText);
  if (subpathsArrayMatch) {
    const subpathValues = parseSubpathItems(subpathsArrayMatch[1]);
    config.subpaths = subpathValues.length ? normalizeSubpaths(subpathValues) : undefined;
  }

  const allSubpathMatch = /["']?allSubpath["']?\s*:\s*(true|false)\b/.exec(objectText);
  if (allSubpathMatch) config.allSubpath = allSubpathMatch[1] === "true";

  const removePathFromNameMatch = /["']?removePathFromName["']?\s*:\s*(true|false)\b/.exec(objectText);
  if (removePathFromNameMatch) config.removePathFromName = removePathFromNameMatch[1] === "true";

  return Object.keys(config).length ? config : undefined;
}

export function projectActionConfigFromSource(sourceText: string): ProjectActionConfig | undefined {
  const source = stripComments(sourceText);
  const configObject =
    objectLiteralAfter(source, /\bdefineProjectConfig\s*\(/) ??
    objectLiteralAfter(source, /\b(?:export\s+)?(?:const|let|var)\s+(?:projectConfig|config)\b[^=]*=/) ??
    objectLiteralAfter(source, /\b(?:projectConfig|config)\s*:/);

  return configObject ? projectActionConfigFromObjectText(configObject) : undefined;
}
