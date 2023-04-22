import { createServer } from 'http'
import { Buffer } from 'buffer'
import { promises, existsSync } from 'fs'
import qs from 'querystring'
import { URL } from 'url'
import { spawn } from 'child_process'
import process from 'process'

import * as pathModule from 'path'
import { fileURLToPath } from 'url'
let __dirname = pathModule.dirname(fileURLToPath(import.meta.url))

let args = process.argv
if (args[2]) __dirname = args[2]

const flattenValues = obj =>
    Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v.flat()]))

let htmlPagePath = pathModule.join(__dirname, 'page.html')
let htmlPageText = (await promises.readFile(htmlPagePath)).toString('utf8')
const renderHtml = (path, vars) =>
    htmlPageText
        .replace(
            '/*=-title-=*/',
            path == '/index' ? 'Home' : path.split('/').at(-1)
        )
        .replace('/*=-path-=*/', path.split('/').at(-1))
        .replace('/*=-vars-=*/', JSON.stringify(vars))

const cachedFiles = {}
/**
 * @param {String} filePath
 * @returns {Promise<Buffer>}
 */
async function getFile(filePath) {
    if (!cachedFiles[filePath]) {
        let file = await promises.readFile(filePath).catch(() => '')
        if (file) cachedFiles[filePath] = file
        else return null
    }
    return cachedFiles[filePath]
}

/**
 * @param {String} path
 */
async function render(path) {
    path = path == '/' ? '/index' : path
    if (path.startsWith('/pages/') || path.startsWith('/components/')) {
        if (!path.endsWith('.js')) return null
        let fullPath = pathModule.join(__dirname, path)
        let file = await getFile(fullPath)
        if (!file) return null
        return { content: file }
    }
    if (path.startsWith('/static/')) {
        let fullPath = pathModule.join(__dirname, path)
        let file = await getFile(fullPath)
        if (!file) return null
        return { content: file }
    }

    let pagePath = pathModule.join(__dirname, 'pages', path + '.js')
    if (!existsSync(pagePath)) return null
    let serverPath = pathModule.join(__dirname, 'server', path)
    let serverResponse = ''
    const dirContents = await promises.readdir(pathModule.dirname(serverPath))
    const basePath = pathModule.basename(serverPath)
    const serverFileExtension = dirContents
        .find(e => e.startsWith(basePath))
        ?.slice(basePath.length)
    if (serverFileExtension) {
        const serverProgram = spawn(
            pathModule.join(
                __dirname,
                'server',
                `${path}${serverFileExtension}`
            ),
            ['']
        )
        serverResponse = await new Promise((resolve, reject) => {
            serverProgram.stdout.on('data', data => resolve(data.toString()))
            serverProgram.stderr.on('data', data => reject(data.toString()))
        })
    }
    let response = {}
    try {
        response = JSON.parse(serverResponse)
    } catch {
        response.content = serverResponse
    }
    if (!path.includes('api'))
        response.content = renderHtml(path, response.content)
    return response
}

/** @param {string} path */
function getMIMEtype(path) {
    return (
        {
            '.html': 'text/html',
            '.css': 'text/css',
            '.js': 'text/javascript',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon',
            '.json': 'application/json',
            '.pdf': 'application/pdf',
            '.txt': 'text/plain',
            '.mp4': 'video/mp4',
            '.webm': 'video/webm',
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.ogg': 'audio/ogg',
            '.woff': 'font/woff',
            '.woff2': 'font/woff2',
            '.eot': 'application/vnd.ms-fontobject',
            '.otf': 'font/opentype',
            '.ttf': 'font/truetype',
            '.zip': 'application/zip',
            '.rar': 'application/x-rar-compressed',
            '.7z': 'application/x-7z-compressed',
            '.tar': 'application/x-tar',
            '.gz': 'application/x-gzip',
            '.bz2': 'application/x-bzip2',
            '.xz': 'application/x-xz'
        }[path.slice(path.lastIndexOf('.'))] || 'text/html'
    )
}

class RequestCounter extends Array {
    tick() {
        this.push(Date.now())
        while (this[0] < Date.now() - 1000) this.shift()
        if (this.length > serverOptions.maxRequestsPerSecond)
            this.timeoutUntil =
                Date.now() + serverOptions.timeoutMinutes * 60 * 1000
    }
    isInvalid() {
        return this.timeoutUntil && this.timeoutUntil > Date.now()
    }
}
const reqIPs = {}

async function getPostData(req) {
    const buffers = []
    for await (const chunk of req) {
        buffers.push(chunk)
    }
    const data = Buffer.concat(buffers).toString()
    return qs.parse(data)
}

function getCookies(req) {
    const cookies = req.headers.cookie
    if (!cookies) return {}
    return Object.fromEntries(
        cookies.split(';').map(e => {
            let splits = e.split('=')
            return [splits.shift(), splits.join('=')]
        })
    )
}

const createCookie = async ({
    name,
    value,
    expires = null,
    path = null,
    secure = false,
    httpOnly = true,
    domain = null,
    maxAge = null,
    sameSite = null
}) =>
    `${name || ''}=${value || ''}` +
    (expires != null ? `; Expires=${new Date(expires).toUTCString()}` : '') +
    (maxAge != null ? `; Max-Age=${maxAge}` : '') +
    (domain != null ? `; Domain=${domain}` : '') +
    (path != null ? `; Path=${path}` : '') +
    (secure ? '; Secure' : '') +
    (httpOnly ? '; HttpOnly' : '') +
    (sameSite != null ? `; SameSite=${sameSite}` : '')

/** @param {http.IncomingMessage} req @param {http.ServerResponse} res */
async function handleReq(req, res) {
    let ip = req.socket.remoteAddress
    if (!reqIPs[ip]) reqIPs[ip] = new RequestCounter()
    reqIPs[ip].tick()
    if (reqIPs[ip].isInvalid()) {
        /* global console */
        console.log(`access denied to ${ip} for spamming`)
        res.writeHead(429, {
            'Retry-After': serverOptions.timeoutMinutes / 60
        })
        res.end()
        return
    }

    let url = new URL(req.url, `http://${req.headers.host}`)
    let path = url.pathname
    let searchParams = flattenValues(
        Object.fromEntries(url.searchParams.entries())
    )
    let postData = await getPostData(req)
    let cookies = getCookies(req)
    let mimeType = getMIMEtype(path)

    try {
        let response = await render(path, { searchParams, postData, cookies })
        if (!response) return
        if (response.redirect) {
            this.res.writeHead(302, {
                Location: response.redirect
            })
            this.res.end()
            return
        }
        if (response.cookies) {
            response.cookies.forEach(cookie =>
                res.setHeader('Set-Cookie', createCookie(cookie))
            )
        }
        res.writeHead(200, {
            'Content-Type': mimeType + '; charset=utf-8',
            ...(response.headers ?? {})
        })
        res.end(response.content)
    } catch (err) {
        console.error(err)
        res.writeHead(404)
        res.end()
    }
}

export const serverOptions = {
    maxRequestsPerSecond: 100,
    timeoutMinutes: 5,
    port: 8000
}

function start() {
    let httpServer = createServer(handleReq)
    httpServer.listen(serverOptions.port, () =>
        console.log(
            `listening on ${httpServer.address().address}:${
                httpServer.address().port
            }`
        )
    )
}
start()
