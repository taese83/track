// FEAT-010 순수 축 — 무엇이 어떤 등급으로 나열되는가.
//
// 화면 축(e2e)은 "배지가 보이는가"를 보고, 여기서는 **목록이 상류 태그와 1:1인가**
// (TC-010-3)와 값이 상수 복사가 아니라 프로파일에서 나오는가를 수치로 잰다.
import { describe, expect, it } from 'vitest'

import type { ElevatedSegment } from '@/entities/track/lib/elevation'
import type { EvidenceGrade } from '@/shared/ui/EvidenceBadge/EvidenceBadge'

import { buildEvidenceRows, buildTotalsRows } from './evidence-summary'

/** 최급경사가 `peakDeg`인 삼각 프로파일. 양 끝 0, 가운데 최대 — 전이곡선과 같은 모양이다 */
function segmentWith(
  tags: { field: string; grade: EvidenceGrade }[],
  peakDeg: number,
  order = 0,
): ElevatedSegment {
  const peak = Math.tan((peakDeg * Math.PI) / 180)
  return {
    pieceId: `p${order}`,
    pieceClass: 'Bri1',
    order,
    elevationProfile: {
      kind: 'sCurve',
      heightAt: () => 0,
      slopeAt: (t: number) => peak * (1 - Math.abs(2 * t - 1)),
    },
    absoluteElevationStart: 0,
    absoluteElevationEnd: 0,
    evidenceGrade: tags,
    isSupported: true,
  }
}

describe('buildEvidenceRows', () => {
  it('상류가 태깅한 field를 하나도 빠뜨리지 않는다 (TC-010-3 1:1)', () => {
    const rows = buildEvidenceRows([
      segmentWith([{ field: 'slopeAngleDeg', grade: 'confirmed' }, { field: 'colorRule', grade: 'measured' }], 20, 0),
      segmentWith([{ field: 'bankAngleDeg', grade: 'measured' }], 20, 1),
    ])

    expect(rows.map((r) => r.field).sort()).toEqual(['bankAngleDeg', 'colorRule', 'slopeAngleDeg'])
  })

  it('태그가 없으면 행도 없다 — 없는 근거를 지어내지 않는다', () => {
    expect(buildEvidenceRows([segmentWith([], 0)])).toEqual([])
  })

  it('각도를 상수로 복사하지 않고 프로파일에서 미분해 얻는다', () => {
    // 끝점만 보면 0°다. 구간을 훑어야 최급경사가 나온다.
    const rows = buildEvidenceRows([segmentWith([{ field: 'bankAngleDeg', grade: 'measured' }], 20)])
    expect(rows[0]?.value).toBe('20.0°')

    // 상류가 각도를 바꾸면 화면도 따라 움직인다(D-042가 22°→20°로 바꾼 것과 같은 상황)
    const changed = buildEvidenceRows([segmentWith([{ field: 'bankAngleDeg', grade: 'measured' }], 14)])
    expect(changed[0]?.value).toBe('14.0°')
  })

  it('같은 field에 등급이 섞이면 가장 낮은 등급으로 접는다', () => {
    const rows = buildEvidenceRows([
      segmentWith([{ field: 'slopeAngleDeg', grade: 'measured' }], 20, 0),
      segmentWith([{ field: 'slopeAngleDeg', grade: 'inferred' }], 20, 1),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.grade).toBe('inferred')
  })

  it('각도가 아닌 field에는 수치를 붙이지 않는다', () => {
    const rows = buildEvidenceRows([segmentWith([{ field: 'colorRule', grade: 'measured' }], 20)])
    expect(rows[0]?.value).toBe('팔레트 인덱스로 판정')
  })

  it('행 순서는 등급이 아니라 field로 고정한다 — 등급이 바뀌어도 자리가 안 움직인다', () => {
    const before = buildEvidenceRows([
      segmentWith([{ field: 'slopeAngleDeg', grade: 'measured' }], 20, 0),
      segmentWith([{ field: 'bankAngleDeg', grade: 'unknown' }], 20, 1),
    ])
    const after = buildEvidenceRows([
      segmentWith([{ field: 'slopeAngleDeg', grade: 'unknown' }], 20, 0),
      segmentWith([{ field: 'bankAngleDeg', grade: 'measured' }], 20, 1),
    ])
    expect(before.map((r) => r.field)).toEqual(after.map((r) => r.field))
  })
})

describe('buildTotalsRows', () => {
  it('피스 수는 정수 카운트라 확인 등급이다 (TC-010-5)', () => {
    const [pieces] = buildTotalsRows(132)
    expect(pieces).toEqual({
      field: 'totalPieceCount',
      label: '총 피스 수',
      value: '132피스',
      grade: 'confirmed',
    })
  })

  it('총 길이는 절대 미터를 쓰지 않고 미확인으로 남긴다 (R2 · TC-010-5)', () => {
    const length = buildTotalsRows(132)[1]
    expect(length?.grade).toBe('unknown')
    // R2 — 절대 단위 표기 금지. "m"·"미터"가 값에 들어가면 안 된다.
    expect(length?.value).not.toMatch(/\bm\b|미터/)
    // 편집기 l이 파이프라인에 없으므로 수치를 만들어 붙이지 않는다
    expect(length?.value).not.toMatch(/\d/)
  })
})
