export interface NormalizedClassNameResult {
  normalizedClassName: string;
  tokens: string[];
}

export interface ClassLintIssue {
  code: "duplicate-token" | "invalid-token" | "too-long";
  message: string;
  token?: string;
}

export interface ClassLintResult {
  issues: ClassLintIssue[];
}

export interface ClassDiffResult {
  added: string[];
  removed: string[];
  unchangedCount: number;
}

const VALID_CLASS_TOKEN_PATTERN = /^[a-z0-9:/.\u005b\u005d%_-]+$/i;
const MAX_CLASS_NAME_LENGTH = 160;

export function tokenizeClassName(className: string): string[] {
  if (className.trim().length === 0) {
    return [];
  }

  return className.trim().split(/\s+/);
}

export function normalizeClassName(className: string): NormalizedClassNameResult {
  const uniqueSortedTokens = [...new Set(tokenizeClassName(className))].sort();

  return {
    normalizedClassName: uniqueSortedTokens.join(" "),
    tokens: uniqueSortedTokens
  };
}

export function lintClassName(className: string): ClassLintResult {
  const issues: ClassLintIssue[] = [];
  const tokens = tokenizeClassName(className);
  const tokenCounts = new Map<string, number>();

  if (className.length > MAX_CLASS_NAME_LENGTH) {
    issues.push({
      code: "too-long",
      message: `className length exceeds ${MAX_CLASS_NAME_LENGTH}`
    });
  }

  for (const token of tokens) {
    tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);

    if (!VALID_CLASS_TOKEN_PATTERN.test(token)) {
      issues.push({
        code: "invalid-token",
        message: `invalid class token: ${token}`,
        token
      });
    }
  }

  for (const [token, count] of [...tokenCounts.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (count > 1) {
      issues.push({
        code: "duplicate-token",
        message: `duplicate class token: ${token}`,
        token
      });
    }
  }

  return {
    issues
  };
}

export function diffClassNames(previousClassName: string, nextClassName: string): ClassDiffResult {
  const previousTokens = normalizeClassName(previousClassName).tokens;
  const nextTokens = normalizeClassName(nextClassName).tokens;
  const previousSet = new Set(previousTokens);
  const nextSet = new Set(nextTokens);

  const added = nextTokens.filter((token) => !previousSet.has(token));
  const removed = previousTokens.filter((token) => !nextSet.has(token));
  const unchangedCount = nextTokens.filter((token) => previousSet.has(token)).length;

  return {
    added,
    removed,
    unchangedCount
  };
}
