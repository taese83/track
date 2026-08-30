// FEAT-010 보조 — 근거 등급/상승·하강 범례. 기본은 **접힘**이다(states.md).
//
// 이 컴포넌트의 어려운 부분은 목록이 아니라 **위치 안정성**이다. 패널을 펼치면 폭이
// 달라지는데, 트리거가 그 폭 안에서 좌측 시작점이나 flex 잔여 공간으로 배치돼 있으면
// 개폐할 때마다 트리거가 좌우로 튄다(TC-010-1·2·4가 전부 이 좌표를 본다). 해법은
// **중앙축을 폭이 변하지 않는 바깥 레이어가 소유하는 것**이다 — 이 파일은 루트도
// `justify-items: center`로 두어 트리거와 패널을 같은 축에 걸고, 자신은 콘텐츠 폭만
// 쓴다. 전체 폭을 차지하는 정렬 레이어는 소비자(캔버스 오버레이)가 제공한다.
import { useId, useState } from 'react'

import { EvidenceBadge } from '../EvidenceBadge/EvidenceBadge'
import type { EvidenceGrade } from '../EvidenceBadge/EvidenceBadge'

export interface LegendItem {
  key: 'rise' | 'fall' | EvidenceGrade
  label: string
  icon: 'arrow-up' | 'arrow-down' | 'badge-outline'
}

export interface LegendProps {
  items: LegendItem[]
  /** 기본 false(접힘) — states.md "근거등급 범례(접이식, 기본 접힘)" */
  defaultOpen?: boolean
}

const ARROW_GLYPH: Record<'arrow-up' | 'arrow-down', string> = {
  'arrow-up': '▲',
  'arrow-down': '▼',
}

const ARROW_COLOR: Record<'rise' | 'fall', string> = {
  rise: 'var(--color-rise-fg)',
  fall: 'var(--color-fall-fg)',
}

function isGrade(key: LegendItem['key']): key is EvidenceGrade {
  return key !== 'rise' && key !== 'fall'
}

function LegendKey({ item }: { item: LegendItem }) {
  // 등급 항목은 배지 자체를 그린다 — 범례가 실제 화면 배지와 다른 표본을 보여주면
  // 대조표로서 쓸모가 없다(TC-010-3이 요구하는 1:1 대조의 기준면).
  if (isGrade(item.key)) return <EvidenceBadge grade={item.key} />
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center text-[12px]"
      style={{ minWidth: 56, color: ARROW_COLOR[item.key] }}
    >
      {ARROW_GLYPH[item.icon === 'arrow-down' ? 'arrow-down' : 'arrow-up']}
    </span>
  )
}

export function Legend({ items, defaultOpen = false }: LegendProps) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()

  return (
    <div
      data-testid="legend-root"
      className="grid justify-items-center"
      // 정렬 레이어는 클릭을 삼키지 않기 위해 pointer-events:none이다. 실제 조작
      // 대상인 이 루트부터 다시 auto로 돌린다.
      style={{ pointerEvents: 'auto', maxWidth: '100%' }}
    >
      <button
        type="button"
        data-testid="legend-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="rounded-[6px] border px-3 py-1 text-[12px]"
        style={{
          borderColor: 'var(--color-border)',
          // 캔버스 오버레이 계약(design-system §4) — 불투명도 ≥0.88
          background: 'color-mix(in srgb, var(--color-bg-surface) 92%, transparent)',
          color: 'var(--color-text-secondary)',
          transition: 'background var(--duration-fast) ease',
        }}
      >
        범례 {open ? '접기' : '펼치기'}
      </button>

      <div
        id={panelId}
        data-testid="legend-panel"
        hidden={!open}
        // 패널 폭을 트리거의 좌측 시작점이나 flex 잔여 공간으로 계산하지 않는다. 자기
        // 콘텐츠로 폭을 정하고 중앙축에 걸리므로, 몇 개가 들어와도 트리거의 중심 X는
        // 그대로다. 320 CSS px·400% 확대에서 잘리지 않도록 줄바꿈을 허용한다.
        className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-2 rounded-[6px] border px-3 py-2"
        style={{
          maxWidth: '100%',
          borderColor: 'var(--color-border)',
          background: 'color-mix(in srgb, var(--color-bg-surface) 92%, transparent)',
          transition: 'opacity var(--duration-base) ease',
        }}
      >
        {items.map((item) => (
          <span
            key={item.key}
            className="inline-flex items-center gap-2 text-[12px]"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <LegendKey item={item} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  )
}
