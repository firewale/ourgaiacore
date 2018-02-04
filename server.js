var express = require('express');
var app = express();
var mongoose = require('mongoose');
var morgan = require('morgan');
var bodyParser = require('body-parser');
var methodOverride = require('method-override');

var https = require('https');
var fs = require('fs');
var qs = require('querystring');
var path = require('path');


app.use(express.static(__dirname + '/public'));
app.use(morgan('dev'));
app.use(bodyParser.urlencoded({'extended':'true'}));
app.use(bodyParser.json());
app.use(bodyParser.json({ type: 'application/vnd.api+json'}));


app.listen(8080);
console.log("App listening on port 8080");

var options = {
 key: fs.readFileSync('server.key'),
 cert: fs.readFileSync('server.crt')
};

var PORT = 8443;

function handleRequest(req, res){
    
    var filePath = '.' + req.url;
    if (filePath == './')
        filePath = './index.html';

    var contentType = getContentType(req, filePath);

    //Process Post Request
    if(req.method === 'GET'){
        var data = fs.readFileSync(__dirname + '/public/' + filePath);
        res.writeHead(200, { 'Content-Type': contentType })
        res.end(data, 'utf-8')
    }
    else{
        res.writeHead(404);
        res.end();
    }
}

function getContentType(request, filePath){
    
    var extname = path.extname(filePath);
    var contentType = 'text/html';
    switch (extname) {
        case '.js':
            contentType = 'text/javascript';
            break;
        case '.css':
            contentType = 'text/css';
            break;
        case '.json':
            contentType = 'application/json';
            break;
        case '.png':
            contentType = 'image/png';
            break;      
        case '.jpg':
            contentType = 'image/jpg';
            break;
        case '.wav':
            contentType = 'audio/wav';
            break;
    }
    return contentType;
}

//Create a server
var server = https.createServer(options, handleRequest);

//Start server
server.listen(PORT, function(){
 console.log("Server listening on: https://localhost:" + PORT);
});

