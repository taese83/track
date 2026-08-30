// FEAT-013 — 텍스트 구간 목록. 3D가 아니라 **이것이 1차 정보원**이다
// (a11y-responsive §랜드마크: skip-link가 캔버스가 아니라 목록으로 간다).
//
// 포커스와 커서는 **다른 것**이다(component-spec §SectionList). 방향키는 목록 안의 roving
// 포커스만 옮기고, 공유 커서는 Enter·클릭 같은 **명시적 확정 이벤트에서만** 갱신한다.
// 이 분리가 없으면 방향키 연타만으로 캔버스·스트립이 매 프레임 따라 움직여 공유 커서
// 계약의 "쓰기는 직접 사용자 이벤트에서만"이 깨진다.
import { useCallback, useEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'

import { segmentKindLabel } from '../lib/section-items'
import type { SectionListItem } from '../lib/section-items'

export interface SectionListProps {
  items: readonly SectionListItem[]
  /** 공유 커서 — 세 표면이 가리키는 같은 지점 */
  currentIndex: number
  /** 목록 안의 roving 포커스. `currentIndex`와 분리돼 있다 */
  focusedIndex: number
  /** ↑↓ 이동 — `setCursor`를 부르지 않는다 */
  onFocusMove: (index: number) => void
  /** Enter·클릭 — 여기서만 공유 커서가 갱신된다 */
  onSelect: (index: number) => void
  expanded: boolean
  /** 접이식이 아닌 상태(WebGL 미지원 대체 화면)에서는 넘기지 않는다 */
  onToggleExpanded?: () => void
  variant: 'sidebar' | 'full-width'
  loading?: boolean
}

/** 로딩 시 표시할 스켈레톤 행 수. 총량을 모르므로 고정값이다(layout-spec §1) */
const SKELETON_ROWS = 12

/**
 * layout-spec §글로벌 셸의 예약 폭과 §측면 접기 계약의 레일 폭.
 * **폭의 소유자는 이 컴포넌트다** — 셸이 함께 정하면 접기 상태와 어긋난다.
 */
const PANEL_WIDTH_PX = 320
const RAIL_WIDTH_PX = 56

const LIST_ID = 'section-list-box'
const HEADING_ID = 'section-list-h'

function rowLabel(item: SectionListItem, total: number): string {
  const position = `${item.index + 1}/${total}`
  const kind = segmentKindLabel(item.segmentKind)
  return `${position} ${item.pieceType} ${kind}`
}

export function SectionList({
  items,
  currentIndex,
  focusedIndex,
  onFocusMove,
  onSelect,
  expanded,
  onToggleExpanded,
  variant,
  loading = false,
}: SectionListProps) {
  const rowRefs = useRef<(HTMLLIElement | null)[]>([])

  // 방향키로 옮긴 포커스를 실제 DOM 포커스와 스크롤에 반영한다. 이 effect는 포커스만
  // 다루고 커서를 쓰지 않는다 — 여기서 setCursor를 부르면 1차 게이트가 깨진다.
  useEffect(() => {
    if (!expanded || loading) return
    const row = rowRefs.current[focusedIndex]
    if (row !== null && row !== undefined && document.activeElement !== row) {
      const list = row.closest('[role="listbox"]')
      if (list !== null && list.contains(document.activeElement)) row.focus()
    }
  }, [focusedIndex, expanded, loading])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLUListElement>) => {
      const last = items.length - 1
      if (last < 0) return

      let next: number | null = null
      if (event.key === 'ArrowDown') next = Math.min(focusedIndex + 1, last)
      else if (event.key === 'ArrowUp') next = Math.max(focusedIndex - 1, 0)
      else if (event.key === 'Home') next = 0
      else if (event.key === 'End') next = last
      else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        // 실패 행은 1차 방어로 여기서 막는다(리듀서 거부가 2차 방어)
        if (items[focusedIndex]?.failed !== true) onSelect(focusedIndex)
        return
      }

      if (next === null) return
      event.preventDefault()
      onFocusMove(next)
    },
    [items, focusedIndex, onFocusMove, onSelect],
  )

  // full-width(WebGL 미지원 대체 화면)에서는 폭을 잡지 않고 셸이 주는 만큼 쓴다
  const width =
    variant === 'full-width' ? undefined : expanded ? PANEL_WIDTH_PX : RAIL_WIDTH_PX

  return (
    <section
      className="flex min-h-0 flex-1 flex-col border-r"
      style={{
        borderColor: 'var(--color-border)',
        ...(width === undefined ? {} : { width }),
      }}
      aria-labelledby={HEADING_ID}
      data-testid="section-list"
      data-expanded={expanded}
      data-variant={variant}
    >
      {/*
        토글과 제목은 접힘·펼침에서 **같은 DOM 위치**에 둔다. 상태별로 다른 트리를 그리면
        React가 노드를 갈아치워 토글에 있던 포커스가 사라진다 — a11y-responsive는
        "토글로 DOM을 갱신한 뒤에도 같은 버튼으로 포커스를 복원한다"를 요구한다.
      */}
      <div
        className={
          expanded
            ? 'flex shrink-0 items-center gap-2 border-b px-3 py-2'
            : 'flex shrink-0 flex-col items-center gap-2 border-b px-1 py-2'
        }
        style={{ borderColor: 'var(--color-border)' }}
      >
        {onToggleExpanded !== undefined && (
          <button
            type="button"
            onClick={onToggleExpanded}
            aria-expanded={expanded}
            aria-controls={LIST_ID}
            data-testid="section-list-toggle"
            className="shrink-0 rounded-[4px] border py-1 text-[12px]"
            style={{
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-primary)',
              // 56px 레일에서 "펼치기"가 두 줄로 접히지 않게 한다
              whiteSpace: 'nowrap',
              paddingInline: expanded ? 8 : 4,
            }}
          >
            {expanded ? '접기' : '펼치기'}
          </button>
        )}
        {/*
          접힘 레일에도 제목을 남긴다(component-spec §측면 접기 계약 — "세로 제목과 펼치기
          버튼만 남기고"). 56px 폭에서 가로로 두면 밀려나 사라지므로 세로쓰기로 세운다.
          같은 DOM 노드를 유지해야 토글 포커스가 보존되므로 노드를 갈지 않고 스타일만 바꾼다.
        */}
        <h2
          id={HEADING_ID}
          className="font-semibold"
          style={
            expanded
              ? { fontSize: 14 }
              : {
                  writingMode: 'vertical-rl',
                  fontSize: 12,
                  lineHeight: 1.2,
                  whiteSpace: 'nowrap',
                  color: 'var(--color-text-secondary)',
                }
          }
        >
          구간 목록
        </h2>
        {expanded && !loading && (
          <span
            className="tabular ml-auto text-[12px]"
            style={{ color: 'var(--color-text-secondary)' }}
            data-testid="section-list-count"
          >
            {items.length}개 구간
          </span>
        )}
      </div>

      {expanded &&
        (loading ? (
          <ul className="min-h-0 flex-1 overflow-y-auto p-2" aria-busy="true" id={LIST_ID}>
            {Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <li
                key={index}
                className="mb-1 h-8 animate-pulse rounded-[4px]"
                style={{ background: 'var(--color-bg-raised)' }}
              />
            ))}
          </ul>
        ) : (
          <ul
            id={LIST_ID}
            role="listbox"
            aria-labelledby={HEADING_ID}
            tabIndex={-1}
            onKeyDown={handleKeyDown}
            className="min-h-0 flex-1 overflow-y-auto py-1"
            data-testid="section-list-box"
          >
            {items.map((item) => {
              const selected = item.index === currentIndex
              const disabled = item.failed === true
              return (
                <li
                  key={item.id}
                  ref={(node) => {
                    rowRefs.current[item.index] = node
                  }}
                  role="option"
                  aria-selected={selected}
                  aria-disabled={disabled || undefined}
                  // roving tabindex — 목록 전체가 Tab stop 하나다(WAI-ARIA APG 컴포지트)
                  tabIndex={item.index === focusedIndex ? 0 : -1}
                  data-testid={`section-row-${item.index}`}
                  data-kind={item.segmentKind}
                  onFocus={() => onFocusMove(item.index)}
                  onClick={() => {
                    if (!disabled) onSelect(item.index)
                  }}
                  className="flex cursor-pointer items-baseline gap-2 px-3 py-1.5 text-[13px]"
                  style={{
                    background: disabled
                      ? 'var(--color-fail-segment)'
                      : selected
                        ? 'var(--color-bg-raised)'
                        : undefined,
                    color: disabled ? 'var(--color-text-primary)' : undefined,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                  }}
                >
                  <span
                    className="tabular shrink-0"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {item.index + 1}
                  </span>
                  <span className="shrink-0 font-medium">{item.pieceType}</span>
                  <span style={{ color: 'var(--color-text-secondary)' }}>
                    {segmentKindLabel(item.segmentKind)}
                  </span>
                  {item.unsupportedLabel !== undefined && (
                    <span className="ml-auto text-[12px]" style={{ color: 'var(--color-warning)' }}>
                      {item.unsupportedLabel}
                    </span>
                  )}
                  {/* 색 단독 금지 — 왜 못 고르는지 텍스트로도 남긴다 */}
                  {disabled && (
                    <span className="sr-only">
                      {item.unplacedReason === 'unsupported'
                        ? '끝점을 알 수 없어 순서에 자리가 없습니다'
                        : '연결 실패로 접근 불가'}
                    </span>
                  )}
                  <span className="sr-only">{rowLabel(item, items.length)}</span>
                </li>
              )
            })}
          </ul>
        ))}
    </section>
  )
}
