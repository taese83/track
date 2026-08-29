import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { extractUpstreamVars } from './extract-upstream-vars'

const fixture = (name: string) =>
  readFile(path.resolve(process.cwd(), 'fixtures/track', `${name}.js.txt`), 'utf8')

describe('extractUpstreamVars', () => {
  it('실측 원문(WS67Y2)에서 132피스 문자열과 compat=false를 뽑는다', async () => {
    const result = extractUpstreamVars(await fixture('WS67Y2'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.compat).toBe(false)
    expect(result.text.split('#').filter(Boolean)).toHaveLength(132)
    expect(result.text.startsWith('Cor1;121.111;641.142;225;0')).toBe(true)
  })

  it('저장 버전이 COMPATIBILITY_ID보다 작으면 compat=true다', async () => {
    const result = extractUpstreamVars(await fixture('COMPAT1'))

    expect(result).toMatchObject({ ok: true, compat: true })
  })

  it('내용이 손상된 피스 문자열도 추출 자체는 성공한다 — 파싱 실패는 다른 계층의 판정이다', async () => {
    const result = extractUpstreamVars(await fixture('PARSEFAIL'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.text).toContain('Cor1;NaN;;;')
  })

  it('JS 래퍼가 깨져 text 변수가 없으면 실패한다', async () => {
    expect(extractUpstreamVars(await fixture('BADJS'))).toEqual({ ok: false, reason: 'text-missing' })
  })

  it.each([
    ['compat 선언이 없을 때', "var text = 'Str1;0;0;0;0';", 'compat-missing'],
    [
      'COMPATIBILITY_ID 상수가 없을 때',
      "var compat = parseInt(258262) < COMPATIBILITY_ID;\nvar text = 'Str1;0;0;0;0';",
      'compatibility-id-missing',
    ],
    ['text가 빈 문자열일 때', "var compat = false;\nvar text = '';", 'text-empty'],
  ])('%s 실패 사유를 구분한다', (_label, body, reason) => {
    expect(extractUpstreamVars(body)).toEqual({ ok: false, reason })
  })

  it('compat이 불리언 리터럴로 와도 읽는다', () => {
    expect(extractUpstreamVars("var compat = true;\nvar text = 'Str1;0;0;0;0';")).toEqual({
      ok: true,
      compat: true,
      text: 'Str1;0;0;0;0',
    })
  })

  it('큰따옴표 리터럴과 이스케이프를 되돌린다', () => {
    const result = extractUpstreamVars('var compat = false;\nvar text = "Str1;0;0;0;0\\u0023Cor1;1;1;0;0";')

    expect(result).toMatchObject({ ok: true, text: 'Str1;0;0;0;0#Cor1;1;1;0;0' })
  })

  it('응답 본문을 실행하지 않는다 — 부작용 코드가 섞여 있어도 값만 뽑는다', () => {
    const hostile = "globalThis.__pwned = true;\nvar compat = false;\nvar text = 'Str1;0;0;0;0';"

    expect(extractUpstreamVars(hostile)).toMatchObject({ ok: true })
    expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined()
  })
})
