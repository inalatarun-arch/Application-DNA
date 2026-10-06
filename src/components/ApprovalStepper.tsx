import type { ApprovalStage } from '../db/deliveryDb';

interface Props {
  stages: ApprovalStage[];
  /** 0 = Draft, 1..N = awaiting stage N, N+1 = Approved */
  stageIndex: number;
  rejected?: boolean;
}

const CLIP_FIRST = 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)';
const CLIP_MID = 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 14px 50%)';

/** Horizontal chevron progress bar: completed = filled gray, current = 2px dark outline, future = light outline. */
export function ApprovalStepper({ stages, stageIndex, rejected }: Props) {
  const nodes = ['Draft', ...stages.map((s) => s.label), 'Approved'];
  const finished = stageIndex === nodes.length - 1;
  return (
    <div className="flex w-full overflow-x-auto" role="list" aria-label="Approval progress">
      {nodes.map((name, idx) => {
        const done = idx < stageIndex || (finished && idx === stageIndex);
        const current = idx === stageIndex && !finished;
        const clip = idx === 0 ? CLIP_FIRST : CLIP_MID;
        const outer = current ? '#111827' : done ? '#9CA3AF' : '#D1D5DB';
        const inner = current ? '#FFFFFF' : done ? '#9CA3AF' : '#FFFFFF';
        const text = done || current ? '#111827' : '#6B7280';
        return (
          <div
            key={`${name}-${idx}`}
            role="listitem"
            aria-current={current ? 'step' : undefined}
            className="relative h-10 min-w-[120px] flex-1"
            style={{ clipPath: clip, background: outer, marginLeft: idx === 0 ? 0 : -6 }}
          >
            <div
              className="absolute flex items-center justify-center px-5 text-center text-[12px] leading-4"
              style={{ inset: current ? 2 : 1, clipPath: clip, background: inner, color: text, fontWeight: current ? 600 : 500 }}
            >
              {done ? '✓ ' : ''}
              {name}
            </div>
          </div>
        );
      })}
      {rejected && <span className="ml-3 self-center whitespace-nowrap text-[12px] font-semibold text-[#111827]">REJECTED - returned to Draft</span>}
    </div>
  );
}
