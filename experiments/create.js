#!/usr/bin/env node

const FS = require('fs');
const Path = require('path');
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

var infile = process.argv[2] || 'foo.jsona';

var data = FS.readFileSync( infile );
var object = JSON.parse( data.toString("utf8") );
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

// vim: autoindent expandtab sw=4
