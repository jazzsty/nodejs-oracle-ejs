const dbconfig = {
  user: "root",
  password: "1234",
  connectString: "localhost:1521/orcl",
  externalAuth: process.env.NODE_ORACLEDB_EXTERNALAUTH ? true : false,
  database: 'orcl',               // 데이터베이스 이름 (connectString에서 SID를 따름)
  host: 'localhost',              // 호스트 (connectString의 localhost 부분)
  sid: 'orcl',                    // SID (connectString에서 /orcl 부분)
  port: 1521,                     // 포트 번호 (기본 Oracle 포트)
};
export default dbconfig;