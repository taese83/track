// FEAT-014 — `webgl-unsupported` 화면 상태의 마운트.
//
// 각 화면 상태의 마운트는 그 상태를 만드는 FEAT가 소유한다(FEAT-001 input·error,
// FEAT-006/013 3d 셸의 선례). 이 화면은 3D 셸의 변형이 아니라 **별개 상태**다 —
// layout-spec §WebGL 미지원: "목록 컬럼이 폭을 100%로 확장하고 캔버스 컬럼은 렌더되지
// 않는다(스트립은 유지)".
//
// **목록은 접히지 않는다.** `SectionList`에 `onToggleExpanded`를 넘기지 않아 토글 버튼
// 자체가 렌더되지 않는다(component-spec §widgets: "이것은 토글이 아니라 대체 화면이므로
// '접었다 펼 수 있는 옵션'으로 보이면 안 된다 — 제품 계약 §4, 협상 불가"). `expanded`를
// true로 주고 버튼만 숨기는 것으로는 부족하다 — 레일로 줄일 경로가 남으면 대체 표현의
// 주 콘텐츠가 사라질 수 있다.
import { useCallback, useMemo, useState } from 'react'

import { TrackCursorProvider, useTrackCursor } from '@/shared/lib/track-cursor'
import { ProfileStrip } from '@/widgets/profile-strip'
import type { ProfileModel } from '@/widgets/profile-strip'
import { SectionList, reachableCountOf } from '@/widgets/section-list'
import type { SectionListItem } from '@/widgets/section-list'

/** layout-spec §글로벌 셸 — 상태와 무관하게 고정. 3D 셸과 같은 값이어야 상태 전환에서 안 흔들린다 */
const STRIP_HEIGHT_PX = 140
const ALERT_HEIGHT_PX = 40

/**
 * TC-014-1이 화면에서 찾는 문구. 프리뷰 프로토타입의 `webgl-note`와 같은 문장이다 —
 * 안내는 "왜 3D가 없는가"와 "대신 무엇을 보는가"를 함께 말해야 사용자가 멈추지 않는다.
 */
export const WEBGL_UNSUPPORTED_NOTICE =
  '이 브라우저는 3D 보기를 지원하지 않습니다. 파싱된 경로 데이터를 텍스트 구간 목록으로 대신 표시합니다.'

/** 목록 소비는 Provider 안에서만 가능하므로 셸에서 한 겹 분리한다(3D 셸과 같은 구조) */
function FallbackList({ items }: { items: readonly SectionListItem[] }) {
  const { currentIndex, setCursor, lastSource } = useTrackCursor()
  const [focusedIndex, setFocusedIndex] = useState(0)

  const handleSelect = useCallback((index: number) => setCursor(index, 'list'), [setCursor])

  return (
    <SectionList
      items={items}
      currentIndex={currentIndex}
      focusedIndex={focusedIndex}
      onFocusMove={setFocusedIndex}
      onSelect={handleSelect}
      // 대체 화면에서는 펼침이 고정이다 — 토글 핸들러를 넘기지 않으므로 버튼도 없다
      expanded
      followCursor={lastSource !== 'list'}
      variant="full-width"
    />
  )
}

/** 스트립 열. 3D 셸과 같은 구조다 — 대체 화면이라고 다른 컴포넌트를 쓰지 않는다 */
function FallbackProfile({ model }: { model: ProfileModel }) {
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

export interface WebglFallbackScreenProps {
  items: readonly SectionListItem[]
  /** states.md §WebGL 미지원 — "스트립은 유지"다. 고도는 파싱됐으므로 2D로 그릴 수 있다 */
  profileModel: ProfileModel
}

export function WebglFallbackScreen({ items, profileModel }: WebglFallbackScreenProps) {
  const reachableCount = useMemo(() => reachableCountOf(items), [items])

  return (
    <TrackCursorProvider totalCount={items.length} reachableCount={reachableCount}>
      <div className="flex min-h-0 flex-1 flex-col" data-testid="webgl-fallback-screen">
        {/* alert 슬롯은 상태와 무관하게 같은 높이를 예약한다(layout-spec §1 흔들림 금지) */}
        <div
          className="flex shrink-0 items-center px-4 text-[13px]"
          style={{ height: ALERT_HEIGHT_PX, color: 'var(--color-warning)' }}
          role="status"
          aria-live="polite"
          data-testid="alert-slot"
        >
          <span data-testid="webgl-unsupported-notice">{WEBGL_UNSUPPORTED_NOTICE}</span>
        </div>

        {/* 캔버스 컬럼이 없다 — 목록이 폭 전체를 쓴다 */}
        <div className="flex min-h-0 flex-1">
          <FallbackList items={items} />
        </div>

        {/*
          스트립 자리는 유지한다. states.md가 "스트립은 유지 — 고도 데이터는 파싱됐으므로
          그래프 자체는 2D로 그릴 수 있다"로 규정했고, 실제 그래프는 FEAT-012 소유다.
          자리를 지우면 3D↔대체 전환에서 셸 높이가 달라져 §1 흔들림 금지가 깨진다.
        */}
        <section
          className="shrink-0 border-t"
          style={{ height: STRIP_HEIGHT_PX, borderColor: 'var(--color-border)' }}
          aria-label="고도 프로파일 탐색"
        >
          <FallbackProfile model={profileModel} />
        </section>
      </div>
    </TrackCursorProvider>
  )
}
