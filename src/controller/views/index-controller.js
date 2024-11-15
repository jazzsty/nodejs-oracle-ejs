import express from 'express';
// import bodyParser from 'body-parser'; // body-parser 추가
import oracledb from 'oracledb';

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

export class IndexViewController {
    constructor(app) {
        // 미들웨어 설정
        // app.use(bodyParser.urlencoded({ extended: true }));
        // app.use(bodyParser.json());

        // 라우팅 설정
        this._router = express.Router();
        this._initRoutes();
    }

    router() {
        return this._router;
    }

    // 라우팅 설정
    _initRoutes() {
        // 홈 페이지 (HTML 폼을 EJS로 렌더링)
        this._router.get('/', (req, res) => {
            return res.render('index', { isLogin: false });
        });

        this._router.post('/save-stations', (req, res) => {
            console.log('req.body: ' + JSON.stringify(req.body));
            this._saveStations(req, res);
        });

        this._router.get('/load-stations', (req, res) => {
            console.log('req.body: ' + req.body);
            this._loadStations(req, res);
        })

    }

    // 데이터베이스 연결 함수
    async getDBConnection() {
        try {
            const pool = oracledb.getPool();
            if (!pool) {
                throw new Error("Oracle DB 연결 풀이 생성되지 않았습니다.");
            }
            const conn = await pool.getConnection();
            // console.log("DB 연결 성공:", conn);  // 연결 성공 로그
            return conn;
        } catch (err) {
            console.error("DB 연결 실패: ", err);
            throw err;
        }
    }

    // 측정소 데이터를 가져오는 API
    async _loadStations(req, res) {

        let conn;
        try {
            conn = await this.getDBConnection();
            console.log("Oracle DB 연결 성공!!");
            
            // 데이터베이스에서 측정소 목록을 쿼리
            const query = 'SELECT seq, latitude, longitude FROM station_tbl';
            const result = await conn.execute(query); // 데이터베이스에서 측정소 목록 쿼리
            console.log('1 result.rows.length: ' + result.rows.length);
            // 결과 확인
            if (result.rows.length === 0) {
                console.log('2 result.rows.length: ' + result.rows.length);
                return res.json([]);  // 데이터가 없으면 빈 배열 반환
            }
            console.log('Query result:', result.rows);

            // JSON 형식으로 응답
            res.json(result.rows);
        } catch (error) {
            console.error('Error loading stations info:', error);
            res.status(500).json({ error: 'Failed to load stations info' });
        } finally {
            if (conn) {
                try {
                    await conn.close();
                    console.log("DB 연결 해제 완료");
                } catch (err) {
                    console.error("DB 해제 중 에러: ", err);
                }
            }
        }
    }


    // 데이터 저장 함수
    async _saveStations(req, res) {
        const stations = req.body;
        console.log('stations: ' + JSON.stringify(stations));
        let conn;
        let rowsAffected = 0;
        try {
            // DB 연결 풀에서 연결을 가져옴
            conn = await this.getDBConnection();
            console.log("Oracle DB 연결 성공!!");
        
            for (const station of stations) {
                if (!station.seq) {
                    console.error('Invalid station seq:', station);
                    continue;
                }
                // UPDATE 쿼리 실행
                console.log('check step 0');
                console.log('Updating station with seq:', station.seq);
                console.log('Latitude:', station.latitude, 'Longitude:', station.longitude);
                const updateResult = await conn.execute(
                    `UPDATE station_tbl SET latitude = :latitude, longitude = :longitude WHERE seq = :seq`,
                    { latitude: station.latitude, longitude: station.longitude, seq: station.seq }
                );
                console.log('check step 1');
                console.log(`update updateResult.rowsAffected: ${updateResult.rowsAffected}`);
            
                // 수동으로 커밋
                if (updateResult && updateResult.rowsAffected > 0) {
                    rowsAffected += updateResult.rowsAffected;
                    console.log(`updateResult.rowsAffected >>> ${updateResult.rowsAffected}개의 행이 수정되었습니다.`);
                    await conn.commit();
                    console.log("UPDATE 커밋 성공");
                }
            
                // 만약 업데이트된 데이터가 없으면 INSERT 실행
                if (updateResult.rowsAffected === 0) {
                    console.log('check step 2');
                    const insertResult = await conn.execute(
                        `INSERT INTO station_tbl (seq, latitude, longitude)
                        VALUES (:seq, :latitude, :longitude)`,
                        { seq: station.seq, latitude: station.latitude, longitude: station.longitude }
                    );
                    // 수동으로 커밋
                    if (insertResult && insertResult.rowsAffected > 0) {
                        rowsAffected += insertResult.rowsAffected;
                        console.log(`insertResult.rowsAffected >>> ${insertResult.rowsAffected}개의 행이 입력되었습니다.`);
                        await conn.commit();
                        console.log("INSERT 커밋 성공");
                    }
                }
            }
            // 응답 보내기
            console.log(`${rowsAffected}개의 행이 저장되었습니다.`);
            res.json({ message: `${rowsAffected}개의 행이 저장되었습니다.` });

            console.log("DB 저장 완료");
        
        } catch (err) {
            console.error("에러 발생: ", err);
            res.status(500).send("에러 발생");
        } finally {
            if (conn) {
                try {
                    // DB 연결 반환
                    await conn.close();
                    console.log("DB 연결 해제 완료");
                } catch (err) {
                    console.error("DB 해제 중 에러: ", err);
                }
            }
        }
    }

}