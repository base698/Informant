var util = require('util');
var os = require('os');
var express = require('express');
var socketio = require('socket.io');
var events = require('events');
var server_name = process.env.SERVER_NAME || "No name set."; 
var ObjectID = require('mongodb').BSONPure.ObjectID;
var df = require('./dateformat');
var _ = require('underscore');

var NO_LIMIT = false;
var LIMIT = 100;

var server_info = {
	server_name: server_name,
	hostname: os.hostname(),
	platform: os.platform(),
	started: new Date()
};

var get_system_info = function() {

	return {
		_id: 		 new ObjectID(),
		mem:      util.inspect(process.memoryUsage()),
		hostname: os.hostname(),
		cpus: os.cpus(),
		loadavg:  os.loadavg(),
		platform: os.platform(),
		freemem:  os.freemem()/1024/1024,
		totalmem: os.totalmem()/1024/1024,
		measured_at: new Date(),
		server_name: server_name,
		type:     "SYSTEM_INFO"
	};

}

var informant = function() {
	return function(req,res,next) {
		var start_time = new Date().getTime();
		req.on('end',function() {
			var end_time = new Date().getTime();
			var response_time = end_time - start_time;
			var rec = {
				_id: new ObjectID(),
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

var start_monitoring = function() {
	var store = informant.store;
	var io = informant.io;
	clearInterval(informant.stop_interval);
	informant.stop_interval = setInterval(
	function(){
		store.insert(get_system_info());
			store.find({},LIMIT,function(err,item) {
				if(err == null && item != null) {
					// Only emit events that are not this server.
					if(item.hostname != server_info.hostname) {
						io.sockets.volatile.emit(item.hostname,item);
					}
				}
			});
	},informant.interval);

}

var get_date = function (str) {
	var d = new Date();
	d.setTime(parseInt(str));
	return d;
}

//TODO: add total records for first cb

var do_query =	function(msg,limit,cb) {
	//TODO: persist aggregate
	var type = msg.type;
	var start = get_date(msg.start);
	var end = get_date(msg.end);
	var hostname = msg.hostname;
	var query = {};	
	var err = '';
	query.hostname = hostname;

	if(type) {
		query.type = type;
	}

	if(!start || !end) {
		if(!start) err += " Bad Dates for Start: "+msg.start;
		if(!end) err += " Bad Dates for End: "+msg.end;
	} else if(start > end) {
		err+="Start date must be before end date.";
	}

	if(err) {
		cb({error:err},null);
		return;
	}
		
	end.setDate(end.getDate()+1);
	query.measured_at = {'$gte':start,'$lt':end};
		
	informant.store.find(query,limit,function(err,item) {
		cb(null,item);		
	});
}


var init = function(store) {
	var env_var_interval = parseInt(process.env.INFORMANT_INTERVAL); 
	var interval = env_var_interval || 5000; 
	var env_var_port = parseInt(process.env.INFORMANT_PORT); 
	var port = env_var_port || 2222; 
	var env_store = process.env.INFORMANT_STORE;
	var store_class = informant[env_store]; 

	// TODO: add store_class lookup
	if(!store) {
		store = new MemStore();
	}
	
	console.log('Getting system information every: ' + interval + 'ms (set/export INFORMANT_INTERVAL to change)');
	console.log('Visit '+os.hostname()+':'+port+ '/informant for system information.');

	informant.interval = interval;
	informant.port = port;

	store = store || new MemStore();
	informant.store = store;

	var server = express.createServer()
	server.use(express.static(__dirname+'/../static'));

	var io = informant.io = socketio.listen(server);
	io.set('log level',1);	

	// Add emit to the insert so the data can be broadcast to listening client
	var insert = store.insert;
	store.insert = function(rec) {
		store.__emitter.emit('insert',rec);
		insert.call(store,rec);
	};

	// This is the real time feed for the machine.
	store.__emitter.on('insert',function(rec) {
		io.sockets.volatile.emit(server_info.hostname,rec);
	});

	store.__emitter.on('loaded',function(server) {
		store.add_machine(server);
	});


	var Totals = function() {
		this.min=Number.MAX_VALUE;
		this.max=Number.MIN_VALUE;
		this.lows=[];
		this.highs=[];
		this.avg = 0;
		this.count=0;
	
	}
	
	Totals.prototype = {
		inc_avg: function(new_num) {
			var new_avg;
			if(this.count == 0)
				new_avg = new_num;
			else 	
				new_avg = this.avg + (new_num-this.avg)/(this.count+1)
			this.avg = new_avg;
			return this.avg;
		},
		add: function(item) {
				
			this.inc_avg(item);
			if(item < this.min) {
				this.min = item;
			}
			if(item > this.max) {
				this.max = item;
			}
			this.count++;
		}

	}

	var Stats = function() {
		this.freemem = new Totals();
		this.totalmem= new Totals();
		this.loadavg=[new Totals(),new Totals(),new Totals()];
		this.requests = new Totals();
		this.cpus=[];
	}
	
	Stats.prototype = {
		aggregate: function(new_item) {
			// min/max
			// bottom 20/top 20
			if(new_item.type=='SYSTEM_INFO') {
				this.freemem.add(new_item.freemem);
				this.totalmem.add(new_item.totalmem);
				var loadavg = this.loadavg;
				_.each(this.loadavg,function(item,idx) {
					loadavg[idx].add(new_item.loadavg[idx]);	
				});
				var cpus = this.cpus;
				if(cpus.length == 0) {
					_.each(new_item.cpus,function(item,idx) {
						var cpu = {
							user:new Totals(),
							sys: new Totals(),
							idle: new Totals()
						};
						cpu.user.add(item.times.user);
						cpu.sys.add(item.times.sys);
						cpu.idle.add(item.times.idle);
						cpus.push(cpu);
					});
				} else {
					// this assumes the host never changed processers
					_.each(cpus,function(item,idx) {
						item.user.add(new_item.cpus[idx].times.user);
						item.sys.add(new_item.cpus[idx].times.sys);
						item.idle.add(new_item.cpus[idx].times.idle);
					});
				}
			 } else if(new_item.type =="REQUEST") {
			  // Requests
			  // response_time
			  // url
			  // hostname
			  // status_code
			  this.requests.add(new_item.response_time);
			 }

			 return this;
		}
	}

	io.sockets.on('connection',function(socket) {
		socket.emit('NEW_CLIENT',{rec:get_system_info(),hostname:os.hostname()});

		socket.on('QUERY',function(query) {

			var hour_format = 'yyyy-mm-dd HH:00:00';
			var min_format = 'yyyy-mm-dd HH:MM:00';
			var total = null;
			var total_count = 0;
			var last_measured = null;
			var stats = null;
			do_query(query,NO_LIMIT,function(err,item) {
				total_count++;
				if(err == null && item != null) {
					if(item.__total) {
						total = item.__total;
						socket.emit('QUERY_RESPONSE',item);
					} else {
						var current_measured = df(item.measured_at,hour_format);	

						if(current_measured == last_measured) {
							stats.aggregate(item);
						} else {
							// TODO: persist the aggregate record
							socket.emit('QUERY_RESPONSE',stats);
							socket.emit('QUERY_PROGRESS',{total:total,current:total_count});
							stats = new Stats();
							stats.measured_at = new Date(current_measured);
							stats.hostname = query.hostname;
						}
						last_measured = current_measured;
					}

				} else {
					socket.emit('QUERY_RESPONSE',{error:err,last:true});
				}

			});
		});

	});

	server.get('/servers',function(req,res) {
		store.get_machines(function(err,items) {
			if(err == null && items != null) {
				res.send(items);
			} else {
				res.send({error:err});
			}
		});
	});


	/* Controversial
	process.on('uncaughtException',function(err) {
		console.error(err);
	});
	*/

	start_monitoring();
	server.listen(informant.port);
}


var MongoStore = function(db_hostname,db_port) {
	var self = this;
	self.ready = false;
	this.__emitter = new events.EventEmitter();


	if(process.env.INFORMANT_DB_HOST) {
		db_hostname = process.env.INFORMANT_DB_HOST;
	}

	if(process.env.INFORMANT_DB_PORT) {
		db_port = process.env.INFORMANT_DB_PORT;
	}

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
			console.log("Error connecting to the MongoDB database at: "+db_hostname+":"+db_port);
			console.log("environment var: INFORMANT_DB_HOST: "+process.env.INFORMANT_DB_HOST); 
			console.log("environment var: INFORMANT_DB_PORT: "+process.env.INFORMANT_DB_PORT); 
		} else {
			self.ready = true;
			self.__emitter.emit('loaded',server_info);
			console.log('Using MongoDB for Storage@'+db_params.db_hostname+':'+db_params.db_port);
		}
	});
	

	this.insert = function(rec) {
		db_obj('informant_data').write(rec,function(err,rec){
			if(err != null) {
				console.error(err);
			}
		});
	}

	this.find = function(query,limit,cb) {
		db_obj('informant_data').ensureIndex({measured_at:-1});
		db_obj('informant_data').find(query,{},function(err,cursor) {
			
			cursor.sort({measured_at:-1}, function(err,cursor) {
				if(err) {
					cb(err,null);
					return;
				}

				cursor.count(function(err,total) {
					cb(err,{__total:total});
					if(limit) {
						cursor = cursor.limit(limit);
					}
					cursor.each(function(err,item){
						cb(err,item);
					});
				});

			});
		});

	};

	this.add_machine = function(rec) {
		db_obj('machines').update({hostname:rec.hostname},rec,function(err,rec){
			if(err !=null) console.error(err);	
		});
	};

	this.get_machines = function(cb) {
		db_obj('machines').find({},{},function(err,cursor){
			cursor.toArray(function(err,servers) {
						cb(err,servers);
			});
		});
	};

}

var MemStore = function() {
	var env_var_mem = parseInt(process.env.INFORMANT_MEM_STORAGE); 
	var mem_storage = env_var_mem || 2000; 

	this.machines = [];
	this.__emitter = new events.EventEmitter();
	console.log('Using MemStore for Storage with a history of '+mem_storage+' items.');
	this.mem = [];
	this.insert = function(rec) {
		this.mem.unshift(rec);
		if(this.mem.length>=mem_storage) {
			this.mem.pop();
		}
	};

	this.find = function(query,limit,cb) {
		cb(null,this.mem);
	};

	this.add_machine = function(rec) {
		this.machines.push(rec);
	};

	this.get_machines = function(cb) {
		cb(null,this.machines);
	}

	// add self
	this.add_machine(server_info);
};

exports.middleware = informant;
exports.init = init;
exports.MemStore = MemStore;
exports.MongoStore = MongoStore;

