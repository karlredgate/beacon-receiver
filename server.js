#!/usr/bin/env node

const Path = require('path');
const Express = require('express');
const BodyParser = require('body-parser');
const SQLite = require('sqlite3');

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

function beacon( request, response ) {
    var data = {
        "data": [1,2,3],
        "request": request.body
    };

    if ( is_invalid(request) ) {
        bad_request( response );
        return;
    }

    // response.end( 'DATA' );
    response.status( 200 );
    response.set( 'Content-Type', 'application/json' );
    response.end( JSON.stringify(data) );
}

// Change so it errors with wrong content type
//
function registerAPIs( app ) {
    var parser = BodyParser.json( {type: ['application/json', 'application/*+json', '*/*']} );
    app.use( gather_body );
    app.use( parser );
    app.use( find_config );

    app.post( '/beacon',   beacon );
}

function connected() {
    console.log( "server started" );
}

function main( argv ) {
    var db = new SQLite.Database('extapi.db');
    db.close();

    var port = 3200;
    var app = Express();

    app.disable( 'x-powered-by' );
    registerAPIs( app );
    var content = Path.join( __dirname, "/static/" );
    app.use( Express.static(content) );
    app.listen( port, connected );
}

main( process.argv );

// vim: autoindent expandtab sw=4
