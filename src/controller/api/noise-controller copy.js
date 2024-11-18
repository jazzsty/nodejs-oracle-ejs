import { Router } from 'express';
import Logger from '../../util/logger.js';
import WebSocket from 'ws';
import EventEmitter from 'events';
import oracledb from 'oracledb';
import dbconfig from '../../config/dbconfig.js';

export class NoiseApiController extends EventEmitter {
    constructor() {
        super();
        this.logger = new Logger('NoiseApiController');
        this.setMaxListeners(Infinity);
        this._router = Router();
        this.socket = null;
        
        this.result = {
            code: 200,
            msg: '',
            data: {},
        };

        this.noiseMessageResult = {
            minus: 0,
            over: 0,
            ignore: 0,
            success: 0,
            fail: 0,
            all: 0,
        };

        this._initRoutes();

        this.stationCache = new Map(); // 캐시로 사용 할 Map

        this._loadStationCache(); // 초기 로드
        // this._initialize();
    }

    // async _initialize() {
    //     await this._loadStationCache();
    // }

    router() {
        return this._router;
    }

    _initRoutes() {
        this._router.post('/start', (req, res) => {
            const { host, port, site, centers } = req.body;

            this._socketClose();
            this._getNoiseSample(req, { host, port, site, centers });
            res.status(this.result.code).json(this.result);
        });

        this._router.post('/stop', (req, res) => {
            this._socketClose();
            res.status(this.result.code).json(this.result);
        });
    }

    _socketClose() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }

        this.noiseMessageResult = {
            minus: 0,
            over: 0,
            ignore: 0,
            success: 0,
            fail: 0,
            all: 0,
        };
    }

    // 데이터베이스 연결 함수
    async getDBConnection() {
        try {
            const pool = oracledb.getPool('default');
            console.log('pool.poolAlias: '+ pool.poolAlias);
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

    async _loadStationCache() {
        console.log('check step _loadStationCache');
        let conn;
        try {
            // if (!pool) {
            //     this.logger.error("Connection pool is not available.");
            //     return;  // pool이 없으면 연결 시도하지 않음
            // }
            const pool = oracledb.getPool('default');
            console.log('1 pool.poolAlias: '+ pool.poolAlias);
            conn = await pool.getConnection();
            // conn = await this.getDBConnection();
            console.log("1 Oracle DB 연결 성공!!");

            // console.log("현재 연결 풀 캐시:", oracledb.getPool().poolAlias);

            const sql = `SELECT seq, latitude, longitude FROM station_tbl`;

            const result = await conn.execute(sql);

            console.log('result.rows: ', result.rows);
            if (!Array.isArray(result.rows)) {
                throw new Error("result.rows는 배열이 아닙니다.");
            }

            // 캐시 초기화 및 데이터 추가
            // result.rows.forEach(([seq, latitude, longitude]) => {
            result.rows.forEach(({seq, latitude, longitude}) => {
                const key = `${latitude},${longitude}`;
                this.stationCache.set(key, seq);
            });

            this.logger.info(`Station cache loaded with ${this.stationCache.size} entries.`);
        } catch (err) {
            this.logger.error(`Error loading station cache: ${err.message}`);
        } finally {
            if (conn) {
                try {
                    await conn.close();
                } catch (err) {
                    this.logger.error(`Error closing DB connection: ${err.message}`);
                }
            }
        }
    }

    async _getNoiseSample(req, { host, port, site, centers }) {
        const url = `ws://${host}:${port}/${site}/urbantraffic/noisesamples`;
        // console.log('_getNoiseSample >>> url: ' + url);
        this.socket = new WebSocket(url);

        this.socket.onerror = (evt) => {
            this.emit('noise-error', evt.message);
            this.logger.error(`WebSocket error message: ${evt.message}`);
        };

        this.socket.onclose = (evt) => {
            this.logger.debug(`WebSocket close code >> : ${evt.code}`);
            this.logger.debug(`WebSocket close reason >> : ${evt.reason}`);
        };

        this.socket.onmessage = async (evt) => {
            const message = JSON.parse(evt.data);
            this.logger.debug(`message >> : ${message}`);
            this.noiseMessageResult.all += 1;

            if (message.sample < 0) {
                this.noiseMessageResult.minus += 1;
                this.emit('noiseSampleMessage', this.noiseMessageResult);
                return;
            }
            if (message.sample > 999) {
                this.noiseMessageResult.over += 1;
                this.emit('noiseSampleMessage', this.noiseMessageResult);
                return;
            }

            const anomsId = this._getAnomsId(message.id, message.lat, message.lon);
            console.log('anomsId: ' + anomsId);
            if (!centers.includes(anomsId)) {
                this.logger.error(`무시된 측정값: ${JSON.stringify({ ...message, id: anomsId })}`);
                this.noiseMessageResult.ignore += 1;
                this.emit('noiseSampleMessage', this.noiseMessageResult);
                return;
            }

            const sampleValue = Number.isInteger(message.sample)
                ? message.sample
                : Number(message.sample.toFixed(1));

            // console.log(`sampleValue >> :  ${JSON.stringify(sampleValue)}`);

            const noiseSample = {};
            noiseSample.insertdate = new Date();
            noiseSample.measuredate = this._adjustMeasurementTime(message.time);
            noiseSample.nmt = anomsId;
            noiseSample.value = sampleValue;

            this.logger.debug(`NoiseSample 저장 중: ${JSON.stringify(noiseSample)}`);
            try {
                await _saveMessageToDB(noiseSample);
                // await saveMessageToDB(`Sample ID: ${anomsId}, Value: ${sampleValue}`);

                this.noiseMessageResult.success += 1;
                this.emit('noiseSampleMessage', this.noiseMessageResult);
            } catch (error) {
                this.noiseMessageResult.fail += 1;
                this.logger.error(`DB 저장 중 에러: ${error}`);
                this.emit('noiseSampleMessage', this.noiseMessageResult);
            }
        };
    }

    _adjustMeasurementTime(time) {
        const measurementTime = new Date(time);
        return new Date(measurementTime.getTime() - 9 * 60 * 60000); // UTC 보정
    }

    // _getAnomsId(id, lat, lon) {
    //     // if (id > 0) {
    //     //     return id;
    //     // }
    //     const latlon = [
    //         // 필요한 경우 더 많은 항목 추가
    //         { id: 1, lon: 126.379803, lat: 37.623694 },
    //         { id: 2, lon: 126.337361, lat: 37.534211 },
    //         { id: 3, lon: 126.366369, lat: 37.531443 },
    //         { id: 4, lon: 126.427061, lat: 37.532528 },
    //         { id: 5, lon: 126.442780, lat: 37.520078 },
    //         { id: 6, lon: 126.422581, lat: 37.496731 },
    //         { id: 7, lon: 126.487531, lat: 37.488689 },
    //         { id: 9, lon: 126.465947, lat: 37.439861 },
    //         { id: 10, lon: 126.424675, lat: 37.389378 },
    //         { id: 11, lon: 126.410992, lat: 37.534586 },
    //         { id: 12, lon: 126.382650, lat: 37.536025 },
    //         { id: 13, lon: 126.372803, lat: 37.470222 },
    //         { id: 14, lon: 126.402330, lat: 37.486197 },
    //         { id: 15, lon: 126.419208, lat: 37.453297 },
    //         { id: 16, lon: 126.423589, lat: 37.429380 },
    //         { id: 17, lon: 126.450053, lat: 37.433019 },
    //         { id: 18, lon: 126.422100, lat: 37.662244 },
    //         { id: 19, lon: 126.362836, lat: 37.668394 },
    //         // { id: 20, lon: 126.431732, lat: 37.683396 }, // 고정된 측정소가 아닌 이동차량
    //         { id: 20, lon: 126.601673, lat: 37.254875 },
    //         { id: 21, lon: 126.404875, lat: 37.528205 },
    //         { id: 22, lon: 126.417566, lat: 37.450233 },
    //         { id: 23, lon: 126.477725, lat: 37.274412 },
    //         { id: 24, lon: 126.454592, lat: 37.273014 },
    //         { id: 25, lon: 126.179475, lat: 37.481489 },
    //         { id: 26, lon: 126.217062, lat: 37.483263 },
    //         { id: 27, lon: 126.253594, lat: 37.483677 },
    //         { id: 28, lon: 126.290127, lat: 37.484080 },
    //         { id: 29, lon: 126.325001, lat: 37.484434 },
    //         // ... 더 많은 항목
    //     ];
    //     // const [anomsId] = latlon.filter((m) => m.lon === lon && m.lat === lat);
    //     const anomsId = latlon.find((m) => m.lon === lon && m.lat === lat);
    //     // console.log('anomsId.id: ' + anomsId.id);
    //     return anomsId ? anomsId.id : 0;
    // }

    _getAnomsId(seq, lat, lon) {
        const key = `${lat},${lon}`;
        if (this.stationCache.has(key)) {
            return this.stationCache.get(key);
        }

        // this.logger.warn(`Station not found in cache for LATITUDE: ${lat}, LONGITUDE: ${lon}`);
        console.log(`Station not found in cache for LATITUDE: ${lat}, LONGITUDE: ${lon}`);
        return 0;
    }

    // 메시지를 Oracle DB에 저장하는 함수
    // async function saveMessageToDB(noiseSample) {
    async  _saveMessageToDB(noiseSample) {
        console.log('check step _saveMessageToDB');
        let conn;
        try {

            const pool = oracledb.getPool('default');
            console.log('2 pool.poolAlias: '+ pool.poolAlias);
            conn = await pool.getConnection();
            console.log("2 Oracle DB 연결 성공!");

            const sql = `INSERT INTO NOISE_A_1S_SAMPLE_TEST (insertdate, measuredate, nmt, value) 
                        VALUES (:insertdate, :measuredate, :nmt, :value)`;
                        
            const result = await conn.execute(sql, { 
                            insertdate: noiseSample.insertdate, 
                            measuredate: noiseSample.measuredate, 
                            nmt: noiseSample.nmt, 
                            value: noiseSample.value
                        }, { autoCommit: true });

            // console.log(`${result.rowsAffected}개의 행이 입력되었습니다.`);
        } catch (err) {
            console.error("DB 저장 중 에러 발생: ", err);
        } finally {
            if (conn) {
                try {
                    await conn.close();
                    // console.log("DB 연결 해제 완료");
                } catch (err) {
                    console.error("DB 해제 중 에러: ", err);
                }
            }
        }
    }
}