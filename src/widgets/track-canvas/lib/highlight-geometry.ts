// FEAT-019 — 공유 커서가 가리키는 구간을 3D 씬에서 짚는 버퍼.
//
// **왜 별도 버퍼인가**: `buildTrackGeometries`는 색 단위로 면을 합친다 — 면 396개를 색
// 종류(≤8)만큼의 draw call로 줄이는 것이 그 합침의 목적이다(`track-geometry.ts` 머리말).
// 그래서 씬에는 "세그먼트 하나"라는 렌더 단위가 존재하지 않는다. 구간 하나만 다르게
// 보이게 하려면 합친 버퍼를 도로 쪼개거나(합침의 목적을 되돌린다) 그 구간분만 따로 세워
// 얹어야 한다. 후자를 고른다 — 커서가 바뀔 때 다시 만드는 것이 전체가 아니라 132분의
// 1이고, **원본 표면색이 손대지 않은 채 남는다**(design-system §1: 하이라이트는 덧칠이지
// 치환이 아니다. 치환하면 그 구간에서 편집기 원본색 대조가 사라진다).
//
// 면은 기존 `buildTrackGeometries`를 그대로 재사용한다. 같은 삼각형 배치 로직을 여기에
// 다시 쓰면 두 곳이 답을 달리할 수 있고, 그때 어긋나는 것은 "하이라이트가 트랙 위에
// 정확히 얹혔는가"다.
import { BufferAttribute, BufferGeometry } from 'three'

import type { BandPoint, LaneBand, SegmentBands } from './lane-bands'
import { buildTrackGeometries } from './track-geometry'

/** 면 오버레이를 노면 위로 띄우는 높이(cm). 0이면 z-fighting으로 하이라이트가 깜빡인다 */
export const HIGHLIGHT_SURFACE_LIFT_CM = 0.6

/** 윤곽선은 면보다 더 띄운다 — 같은 높이면 자기 오버레이 안에 파묻혀 형태 채널이 사라진다 */
export const HIGHLIGHT_OUTLINE_LIFT_CM = 1.4

/** `buildTrackGeometries`가 색으로 묶을 때 쓰는 임의 키. 실제 색은 렌더가 정한다 */
const SINGLE_BUCKET = 'highlight'

export interface HighlightGeometry {
  /** 레인 면을 덮는 반투명 오버레이 */
  surface: BufferGeometry
  /** 구간 **바깥 둘레**의 선분 쌍 목록 */
  outline: BufferGeometry
}

function liftPoints(points: readonly BandPoint[], lift: number): BandPoint[] {
  return points.map((point) => ({ x: point.x, y: point.y + lift, z: point.z }))
}

function liftBand(band: SegmentBands, lift: number): SegmentBands {
  const lanes: LaneBand[] = band.lanes.map((lane) => ({
    lane: lane.lane,
    lo: liftPoints(lane.lo, lift),
    hi: liftPoints(lane.hi, lift),
  }))
  return { ...band, lanes }
}

/**
 * 하이라이트할 구간이 렌더 가능한가. 미지원 피스는 레인이 없고(`buildLaneBands`가 폭을
 * 지어내지 않는다) 표본이 하나뿐인 레인은 면이 되지 않는다.
 */
export function isHighlightable(band: SegmentBands | null | undefined): band is SegmentBands {
  if (band === null || band === undefined) return false
  return band.lanes.some((lane) => Math.min(lane.lo.length, lane.hi.length) >= 2)
}

/**
 * 구간의 **바깥 둘레**. `boundaryLinesOf`와 다른 것을 묻는다 — 그쪽은 레인 사이 경계까지
 * 포함하는 형태 축(색 단독 구분 금지)이고, 여기는 "이 구간이 어디서 시작해 어디서
 * 끝나는가"의 테두리다. 레인 사이 선까지 그리면 하이라이트가 트랙 무늬와 섞인다.
 *
 * 맞붙은 레인은 바깥 둘 (첫 레인의 `lo`와 마지막 레인의 `hi`)이 곧 둘레다. 명시 경로로
 * 따로 놓인 레인(FEAT-018)은 서로 맞붙지 않으므로 레인마다 자기 둘레를 갖는다.
 */
export function outerRingsOf(band: SegmentBands): { lo: BandPoint[]; hi: BandPoint[] }[] {
  const usable = band.lanes.filter((lane) => Math.min(lane.lo.length, lane.hi.length) >= 2)
  if (usable.length === 0) return []
  if (band.separated) return usable.map((lane) => ({ lo: [...lane.lo], hi: [...lane.hi] }))

  const first = usable[0]!
  const last = usable[usable.length - 1]!
  return [{ lo: [...first.lo], hi: [...last.hi] }]
}

function pushSegment(target: number[], a: BandPoint, b: BandPoint) {
  target.push(a.x, a.y, a.z, b.x, b.y, b.z)
}

/**
 * 둘레를 **닫힌 고리**로 낸다 — 양 옆 두 줄에 진입·진출 마구리 두 줄을 더한다. 마구리가
 * 없으면 구간의 시작과 끝이 열려 있어 어디까지가 이 구간인지가 화면에서 끊기지 않는다.
 */
export function buildHighlightOutline(band: SegmentBands): BufferGeometry {
  const lifted = liftBand(band, HIGHLIGHT_OUTLINE_LIFT_CM)
  const positions: number[] = []

  for (const ring of outerRingsOf(lifted)) {
    const count = Math.min(ring.lo.length, ring.hi.length)
    for (let index = 0; index + 1 < count; index += 1) {
      pushSegment(positions, ring.lo[index]!, ring.lo[index + 1]!)
      pushSegment(positions, ring.hi[index]!, ring.hi[index + 1]!)
    }
    pushSegment(positions, ring.lo[0]!, ring.hi[0]!)
    pushSegment(positions, ring.lo[count - 1]!, ring.hi[count - 1]!)
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  return geometry
}

/** 레인 면을 덮는 오버레이. 삼각형 배치는 `buildTrackGeometries`가 정본이다 */
export function buildHighlightSurface(band: SegmentBands): BufferGeometry {
  const [bucket] = buildTrackGeometries([liftBand(band, HIGHLIGHT_SURFACE_LIFT_CM)], () => SINGLE_BUCKET)
  return bucket?.geometry ?? new BufferGeometry()
}

export function buildHighlightGeometry(band: SegmentBands): HighlightGeometry {
  return { surface: buildHighlightSurface(band), outline: buildHighlightOutline(band) }
}
