var mongodb_helper = require('./mongodb_helper');

var MongoDB = mongodb_helper.MongoDB;
var MongoDBConnector = mongodb_helper.MongoDBConnector;
var ObjectID = mongodb_helper.ObjectID;
var Binary = mongodb_helper.Binary;
var BSON = mongodb_helper.BSON;

var _db_connection = null;
var db_connection = function () {

    if (typeof(_db_connection) === 'function') {
	return _db_connection();
    }
    else
    {
	return null;
    }
};

var db_connect = function (db_params, callback) {
    
    var mongo_connector = new MongoDBConnector();
    return mongo_connector.connect(db_params, function (err, db, mongo_client) {
	if (err) {
	    callback(err);
	}
	else {
	    _db_connection = function() { 
		return mongo_client;
	    };
	   
	    callback();
	}
    });
};

var db_bin = function (buffer_data) {
    return new Binary(buffer_data);
};

var db_obj = function (collection_name) {
    return new MongoDB(db_connection(), collection_name);
};

var db_deserialize = function (data) {
    return BSON.BSON.deserialize(data);
};

var db_serialize = function (doc) {
    return BSON.BSON.serialize(doc);
};

var db_id = function (id_str) {

    if (!id_str) {
	return new ObjectID();
    }

    return new ObjectID(id_str);
};

var get_id = function() {
	return new ObjectID();
}

var valid_db_id = function (id_str) {
    try {
	db_id(id_str);
    }
    catch (err) {
	return false;
    }

    return true;
};

exports.db_bin = db_bin;
exports.db_connect = db_connect;
exports.db_connection = db_connection;
exports.db_obj = db_obj;
exports.db_id = db_id;
exports.db_deserialize = db_deserialize;
exports.db_serialize = db_serialize;
exports.get_id = get_id;
exports.valid_db_id = valid_db_id;
