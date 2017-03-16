'use strict'
const net = require('net');
const util = require('./util');

class MessageParser{
    constructor(callback){
        this.buffer = ''
        this.callback = callback
    }
    run(chunk){
        this.buffer += chunk
        while(true){
            const res = util.recursiveParser(0, this.buffer, this.callback)
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
        this.authtoken = util.makeCookieAuth(user, password)
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

    createHeader(content_length){
        return util.makeHeader({
            "Host" : this.hostname,
            "Connection" : 'Keep-Alive',
            "Authorization" : 'Basic ' + this.authtoken,
            "Content-Length" : content_length,
        });
    }

    request(method, params){
        return new Promise((resolve, reject) => {
            const id = ++this.id;
            const content = util.makeRequest(method, params, id);
            const header = this.createHeader(content.length);
            const senddata = util.makeHTTPRequest(header, content);
            this.callback_message_queue[id] = util.createPromiseResult(resolve, reject);
            this.conn.write(senddata);
        })
    }
}

module.exports = Client
