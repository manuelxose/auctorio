/** Contracts of the contextual assistant API (/v2/copilot tools, context and actions). */

export type AssistantActionStatus = 'pending' | 'executing' | 'confirmed' | 'failed' | 'cancelled';

export type AssistantActionResult = { links?: Array<{ label: string; path: string }>; [key: string]: unknown };

export type AssistantAction = {
  id: string;
  tool: string;
  args: unknown;
  summary: string;
  status: AssistantActionStatus;
  result: AssistantActionResult | null;
  error: string | null;
  createdAt: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
};

export type AssistantTool = {
  name: string;
  kind: 'read' | 'write';
  label: string;
  description: string;
  permission: string;
  needs: string;
  confirmation: boolean;
  allowed: boolean;
};

export type AssistantContextView = {
  selection: { siteId: string | null; planId: string | null; planItemId: string | null; projectId: string | null; periodFrom: string | null; periodTo: string | null; area: string | null };
  site: { id: string; name: string } | null;
  plan: { id: string; name: string; status: string; itemCount: number; unfilledSlots: number } | null;
  proposal: { id: string; title: string; status: string } | null;
  period: { from: string; to: string; itemCount: number } | null;
  activeSources: number;
  recentFailures: number;
};
