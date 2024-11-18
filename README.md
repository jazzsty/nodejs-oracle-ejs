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

const latlon = [
    // 필요한 경우 더 많은 항목 추가
    { id: 1, lon: 126.379803, lat: 37.623694 },
    { id: 2, lon: 126.337361, lat: 37.534211 },
    { id: 3, lon: 126.366369, lat: 37.531443 },
    { id: 4, lon: 126.427061, lat: 37.532528 },
    { id: 5, lon: 126.442780, lat: 37.520078 },
    { id: 6, lon: 126.422581, lat: 37.496731 },
    { id: 7, lon: 126.487531, lat: 37.488689 },
    { id: 9, lon: 126.465947, lat: 37.439861 },
    { id: 10, lon: 126.424675, lat: 37.389378 },
    { id: 11, lon: 126.410992, lat: 37.534586 },
    { id: 12, lon: 126.382650, lat: 37.536025 },
    { id: 13, lon: 126.372803, lat: 37.470222 },
    { id: 14, lon: 126.402330, lat: 37.486197 },
    { id: 15, lon: 126.419208, lat: 37.453297 },
    { id: 16, lon: 126.423589, lat: 37.429380 },
    { id: 17, lon: 126.450053, lat: 37.433019 },
    { id: 18, lon: 126.422100, lat: 37.662244 },
    { id: 19, lon: 126.362836, lat: 37.668394 },
    // { id: 20, lon: 126.431732, lat: 37.683396 }, // 고정된 측정소가 아닌 이동차량
    { id: 20, lon: 126.601673, lat: 37.254875 },
    { id: 21, lon: 126.404875, lat: 37.528205 },
    { id: 22, lon: 126.417566, lat: 37.450233 },
    { id: 23, lon: 126.477725, lat: 37.274412 },
    { id: 24, lon: 126.454592, lat: 37.273014 },
    { id: 25, lon: 126.179475, lat: 37.481489 },
    { id: 26, lon: 126.217062, lat: 37.483263 },
    { id: 27, lon: 126.253594, lat: 37.483677 },
    { id: 28, lon: 126.290127, lat: 37.484080 },
    { id: 29, lon: 126.325001, lat: 37.484434 },
    // ... 더 많은 항목
];