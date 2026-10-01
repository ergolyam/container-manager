<template>
	<div class="panel">
		<div v-if="view === 'containers'" class="menu-panel">
			<h3 class="title">
				<span class="title-text ellipsis">Container Manager</span>
			</h3>
			<hr>
			<div class="scrollable identities-list">
				<div v-if="toggleError" class="list-error" role="alert">
					{{ toggleError }}
				</div>
				<table
					v-if="containerRows.length > 0"
					class="menu menu--containers"
					id="picker-identities-list"
				>
					<tr
						v-for="container in containerRows"
						:key="container.cookieStoreId"
						class="menu-item hover-highlight keyboard-nav"
						tabindex="0"
						@click="openContainer(container.cookieStoreId)"
						@keydown.enter.self.prevent="openContainer(container.cookieStoreId)"
					>
						<td>
							<div class="menu-icon hover-highlight">
								<div
									class="usercontext-icon"
									:data-identity-icon="container.icon"
									:data-identity-color="container.color"
								></div>
							</div>
							<span class="menu-text ellipsis" :title="container.name">
								{{ container.name }}
							</span>
							<span class="menu-right-float">
								<span class="container-count" :title="`URL rules for ${container.name}`">
									{{ container.assignmentCount }} {{ container.assignmentCount === 1 ? 'URL' : 'URLs' }}
								</span>
								<button
									v-if="container.hasProxy"
									class="proxy-toggle"
									:class="{ 'proxy-toggle--active': container.proxyEnabled }"
									type="button"
									role="switch"
									:aria-checked="container.proxyEnabled"
									:aria-label="proxyToggleLabel(container)"
									:title="proxyToggleTitle(container)"
									:disabled="isProxyTogglePending(container.cookieStoreId)"
									@click.stop="toggleProxy(container)"
								>
									<span class="proxy-toggle-track" aria-hidden="true">
										<span class="proxy-toggle-thumb"></span>
									</span>
									<span class="proxy-toggle-label">
										{{ container.proxyEnabled ? 'On' : 'Off' }}
									</span>
								</button>
								<span v-else class="proxy-state" title="Proxy is not configured">
									—
								</span>
								<span class="menu-arrow">
									<img alt="" src="/img/arrow-icon-right.svg">
								</span>
							</span>
						</td>
					</tr>
				</table>
				<div v-else class="empty-state">
					{{ loadError || 'No Firefox containers found.' }}
				</div>
			</div>
		</div>

		<div v-else class="menu-panel edit-container">
			<h3 class="title">
				<span class="title-text ellipsis" :title="tooltipText(selectedContainerName, 20)">
					{{ selectedContainerName }}
				</span>
			</h3>
			<button
				class="btn-return arrow-left controller"
				type="button"
				id="close-container-panel"
				@click="backToContainers"
				aria-label="Back to containers"
			></button>
			<hr>

			<div class="section-tabs" role="group" aria-label="Container settings">
				<button
					class="section-tab"
					type="button"
					:aria-pressed="view === 'assignments'"
					aria-controls="container-assignments"
					@click="view = 'assignments'"
				>
					URL rules <span class="section-count">{{ selectedUrls.length }}</span>
				</button>
				<button
					class="section-tab"
					type="button"
					:aria-pressed="view === 'proxy'"
					aria-controls="container-proxy"
					@click="view = 'proxy'"
				>
					Proxy
					<span v-if="hasSelectedDraft" class="section-state">Draft</span>
					<span v-else-if="hasSelectedAssignment" class="section-state">
						{{ selectedAssignment.enabled ? 'On' : 'Off' }}
					</span>
				</button>
			</div>

			<div
				v-show="view === 'assignments'"
				id="container-assignments"
				class="assignments-panel"
			>
				<div class="assignment-input-wrap">
					<label for="assignment-pattern-input" class="hide-label">Add site URL or pattern</label>
					<div class="assignment-input-row">
						<input
							id="assignment-pattern-input"
							type="text"
							v-model="newPattern"
							:placeholder="newPatternPlaceholder"
							@keydown.enter.prevent="addUrl"
						>
						<button class="button primary" type="button" @click="addUrl" :disabled="!canAddAssignment">
							Add
						</button>
					</div>
					<div v-if="urlSaveError" class="save-error" role="alert">{{ urlSaveError }}</div>
				</div>
				<div class="scrollable edit-sites-assigned">
					<div class="sub-header">Sites assigned to this container</div>
					<table class="menu menu--assignments" id="edit-sites-assigned" :hidden="selectedUrls.length === 0">
						<tr v-for="url in selectedUrls" :key="url.id" class="menu-item hover-highlight">
							<td>
								<div class="favicon"><span class="favicon-dot"></span></div>
								<span class="menu-text menu-text--url ellipsis" :title="url.pattern">
									{{ url.pattern }}
								</span>
								<button
									class="trash-button"
									type="button"
									:aria-label="`Delete assignment ${url.pattern}`"
									title="Delete site assignment"
									@click="removeUrl(url.id)"
								>
									<img class="delete-assignment" src="/img/container-delete.svg" alt="">
								</button>
							</td>
						</tr>
					</table>
					<div v-if="selectedUrls.length === 0" class="empty-state">No sites assigned yet.</div>
				</div>
			</div>

			<div v-show="view === 'proxy'" id="container-proxy" class="proxy-form scrollable">
				<div class="form-header">
					<div>
						<div class="sub-header">Proxy for this container</div>
						<div v-if="proxyPreview" class="proxy-preview ellipsis" :title="proxyPreview">
							{{ proxyPreview }}
						</div>
					</div>
					<span
						v-if="hasSelectedDraft || hasSelectedAssignment"
						class="proxy-status-badge"
						:class="{
							'proxy-status-badge--draft': hasSelectedDraft,
							'proxy-status-badge--off': (
								!hasSelectedDraft && !selectedAssignment.enabled
							),
						}"
					>
						{{ hasSelectedDraft
							? 'Draft'
							: (selectedAssignment.enabled ? 'Enabled' : 'Disabled')
						}}
					</span>
				</div>

				<div class="form-field">
					<label for="proxy-protocol">Protocol</label>
					<select
						id="proxy-protocol"
						v-model="form.type"
						@change="onProtocolChanged"
					>
						<option
							v-for="protocol in protocols"
							:key="protocol.value"
							:value="protocol.value"
						>
							{{ protocol.label }}
						</option>
					</select>
				</div>

				<div class="address-row">
					<div class="form-field">
						<label for="proxy-host">IP address or host</label>
						<input
							id="proxy-host"
							type="text"
							v-model="form.host"
							placeholder="127.0.0.1"
							maxlength="255"
							autocomplete="off"
							spellcheck="false"
							:aria-invalid="showHostError"
							@input="onFieldInput('host')"
							@blur="saveImmediately"
						>
						<span v-if="showHostError" class="field-error">
							Enter a valid IP address or host.
						</span>
					</div>

					<div class="form-field form-field--port">
						<label for="proxy-port">Port</label>
						<input
							id="proxy-port"
							type="text"
							v-model="form.port"
							:placeholder="portPlaceholder"
							maxlength="5"
							inputmode="numeric"
							autocomplete="off"
							:aria-invalid="showPortError"
							@input="onFieldInput('port')"
							@blur="saveImmediately"
						>
						<span v-if="showPortError" class="field-error">
							Use 1–65535.
						</span>
					</div>
				</div>

				<transition name="auth-fields">
					<div v-if="supportsAuthentication" class="authentication-fields">
						<div class="authentication-heading">
							Authentication <span>Optional</span>
						</div>
						<div class="credentials-row">
							<div class="form-field">
								<label for="proxy-username">Login</label>
								<input
									id="proxy-username"
									type="text"
									v-model="form.username"
									placeholder="Username"
									maxlength="128"
									autocomplete="off"
									spellcheck="false"
									:aria-invalid="showAuthenticationError"
									@input="onFieldInput('username')"
									@blur="saveImmediately"
								>
							</div>
							<div class="form-field">
								<label for="proxy-password">Password</label>
								<input
									id="proxy-password"
									type="password"
									v-model="form.password"
									placeholder="Password"
									maxlength="256"
									autocomplete="off"
									:aria-invalid="showAuthenticationError"
									@input="onFieldInput('password')"
									@blur="saveImmediately"
								>
							</div>
						</div>
						<span v-if="showAuthenticationError" class="field-error">
							{{ authenticationErrorMessage }}
						</span>
					</div>
				</transition>

				<div v-if="saveStatus === 'error'" class="save-error" role="alert">
					Could not save the proxy. Try again.
				</div>
				<div v-else-if="draftSaveError" class="save-error" role="alert">
					{{ draftSaveError }}
				</div>

				<button
					v-if="hasSelectedAssignment && !hasSelectedDraft"
					class="button remove-proxy"
					type="button"
					:disabled="saveStatus === 'removing'"
					@click="removeProxy"
				>
					{{ saveStatus === 'removing' ? 'Removing…' : 'Remove proxy' }}
				</button>
			</div>
		</div>
	</div>
</template>

<script>
import { v4 as uuid } from 'uuid'

const STORAGE_KEY = 'proxifiedContainersKey'
const DRAFT_STORAGE_KEY = 'proxyDraftKey'
const SAVE_DELAY_MS = 350

const PROTOCOLS = [
	{
		value: 'http',
		label: 'HTTP',
		portPlaceholder: '8080',
		supportsAuthentication: true,
	},
	{
		value: 'https',
		label: 'HTTPS',
		portPlaceholder: '443',
		supportsAuthentication: true,
	},
	{
		value: 'socks4',
		label: 'SOCKS4',
		portPlaceholder: '1080',
		supportsAuthentication: false,
	},
	{
		value: 'socks',
		label: 'SOCKS5',
		portPlaceholder: '1080',
		supportsAuthentication: true,
	},
]

function blankForm() {
	return {
		type: 'http',
		host: '',
		port: '',
		username: '',
		password: '',
	}
}

function blankTouched() {
	return {
		host: false,
		port: false,
		username: false,
		password: false,
	}
}

function normalizeDraftTouched(touched) {
	const source = touched && typeof touched === 'object' ? touched : {}
	return {
		host: source.host === true,
		port: source.port === true,
		username: source.username === true,
		password: source.password === true,
	}
}

function normalizeDraftForm(form) {
	const source = form && typeof form === 'object' ? form : {}
	return {
		type: PROTOCOLS.some((protocol) => protocol.value === source.type)
			? source.type
			: 'http',
		host: typeof source.host === 'string' ? source.host : '',
		port: (
			typeof source.port === 'string' || typeof source.port === 'number'
				? String(source.port)
				: ''
		),
		username: typeof source.username === 'string' ? source.username : '',
		password: typeof source.password === 'string' ? source.password : '',
	}
}

function formFromProxy(proxy) {
	return normalizeDraftForm(proxy)
}

function normalizeDraft(draft) {
	if (
		!draft ||
		typeof draft !== 'object' ||
		typeof draft.cookieStoreId !== 'string' ||
		draft.cookieStoreId.length === 0 ||
		!draft.form ||
		typeof draft.form !== 'object'
	) {
		return null
	}

	return {
		cookieStoreId: draft.cookieStoreId,
		form: normalizeDraftForm(draft.form),
		touched: normalizeDraftTouched(draft.touched),
	}
}

function normalizeAssignments(assignments) {
	if (!Array.isArray(assignments)) {
		return []
	}

	return assignments.reduce((normalized, assignment) => {
		if (
			!assignment ||
			typeof assignment.cookieStoreId !== 'string' ||
			!assignment.proxy
		) {
			return normalized
		}

		normalized.push({
			cookieStoreId: assignment.cookieStoreId,
			enabled: assignment.enabled !== false,
			proxy: assignment.proxy,
		})
		return normalized
	}, [])
}

function normalizeHost(host) {
	const trimmed = typeof host === 'string' ? host.trim() : ''
	if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
		return trimmed.slice(1, -1)
	}
	return trimmed
}

function isValidIpv4(host) {
	const octets = host.split('.')
	return (
		octets.length === 4 &&
		octets.every((octet) => (
			/^\d{1,3}$/.test(octet) &&
			Number(octet) >= 0 &&
			Number(octet) <= 255
		))
	)
}

function isValidIpv6(host) {
	if (!host.includes(':')) {
		return false
	}

	try {
		const parsed = new URL(`http://[${host}]/`)
		return parsed.hostname.length > 2
	} catch (error) {
		return false
	}
}

function isValidHostname(host) {
	if (host.length > 253 || host.includes('..')) {
		return false
	}

	const labels = host.split('.')
	return labels.every((label) => (
		label.length >= 1 &&
		label.length <= 63 &&
		/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
	))
}

function isValidProxyHost(host) {
	if (!host || /[\s/?#@]/.test(host)) {
		return false
	}

	if (host.includes(':')) {
		return isValidIpv6(host)
	}

	if (/^[\d.]+$/.test(host)) {
		return isValidIpv4(host)
	}

	return isValidHostname(host)
}

function proxySignature(proxy) {
	if (!proxy) {
		return ''
	}

	const form = formFromProxy(proxy)
	const protocol = PROTOCOLS.find((item) => item.value === form.type) || PROTOCOLS[0]
	const normalized = {
		type: form.type,
		host: normalizeHost(form.host),
		port: Number(form.port),
	}

	if (protocol.supportsAuthentication && form.username.length > 0) {
		normalized.username = form.username
		normalized.password = form.password
	}

	return JSON.stringify(normalized)
}

function replaceAssignment(assignments, cookieStoreId, proxy) {
	const normalized = normalizeAssignments(assignments)
	const existing = normalized.find((assignment) => (
		assignment.cookieStoreId === cookieStoreId
	))
	const remaining = normalized.filter((assignment) => (
		assignment.cookieStoreId !== cookieStoreId
	))

	remaining.push({
		cookieStoreId,
		enabled: existing ? existing.enabled : true,
		proxy,
	})
	return remaining
}

export default {
	data() {
		return {
			view: 'containers',
			urls: [],
			urlsLoaded: false,
			newPattern: '',
			currentTabUrl: '',
			urlSaveError: '',
			protocols: PROTOCOLS,
			proxies: [],
			contextualIdentities: [],
			selectedCookieStoreId: '',
			form: blankForm(),
			draft: null,
			touched: blankTouched(),
			saveStatus: 'idle',
			saveTimer: null,
			saveRevision: 0,
			saveQueue: Promise.resolve(),
			draftWritePromise: Promise.resolve(),
			lastSavedSignature: '',
			draftSaveError: '',
			loadError: '',
			toggleError: '',
			togglePendingCookieStoreIds: [],
		}
	},
	computed: {
		containerRows() {
			return this.contextualIdentities.map((container) => {
				const assignment = this.proxies.find((item) => (
					item.cookieStoreId === container.cookieStoreId
				))
				return {
					...container,
					assignmentCount: this.urls.filter((url) => url.containerName === container.name).length,
					hasProxy: Boolean(assignment),
					proxyEnabled: Boolean(assignment && assignment.enabled),
				}
			})
		},
		selectedContainer() {
			return this.contextualIdentities.find((container) => (
				container.cookieStoreId === this.selectedCookieStoreId
			)) || null
		},
		selectedContainerName() {
			return this.selectedContainer ? this.selectedContainer.name : ''
		},
		selectedUrls() {
			return this.urls
				.filter((url) => url.containerName === this.selectedContainerName)
				.slice()
				.reverse()
		},
		effectivePattern() {
			const trimmed = this.newPattern.trim()
			return trimmed.length > 0 ? trimmed : this.automaticPattern
		},
		automaticPattern() {
			return this.currentTabUrl.replace(/^https?:\/\//, '')
		},
		newPatternPlaceholder() {
			return this.automaticPattern || 'example.com'
		},
		canAddAssignment() {
			return this.urlsLoaded && this.selectedContainerName.length > 0 && this.effectivePattern.length > 0
		},
		selectedAssignment() {
			return this.proxies.find((assignment) => (
				assignment.cookieStoreId === this.selectedCookieStoreId
			)) || null
		},
		selectedDraft() {
			return (
				this.draft &&
				this.draft.cookieStoreId === this.selectedCookieStoreId
					? this.draft
					: null
			)
		},
		hasSelectedAssignment() {
			return Boolean(this.selectedAssignment)
		},
		hasSelectedDraft() {
			return Boolean(this.selectedDraft)
		},
		selectedProtocol() {
			return this.protocols.find((protocol) => (
				protocol.value === this.form.type
			)) || this.protocols[0]
		},
		supportsAuthentication() {
			return this.selectedProtocol.supportsAuthentication
		},
		portPlaceholder() {
			return this.selectedProtocol.portPlaceholder
		},
		normalizedHost() {
			return normalizeHost(this.form.host)
		},
		hostIsValid() {
			return isValidProxyHost(this.normalizedHost)
		},
		portNumber() {
			return Number(this.form.port)
		},
		portIsValid() {
			return (
				/^\d+$/.test(this.form.port) &&
				Number.isInteger(this.portNumber) &&
				this.portNumber >= 1 &&
				this.portNumber <= 65535
			)
		},
		authenticationIsValid() {
			if (!this.supportsAuthentication) {
				return true
			}

			const hasUsername = this.form.username.length > 0
			const hasPassword = this.form.password.length > 0

			if (this.form.type === 'socks') {
				return hasUsername === hasPassword
			}

			return !hasPassword || hasUsername
		},
		authenticationErrorMessage() {
			return this.form.type === 'socks'
				? 'Enter both a login and password for SOCKS5.'
				: 'Enter a login before the password.'
		},
		canPersistProxy() {
			return (
				this.selectedCookieStoreId.length > 0 &&
				this.hostIsValid &&
				this.portIsValid &&
				this.authenticationIsValid
			)
		},
		showHostError() {
			return this.touched.host && !this.hostIsValid
		},
		showPortError() {
			return this.touched.port && !this.portIsValid
		},
		showAuthenticationError() {
			return (
				(this.touched.username || this.touched.password) &&
				!this.authenticationIsValid
			)
		},
		normalizedProxy() {
			const proxy = {
				type: this.form.type,
				host: this.normalizedHost,
				port: this.portNumber,
			}

			if (this.supportsAuthentication && this.form.username.length > 0) {
				proxy.username = this.form.username
				proxy.password = this.form.password
			}

			return proxy
		},
		currentSignature() {
			return this.canPersistProxy
				? JSON.stringify(this.normalizedProxy)
				: ''
		},
		proxyPreview() {
			if (!this.canPersistProxy) {
				return ''
			}

			const displayHost = this.normalizedHost.includes(':')
				? `[${this.normalizedHost}]`
				: this.normalizedHost
			return `${this.selectedProtocol.label} · ${displayHost}:${this.portNumber}`
		},
	},
	async mounted() {
		try {
			const [stored, containers] = await Promise.all([
				browser.storage.local.get({
					[STORAGE_KEY]: [],
					[DRAFT_STORAGE_KEY]: null,
				}),
				browser.contextualIdentities.query({}),
			])
			this.proxies = normalizeAssignments(stored[STORAGE_KEY])
			this.draft = normalizeDraft(stored[DRAFT_STORAGE_KEY])
			this.contextualIdentities = containers

			if (this.draft) {
				if (this.contextualIdentities.some((container) => (
					container.cookieStoreId === this.draft.cookieStoreId
				))) {
					this.openContainer(this.draft.cookieStoreId, 'proxy')
				} else {
					this.discardDraft(this.draft.cookieStoreId)
				}
			}
		} catch (error) {
			console.debug('Failed to load proxy settings:', error)
			this.loadError = 'Could not load Firefox containers.'
		}

		browser.storage.onChanged.addListener(this.syncStorage)
		browser.contextualIdentities.onCreated.addListener(this.refreshContainers)
		browser.contextualIdentities.onUpdated.addListener(this.refreshContainers)
		browser.contextualIdentities.onRemoved.addListener(this.refreshContainers)

		try {
			const { urls } = await browser.storage.sync.get({ urls: [] })
			if (!this.urlsLoaded) {
				this.urls = Array.isArray(urls) ? urls : []
			}
			this.urlsLoaded = true
		} catch (error) {
			console.debug('Failed to load URL assignments:', error)
			this.urlSaveError = 'Could not load URL rules. Reopen the popup to try again.'
		}
		await this.loadCurrentTabUrl()
	},
	beforeUnmount() {
		if (this.saveTimer) {
			clearTimeout(this.saveTimer)
			this.saveTimer = null
		}
	},
	unmounted() {
		browser.storage.onChanged.removeListener(this.syncStorage)
		browser.contextualIdentities.onCreated.removeListener(this.refreshContainers)
		browser.contextualIdentities.onUpdated.removeListener(this.refreshContainers)
		browser.contextualIdentities.onRemoved.removeListener(this.refreshContainers)
	},
	methods: {
		async loadCurrentTabUrl() {
			try {
				const tabs = await browser.tabs.query({ active: true, currentWindow: true })
				if (!tabs || tabs.length === 0) {
					return
				}
				const url = tabs[0].url || ''
				if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
					this.currentTabUrl = url
				}
			} catch (error) {
				console.debug('Failed to read current tab URL:', error)
			}
		},
		async addUrl() {
			if (!this.canAddAssignment) {
				return
			}
			this.urls.push({
				id: uuid(),
				pattern: this.effectivePattern,
				containerName: this.selectedContainerName,
			})
			this.newPattern = ''
			await this.persistUrls()
		},
		async removeUrl(id) {
			this.urls = this.urls.filter((url) => url.id !== id)
			await this.persistUrls()
		},
		async persistUrls() {
			this.urlSaveError = ''
			try {
				await browser.storage.sync.set({ urls: this.urls })
			} catch (error) {
				console.debug('Failed to save URL assignments:', error)
				this.urlSaveError = 'Could not save URL rules. Try again.'
			}
		},
		tooltipText(value, threshold) {
			if (
				typeof value !== 'string' ||
				typeof threshold !== 'number' ||
				value.length <= threshold
			) {
				return ''
			}
			return value
		},
		isProxyTogglePending(cookieStoreId) {
			return this.togglePendingCookieStoreIds.includes(cookieStoreId)
		},
		proxyToggleLabel(container) {
			return `Proxy for ${container.name}`
		},
		proxyToggleTitle(container) {
			return container.proxyEnabled
				? 'Temporarily disable proxy'
				: 'Enable proxy'
		},
		async toggleProxy(container) {
			if (
				!container.hasProxy ||
				this.isProxyTogglePending(container.cookieStoreId)
			) {
				return
			}

			const cookieStoreId = container.cookieStoreId
			const enabled = !container.proxyEnabled
			const previousAssignments = this.proxies
			this.toggleError = ''
			this.togglePendingCookieStoreIds.push(cookieStoreId)
			this.proxies = this.proxies.map((assignment) => (
				assignment.cookieStoreId === cookieStoreId
					? { ...assignment, enabled }
					: assignment
			))

			const operation = this.saveQueue
				.catch(() => {})
				.then(async () => {
					const stored = await browser.storage.local.get({ [STORAGE_KEY]: [] })
					const assignments = normalizeAssignments(stored[STORAGE_KEY])
					if (!assignments.some((assignment) => (
						assignment.cookieStoreId === cookieStoreId
					))) {
						return assignments
					}

					const updated = assignments.map((assignment) => (
						assignment.cookieStoreId === cookieStoreId
							? { ...assignment, enabled }
							: assignment
					))
					await browser.storage.local.set({
						[STORAGE_KEY]: updated,
					})
					return updated
				})

			this.saveQueue = operation

			try {
				this.proxies = await operation
			} catch (error) {
				console.debug('Failed to change the container proxy state:', error)
				this.proxies = previousAssignments
				this.toggleError = 'Could not change the proxy state. Try again.'
			} finally {
				this.togglePendingCookieStoreIds = this.togglePendingCookieStoreIds
					.filter((id) => id !== cookieStoreId)
			}
		},
		openContainer(cookieStoreId, section = 'assignments') {
			this.saveRevision += 1
			this.selectedCookieStoreId = cookieStoreId
			const assignment = this.proxies.find((item) => (
				item.cookieStoreId === cookieStoreId
			))
			const proxy = assignment && assignment.proxy
			const draft = (
				this.draft && this.draft.cookieStoreId === cookieStoreId
					? this.draft
					: null
			)

			this.form = draft
				? normalizeDraftForm(draft.form)
				: (proxy ? formFromProxy(proxy) : blankForm())

			this.touched = draft
				? normalizeDraftTouched(draft.touched)
				: blankTouched()
			this.lastSavedSignature = proxySignature(proxy)
			this.saveStatus = draft ? 'draft' : (proxy ? 'saved' : 'idle')
			this.draftSaveError = ''
			this.newPattern = ''
			this.view = section
		},
		backToContainers() {
			if (this.saveTimer) {
				clearTimeout(this.saveTimer)
				this.saveTimer = null
			}

			this.saveRevision += 1
			this.discardDraft(this.selectedCookieStoreId)
			this.view = 'containers'
			this.newPattern = ''
			this.selectedCookieStoreId = ''
			this.form = blankForm()
			this.lastSavedSignature = ''
			this.saveStatus = 'idle'
			this.draftSaveError = ''
		},
		onProtocolChanged() {
			if (!this.supportsAuthentication) {
				this.form.username = ''
				this.form.password = ''
			}
			this.onFieldInput('type')
		},
		onFieldInput(field) {
			if (Object.prototype.hasOwnProperty.call(this.touched, field)) {
				this.touched[field] = true
			}

			if (this.saveTimer) {
				clearTimeout(this.saveTimer)
				this.saveTimer = null
			}

			const revision = ++this.saveRevision

			if (
				this.hasSelectedAssignment &&
				this.canPersistProxy &&
				this.currentSignature === this.lastSavedSignature
			) {
				this.discardDraft(this.selectedCookieStoreId)
				this.saveStatus = 'saved'
				return
			}

			this.persistDraft(revision)

			if (!this.canPersistProxy) {
				this.saveStatus = 'incomplete'
				return
			}

			this.saveStatus = 'pending'
			this.saveTimer = setTimeout(() => {
				this.saveTimer = null
				this.persistProxy(revision)
			}, SAVE_DELAY_MS)
		},
		saveImmediately() {
			if (this.saveTimer) {
				clearTimeout(this.saveTimer)
				this.saveTimer = null
			}

			if (
				this.hasSelectedDraft &&
				this.canPersistProxy &&
				this.currentSignature !== this.lastSavedSignature
			) {
				this.persistProxy(this.saveRevision)
			}
		},
		persistDraft(revision) {
			if (!this.selectedCookieStoreId) {
				return
			}

			const draft = {
				cookieStoreId: this.selectedCookieStoreId,
				form: normalizeDraftForm(this.form),
				touched: normalizeDraftTouched(this.touched),
			}
			this.draft = draft
			this.draftSaveError = ''

			const write = browser.storage.local.set({
				[DRAFT_STORAGE_KEY]: draft,
			}).catch((error) => {
				console.debug('Failed to save the container proxy draft:', error)
				if (
					revision === this.saveRevision &&
					draft.cookieStoreId === this.selectedCookieStoreId
				) {
					this.draftSaveError = 'Could not save the draft. Try again.'
				}
			})

			this.draftWritePromise = Promise.all([
				this.draftWritePromise,
				write,
			]).then(() => {})
		},
		discardDraft(cookieStoreId) {
			if (!cookieStoreId) {
				return
			}

			if (this.draft && this.draft.cookieStoreId === cookieStoreId) {
				this.draft = null
			}

			const removal = browser.storage.local.remove(DRAFT_STORAGE_KEY)
				.catch((error) => {
					console.debug('Failed to remove the container proxy draft:', error)
				})

			this.draftWritePromise = Promise.all([
				this.draftWritePromise,
				removal,
			]).then(() => {})
		},
		async persistProxy(revision = this.saveRevision) {
			if (
				!this.hasSelectedDraft ||
				!this.canPersistProxy ||
				revision !== this.saveRevision
			) {
				return
			}

			const cookieStoreId = this.selectedCookieStoreId
			const proxy = { ...this.normalizedProxy }
			const signature = JSON.stringify(proxy)
			const pendingDraftWrites = this.draftWritePromise
			this.saveStatus = 'saving'

			const operation = this.saveQueue
				.catch(() => {})
				.then(async () => {
					await pendingDraftWrites
					const stored = await browser.storage.local.get({ [STORAGE_KEY]: [] })
					const assignments = normalizeAssignments(stored[STORAGE_KEY])
					if (
						revision !== this.saveRevision ||
						cookieStoreId !== this.selectedCookieStoreId ||
						signature !== this.currentSignature ||
						!this.hasSelectedDraft
					) {
						return { updated: assignments, committed: false }
					}

					const updated = replaceAssignment(
						assignments,
						cookieStoreId,
						proxy,
					)
					await browser.storage.local.set({
						[STORAGE_KEY]: updated,
					})

					if (
						revision !== this.saveRevision ||
						cookieStoreId !== this.selectedCookieStoreId ||
						signature !== this.currentSignature
					) {
						return { updated, committed: false }
					}

					await browser.storage.local.remove(DRAFT_STORAGE_KEY)
					return { updated, committed: true }
				})

			this.saveQueue = operation

			try {
				const result = await operation
				const { updated, committed } = result
				this.proxies = updated

				if (
					committed &&
					revision === this.saveRevision &&
					cookieStoreId === this.selectedCookieStoreId &&
					signature === this.currentSignature
				) {
					this.draft = null
					this.lastSavedSignature = signature
					this.saveStatus = 'saved'
					this.draftSaveError = ''
				}
			} catch (error) {
				console.debug('Failed to save the container proxy:', error)
				if (revision === this.saveRevision) {
					this.saveStatus = 'error'
				}
			}
		},
		async removeProxy() {
			if (!this.selectedCookieStoreId || this.hasSelectedDraft) {
				return
			}

			if (this.saveTimer) {
				clearTimeout(this.saveTimer)
				this.saveTimer = null
			}

			const cookieStoreId = this.selectedCookieStoreId
			const revision = ++this.saveRevision
			this.saveStatus = 'removing'

			const operation = this.saveQueue
				.catch(() => {})
				.then(async () => {
					const stored = await browser.storage.local.get({ [STORAGE_KEY]: [] })
					const updated = normalizeAssignments(stored[STORAGE_KEY])
						.filter((assignment) => (
							assignment.cookieStoreId !== cookieStoreId
						))
					await browser.storage.local.set({
						[STORAGE_KEY]: updated,
					})
					return updated
				})

			this.saveQueue = operation

			try {
				const updated = await operation
				this.proxies = updated

				if (
					revision === this.saveRevision &&
					cookieStoreId === this.selectedCookieStoreId
				) {
					this.form = blankForm()
					this.touched = {
						host: false,
						port: false,
						username: false,
						password: false,
					}
					this.lastSavedSignature = ''
					this.saveStatus = 'removed'
				}
			} catch (error) {
				console.debug('Failed to remove the container proxy:', error)
				if (revision === this.saveRevision) {
					this.saveStatus = 'error'
				}
			}
		},
		syncStorage(changes, areaName) {
			if (areaName === 'sync' && changes.urls) {
				this.urls = Array.isArray(changes.urls.newValue) ? changes.urls.newValue : []
				this.urlsLoaded = true
			}

			if (areaName !== 'local') {
				return
			}

			if (changes[STORAGE_KEY]) {
				this.proxies = normalizeAssignments(changes[STORAGE_KEY].newValue)
			}

			if (changes[DRAFT_STORAGE_KEY]) {
				this.draft = normalizeDraft(changes[DRAFT_STORAGE_KEY].newValue)
			}
		},
		async refreshContainers() {
			try {
				this.contextualIdentities = await browser.contextualIdentities.query({})
				if (
					this.selectedCookieStoreId &&
					!this.contextualIdentities.some((container) => (
						container.cookieStoreId === this.selectedCookieStoreId
					))
				) {
					if (this.saveTimer) {
						clearTimeout(this.saveTimer)
						this.saveTimer = null
					}
					this.saveRevision += 1
					this.discardDraft(this.selectedCookieStoreId)
					this.view = 'containers'
					this.selectedCookieStoreId = ''
					this.form = blankForm()
					this.lastSavedSignature = ''
					this.saveStatus = 'idle'
				}
			} catch (error) {
				console.debug('Failed to refresh Firefox containers:', error)
			}
		},
	},
}
</script>
