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
var YTScrape = function () {
	this.init = function (commandLineArgs) {
		this.videoIds = [];
		this.playlistIds = [];
		this.playlistObjects = [];
		this.directories = [];
		this.state = {
			playlistsDone: 0,
			dictionaryDone: false,
			downloadsDone: false
		}
		this.argIndexes = {
			key: commandLineArgs.indexOf("-k"),
			//customOptionFile: commandLineArgs.indexOf("-o"),
			playlistId: commandLineArgs.indexOf("-p"),
			logging: commandLineArgs.indexOf("-l"),
			threads: commandLineArgs.indexOf("-t"),
			dictionary: commandLineArgs.indexOf("-d"),
			directories: commandLineArgs.indexOf("-s"),
			//nodict: commandLineArgs.indexOf("-n"),
			videos: commandLineArgs.indexOf("-v")
		}
		this.optionsChosen = {
			dictionary: false,
			directory: false,
			playlist: false,
			videos: false
		}
		this.argHandlers = {
			key: function (key) {
				if (key === undefined) this.API_KEY = "AIzaSyATdBFjBBgA5r_GELdAzqbyGpi4x8mKkBo";
				else this.API_KEY = key;
			},
			/*customOptionFile: function (optionFile) {
				var optionFile = fs.readFileSync(optionFile);
				var options = JSON.parse(optionFile);
				if (optionFile.dictionary === undefined) this.dictionary = new YTScrape.IdDictionary("/dict.txt", this.stageControl.bind(this, "dictionaryDone"));
				if (optionFile.dictionary !== undefined) this.argHandlers.dictionary(optionFile.dictionary);
					this.dictionary = new YTScrape.IdDictionary(optionFile.dictionary, this.stageControl.bind(this, "dictionaryDone")); 
					this.optionsChosen.dictionary = true;
				}
				if (optionFile.searchDirs !== undefined) {
					for (var ii = 0; ii < optionFile.searchDirs.length; ii++) {
						this.dictionary.addDirectory(optionFile.searchDirs[ii]);
					}
				}
				if (optionFile.playlists !== undefined) {
					for (var ii = 0; ii < optionFile.playlists.length; ii++) {
						this.playlistIds.push(optionFile.playlists[ii]);
					}
				}
				if (optionsFile.threads !== undefined) {
					this.threads = optionsFile.threads;
				}
				if (optionsFile.logging === true) {
					this.logging = true;
				}
				if (optionsFile.key !== undefined) {
					this.API_KEY = optionsFile.key;	
				}
			},*/
			playlistId: function (id) {
				if (id === undefined) return;
				else {
					this.playlistIds.push(id);
					this.optionsChosen.playlist = true;
				}
			},
			logging: function () {
				this.logging = true;
			},
			threads: function (threadCount) {
				this.threads = parseInt(threadCount);
			},
			dictionary: function (dictionaryPath) {
				if (this.dictionaryPath === undefined) this.dictionary = new YTScrape.IdDictionary("tempDict.txt", this.stageControl.bind(this, "dictionaryDone"));
				else {
					this.dictionary = new YTScrape.IdDictionary(dictionaryPath, this.stageControl.bind(this, "dictionaryDone"));	
				}
				this.optionsChosen.dictionary = true;
			},
			directories: function (directories) {
				if (directories === undefined) return;
				var directoriesArray = JSON.parse(directories);
				/*for (var ii = 0; ii < directoriesArray.length; ii++) {
					this.dictionary.addDirectory(directoriesArray[ii]);
				}*/
				this.directories = directoriesArray;
				this.optionsChosen.directories = true;
			},
			videos: function (videos) {
				if (videos === undefined) return;
				var videosArray = JSON.parse(videos);
				for (var ii = 0; ii < videosArray.length; ii++) {
					this.videoIds.push({name: videosArray[ii], id: videosArray[ii]});
				}
				this.optionsChosen.videos = true;
			}
		}
		for (var key in this.argIndexes) {
			if (this.argIndexes[key] === -1) this.argHandlers[key].call(this);
			else this.argHandlers[key].call(this, commandLineArgs[this.argIndexes[key] + 1]);
		}
		this.stageControl("initDone");
	}
}
YTScrape.prototype.handleNewSnippets = function (snippets) {
	for (var ii = 0; ii < snippets.length; ii++) {
		//console.log("Dictionary currently contains: ", this.dictionary.ids);
		var undownloadedIds = this.dictionary.idsDontExist([snippets[ii].id]);
		for (var jj = 0; jj < undownloadedIds.length; jj++) {
			console.log("Add new video " + undownloadedIds[jj] + " to download queue.")
			this.downloader.addId(undownloadedIds[jj]);
		}
	}
}
YTScrape.prototype.stageControl = function (event) {
	//console.log("stageControl called with event: ", event);
	if (event === "dictionaryDone") {
		this.state.dictionaryDone = true;
	}
	if (event === "initDone") {
		this.state.initDone = true;
	}
	if (event === "playlistsDone") {
		this.state.playlistsDone++;
	}
	if (event === "videoReadDone") {
		this.state.videoReadDone = true;
	}

	if (this.state.dictionaryDone === true && this.state.initDone === true && this.state.playlistsStarted !== true) {
		for (var ii = 0; ii < this.directories.length; ii++) {
			this.dictionary.addDirectory(this.directories[ii]);
		}
		console.log("Download playlist data through API.");
		this.state.playlistsStarted = true;
		this.startPlaylists();
	} else if (this.state.dictionaryDone === true && this.state.initDone === true && this.state.playlistsDone === this.playlistObjects.length && this.state.videoReadDone === true) {
		this.state.videoReadDone = false;
		this.startDownload();
	}
}
YTScrape.prototype.startPlaylists = function () {
	if (this.playlistIds.length === 0 && this.videoIds.length === 0) {
		console.log("Nothing to download! Abort.");
	} else {
		//console.log("Beginning download of data for " + this.playlistIds.length + " playlists and " + this.videoIds.length + " videos.");
		this.downloader = new YTScrape.DlManager(this.threads, [], undefined, this.dictionary.addId.bind(this.dictionary), console.log.bind(process, "Download complete!"));
		//console.log("videoIds: ", this.videoIds);
		this.handleNewSnippets(this.videoIds);
		for (var ii = 0; ii < this.playlistIds.length; ii++) {
			console.log("Start downloading data for playlist " + this.playlistIds[ii] + ".");
			this.playlistObjects.push(new YTScrape.ApiPlaylistData(this.playlistIds[ii], this.API_KEY, (function (id, res) {
				console.log("Finish downloading data for playlist " + id + ".");
				this.handleNewSnippets(res);
				this.stageControl("playlistsDone");
			}).bind(this, this.playlistIds[ii])));
		}
		//this.downloader.addSnippets(this.videoIds);
		/*for (var ii = 0; ii < this.videoIds.length; ii++) {
			this.downloader.addSnippet(this.videoIds[ii]);
		}*/
		this.stageControl("videoReadDone");
	}
}
YTScrape.prototype.startDownload = function () {
	if (this.downloader.snippets.length !== 0) {
		console.log("Start download.");
		this.downloader.startDownload();
	} else {
		console.log("Nothing to download! Abort download.");
	}
	//console.log("startDownload called");
	//console.log("Printing snippets: ", this.downloader.snippets);
}
module.exports = YTScrape;

var IdDictionary = function (filePath, initCallback) {
	this.ids = [];
	this.filePath = filePath;
	this.initCallback = initCallback;
	this.newWrite = false;
	if (typeof this.filePath === "string") {
		fs.readFile(this.filePath, "utf8", (function (err, res) {
			if (err) console.log("Creating new file for IdDictionary.", this.newWrite = true);
			else {
				//console.log(res, res.split("\n"));
				this.ids = this.ids.concat(res.split("\n"));
			}
			fs.open(this.filePath, "a", this.setFile.bind(this));
		}).bind(this));
	} else {
		this.initCallback();
	}
}
IdDictionary.prototype.setFile = function (err, fd) {
	this.file = fd;
	this.initCallback();
}
IdDictionary.prototype.writeId = function (id) {
	if (this.file !== undefined) fs.write(this.file, (this.newWrite ? "" : "\n") + id, () => {});
	if (this.newWrite === true) this.newWrite = false;
}
IdDictionary.prototype.extractIdsFromFileNames = function (fileNames) {
	var results = [];
	for (var ii = 0; ii < fileNames.length; ii++) {
		var tempRes = fileNames[ii].replace(/[^\n]*(.{11})\.(mp4|3gp|aac|flv|m4a|ogg|wav|webm)/g, "$1");
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
	console.log("Reading directory " + directory + "to find already downloaded files.");
	var res = fs.readdirSync(directory);
	//console.log("res:", res);
	this.addIds(this.extractIdsFromFileNames(res));
}
YTScrape.IdDictionary = IdDictionary;



var DlManager = function (threads, snippets, options, callback, completeCallback) {
	this.threads = threads ? threads : 1;
	this.threadsFinished = 0;
	this.snippets = [];
	this.addSnippets(snippets);
	//this.idPointer = 0;
	this.processes = new Array(this.threads);
	this.options = (options ? options : "");
	this.logs = [];
	this.callback = callback;
	this.complete = false;
	this.completeCallback = function () {
		completeCallback();
	}
}
DlManager.prototype.addSnippets = function (snippets) {
	this.snippets = this.snippets.concat(snippets);
}
DlManager.prototype.addSnippet = function (snippet) {
	//console.log("addSnippet called with parameters:". arguments);
	this.snippets.push(snippet);
}
DlManager.prototype.addId = function (id) {
	//console.log("addId called");
	this.snippets.push({
		name: id,
		id: id
	});
}
DlManager.prototype.runNextSnippet = function (index) {
	if (this.snippets.length === 0) {
		this.threadsFinished++;
		if (this.complete === false && this.threadsFinished === this.threads) {
			this.complete = true;	
			this.completeCallback();
		}
	} else {
		var snippet = this.snippets.pop();
		this.logs[snippet.id] = [];
		this.setProcess(index, snippet);
	}
}
DlManager.prototype.setProcess = function (index, snippet) {
	var id = snippet.id;
	var name = snippet.name;
	console.log(`Start downloading video ${name}.`);
	this.processes[index] = cp.exec(`youtube-dl https://www.youtube.com/watch?v=${id}`);
	this.processes[index].on("close", this.closeProcess.bind(this, name, id, index));
	this.processes[index].stdout.on("data", this.logOutput.bind(this, id));
}
DlManager.prototype.closeProcess = function (name, id, index) {
	this.callback(id);
	console.log(`Finish downloading video ${name}.`);
	this.runNextSnippet(index);
}
DlManager.prototype.logOutput = function (id, data) {
	this.logs[id].push(data);
}
DlManager.prototype.startDownload = function () {
	//console.log(this.snippets);
	for (var ii = 0; ii < this.threads; ii++) {
		this.runNextSnippet(ii);
	}
}
YTScrape.DlManager = DlManager;



var ApiPlaylistData = function (playlistId, APIKey, callback) {
	this.id = playlistId;
	this.APIKey = APIKey/*AIzaSyATdBFjBBgA5r_GELdAzqbyGpi4x8mKkBo*/;
	this.baseAPIEndpoint = `/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&fields=items(snippet(resourceId%2FvideoId%2Ctitle))%2CnextPageToken&key=${APIKey}`;
	this.videos = [];
	this.return = function (returnValue) {
		if (returnValue !== undefined) callback(returnValue);
		else callback(this.videos);
	}
	this.requestAPIData();
}
ApiPlaylistData.prototype.parseAPIData = function (response) {
	this.responseString = "";
	response.on("data", this.addChunk.bind(this));
	response.on("end", this.addVideos.bind(this));
}
ApiPlaylistData.prototype.addVideos = function () {
	var responseJSON = JSON.parse(this.responseString);
	//Array.prototype.push.apply(this.videos, responseJSON.items);
	for (var ii = 0; ii < responseJSON.items.length; ii++) {
		this.videos.push({snippet: responseJSON.items[ii].snippet.title, id: responseJSON.items[ii].snippet.resourceId.videoId});
	}
	if (responseJSON.nextPageToken !== undefined) this.requestAPIData(responseJSON.nextPageToken);
	else this.return();
}
ApiPlaylistData.prototype.addChunk = function (chunk) {
	this.responseString += chunk;
}
ApiPlaylistData.prototype.requestAPIData = function (pageToken) {
	https.get({
		protocol: "https:",
		host: "www.googleapis.com",
		path: this.baseAPIEndpoint + ((pageToken !== undefined) ? "&pageToken=" + pageToken : "")
	}).on("response", this.parseAPIData.bind(this));
}
ApiPlaylistData.prototype.getVideoIds = function () {
	var videoIds = [];
	for (var ii = 0; ii < snippets.length; ii++) {
		videoIds[ii] = this.videos[ii].id;
	}
	return videoIds;
}
YTScrape.ApiPlaylistData = ApiPlaylistData;


var scraper = new YTScrape();
scraper.init(process.argv.slice(2));
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
