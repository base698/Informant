var util = require('util');
var os = require('os');
var express = require('express');
var socketio = require('socket.io');
var events = require('events');
var server_name = process.env.SERVER_NAME; 

var server_info = {
	server_name: server_name,
	hostname: os.hostname(),
	platform: os.platform(),
	started: new Date()
};

var save_status = function(store) {

	var rec = {
		mem:      util.inspect(process.memoryUsage()),
		hostname: os.hostname(),
		cpus: os.cpus(),
		loadavg:  os.loadavg(),
		platform: os.platform(),
		freemem:  os.freemem(),
		totalmem: os.totalmem(),
		measured_at: new Date(),
		server_name: server_name,
		type:     "SYSTEM_INFO"
	};

	store.insert(rec);
}

var informant = function() {
	var env_var_interval = parseInt(process.env.INFORMANT_INTERVAL); 
	var interval = env_var_interval || 5000; 
	var env_var_port = parseInt(process.env.INFORMANT_PORT); 
	var port = env_var_port || 2222; 
	
	console.log('Getting system information every: ' + interval + 'ms (set/export INFORMANT_INTERVAL to change)');
	console.log('Visit '+os.hostname()+':'+port+ '/informant for system information.');

	informant.interval = interval;
	informant.port = port;
	
	return function(req,res,next) {
		var start_time = new Date().getTime();
		req.on('end',function() {
			var end_time = new Date().getTime();
			var response_time = end_time - start_time;
			var rec = {
				type: 'REQUEST',
				measured_at: new Date(),
				response_time:response_time,
				hostname: os.hostname(),
				client_ip: req.connection.remoteAddress,
				status_code: res.statusCode,
				url: req.url
			};
			informant.store.insert(rec);

		});
		next();

	}
}

var init = function(store) {
	informant.store = store || new MemStore();
	informant.store.__emitter = new events.EventEmitter();
	clearInterval(informant.stop_interval);
	informant.stop_interval = setInterval(function(){save_status(store)},informant.interval);
	var server = express.createServer()
	server.use(express.static(__dirname+'/../static'));
	var io = informant.io = socketio.listen(server);
	
	// Add emit to the insert so the data can be broadcast to listening client
	var insert = store.insert;
	store.insert = function(rec) {
		store.__emitter.emit('insert',rec);
		insert.call(store,rec);
	};

	store.__emitter.on('insert',function(rec) {
		io.sockets.volatile.emit(rec.type,rec);
	});

	store.__emitter.on('loaded',function(server) {
		store.add_machine(server);
	});

	io.sockets.on('connection',function(socket) {
		/*socket.on('all',function(data) {
			store.find({},function(err,records) {
				if(err != null) {
					socket.emit(records);
				} else {
					console.err(err);
				}
			});

			console.log(data);
		});
		*/
	});

	server.get('/informant/servers',function(req,res) {
		store.get_machines(function(err,servers) {
			if(err == null) {
				res.send(servers);
			} else {
				res.send(err);
			}
		});
	});

	server.listen(informant.port);

}


var MongoStore = function(db_hostname,db_port) {
	var self = this;
	self.ready = false;

	var db_params = {
		db_name: 'informant',
		db_hostname: db_hostname || 'localhost',
		db_port: db_port || 27017
	}

	//  Database wrapper methods
	var db = require('./db_wrapper');
	var db_connection = db.db_connection;
	var db_connect = db.db_connect;
	var db_obj = db.db_obj;

	db_connect(db_params, function(err) { 
		if(err) {
			console.log("Error connecting to the MongoDB database.");
		} else {
			self.ready = true;
			self.__emitter.emit('loaded',server_info);
			console.log('Using MongoDB for Storage@'+db_params.db_hostname+':'+db_params.db_port);
		}
	});
	

	this.insert = function(rec) {
		db_obj('informant_data').write(rec,function(err,rec){
			if(err != null) {
				console.err(err);
			}
		});
	}

	this.find = function(query,cb) {
		db_obj('informant').find(query,cb);
	};


	this.add_machine = function(rec) {
		db_obj('machines').update({hostname:rec.hostname},rec,function(err,rec){
			if(err !=null) console.err(err);	
		});
	};

	this.get_machines = function(cb) {
		db_obj('machines').find({},{},cb);
	};

}

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

exports.middleware = informant;
exports.init = init;
exports.MemStore = MemStore;
exports.MongoStore = MongoStore;

