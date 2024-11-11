CREATE TABLE stations_info (
    seq NUMBER(3) NOT NULL,                                           -- 1~999 범위의 정수
    latitude NUMBER(9,6) NOT NULL,                                   -- 위도 값 (예: 37.484434)
    longitude NUMBER(10,6) NOT NULL,                                 -- 경도 값 (예: 126.325001)
    modified_at DATE DEFAULT CURRENT_TIMESTAMP                  -- 수정 시간
);
