# 데스크탑 위젯 (Electron)

브라우저가 아닌 **별도 프로그램 창**으로 캐릭터 포트레이트를 띄웁니다.

- 테두리 없는 창, 항상 위, 배경·캐릭터·대사창 빈 곳을 끌어 이동, 가장자리로 크기 조절(비율 유지)
- 오른쪽 클릭 메뉴: 항상 위 / 재생바 표시 / 크기 / 투명도 / 오른쪽 아래로 이동 / 닫기
- BGM 재생바는 기본 숨김 → 메뉴에서 “재생바 표시”를 켜면 배경 위에 마우스를 올릴 때만 표시
- 창 위치·크기는 캐릭터별로 기억
- 캐릭터마다 따로 실행 → 여러 명 동시에 띄우기 가능

## 실행
`characters/<ID>/desktop-<ID>.bat` 를 더블클릭 (편집기 ③탭 “Electron 위젯 실행 파일 만들기”로 생성).
첫 실행 때 Electron이 자동 설치됩니다 (Node.js 필요, 인터넷 필요, 1회).

직접 실행: `desktop\node_modules\electron\dist\electron.exe desktop --char=<ID>` (여러 명: `--chars=a,b`, 크기: `--width=1200`)
점검: `electron desktop --char=<ID> --selftest`

> 남에게 받은 캐릭터 폴더의 `.bat`은 실행 전에 내용을 확인하세요. (자세한 내용은 프로젝트 `README.md`의 보안 항목)
