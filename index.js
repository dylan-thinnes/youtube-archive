var path = require('path');
var fs	 = require('fs');
var https = require('https');
var cp = require('child_process');
//var ytdl = require('ytdl-core');
/*var playlistId = (process.argv[2] && process.argv[2] !== "null") ? process.argv[2] : "UUmlRzNnfE0Qae_Ufn7NidIg";
var directory = (process.argv[3] && process.argv[3] !== "null") ? process.argv[3] : "~";
var title = (process.argv[4] && process.argv[4] !== "null") ? process.argv[4] : "playlist";
var verbose = (process.argv[5] && process.argv[5] === "true") ? true : false;
var googleAPIKey = (process.argv[6] && process.argv[6] !== "null") ? process.argv[6] : "AIzaSyATdBFjBBgA5r_GELdAzqbyGpi4x8mKkBo";
var extraCheckDirs = (process.argv.length > 7) ? process.argv.slice(7) : [];
//console.log(process.argv);
const baseAPIEndpoint = "/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=" + playlistId + "&fields=items(snippet(resourceId%2FvideoId%2Ctitle))%2CnextPageToken&key="+googleAPIKey;
var playlistAPIData = [];
var playlistAPIDataLength = 0;
var finalOutput = "";
var file = title + ".sh";*/

var printResults = function () {
	//console.log(extraCheckDirs);
	var existingIDs = [];
	for (var ii = 0; ii < extraCheckDirs.length; ii++) {
		var tempFileNames = fs.readdirSync(extraCheckDirs[ii]);
		for (var jj = 0; jj < tempFileNames.length; jj++) {
			existingIDs.push(tempFileNames[jj].replace(/.+-(.{11})\.(mp4|webm)/g, "$1"));
		}
	}
	for (var ii = 0; ii < playlistAPIData.length; ii++) {
		//console.log(playlistAPIData[ii]);
		//console.log("youtube-dl -o \"" + directory + "/%(title)s-%(id)s.%(ext)s\" https://www.youtube.com/watch?v=" + playlistAPIData[ii].snippet.resourceId.videoId);
		//console.log(playlistAPIData[ii].snippet.resourceId.videoId, existingIDs.indexOf(playlistAPIData[ii].snippet.resourceId.videoId));
		if (existingIDs.indexOf(playlistAPIData[ii].snippet.resourceId.videoId) === -1) finalOutput += "youtube-dl -o \"" + directory + "/%(title)s-%(id)s.%(ext)s\" https://www.youtube.com/watch?v=" + playlistAPIData[ii].snippet.resourceId.videoId + "\n";
	}
	//console.log(existingIDs);
	console.log(finalOutput);
	fs.writeFileSync(file, finalOutput);
	fs.chmod(file, 0755, () => {});
}


var IdDictionary = function (dictionaryFile, initCallback) {
	this.ids = [];
	this.dictionaryFile = dictionaryFile;
	this.initCallback = initCallback;
	this.newWrite = false;
	if (typeof this.dictionaryFile === "string") {
		console.log("getting dictionaryFile...");
		fs.readFile(this.dictionaryFile, "utf8", (function (err, res) {
			if (err) console.log(this.newWrite = true);
			else this.ids = this.ids.concat(res.split("\n"));
			fs.open(this.dictionaryFile, "a", this.setFile.bind(this));
		}).bind(this));
	} else {
		console.log("init done...");
		this.initCallback();
	}

	/*if (typeof directories === "string") this.addDirectory(directories);
	else if (typeof directories === "object" && directories.constructor === Array) {
		for (var ii = 0; ii < directories.length; ii++) {
			this.addDirectory(directories[ii]);
		}
	}*/
}
IdDictionary.prototype.setFile = function (err, fd) {
	//console.log("setting file to fd...")
	this.file = fd;
	//console.log("init done...");
	this.initCallback();
}
IdDictionary.prototype.writeId = function (id) {
	if (this.file !== undefined) fs.write(this.file, (this.newWrite ? "" : "\n") + id, () => {});
	if (this.newWrite === true) this.newWrite = false;
}
IdDictionary.prototype.extractIdsFromFileNames = function (fileNames) {
	var results = [];
	for (var ii = 0; ii < fileNames.length; ii++) {
		var tempRes = fileNames[ii].replace(/.+(.{11})\.\w{2,4}/g, "$1");
		if (typeof tempRes === "string") results.push(tempRes);
	}
	return results;
}
IdDictionary.prototype.idExists = function (id) {
	if (this.ids.indexOf(id) !== -1) return true;
	else return false;
}
IdDictionary.prototype.idsDontExist = function (ids) {
	var result = [];
	for (var ii = 0; ii < ids.length; ii++) {
		if (this.ids.indexOf(ids[ii]) === -1) result.push(ids[ii]);
	}
	return result;
}
IdDictionary.prototype.addId = function (id) {
	if (this.ids.indexOf(id) === -1) {
		this.ids.push(id);
		this.writeId(id);
	}
}
IdDictionary.prototype.addIds = function (ids) {
	for (var ii = 0; ii < ids.length; ii++) {
		this.addId(ids[ii]);
	}
}
IdDictionary.prototype.addDirectory = function (directory) {
	fs.readdir(directory, (function (err, res) {
		//console.log(res);
		this.addIds(this.extractIdsFromFileNames(res));
	}).bind(this));
}
module.exports.iddict = IdDictionary;



var DlManager = function (threads, ids, options, callback, completeCallback) {
	this.threads = threads;
	this.ids = [];
	this.addIds(ids);
	//this.idPointer = 0;
	this.processes = new Array(this.threads);
	this.options = (options ? options : "");
	this.logs = [];
	this.callback = callback;
	this.complete = false;
	this.completeCallback = function () {
		this.complete = true;
		completeCallback();
	}
}
DlManager.prototype.addIds = function (ids) {
	this.ids = this.ids.concat(ids);
}
DlManager.prototype.runNextId = function (index) {
	if (this.ids.length === 0) {
		if (this.complete === false) this.completeCallback();
	} else {
		var id = this.ids.pop()
		this.logs[id] = [];
		this.setProcess(index, id);
		this.callback(id);
	}
}
DlManager.prototype.setProcess = function (index, id) {
	this.processes[index] = cp.exec(`youtube-dl https://www.youtube.com/watch?v=${id}`);
	this.processes[index].on("close", this.runNextId.bind(this, index));
	this.processes[index].stdout.on("data", this.logOutput.bind(this, id));

	/*var cp = require("child_process");
	var testProc = cp.exec("youtube-dl https://www.youtube.com/watch?v=KWKYpy__lfA");
	testProc.on("close", console.log);
	testProc.stdout.on("data", console.log);*/
}
DlManager.prototype.logOutput = function (id, data) {
	this.logs[id].push(data);
}
module.exports.dl = DlManager;


var APIPlaylistData = function (playlistId, APIKey, callback) {
	this.id = playlistId;
	this.APIKey = APIKey;
	this.baseAPIEndpoint = `/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&fields=items(snippet(resourceId%2FvideoId%2Ctitle))%2CnextPageToken&key=${APIKey}`;
	this.videos = [];
	this.return = function (returnValue) {
		if (returnValue !== undefined) callback(returnValue);
		else callback(this.videos);
	}
	this.requestAPIData();
}
APIPlaylistData.prototype.parseAPIData = function (response) {
	var responseString = "";
	response.on("data", function (chunk) {
		responseString += chunk;
	});
	response.on("end", function () {
		var responseJSON = JSON.parse(responseString);
		Array.prototype.apply(videos, responseJSON.items);
		if (responseJSON.nextPageToken !== undefined) this.requestAPIData(responseJSON.nextPageToken);
		else this.return();
	});
}
APIPlaylistData.prototype.requestAPIData = function (pageToken) {
	https.get({
		protocol: "https:",
		host: "www.googleapis.com",
		path: this.baseAPIEndpoint + ((pageToken !== undefined) ? "&pageToken=" + pageToken : "")
	}).on("response", this.parseAPIData.bind(this));
}
module.exports.apipd = APIPlaylistData;




/*var test = new IdDictionary("./test.txt", function () {
	test.addDirectory("/media/dylan-thinnes/VERNE/videos/rlm/highlights");
});*/


/*var nextYoutubePage = function(nextPageToken){

}*/
/*var songlist = fs.openFileSync(__dirname + "videoList.txt");

function playlist(url) {

	'use strict';
	var video = ytdl(url);

	video.on('error', function error(err) {
		console.log('error 2:', err);
	});

	var size = 0;
	video.on('info', function(info) {
		size = info.size;
		var output = path.join(__dirname + 'videos/', size + '.mp4');
		video.pipe(fs.createWriteStream(output));
	});

	var pos = 0;
	video.on('data', function data(chunk) {
		pos += chunk.length;
		// `size` should not be 0 here.
		if (size) {
			var percent = (pos / size * 100).toFixed(2);
			process.stdout.cursorTo(0);
			process.stdout.clearLine(1);
			process.stdout.write(percent + '%');
		}
	});
	video.on('next', playlist);
}

playlist('https://www.youtube.com/playlist?list=PLJ5l1Fqq-I3trtQ5ab9kvukUcCvko_Kn3');*/
