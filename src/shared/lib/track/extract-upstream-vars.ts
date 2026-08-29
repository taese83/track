/**
 * 업스트림(`GET /load/{CODE}.js`) 응답은 JSON이 아니라 JS 스니펫이다:
 *
 *   const COMPATIBILITY_ID = 26586;
 *   var compat = parseInt(258262) < COMPATIBILITY_ID;
 *   var text = 'Cor1;121.111;641.142;225;0#...';
 *
 * 여기서 하는 일은 이 3개 선언에서 값만 뽑는 **정규식 추출**이지 피스 파싱이 아니다.
 * 추출 실패는 UPSTREAM_RESPONSE_UNRECOGNIZED(편집기 응답 포맷 변경)이며,
 * 피스 문자열 자체의 손상(REQ-F-011)은 여기서 판정하지 않고 그대로 통과시킨다.
 *
 * 응답 본문을 절대 eval/Function으로 실행하지 않는다 — 외부 사이트가 만든 코드다.
 */

export type ExtractFailureReason =
  | 'text-missing'
  | 'text-empty'
  | 'compat-missing'
  | 'compatibility-id-missing'

export type ExtractUpstreamVarsResult =
  | { ok: true; text: string; compat: boolean }
  | { ok: false; reason: ExtractFailureReason }

const TEXT_SINGLE = /\btext\s*=\s*'((?:[^'\\]|\\.)*)'/
const TEXT_DOUBLE = /\btext\s*=\s*"((?:[^"\\]|\\.)*)"/
const COMPATIBILITY_ID = /\bCOMPATIBILITY_ID\s*=\s*(\d+)/
const COMPAT_EXPRESSION = /\bcompat\s*=\s*parseInt\(\s*(\d+)\s*\)\s*<\s*COMPATIBILITY_ID/
const COMPAT_LITERAL = /\bcompat\s*=\s*(true|false)\b/

/** JS 문자열 리터럴의 백슬래시 이스케이프를 되돌린다. 피스 문자열에는 보통 없지만 방어적으로 처리 */
function unescapeJsString(raw: string): string {
  return raw.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (_m, esc: string) => {
    switch (esc) {
      case 'n':
        return '\n'
      case 'r':
        return '\r'
      case 't':
        return '\t'
      case 'b':
        return '\b'
      case 'f':
        return '\f'
      case 'v':
        return '\v'
      case '0':
        return '\0'
      default:
        if (esc.startsWith('u') || esc.startsWith('x')) {
          const hex = esc.startsWith('u{') ? esc.slice(2, -1) : esc.slice(1)
          const code = Number.parseInt(hex, 16)
          return Number.isNaN(code) ? esc : String.fromCodePoint(code)
        }
        return esc // \' \" \\ 및 그 외는 문자 그대로
    }
  })
}

export function extractUpstreamVars(body: string): ExtractUpstreamVarsResult {
  const textMatch = TEXT_SINGLE.exec(body) ?? TEXT_DOUBLE.exec(body)
  if (textMatch?.[1] === undefined) return { ok: false, reason: 'text-missing' }

  const text = unescapeJsString(textMatch[1])
  if (text.length === 0) return { ok: false, reason: 'text-empty' }

  const expression = COMPAT_EXPRESSION.exec(body)
  if (expression?.[1] !== undefined) {
    const idMatch = COMPATIBILITY_ID.exec(body)
    if (idMatch?.[1] === undefined) return { ok: false, reason: 'compatibility-id-missing' }
    const savedVersion = Number.parseInt(expression[1], 10)
    const compatibilityId = Number.parseInt(idMatch[1], 10)
    return { ok: true, text, compat: savedVersion < compatibilityId }
  }

  const literal = COMPAT_LITERAL.exec(body)
  if (literal?.[1] !== undefined) return { ok: true, text, compat: literal[1] === 'true' }

  return { ok: false, reason: 'compat-missing' }
}
