const net = require('net');
const responseParser = require('http-string-parser').parseResponse;

const makeCookieAuth = (user, password) => {
    return new Buffer(user + ':' + password).toString('base64')
}

const makeRequest = (method, params, id) => {
    return JSON.stringify({
        jsonrpc : "2.0",
        method : method,
        params : params,
        id : id,
    })
}

const makeHeader = (host, authtoken, length) => {
    return [
        "POST / HTTP/1.1",
        "Host: " + host,
        "Connection: Keep-Alive",
        "Authorization: Basic " + authtoken,
        "Content-Length: " + length
    ].join("\r\n")
}

const makeHTTPRequest = (header, content) => {
    return header + '\r\n\r\n' + content
}

const recursiveParser = (n, buffer, callback) => {
    if(buffer.length === 0) {
        return {code:0, buffer:buffer}
    }
    if(n > 20) {
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

const createPromiseResult = (resolve, reject) => {
    return (err, result) => {
        if(err) reject(err)
        else resolve(result)
    }
}

class MessageParser{
    constructor(callback){
        this.buffer = ''
        this.callback = callback
    }
    run(chunk){
        this.buffer += chunk
        while(true){
            const res = recursiveParser(0, this.buffer, this.callback)
            this.buffer = res.buffer
            if(res.code === 0){
                break;
            }
        }
    }
}

class Client{
    constructor(port, host, user, password){
        this.port = port
        this.host = host
        this.hostname = [host, port].join(':')
        this.authtoken = makeCookieAuth(user, password)
        this.callback_message_queue = {}
        this.id = 0;

        this.mp = new MessageParser((body, code, headers, n) => {
            this.onMessageRecv(JSON.parse(body));
        });

        const conn = this.conn = new net.Socket()
        conn.setEncoding('utf8')
        conn.setKeepAlive(true, 0)
        conn.setNoDelay(true)
        conn.on('connect', () => {
        })
        conn.on('close', () => {
            Object.keys(this.callback_message_queue).forEach((key) => {
                this.callback_message_queue[key](new Error('close connect'))
                delete this.callback_message_queue[key]
            })
        })
        conn.on('data', (chunk) => {
            this.mp.run(chunk)
        })
        conn.on('end', () => {
        })
    }

    connect(){
        return new Promise((resolve, reject) => {
            this.conn.connect(this.port, this.host, () => {
                resolve()
            })
        })
    }

    close(){
        this.conn.end();
        this.conn.destroy();
    }

    onMessageRecv(msg){
        if(msg instanceof Array){
            ; // don't support batch request
        } else {
            const callback = this.callback_message_queue[msg.id]
            if(callback){
                delete this.callback_message_queue[msg.id]
                callback(null, msg)
            }
        }
    }

    request(method, params){
        return new Promise((resolve, reject) => {
            const id = ++this.id;
            const content = makeRequest(method, params, id);
            const header = makeHeader(this.hostname, this.authtoken, content.length);
            this.callback_message_queue[id] = createPromiseResult(resolve, reject);
            this.conn.write(makeHTTPRequest(header, content));
        })
    }
}

