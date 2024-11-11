import winston from 'winston';
import winstonDaily from 'winston-daily-rotate-file';

const logDir = 'logs'; // log가 저장될 디렉토리
const { combine, timestamp, printf } = winston.format;

// Define log format
const logFormat = printf(info => {
    return `${info.timestamp} | ${info.level} | ${info.message}`;
});

class Logger {
    constructor() {
        this.logger = winston.createLogger({
            format: combine(
                timestamp({
                    format: 'YYYY-MM-DD HH:mm:ss a',
                }),
                logFormat,
            ),
            transports: [
                // info 레벨 로그를 저장할 파일 설정
                new winstonDaily({
                    level: 'http',
                    datePattern: 'YYYY-MM-DD',
                    dirname: logDir,
                    filename: `%DATE%.log`,
                    maxFiles: 30,  // 30일치 로그 파일 저장
                    zippedArchive: true,
                }),
                // error 레벨 로그를 저장할 파일 설정
                new winstonDaily({
                    level: 'error',
                    datePattern: 'YYYY-MM-DD',
                    dirname: logDir + '/error',  // error.log 파일은 /logs/error 하위에 저장
                    filename: `%DATE%.error.log`,
                    maxFiles: 30,
                    zippedArchive: true,
                }),
                // Console로 출력
                new winston.transports.Console({
                    level: 'http',
                    format: winston.format.combine(
                        winston.format.colorize(),  // 색깔 넣어서 출력
                        logFormat, 
                    )
                })
            ],
        });
    }

    // 로그 메서드 추가
    info(message) {
        this.logger.info(message);
    }

    debug(message) {
        this.logger.debug(message);
    }

    error(message) {
        this.logger.error(message);
    }

    // 필요에 따라 다른 로그 레벨 메서드 추가 가능
}

export default Logger; // 인스턴스 생성 후 내보내기
