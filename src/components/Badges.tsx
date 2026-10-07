import type { ReactNode } from 'react';
type MoSCoW = 'Must' | 'Should' | 'Could' | "Won't";
type StoryStatus = 'Backlog' | 'Ready' | 'In Progress' | 'Done' | 'Blocked';
type Complexity = 'XS' | 'S' | 'M' | 'L' | 'XL';
type Severity = 'Low' | 'Medium' | 'High';
type RequirementStatus = 'Draft' | 'Approved' | 'Rejected';

const base = 'inline-flex items-center rounded px-2 py-[2px] text-[11px] font-semibold leading-4 whitespace-nowrap';

/** MoSCoW priority - differentiated by fill/outline weight (grayscale design, no colour). */
export function PriorityBadge({ value }: { value: MoSCoW }) {
  const styles: Record<MoSCoW, string> = {
    Must: 'bg-[#111827] text-white border border-[#111827]',
    Should: 'bg-white text-[#111827] border-2 border-[#111827]',
    Could: 'bg-white text-[#6B7280] border border-[#9CA3AF]',
    "Won't": 'bg-[#F3F4F6] text-[#9CA3AF] border border-dashed border-[#9CA3AF]',
  };
  return <span className={`${base} ${styles[value]}`} title={`MoSCoW: ${value}`}>{value.toUpperCase()}</span>;
}

export function StatusTag({ value }: { value: StoryStatus | RequirementStatus }) {
  const dot: Record<string, string> = {
    Backlog: 'bg-[#D1D5DB]',
    Ready: 'bg-[#9CA3AF]',
    'In Progress': 'bg-[#6B7280]',
    Done: 'bg-[#111827]',
    Blocked: 'bg-white border border-[#111827]',
    Draft: 'bg-[#D1D5DB]',
    Approved: 'bg-[#111827]',
    Rejected: 'bg-white border border-[#111827]',
  };
  return (
    <span className={`${base} gap-1 border border-[#D1D5DB] bg-white text-[#45464c]`}>
      <span className={`h-2 w-2 rounded-full ${dot[value] ?? 'bg-[#D1D5DB]'}`} />
      {value}
    </span>
  );
}

export function ComplexityChip({ size, points }: { size: Complexity; points: number }) {
  return (
    <span className={`${base} border border-[#D1D5DB] bg-[#F3F4F6] text-[#45464c]`} title="Estimated complexity (t-shirt size / story points)">
      {size} · {points} pt{points === 1 ? '' : 's'}
    </span>
  );
}

export function RiskBadge({ value }: { value: Severity | 'Critical' }) {
  const styles: Record<string, string> = {
    Low: 'bg-white text-[#6B7280] border border-[#D1D5DB]',
    Medium: 'bg-[#F3F4F6] text-[#111827] border border-[#9CA3AF]',
    High: 'bg-white text-[#111827] border-2 border-[#111827]',
    Critical: 'bg-[#111827] text-white border border-[#111827]',
  };
  return <span className={`${base} ${styles[value] ?? styles.Low}`}>{value.toUpperCase()}</span>;
}

export function Chip({ children }: { children: ReactNode }) {
  return <span className={`${base} border border-[#D1D5DB] bg-white font-medium text-[#45464c]`}>{children}</span>;
}
