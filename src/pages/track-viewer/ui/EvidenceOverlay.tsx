// FEAT-010 — 3D 뷰 위 근거 등급 오버레이. 마운트를 이 티켓이 소유한다(FEAT-006이 세우고
// FEAT-013이 따른 규칙: 각 화면 상태의 마운트는 그 상태를 만드는 FEAT가 소유한다).
//
// **정렬 레이어가 이 파일의 핵심이다.** TC-010-1·2·4가 전부 "범례를 개폐해도 트리거의
// 중심 X가 그대로인가"를 본다. 중앙축을 폭이 변하는 요소(패널)에게 맡기면 개폐할 때마다
// 축이 흔들리므로, **폭이 절대 변하지 않는 바깥 레이어**(캔버스 전체 폭)가 축을 소유하고
// `justify-items: center`로 자식을 건다. 그러면 패널이 몇 줄이 되든 트리거 중심 X는 불변이다.
import { Legend } from '@/shared/ui/legend/Legend'
import type { LegendItem } from '@/shared/ui/legend/Legend'
import { EvidenceBadge } from '@/shared/ui/EvidenceBadge/EvidenceBadge'
import type { ElevatedSegment } from '@/entities/track/lib/elevation'

import { buildEvidenceRows, buildTotalsRows } from '../lib/evidence-summary'
import type { EvidenceRow } from '../lib/evidence-summary'

/**
 * 범례는 등급 4종을 **모두** 싣는다 — 화면에 지금 그 등급이 하나도 없어도 그렇다.
 * 범례는 데이터가 아니라 읽는 법이고, "이 화면에 추정이 없다"는 사실 자체가
 * 4종을 다 보여줘야 읽힌다.
 */
const LEGEND_ITEMS: LegendItem[] = [
  { key: 'rise', label: '상승', icon: 'arrow-up' },
  { key: 'fall', label: '하강', icon: 'arrow-down' },
  { key: 'measured', label: '실측 — 원문·픽셀 측정', icon: 'badge-outline' },
  { key: 'confirmed', label: '확인 — 사용자 지정 렌더 규칙', icon: 'badge-outline' },
  { key: 'inferred', label: '추정 — 근거가 갈리는 값', icon: 'badge-outline' },
  { key: 'unknown', label: '미확인 — 해소되지 않음', icon: 'badge-outline' },
]

function EvidenceRowItem({ row }: { row: EvidenceRow }) {
  return (
    <span
      data-testid={`evidence-row-${row.field}`}
      data-grade={row.grade}
      className="inline-flex items-center gap-2 text-[12px] whitespace-nowrap"
      style={{ color: 'var(--color-text-secondary)' }}
    >
      <span>{row.label}</span>
      <span style={{ color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
        {row.value}
      </span>
      <EvidenceBadge grade={row.grade} />
    </span>
  )
}

export interface EvidenceOverlayProps {
  elevated: readonly ElevatedSegment[]
  totalPieceCount: number
}

export function EvidenceOverlay({ elevated, totalPieceCount }: EvidenceOverlayProps) {
  const rows = [...buildEvidenceRows(elevated), ...buildTotalsRows(totalPieceCount)]

  return (
    // 정렬 레이어: 캔버스 전체 폭을 덮되 클릭은 삼키지 않는다(pointer-events:none).
    // `align-content:end`로 스택을 아래에 붙여 두면 패널이 펼쳐질 때 위로 자라므로
    // 캔버스 밖으로 넘치지 않는다 — 트리거의 Y는 움직여도 **X는 그대로**다.
    <div
      data-testid="evidence-overlay"
      className="pointer-events-none absolute inset-0 grid justify-items-center gap-2 p-3"
      style={{ alignContent: 'end' }}
    >
      <div
        data-testid="evidence-totals"
        className="pointer-events-auto flex max-w-full flex-wrap justify-center gap-x-4 gap-y-2 rounded-[6px] border px-3 py-2"
        style={{
          borderColor: 'var(--color-border)',
          // 캔버스 오버레이 계약(design-system §4) — 불투명도 ≥0.88
          background: 'color-mix(in srgb, var(--color-bg-surface) 92%, transparent)',
        }}
      >
        {rows.map((row) => (
          <EvidenceRowItem key={row.field} row={row} />
        ))}
      </div>

      <Legend items={LEGEND_ITEMS} />
    </div>
  )
}
