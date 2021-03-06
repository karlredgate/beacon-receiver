#!/usr/bin/env node

const FS = require('fs');
const Path = require('path');
const Express = require('express');
const BodyParser = require('body-parser');
const SQLite = require('sqlite3');
const UUID = require('uuid');
const Avro = require('avsc');

const nybbles = ['0','1','2','3','4','5','6','7','8','9','A','B','C','D','E','F'];
function asHex( c ) {
    var hi = c >> 4;
    var lo = c & 0xF;
    n1 = nybbles[hi];
    n2 = nybbles[lo];
    return n1 + n2;
}
function toHex(buf) {
    var chars = new Array( buf.length );
    for ( let i = 0 ; i < buf.length ; ++i ) {
        chars[i] = asHex( buf[i] );
    }
    return chars.join('');
}


function bad_request( response ) {
    response.status( 400 );
    response.send( '{"error": "invalid"}' );
    response.end();
}

function is_invalid( request ) {
    // if ( typeof request.body.metrics == 'undefined' ) return true;
    // if ( typeof request.body.dataset == 'undefined' ) return true;
    // check "name", "frequency", "filters", "group by"
    return false;
}

function getClientIP( req ) {
    return req.headers['x-forwarded-for'] || req.connection.remoteAddress;
}

function find_config( request, response, next ) {
    if ( typeof request.query.config_id == 'undefined' ) {
        // Check if there are more than one for this account
        // console.log( "missing wafconfig" );
        return next();
    }
    console.log( "Look for " + request.query.config_id );
    // lookup config object
    next();
}

/*
 * Set up the receive stream data handler callback function.
 * The handler is called for each chunk of data received from the client.
 */
function gather_body( request, response, next) {
    request.setEncoding('utf8');
    request.rawBody = '';
    function append( chunk ) {
        request.rawBody += chunk;
    };
    request.on( 'data', append );
    function pass() {
        next();
    };
    request.on( 'end', pass );
}

/*
 * Used as a generic callback.
 */
function written() {
    console.log( "beacon stored" );
}

/*
 */
function log_debug_info( request, response ) {
    console.log( 'received beacon at ' + response.beacon.timestamp );
    console.log( ' X-Akamai-Stat-Agg-TableName: ' + request.headers["x-akamai-stat-agg-tablename"] );
    console.log( ' X-Akamai-Stat-Agg-Interval:  ' + request.headers["x-akamai-stat-agg-interval"] );
    console.log( ' X-Akamai-Stat-Agg-Timestamp: ' + request.headers["x-akamai-stat-agg-timestamp"] );
    console.log( ' X-Akamai-Stat-Agg-Payload:   ' + request.headers["x-akamai-stat-agg-payload"] );
    for ( var name in request.headers ) {
        console.log( "Header: " + name + " => '" + request.headers[name] + "'" );
    }
    console.log( '<<<' + request.rawBody + '>>>');
}

function respond( response ) {
    response.status( 201 );
    response.set( 'Content-Type', 'application/json' );
    response.end( JSON.stringify(response.beacon) );
}

function update_avro( request, response ) {
    var object = JSON.parse( request.rawBody.toString("utf8") );
    // catch errors
    var schema = Avro.Type.forValue( object );
    var f = schema.fingerprint();
    var fp = toHex( f );
    console.log( "FP " + fp );
    // file
    var filename = fp + ".avro";
    var mode = FS.existsSync(filename) ? 'a' : 'w';
    var head = FS.existsSync(filename) ? false : true;
    console.log( "header is " + head );
    // var out = Avro.createFileEncoder( "beacons.avro", schema );
    var out = new Avro.streams.BlockEncoder( schema, {syncMarker: f, writeHeader: head} );
    var ws = FS.createWriteStream( filename, {defaultEncoding: 'binary', flags: mode} );
    out.pipe( ws );
    // out.write( object );
    out.end( object );
}

// Injest the beacon here
//
// Headers
// X-Akamai-Stat-Agg-TableName: table1
// X-Akamai-Stat-Agg-Interval: 0 h 0 m 60 s
// X-Akamai-Stat-Agg-Timestamp:  Wed, 22 Aug 2018 00:22:13 GMT
// X-Akamai-Stat-Agg-Payload-String: mothertool_stats
//
// BODY
// Row_Number,account(key),hostname(key),Clients (new),Hits (Count),Response time(average)
// 1,"Account123","www.bar.com",237,8665,89
// 2,"Account123","www.foo.com",667,566,34
// 3,"Account456","www.abc.com",444,987,56
// 4,"Account456","www.xyz.com",144,3545,123
//
// Change this to store it in a DB - keep the header info also
//

function json_beacon( request, response ) {
    console.log( "JSON beacon" );
    var filename = "beacons/" + response.beacon.uuid;
    FS.writeFile( filename, request.rawBody, written );
    update_avro( request, response );
    respond( response );
}

function mothertool_beacon( request, response ) {
    var table = request.headers["x-akamai-stat-agg-tablename"];
    var timestamp = request.headers["x-akamai-stat-agg-timestamp"];
    var dirname = "mothertool/" + table;
    var filename = dirname + "/" + response.beacon.uuid;
    var client = request.ip; // or request.connection.remoteAddress;

    console.log( "Mothertool beacon from " + client );

    response.beacon.table = table;
    try { FS.mkdirSync(dirname) } catch (e) {};
    FS.writeFile( filename, request.rawBody, written );
    respond( response );
}

function beacon( request, response ) {
    response.beacon = {
        "timestamp": new Date(),
        "uuid":      UUID.v4(),
        "hostname":  request.hostname
    };
    var data = response.beacon;
    // var port = request.app.server.address().port;
    /* do not use the port in the URL anymore - this is fronted by CDN, so a std port is provided */
    data.self = "http://" + request.hostname + request.path + "/" + data.uuid;

    if ( is_invalid(request) ) {
        bad_request( response );
        return;
    }

    log_debug_info( request, response );

    if ( request.headers["x-akamai-stat-agg-tablename"] !== "" ) {
        return mothertool_beacon( request, response );
    }

    var contentType = request.headers["content-type"];
    if ( contentType === "application/json" ) {
        return json_beacon( request, response );
    }

    /* No specific beacon handler, so just store the generic beacon.  */
    FS.writeFile( "beacons/" + data.uuid, request.rawBody, written );
    respond( response );
}

function get_beacon( request, response ) {
    var id = request.params.id;
    var path = 'beacons/' + id;

    if ( FS.existsSync(path) == false ) {
        console.log( "no file " + path );
        response.status( 404 );
        response.set( 'Content-Type', 'application/json' );
        response.end( JSON.stringify({'error':'no beacon'}) );
        return;
    }

    function send_response( err, data ) {
        if ( err != null ) {
            response.status( 500 );
            response.set( 'Content-Type', 'application/json' );
            response.end( JSON.stringify({'error':'failed to read file'}) );
        }
        response.status( 200 );
        response.set( 'Content-Type', 'text/plain' );
        response.end( data );
    };

    FS.readFile( path, send_response );
}

// Change so it errors with wrong content type
//
function registerAPIs( app ) {
    // var parser = BodyParser.json( {type: ['application/json', 'application/*+json', '*/*']} );
    app.use( gather_body );
    // app.use( parser );
    app.use( find_config );

    app.post( '/cloud-monitor',     beacon );
    app.post( '/beacon',     beacon );
    app.post( '/exceptions', beacon );
    app.get(  '/beacon/:id', get_beacon );
}

function connected() {
    var timestamp = new Date();
    console.log( "server started at " + timestamp );
}

function main( argv ) {
    var db = new SQLite.Database('extapi.db');
    db.close();
    // try { FS.mkdirSync( 'beacons' ); } catch (e) {};
    try { FS.mkdirSync('mothertool') } catch (e) {};

    //var port = 3200;
    var port = 7777;
    var app = Express();

    app.disable( 'x-powered-by' );
    registerAPIs( app );
    var content = Path.join( __dirname, "/static/" );
    app.use( Express.static(content) );
    app.server = app.listen( port, connected );
}

main( process.argv );

// vim: autoindent expandtab sw=4
