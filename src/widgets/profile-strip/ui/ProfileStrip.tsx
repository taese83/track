// FEAT-012 — 하단 고도 프로파일 스트립. 공유 커서의 세 소비자 중 하나다.
//
// **절대 단위를 쓰지 않는다**(R2). y축에는 값 대신 "상대 스케일(실측 아님)"을 **항상**
// 적는다 — 조건부로 숨기면 사용자가 이 그래프를 실측으로 읽는다(TC-012-4는 그 표기가
// 범례 개폐와 무관하게 유지되는지까지 본다).
//
// 접힘에서도 40px 헤더 바는 **항상 마운트**된다. 완전히 숨기면 FEAT-007의 유일한 조작
// 표면이 사라진다(layout-spec §Chart 리사이즈 계약).
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'

import { axisTicks, clampToReachable, pointAtRatio } from '../lib/profile-points'
import type { ProfileModel } from '../lib/profile-points'

export interface ProfileStripProps {
  model: ProfileModel
  /** 공유 커서 — 세 표면이 가리키는 같은 지점 */
  currentIndex: number
  /** 드래그·클릭·화살표 확정. 실패 구간에서는 호출되지 않는다 */
  onScrub: (index: number) => void
  collapsed: boolean
  onToggleCollapsed: () => void
  loading?: boolean
}

/** layout-spec §Chart 리사이즈 계약 — 이보다 작으면 스트립 대신 진입점만 남긴다 */
const MIN_WIDTH_PX = 320
const MIN_HEIGHT_PX = 96

/** SVG 내부 좌표계. 실제 픽셀은 CSS가 정하고 여기서는 비율만 다룬다 */
const VIEW_WIDTH = 1000
const VIEW_HEIGHT = 100

/** R2 — 이 문구가 사라지면 그래프가 실측처럼 읽힌다. 조건부 렌더 금지 */
const RELATIVE_SCALE_NOTE = '상대 스케일(실측 아님)'

function xOf(index: number, total: number): number {
  return total <= 1 ? 0 : (index / (total - 1)) * VIEW_WIDTH
}

function yOf(elevationRelative: number): number {
  // SVG y는 아래로 증가한다 — 뒤집지 않으면 언덕이 골짜기로 보인다
  return (1 - elevationRelative) * VIEW_HEIGHT
}

export function ProfileStrip({
  model,
  currentIndex,
  onScrub,
  collapsed,
  onToggleCollapsed,
  loading = false,
}: ProfileStripProps) {
  const { points, closureGapRelative } = model
  const total = points.length
  const describedById = useId()
  const hostRef = useRef<HTMLDivElement>(null)
  const [tooSmall, setTooSmall] = useState(false)

  // 최소 크기 폴백은 실제 렌더 크기로만 판정할 수 있다 — 미디어 쿼리는 컨테이너가 아니라
  // 뷰포트를 본다. 완전히 숨기지 않고 진입점을 남기는 것이 계약이다.
  useEffect(() => {
    const host = hostRef.current
    if (host === null || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      const box = entry?.contentRect
      if (box === undefined) return
      setTooSmall(box.width < MIN_WIDTH_PX || box.height < MIN_HEIGHT_PX)
    })
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  const current = points[currentIndex]
  const summary =
    current === undefined
      ? '구간 없음'
      : `${current.kindLabel}, ${currentIndex + 1}/${total}`

  const scrubTo = useCallback(
    (index: number) => {
      const point = points[index]
      // 1차 방어 — 실패 구간에서는 호출 자체를 하지 않는다(2차 방어는 `isReachable`)
      if (point === undefined || point.failed === true) return
      onScrub(index)
    },
    [points, onScrub],
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (total === 0) return
      let next: number | null = null
      if (event.key === 'ArrowRight') next = currentIndex + 1
      else if (event.key === 'ArrowLeft') next = currentIndex - 1
      else if (event.key === 'Home') next = 0
      else if (event.key === 'End') next = total - 1
      if (next === null) return

      event.preventDefault()
      // 실패 경계에서 **멈춘다** — 건너뛰면 실패 구간의 존재를 모른 채 지나간다
      scrubTo(clampToReachable(next, points))
    },
    [currentIndex, total, points, scrubTo],
  )

  const scrubFromPointer = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      const box = event.currentTarget.getBoundingClientRect()
      if (box.width === 0) return
      const point = pointAtRatio((event.clientX - box.left) / box.width, points)
      if (point === null) return
      onScrub(point.index)
    },
    [points, onScrub],
  )

  const handlePointerDown = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId)
      scrubFromPointer(event)
    },
    [scrubFromPointer],
  )

  const handlePointerMove = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
      scrubFromPointer(event)
    },
    [scrubFromPointer],
  )

  const reachable = points.filter((point) => point.failed !== true)
  const failed = points.filter((point) => point.failed === true)
  const line = (subset: typeof points) =>
    subset.map((point) => `${xOf(point.index, total)},${yOf(point.elevationRelative)}`).join(' ')

  return (
    <div
      ref={hostRef}
      className="flex h-full w-full flex-col"
      data-testid="profile-strip"
      data-collapsed={collapsed}
    >
      {/*
        헤더 바는 접힘·펼침 어디서도 같은 DOM 위치에 있다. 상태별로 다른 트리를 그리면
        토글에 있던 포커스가 사라진다(a11y-responsive).
      */}
      <div
        className="flex h-10 shrink-0 items-center gap-3 px-3 text-[12px]"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          data-testid="profile-strip-toggle"
          className="rounded-[4px] border px-2 py-1"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
        >
          {collapsed ? '프로파일 펼치기' : '프로파일 접기'}
        </button>
        {/* 접혀도 현재 위치는 계속 읽힌다 — 조작 표면이 사라지면 안 된다 */}
        <span data-testid="profile-strip-summary">{summary}</span>
        <span className="ml-auto" data-testid="profile-strip-scale-note">
          {RELATIVE_SCALE_NOTE}
        </span>
      </div>

      {!collapsed && (
        <div className="relative min-h-0 flex-1 px-3 pb-2">
          <span className="sr-only" id={describedById}>
            상세 목록은 구간 목록 참고
          </span>

          {tooSmall || total === 0 || loading ? (
            <div
              className="flex h-full items-center justify-center text-[12px]"
              style={{ color: 'var(--color-text-secondary)' }}
              data-testid="profile-strip-fallback"
            >
              {loading ? '고도 프로파일을 계산하고 있습니다' : '구간 목록에서 확인'}
            </div>
          ) : (
            <div
              role="slider"
              tabIndex={0}
              aria-valuemin={0}
              aria-valuemax={Math.max(total - 1, 0)}
              aria-valuenow={currentIndex}
              aria-valuetext={summary}
              aria-label="고도 프로파일 위치"
              aria-describedby={describedById}
              onKeyDown={handleKeyDown}
              className="h-full w-full"
              data-testid="profile-strip-slider"
            >
              <svg
                viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
                preserveAspectRatio="none"
                className="h-full w-full"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
              >
                {/* y축 눈금 — 위치만 준다. 값 라벨을 달면 절대 단위 표기가 된다 */}
                {axisTicks().map((tick) => (
                  <line
                    key={tick}
                    x1={0}
                    x2={VIEW_WIDTH}
                    y1={yOf(tick)}
                    y2={yOf(tick)}
                    stroke="var(--color-border)"
                    strokeWidth={0.4}
                    data-testid="profile-axis-tick"
                  />
                ))}

                {/* 세그먼트 경계 — 구간이 어디서 갈리는지 보인다(TC-012-1) */}
                {points.map((point) => (
                  <line
                    key={point.index}
                    x1={xOf(point.index, total)}
                    x2={xOf(point.index, total)}
                    y1={0}
                    y2={VIEW_HEIGHT}
                    stroke="var(--color-border)"
                    strokeWidth={0.3}
                    opacity={0.5}
                    data-testid="profile-boundary"
                  />
                ))}

                <polyline
                  points={line(reachable)}
                  fill="none"
                  stroke="var(--color-text-primary)"
                  strokeWidth={1.2}
                  vectorEffect="non-scaling-stroke"
                  data-testid="profile-curve"
                />

                {/* 도달 불가 구간은 회색 점선이다 — 색 단독이 아니라 형태로도 다르다 */}
                {failed.length > 0 && (
                  <polyline
                    points={line(failed)}
                    fill="none"
                    stroke="var(--color-fail-segment)"
                    strokeWidth={1.2}
                    strokeDasharray="4 3"
                    vectorEffect="non-scaling-stroke"
                    data-testid="profile-curve-failed"
                  />
                )}

                {/*
                  폐합 실패는 **양 끝단의 수직 불연속**으로 드러낸다. 보정해서 이어붙이면
                  화면이 있지도 않은 폐합을 주장한다(제품 계약 §5).
                */}
                {closureGapRelative !== null && points.length > 0 && (
                  <line
                    x1={VIEW_WIDTH}
                    x2={VIEW_WIDTH}
                    y1={yOf(points[0]!.elevationRelative)}
                    y2={yOf(points[0]!.elevationRelative - closureGapRelative)}
                    stroke="var(--color-warning)"
                    strokeWidth={2}
                    strokeDasharray="3 2"
                    vectorEffect="non-scaling-stroke"
                    data-testid="profile-closure-gap"
                  />
                )}

                {current !== undefined && (
                  <line
                    x1={xOf(currentIndex, total)}
                    x2={xOf(currentIndex, total)}
                    y1={0}
                    y2={VIEW_HEIGHT}
                    stroke="var(--color-accent, #7AA2F7)"
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                    data-testid="profile-indicator"
                  />
                )}
              </svg>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
