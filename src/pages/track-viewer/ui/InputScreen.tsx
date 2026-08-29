import { UrlInputForm, type UrlInputFormProps } from '@/features/load-track'

export interface InputScreenProps {
  formProps: UrlInputFormProps
}

/**
 * 입력 대기·로딩은 3분할 셸을 쓰지 않는다 — 트랙 데이터가 아직 없어 목록·스트립이 의미가 없다
 * (layout-spec §Layout stability #4). 중앙 카드 하나가 전부다.
 */
export function InputScreen({ formProps }: InputScreenProps) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div
        className="w-full max-w-[640px] rounded-[6px] border p-6"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-surface)' }}
      >
        <h2 className="text-[20px] leading-[1.3] font-semibold">트랙 공유 링크 붙여넣기</h2>
        <p className="mt-2 text-[16px]" style={{ color: 'var(--color-text-secondary)' }}>
          미니4WD 트랙 편집기의 공유 링크를 붙여넣으면 코스를 조회합니다.
        </p>
        <div className="mt-5">
          <UrlInputForm {...formProps} />
        </div>
      </div>
    </div>
  )
}
