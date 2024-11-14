import 'reflect-metadata';
import { createServer } from 'http';
import debug from 'debug';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';
import session from 'express-session';
import compression from 'compression';
import { v4 as uuidv4 } from 'uuid';
import Logger from './util/logger.js';
import { NoiseApiController } from './controller/api/noise-controller.js';
import { IndexViewController } from './controller/views/index-controller.js';
import { Server as SocketIO } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import oracledb from 'oracledb';
import dbconfig from './config/dbconfig.js';
import config from './config/config.js';

// import cors from 'cors';

if (process.env.NODE_ENV !== 'production') {
    debug.enable('* -engine* -socket* -RIE* *WARN* *ERROR*');
}
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class App {
    constructor() {
        this.logger = new Logger();
        this.logger.info(`process.env.UV_THREADPOOL_SIZE: ${process.env.UV_THREADPOOL_SIZE}`);
        console.log(`process.env.UV_THREADPOOL_SIZE: ${process.env.UV_THREADPOOL_SIZE}`);

        this.app = express();
        this.noiseApiController = new NoiseApiController(); // noiseApiController 초기화 추가
        this._initMiddleware();
    }

    _initMiddleware() {
        this.app.use(helmet.hsts());
        this.app.use(cookieParser());
        this.app.use(compression());
        this.app.use(bodyParser.json());
        this.app.use(bodyParser.urlencoded({ extended: true }));
        
        // CORS 설정
        // this.app.use(cors({
        //     origin: "*",                // 출처 허용 옵션
        //     credentials: true,          // 응답 헤더에 Access-Control-Allow-Credentials 추가
        //     optionsSuccessStatus: 200,  // 응답 상태 200으로 설정
        // }))

        // View 설정
        this.app.set('views', path.join(__dirname, `../publish/views`));
        this.app.set('view engine', 'ejs');

        this.session = session({
            secret: config.cookieSecret,
            name: config.cookieName,
            resave: true,
            saveUninitialized: true,
            cookie: {
                secure: true,
                httpOnly: true,
                maxAge: 60 * 60 * 1000, // Expire after 1 hour since last request from user
            },
        });

        this.app.use(this.session);
    }

    // 연결 풀 통계 출력 함수
    async _printPoolStatistics() {
        try {
            const pool = oracledb.getPool();
            if (pool) {  // 연결 풀이 정상적으로 존재하는지 확인
                console.log("===== Oracle DB Connection Pool Statistics =====");
                console.log(`Pool Alias: ${pool.poolAlias}`);
                console.log(`Pool Minimum: ${pool.poolMin}`);
                console.log(`Pool Maximum: ${pool.poolMax}`);
                console.log(`Pool Increment: ${pool.poolIncrement}`);
                console.log(`Open Connections: ${pool.connectionsOpen}`);
                console.log(`In Use Connections: ${pool.connectionsInUse}`);
                // 대기 중인 요청 수를 추정
                const waitingConnections = Math.max(0, pool.connectionsOpen - pool.poolMax);
                console.log(`Estimated Waiting Connections: ${waitingConnections}`); // 대기 중인 연결 수
                console.log("================================================");
            } else {
                console.warn("연결 풀이 아직 생성되지 않았습니다.");
            }
        } catch (err) {
            console.error("연결 풀 통계 출력 중 오류 발생:", err);
        }
    }

    async _runHttpsServer() {
        this._ejsServer();
        // this._apiServer();

        this.mainListener = createServer(this.app); // http 서버 설정

        try {
            // await oracledb.createPool(dbconfig);
            await oracledb.createPool({
                user: dbconfig.user,
                password: dbconfig.password,
                connectString: dbconfig.connectString,
                poolMin: 1,          // 최소 연결 수
                poolMax: 5,         // 최대 연결 수를 늘립니다.s
                poolIncrement: 1,    // 연결이 필요할 때 추가되는 수
                queueMax: 100000,      // 대기열의 최대 길이를 늘립니다.
                queueTimeout: 120000 // 대기열 타임아웃 증가 (120초)
            });
            this.logger.info(`Oracle createPool() 성공!!`);

            // 10초마다 현재 연결 풀 통계를 출력
            // setInterval(() => this._printPoolStatistics(), 10000); // this 바인딩을 위해 화살표 함수 사용
        } catch (e) {
            this.logger.error(`Oracle createPool() 연결 실패: ${e.message}`);
            throw e; // by jazzsty
        }

        this.mainListener.listen(config.listeningPort, () => {
            if (process.send !== undefined) {
                process.send('ready'); // pm2 wait_ready 대응용
            }
            this.logger.debug(`Server is Running on port: ${config.listeningPort}`);
        });

        const _gracefulShutdown = async () => {
            try {
                // Oracle DB 연결 종료
                // await oracledb.getPool().close();
                this.logger.debug('Oracle DB 연결이 성공적으로 종료되었습니다.');
            } catch (dbError) {
                this.logger.error('Oracle DB 연결 종료 중 에러 발생: ', dbError);
            }
        
            try {
                // 서버 리스너 종료
                await new Promise((resolve, reject) => {
                    this.mainListener.close((err) => {
                        if (err) {
                            this.logger.error('서버 종료 중 에러 발생: ', err);
                            reject(err);
                        } else {
                            this.logger.debug('서버가 정상적으로 종료되었습니다.');
                            resolve();
                        }
                    });
                });
            } catch (serverError) {
                this.logger.error('서버 종료 처리 중 에러 발생: ', serverError);
            }
        
            // 종료 작업이 완료되었음을 알리는 로그
            this.logger.info('모든 종료 작업이 완료되었습니다. 서버가 안전하게 종료되었습니다.');

            // 모든 작업이 완료된 후에만 프로세스를 종료
            process.exit(0);
        };

        // process 정상종료 시
        process.once('SIGINT', () => {
            console.log('>>>>>>>>>> SIGINT 시스널 처리 : Ctrl + c <<<<<<<<<<<<');
            setTimeout(_gracefulShutdown, 2000);
        });

        // nodemon 재시작 전용 : windows SIGUSR2 는 지원되지 않아서 SIGTERM 으로 대체함
        process.once('SIGUSR2', () => {
            console.log('>>>>>>>>>> SIGUSR2 시스널 처리 : Nodemon이 코드 변경 감지 <<<<<<<<<<<<');
            _gracefulShutdown();
        });

        this.mainListener.on('close', async () => {
            this.logger.debug('서버가 닫혔습니다.');
        });
    }

    _apiServer() {
        this.noiseApiController = new NoiseApiController();

        // const urlMapping = '/api';
        this.app.use('/api/noise', this.noiseApiController.router()); // 소음측정 소켓 클라이언트 관리
    }

    _ejsServer() {
        this.app.use(express.static(path.join(__dirname, `../publish/resources`))); // 정적파일 제공 경로 설정
        // this.app.use('/', new IndexViewController(this.app).router());
        const indexViewController = new IndexViewController(this.app);
        this.app.use('/', indexViewController.getRouter());
    }

    _runSocketIoServer() {
        const io = new SocketIO(this.mainListener, { cors: { origin: '*' } });

        let resultFlag = false;

        io.on('connection', (socket) => {
            // 소음측정 socket error 발생 시
            this.noiseApiController.on('noise-error', (message) => {
                socket.emit('error', message);
            });
            // 소음측정 결과 저장 용
            this.noiseApiController.on('noiseSampleMessage', (result) => {
                if (resultFlag) {
                    socket.emit('result', result);
                }
            });
            // 결과보기 flag
            socket.on('result', (flag) => {
                resultFlag = flag;
            });
        });
    }

    async run() {
        this.logger.info(`process.env.NODE_ENV : ${process.env.NODE_ENV}`);
        await this._runHttpsServer();
        this._runSocketIoServer();

        const errorHandler = (err, req, res, next) => {
            const trackingId = uuidv4();

            res.status(500).send(
                `<h1>Internal Server Error</h1>
                <p>If you report this error, please also report this
                <i>tracking ID</i> which makes it possible to locate your session
                in the logs which are available to the system administrator:
                <b>${trackingId}</b></p>`
            );
            this.logger.error(
                'Express error handler dump with tracking ID: %s, error dump: %o',
                trackingId,
                err
            );
        };

        this.app.use(errorHandler);
    }
}

new App().run();
