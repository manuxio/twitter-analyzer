var express = require('express');
var router = express.Router();
var comparison = null;
var stopcomparison = false;
var comparisonProgress = null;
var comparisonResult = null;
var comparisonError = null;

function decStrNum (n) {
	n = n.toString();
	var result=n;
	var i=n.length-1;
	while (i>-1) {
		if (n[i]==="0") {
			result=result.substring(0,i)+"9"+result.substring(i+1);
			i --;
		}
		else {
			result=result.substring(0,i)+(parseInt(n[i],10)-1).toString()+result.substring(i+1);
			return result;
		}
	}
	return result;
}

/* GET home page. */
router.get('/', function(req, res, next) {
	res.render('index', { title: 'Twitter Analyzer' });
});

router.get('/addaccount', function(req, res, next) {
	res.render('addaccount', { title: 'Twitter Analyzer' });
});

router.post('/analyzeaccount', function(req, res, next) {
	if (!req.body.twitterAccount || req.body.twitterAccount.length == 0) {
		next(true);
		return;
	}
	var MongoClient = require('mongodb').MongoClient;
	MongoClient.connect("mongodb://127.0.0.1/nicola", function(err, db) {
		if (err || !db) {
			next(err);
			return;
		} else {
			db.collection("screenNames").update(
			{
				screenName: req.body.twitterAccount
			},
			{
				screenName: req.body.twitterAccount,
				lastOp: new Date()
			},{
				upsert: true
			}, function(err) {
				db.collection("twitts").findOne({
					"$query": {
						"user.screen_name": req.body.twitterAccount
					},
					"$orderby": {
						"created_at_time": -1
					}
				}, function(err, twit) {
					var update = false;
					if (twit) {
						update = true;
					}
					var Twitter = require('twitter');
					var client = new Twitter({
						consumer_key: 'x0Bq8qe5B4TlESfNc3Nw',
						consumer_secret: 'OOlKoGKXw2YoiiM8kC9IxENbAr40c0eng7TsYoDKqEE',
						access_token_key: '135802731-ddSB2A2ByQig7rQZ1E5xYECHVF6xL1KF5dQQHPcg',
						access_token_secret: 'F59F7q1kW4KhM7AZLct7CtGnSH3C9hFpwxZ0tYC6Pg'
					});
					var params = {
						screen_name: req.body.twitterAccount,
						contributor_details: true,
						count: 200
					};
					if (update) {
						params.since_id = twit.id_str
					}
					var total = 0;

					var gettwitts = function(params, callback) {
						console.log("Getting twitts", params);
						client.get('statuses/user_timeline', params, callback);
					};

					var callback = function(err, tweets, response) {
						if (err) {
							next(err);
							return;
						}
						if (tweets && tweets.length > 0) {
							console.log("Got " + tweets.length + " twitts back from twitter.com");
							if (tweets.length == 1) {
								console.log(params, tweets);
							}
							for (var i = 0; i < tweets.length; i++) {
								tweets[i].created_at_time = new Date(Date.parse(tweets[i].created_at));
							}
							db.collection("twitts").insert(tweets, function(err) {
								if (err) {
									next(err);
								} else {3
									console.log("Written to db " + (tweets.length) + " twitts");
									total = total + tweets.length;
									if (update) {
										params.since_id = tweets[0].id_str;
										gettwitts(params, callback);
									} else {
										params.max_id = decStrNum(tweets[tweets.length - 1].id_str);
										gettwitts(params, callback);
									}

								}
							});
						} else {
							console.log("Done");
							db.collection("twitts").findOne({
								"$query": {
									"user.screen_name": req.body.twitterAccount
								},
								"$orderby": {
									"created_at_time": -1
								}
							}, function(err, lastTwit) {
								db.collection("twitts").findOne({
									"$query": {
										"user.screen_name": req.body.twitterAccount
									},
									"$orderby": {
										"created_at_time": 1
									}
								}, function(err, firstTwit) {
									db.collection("screenNames").update({
										screenName: req.body.twitterAccount
									}, {
										$set: {
											firstTweet: firstTwit,
											lastTwit: lastTwit
										}
									}, function(err) {
										res.render('accountupdated', {
											updated: update,
											screen_name: req.body.twitterAccount,
											total: total
										});
										return;
									});
								});
							});
							
						}
					};

					gettwitts(params, callback);



				});
			});

		}
	});

});

router.get('/analyze', function(req, res, next) {
	var MongoClient = require('mongodb').MongoClient;
	MongoClient.connect("mongodb://127.0.0.1/nicola", function(err, db) {
		if (err) {
			next(err);
			return;
		}
		db.collection("screenNames").find({
		}).sort({ screenName: 1 }).toArray(function(err, screenNames) {
			res.render('analyzer', { 
				title: 'Twitter Analyzer',
				names: screenNames
			});
		});
		
	});
});

router.get('/twits/:screenname', function(req, res, next) {
	var MongoClient = require('mongodb').MongoClient;
	MongoClient.connect("mongodb://127.0.0.1/nicola", function(err, db) {
		if (err) {
			next(err);
			return;
		}
		console.log({
			"user.screen_name": /req.params.screenname/i
		});
		db.collection("twitts").find({
			"user.screen_name": new RegExp(req.params.screenname, "i")
		}).sort({ created_at_time: 1 }).toArray(function(err, tweets) {
			var results = [];
			for (var i = 0; i < tweets.length; i++) {
				var o = {};
				o._id = tweets[i]._id;
				o.created_at_time = tweets[i].created_at_time;
				o.text = tweets[i].text;
				o.id = tweets[i].id_str;
				results.push(o);
			}
			res.json(results);
		});
		
	});
});

router.get('/compare', function(req, res, next) {
	res.render('compare', { title: 'Twitter Analyzer' });
});

router.get('/compareprogress', function(req, res, next) {
	if (!comparison && comparisonProgress == "done") {
		res.json({
			"continue": false,
			"progress": comparisonProgress,
			"result": comparisonResult,
			"error": false
		});
		comparisonResult = null;
		comparisonProgress = null; 
		return;
	}
	
	if (!comparison) {
		res.json({
			"continue": false,
			"error": true,
			"errorString": comparisonError || "No comparison"
		});
		return;
	}
	
	if (comparison) {
		res.json({
			"continue": true,
			"progress": comparisonProgress,
			"result": comparisonResult,
			"error": false
		});
		
		return;
	}
	
});

router.post('/compareaccounts', function(req, res, next) {
	var inprogress = false;
	var errorStrings = [];
	if (comparison !== null) {
		inprogress = true;
		errorStrings.push('E\' gi&agrave; in corso una comparazione. Annulla la precedente comparazione per avviarne una nuova');
	}
	if (errorStrings.length == 0) {
		if (!req.body.primaryTwitterAccount || req.body.primaryTwitterAccount == "") {
			errorStrings.push("Devi specificare l'account primario.");
		}
		if (!req.body.secondaryTwitterAccount) {
			errorStrings.push("Devi specificare l'account secondario. Questo limite sar&agrave; eliminato nella prossima versione.");
		}
		if (req.body.startDate && !req.body.endDate) {
			errorStrings.push("Se specifichi una data di inizio devi specificare anche una data di fine.");
		}
		
	}
	if (errorStrings.length == 0) {
		comparisonProgress = null;
		comparison = compare(req)
		.then(function(result) {
			console.log("Finished");
			comparisonProgress = "done";
			comparisonResult = result;
			comparison = null;
		}, function() {
			console.log("Error");
			comparison = null;
			stopcomparison = false;
		}, function(p) {
			console.log("Progress:", p);
			comparisonProgress = p;
		});
	}
	
	res.render('compareaccounts', { 
		title: 'Twitter Analyzer',
		errorStrings: errorStrings,
		inprogress: inprogress,
		primaryTwitterAccount: req.body.primaryTwitterAccount,
		secondaryTwitterAccount: req.body.secondaryTwitterAccount,
	});
});

var Q = require('q');
var async = require('async');

var compare = function(req) {
	var deferred = Q.defer()
  var MongoClient = require('mongodb').MongoClient;
  var db, 
  	masterTwitts = [], 
  	masterTwittsIds = [],
  	slaveTwitts = [], 
  	slaveTwittsIds = [],
  	retwitted = {},
  	retwitts = {},
  	retwittedCount = 0,
  	retwittsCount = 0,
  	globalSlaveRetwittsCount = 0,
  	globalSlaveRetwittsIds = [],
  	retwittsTotalDelay = 0,
  	slaveRetwitts = 0,
  	slaveRetwittsIds = [],
  	masterFirstTwit = null,
  	masterLastTwit = null,
  	slaveFirstTwit = null,
  	slaveLastTwit = null;
  var properties = req.body;
  async.series([
  	function(cb) { // Connect to db
  		if (stopcomparison) {
  			deferred.reject();
  			return;
  		}
  		MongoClient.connect("mongodb://127.0.0.1/nicola", function(err, database) {
				if (err) {
					deferred.reject(err) // rejects the promise with `er` as the reason
				} else {
		    	deferred.notify("Database connected");
		    	db = database;
		    	cb(null) // fulfills the promise with `data` as the value
		    }
			});
  	},
  	function(cb) { // Find twitts for the master
  		if (stopcomparison) {
  			deferred.reject();
  			return;
  		}
  		var findObject = {
  			"user.screen_name": new RegExp(properties.primaryTwitterAccount,"i")
  		};
  		if (properties.startDate) {
  			findObject.created_at_time = { $gte: new Date(Date.parse(properties.startDate))  };
  			findObject.created_at_time = { $lte: new Date(Date.parse(properties.endDate))  };
  		}
  		db.collection("twitts").find(findObject).sort({created_at_time: 1}).toArray( function(err, twitts) {
  			if (stopcomparison) {
	  			deferred.reject();
	  			cb(true);
	  			return;
	  		}
  			masterTwitts = twitts;
  			for (var i = 0; i < twitts.length; i++) {
  				masterTwittsIds.push(twitts[i].id_str);
  				if (i == 0) {
  					masterFirstTwit = twitts[i];
  				}
  				if (i == twitts.length-1) {
  					masterLastTwit = twitts[i];
  				}
  			}
  			deferred.notify("Loaded " + twitts.length + " master twitts");
  			cb(null);
  		});
  	},
  	function(cb) { // Find twitts for the slave
  		if (stopcomparison) {
  			deferred.reject();
  			return;
  		}
  		var findObject = {
  			"user.screen_name": new RegExp(properties.secondaryTwitterAccount,"i")
  		};
  		if (properties.startDate) {
  			findObject.created_at_time = { $gte: new Date(Date.parse(properties.startDate))  };
  			findObject.created_at_time = { $lte: new Date(Date.parse(properties.endDate))  };
  		}
  		console.log(findObject);
  		db.collection("twitts").find(findObject).sort({created_at_time: 1}).toArray( function(err, twitts) {
  			if (stopcomparison) {
	  			deferred.reject();
	  			cb(true);
	  			return;
	  		}
  			slaveTwitts = twitts;
  			for (var i = 0; i < twitts.length; i++) {
  				slaveTwittsIds.push(twitts[i].id_str);
  				if (i == 0) {
  					slaveFirstTwit = twitts[i];
  				}
  				if (i == twitts.length-1) {
  					slaveLastTwit = twitts[i];
	  			}
  			}
  			deferred.notify("Loaded " + twitts.length + " slave twitts");
  			cb(null);
  		});
  	},
  	function(cb) { // Find global retwitts
  		if (stopcomparison) {
  			deferred.reject();
  			return;
  		}
  		deferred.notify("Collecting retwitts data");
  		var findObject = {
 				"user.screen_name": new RegExp(properties.secondaryTwitterAccount,"i"),
 				"retweeted_status": { $ne: null }
 			};
 			if (properties.startDate) {
  			findObject.created_at_time = { $gte: new Date(Date.parse(properties.startDate))  };
  			findObject.created_at_time = { $lte: new Date(Date.parse(properties.endDate))  };
  		}
  		console.log(findObject);
 			db.collection("twitts").find(findObject).toArray(function(err, twit) {
 				slaveRetwitts = twit.length;
 				for (var i = 0; i < twit.length; i++) {
 					slaveRetwittsIds.push({
 						id_str: twit[i].id_str,
 						text: twit[i].text,
 						created_at_time: twit[i].created_at_time,
 						retwitted_user: twit[i].retweeted_status.user.screen_name,
 						delay: twit[i].created_at_time.getTime() - (new Date(Date.parse(twit[i].retweeted_status.created_at))).getTime()
 					});
 				}
 				if (stopcomparison) {
	  			deferred.reject();
	  			cb(true);
	  			return;
	  		}
 				cb();
 			});
  	},
  	function(cb) { // Find retwitts of the master (no filter)
  		if (stopcomparison) {
  			deferred.reject();
  			return;
  		}
  		deferred.notify("Searching retwitts of the master (global)");
  		var findObject = {
 				"user.screen_name": new RegExp(properties.secondaryTwitterAccount,"i"),
 				"retweeted_status.user.screen_name": new RegExp(properties.primaryTwitterAccount,"i")
 			};
 			console.log(findObject);
 			db.collection("twitts").find(findObject).toArray(function(err, twitts) {
 				globalSlaveRetwittsCount = twitts.length;
 				for (var i = 0; i < twitts.length; i++) {
  				globalSlaveRetwittsIds.push({
  					id_str: twitts[i].id_str,
  					
  				});
  			}
 				if (stopcomparison) {
	  			deferred.reject();
	  			cb(true);
	  			return;
	  		}
 				cb();
 			});
  	},
  	function(cb) { // Find retwitts of the master (selected only)
  		if (stopcomparison) {
  			deferred.reject();
  			return;
  		}
  		deferred.notify("Searching retwitts of the master (filtered)");
  		async.map(masterTwitts, function(mtwit, cb) {
  			if (stopcomparison) {
	  			deferred.reject();
	  			cb(true);
	  			return;
	  		}
  			var findObject = {
  				"user.screen_name": slaveFirstTwit.user.screen_name,
  				"retweeted_status.id_str": mtwit.id_str
  			};
  			if (properties.startDate) {
	  			findObject.created_at_time = { $gte: new Date(Date.parse(properties.startDate))  };
	  			findObject.created_at_time = { $lte: new Date(Date.parse(properties.endDate))  };
	  		}
  			db.collection("twitts").find(findObject).toArray(function(err, twit) {
  				
  				if (twit && twit.length > 0) {
  					var shorttwit = [];
  					for (var i = 0; i < twit.length; i++) {
  						var tDiff = twit[i].created_at_time.getTime() - mtwit.created_at_time.getTime();
  						twit[i].tDiff = tDiff;
  						retwittsTotalDelay += tDiff;
  						shorttwit.push({ id_str: twit[i].id_str, text: twit[i].text, created_at_time: twit[i].created_at_time });
  					}
  					retwitted[mtwit.id_str] = { id_str: mtwit.id_str, text: mtwit.text, created_at_time: mtwit.created_at_time };
  					retwitts[mtwit.id_str] = shorttwit;
  					retwittedCount++;
  					retwittsCount += twit.length;
  				}
  				cb(); 
  			});
  		}, function() {
  			cb();
  		});
  	}
  ], function(err) {
  	db.close();
  	deferred.resolve({
  		masterTwittsIds: masterTwittsIds, 
  		slaveTwittsIds: slaveTwittsIds, 
  		slaveRetwitts: slaveRetwitts,
  		retwitted: retwitted,
  		retwitts: retwitts,
  		retwittsTotalDelay: retwittsTotalDelay,
  		retwittedCount: retwittedCount,
  		retwittsCount: retwittsCount,
  		globalSlaveRetwittsCount: globalSlaveRetwittsCount,
  		globalSlaveRetwittsIds: globalSlaveRetwittsIds,
  		slaveRetwittsIds: slaveRetwittsIds,
  		slaveFirstTwit: slaveFirstTwit,
  		slaveLastTwit: slaveLastTwit,
  		masterFirstTwit: masterFirstTwit,
  		masterLastTwit: masterLastTwit,
  		properties: properties
  	});
  });
	
  return deferred.promise;
  
};



router.get('/searchretweeters', function(req, res, next) {
	var MongoClient = require('mongodb').MongoClient;
	MongoClient.connect("mongodb://127.0.0.1/nicola", function(err, db) {
		if (err) {
			next(err);
			return;
		}
		db.collection("screenNames").find({
		}).toArray(function(err, users) {
			var data = { users: [] };
			async.map(users, function(user, callback) {
				db.collection("twitts").count({
					"user.screen_name" : new RegExp(user.screenName, "i"),
					retweeted_status: { '$eq': null } 
				}, function(err, original) {
					db.collection("twitts").count({
						"user.screen_name" : new RegExp(user.screenName, "i"),
						retweeted_status: { '$ne': null } 
					}, function(err, retweets) {
						data.users.push({ screenName: user.screenName, original: original, retweets: retweets});
						callback();
					});
				});
			}, function() {
				res.render("listretweeters", data);
			});
			
		});
		
	});
});

module.exports = router;
