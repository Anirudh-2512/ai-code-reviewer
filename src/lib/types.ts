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
};
