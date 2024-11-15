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
            
            // const noiseSample = new NoiseSample();
            // noiseSample.insertdate = new Date();
            // noiseSample.measuredate = this._adjustMeasurementTime(message.time);
            // noiseSample.nmt = anomsId;
            // noiseSample.value = sampleValue;

            // const noiseSample = new Map();
            // noiseSample.set("insertdate", new Date());
            // noiseSample.set("measuredate", this._adjustMeasurementTime(message.time));
            // noiseSample.set("nmt", anomsId);
            // noiseSample.set("value", sampleValue);

            const noiseSample = {};
            noiseSample.insertdate = new Date();
            noiseSample.measuredate = this._adjustMeasurementTime(message.time);
            noiseSample.nmt = anomsId;
            noiseSample.value = sampleValue;

            this.logger.debug(`NoiseSample 저장 중: ${JSON.stringify(noiseSample)}`);
            try {
                await saveMessageToDB(noiseSample);
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

    _getAnomsId(id, lat, lon) {
        // if (id > 0) {
        //     return id;
        // }
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
        // const [anomsId] = latlon.filter((m) => m.lon === lon && m.lat === lat);
        const anomsId = latlon.find((m) => m.lon === lon && m.lat === lat);
        console.log('anomsId.id: ' + anomsId.id);
        return anomsId ? anomsId.id : 0;
    }
}

// 메시지를 Oracle DB에 저장하는 함수
async function saveMessageToDB(noiseSample) {
    let conn;
    try {

        const pool = oracledb.getPool();
        conn = await pool.getConnection(dbconfig);
        // console.log("Oracle DB 연결 성공!");

        const sql = `INSERT INTO NOISE_A_1S_SAMPLE_TEST (insertdate, measuredate, nmt, value) 
                    VALUES (:insertdate, :measuredate, :nmt, :value)`;
                    
        const result = await conn.execute(sql, { 
                        insertdate: noiseSample.insertdate, 
                        measuredate: noiseSample.measuredate, 
                        nmt: noiseSample.nmt, 
                        value: noiseSample.value
                    }, { autoCommit: true });

        // const result = await conn.execute(sql, { 
        //                 insertdate: noiseSample.get("insertdate"), 
        //                 measuredate: noiseSample.get("measuredate"), 
        //                 nmt: noiseSample.get("nmt"), 
        //                 value: noiseSample.get("value")
        //             }, { autoCommit: true });

        // const result = await conn.execute(sql, { 
        //             insertdate: new Date(), 
        //             measuredate: adjustMeasurementTime(message.time), 
        //             nmt: Number.parseInt(message.id), 
        //             value: Number.parseFloat(message.sample).toFixed(1)
        //         }, { autoCommit: true });

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

// function adjustMeasurementTime(time) {
//     const measurementTime = new Date(time);
//     return new Date(measurementTime.getTime() - 9 * 60 * 60000); // UTC 보정
// }
// NoiseResult 인터페이스를 주석으로 정의합니다.
// NoiseResult: { minus: number, over: number, ignore: number, success: number, fail: number, all: number }

// SocketInfo: { host?: string, port?: number, site?: string, centers?: number[] }

// NoiseSamples: { id: number, time: string, lat: number, lon: number, metric: string, sample: number }
