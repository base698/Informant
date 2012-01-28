#!/usr/bin/env /usr/local/bin/node

var express = require('express');
var app = express.createServer();
var informant = require('./');
var store = new informant.MongoStore();
app.use(informant.middleware());

app.get('/',function(req,res) {
	res.send("Hello, World!");
});

informant.init(store);
app.listen(8080);
