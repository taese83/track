import type { RawTrackResponse } from '@/entities/track/model/types'

/**
 * 탭 세션 인메모리 캐시 — REQ-F-019(b-1)의 **결정적** 층이다.
 * 같은 탭에서 같은 코드를 재제출하면 `/api/track` 요청이 0건이다(TC-001-6).
 *
 * 모듈 스코프 Map이라 새로고침·탭 종료 시 소멸한다 — "저장소 없음"(D-004) 결정과 충돌하지 않는다.
 * 서버 CDN 캐시(b-2)는 best-effort이며 이 층의 보장을 대신하지 못한다.
 */
const cache = new Map<string, RawTrackResponse>()

export function readCachedTrack(trackCode: string): RawTrackResponse | undefined {
  return cache.get(trackCode)
}

export function writeCachedTrack(response: RawTrackResponse): void {
  cache.set(response.trackCode, response)
}

/** 테스트 격리용. 프로덕션 코드 경로에서는 호출하지 않는다 */
export function clearTrackCache(): void {
  cache.clear()
}
