CREATE TABLE station_tbl (
    seq NUMBER(3) NOT NULL,                                           -- 1~999 범위의 정수
    latitude NUMBER(9,6) NOT NULL,                                   -- 위도 값 (예: 37.484434)
    longitude NUMBER(10,6) NOT NULL,                                 -- 경도 값 (예: 126.325001)
    modified_at DATE DEFAULT SYSDATE                  -- 수정 시간
);

CREATE TABLE server_tbl (
    host VARCHAR2(30) NOT NULL,       -- IP 주소 (문자열)
    port NUMBER(5) NOT NULL,          -- 포트 번호 (숫자)
    site VARCHAR2(50) NOT NULL, -- 사이트 이름
    modified_at DATE DEFAULT SYSDATE  -- 수정 시간 (기본값: 현재 시간)
);
<!-- modified_at 컬럼의 기본 형식을 'yyyy/mm/dd HH24:mi:ss'로 보이게 하기 위해 아래 형식을 적용 -->
ALTER SESSION SET NLS_DATE_FORMAT = 'YYYY/MM/DD HH24:MI:SS';