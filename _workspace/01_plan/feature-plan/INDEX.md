# Feature Plan — mini4wd-track-3d

## 절 목록

| 절 | 파일 | 담당 범위 | 주 소비자 |
|---|---|---|---|
| Feature List·페이지 그룹 | `feature-list.md` | FEAT-001~014 표(우선순위·범위·화면) | 전체 |
| 동작 명세 — 파이프라인 | `specs-pipeline.md` | FEAT-001~005 (fetch·파싱·순서복원·폐곡선·고도) + TC | developer, test-executor |
| 동작 명세 — 씬·카메라 | `specs-scene.md` | FEAT-006/007/008/011 (3D·추종·레인·성능) + TC | component-designer, developer |
| 동작 명세 — 표면·정직성 | `specs-surfaces.md` | FEAT-009/010/012/013/014 (미지원·배지·스트립·목록·WebGL) + TC | component-designer, design-preview-builder |
| 데이터 모델·인접 상호작용 | `data-model.md` | 4단계 파이프라인 타입, 병렬 작업 경계 | api-schema-designer, developer |
| 추적성·fixture·미결 | `traceability.md` | REQ→FEAT→TC 매핑, fixture 7종 매핑, 미결 항목 | 전체 |

## 전역 결정

