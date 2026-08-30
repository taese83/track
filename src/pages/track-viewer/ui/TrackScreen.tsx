// FEAT-006 — `3d` 화면 상태의 마운트.
//
// 각 화면 상태의 마운트는 그 상태를 만드는 FEAT가 소유한다(solution-design §7 —
// FEAT-001이 input·error를 넣은 선례). 여기서는 3분할 셸의 **자리만** 잡고, 목록은
// FEAT-013, 스트립은 FEAT-012, 근거 배지는 FEAT-010이 자기 티켓에서 채운다.
//
// 자리를 비워 두는 것이 아니라 **치수를 예약**하는 이유: layout-spec §Layout stability 규칙
// 2가 로딩↔3D 전환에서 셸 치수가 바뀌지 않을 것을 요구한다. 나중에 목록이 들어올 때
// 캔버스가 줄어들면 그 규칙이 그때 깨진다.
import type { ReactNode } from 'react'

import type { ClosureValidation } from '@/entities/track/lib/closure'
import type { ElevatedSegment } from '@/entities/track/lib/elevation'
import { TrackCanvas } from '@/widgets/track-canvas'
import type { SceneLayout } from '@/widgets/track-canvas'

export interface TrackScreenProps {
  layout: SceneLayout
  elevated: readonly ElevatedSegment[]
  closure: ClosureValidation
  totalPieceCount: number
  /**
   * 파이프라인 실측 요약. FEAT-013(구간 목록)·FEAT-010(근거 배지)이 들어오면 그 표면이
   * 대신한다 — 지금 지우면 TC-002-1·TC-003-5가 화면에서 확인할 대상을 잃으므로,
   * 자리만 옮기고 내용은 그대로 이어받는다.
   */
  pipelineSummary: ReactNode
}

/** layout-spec §글로벌 셸 — 목록 320px · 스트립 140px · alert 40px는 상태와 무관하게 고정 */
const LIST_WIDTH_PX = 320
const STRIP_HEIGHT_PX = 140
const ALERT_HEIGHT_PX = 40

function PendingPanel({ owner, note }: { owner: string; note: string }) {
  return (
    <div
      className="flex h-full w-full items-center justify-center p-4 text-center text-[13px]"
      style={{ color: 'var(--color-text-secondary)' }}
    >
      <span>
        {note}
        <br />
        {owner}
      </span>
    </div>
  )
}

export function TrackScreen({
  layout,
  elevated,
  closure,
  totalPieceCount,
  pipelineSummary,
}: TrackScreenProps) {
  const rendered = layout.segments.length
  const banner =
    closure.isClosedLoop && closure.isZClosed !== false
      ? null
      : layout.truncated
        ? `연결이 끊긴 지점까지만 표시했습니다 — ${rendered}/${totalPieceCount}피스`
        : 'XY 폐곡선이지만 고도가 시작점으로 돌아오지 않았습니다'

  return (
    <div className="flex flex-1 flex-col" data-testid="track-screen">
      {/* 규칙 1 — 배너가 뜨고 사라져도 높이는 고정이다 */}
      <div
        className="flex shrink-0 items-center px-4 text-[13px]"
        style={{ height: ALERT_HEIGHT_PX, color: 'var(--color-warning)' }}
        role="status"
        aria-live="polite"
        data-testid="alert-slot"
      >
        {banner}
      </div>

      <div className="flex min-h-0 flex-1">
        <section
          className="shrink-0 border-r"
          style={{ width: LIST_WIDTH_PX, borderColor: 'var(--color-border)' }}
          aria-label="구간 목록"
        >
          <div className="h-full overflow-y-auto p-4">{pipelineSummary}</div>
        </section>

        <div className="min-w-0 flex-1">
          <TrackCanvas layout={layout} elevated={elevated} />
        </div>
      </div>

      <section
        className="shrink-0 border-t"
        style={{ height: STRIP_HEIGHT_PX, borderColor: 'var(--color-border)' }}
        aria-label="고도 프로파일 탐색"
      >
        <PendingPanel owner="FEAT-012" note="하단 프로파일 스트립은 아직 구현되지 않았습니다." />
      </section>
    </div>
  )
}
