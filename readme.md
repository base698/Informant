Overview
Running
Running Tests
Store API
Memory Store

# Informant

Informant is a lightweight way to monitor server resources in real-time.  It can be used as an Express.JS middleware or standalone.  When running as middleware each request is logged to the provided store.

## Viewing the realtime interface:
   Navigate to 
```html
http://<server where you are running informant>:2222/
```
	![Screenshot](https://github.com/base698/Informant/raw/master/static/screenshot.png)

## How to Install

    npm install informant

## How to use

First, require `informant`:

```js
var informant = require('informant');
```

If you are using it as middleware with Express:

```js
var express = require('express');
var app = express.createServer();
app.use(informant.middleware());
informant.init();
app.listen(8080);
```

If you are using it as a standalone app:

    cd <node_modules where informant installed>
	 node run

## Environment Variables

Setting these three environment variables effects the operation of informant:

	INFORMANT_PORT         = Port the server interface response (default is 2222)
	INFORMANT_INTERVAL     = Sample rate in milliseconds for data (default is 5000)
	INFORMANT_MEM_STORAGE  = Number of items the Memory Store will retain is 2000

## Store API

The Store API is a simple API designed to persist data.  If no store is supplied then the in memory store will be used.

Stores conform to this interface:

```js
	cb = function(err,records) {}
	var store = {
		insert: function(record) {}
		find: function(query,cb) {}
		add_machine: function(record) {}
		get_machines: function(cb) {}
	}
```

The supplied stores are:

```js
var informant = require('informant');
var mem_store = new informant.MemStore();
var mongo_store = new informant.MongoStore();
```

To use a store, pass it into the init method:

```js
app.use(informant.middleware());
informant.init(mongo_store);
```

MemoryStore example:

```js
var MemStore = function() {
   var env_var_mem = parseInt(process.env.INFORMANT_MEM_STORAGE); 
   var mem_storage = env_var_mem || 2000; 

   this.machines = [];
 
   console.log('Using MemStore for Storage with a history of '+mem_storage+' items.');
   this.mem = [];
   this.insert = function(rec) {
      this.mem.push(rec);
      if(this.mem.length>=mem_storage) {
         this.mem.shift();
      }
   };

   this.find = function(query,cb) {
      cb(null,this.mem);
   };

   this.add_machine = function(rec) {
      this.machines.push(rec);
   };

   this.get_machines = function(cb) {
      cb(null,this.machines);
   }


};
```

