# Component Spec — features 레이어

이 제품은 읽기 전용 뷰어라 `features` 슬라이스가 하나뿐이다: URL 제출 → 트랙 로드(FEAT-001/002/003).

## features Components

| Component | Slice | Props | State |
|---|---|---|---|
| UrlInputForm | `features/load-track` | `UrlInputFormProps` | `idle`/`loading`/`slow`/`error`/`success` (discriminated union, tech-stack `useTrackFetch`) |

## Component Detail Specs

### UrlInputForm — FEAT-001, TC-001-1~7

```ts
type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'slow' }                                    // ASSUMPTION-007 임계값 초과, 로딩 자리 유지 + 문구만 추가
  | { status: 'error'; reason: 'network' | 'parse' | 'not-closed-fatal' | 'timeout'; rawSnippet?: string }
  | { status: 'success' }

interface UrlInputFormProps {
  value: string
  onChange: (v: string) => void
  onSubmit: (url: string) => void
  state: LoadState                 // features/load-track/model/useTrackFetch가 소유, 이 컴포넌트는 props로만 받는다
  touched: boolean                 // blur 이후 true — validation 표시 게이트
}
```

- **컨트롤 선택**: 단일 텍스트 input(URL) — 선택지가 없는 자유입력이라 슬라이더/셀렉트 대상이 아니다.
- **validation 시점**(interaction-controls 원칙, 협상 불가): blur 전에는 에러를 그리지 않는다(`touched===false`→ 에러 숨김). blur 후 정규식(`/^view\/[A-Za-z0-9]+$/` 형태, 최종 형식은 developer가 FEAT-002 계약과 대조해 확정) 불일치 시 필드 옆 인라인 에러: "① URL 형식이 올바르지 않습니다 ② `view/` 뒤에 코드가 와야 합니다 ③ 원본 편집기 주소를 그대로 붙여넣으세요". 입력값은 절대 지우지 않는다.
- **제출 실패(서버·파싱)**: `state.status==='error'`는 필드 에러가 아니라 `AlertSlot`(shared.md) 레벨 `error`로 승격 — toast로 흘리지 않는다(interaction-controls "치명적 에러를 toast로 흘리지 않는다"). `rawSnippet`이 있으면(파싱 실패) 접이식 디버그 영역에 노출.
- **버튼**: "코스 불러오기" 1개, filled/primary, 마지막(유일한) 필드 바로 아래·좌측 정렬(hierarchy-actions §버튼 배치 "페이지 레벨 단일 컬럼 폼"). 라벨은 동사+결과("확인" 금지).
- **5개 인터랙티브 상태**: default / hover / active / focus-visible(`2px solid primary`, offset 2px) / disabled(`state.status==='loading'|'slow'` 동안 버튼 disabled, 중복 제출 방지 — 100ms 이내 pressed 시각 반응은 별도로 유지).
- **로딩 표현**: `loading`은 버튼 내부 스피너(구조 예측 불가한 짧은 작업 — interaction-controls "스피너는 버튼 내부 로딩에"), `slow`는 같은 자리에 "시간이 걸리고 있어요" 텍스트만 추가(레이아웃 불변, layout-spec §로딩).
- **success**: 이 컴포넌트는 unmount되고 `TrackViewerPage`가 3D 표시로 전환한다(폼 자체에 success 시각 상태 없음).
