#!/usr/bin/env node
var path = require('path');
var fs	 = require('fs');
var https = require('https');
var cp = require('child_process');
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
			playlistId: commandLineArgs.indexOf("-p"),
			threads: commandLineArgs.indexOf("-t"),
			dictionary: commandLineArgs.indexOf("-d"),
			directories: commandLineArgs.indexOf("-s"),
			help: commandLineArgs.indexOf("-h"),
			videos: commandLineArgs.indexOf("-v")
		}
		this.optionsChosen = {
			dictionary: false,
			directory: false,
			playlist: false,
			videos: false
		}
		this.argHandlers = {
			help: function () {
				console.log(`
Usage: youtube-scrape [options]

Options:
-d <path>         Path to dictionary to use.
                  Defaults to tempDict.txt
-h                Display this help dialog.
-k <key>          Define custom key for Google API.
-p <id>           ID of playlist to download.
-s <directories>  JSON-formatted array of paths to directories to search for id collisions.
-t <n>            Number of videos to consecutively download.
-v <videos>       JSON-formatted array of videos to add to the download queue.
`);	
			},
			key: function (key) {
				if (key === undefined) {
					this.API_KEY === undefined;
					console.log("No API key supplied, you're on your own from here on out.");
				} else {
					try {
						this.API_KEY = fs.readFileSync(key, "utf8").toString().slice(0, -1);
						console.log("Using API key at path: " + key);
					} catch (e) {
						console.log("Error getting API key file. Exiting with code 1.");
						process.exit(1);
					}
				}
			},
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
		if (this.argIndexes["help"] !== -1) {
			this.argHandlers["help"]();	
		} else {
			for (var key in this.argIndexes) {
				if (key === "help") continue;
				if (this.argIndexes[key] === -1) this.argHandlers[key].call(this);
				else this.argHandlers[key].call(this, commandLineArgs[this.argIndexes[key] + 1]);
			}
		}
		this.stageControl("initDone");
	}
}
YTScrape.prototype.handleNewSnippets = function (snippets) {
	for (var ii = 0; ii < snippets.length; ii++) {
		var undownloadedIds = this.dictionary.idsDontExist([snippets[ii].id]);
		for (var jj = 0; jj < undownloadedIds.length; jj++) {
			console.log("Add new video " + undownloadedIds[jj] + " to download queue.")
			this.downloader.addId(undownloadedIds[jj]);
		}
	}
}
YTScrape.prototype.stageControl = function (event) {
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
		this.downloader = new YTScrape.DlManager(this.threads, [], undefined, this.dictionary.addId.bind(this.dictionary), console.log.bind(process, "Download complete!"));
		this.handleNewSnippets(this.videoIds);
		for (var ii = 0; ii < this.playlistIds.length; ii++) {
			console.log("Start downloading Google API data for playlist " + this.playlistIds[ii] + ".");
			this.playlistObjects.push(new YTScrape.ApiPlaylistData(this.playlistIds[ii], this.API_KEY, (function (id, res) {
				console.log("Finish downloading data for playlist " + id + ".");
				this.handleNewSnippets(res);
				this.stageControl("playlistsDone");
			}).bind(this, this.playlistIds[ii])));
		}
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
}
module.exports = YTScrape;

var IdDictionary = function (filePath, initCallback) {
	this.ids = [];
	this.filePath = filePath;
	this.initCallback = initCallback;
	this.newWrite = false;
	if (typeof this.filePath === "string") {
		fs.readFile(this.filePath, "utf8", (function (err, res) {
			if (err) {
				console.log("Creating new file for IdDictionary.");
				this.newWrite = true;
			} else {
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
	this.addIds(this.extractIdsFromFileNames(res));
}
YTScrape.IdDictionary = IdDictionary;



var DlManager = function (threads, snippets, options, callback, completeCallback) {
	this.threads = threads ? threads : 1;
	this.threadsFinished = 0;
	this.snippets = [];
	this.addSnippets(snippets);
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
	this.snippets.push(snippet);
}
DlManager.prototype.addId = function (id) {
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
	console.log(`Downloading video ${name}...`);
	this.processes[index] = cp.exec(`youtube-dl https://www.youtube.com/watch?v=${id}`, this.closeProcess.bind(this, name, id, index));
	this.processes[index].stdout.on("data", this.logOutput.bind(this, id));
}
DlManager.prototype.closeProcess = function (name, id, index, err) {
	this.callback(id);
	if (err) console.log(`Couldn't download video ${name}, you probably need to log in.`)
	else console.log(`Finish downloading video ${name}.`);
	this.runNextSnippet(index);
}
DlManager.prototype.logOutput = function (id, data) {
	this.logs[id].push(data);
}
DlManager.prototype.startDownload = function () {
	for (var ii = 0; ii < this.threads; ii++) {
		this.runNextSnippet(ii);
	}
}
YTScrape.DlManager = DlManager;



var ApiPlaylistData = function (playlistId, APIKey, callback) {
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
ApiPlaylistData.prototype.parseAPIData = function (response) {
	this.responseString = "";
	response.on("data", this.addChunk.bind(this));
	response.on("end", this.addVideos.bind(this));
}
ApiPlaylistData.prototype.addVideos = function () {
	var responseJSON = JSON.parse(this.responseString);
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
scraper.init(process.argv);
