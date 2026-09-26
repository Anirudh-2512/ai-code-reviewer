export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type ReviewFinding = {
  id: string;
  severity: Severity;
  category: string;
  title: string;
  file?: string;
  line?: number;
  explanation: string;
  suggestion?: string;
  codeFix?: string;
};

export type ReviewResult = {
  summary: string;
  verdict: "safe" | "needs-work" | "blocked";
  findings: ReviewFinding[];
  /** Index of the chunk to resume from when a large diff was only partially reviewed (absent when complete). */
  resumeIndex?: number;
};
