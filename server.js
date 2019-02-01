#!/usr/bin/env node

const FS = require('fs');
const Path = require('path');
const Express = require('express');
const BodyParser = require('body-parser');
const SQLite = require('sqlite3');
const UUID = require('uuid');

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

function written() {
}

function beacon( request, response ) {
    var data = {
        "timestamp": new Date(),
        "uuid":      UUID.v4(),
        "hostname":  request.hostname
    };

    if ( is_invalid(request) ) {
        bad_request( response );
        return;
    }

    console.log( 'received beacon ' + data.timestamp );
    console.log( ' [' + request.rawBody + ' ]');

    FS.writeFile( "beacons/" + data.uuid, request.rawBody, written );

    var port = request.app.server.address().port;
    data.self = "http://" + request.hostname + ":" + port + request.path + "/" + data.uuid;

    response.status( 201 );
    response.set( 'Content-Type', 'application/json' );
    response.end( JSON.stringify(data) );
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

    app.post( '/beacon',     beacon );
    app.get(  '/beacon/:id', get_beacon );
}

function connected() {
    console.log( "server started" );
}

function main( argv ) {
    var db = new SQLite.Database('extapi.db');
    db.close();
    // try { FS.mkdirSync( 'beacons' ); } catch (e) {};

    var port = 3200;
    var app = Express();

    app.disable( 'x-powered-by' );
    registerAPIs( app );
    var content = Path.join( __dirname, "/static/" );
    app.use( Express.static(content) );
    app.server = app.listen( port, connected );
}

main( process.argv );

// vim: autoindent expandtab sw=4
