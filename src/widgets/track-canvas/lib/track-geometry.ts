// 레인 면·경계선을 three 버퍼로 만든다. 선언적 트리 안에서 **지오메트리 생성만** 명령형으로
// 두는 하이브리드(tech-stack Architecture Decisions)의 그 명령형 부분이다.
//
// 종전 `segment-geometry.ts`는 중심선 하나를 전폭 36cm 리본으로 폈다. FEAT-008이 레인을
// 면으로 나누면서 렌더 단위가 피스당 1개에서 **면 3개 + 경계선 4줄**로 늘었다 — 참조 트랙
// 기준 면 396개·경계선 528개다(piece-geometry.md 실측과 일치).
//
// **색이 같은 면은 하나의 버퍼로 합친다.** 면마다 mesh를 하나씩 두면 draw call이 900개를
// 넘어 FEAT-011이 손대기도 전에 예산을 깬다. 합치면 색 종류만큼(≤8)으로 줄고, 색은
// 세그먼트 단위 판정이라 합쳐도 정보가 사라지지 않는다.
import { BufferAttribute, BufferGeometry } from 'three'

import { boundaryLinesOf } from './lane-bands'
import type { BandPoint, SegmentBands } from './lane-bands'
import { MARKER_LIFT_CM, markerTriangles, placeMarkerPoint } from './marker-geometry'
import type { MarkerPlacement } from './marker-geometry'
import { placeholderEdges } from './unsupported-placeholder'
import type { UnsupportedPlaceholder } from './unsupported-placeholder'

export interface ColoredGeometry {
  color: string
  geometry: BufferGeometry
}

interface MeshAccumulator {
  positions: number[]
  indices: number[]
}

function pushBand(target: MeshAccumulator, lo: readonly BandPoint[], hi: readonly BandPoint[]) {
  const count = Math.min(lo.length, hi.length)
  if (count < 2) return

  const base = target.positions.length / 3
  for (let index = 0; index < count; index += 1) {
    const low = lo[index]!
    const high = hi[index]!
    target.positions.push(low.x, low.y, low.z, high.x, high.y, high.z)
  }
  for (let index = 0; index + 1 < count; index += 1) {
    const a = base + index * 2
    target.indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
}

function finish(accumulator: MeshAccumulator): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array(accumulator.positions), 3),
  )
  geometry.setIndex(accumulator.indices)
  geometry.computeVertexNormals()
  return geometry
}

/**
 * @param colorOf 세그먼트 순서와 레인 번호로 표면색을 정한다. 가운데 레인 구분은 호출자가
 *   색으로 낸다 — 여기서 `filter`류의 후처리를 걸지 않는다(D-036 ⑤).
 */
export function buildTrackGeometries(
  bands: readonly SegmentBands[],
  colorOf: (band: SegmentBands, lane: number) => string,
): ColoredGeometry[] {
  const byColor = new Map<string, MeshAccumulator>()

  for (const band of bands) {
    for (const lane of band.lanes) {
      const color = colorOf(band, lane.lane)
      let accumulator = byColor.get(color)
      if (accumulator === undefined) {
        accumulator = { positions: [], indices: [] }
        byColor.set(color, accumulator)
      }
      pushBand(accumulator, lane.lo, lane.hi)
    }
  }

  return [...byColor.entries()].map(([color, accumulator]) => ({
    color,
    geometry: finish(accumulator),
  }))
}

/**
 * 경계선 전체를 선분 하나의 버퍼로 합친다. 색 단독 구분을 금지하는 REQ-NFR-003에 대해
 * 경계선은 **형태 축**이다 — 레인 세 개가 색만으로 갈리지 않게 한다.
 */
export function buildBoundaryGeometry(bands: readonly SegmentBands[]): BufferGeometry {
  const positions: number[] = []
  for (const band of bands) {
    for (const line of boundaryLinesOf(band)) {
      for (let index = 0; index + 1 < line.length; index += 1) {
        const a = line[index]!
        const b = line[index + 1]!
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z)
      }
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  return geometry
}

/**
 * FEAT-015 형태 채널 — 표식 전체를 버퍼 하나로 합친다. 참조 트랙에서 표식이 붙는 것은
 * 평지가 아닌 세그먼트뿐이라(슬로프·뱅크·웨이브·레인체인지·마커) 수십 개 규모다.
 */
export function buildMarkerGeometry(placements: readonly MarkerPlacement[]): BufferGeometry {
  const positions: number[] = []
  for (const placement of placements) {
    for (const triangle of markerTriangles(placement.shape)) {
      for (const point of triangle) {
        const world = placeMarkerPoint(placement, point)
        positions.push(world.x, world.y, world.z)
      }
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.computeVertexNormals()
  return geometry
}

/**
 * 뱅크의 파선 윤곽(형태 채널 보조). 바깥 두 가장자리만 쓴다 — 레인 경계선까지 파선으로
 * 만들면 파선이 트랙 전체를 덮어 "뱅크만 다르다"는 신호가 사라진다.
 *
 * `LineDashedMaterial`은 `computeLineDistances()`로 계산한 누적 거리를 읽는다 — 그것을
 * 부르지 않으면 파선이 실선으로 그려진다(조용한 실패).
 */
export function buildDashedOutlineGeometry(
  bands: readonly SegmentBands[],
  isDashed: (band: SegmentBands) => boolean,
): BufferGeometry {
  const positions: number[] = []
  for (const band of bands) {
    if (!isDashed(band) || band.lanes.length === 0) continue
    const edges = [band.lanes[0]!.lo, band.lanes[band.lanes.length - 1]!.hi]
    for (const edge of edges) {
      for (let index = 0; index + 1 < edge.length; index += 1) {
        const a = edge[index]!
        const b = edge[index + 1]!
        // 표면과 같은 높이면 z-fighting이 인다 — 표식과 같은 만큼 띄운다
        positions.push(a.x, a.y + MARKER_LIFT_CM, a.z, b.x, b.y + MARKER_LIFT_CM, b.z)
      }
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  return geometry
}


/**
 * FEAT-009 — 미지원 피스의 와이어프레임. 전부를 선분 하나의 버퍼로 합친다.
 *
 * 면이 아니라 **선**인 것이 요구다(TC-009-1) — 채워 그리면 "여기 트랙이 있다"로 읽히고,
 * 뚫린 상자는 "무언가 있는데 그릴 수 없다"를 말한다.
 */
export function buildPlaceholderGeometry(
  placeholders: readonly UnsupportedPlaceholder[],
): BufferGeometry {
  const positions: number[] = []
  for (const placeholder of placeholders) {
    for (const [a, b] of placeholderEdges(placeholder)) {
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  return geometry
}
