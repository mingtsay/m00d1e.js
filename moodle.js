var request = require('request');
var iconv 	= require('iconv-lite');
var cheerio = require('cheerio');
var moment	= require('moment');
var jar = request.jar();

var username = 'username';
var password = 'password';

var moodleCourse = /^10502-\d{5}/;
var moodleNotUpload = /尚未繳交作業/;
var moodleLogin = 'http://moodle.mcu.edu.tw/login/';
var moodleAuth = 'http://moodle.mcu.edu.tw/auth/mnet/jump.php?hostid=';
var moodleHosts = [
    {hostid: '40', my: 'http://moodle.km.mcu.edu.tw/my/?mynumber=0', name: 'Kinmen Location'                , isLogin: false}, // Kinmen Location                  銘傳大學金門校區
    {hostid: '39', my: 'http://moodle-30.mcu.edu.tw/my/?mynumber=0', name: 'International College'          , isLogin: false}, // International College            國際學院
    {hostid: '38', my: 'http://moodle-29.mcu.edu.tw/my/?mynumber=0', name: 'Health Technology'              , isLogin: false}, // Health Technology                健康科技學院
    {hostid: '37', my: 'http://moodle-28.mcu.edu.tw/my/?mynumber=0', name: 'Social Sciences'                , isLogin: false}, // Social Sciences                  社會科學院
    {hostid: '36', my: 'http://moodle-27.mcu.edu.tw/my/?mynumber=0', name: 'Tourism'                        , isLogin: false}, // Tourism                          觀光學院
    {hostid: '35', my: 'http://moodle-26.mcu.edu.tw/my/?mynumber=0', name: 'Information Technology'         , isLogin: false}, // Information Technology           資訊學院
    {hostid: '34', my: 'http://moodle-25.mcu.edu.tw/my/?mynumber=0', name: 'Communication'                  , isLogin: false}, // Communication                    傳播學院
    {hostid: '33', my: 'http://moodle-24.mcu.edu.tw/my/?mynumber=0', name: 'Education and Applied Languages', isLogin: false}, // Education and Applied Languages  教育暨應用語文學院
    {hostid: '32', my: 'http://moodle-23.mcu.edu.tw/my/?mynumber=0', name: 'Law'                            , isLogin: false}, // Law                              法律學院
    {hostid: '31', my: 'http://moodle-22.mcu.edu.tw/my/?mynumber=0', name: 'Design'                         , isLogin: false}, // Design                           設計學院
    {hostid: '30', my: 'http://moodle-21.mcu.edu.tw/my/?mynumber=0', name: 'Management'                     , isLogin: false}, // Management                       管理學院
    {hostid: '29', my: 'http://moodle-20.mcu.edu.tw/my/?mynumber=0', name: 'Other'                          , isLogin: false}  // Other                            其他
], courses = [];

var loginViaAuth = function(i, callback) {
    request({
        url: moodleAuth + moodleHosts[i].hostid,
        method: 'POST',
        encoding: 'utf-8',
        followAllRedirects: true,
        jar: jar
    }, function (e, r, b) {
        callback(/logout\.php/.test(b), i);
    });
};

var login = function(username, password, callback) {
	request({
		url: moodleLogin,
		method: 'POST',
		encoding: 'utf-8',
		followAllRedirects: true,
		jar: jar,
		form: {
			username: username,
			password: password
		}
	}, function (e, r, b) {
		callback(/logout\.php/.test(b));
	});
};

var queryMyPage = function(i, callback) {
    request({
        url: moodleHosts[i].my,
        encoding: 'utf-8',
        jar: jar
    }, function(e, r, b) {
        analyzeMyPage(b, i, callback);
    });
};

var analyzeMyPage = function(html, j, callback) {
    var $ = cheerio.load(html), e = $('div.box.coursebox'), coursesCount = 0;

    for (var i = 0; i < e.length; ++i) {
        if (!moodleCourse.test($(e[i]).find('.title').text())) continue;
        ++coursesCount;
        courses.push({
            name: $(e[i]).find('.title').text(),
            link: $(e[i]).find('a').attr('href'),
            activities: analyzeActivities($, $(e[i]).find('.activity_info'))
        });
    }

    callback(coursesCount, j);
};

var analyzeActivities = function($, $activityElement) {
    var activities = {assignments: [], forums: []};

    var e = $activityElement.find('div.overview.assign');
    for (var i = 0; i < e.length; ++i) {
        var assignment = {
            name: $(e[i]).find('a').text(),
            link: $(e[i]).find('a').attr('href'),
            info: $(e[i]).find('.info').text(),
            details: $(e[i]).find('.details').text(),
        }, deadline = moment(assignment.info, 'YYYY MM D HH:mm');
        assignment.needsReview = moodleNotUpload.test(assignment.details);
        assignment.deadline = deadline.fromNow();
        assignment.remaining = deadline.unix();
        activities.assignments.push(assignment);
    }

    e = $activityElement.find('div.overview.forums');
    for (var i = 0; i < e.length; ++i) {
        activities.forums.push({
            name: $(e[i]).find('a').text(),
            link: $(e[i]).find('a').attr('href'),
            info: $(e[i]).find('.info').text()
        });
    }

    return activities;
};

moment.locale('zh-TW');

for (var i = 2; i < process.argv.length; ++i) {
    var arg = process.argv[i];
    
    if (arg.startsWith('--username=')) {
        username = arg.split('--username=')[1];
    } else if (arg.startsWith('-u=')) {
        username = arg.split('-u=')[1];
    } else if (arg.startsWith('--password=')) {
        password = arg.split('--password=')[1];
    } else if (arg.startsWith('-p=')) {
        password = arg.split('-p=')[1];
    }
}

console.error('Attempt to login with username: %s ......', username);
login(username, password, function(success) {
    if (!success) {
        console.error('Failed to login!');
        return;
    }

    var loginHosts = 0, loginHostsSuccess = 0, loginHostsQueried = 0;
    console.error('Login to all hosts...');
    for (var i = 0; i < moodleHosts.length; ++i) {
        console.error('Attempt to login to host: %s', moodleHosts[i].name);
        loginViaAuth(i, function(success, j) {
            ++loginHosts;
            moodleHosts[j].isLogin = success;
            if (success) {
                console.error('Login successfully to host: %s', moodleHosts[j].name);
                console.error('Query my page: %s', moodleHosts[j].name);
                queryMyPage(j, function(coursesCount, k) {
                    ++loginHostsQueried;
                    console.error('Got %d courses from host: %s', coursesCount, moodleHosts[k].name);
                    if (loginHostsQueried === moodleHosts.length) {
                        console.error('All done');
                        console.log(JSON.stringify(courses));
                    }
                });
                ++loginHostsSuccess;
            } else console.error('Failed to login to host: %s', moodleHosts[j].name);
        });
    }
});
