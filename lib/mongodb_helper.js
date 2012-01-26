(function() {
  var BSON, Binary, Connection, GridStore, MongoDB, MongoDBConnector, ObjectID, mongodb;
  var __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

  mongodb = require('mongodb');

  Connection = mongodb.Connection;

  GridStore = mongodb.GridStore;

  Binary = mongodb.BSONPure.Binary;

  BSON = mongodb.BSONPure;

  ObjectID = BSON.ObjectID;

  MongoDB = (function() {

    function MongoDB(db, collection_name) {
      this.get = __bind(this.get, this);
      this.find_one = __bind(this.find_one, this);
      this.find_filtered = __bind(this.find_filtered, this);
      this.find = __bind(this.find, this);
      this.remove = __bind(this.remove, this);
      this.get_string = __bind(this.get_string, this);
      this.update = __bind(this.update, this);
      this.write = __bind(this.write, this);
      this.close = __bind(this.close, this);
      this.get_file = __bind(this.get_file, this);
      this.write_file_with_stream = __bind(this.write_file_with_stream, this);
      this.write_file_with_meta = __bind(this.write_file_with_meta, this);
      this.write_file = __bind(this.write_file, this);      this.db = db;
      this.collection_name = collection_name;
    }

    MongoDB.add_to = function(arr, item) {
      return arr.push(item);
    };

    MongoDB.prototype.close = function() {
      return this.db.close();
    };

    MongoDB.prototype.write = function(records, cb) {
	 	if(!cb) {
			cb = function(err,docs) {
				if(err !=null) {
					console.log(err);
				}
			}
		}

      return this.db.collection(this.collection_name, function(err, collection) {
        return collection.insert(records, {
          safe: true
        }, function(err, docs) {
          return cb(err, docs);
        });
      });
    };

    MongoDB.prototype.update = function(query, update, cb) {
      return this.db.collection(this.collection_name, function(err, collection) {
        return collection.update(query, update, {
          upsert: true,
          safe: true
        }, cb);
      });
    };

    MongoDB.prototype.get_string = function(sub_type_2, enc) {
      var length, length_buf;
      if (enc == null) enc = 'base64';
      length_buf = sub_type_2.slice(0, 4);
      length = length_buf[3] << 32 | length_buf[2] << 16 | length_buf[1] << 8 | length_buf[0];
      return sub_type_2.slice(4).slice(0, length).toString(enc);
    };

    MongoDB.prototype.remove = function(query, cb) {
      return this.db.collection(this.collection_name, function(err, collection) {
        return collection.remove(query, cb);
      });
    };

    MongoDB.prototype.find = function(query, options, cb) {
      return this.db.collection(this.collection_name, function(err, collection) {
        return collection.find(query, options, function(err, cursor) {
          return cb(err,cursor);
        });
      });
    };

    MongoDB.prototype.ensureIndex = function(index_info) {
      return this.db.collection(this.collection_name, function(err, collection) {
        return collection.ensureIndex(index_info);
		});
    };

    MongoDB.prototype.find_filtered = function(query, fields, options, cb) {
      var _this = this;
      return this.db.collection(this.collection_name, function(err, collection) {
        return collection.find(query, fields, options, function(err, cursor) {
          return cursor.toArray(cb);
        });
      });
    };

    MongoDB.prototype.find_one = function(query, cb) {
      var _this = this;
      return this.db.collection(this.collection_name, function(err, collection) {
        return collection.findOne(query, function(err, document) {
          return cb(err, document);
        });
      });
    };

    MongoDB.prototype.get = function(id, cb) {
      return this.find({
        _id: new ObjectID(id)
      }, {}, cb);
    };

    return MongoDB;

  })();

  MongoDBConnector = (function() {

    function MongoDBConnector() {}

    MongoDBConnector.prototype.connect = function(db_params, cb) {
      var Db, Server, mongo_client, server;
      var _this = this;
      Db = mongodb.Db;
      Server = mongodb.Server;
      server = new Server(db_params.db_hostname, db_params.db_port, {
        auto_reconnect: true
      });
      mongo_client = new Db(db_params.db_name, server, {});
      return mongo_client.open(function(err, db) {
        return cb(err, db, mongo_client);
      });
    };

    return MongoDBConnector;

  })();

  exports.MongoDBConnector = MongoDBConnector;

  exports.MongoDB = MongoDB;

  exports.ObjectID = ObjectID;

  exports.Binary = Binary;

  exports.BSON = BSON;

}).call(this);
