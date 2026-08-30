// FEAT-006 — 3D 씬과 오빗 카메라.
//
// 소유 범위는 **배치와 카메라**다. `component-spec`의 `TrackCanvasProps`가 함께 적은
// `currentIndex`/`onOrbitDepart`(공유 커서, FEAT-012·013) · `followMode`(FEAT-007) ·
// `legendOpen`(FEAT-010)은 여기서 받지 않는다 — 구현 없는 prop을 미리 뚫으면 소비자가
// 동작한다고 읽는 죽은 표면이 된다. 각 소유자가 자기 티켓에서 더한다.
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

export function TrackCanvas({ layout, elevated }: TrackCanvasProps) {
  const controlsRef = useRef<OrbitControlsRef>(null)
  const orbitingRef = useRef(false)
  const [ready, setReady] = useState(false)

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
    [limits],
  )

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
      className="relative h-full w-full"
      data-testid="track-canvas"
      data-render-state={ready ? 'ready' : 'pending'}
      data-segment-count={layout.segments.length}
      data-mitigated={layout.mitigation.mitigated}
      tabIndex={0}
      role="application"
      aria-label="3D 트랙 뷰 — 방향키로 회전, +/- 로 확대·축소"
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
        <OrbitControls
          ref={controlsRef}
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
