var express = require('express');
var router = express.Router();
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
								} else {
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
		}).sort({ screenName: -1 }).toArray(function(err, screenNames) {
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
		db.collection("twitts").find({
			"user.screen_name": req.params.screenname
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

module.exports = router;
