/*!
 * Copyright(c) 2010 Fabian Jakobs <fjakobs@ajax.org>
 * MIT Licensed
 */
var OAuth= require("oauth").OAuth,
    url = require("url"),
    connect = require("connect"),
    http = require('http');
    
Bitbucket= module.exports= function(options, server) {
  options= options || {}
  var that= {};
  var my= {};
  
  // Give the strategy a name
  that.name  = options.name || "bitbucket";
  
  // Build the authentication routes required 
  that.setupRoutes= function(server) {
    server.use('/', connect.router(function routes(app){
      app.get('/auth/bitbucket_callback', function(req, res){
        req.authenticate([that.name], function(error, authenticated) {
          res.writeHead(303, { 'Location': req.session.bitbucket_redirect_url });
          res.end('');
        });
      });
    }));
  }

  // Construct the internal OAuth client
  my._oAuth= new OAuth(    
    "https://bitbucket.org/api/1.0/oauth/request_token/",
    "https://bitbucket.org/api/1.0/oauth/access_token/",
    options.appId,
    options.appSecret,
    options.version || "1.0",
    options.callback,
    'HMAC-SHA1'
  );

  // Declare the method that actually does the authentication
  that.authenticate = function(request, response, callback) {
    //todo: if multiple connect middlewares were doing this, it would be more efficient to do it in the stack??

    var parsedUrl = url.parse(request.url, true);

    //todo: makw the call timeout ....
    var self = this;
    if (parsedUrl.query &&
        parsedUrl.query.oauth_token &&
        parsedUrl.query.oauth_verifier &&
        request.session.auth["bitbucket_oauth_token_secret"] &&
        parsedUrl.query.oauth_token == request.session.auth["bitbucket_oauth_token"]) {

      my._oAuth.getOAuthAccessToken(parsedUrl.query.oauth_token,
                                    request.session.auth["bitbucket_oauth_token_secret"],
                                    parsedUrl.query.oauth_verifier,
                                    function(error, oauth_token, oauth_token_secret, additionalParameters) {
                                      if (error) {
                                        callback(error);
                                      }
                                      else {
                                        request.session.auth["bitbucket_oauth_token_secret"] = oauth_token_secret;
                                        request.session.auth["bitbucket_oauth_token"] = oauth_token;
                                        request.session.auth["bitbucket_oauth_app_id"] = options.appId;
                                        request.session.auth["bitbucket_oauth_app_secret"] = options.appSecret;
                                        
                                        my._oAuth.getProtectedResource("https://bitbucket.org/api/1.0/user", "GET", oauth_token, oauth_token_secret, function (error, data, response) {
                                           if( error ) {
                                             self.fail(callback);
                                           }else {
                                             self.success(JSON.parse(data), callback);
                                           }
                                        });
                                      }
                                    });
    }
    else {
      my._oAuth.getOAuthRequestToken(function(error, oauth_token, oauth_token_secret, results) {
        if (error) {
          callback(null); // Ignore the error upstream, treat as validation failure.
        } else {
          request.session['bitbucket_redirect_url'] = request.url;
          request.session.auth["bitbucket_oauth_token_secret"] = oauth_token_secret;
          request.session.auth["bitbucket_oauth_token"] = oauth_token;

          self.redirect(response, 
                        my._oAuth.signUrl("https://bitbucket.org/api/1.0/oauth/authenticate/", oauth_token, oauth_token_secret, "GET"),
                        callback);
        }
      });
    }
  };
  return that;
};  