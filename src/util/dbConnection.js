// dbConnection.js
import oracledb from 'oracledb';
import dbconfig from '../config/dbconfig.js'; // DB 설정 파일 가져오기

let pool = null;

async function createDBPool() {
    try {
        pool = await oracledb.createPool({
            user: dbconfig.user,
            password: dbconfig.password,
            connectString: dbconfig.connectString,
            poolAlias: 'default', // 별칭 설정
            poolMin: 1,          // 최소 연결 수
            poolMax: 5,         // 최대 연결 수
            poolIncrement: 1,    // 연결이 필요할 때 추가되는 수
            queueMax: 100000,    // 대기열의 최대 길이를 늘립니다.
            queueTimeout: 120000 // 대기열 타임아웃 증가 (120초)
        });
        console.log('Oracle DB 연결 풀 생성 성공');
    } catch (err) {
        console.error('DB 풀 초기화 실패:', err);
        throw err;
    }
}

async function getDBConnection() {
    if (!pool) {
        await createDBPool();
    }
    try {
        return await pool.getConnection();
    } catch (err) {
        console.error('DB 연결 실패:', err);
        throw err;
    }
}

export { createDBPool, getDBConnection };
