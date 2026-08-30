// 세그먼트 표본을 리본 지오메트리로 만든다. 선언적 트리 안에서 **지오메트리 생성만**
// 명령형으로 두는 하이브리드(tech-stack Architecture Decisions)의 그 명령형 부분이다.
import { BufferAttribute, BufferGeometry } from 'three'

import type { SceneSegment } from './scene-layout'

/** 레인 수와 레인 폭 — 픽셀 측정으로 확정됐다(D-034 · PC-008, B-001 닫힘) */
export const LANE_COUNT = 3
export const LANE_PITCH_CM = 12

/**
 * 리본 반폭. **1 px = 1 cm이므로 편집기 px가 곧 cm다**(PC-008: 레인 폭 12px ·
 * `l` = 레인수 × 레인길이가 직선 6종 전부 일치 · 타미야 실물 11.5cm와 4% 이내).
 *
 * 종전 값은 `6`(전폭 12cm)이었고 주석은 "px↔cm 배율이 미해결이라 환산할 수 없다"고 적고
 * 있었다. **그 전제가 낡은 것이었다** — B-001은 이미 닫혔는데 그 정정이 정본에 도달하지
 * 않아(`piece-geometry.md` §좌표 계약이 "미해결"이라 적은 채였다) 구현이 미해결을 그대로
 * 인코딩했고, 트랙이 확정 폭의 **3분의 1**로 그려지고 있었다(2026-08-30 발견).
 *
 * 레인을 **면**으로 나눠 그리는 것은 FEAT-008이 소유한다 — 여기서는 전폭 리본만 만든다.
 */
export const TRACK_HALF_WIDTH_PX = (LANE_COUNT * LANE_PITCH_CM) / 2

/**
 * 뱅크의 **횡방향 기울기(roll)는 넣지 않는다.** `ElevatedSegment`는 진행축 높이만 담고
 * (`heightAt`/`slopeAt`) 판의 횡경사는 어디에도 없다 — 없는 데이터를 그럴듯하게 채우면
 * 화면이 실측처럼 보이는 추정을 하게 된다(제품 계약 §정직성). 리본은 수평면 법선으로만
 * 편다.
 */
export function buildSegmentGeometry(segment: SceneSegment): BufferGeometry {
  const { points } = segment
  const geometry = new BufferGeometry()
  if (points.length < 2) return geometry

  const positions = new Float32Array(points.length * 2 * 3)

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    const prev = points[Math.max(index - 1, 0)]
    const next = points[Math.min(index + 1, points.length - 1)]
    if (point === undefined || prev === undefined || next === undefined) continue

    const dx = next.x - prev.x
    const dz = next.z - prev.z
    const length = Math.hypot(dx, dz)
    // 진행 방향이 수평면에서 0이면(수직 낙하·미지원 피스) 옆으로 펼 방향이 없다
    const nx = length === 0 ? 0 : (-dz / length) * TRACK_HALF_WIDTH_PX
    const nz = length === 0 ? 0 : (dx / length) * TRACK_HALF_WIDTH_PX

    const base = index * 6
    positions[base] = point.x - nx
    positions[base + 1] = point.y
    positions[base + 2] = point.z - nz
    positions[base + 3] = point.x + nx
    positions[base + 4] = point.y
    positions[base + 5] = point.z + nz
  }

  const indices: number[] = []
  for (let index = 0; index + 1 < points.length; index += 1) {
    const a = index * 2
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }

  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}
