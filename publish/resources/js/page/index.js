const socket = io();

// 소음측정 시작 후 장애 확인 시
socket.on('error', function (message) {
    $("#resultError").html(message);
    // 중지버튼 비활성화
    $("#stopBtn").prop('disabled', true);
    // 입력 form 활성화
    $("#noiseForm").find('input').prop('disabled', false);
    // 시작버튼 활성화
    $("#startBtn").prop('disabled', false);
    // 결과보기 중지
    $("#resultStopBtn").trigger('click');
});

// 소음측정 결과 확인
socket.on('result', function (result) {
    $("#resultMinus").html(result.minus);
    $("#resultOver").html(result.over);
    $("#resultIgnore").html(result.ignore);
    $("#resultSuccess").html(result.success);
    $("#resultFail").html(result.fail);
    $("#resultAll").html(result.all);
});

// 소음측정 시작
$(document).on('click', '#startBtn', (e) => {
    noiseSampleStart();
});
// 소음측정 중지
$(document).on('click', '#stopBtn', (e) => {
    noiseSampleStop();
});
// 소음측정 결과보기 시작
$(document).on('click', '#resultStartBtn', (e) => {
    socket.emit('result', true);
    $("#resultStartBtn").hide();
    $("#resultStopBtn").show();
});
// 소음측정 결과보기 중지
$(document).on('click', '#resultStopBtn', (e) => {
    socket.emit('result', false);
    $("#resultStopBtn").hide();
    $("#resultStartBtn").show();
});

function noiseSampleStart() {
    // param 설정
    var host = $("#host");
    var port = $("#port");
    var site = $("#site");
    var centers = $("input:checkbox[name=check]:checked");
    if (host.val() == '') {
        alert('호스트 주소를 입력해 주세요.');
        return;
    }
    if (port.val() == '') {
        alert('포트를 입력해 주세요.');
        return;
    }
    if (site.val() == '') {
        alert('');
        return;
    }

    // console.log('host: ' + host.val);
    // console.log('port: ' + port.val);
    // console.log('site: ' + site.val);
    // console.log('centers.length: ' + centers.length);
    var centerVals = [];
    if (centers.length < 1) {
        alert('측정소를 최소 1개를 선택해 주세요.');
        return;
    } else {
        centers.each(function (idx, checkbox) {
            centerVals.push(parseInt($(checkbox).val(), 10));
        });
    }

    var param = JSON.stringify({
        host: host.val(),
        port: port.val(),
        site: site.val(),
        centers: centerVals
    });
    // console.log('param: ' + param);
    $.ajax({
        type: 'post',
        url: '/api/noise/start',
        data: param,
        contentType: 'application/json',
        dataType: 'json',
        success: function (response) {
            console.log(response);
            // 시작버튼 비활성화
            $("#startBtn").prop('disabled', true);
            // 입력 form 비활성화
            $("#noiseForm").find('input').prop('disabled', true);
            // 중지버튼 활성화
            $("#stopBtn").prop('disabled', false);
            // 에러 메시지 초기화
            $("#resultError").html('');
        },
        error: function (jqXHR, textStatus, errorThrown) {
            console.log(jqXHR);
            console.log(textStatus);
            console.log(errorThrown);
        }
    });
}

function noiseSampleStop() {
    var param = JSON.stringify({});
    $.ajax({
        type: 'post',
        url: '/api/noise/stop',
        contentType: 'application/json',
        dataType: 'json',
        success: function (response) {
            console.log(response);
            // 중지버튼 비활성화
            $("#stopBtn").prop('disabled', true);
            // 입력 form 활성화
            $("#noiseForm").find('input').prop('disabled', false);
            // 시작버튼 활성화
            $("#startBtn").prop('disabled', false);
            // 결과보기 중지
            $("#resultStopBtn").trigger('click');
        },
        error: function (jqXHR, textStatus, errorThrown) {
            console.log(jqXHR);
            console.log(textStatus);
            console.log(errorThrown);
        }
    })

}
