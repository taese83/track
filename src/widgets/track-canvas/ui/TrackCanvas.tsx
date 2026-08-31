// FEAT-006 — 3D 씬과 오빗 카메라.
//
// 소유 범위는 **배치와 카메라**다. `component-spec`의 `TrackCanvasProps`가 함께 적은
// `currentIndex`/`onOrbitDepart`(공유 커서, FEAT-012·013) · `legendOpen`(FEAT-010)은
// 여기서 받지 않는다 — 구현 없는 prop을 미리 뚫으면 소비자가 동작한다고 읽는 죽은
// 표면이 된다. 각 소유자가 자기 티켓에서 더한다.
//
// `followMode`(FEAT-007)는 **prop이 아니라 위젯의 내부 상태**다. 켜고 끄는 주체가 이
// 위젯 위의 버튼이고 셸은 그 값을 쓸 데가 없으므로, prop으로 올리면 페이지가 중계만
// 하는 상태를 하나 더 갖는다. 지점 동기화는 prop이 아니라 공유 커서
// (`shared/lib/track-cursor`)로 한다 — 목록·스트립·캔버스가 이미 그 축을 쓰고 있어,
// 여기에 새 채널을 내면 같은 사실이 두 곳에 있게 된다.
//
// WebGL 지원 게이트도 여기 없다: `TrackCanvas`는 지원 확인 이후에만 마운트된다
// (component-spec §TrackCanvas, 게이트는 FEAT-014 소유).
import { Html, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentRef, KeyboardEvent } from 'react'
import { Spherical, Vector3 } from 'three'
import type { LineSegments } from 'three'

import type { ElevatedSegment } from '@/entities/track/lib/elevation'
import { useTrackCursor } from '@/shared/lib/track-cursor'

import {
  advanceFlythrough,
  buildFlythroughPath,
  distanceOfOrder,
  initialFlythroughState,
  jumpTo,
  orderAtDistance,
  poseAt,
  scrubTo,
  setPlaying,
} from '../lib/flythrough-camera'
import type { FlythroughPath, FlythroughState } from '../lib/flythrough-camera'
import { markFirstFrame, recordOrbitFrame, resetOrbitFps } from '../lib/perf-stats'
import { applyOrbitKey, initialOrbitFor, orbitLimitsFor } from '../lib/orbit-camera'
import type { OrbitState } from '../lib/orbit-camera'
import { buildLaneBands } from '../lib/lane-bands'
import type { SegmentBands } from '../lib/lane-bands'
import {
  buildBoundaryGeometry,
  buildDashedOutlineGeometry,
  buildMarkerGeometry,
  buildPlaceholderGeometry,
  buildTrackGeometries,
} from '../lib/track-geometry'
import type { MarkerPlacement } from '../lib/marker-geometry'
import { LARGE_TRACK_NOTICE } from '../lib/perf-mitigation'
import { markerShapeOf, segmentTextOf } from '../lib/segment-encoding'
import { laneSurfaceColorOf, surfaceColorOf } from '../lib/segment-appearance'
import type { SceneLayout } from '../lib/scene-layout'

/** 수직 화각. 초기 거리 계산(`initialOrbitFor`)과 같은 값을 써야 프레이밍이 맞는다 */
const CAMERA_FOV_DEG = 50

/** design-system tokens §2 `bg-canvas` — 순검정 금지(halation) */
const CLEAR_COLOR = '#101214'

type OrbitControlsRef = ComponentRef<typeof OrbitControls>

export interface TrackCanvasProps {
  layout: SceneLayout
  /** 표면색 판정에 쓴다. `SceneSegment.order`로 맞춘다 */
  elevated: readonly ElevatedSegment[]
}

/**
 * performance-budget §1의 측정 훅을 렌더 루프에 건다. 조작 중일 때만 프레임을 세는 것은
 * 정지 화면의 fps가 렌더 부하를 재지 않기 때문이다("회전/줌 드래그 중 5초 창").
 */
function PerfProbe({ orbiting }: { orbiting: { current: boolean } }) {
  const scene = useThree((state) => state.scene)

  // targets.md의 측정 지점 그대로다: "씬 첫 프레임 `onAfterRender` 콜백".
  // `Group`이 아니라 **Scene**에 걸어야 한다 — `WebGLRenderer.render()`가 프레임 끝에서
  // 부르는 것은 `scene.onAfterRender` 하나뿐이고, Group은 그려지는 객체가 아니라
  // 콜백이 영영 불리지 않는다(첫 시도에서 initialRenderMs가 수집되지 않은 원인).
  useEffect(() => {
    scene.onAfterRender = markFirstFrame
    return () => {
      scene.onAfterRender = () => {}
    }
  }, [scene])

  useFrame(() => {
    if (orbiting.current) recordOrbitFrame(performance.now())
  })
  return null
}

/** design-system tokens §2 대비 — 레인 경계선은 표면 위에서 읽히되 트랙을 덮지 않는다 */
const LANE_LINE_COLOR = '#E6E8EC'
const LANE_LINE_OPACITY = 0.45

/** 표식·파선은 어느 표면색 위에서도 읽혀야 한다 — 색 채널과 독립인 것이 형태 채널의 요건이다 */
const MARKER_COLOR = '#F2F4F8'

/** design-system tokens §2 `warning` — 미지원은 경고이지 트랙이 아니다 */
const PLACEHOLDER_COLOR = '#E8B339'

/** 세그먼트 가운데 레인의 중간 표본 — 표식과 라벨이 붙는 자리 */
function anchorOf(band: SegmentBands): { x: number; y: number; z: number } | null {
  const middle = band.lanes[Math.floor(band.lanes.length / 2)]
  if (middle === undefined || middle.lo.length === 0) return null
  const at = Math.floor(middle.lo.length / 2)
  const lo = middle.lo[at]
  const hi = middle.hi[at]
  if (lo === undefined || hi === undefined) return null
  return { x: (lo.x + hi.x) / 2, y: Math.max(lo.y, hi.y), z: (lo.z + hi.z) / 2 }
}

function TrackMesh({ layout, elevated }: TrackCanvasProps) {
  const elevatedByOrder = useMemo(
    () => new Map(elevated.map((segment) => [segment.order, segment])),
    [elevated],
  )

  // 지오메트리 생성만 명령형이다(tech-stack Architecture Decisions §React 통합 방식).
  // layout이 바뀔 때만 다시 만든다 — 매 프레임 만들면 BufferGeometry가 프레임마다 쌓인다.
  const scene = useMemo(() => {
    const bands = buildLaneBands(layout.segments)
    const byOrder = new Map(layout.segments.map((segment) => [segment.order, segment]))

    const surfaces = buildTrackGeometries(bands, (band, lane) =>
      laneSurfaceColorOf(
        surfaceColorOf(band.isSupported, byOrder.get(band.order)?.direction ?? 'none'),
        lane,
      ),
    )

    // FEAT-015 — 색 하나로 유형을 말하지 않는다. 형태(표식·파선)와 텍스트(라벨)를 더한다.
    const placements: MarkerPlacement[] = []
    const labels: { key: string; text: string; at: { x: number; y: number; z: number } }[] = []
    for (const band of bands) {
      const segment = byOrder.get(band.order)
      if (segment === undefined) continue
      // 유형·방향의 정본은 **배치 단계에서 판정해 `SceneSegment`에 실린 값**이다.
      // 여기서 클래스·색으로 다시 계산하면 두 곳이 답을 달리할 수 있다.
      if (segment.kind === 'plain') continue
      const anchor = anchorOf(band)
      if (anchor === null) continue

      placements.push({
        ...anchor,
        // 진입·진출 접선의 평균 — 코너에서도 표식이 트랙을 따라 눕는다
        headingRad: (segment.entryTangentRad + segment.exitTangentRad) / 2,
        shape: markerShapeOf(segment.kind, segment.direction),
      })
      labels.push({
        key: segment.pieceId,
        text: segmentTextOf(segment.kind, segment.direction),
        at: anchor,
      })
    }

    return {
      placeholders: buildPlaceholderGeometry(layout.unsupportedPlaceholders),
      placeholderLabels: layout.unsupportedPlaceholders,
      surfaces,
      boundaries: buildBoundaryGeometry(bands),
      markers: buildMarkerGeometry(placements),
      dashed: buildDashedOutlineGeometry(
        bands,
        (band) => byOrder.get(band.order)?.kind === 'bank',
      ),
      labels,
    }
  }, [layout, elevatedByOrder])

  // `LineDashedMaterial`은 누적 거리를 읽는다 — 계산하지 않으면 파선이 실선으로 그려진다
  const dashedRef = useRef<LineSegments>(null)
  useEffect(() => {
    dashedRef.current?.computeLineDistances()
  }, [scene])

  useEffect(
    () => () => {
      scene.surfaces.forEach((surface) => surface.geometry.dispose())
      scene.boundaries.dispose()
      scene.markers.dispose()
      scene.dashed.dispose()
      scene.placeholders.dispose()
    },
    [scene],
  )

  return (
    <group>
      {scene.surfaces.map((surface) => (
        <mesh key={surface.color} geometry={surface.geometry}>
          {/* 양면 렌더 — 레인 면은 두께가 없어 아래에서 보면 사라진다 */}
          <meshStandardMaterial color={surface.color} side={2} roughness={0.8} metalness={0} />
        </mesh>
      ))}

      {/*
        경계선은 색 단독 구분을 막는 **형태 축**이다(REQ-NFR-003). 면 위에 겹치므로
        `depthWrite`를 끄지 않으면 같은 깊이에서 z-fighting이 인다.
      */}
      <lineSegments geometry={scene.boundaries}>
        <lineBasicMaterial
          color={LANE_LINE_COLOR}
          transparent
          opacity={LANE_LINE_OPACITY}
          depthWrite={false}
        />
      </lineSegments>

      {/* FEAT-015 형태 채널 — 뱅크만 윤곽이 파선이다 */}
      <lineSegments ref={dashedRef} geometry={scene.dashed}>
        <lineDashedMaterial color={MARKER_COLOR} dashSize={6} gapSize={4} depthWrite={false} />
      </lineSegments>

      {/* FEAT-015 형태 채널 — 유형별 표식 */}
      <mesh geometry={scene.markers}>
        <meshBasicMaterial color={MARKER_COLOR} side={2} depthWrite={false} />
      </mesh>

      {/*
        FEAT-009 — 미지원 피스는 조용히 생략하지 않는다. 경로에 끼워 넣지 않고 자기 선언
        좌표에 와이어프레임을 세운다(끝점을 모르는 피스를 이어 붙이면 있지도 않은 연결을
        주장하게 된다). 채워 그리지 않는 것이 요구다 — 면이면 "여기 트랙이 있다"로 읽힌다.
      */}
      <lineSegments geometry={scene.placeholders}>
        <lineBasicMaterial color={PLACEHOLDER_COLOR} depthWrite={false} />
      </lineSegments>

      {/* 미지원 피스마다 **개별** 라벨 — 여러 개를 "미지원 N건"으로 합치지 않는다(TC-009-3) */}
      {scene.placeholderLabels.map((placeholder) => (
        <Html
          key={placeholder.pieceId}
          position={[placeholder.x, placeholder.y + 22, placeholder.z]}
          center
          zIndexRange={[0, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <span
            data-testid="unsupported-label"
            data-piece-class={placeholder.pieceClass}
            style={{
              whiteSpace: 'nowrap',
              fontSize: 10,
              padding: '1px 4px',
              borderRadius: 3,
              color: '#0F1114',
              background: 'rgb(232 179 57 / 0.92)',
            }}
          >
            {placeholder.label}
          </span>
        </Html>
      ))}

      {/*
        FEAT-015 텍스트 채널 — 평지가 아닌 세그먼트에만 붙는다.
        대형 트랙에서는 끈다(FEAT-011): 라벨은 DOM이고 매 프레임 3D 위치로 변환되므로
        수십 개가 되면 렌더 루프에 얹힌다. 유형 정보는 목록(FEAT-013)에 그대로 남는다.
      */}
      {layout.mitigation.showSegmentLabels &&
        scene.labels.map((label) => (
        <Html
          key={label.key}
          // 표식 위로 충분히 띄운다 — 6cm로 뒀을 때 라벨 상자가 표식을 통째로 가려
          // 형태 채널이 화면에서 사라졌다(2026-08-31 캡처 확인)
          position={[label.at.x, label.at.y + 22, label.at.z]}
          center
          // 근거 오버레이(FEAT-010)보다 위로 올라오지 않게 한다 — 라벨이 총계 바를 덮으면
          // 등급 표기가 가려진다
          zIndexRange={[0, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <span
            data-testid="segment-label"
            data-segment-text={label.text}
            style={{
              whiteSpace: 'nowrap',
              fontSize: 10,
              padding: '1px 4px',
              borderRadius: 3,
              color: '#0F1114',
              background: 'rgb(242 244 248 / 0.88)',
            }}
          >
            {label.text}
          </span>
        </Html>
        ))}
    </group>
  )
}

/**
 * FEAT-007 — 추종 시점의 렌더 루프. 상태 수학은 `flythrough-camera.ts`가 전부 갖고
 * 여기서는 매 프레임 그 결과를 카메라에 옮기기만 한다.
 *
 * 진행 상태를 React state가 아니라 ref에 두는 것은 매 프레임 재렌더를 만들지 않기
 * 위해서다 — 60fps로 setState를 부르면 추종 시점 자체가 성능 결함이 된다(FEAT-011이
 * 재는 그 fps를 이 기능이 깎는다).
 */
function FlythroughRig({
  path,
  stateRef,
  publishProgress,
  onCursorChange,
}: {
  path: FlythroughPath
  stateRef: { current: FlythroughState }
  /** 진행 상태를 DOM에 드러낸다(검증용). 커서와 달리 seek 중에도 발행한다 */
  publishProgress: (order: number, distance: number) => void
  /** 추종 중 공유 커서를 끌고 간다. seek 중에는 부르지 않는다 */
  onCursorChange: (order: number) => void
}) {
  const camera = useThree((state) => state.camera)
  const lastOrder = useRef(-1)
  const lastPublishMs = useRef(0)

  useFrame((_, delta) => {
    const next = advanceFlythrough(stateRef.current, delta * 1000, path)
    stateRef.current = next

    const pose = poseAt(path, next.distance)
    if (pose === null) return

    camera.position.set(pose.eye.x, pose.eye.y, pose.eye.z)
    camera.lookAt(pose.target.x, pose.target.y, pose.target.z)

    const order = orderAtDistance(path, next.distance)
    const changed = order !== lastOrder.current

    // 진행 거리는 **시간으로** 발행한다. 구간 변화에만 걸어 두면 한 구간 안을 달리는
    // 동안 값이 멈춰 있어 "0.00"이라고 말하면서 카메라는 90cm를 가 있다 — 검증이 그
    // 값을 읽으면 거짓 통과가 된다(2026-08-31 계측에서 실제로 그랬다). 매 프레임 쓰지
    // 않는 것은 DOM 쓰기가 FEAT-011이 재는 fps에 얹히기 때문이다.
    const nowMs = performance.now()
    if (changed || nowMs - lastPublishMs.current >= PUBLISH_INTERVAL_MS) {
      lastPublishMs.current = nowMs
      publishProgress(order, next.distance)
    }

    // 공유 커서는 **구간이 바뀔 때만** 민다 — 매 프레임 밀면 목록·스트립이 60fps로
    // 재렌더된다. 세 표면이 같은 지점을 가리키는 계약은 구간 단위다.
    //
    // 스크럽으로 **이동하는 중**에는 밀지 않는다. 사용자가 찍은 지점이 커서의 정본이고,
    // 카메라가 따라가는 중간 위치로 그것을 덮으면 목록·스트립이 뒤로 끌려간다.
    if (changed) {
      lastOrder.current = order
      if (!next.seeking) onCursorChange(order)
    }
  })

  return null
}

/** 진행 상태 DOM 발행 간격(ms). 매 프레임 쓰지 않되 값이 오래 멈춰 있지도 않게 한다 */
const PUBLISH_INTERVAL_MS = 100

/** 자동 재생 속도 선택지(cm/초). 탐색 속도 조절이 요구다 — 단일 속도는 조절이 아니다 */
const SPEED_STEPS = [120, 240, 480] as const

export function TrackCanvas({ layout, elevated }: TrackCanvasProps) {
  const controlsRef = useRef<OrbitControlsRef>(null)
  const orbitingRef = useRef(false)
  const hostRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

  // FEAT-007 — 추종 시점. 공유 커서는 세 표면의 **유일한** 동기화 축이다(component-spec
  // §소유권). 스트립이 스크럽하면 여기로 들어오고, 재생 중에는 여기서 나간다.
  const { currentIndex, lastSource, setCursor } = useTrackCursor()
  const [following, setFollowing] = useState(false)
  const [playing, setPlayingUi] = useState(false)
  const [speed, setSpeed] = useState<number>(SPEED_STEPS[1])
  const flythroughRef = useRef<FlythroughState>(initialFlythroughState())

  const { bounds } = layout
  const limits = useMemo(() => orbitLimitsFor(bounds.diagonal), [bounds.diagonal])
  const initial = useMemo(
    () => initialOrbitFor(bounds.diagonal, CAMERA_FOV_DEG),
    [bounds.diagonal],
  )

  const cameraPosition = useMemo<[number, number, number]>(() => {
    const offset = new Vector3().setFromSphericalCoords(
      initial.distance,
      initial.polarRad,
      initial.azimuthRad,
    )
    return [bounds.center.x + offset.x, bounds.center.y + offset.y, bounds.center.z + offset.z]
  }, [bounds.center, initial])

  /**
   * `camera`의 참조를 고정한다. 인라인 객체는 렌더마다 새 객체가 되어 R3F가 카메라
   * 속성을 다시 적용할 여지를 남긴다 — 조작 중 궤도가 초기값으로 되돌아가는 종류의
   * 결함을 애초에 만들지 않기 위한 것이며, 실제로 그 증상을 관측해서 고친 것은 아니다.
   */
  const cameraProps = useMemo(
    () => ({
      fov: CAMERA_FOV_DEG,
      position: cameraPosition,
      near: 1,
      far: bounds.diagonal * 8,
    }),
    [cameraPosition, bounds.diagonal],
  )

  /**
   * 키보드 대체 조작(a11y-responsive §포커스 순서 · TC-006-5).
   * drei의 기본 `keys`는 방향키를 팬에 묶으므로 쓰지 않고(`keyEvents=false`가 기본),
   * 현재 궤도를 컨트롤에서 읽어 순수 함수로 다음 궤도를 계산한 뒤 되돌려 놓는다 —
   * 마우스로 돌린 뒤 키를 눌러도 이어지는 이유가 이 "읽고 → 계산 → 쓰기"다.
   */
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      // 추종 중에는 오빗 키가 죽는다 — 리그가 매 프레임 카메라를 소유하므로 여기서 쓴
      // 위치는 다음 프레임에 덮인다. 효과 없는 쓰기가 orbiting 플래그만 올려 fps 측정
      // (FEAT-011)을 오염시킨다.
      if (following) return
      const controls = controlsRef.current
      if (controls === null) return

      const current: OrbitState = {
        azimuthRad: controls.getAzimuthalAngle(),
        polarRad: controls.getPolarAngle(),
        distance: controls.getDistance(),
      }
      const next = applyOrbitKey(current, event.key, limits)
      if (next === null) return

      event.preventDefault()
      // 키보드도 조작이다 — 마우스에서만 fps를 재면 대체 조작 경로의 부하는 안 보인다
      orbitingRef.current = true
      const spherical = new Spherical(next.distance, next.polarRad, next.azimuthRad)
      controls.object.position.copy(
        new Vector3().setFromSpherical(spherical).add(controls.target),
      )
      controls.update()
    },
    [limits, following],
  )

  /**
   * 추종 경로는 배치가 바뀔 때만 다시 만든다. 매 렌더 만들면 132구간의 표본을 프레임마다
   * 다시 잇게 된다.
   */
  const flythroughPath = useMemo(
    () => buildFlythroughPath({ segments: layout.segments, elevated }),
    [layout.segments, elevated],
  )

  /**
   * `prefers-reduced-motion` — 이징 이동을 즉시 컷으로 바꾼다(component-spec §TrackCanvas
   * "카메라 전환 즉시 컷" 승계). 마운트 시 한 번 읽는다 — 설정을 세션 중에 바꾸는 경우까지
   * 실시간 추적하는 것은 이 티켓의 요구가 아니다.
   */
  const reduceMotion = useMemo(
    () =>
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false),
    [],
  )

  /**
   * 스트립·목록이 옮긴 커서를 추종 카메라의 목표로 삼는다. **즉시 컷이 아니라 목표만**
   * 옮기고 위치는 이징이 따라간다(TC-007-2). 단 reduced-motion에서는 즉시 컷이 요구다.
   *
   * `lastSource === 'canvas'`면 되받지 않는다 — 재생 중 카메라가 민 커서를 다시 목표로
   * 삼으면 자기 출력을 입력으로 먹는 되먹임이 된다.
   */
  useEffect(() => {
    if (!following || lastSource === 'canvas') return
    const goal = distanceOfOrder(flythroughPath, currentIndex)
    flythroughRef.current = reduceMotion
      ? jumpTo(flythroughRef.current, goal)
      : scrubTo(flythroughRef.current, goal)
  }, [following, currentIndex, lastSource, flythroughPath, reduceMotion])

  /**
   * 추종 상태를 DOM에 드러낸다. 3D 캔버스는 픽셀만 남기므로 브라우저 검증이 "따라가고
   * 있다"를 확인할 방법이 없다 — 카메라 상태(`publishCamera`)와 같은 이유·같은 방식이다.
   */
  const publishFollow = useCallback((order: number, distance: number) => {
    const host = hostRef.current
    if (host === null) return
    host.dataset.followOrder = String(order)
    host.dataset.followDistance = distance.toFixed(2)
  }, [])

  const handleFollowCursor = useCallback(
    (order: number) => {
      // 재생이 커서를 끌고 간다 — 목록·스트립이 같은 지점을 가리킨다.
      // 도달 불가 구간은 `setCursor`가 스스로 거른다(부분 실패에서 넘어가지 않는다).
      setCursor(order, 'canvas')
    },
    [setCursor],
  )

  const toggleFollowing = useCallback(() => {
    setFollowing((wasFollowing) => {
      if (wasFollowing) {
        setPlayingUi(false)
        flythroughRef.current = setPlaying(flythroughRef.current, false)
        return false
      }
      // 켤 때는 지금 커서가 가리키는 지점에서 시작한다 — 0으로 되돌리면 사용자가
      // 목록에서 고른 지점이 조용히 버려진다.
      const at = distanceOfOrder(flythroughPath, currentIndex)
      flythroughRef.current = { ...initialFlythroughState(speed), distance: at, goal: at }
      return true
    })
  }, [flythroughPath, currentIndex, speed])

  const togglePlaying = useCallback(() => {
    setPlayingUi((wasPlaying) => {
      flythroughRef.current = setPlaying(flythroughRef.current, !wasPlaying)
      return !wasPlaying
    })
  }, [])

  const changeSpeed = useCallback((next: number) => {
    setSpeed(next)
    flythroughRef.current = { ...flythroughRef.current, speed: next }
  }, [])

  /**
   * 카메라 상태를 DOM에 드러낸다. 3D 캔버스는 픽셀만 남기고 상태를 남기지 않아
   * 브라우저 검증(TC-006-2/3/5)이 "회전했다"를 확인할 방법이 없다 — 매 프레임이 아니라
   * 컨트롤의 `change`에서만 쓰므로 렌더 루프에 얹히지 않는다.
   */
  const publishCamera = useCallback(() => {
    const controls = controlsRef.current
    const host = controls?.domElement?.parentElement
    if (controls === undefined || controls === null || host == null) return
    host.dataset.cameraAzimuth = controls.getAzimuthalAngle().toFixed(4)
    host.dataset.cameraPolar = controls.getPolarAngle().toFixed(4)
    host.dataset.cameraDistance = controls.getDistance().toFixed(2)
  }, [])

  const handleOrbitStart = useCallback(() => {
    resetOrbitFps()
    orbitingRef.current = true
  }, [])

  const handleOrbitEnd = useCallback(() => {
    orbitingRef.current = false
  }, [])

  return (
    <div
      ref={hostRef}
      className="relative h-full w-full"
      data-testid="track-canvas"
      data-render-state={ready ? 'ready' : 'pending'}
      data-segment-count={layout.segments.length}
      data-mitigated={layout.mitigation.mitigated}
      data-follow-mode={following}
      data-follow-playing={playing}
      tabIndex={0}
      role="application"
      aria-label={
        following
          ? '3D 트랙 뷰 — 트랙 따라가기 켜짐'
          : '3D 트랙 뷰 — 방향키로 회전, +/- 로 확대·축소'
      }
      onKeyDown={handleKeyDown}
    >
      <Canvas
        camera={cameraProps}
        onCreated={({ gl }) => {
          gl.setClearColor(CLEAR_COLOR)
          setReady(true)
        }}
      >
        <ambientLight intensity={1.1} />
        <directionalLight position={[1, 2, 1]} intensity={1.6} />
        <TrackMesh layout={layout} elevated={elevated} />
        <PerfProbe orbiting={orbitingRef} />
        {/*
          FEAT-007 — 추종 중에는 오빗을 끈다. 둘 다 살려 두면 같은 카메라를 두 주체가
          매 프레임 서로 다른 자리로 옮겨 화면이 떨린다.
        */}
        {following ? (
          <FlythroughRig
            path={flythroughPath}
            stateRef={flythroughRef}
            publishProgress={publishFollow}
            onCursorChange={handleFollowCursor}
          />
        ) : null}
        <OrbitControls
          ref={controlsRef}
          enabled={!following}
          target={[bounds.center.x, bounds.center.y, bounds.center.z]}
          enablePan={false}
          minDistance={limits.minDistance}
          maxDistance={limits.maxDistance}
          minPolarAngle={limits.minPolarRad}
          maxPolarAngle={limits.maxPolarRad}
          onChange={publishCamera}
          onStart={handleOrbitStart}
          onEnd={handleOrbitEnd}
        />
      </Canvas>

      {/*
        FEAT-007 — 추종 시점 조작. 프리뷰는 이 조작을 셸의 툴바에 뒀지만 그 슬롯의 소유자는
        `TrackScreen`(page)이고 ALLOWED_PATHS 밖이다. 같은 파일이 이미 완화 배지·잘림
        안내를 캔버스 위에 얹는 선례가 있고, TC는 위치를 지정하지 않는다.
        왼쪽 위에 두는 것은 오른쪽 위(완화 배지)·오른쪽 아래(잘림 안내)가 이미 찼기 때문이다.
      */}
      <div className="absolute top-3 left-3 flex items-center gap-2">
        {/*
          즉시 적용 토글은 switch다(component-spec §ControlCluster — interaction-controls
          "즉시 적용=switch" 규칙). aria-pressed 토글 버튼이면 "눌린 버튼"이지 "켜진
          모드"가 아니다 — 보조기술이 상태를 다르게 읽는다.
        */}
        <button
          type="button"
          role="switch"
          onClick={toggleFollowing}
          aria-checked={following}
          disabled={flythroughPath.waypoints.length === 0}
          data-testid="follow-toggle"
          className="rounded-[4px] px-2 py-1 text-[12px] disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            background: following ? 'var(--color-primary)' : 'rgb(26 29 33 / 0.92)',
            color: following ? 'var(--color-on-primary)' : 'var(--color-text-primary)',
            border: '1px solid var(--color-border)',
          }}
        >
          트랙 따라가기
        </button>

        {following ? (
          <>
            <button
              type="button"
              onClick={togglePlaying}
              aria-pressed={playing}
              data-testid="follow-play"
              className="rounded-[4px] px-2 py-1 text-[12px]"
              style={{
                background: 'rgb(26 29 33 / 0.92)',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border)',
              }}
            >
              {playing ? '일시정지' : '자동 재생'}
            </button>

            {/*
              탐색 속도 조절이 요구다(TC-007-3의 "자동 재생 옵션"). 옵션이 3개 고정이므로
              slider가 아니라 **segmented control**이다(component-spec §ControlCluster —
              radiogroup + 옵션별 role=radio, 원칙 12). select는 현재 값 하나만 보이지만
              segmented는 선택지 전체가 한눈에 보인다 — 옵션 셋에 클릭 두 번은 과하다.
              키보드는 APG 라디오 패턴대로 roving tabindex + 방향키다.
            */}
            <div
              role="radiogroup"
              aria-label="탐색 속도"
              data-testid="follow-speed"
              className="flex items-center gap-1 rounded-[4px] px-1.5 py-1 text-[12px]"
              style={{
                background: 'rgb(26 29 33 / 0.92)',
                border: '1px solid var(--color-border)',
              }}
              onKeyDown={(event) => {
                const delta =
                  event.key === 'ArrowRight' || event.key === 'ArrowDown'
                    ? 1
                    : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                      ? -1
                      : 0
                if (delta === 0) return
                event.preventDefault()
                // 방향키가 캔버스 컨테이너의 오빗 키 핸들러로 새지 않게 여기서 끊는다
                event.stopPropagation()
                const at = SPEED_STEPS.findIndex((step) => step === speed)
                const next =
                  SPEED_STEPS[Math.min(Math.max(at + delta, 0), SPEED_STEPS.length - 1)]
                if (next === undefined || next === speed) return
                changeSpeed(next)
                event.currentTarget
                  .querySelector<HTMLButtonElement>(`[data-speed="${next}"]`)
                  ?.focus()
              }}
            >
              {SPEED_STEPS.map((step, index) => (
                <button
                  key={step}
                  type="button"
                  role="radio"
                  aria-checked={speed === step}
                  tabIndex={speed === step ? 0 : -1}
                  data-speed={step}
                  data-testid={`follow-speed-${['slow', 'normal', 'fast'][index]}`}
                  onClick={() => changeSpeed(step)}
                  className="rounded-[3px] px-1.5 py-0.5"
                  style={
                    speed === step
                      ? { background: 'var(--color-primary)', color: 'var(--color-on-primary)' }
                      : { color: 'var(--color-text-secondary)' }
                  }
                >
                  {['느리게', '보통', '빠르게'][index]}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>

      {/*
        FEAT-011 — 완화 상태를 화면에 알린다. 프리뷰는 이 안내를 셸의 alert 슬롯에 뒀지만
        그 슬롯의 소유자는 `TrackScreen`(page)이다. 같은 파일이 이미 `canvas-truncated`
        안내를 캔버스 위에 얹고 있으므로 그 선례를 따른다 — 조용히 최적화하지 않는 것이
        요구이고, 위치는 TC가 지정하지 않는다.
      */}
      {layout.mitigation.mitigated ? (
        <p
          className="absolute top-3 right-3 rounded-[4px] px-2 py-1 text-[12px]"
          style={{ background: 'rgb(26 29 33 / 0.92)', color: 'var(--color-warning)' }}
          data-testid="canvas-large-track"
        >
          {LARGE_TRACK_NOTICE}
        </p>
      ) : null}

      {layout.truncated ? (
        <p
          className="absolute right-3 bottom-3 rounded-[4px] px-2 py-1 text-[12px]"
          style={{ background: 'rgb(26 29 33 / 0.92)', color: 'var(--color-warning)' }}
          data-testid="canvas-truncated"
        >
          복원된 구간까지만 표시했습니다
        </p>
      ) : null}
    </div>
  )
}
