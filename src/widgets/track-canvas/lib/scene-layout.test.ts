// TC-006-1 — 배치가 도면과 일치하는가.
//
// 검증 방식은 **왕복(round-trip)**이다: 렌더에 실제로 넘기는 표본 좌표에서 편집기 좌표
// 계약(`position + rotate(offset, angleDeg)`)을 역으로 풀어 피스 position을 되찾고, 원본
// `x, y`와 대조한다. 우리가 넣은 값을 그대로 읽어 비교하면 통과가 보장된 프록시가 되므로
// 그렇게 하지 않는다 — 이 경로는 방향 배정(`orientPath`)·원호 복원(`buildPiecePath`)·
// 축 대응·고도 합성을 전부 통과한 뒤의 좌표다.
//
// 접선각은 표본에서 직접 재고, 코너가 거울상이 되면(PC-009에서 실제로 겪은 결함) 끝점은
// 그대로여도 이음매 접선이 크게 어긋나므로 여기서 걸린다.
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { orientPath } from '@/entities/track/lib/elevation'
import { buildElevatedSegments } from '@/entities/track/lib/elevation'
import { lookupPieceOffsets } from '@/entities/track/lib/parse'
import { parseTrackString } from '@/entities/track/lib/parse'
import { restoreOrder } from '@/entities/track/lib/restore'
import type { ParsedPiece } from '@/entities/track/model/types'
import { extractUpstreamVars } from '@/shared/lib/track/extract-upstream-vars'

import { buildSceneLayout } from './scene-layout'
import type { SceneSegment } from './scene-layout'

const RAD = Math.PI / 180

// REQ-F-001 — 바운딩박스 대각선으로 정규화한 상대좌표 오차
const POSITION_TOLERANCE_RATIO = 0.005
// REQ-F-002 — 인접 세그먼트 이음매의 접선각
const TANGENT_TOLERANCE_DEG = 1
// FEAT-003·FEAT-004가 같은 값을 쓴다(정상 이음새 실측 최대 0.1695px, 매달린 끝 22.33px)
const SEAM_GAP_TOLERANCE_PX = 1
// 참조 트랙의 매달린 끝 한 쌍(validate-closure 주석의 실측 31.67px)
const DANGLING_END_GAP_PX = 32

async function orientedReferenceTrack(fixture: string) {
  const body = await readFile(path.resolve(process.cwd(), 'fixtures/track', fixture), 'utf8')
  const extracted = extractUpstreamVars(body)
  if (!extracted.ok) throw new Error(`${fixture} 추출 실패`)
  const parsed = parseTrackString(extracted.text, extracted.compat)
  if (!parsed.ok) throw new Error(`${fixture} 파싱 실패`)
  const restored = restoreOrder(parsed.pieces)
  if (!restored.ok) throw new Error(`${fixture} 순서 복원 실패`)

  const byId = new Map(parsed.pieces.map((piece) => [piece.pieceId, piece]))
  const ordered: ParsedPiece[] = []
  for (const pieceId of restored.orderedPieceIds) {
    const found = byId.get(pieceId)
    if (found !== undefined) ordered.push(found)
  }

  const oriented = orientPath(ordered)
  const elevated = buildElevatedSegments(oriented).segments
  return { oriented, elevated, pieceCount: parsed.pieces.length }
}

function rotate(point: { x: number; y: number }, angleDeg: number) {
  const theta = angleDeg * RAD
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos }
}

/** 표본의 진입점에서 편집기 좌표 계약을 역으로 풀어 되찾은 피스 position */
function recoveredPosition(segment: SceneSegment, piece: ParsedPiece, flipped: boolean) {
  const entry = segment.points[0]
  const offsets = lookupPieceOffsets(piece.pieceClass)
  if (entry === undefined || offsets === undefined) return null

  const local = flipped ? offsets.vertex2 : offsets.vertex1
  const rotated = rotate(local, piece.angleDeg)
  return { x: entry.x - rotated.x, y: entry.z - rotated.y }
}

/** 두 각도의 최소 차이(도). ±180° 경계를 넘어도 실제 벌어짐만 잰다 */
function angleDeltaDeg(a: number, b: number): number {
  let delta = (a - b) / RAD
  while (delta > 180) delta -= 360
  while (delta < -180) delta += 360
  return Math.abs(delta)
}

describe('TC-006-1 — 세그먼트 배치가 원본 도면과 일치한다', () => {
  it('참조 트랙 132피스의 정규화 상대좌표 오차가 ±0.5% 이내다 (REQ-F-001)', async () => {
    const { oriented, elevated, pieceCount } = await orientedReferenceTrack('WS67Y2.js.txt')
    expect(pieceCount).toBe(132)

    const layout = buildSceneLayout({ oriented, elevated, truncated: false })
    expect(layout.segments).toHaveLength(132)
    expect(layout.bounds.diagonal).toBeGreaterThan(0)

    const errors = layout.segments.map((segment, index) => {
      const step = oriented[index]
      if (step === undefined) throw new Error(`경로 ${index} 누락`)
      const recovered = recoveredPosition(segment, step.piece, step.flipped)
      if (recovered === null) throw new Error(`${segment.pieceClass} 역산 불가`)
      return (
        Math.hypot(recovered.x - step.piece.x, recovered.y - step.piece.y) / layout.bounds.diagonal
      )
    })

    const worst = Math.max(...errors)
    // 실측 0.000000% — 도면 좌표를 그대로 얹고 새로 만들지 않기 때문이다
    console.log(`TC-006-1 위치 오차 최악 ${(worst * 100).toFixed(6)}%`)
    expect(worst).toBeLessThanOrEqual(POSITION_TOLERANCE_RATIO)
  })

  // 위 왕복만으로는 방향 배정이 통째로 뒤집혀도 통과한다 — 역산이 같은 `flipped`를 쓰기
  // 때문이다. 이음매 간격이 그 구멍을 닫는다: 방향이 하나라도 뒤집히면 그 자리에서
  // 세그먼트 길이만큼(수십 px) 벌어진다.
  it('이어붙인 세그먼트의 이음매가 실측 간격 안에서 닿는다', async () => {
    const { oriented, elevated } = await orientedReferenceTrack('WS67Y2.js.txt')
    const layout = buildSceneLayout({ oriented, elevated, truncated: false })

    const gaps = layout.segments.map((segment, index) => {
      const next = layout.segments[(index + 1) % layout.segments.length]
      const exit = segment.points[segment.points.length - 1]
      const entry = next?.points[0]
      if (exit === undefined || entry === undefined) throw new Error(`이음매 ${index} 누락`)
      return Math.hypot(exit.x - entry.x, exit.y - entry.y, exit.z - entry.z)
    })

    const open = gaps
      .map((gap, at) => ({ at, gap }))
      .filter((seam) => seam.gap > SEAM_GAP_TOLERANCE_PX)
    const closed = gaps.filter((gap) => gap <= SEAM_GAP_TOLERANCE_PX)

    console.log(
      `TC-006-1 이음매 ${gaps.length}개 — 닿은 것 최악 ${Math.max(...closed).toFixed(4)}px, ` +
        `벌어진 것 ${open.map((seam) => `#${seam.at} ${seam.gap.toFixed(4)}px`).join(', ') || '없음'}`,
    )

    // 참조 트랙에는 **매달린 끝이 한 쌍** 있고 FEAT-003의 D-038 ② 규칙이 그것을 이어 순서를
    // 만든다 — 실측 31.67px로 validate-closure 주석의 수치와 같다. 그 한 곳을 "닿았다"고
    // 적으면 데이터에 없는 폐합을 주장하게 되고, 전부 ≤1px을 요구하면 상류가 이미 실측해
    // 문서화한 사실과 충돌한다. 그래서 **개수를 1로 묶고 크기에 상한을 둔다** — 방향이
    // 하나라도 뒤집히면 벌어진 이음매가 여럿 생기므로 이 조건이 그것을 잡는다.
    expect(open).toHaveLength(1)
    expect(open[0]?.gap).toBeLessThanOrEqual(DANGLING_END_GAP_PX)
    expect(Math.max(...closed)).toBeLessThanOrEqual(SEAM_GAP_TOLERANCE_PX)
  })

  it('인접 세그먼트 이음매의 접선각 오차가 ±1° 이내다 (REQ-F-002)', async () => {
    const { oriented, elevated } = await orientedReferenceTrack('WS67Y2.js.txt')
    const layout = buildSceneLayout({ oriented, elevated, truncated: false })

    // 폐곡선이므로 마지막→처음 이음매도 검사 대상이다
    const seams = layout.segments.map((segment, index) => {
      const next = layout.segments[(index + 1) % layout.segments.length]
      if (next === undefined) throw new Error(`이음매 ${index} 누락`)
      return {
        at: index,
        pieceClass: segment.pieceClass,
        deltaDeg: angleDeltaDeg(segment.exitTangentRad, next.entryTangentRad),
      }
    })

    const worst = seams.reduce((acc, seam) => (seam.deltaDeg > acc.deltaDeg ? seam : acc), seams[0]!)
    console.log(
      `TC-006-1 접선각 오차 최악 ${worst.deltaDeg.toFixed(4)}° (이음매 ${worst.at}, ${worst.pieceClass} 뒤)`,
    )
    expect(worst.deltaDeg).toBeLessThanOrEqual(TANGENT_TOLERANCE_DEG)
  })
})
