// FEAT-015 형태 채널의 순수 축 — 표식이 **실제로 서로 다른 모양인가**.
// "색을 지워도 형태로 갈린다"는 화면을 봐서는 확인할 수 없다.
import { describe, expect, it } from 'vitest'

import { markerOutline, markerTriangles, placeMarkerPoint } from './marker-geometry'
import type { MarkerShape } from './segment-encoding'

const SHAPES: MarkerShape[] = ['arrow-up', 'arrow-down', 'diamond', 'wave', 'fork', 'flag']

describe('TC-015-1 — 유형마다 표식 모양이 다르다', () => {
  it('여섯 모양의 외곽선이 서로 겹치지 않는다', () => {
    const signatures = SHAPES.map((shape) => JSON.stringify(markerOutline(shape)))
    expect(new Set(signatures).size).toBe(SHAPES.length)
  })

  it('모든 모양이 면을 이룬다 — 삼각형이 하나 이상이다', () => {
    for (const shape of SHAPES) {
      expect(markerTriangles(shape).length).toBeGreaterThan(0)
    }
    expect(markerTriangles('none')).toEqual([])
  })

  it('상승·하강 화살표는 앞뒤가 뒤집힌 같은 삼각형이다', () => {
    const up = markerOutline('arrow-up')
    const down = markerOutline('arrow-down')
    expect(down).toEqual(up.map(([forward, side]) => [-forward, side]))
    // 좌우는 그대로여야 한다 — 좌우까지 뒤집으면 같은 모양이 되어 방향이 사라진다
    expect(down.map(([, side]) => side)).toEqual(up.map(([, side]) => side))
  })
})

describe('표식은 진행축에 정렬한다', () => {
  const placement = { x: 100, y: 10, z: 200, headingRad: 0, shape: 'arrow-up' as MarkerShape }

  it('heading 0이면 앞이 +x다', () => {
    const tip = placeMarkerPoint(placement, [1, 0], 10)
    expect(tip.x).toBeCloseTo(110, 6)
    expect(tip.z).toBeCloseTo(200, 6)
  })

  it('heading 90°면 앞이 +z다 — 카메라가 돌아도 뜻이 유지된다', () => {
    const tip = placeMarkerPoint({ ...placement, headingRad: Math.PI / 2 }, [1, 0], 10)
    expect(tip.x).toBeCloseTo(100, 6)
    expect(tip.z).toBeCloseTo(210, 6)
  })

  it('표면 위로 띄운다 — 0이면 z-fighting으로 깜빡인다', () => {
    expect(placeMarkerPoint(placement, [0, 0], 10).y).toBeGreaterThan(placement.y)
  })

  it('좌우축은 진행축의 법선이다', () => {
    const side = placeMarkerPoint(placement, [0, 1], 10)
    expect(side.x).toBeCloseTo(100, 6)
    expect(side.z).toBeCloseTo(210, 6)
  })
})
