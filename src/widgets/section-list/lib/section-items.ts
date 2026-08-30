// 복원된 경로를 목록 행으로 옮긴다. 순수 함수라 브라우저 없이 수치로 검증된다.
//
// **유형 판정의 정본은 피스 클래스다** — 고도 프로파일(FEAT-005)에서 유추하지 않는다.
// `Bri2`(jump)는 색이 없으면 고도가 평평하지만 여전히 슬로프 계열 피스이고, 사용자가
// 목록에서 찾는 것은 "무슨 피스인가"이지 "이번에 높이가 변했는가"가 아니다.
import type { ParsedPiece } from '@/entities/track/model/types'

/**
 * component-spec §SectionList의 `SegmentKind`에 `wave`를 더했다.
 * 그 목록(`straight|corner|slope|bank|lane-change|marker|unsupported`)에는 웨이브가 없는데
 * 카탈로그의 `Chi1`/`Chi2`는 23종 안에 있어 `unsupported`가 아니고, `straight`로 적으면
 * 화면이 틀린 유형을 말한다. TC-013-1의 열거가 "…등"으로 열려 있어 확장이 계약을
 * 깨지 않는다. 문서 반영은 DOCS_TO_UPDATE로 남긴다.
 */
export type SegmentKind =
  | 'straight'
  | 'corner'
  | 'slope'
  | 'bank'
  | 'lane-change'
  | 'wave'
  | 'marker'
  | 'unsupported'

export interface SectionListItem {
  /** 원본 피스 안정 ID — canonical key, index 아님 */
  id: string
  /** RestoredPath 순서 표시용 (1-based 라벨: "12/132") */
  index: number
  pieceType: string
  segmentKind: SegmentKind
  /** "미지원: {타입명}" (FEAT-009 표기를 이 표면에 얹은 것) */
  unsupportedLabel?: string
  /** 커서가 갈 수 없는 행 — 회색 배경 + 비활성 */
  failed?: boolean
  /**
   * 복원 순서에 자리가 없는 이유. 둘 다 "번호를 지어내지 않는다"는 같은 규칙의 결과다.
   * - `disconnected` — 끊긴 지점 이후라 어디에 놓일지 알 수 없다(FEAT-004 판정)
   * - `unsupported` — 끝점을 몰라 사슬에 낄 수 없다(FEAT-002가 vertex를 position 한 점으로 둔다)
   */
  unplacedReason?: 'disconnected' | 'unsupported'
}

const KIND_LABEL: Readonly<Record<SegmentKind, string>> = {
  straight: '직선',
  corner: '코너',
  slope: '슬로프',
  bank: '뱅크',
  'lane-change': '레인체인지',
  wave: '웨이브',
  marker: 'START',
  unsupported: '미지원',
}

export function segmentKindLabel(kind: SegmentKind): string {
  return KIND_LABEL[kind]
}

/** START(`Str2`)는 직선이지만 목록에서는 기점 표시가 더 쓸모 있다 (D-038 ①) */
const START_PIECE_CLASS = 'Str2'

export function segmentKindOf(piece: ParsedPiece): SegmentKind {
  if (!piece.isSupported) return 'unsupported'
  if (piece.pieceClass === START_PIECE_CLASS) return 'marker'
  if (piece.pieceClass.startsWith('Cor')) return 'corner'
  if (piece.pieceClass.startsWith('Bri')) return 'slope'
  if (piece.pieceClass.startsWith('Ban')) return 'bank'
  if (piece.pieceClass.startsWith('Lan')) return 'lane-change'
  if (piece.pieceClass.startsWith('Chi')) return 'wave'
  return 'straight'
}

export interface BuildSectionItemsInput {
  /** 파싱된 전체 피스. 순서는 뜻이 없다 */
  pieces: readonly ParsedPiece[]
  /**
   * 자리가 정해진 순서. 복원이 성공했으면 FEAT-003의 `orderedPieceIds`이고,
   * 부분 실패면 FEAT-004가 이어붙인 `connectedPieceIds` 접두부다.
   */
  orderedPieceIds: readonly string[]
}

function itemOf(piece: ParsedPiece, index: number): SectionListItem {
  const kind = segmentKindOf(piece)
  return {
    id: piece.pieceId,
    index,
    pieceType: piece.pieceClass,
    segmentKind: kind,
    // 뭉뚱그리지 않고 타입명을 그대로 노출한다 (TC-009-3 · TC-013-3)
    ...(kind === 'unsupported' ? { unsupportedLabel: `미지원: ${piece.pieceClass}` } : {}),
  }
}

/**
 * 순서를 행으로 옮기고, **순서에 들지 못한 피스도 남긴다.**
 *
 * 왜 남기는가: 복원 순서만 그리면 두 종류가 화면에서 통째로 사라진다 —
 * 끊긴 뒤의 피스(FEAT-004가 잘라낸 구간)와 미지원 피스(FEAT-002가 끝점을 모른다고
 * 표시한 것)다. 실측으로 `UNSUPP` fixture는 134피스 중 2개가 복원 순서에 아예 없고,
 * `OPENLOOP`은 132피스 중 131개만 이어진다. 그것들을 지우면 목록이 "이게 전부"라고
 * 말하게 된다(제품 계약 §5 — 조용히 숨기지 않는다).
 *
 * 대신 **번호를 지어내지 않는다.** 이어지는 행 번호를 주되 `unplacedReason`으로 자리가
 * 없다는 사실을 남기고, 커서가 갈 수 없도록 `failed`로 표시한다.
 */
export function buildSectionItems(input: BuildSectionItemsInput): SectionListItem[] {
  const byId = new Map(input.pieces.map((piece) => [piece.pieceId, piece]))
  const placed = new Set(input.orderedPieceIds)

  const items: SectionListItem[] = []
  for (const pieceId of input.orderedPieceIds) {
    const piece = byId.get(pieceId)
    if (piece !== undefined) items.push(itemOf(piece, items.length))
  }

  for (const piece of input.pieces) {
    if (placed.has(piece.pieceId)) continue
    items.push({
      ...itemOf(piece, items.length),
      failed: true,
      unplacedReason: piece.isSupported ? 'disconnected' : 'unsupported',
    })
  }

  return items
}

/** 커서가 갈 수 있는 마지막 행의 다음 인덱스 — 첫 비활성 행에서 끊긴다 */
export function reachableCountOf(items: readonly SectionListItem[]): number {
  const firstFailed = items.findIndex((item) => item.failed === true)
  return firstFailed === -1 ? items.length : firstFailed
}
