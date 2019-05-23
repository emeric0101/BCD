// ---------------------------------------------------------------
// Import modules
// ---------------------------------------------------------------
var express     = require('express');
var path        = require('path');
var fs          = require('fs');
var request     = require('request');
var csv         = require('csv-parser')
var dotenv      = require('dotenv');

//we need some variables.
dotenv.config();

// ---------------------------------------------------------------
// Instantiate the app
// ---------------------------------------------------------------

var app = express();

var APIKey            = process.env.APIKey;
var clientID          = process.env.clientID;
var clientSecret      = process.env.clientSecret;
var authenticationURL = process.env.authenticationURL;
var baseURL           = process.env.baseURL;
// Serve 'dynamic' jsx content being transformed if needed
var srcDir = path.resolve(__dirname);
var file;

app.post('/api/detect', function(req, res){
  parseJSONBody(req, function(j){      
    callLMLSandbox("https://sandbox.api.sap.com/ml/api/v2alpha1/text/lang-detect/", j, function(body){
      console.log(JSON.parse(body));
      res.send(body)
    });
  })
});


app.post('/api/targets', function(req, res){
  parseJSONBody(req, function(j){      
    getTargets(j.lng, (r) => {
      res.send(r);
    });
  })
});

app.post('/api/translation', function(req, res) {
  parseJSONBody(req, function(j){      
    callLML("/text/translation", j, function(body){
      console.log(JSON.parse(body));
      res.send(body)
    });
  })
});

/*
Excercise: add a function that can call a translation service.
*/

app.post('/api/bearer', function(req, res){
  parseJSONBody(req, function(data){
    getBearerToken(function(token){
      request.post({
        url: baseURL + "/api/v2/text/lang-detect/", 
        body: JSON.stringify(data),
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": "Bearer " + token
          }
      }, function optionalCallback(err, httpResponse, body) {
          if (err) {
            return console.error('upload failed:', err);
          }
          console.log("response is: " + body)
          res.send(body)
      });
    });
  })
});

app.get('/api/targetLanguages', function(req, res){
  getTargets(req.query.targetLang, function(langs){
    res.send(langs)
  });
});

//the lightest HTTP server ever.
app.use('/', function (req, res) {
    file = srcDir + req.path;
    res.sendFile(file);
});

/*
Express body parser and proxy are incompatible.
*/
function parseJSONBody(res, callback){
    var body = '';
    res.on('data', function (data) {
        body += data;
        // Too much POST data, kill the connection!
        // 1e6 === 1 * Math.pow(10, 6) === 1 * 1000000 ~~~ 1MB
        if (body.length > 1e6)
            res.connection.destroy();
    });

    res.on('end', function () {
        var post = JSON.parse(body);
        callback(post);
    });
}

function callLMLSandbox(url, oData, callback){
  request.post({
      url: url, 
      body: JSON.stringify(oData),
      headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
            "APIKey": APIKey
        }
    }, function optionalCallback(err, httpResponse, body) {
        if (err) {
          return console.error('upload failed:', err);
        }
        callback(body);
  });
}
/*
url: is the end point of the call
data: is the message to send (json assumed)
callback: to get the data backout
*/
async function callLML(url, oData, callback){
  const token = await getBearerTokenAsync();
  request.post({
      url: baseURL + url, 
      body: JSON.stringify(oData),
      headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
            "Authorization": "Bearer " + token
        }
    }, function optionalCallback(err, httpResponse, body) {
        if (err) {
          return console.error('upload failed:', err);
        }
        callback(body);
  });
}

function getBearerTokenAsync() {
  return new Promise((resolve, error) => {
    try {
      getBearerToken((r) => {
        resolve(r);
      });
    } catch (e) {error(e);}

  });
}

function getBearerToken(callback){
    var token = Buffer.from(clientID + ':' + clientSecret).toString('base64');
    console.log(token)
    request.get({
      url: authenticationURL, 
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": "Basic " + token
      }
    }, function optionalCallback(err, httpResponse, body) {
        if (err) {
          return console.error('failed:', err);
        }
        callback(JSON.parse(body).access_token);
  });
}


//"Source Language Name","Source Language Code","Target Language Name","Target Language Code" 
/*
Some helper code for little excercise.
*/
function getTargets(source, callback){
  var targets = [];
  fs.createReadStream('language-mapping.csv')
    .pipe(csv())
    .on('headers', function (headerList) {
      //console.log('First header: %s', headerList)
    })
    .on('data', function (data) {
      if(data['Source Language Code'] === source){
        targets.push(data['Target Language Code'])
      }
   })
    .on('end', function(){
      callback(targets);
    });
}

// ---------------------------------------------------------------
// Start the server
// ---------------------------------------------------------------
var server = app.listen(process.env.PORT || 1666, function () {
    process.stdout.write('Started dashboard dev server on port ' + server.address().port + '\n');
});
