import { Effect } from "effect";

export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.replace(/^v/, "").split(".").map(Number);
  const aa = parse(a);
  const bb = parse(b);
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
    const av = aa[i] || 0;
    const bv = bb[i] || 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

export function isValidVersion(version: string): boolean {
  return /^v?[\d.]+$/.test(version);
}

export interface GitHubRelease {
  readonly tag_name: string;
  readonly html_url: string;
  readonly body: string;
  readonly published_at: string;
  readonly prerelease: boolean;
}

export function fetchLatestRelease(
  repo: string,
  channel: "stable" | "beta" | "dev",
): Effect.Effect<GitHubRelease | null | undefined, Error> {
  return Effect.gen(function* () {
    // For stable channel, /releases/latest works and never returns prereleases
    // For beta/dev, we need to fetch all releases and find the first matching one
    const url =
      channel === "stable"
        ? `https://api.github.com/repos/${repo}/releases/latest`
        : `https://api.github.com/repos/${repo}/releases`;

    const response = yield* Effect.tryPromise(() =>
      fetch(url, {
        headers: {
          "User-Agent": "prism-liquidity-agent",
          Accept: "application/vnd.github.v3+json",
        },
      }),
    );

    if (response.status === 403 || response.status === 429) {
      const rateLimitRemaining = response.headers.get("x-ratelimit-remaining");
      const retryAfter = response.headers.get("retry-after");
      if (rateLimitRemaining === "0") {
        const msg = retryAfter
          ? `GitHub API rate limit exceeded. Retry after ${retryAfter}s.`
          : "GitHub API rate limit exceeded. Try again later.";
        return yield* Effect.fail(new Error(msg));
      }
      if (response.status === 429) {
        const msg = retryAfter
          ? `GitHub API secondary rate limit. Retry after ${retryAfter}s.`
          : "GitHub API secondary rate limit. Try again later.";
        return yield* Effect.fail(new Error(msg));
      }
    }

    if (!response.ok) {
      return yield* Effect.fail(
        new Error(`GitHub API error: ${response.status} ${response.statusText}`),
      );
    }

    if (channel === "stable") {
      const release = (yield* Effect.tryPromise(() =>
        response.json(),
      )) as GitHubRelease | undefined;
      return release ?? null;
    }

    // For beta/dev: fetch releases with pagination support
    const allReleases: GitHubRelease[] = [];
    let pageUrl: string | null = url;
    let pageCount = 0;
    const maxPages = 3; // Limit to 3 pages (90 releases) to avoid excessive API calls

    while (pageUrl !== null && pageCount < maxPages) {
      pageCount++;
      const pageResponse = yield* Effect.tryPromise(() =>
        fetch(pageUrl!, {
          headers: {
            "User-Agent": "prism-liquidity-agent",
            Accept: "application/vnd.github.v3+json",
          },
        }),
      );

      if (!pageResponse.ok) {
        return yield* Effect.fail(
          new Error(`GitHub API error: ${pageResponse.status} ${pageResponse.statusText}`),
        );
      }

      const releases = (yield* Effect.tryPromise(() =>
        pageResponse.json(),
      )) as GitHubRelease[];

      if (!Array.isArray(releases) || releases.length === 0) {
        break;
      }

      allReleases.push(...releases);

      // Check for next page in Link header
      const linkHeader = pageResponse.headers.get("link");
      if (linkHeader) {
        const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        pageUrl = nextMatch?.[1] ?? null;
      } else {
        pageUrl = null;
      }
    }

    if (allReleases.length === 0) {
      return null;
    }

    // beta = prerelease, dev = all releases (including stable)
    const filtered =
      channel === "beta"
        ? allReleases.filter((r) => r.prerelease)
        : allReleases;

    if (filtered.length === 0) {
      return null;
    }

    return filtered[0]!;
  });
}
