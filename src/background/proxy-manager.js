// Isolate this feature from the other classic background script.
(() => {
	const STORAGE_KEY = 'proxifiedContainersKey'
	const SUPPORTED_PROXY_TYPES = new Set(['http', 'https', 'socks4', 'socks'])
	const HTTP_PROXY_TYPES = new Set(['http', 'https'])
	const AUTH_ATTEMPT_TTL_MS = 30000
	const DIRECT_PROXY = { type: 'direct' }

	let cachedAssignments = []
	let assignmentsLoaded = false
	let assignmentsLoadPromise = null
	let assignmentsRevision = 0

	const proxyAuthAttempts = new Map()

	function normalizeProxy(proxy) {
		if (
			!proxy ||
			!SUPPORTED_PROXY_TYPES.has(proxy.type) ||
			typeof proxy.host !== 'string' ||
			proxy.host.trim().length === 0
		) {
			return null
		}

		const port = Number(proxy.port)
		if (!Number.isInteger(port) || port < 1 || port > 65535) {
			return null
		}

		const normalized = {
			type: proxy.type,
			host: proxy.host.trim(),
			port,
		}

		if (typeof proxy.username === 'string' && proxy.username.length > 0) {
			normalized.username = proxy.username
			normalized.password = typeof proxy.password === 'string' ? proxy.password : ''
		}

		return normalized
	}

	function normalizeAssignments(assignments) {
		if (!Array.isArray(assignments)) {
			return []
		}

		return assignments.reduce((normalized, assignment) => {
			if (!assignment || typeof assignment.cookieStoreId !== 'string') {
				return normalized
			}

			const proxy = normalizeProxy(assignment.proxy)
			if (!proxy) {
				return normalized
			}

			normalized.push({
				cookieStoreId: assignment.cookieStoreId,
				enabled: assignment.enabled !== false,
				proxy,
			})
			return normalized
		}, [])
	}

	function loadAssignments() {
		if (assignmentsLoaded) {
			return Promise.resolve(cachedAssignments)
		}

		if (!assignmentsLoadPromise) {
			const requestedRevision = assignmentsRevision
			assignmentsLoadPromise = browser.storage.local.get({ [STORAGE_KEY]: [] })
				.then((result) => {
					if (requestedRevision === assignmentsRevision) {
						cachedAssignments = normalizeAssignments(result[STORAGE_KEY])
						assignmentsLoaded = true
					}
					return cachedAssignments
				})
				.catch((error) => {
					console.debug('Failed to load container proxy assignments:', error)
					return cachedAssignments
				})
				.finally(() => {
					assignmentsLoadPromise = null
				})
		}

		return assignmentsLoadPromise
	}

	browser.storage.onChanged.addListener((changes, areaName) => {
		if (areaName !== 'local' || !changes[STORAGE_KEY]) {
			return
		}

		assignmentsRevision += 1
		cachedAssignments = normalizeAssignments(changes[STORAGE_KEY].newValue)
		assignmentsLoaded = true
	})

	loadAssignments()

	async function resolveCookieStoreId(requestInfo) {
		if (
			typeof requestInfo.cookieStoreId === 'string' &&
			requestInfo.cookieStoreId.length > 0
		) {
			return requestInfo.cookieStoreId
		}

		if (requestInfo.tabId === -1) {
			return null
		}

		try {
			const tab = await browser.tabs.get(requestInfo.tabId)
			return typeof tab.cookieStoreId === 'string' ? tab.cookieStoreId : null
		} catch (error) {
			console.debug('Failed to resolve the request container:', error)
			return null
		}
	}

	async function getAssignmentForRequest(requestInfo) {
		const cookieStoreId = await resolveCookieStoreId(requestInfo)
		if (!cookieStoreId) {
			return null
		}

		const assignments = assignmentsLoaded
			? cachedAssignments
			: await loadAssignments()

		return assignments.find((assignment) => (
			assignment.cookieStoreId === cookieStoreId
		)) || null
	}

	function toProxyInfo(proxy) {
		const proxyInfo = {
			type: proxy.type,
			host: proxy.host,
			port: proxy.port,
		}

		if (proxy.type === 'socks' || proxy.type === 'socks4') {
			proxyInfo.proxyDNS = true
		}

		if (proxy.type === 'socks' && proxy.username) {
			proxyInfo.username = proxy.username
			proxyInfo.password = proxy.password || ''
		}

		return proxyInfo
	}

	async function handleProxyRequest(requestInfo) {
		if (requestInfo.tabId === -1) {
			return DIRECT_PROXY
		}

		try {
			const assignment = await getAssignmentForRequest(requestInfo)
			return assignment && assignment.enabled
				? toProxyInfo(assignment.proxy)
				: DIRECT_PROXY
		} catch (error) {
			console.debug('Failed to select a proxy for the request:', error)
			return DIRECT_PROXY
		}
	}

	function normalizeComparableHost(host) {
		if (typeof host !== 'string') {
			return ''
		}
		return host.replace(/^\[|\]$/g, '').toLowerCase()
	}

	function isMatchingProxy(details, proxy) {
		const activeProxy = details.proxyInfo || details.challenger
		if (!activeProxy) {
			return false
		}

		return (
			normalizeComparableHost(activeProxy.host) === normalizeComparableHost(proxy.host) &&
			Number(activeProxy.port) === proxy.port
		)
	}

	function rememberProxyAuthAttempt(requestId) {
		const existingTimeout = proxyAuthAttempts.get(requestId)
		if (existingTimeout) {
			clearTimeout(existingTimeout)
		}

		const timeoutId = setTimeout(() => {
			if (proxyAuthAttempts.get(requestId) === timeoutId) {
				proxyAuthAttempts.delete(requestId)
			}
		}, AUTH_ATTEMPT_TTL_MS)

		proxyAuthAttempts.set(requestId, timeoutId)
	}

	function clearProxyAuthAttempt(details) {
		const timeoutId = proxyAuthAttempts.get(details.requestId)
		if (!timeoutId) {
			return
		}

		clearTimeout(timeoutId)
		proxyAuthAttempts.delete(details.requestId)
	}

	async function handleProxyAuthRequired(details) {
		if (!details.isProxy || details.tabId === -1) {
			return {}
		}

		try {
			const assignment = await getAssignmentForRequest(details)
			const proxy = assignment && assignment.enabled
				? assignment.proxy
				: null

			if (
				!proxy ||
				!HTTP_PROXY_TYPES.has(proxy.type) ||
				!proxy.username ||
				!isMatchingProxy(details, proxy)
			) {
				return {}
			}

			if (proxyAuthAttempts.has(details.requestId)) {
				return {}
			}

			rememberProxyAuthAttempt(details.requestId)
			return {
				authCredentials: {
					username: proxy.username,
					password: proxy.password || '',
				},
			}
		} catch (error) {
			console.debug('Failed to provide proxy credentials:', error)
			return {}
		}
	}

	async function removeDeletedContainerProxy(changeInfo) {
		const identity = changeInfo && changeInfo.contextualIdentity
		if (!identity || typeof identity.cookieStoreId !== 'string') {
			return
		}

		const assignments = assignmentsLoaded
			? cachedAssignments
			: await loadAssignments()
		const remainingAssignments = assignments.filter((assignment) => (
			assignment.cookieStoreId !== identity.cookieStoreId
		))

		if (remainingAssignments.length === assignments.length) {
			return
		}

		cachedAssignments = remainingAssignments
		assignmentsLoaded = true

		try {
			await browser.storage.local.set({
				[STORAGE_KEY]: remainingAssignments,
			})
		} catch (error) {
			console.debug('Failed to remove a deleted container proxy:', error)
		}
	}

	browser.proxy.onRequest.addListener(
		handleProxyRequest,
		{ urls: ['<all_urls>'] },
	)

	browser.webRequest.onAuthRequired.addListener(
		handleProxyAuthRequired,
		{ urls: ['<all_urls>'] },
		['blocking'],
	)

	browser.webRequest.onCompleted.addListener(
		clearProxyAuthAttempt,
		{ urls: ['<all_urls>'] },
	)

	browser.webRequest.onErrorOccurred.addListener(
		clearProxyAuthAttempt,
		{ urls: ['<all_urls>'] },
	)

	browser.contextualIdentities.onRemoved.addListener(
		removeDeletedContainerProxy,
	)
})()
