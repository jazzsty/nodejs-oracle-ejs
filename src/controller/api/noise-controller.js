import { Router } from 'express';
import Logger from '../../util/logger.js';
import CacheManager from '../../util/cacheManager.js';
import { getDBConnection } from '../../util/dbConnection.js'; // DB 연결 관리 파일 추가
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

        // this.stationCache = new Map(); // 캐시로 사용 할 Map
        this.cacheManager = new CacheManager();
        this.stationCache = this.cacheManager.getCache();
        this._loadStationCache(); // 초기 로드
    }

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

    async _loadStationCache() {
        console.log('check step _loadStationCache');
        let conn;
        try {
            // const pool = oracledb.getPool('default');
            // console.log('1 pool.poolAlias: '+ pool.poolAlias);
            // conn = await pool.getConnection();
            // conn = await this.getDBConnection();
            conn = await getDBConnection();
            // console.log("1 Oracle DB 연결 성공!!");

            // console.log("현재 연결 풀 캐시:", oracledb.getPool().poolAlias);

            const sql = `SELECT seq, latitude, longitude FROM station_tbl`;

            const result = await conn.execute(sql);

            // console.log('result.rows: ', result.rows);
            if (!Array.isArray(result.rows)) {
                throw new Error("result.rows는 배열이 아닙니다.");
            }

            // 캐시 초기화 및 데이터 추가
            // result.rows.forEach(([seq, latitude, longitude]) => {
            result.rows.forEach(({SEQ, LATITUDE, LONGITUDE}) => {
                const key = `${LATITUDE},${LONGITUDE}`;
                // console.log('key: ', key);
                this.stationCache.set(key, SEQ);
            });

            this.logger.info(`_loadStationCache: Station cache loaded with ${this.stationCache.size} entries.`);
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
            // console.log('anomsId: ' + anomsId);
            // if (!centers.includes(anomsId)) {
            if (!anomsId) {
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
                await this._saveMessageToDB(noiseSample);
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
        // console.log('check step _saveMessageToDB');
        let conn;
        try {

            // const pool = oracledb.getPool('default');
            // console.log('2 pool.poolAlias: '+ pool.poolAlias);
            // conn = await pool.getConnection();
            // conn = await this.getDBConnection();
            conn = await getDBConnection();
            // console.log("2 Oracle DB 연결 성공!");

            const sql = `INSERT INTO NOISE_A_1S_SAMPLE_TEST (insertdate, measuredate, nmt, value) 
                        VALUES (:insertdate, :measuredate, :nmt, :value)`;
                        
            const result = await conn.execute(sql, { 
                            insertdate: noiseSample.insertdate, 
                            measuredate: noiseSample.measuredate, 
                            nmt: noiseSample.nmt, 
                            value: noiseSample.value
                        }, { autoCommit: true });

            console.log(`${result.rowsAffected}개의 행이 입력되었습니다.`);
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