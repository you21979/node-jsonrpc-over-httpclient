'use strict'
const responseParser = require('http-string-parser').parseResponse;

const makeCookieAuth = exports.makeCookieAuth = (user, password) => {
    return new Buffer(user + ':' + password).toString('base64')
}

const makeRequest = exports.makeRequest = (method, params, id) => {
    return JSON.stringify({
        jsonrpc : "2.0",
        method : method,
        params : params,
        id : id,
    })
}

const makeHeader = exports.makeHeader = (headers) => {
    return 'POST / HTTP/1.1' +
        '\r\n' +
        Object.keys(headers).map(k => k + ': ' + headers[k]).join('\r\n')
}

const makeHTTPRequest = exports.makeHTTPRequest = (header, content) => {
    return header + '\r\n\r\n' + content
}

const recursiveParser = exports.recursiveParser = (n, buffer, callback) => {
    const MAX_DEPTH = 20;
    if(buffer.length === 0) {
        return {code:0, buffer:buffer}
    }
    if(n > MAX_DEPTH) {
        return {code:1, buffer:buffer}
    }
    const res = responseParser(buffer)
    if(res.statusCode === void 0) {
        return {code:0, buffer:buffer}
    }
    const size = res.headers['Content-Length']
    callback(res.body.slice(0, size), res.statusCode, res.headers, n)
    return recursiveParser(n + 1, res.body.slice(size), callback)
}

const createPromiseResult = exports.createPromiseResult = (resolve, reject) => {
    return (err, result) => {
        if(err) reject(err)
        else resolve(result)
    }
}

