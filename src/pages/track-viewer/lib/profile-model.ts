// FEAT-012 — 스트립 모델을 만드는 자리. **page가 소유한다.**
//
// 유형 라벨은 목록이 소유한 `segmentKindLabel`을 쓴다 — 스트립이 자기 매핑을 따로 두면
// 두 표면이 같은 구간을 다른 이름으로 부른다. 그렇다고 위젯이 위젯을 import하면 FSD
// 경계가 깨지므로, 두 위젯을 모두 소비하는 여기서 잇는다.
//
// 3D 셸과 WebGL 대체 화면이 **같은 모델**을 쓴다. 화면마다 따로 만들면 같은 트랙의
// 프로파일이 두 화면에서 달라질 여지가 생긴다.
import type { ClosureValidation } from '@/entities/track/lib/closure'
import type { ElevatedSegment } from '@/entities/track/lib/elevation'
import { buildProfileModel } from '@/widgets/profile-strip'
import type { ProfileModel } from '@/widgets/profile-strip'
import { reachableCountOf, segmentKindLabel } from '@/widgets/section-list'
import type { SectionListItem } from '@/widgets/section-list'

export interface ScreenProfileInput {
  elevated: readonly ElevatedSegment[]
  items: readonly SectionListItem[]
  closure: ClosureValidation
}

export function buildScreenProfileModel({
  elevated,
  items,
  closure,
}: ScreenProfileInput): ProfileModel {
  return buildProfileModel({
    segments: elevated.map((segment) => ({
      order: segment.order,
      absoluteElevationStart: segment.absoluteElevationStart,
      absoluteElevationEnd: segment.absoluteElevationEnd,
      kindLabel: segmentKindLabel(items[segment.order]?.segmentKind ?? 'straight'),
    })),
    reachableCount: reachableCountOf(items),
    // 폐합에 성공했으면 불연속이 없다 — 값이 남아 있어도 그리지 않는다
    closureGapAbsolute: closure.isZClosed === false ? (closure.zClosureGap?.value ?? null) : null,
  })
}
