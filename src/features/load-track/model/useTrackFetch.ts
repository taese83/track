import { useCallback, useEffect, useRef, useState } from 'react'

import { extractCode } from '@/entities/track/model/schema'
import type { RawTrackResponse } from '@/entities/track/model/types'

import { fetchTrack } from '../api/fetch-track'
import { readCachedTrack, writeCachedTrack } from './track-cache'
import type { LoadState } from './types'

/**
 * ASSUMPTION-007 잠정 임계값(1.4s). 실측으로 확정되지 않았다 — 편집기 응답 분포를 재면
 * 이 상수만 바꾼다. 임계값을 넘겨도 요청은 계속되고 문구만 추가된다(레이아웃 불변).
 */
export const SLOW_THRESHOLD_MS = 1_400

export interface TrackFetchApi {
  state: LoadState
  /** 성공한 마지막 응답. FEAT-002 파싱 단계가 소비한다 */
  track: RawTrackResponse | null
  /** 마지막으로 제출된 입력값 — 재시도가 같은 대상을 다시 부른다 */
  lastSubmitted: string | null
  submit: (urlParam: string) => void
  retry: () => void
  reset: () => void
}

/**
 * `useTrackFetch`는 `/api/track` 단일 쿼리의 얇은 상태 머신이다(tech-stack: react-query 미채택).
 * 소유하는 것은 네 가지뿐 — 세션 캐시 조회, 요청 1회 발사, slow 임계 타이머, 에러 원인 보존.
 */
export function useTrackFetch(): TrackFetchApi {
  const [state, setState] = useState<LoadState>({ status: 'idle' })
  const [track, setTrack] = useState<RawTrackResponse | null>(null)
  const [lastSubmitted, setLastSubmitted] = useState<string | null>(null)

  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlight = useRef<AbortController | null>(null)
  const mounted = useRef(true)

  const clearSlowTimer = useCallback(() => {
    if (slowTimer.current !== null) {
      clearTimeout(slowTimer.current)
      slowTimer.current = null
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      clearSlowTimer()
      inFlight.current?.abort()
    }
  }, [clearSlowTimer])

  const submit = useCallback(
    (urlParam: string) => {
      setLastSubmitted(urlParam)

      const code = extractCode(urlParam)
      if (code === null) {
        // 클라이언트에서 이미 걸러지지만, 서버에 헛요청을 보내지 않는 것이 계약이다(api-schema §1)
        setState({ status: 'error', reason: 'invalid-input' })
        return
      }

      // 결정적 캐시 층 — 네트워크로 나가기 전에 먼저 본다(TC-001-6: 요청 0건)
      const cached = readCachedTrack(code)
      if (cached !== undefined) {
        setTrack(cached)
        setState({ status: 'success' })
        return
      }

      inFlight.current?.abort()
      const controller = new AbortController()
      inFlight.current = controller

      setState({ status: 'loading' })
      clearSlowTimer()
      slowTimer.current = setTimeout(() => {
        // 요청은 취소하지 않는다 — 문구만 추가된다(TC-001-4)
        setState((current) => (current.status === 'loading' ? { status: 'slow' } : current))
      }, SLOW_THRESHOLD_MS)

      void fetchTrack(urlParam, controller.signal).then((result) => {
        if (!mounted.current || controller.signal.aborted) return
        clearSlowTimer()
        if (result.ok) {
          writeCachedTrack(result.data)
          setTrack(result.data)
          setState({ status: 'success' })
          return
        }
        setState(
          result.reason === 'parse'
            ? { status: 'error', reason: result.reason, rawSnippet: result.detail }
            : { status: 'error', reason: result.reason },
        )
      })
    },
    [clearSlowTimer],
  )

  const retry = useCallback(() => {
    if (lastSubmitted !== null) submit(lastSubmitted)
  }, [lastSubmitted, submit])

  const reset = useCallback(() => {
    inFlight.current?.abort()
    inFlight.current = null
    clearSlowTimer()
    setState({ status: 'idle' })
    setTrack(null)
  }, [clearSlowTimer])

  return { state, track, lastSubmitted, submit, retry, reset }
}
