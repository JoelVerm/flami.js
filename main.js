import { createServer } from 'http'
import http from 'http'
import { Buffer } from 'buffer'
import { promises, existsSync } from 'fs'
import qs from 'querystring'
import { URL } from 'url'

import * as pathModule from 'path'
import { fileURLToPath } from 'url'
const __dirname = pathModule.dirname(fileURLToPath(import.meta.url))

/**
 * HTML escape a string
 * @param {String} s string to HTML escape
 * @returns {String} escaped string
 */
const escapeHTML = s =>
	s.replace(/[^0-9A-Za-z ]/g, c => '&#' + c.charCodeAt(0) + ';')
/**
 * HTML escape an object
 * @param {Object} obj object to HTML escape
 * @returns {Object} object with HTML escaped strings
 */
const objEscapeHTML = obj =>
	Object.entries(obj).reduce((obj, e) => {
		obj[e[0]] = escapeHTML(e[1])
		return obj
	}, {})

/**
 * Flatten an array and return the first non-array element
 * @param {Array} a
 * @returns {any}
 */
const arrToFlat = a => (Array.isArray(a) ? arrToFlat(a[0]) : a)
/**
 * flatten arrays in an object - returns the first non-array element for each value in the object
 * @param {Object<Array>} obj object with arrays to flatten as values
 * @returns {Object<Array>} object with flattened arrays as values
 */
const flatten = obj =>
	Object.entries(obj).reduce((obj, e) => {
		obj[e[0]] = arrToFlat(e[1])
		return obj
	}, {})

/**
 * @param {RunningRequest} rr
 */
async function render(rr) {
	let path = rr.path == '/' ? '/index' : rr.path
	if (path.split('/').at(-1).includes('.')) {
		if (
			(path.startsWith('/pages/') || path.startsWith('/components/')) &&
			path.endsWith('.js')
		) {
			let filePath = pathModule.join(__dirname, path)
			return promises.readFile(filePath)
		}
		let filePath = pathModule.join(__dirname, 'static', path)
		return promises.readFile(filePath)
	} else {
		rr.mimeType = getMIMEtype('.html')
		let htmlPath = pathModule.join(__dirname, 'page.html')
		let serverPath = pathModule.join(__dirname, 'server', path + '.js')
		let pagePath = pathModule.join(__dirname, 'pages', path + '.js')
		if (!existsSync(pagePath)) throw new Error(`no page at ${path}`)
		let vars = {}
		if (existsSync(serverPath)) {
			let callback = (await import(`./server${path}.js`)).flami
			vars = callback(rr)
			if (!rr.active) return false
			if (serverPath.includes('api')) return JSON.stringify(vars)
		}
		let text = (await promises.readFile(htmlPath)).toString('utf8')
		text = text
            .replace('/*=-title-=*/', rr.path == '/'? 'Home' : path.split('/').at(-1))
			.replace('/*=-vars-=*/', JSON.stringify(vars))
			.replace('/*=-path-=*/', path.split('/').at(-1))
		return text
	}
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
		}[path.slice(path.lastIndexOf('.'))] || 'text/plain'
	)
}

class RunningRequest {
	/**
	 * @param {http.IncomingMessage} req
	 * @param {http.ServerResponse} res
	 */
	constructor(req, res) {
		this.active = true
		this.req = req
		this.res = res
		this.ip = req.socket.remoteAddress
		this.url = new URL(req.url, `http://${req.headers.host}`)
		this.path = this.url.pathname
		this.params = flatten(
			Object.fromEntries(this.url.searchParams.entries())
		)
		this.mimeType = getMIMEtype(this.path)
		this.escapeHTML = escapeHTML
		this.objEscapeHTML = objEscapeHTML
		this.flatten = flatten
	}
	/** @returns {Promise<qs.ParsedUrlQuery>} post data */
	async getPostData() {
		const buffers = []
		for await (const chunk of this.req) {
			buffers.push(chunk)
		}
		const data = Buffer.concat(buffers).toString()
		return qs.parse(data)
	}
	/**
	 * @param {String} name
	 * @returns {Promise<String>} cookie value
	 */
	async getCookie(name) {
		const cookies = this.req.headers.cookie
		if (!cookies) return null
		const cookie = cookies
			.split(';')
			.find(c => c.trim().startsWith(name + '='))
		if (!cookie) return null
		const cookieSplit = cookie.split('=')
		cookieSplit.shift()
		return cookieSplit.join('=')
	}

	async setCookie(
		name,
		value,
		expires = null,
		path = null,
		secure = false,
		httpOnly = true,
		domain = null,
		maxAge = null,
		sameSite = null
	) {
		let cookie =
			`${name || ''}=${value || ''}` +
			(expires != null
				? `; Expires=${new Date(expires).toUTCString()}`
				: '') +
			(maxAge != null ? `; Max-Age=${maxAge}` : '') +
			(domain != null ? `; Domain=${domain}` : '') +
			(path != null ? `; Path=${path}` : '') +
			(secure ? '; Secure' : '') +
			(httpOnly ? '; HttpOnly' : '') +
			(sameSite != null ? `; SameSite=${sameSite}` : '')
		this.res.setHeader('Set-Cookie', cookie)
	}

	/** @param {String} location */
	async redirect(location) {
		this.res.writeHead(302, {
			Location: location
		})
		this.res.end()
		this.active = false
	}
}

class RequestCounter extends Array {
	tick() {
		this.push(Date.now())
		while (this[0] < Date.now() - 1000) this.shift()
		if (this.length > serverOptions.maxRequestsPerSecond)
			this.timeoutUntil =
				Date.now() + serverOptions.DDOStimeoutMinutes * 60 * 1000
	}
	isInvalid() {
		return this.timeoutUntil && this.timeoutUntil > Date.now()
	}
}
const reqIPs = {}
/** @param {http.IncomingMessage} req @param {http.ServerResponse} res */
async function handleReq(req, res) {
	if (!reqIPs[req.socket.remoteAddress])
		reqIPs[req.socket.remoteAddress] = new RequestCounter()
	reqIPs[req.socket.remoteAddress].tick()
	if (reqIPs[req.socket.remoteAddress].isInvalid()) {
		console.log(`access denied to ${req.socket.remoteAddress} for spamming`)
		res.writeHead(429, {
			'Retry-After': serverOptions.DDOStimeoutMinutes / 60
		})
		res.end()
		return
	}

	const rr = new RunningRequest(req, res)

	try {
		let response = await render(rr)
		if (!response) return
		res.writeHead(200, {
			'Content-Type': rr.mimeType + '; charset=utf-8'
		})
		res.end(response)
	} catch (err) {
		console.error(err)
		res.writeHead(404)
		res.end()
	}
}

export const serverOptions = {
	maxRequestsPerSecond: 100,
	DDOStimeoutMinutes: 5,
	port: 80
}

function start() {
	let httpServer = createServer(handleReq)
	httpServer.listen(serverOptions.port)
}
start()
