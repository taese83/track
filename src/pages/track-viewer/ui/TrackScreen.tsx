// FEAT-006이 만든 `3d` 화면 상태의 마운트. **FEAT-013이 목록 슬롯을 채웠다.**
//
// 각 화면 상태의 마운트는 그 상태를 만드는 FEAT가 소유한다(solution-design §7 —
// FEAT-001이 input·error를 넣은 선례). FEAT-006이 3분할 셸의 치수를 예약했고 목록 자리는
// 임시 요약이 지키고 있었다. 지금은 그 자리를 `SectionList`가 쓰고, 요약은 접이식으로
// 남는다. **FEAT-010이 근거 등급 오버레이를 캔버스 컬럼에 얹었다** — 스트립(FEAT-012)만
// 아직 자기 티켓을 기다린다.
//
// 커서 Provider는 여기서 마운트한다(component-spec §소유권): 경로가 있는 화면 상태에서만
// 커서가 성립하고, `입력 대기`/`로딩`/`완전 실패`에는 가리킬 구간 자체가 없다.
import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import type { ClosureValidation } from '@/entities/track/lib/closure'
import type { ElevatedSegment } from '@/entities/track/lib/elevation'
import { TrackCursorProvider, useTrackCursor } from '@/shared/lib/track-cursor'
import {
  SECTION_LIST_PANEL_WIDTH_PX,
  SECTION_LIST_RAIL_WIDTH_PX,
  SectionList,
  reachableCountOf,
} from '@/widgets/section-list'
import type { SectionListItem } from '@/widgets/section-list'
import { ProfileStrip } from '@/widgets/profile-strip'
import type { ProfileModel } from '@/widgets/profile-strip'
import { TrackCanvas } from '@/widgets/track-canvas'
import type { SceneLayout } from '@/widgets/track-canvas'

import { buildScreenProfileModel } from '../lib/profile-model'

import { EvidenceOverlay } from './EvidenceOverlay'

export interface TrackScreenProps {
  layout: SceneLayout
  elevated: readonly ElevatedSegment[]
  closure: ClosureValidation
  totalPieceCount: number
  /** 목록 행. `TrackViewerPage`가 파이프라인 산출로 만들어 넘긴다 */
  items: readonly SectionListItem[]
  /**
   * 파이프라인 실측 요약. FEAT-013(구간 목록)·FEAT-010(근거 배지)이 들어오면 그 표면이
   * 대신한다 — 지금 지우면 TC-002-1·TC-003-5가 화면에서 확인할 대상을 잃으므로,
   * 자리만 옮기고 내용은 그대로 이어받는다.
   */
  pipelineSummary: ReactNode
}

/**
 * layout-spec §글로벌 셸 — 스트립 140px · alert 40px는 상태와 무관하게 고정.
 * 목록 320px은 `SectionList`가 소유한다(접기 시 56px 레일로 바뀌므로 셸이 함께 정하면 어긋난다).
 */
const STRIP_HEIGHT_PX = 140
const ALERT_HEIGHT_PX = 40

/**
 * 목록 열. 커서 소비는 Provider 안에서만 가능하므로 셸에서 한 겹 분리한다.
 * roving 포커스는 이 컬럼의 로컬 상태다 — 공유 상태로 올리면 방향키 이동이
 * 다른 표면까지 흔든다(component-spec §focusedIndex ≠ currentIndex).
 */
function SectionColumn({
  items,
  summary,
}: {
  items: readonly SectionListItem[]
  summary: ReactNode
}) {
  const { currentIndex, setCursor, lastSource } = useTrackCursor()
  const [expanded, setExpanded] = useState(true)
  const [focusedIndex, setFocusedIndex] = useState(0)

  const handleToggle = useCallback(() => setExpanded((prev) => !prev), [])
  const handleSelect = useCallback(
    (index: number) => setCursor(index, 'list'),
    [setCursor],
  )

  return (
    // 컬럼 폭을 목록과 같은 값으로 고정한다. 요약의 내재 폭이 더 넓으면 컬럼이 320px 예약을
    // 밀어낸다 — 실측으로 캔버스가 384.7px 늘어난 반면 목록은 264px만 줄었다
    // (layout-spec §글로벌 셸의 예약 폭 위반).
    <div
      className="flex min-h-0 flex-col"
      style={{ width: expanded ? SECTION_LIST_PANEL_WIDTH_PX : SECTION_LIST_RAIL_WIDTH_PX }}
    >
      {/*
        요약은 `open`이 기본이다. 접어 두면 화면에서 보이지 않아 TC-002-1·TC-003-1·TC-003-5가
        확인할 대상을 잃는다(실측: 접힌 채로 두자 상류 e2e 11건이 `fetch-success` 미표시로
        실패했다). 사용자는 접을 수 있지만 기본은 열림이다.
      */}
      {expanded && (
        <details
          open
          className="max-h-[45%] w-full shrink-0 overflow-auto border-b px-3 py-2 text-[12px]"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          <summary className="cursor-pointer">파이프라인 요약</summary>
          <div className="mt-2">{summary}</div>
        </details>
      )}
      <SectionList
        items={items}
        currentIndex={currentIndex}
        focusedIndex={focusedIndex}
        onFocusMove={setFocusedIndex}
        onSelect={handleSelect}
        expanded={expanded}
        followCursor={lastSource !== 'list'}
        onToggleExpanded={handleToggle}
        variant="sidebar"
      />
    </div>
  )
}

/**
 * 스트립 열. 커서 소비는 Provider 안에서만 가능하므로 셸에서 한 겹 분리한다(목록과 같은 구조).
 * 접힘은 이 열의 로컬 상태다 — 공유 커서와 달리 다른 표면이 알 필요가 없다.
 */
function ProfileColumn({ model }: { model: ProfileModel }) {
  const { currentIndex, setCursor } = useTrackCursor()
  const [collapsed, setCollapsed] = useState(false)

  const handleToggle = useCallback(() => setCollapsed((prev) => !prev), [])
  const handleScrub = useCallback((index: number) => setCursor(index, 'strip'), [setCursor])

  return (
    <ProfileStrip
      model={model}
      currentIndex={currentIndex}
      onScrub={handleScrub}
      collapsed={collapsed}
      onToggleCollapsed={handleToggle}
    />
  )
}

export function TrackScreen({
  layout,
  elevated,
  closure,
  totalPieceCount,
  items,
  pipelineSummary,
}: TrackScreenProps) {
  const reachableCount = useMemo(() => reachableCountOf(items), [items])
  const rendered = layout.segments.length

  const profileModel = useMemo(
    () => buildScreenProfileModel({ elevated, items, closure }),
    [elevated, items, closure],
  )
  const banner =
    closure.isClosedLoop && closure.isZClosed !== false
      ? null
      : layout.truncated
        ? `연결이 끊긴 지점까지만 표시했습니다 — ${rendered}/${totalPieceCount}피스`
        : 'XY 폐곡선이지만 고도가 시작점으로 돌아오지 않았습니다'

  return (
    <TrackCursorProvider totalCount={items.length} reachableCount={reachableCount}>
      <div className="flex min-h-0 flex-1 flex-col" data-testid="track-screen">
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
        {/*
          접으면 56px 레일로 줄고 캔버스가 그 폭을 가져간다 — 위로 사라지지 않는다
          (component-spec §측면 접기 계약). 폭은 `SectionList`가 스스로 정한다.
        */}
        <SectionColumn items={items} summary={pipelineSummary} />

        {/*
          근거 오버레이는 캔버스 **위에 겹친다**(FEAT-010). `TrackCanvas`에 prop으로
          내리지 않는 이유: 그 위젯은 FEAT-008·009·011이 공유하는 충돌 표면이고,
          "구현 없는 prop을 미리 뚫으면 죽은 표면이 된다"는 FEAT-006 결정을 스스로
          주석에 남겨 뒀다. 겹치는 레이어는 캔버스 컬럼을 소유한 여기가 얹으면 된다.
        */}
        <div className="relative min-w-0 flex-1">
          <TrackCanvas layout={layout} elevated={elevated} />
          <EvidenceOverlay elevated={elevated} totalPieceCount={totalPieceCount} />
        </div>
      </div>

      <section
        className="shrink-0 border-t"
        style={{ height: STRIP_HEIGHT_PX, borderColor: 'var(--color-border)' }}
        aria-label="고도 프로파일 탐색"
      >
        <ProfileColumn model={profileModel} />
      </section>
      </div>
    </TrackCursorProvider>
  )
}
