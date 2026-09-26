export type ParsedPr = {
  owner: string;
  repo: string;
  number: number;
};

export function parseGithubPrUrl(input: string): ParsedPr | null {
  const match = input
    .trim()
    .match(
      /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/.*)?$/i
    );
  if (!match) return null;
  return {
    owner: match[1],
    repo: match[2].replace(/\.git$/, ""),
    number: Number(match[3]),
  };
}
