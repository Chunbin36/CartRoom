# 오늘의 장보기 (CartRoom)

Firebase Realtime Database 기반의 실시간 협업 장보기 웹앱입니다.  
여러 사용자가 같은 룸에 접속해 장보기 항목을 함께 추가/체크/삭제할 수 있습니다.

## 배포 링크

- 바로 실행: [https://cart-room.vercel.app](https://cart-room.vercel.app)

## 주요 기능

- 닉네임 설정 후 로비 진입
- 룸 생성 / 초대코드로 룸 입장 (최대 5자, 영문+숫자)
- 같은 룸 사용자 간 장보기 리스트 실시간 동기화
- 체크박스 토글, 작성자/체크자 표시, 삭제 기능
- 룸 상단 초대코드 및 실시간 참여 인원 표시
- 모든 항목 체크 시 `장보기 완료` 버튼 노출
- 한 명이 완료 버튼을 누르면 같은 룸 전원이 완료 화면 전환
- 완료 화면 카운트다운 후 자동 초기화

## 기술 스택

- HTML / CSS / Vanilla JavaScript
- Firebase Realtime Database (Modular SDK)

## 프로젝트 구조

- `index.html` : 화면 구조 (닉네임/로비/룸/완료 스크린)
- `style.css` : 디자인 시스템 및 반응형 UI 스타일
- `app.js` : 앱 상태 관리, 화면 전환, Firebase 실시간 로직
- `database.rules.example.json` : Firebase Realtime Database Rules 예시

## 실행 방법

### 배포 사이트로 바로 실행

- [https://cart-room.vercel.app](https://cart-room.vercel.app)


