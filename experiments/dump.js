const Avro = require('avsc');

var infile = process.argv[2] || 'beacons.avro';
var reader = Avro.createFileDecoder( infile );
reader.on( 'data', function (o) { console.log( "record " + o ); console.log( JSON.stringify(o) ); } );
reader.on( 'end', function (o) { console.log( "end " + o ); } );
