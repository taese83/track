# Requirements — 비기능 요구

## Non-functional Requirements
- REQ-NFR-001 Performance: 참조 트랙(132피스, 190.84 (편집기 l 단위, unknown)) 기준 데스크톱 최신 Chrome에서 초기 렌더 3초 이내, 회전/줌 상호작용 30fps 이상. 측정: 참조 트랙 URL 고정 실측. R2 적용 — 절대 미터 단위로 표기하지 않는다.
- REQ-NFR-002 Responsive: 데스크톱 우선. 태블릿은 뷰포트+터치 제스처 최소 동작. 모바일 성능 최적화는 ASSUMPTION(범위 밖 가능).
- REQ-NFR-003 Accessibility: 키보드로 카메라 회전/플라이스루 대체 조작 제공, 상승/하강 구분은 색상 단독이 아닌 아이콘 병행(색맹 대응), 인터랙션 요소 포커스 표시.
- REQ-NFR-004 Browsers: WebGL 2.0 지원 최신 Chrome/Edge/Firefox/Safari. 미지원 시 안내 메시지로 대체.

