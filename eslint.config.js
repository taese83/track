// ESLint Flat Config — Gate A·B·C의 lint 축.
//
// 이 축이 통째로 비어 있어 명명·파일명·`export *` 같은 스타일 규약이 어느 게이트에서도
// 잡히지 않았다(2026-08-30 개발 중 보고). 도구가 없으면 게이트는 "미구성"으로 넘어가고
// 결국 없으면 통과가 된다 — 그 자리를 메운다.
//
// 버전 근거: typescript-eslint 8.68.0의 peer는 `typescript >=4.8.4 <6.1.0`이라 이 프로젝트의
// TypeScript 6.0.2와 호환된다. eslint 10은 같은 peer의 `^10.0.0`에 든다.
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {ignores: ['dist/**', 'node_modules/**', 'playwright-report/**', 'test-results/**', 'coverage/**', '_workspace/**']},
  js.configs.recommended,
  // type-aware preset은 .ts/.tsx에만 적용한다(scaffolder §84 — JS·config 파일에는 걸지 않는다).
  ...tseslint.configs.recommended.map(config => ({...config, files: ['**/*.{ts,tsx}']})),
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {globals: {...globals.browser, ...globals.node}},
    rules: {
      // 개발 중 보고가 지목한 축들 — 어느 게이트에서도 안 잡히던 것들이다.
      'no-restricted-syntax': [
        'error',
        {selector: 'ExportAllDeclaration', message: 'export *는 공개 표면을 흐린다 — 필요한 것만 이름으로 내보낸다'},
        {selector: 'TSEnumDeclaration', message: 'enum 대신 as const 객체나 유니온 타입을 쓴다'},
      ],
      '@typescript-eslint/naming-convention': [
        'error',
        {selector: 'typeLike', format: ['PascalCase']},
        {selector: 'variable', format: ['camelCase', 'PascalCase', 'UPPER_CASE'], leadingUnderscore: 'allow'},
        {selector: 'function', format: ['camelCase', 'PascalCase']},
      ],
      '@typescript-eslint/no-unused-vars': ['error', {argsIgnorePattern: '^_', varsIgnorePattern: '^_'}],
      '@typescript-eslint/consistent-type-imports': ['error', {prefer: 'type-imports'}],
      'no-console': ['warn', {allow: ['warn', 'error']}],
    },
  },
  {
    files: ['**/*.{test,spec}.{ts,tsx}', 'e2e/**/*.ts'],
    rules: {'no-console': 'off'},
  },
)
