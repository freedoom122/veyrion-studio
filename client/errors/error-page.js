(function(){
const data={
100:['Continue','The request can continue.','The server has received the request headers and the client may continue sending the request body.','INFORMATIONAL RESPONSE','The request can proceed.'],
101:['Switching protocols','The connection is changing protocol.','HTTP 101 is informational, not an error. It is used for protocol upgrades such as WebSocket connections.','INFORMATIONAL RESPONSE','No action is needed for a normal website visit.'],
102:['Processing','The server is still processing the request.','The server accepted the request but has not completed it yet.','INFORMATIONAL RESPONSE','Wait for the final response.'],
103:['Early hints','The server is preparing the final response.','This response can send preload hints before the final HTTP response.','INFORMATIONAL RESPONSE','No action is needed.'],
400:['The request could not be understood','Some part of the request is missing, malformed or invalid.','The server could not process the request syntax or required fields.','REQUEST ERROR','Check the submitted information and try again.'],
401:['Sign-in required','This area needs an authenticated account.','The request did not include valid authentication credentials, or the session has expired.','AUTHENTICATION REQUIRED','Sign in again, then retry the request.'],
403:['Access is restricted','Your account does not have permission to open this resource.','The server understood the request but access is denied by the current permissions or security policy.','ACCESS DENIED','Check that you are using the correct account. Contact us if you believe access should be available.'],
404:['This page is not here','The address may be incorrect, or the page may have moved.','No public page or resource matches the requested URL.','RESOURCE NOT FOUND','Check the address or return to the main site.'],
405:['That action is not supported','This endpoint does not accept the request method used.','The URL exists, but the HTTP method is not allowed for this route.','METHOD NOT ALLOWED','Return to the previous page and use the available controls.'],
408:['The request took too long','The server did not receive the complete request in time.','The client connection stalled or the request deadline expired.','REQUEST TIMEOUT','Check your connection and try again.'],
409:['The request conflicts with current data','The requested change cannot be applied in the current state.','The resource has changed, already exists, or conflicts with another operation.','STATE CONFLICT','Refresh the page and retry with the latest information.'],
410:['This resource has been retired','The requested page or resource is no longer available.','The resource was intentionally removed and is not expected to return.','RESOURCE RETIRED','Return to the main site to find its current replacement.'],
413:['The upload is too large','The submitted content exceeds the allowed size.','The request body or uploaded file is larger than the server accepts.','PAYLOAD TOO LARGE','Reduce the file size and try again.'],
415:['This file format is not supported','The server cannot process the submitted media type.','The request Content-Type or uploaded file format is not supported by this endpoint.','UNSUPPORTED MEDIA TYPE','Use a supported file format and retry.'],
422:['Some details need attention','The request was received, but one or more fields failed validation.','The content is syntactically valid but does not meet the endpoint requirements.','VALIDATION FAILED','Review the fields and submit again.'],
423:['This resource is temporarily locked','The requested resource cannot be changed right now.','A lock or administrative restriction is preventing the operation.','RESOURCE LOCKED','Wait a moment and try again, or contact support.'],
425:['The request arrived too early','The server cannot safely process this request yet.','The server declined to process a request that may be replayed before a secure connection is established.','TOO EARLY','Retry after the connection is fully established.'],
429:['A short pause is needed','Too many requests were sent in a short period.','A rate limit is protecting the service from automated traffic or repeated submissions.','RATE LIMITED','Wait a little before trying again.'],
451:['This resource is unavailable','The resource cannot be served in this location or context.','Access has been restricted for legal or regulatory reasons.','LEGAL RESTRICTION','Contact the site team if you need clarification.'],
500:['Something went wrong on our side','The server hit an unexpected condition.','An unhandled application error interrupted the request. Sensitive diagnostic details are kept private.','INTERNAL ERROR','Try again shortly. If it keeps happening, contact us with the reference ID.'],
501:['This capability is not available','The server does not support the requested operation.','The server does not implement the functionality required to fulfil this request.','NOT IMPLEMENTED','Use another available feature or contact the team.'],
502:['An upstream service returned an invalid response','A service Veyrion depends on could not complete the request.','The gateway received an invalid response from an upstream server.','BAD GATEWAY','Try again in a moment.'],
503:['The service is temporarily unavailable','The server is restarting, overloaded or undergoing maintenance.','The service cannot currently accept requests.','SERVICE UNAVAILABLE','Wait briefly and retry.'],
504:['An upstream service took too long','A required service did not respond before the deadline.','The gateway timed out while waiting for an upstream server.','GATEWAY TIMEOUT','Try again shortly.'],
507:['Storage is unavailable','The server cannot store the requested data right now.','The server has insufficient storage capacity to complete the operation.','INSUFFICIENT STORAGE','Try again later or contact the site team.'],
508:['A processing loop was detected','The server stopped a request that entered a loop.','A resource or routing dependency repeatedly referred back to itself.','LOOP DETECTED','Return to the main site and try a different route.'],
520:['The origin returned an unexpected response','The edge network received an unusual or empty response from the origin.','Cloudflare 520 is a generic origin-response error. This page only works if the origin can still serve it.','CLOUDFLARE / UNKNOWN ERROR','Retry shortly. The operator should inspect origin logs.'],
521:['The origin server refused the connection','The edge network could not establish a connection to the origin.','The origin may be offline, restarting or refusing Cloudflare connections.','CLOUDFLARE / ORIGIN DOWN','Retry shortly while the origin recovers.'],
522:['The origin connection timed out','The edge network could not complete its connection to the origin in time.','The origin did not acknowledge the connection within the expected time.','CLOUDFLARE / CONNECTION TIMEOUT','Retry shortly.'],
523:['The origin could not be reached','The edge network could not route traffic to the origin server.','The origin address may be incorrect, unavailable or unreachable from Cloudflare.','CLOUDFLARE / ORIGIN UNREACHABLE','Retry shortly.'],
524:['The origin took too long to respond','The connection was established, but the origin did not finish the response in time.','The origin accepted the connection but exceeded Cloudflare’s response timeout.','CLOUDFLARE / ORIGIN TIMEOUT','Try again later.'],
525:['A secure connection could not be established','The edge network could not complete the TLS handshake with the origin.','The origin TLS configuration or certificate handshake failed.','CLOUDFLARE / SSL HANDSHAKE','The operator should check the origin certificate and TLS configuration.'],
526:['The origin certificate could not be verified','The origin certificate did not pass strict certificate validation.','Cloudflare Full (strict) could not validate the origin certificate.','CLOUDFLARE / INVALID CERTIFICATE','The operator should renew or correct the origin certificate.']
};
const match=location.pathname.match(/\/(\d{3})\/?$/),code=match?match[1]:'404',entry=data[code]||data['404'],informational=Number(code)<200;
document.title=code+' — '+entry[0]+' | Veyrion Studios';
document.getElementById('error-code').textContent=code;
document.getElementById('error-title').textContent=entry[0];
document.getElementById('error-message').textContent=entry[1];
document.getElementById('error-reason').textContent=entry[2];
document.getElementById('error-kind').textContent=entry[3];
document.getElementById('error-action').textContent=entry[4];
document.getElementById('error-fig').textContent='FIG. '+code;
document.getElementById('error-ref').textContent='REF / '+(crypto.randomUUID?crypto.randomUUID().slice(0,8).toUpperCase():'VEYRION-'+Date.now().toString(36).toUpperCase());
if(informational)document.getElementById('error-action-wrap').style.display='none';
})();
