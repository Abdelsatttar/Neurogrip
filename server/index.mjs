import http from 'node:http'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'

const PORT = Number(process.env.AUTH_PORT || 4000)
const SESSION_TTL_MS = 8 * 60 * 60 * 1000
const COOKIE_NAME = 'neurogrip_session'
const DATA_DIR = process.env.NEUROGRIP_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), 'data')
const SUPPORT_FILE = path.join(DATA_DIR, 'support-tickets.json')
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json')
const NOTIFICATIONS_FILE = path.join(DATA_DIR, 'notifications.json')
mkdirSync(DATA_DIR, { recursive: true })

function makePasswordRecord(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return { salt, hash }
}

function loadRegisteredAccounts() {
  try {
    const parsed = JSON.parse(readFileSync(ACCOUNTS_FILE, 'utf8'))
    if (!Array.isArray(parsed)) return []
    return parsed.filter((account) => account && typeof account.id === 'string' &&
      ['patient', 'doctor', 'developer'].includes(account.role) && typeof account.email === 'string' &&
      typeof account.name === 'string' && account.passwordRecord && typeof account.passwordRecord.salt === 'string' &&
      typeof account.passwordRecord.hash === 'string')
  } catch {
    return []
  }
}

const accounts = loadRegisteredAccounts()

function persistRegisteredAccounts() {
  const persisted = accounts.map(({ id, role, name, email, passwordRecord, createdAt, profile_phone, preferred_hand, profile_avatar_data }) => ({ id, role, name, email, passwordRecord, createdAt, profile_phone, preferred_hand, profile_avatar_data }))
  const temporaryFile = `${ACCOUNTS_FILE}.tmp`
  writeFileSync(temporaryFile, JSON.stringify(persisted, null, 2), { mode: 0o600 })
  renameSync(temporaryFile, ACCOUNTS_FILE)
}

const sessions = new Map()
const rateLimit = new Map()

function sendJson(response, status, payload, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers })
  response.end(JSON.stringify(payload))
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
      if (body.length > 1024 * 1024) {
        reject(new Error('Request body is too large'))
        request.destroy()
      }
    })
    request.on('end', () => {
      if (!body) return resolve({})
      try { resolve(JSON.parse(body)) } catch { reject(new Error('Invalid JSON')) }
    })
    request.on('error', reject)
  })
}

function getCookie(request, key) {
  const cookieHeader = request.headers.cookie || ''
  for (const part of cookieHeader.split(';')) {
    const [name, ...value] = part.trim().split('=')
    if (name === key) return decodeURIComponent(value.join('='))
  }
  return null
}

function getSessionUser(request) {
  const token = getCookie(request, COOKIE_NAME)
  if (!token) return null
  const session = sessions.get(token)
  if (!session) return null
  if (session.expiresAt < Date.now()) {
    sessions.delete(token)
    return null
  }
  return accounts.find((account) => account.id === session.userId) || null
}

function passwordMatches(password, record) {
  const candidate = scryptSync(password, record.salt, 64)
  const expected = Buffer.from(record.hash, 'hex')
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

function sessionCookie(token, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`
}

function publicUser(account) {
  return {
    userId: account.id,
    role: account.role,
    name: account.name,
    email: account.email,
    phone: account.profile_phone || '',
    preferredHand: account.preferred_hand || 'right',
  }
}


function loadSupportTickets() {
  try {
    const parsed = JSON.parse(readFileSync(SUPPORT_FILE, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

let supportTickets = loadSupportTickets()

function persistSupportTickets() {
  const temporaryFile = `${SUPPORT_FILE}.tmp`
  writeFileSync(temporaryFile, JSON.stringify(supportTickets, null, 2), { mode: 0o600 })
  renameSync(temporaryFile, SUPPORT_FILE)
}

function loadNotifications() {
  try {
    const parsed = JSON.parse(readFileSync(NOTIFICATIONS_FILE, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

let notifications = loadNotifications()

function persistNotifications() {
  const temporaryFile = `${NOTIFICATIONS_FILE}.tmp`
  writeFileSync(temporaryFile, JSON.stringify(notifications, null, 2), { mode: 0o600 })
  renameSync(temporaryFile, NOTIFICATIONS_FILE)
}

function notifyUsers(users, notification) {
  const recipients = new Set(users.map((user) => user?.id).filter(Boolean))
  const now = new Date().toISOString()
  for (const userId of recipients) {
    notifications.push({
      id: randomUUID(),
      userId,
      type: notification.type,
      ticketId: notification.ticketId || null,
      subject: notification.subject || '',
      actorRole: notification.actorRole || '',
      createdAt: now,
      readAt: null,
    })
  }
  if (notifications.length > 2000) notifications = notifications.slice(-2000)
  if (recipients.size) persistNotifications()
}

function doctorAccounts() { return accounts.filter((account) => account.role === 'doctor') }
function developerAccounts() { return accounts.filter((account) => account.role === 'developer') }
function accountById(userId) { return accounts.find((account) => account.id === userId) || null }

function notificationRecipientsForTicket(ticket, senderRole) {
  const patient = accountById(ticket.patientId)
  const recipients = []
  if (senderRole !== 'patient' && patient) recipients.push(patient)
  if (senderRole !== 'doctor') recipients.push(...doctorAccounts())
  if (ticket.sharedWithDeveloper && ticket.forwardedToDeveloper && senderRole !== 'developer') recipients.push(...developerAccounts())
  if (senderRole === 'developer') recipients.push(...doctorAccounts())
  return recipients
}

function canViewSupportTicket(user, ticket) {
  if (user.role === 'patient') return ticket.patientId === user.id
  if (user.role === 'doctor') return true
  return user.role === 'developer' && ticket.sharedWithDeveloper === true && ticket.forwardedToDeveloper === true
}

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function sortTicketsNewestFirst(items) {
  return [...items].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

function supportTicketForUser(user, ticket) {
  if (user.role !== 'developer') return ticket
  return {
    ...ticket,
    patientId: '',
    patientName: 'Patient',
    messages: ticket.messages.map((message) => ({
      ...message,
      authorId: message.authorId === user.id ? user.id : message.authorRole === 'patient' ? 'patient' : message.authorId,
      authorName: message.authorRole === 'patient' ? 'Patient' : message.authorName,
    })),
  }
}

function isLoginRateLimited(request) {
  const ip = request.socket.remoteAddress || 'unknown'
  const now = Date.now()
  const record = rateLimit.get(ip)
  if (!record || now - record.startedAt > 60_000) {
    rateLimit.set(ip, { startedAt: now, attempts: 1 })
    return false
  }
  record.attempts += 1
  return record.attempts > 12
}

const workspaceMap = {
  patient: ['dashboard', 'howToUse', 'learning', 'support', 'profile', 'settings'],
  doctor: ['overview', 'patients', 'reports', 'support', 'settings'],
  developer: ['overview', 'diagnostics', 'logs', 'support', 'settings'],
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
  const pathname = url.pathname

  if (pathname === '/api/health' && request.method === 'GET') {
    return sendJson(response, 200, { ok: true, service: 'neurogrip-auth' })
  }
  if (pathname === '/api/auth/providers' && request.method === 'GET') {
    return sendJson(response, 200, { google: false, passwordReset: false })
  }

  if (['/api/auth/google/start', '/api/auth/forgot-password', '/api/auth/reset-password'].includes(pathname) && request.method === 'POST') {
    const isGoogle = pathname === '/api/auth/google/start'
    return sendJson(response, 503, {
      code: isGoogle ? 'google_not_configured' : 'email_not_configured',
      error: 'This feature is available in the production deployment after its provider is configured.',
    })
  }


  if (pathname === '/api/auth/login' && request.method === 'POST') {
    if (isLoginRateLimited(request)) return sendJson(response, 429, { error: 'Too many sign-in attempts. Try again in one minute.' })
    try {
      const body = await readJson(request)
      const role = typeof body.role === 'string' ? body.role : ''
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
      const password = typeof body.password === 'string' ? body.password : ''
      const account = accounts.find((item) => item.role === role && item.email.toLowerCase() === email)
      if (!account || !passwordMatches(password, account.passwordRecord)) {
        return sendJson(response, 401, { error: 'Invalid email, password, or account role.' })
      }
      const token = randomBytes(32).toString('hex')
      sessions.set(token, { userId: account.id, expiresAt: Date.now() + SESSION_TTL_MS })
      return sendJson(response, 200, { user: publicUser(account) }, { 'Set-Cookie': sessionCookie(token, SESSION_TTL_MS / 1000) })
    } catch {
      return sendJson(response, 400, { error: 'Invalid sign-in request.' })
    }
  }

  if (pathname === '/api/auth/register' && request.method === 'POST') {
    if (isLoginRateLimited(request)) return sendJson(response, 429, { code: 'rate_limited' })
    try {
      const body = await readJson(request)
      const role = typeof body.role === 'string' ? body.role : ''
      const name = cleanText(body.name, 80)
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
      const password = typeof body.password === 'string' ? body.password : ''
      const inviteCode = typeof body.inviteCode === 'string' ? body.inviteCode.trim() : ''
      const phone = cleanText(body.phone, 30)
      const preferredHand = body.preferredHand === 'left' ? 'left' : body.preferredHand === 'right' ? 'right' : 'right'
      if (!['patient', 'doctor', 'developer'].includes(role)) return sendJson(response, 400, { code: 'invalid_role' })
      if (body.acceptTerms !== true) return sendJson(response, 400, { code: 'terms_required' })
      if (phone && !/^[+0-9().\s-]{7,30}$/.test(phone)) return sendJson(response, 400, { code: 'invalid_phone' })
      if (name.length < 2) return sendJson(response, 400, { code: 'invalid_name' })
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJson(response, 400, { code: 'invalid_email' })
      if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) return sendJson(response, 400, { code: 'weak_password' })
      if (accounts.some((account) => account.email.toLowerCase() === email)) return sendJson(response, 409, { code: 'email_exists' })
      if (role === 'doctor' && (!process.env.DOCTOR_INVITE_CODE || inviteCode !== process.env.DOCTOR_INVITE_CODE)) return sendJson(response, 403, { code: 'invalid_invite' })
      if (role === 'developer' && (!process.env.DEVELOPER_INVITE_CODE || inviteCode !== process.env.DEVELOPER_INVITE_CODE)) return sendJson(response, 403, { code: 'invalid_invite' })

      const account = {
        id: `user-${randomUUID()}`,
        role,
        name,
        email,
        profile_phone: phone || null,
        preferred_hand: preferredHand,
        passwordRecord: makePasswordRecord(password),
        createdAt: new Date().toISOString(),
      }
      accounts.push(account)
      persistRegisteredAccounts()
      const token = randomBytes(32).toString('hex')
      sessions.set(token, { userId: account.id, expiresAt: Date.now() + SESSION_TTL_MS })
      notifyUsers([account], { type: 'welcome' })
      return sendJson(response, 201, { user: publicUser(account) }, { 'Set-Cookie': sessionCookie(token, SESSION_TTL_MS / 1000) })
    } catch {
      return sendJson(response, 400, { code: 'invalid_registration' })
    }
  }

  if (pathname === '/api/auth/me' && request.method === 'GET') {
    const user = getSessionUser(request)
    if (!user) return sendJson(response, 401, { error: 'Not signed in.' })
    return sendJson(response, 200, publicUser(user))
  }
  if (pathname === '/api/auth/profile' && request.method === 'PATCH') {
    const user = getSessionUser(request)
    if (!user) return sendJson(response, 401, { error: 'Sign in required.' })
    try {
      const body = await readJson(request)
      const name = cleanText(body.name, 80)
      const phone = cleanText(body.phone, 30)
      const preferredHand = body.preferredHand === 'left' ? 'left' : body.preferredHand === 'right' ? 'right' : null
      if (name.length < 2) return sendJson(response, 400, { code: 'invalid_name' })
      if (phone && !/^[+0-9().\s-]{7,30}$/.test(phone)) return sendJson(response, 400, { code: 'invalid_phone' })
      if (!preferredHand) return sendJson(response, 400, { code: 'invalid_hand_preference' })
      user.name = name
      user.profile_phone = phone || null
      user.preferred_hand = preferredHand
      persistRegisteredAccounts()
      return sendJson(response, 200, { user: publicUser(user) })
    } catch {
      return sendJson(response, 400, { code: 'invalid_profile' })
    }
  }

  if (pathname === '/api/auth/avatar' && request.method === 'GET') {
    const user = getSessionUser(request)
    if (!user) return sendJson(response, 401, { error: 'Sign in required.' })
    return sendJson(response, 200, { avatar: user.profile_avatar_data || '' })
  }

  if (pathname === '/api/auth/avatar' && request.method === 'PUT') {
    const user = getSessionUser(request)
    if (!user) return sendJson(response, 401, { error: 'Sign in required.' })
    if (isLoginRateLimited(request)) return sendJson(response, 429, { code: 'rate_limited' })
    const body = await readJson(request)
    const avatar = typeof body.avatar === 'string' ? body.avatar : ''
    const match = avatar.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/)
    if (!match || avatar.length > 220000) return sendJson(response, 400, { code: 'invalid_avatar' })
    const bytes = Buffer.from(match[1], 'base64')
    if (bytes.length < 100 || bytes.length > 160000 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff ||
      bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9 || bytes.toString('base64') !== match[1]) {
      return sendJson(response, 400, { code: 'invalid_avatar' })
    }
    user.profile_avatar_data = avatar
    persistRegisteredAccounts()
    return sendJson(response, 200, { ok: true, avatar })
  }

  if (pathname === '/api/auth/avatar' && request.method === 'DELETE') {
    const user = getSessionUser(request)
    if (!user) return sendJson(response, 401, { error: 'Sign in required.' })
    delete user.profile_avatar_data
    persistRegisteredAccounts()
    return sendJson(response, 200, { ok: true })
  }

  if (pathname === '/api/auth/change-password' && request.method === 'POST') {
    const user = getSessionUser(request)
    if (!user) return sendJson(response, 401, { error: 'Sign in required.' })
    if (isLoginRateLimited(request)) return sendJson(response, 429, { code: 'rate_limited' })
    const body = await readJson(request)
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''
    if (!currentPassword) return sendJson(response, 400, { code: 'current_password_required' })
    if (newPassword.length < 8 || Buffer.byteLength(newPassword, 'utf8') > 72) return sendJson(response, 400, { code: 'weak_password' })
    if (!user.passwordRecord?.salt || !user.passwordRecord?.hash) return sendJson(response, 409, { code: 'password_not_set' })
    if (!passwordMatches(currentPassword, user.passwordRecord)) return sendJson(response, 403, { code: 'current_password_invalid' })
    if (passwordMatches(newPassword, user.passwordRecord)) return sendJson(response, 400, { code: 'same_password' })
    user.passwordRecord = makePasswordRecord(newPassword)
    persistRegisteredAccounts()
    for (const [token, session] of sessions.entries()) {
      if (session.userId === user.id) sessions.delete(token)
    }
    const token = randomBytes(32).toString('hex')
    sessions.set(token, { userId: user.id, expiresAt: Date.now() + SESSION_TTL_MS })
    return sendJson(response, 200, { ok: true }, { 'Set-Cookie': sessionCookie(token, SESSION_TTL_MS / 1000) })
  }



  if (pathname === '/api/auth/logout' && request.method === 'POST') {
    const token = getCookie(request, COOKIE_NAME)
    if (token) sessions.delete(token)
    return sendJson(response, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) })
  }

  const workspaceMatch = pathname.match(/^\/api\/(patient|doctor|developer)\/workspace$/)
  if (workspaceMatch && request.method === 'GET') {
    const requiredRole = workspaceMatch[1]
    const user = getSessionUser(request)
    if (!user) return sendJson(response, 401, { error: 'Sign in required.' })
    if (user.role !== requiredRole) return sendJson(response, 403, { error: 'Your account cannot access this workspace.' })
    return sendJson(response, 200, { role: user.role, user: publicUser(user), sections: workspaceMap[user.role] })
  }

  if (pathname === '/api/notifications' && request.method === 'GET') {
    const user = getSessionUser(request)
    if (!user) return sendJson(response, 401, { error: 'Sign in required.' })
    const userNotifications = notifications
      .filter((item) => item.userId === user.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 50)
      .map(({ id, type, ticketId, subject, actorRole, createdAt, readAt }) => ({ id, type, ticketId, subject, actorRole, createdAt, readAt }))
    return sendJson(response, 200, { notifications: userNotifications, unreadCount: userNotifications.filter((item) => !item.readAt).length })
  }

  const notificationReadMatch = pathname.match(/^\/api\/notifications\/([^/]+)\/read$/)
  if (notificationReadMatch && request.method === 'POST') {
    const user = getSessionUser(request)
    if (!user) return sendJson(response, 401, { error: 'Sign in required.' })
    const notification = notifications.find((item) => item.id === notificationReadMatch[1] && item.userId === user.id)
    if (!notification) return sendJson(response, 404, { error: 'Notification not found.' })
    notification.readAt = notification.readAt || new Date().toISOString()
    persistNotifications()
    return sendJson(response, 200, { ok: true })
  }

  if (pathname === '/api/notifications/read-all' && request.method === 'POST') {
    const user = getSessionUser(request)
    if (!user) return sendJson(response, 401, { error: 'Sign in required.' })
    const timestamp = new Date().toISOString()
    for (const notification of notifications) {
      if (notification.userId === user.id && !notification.readAt) notification.readAt = timestamp
    }
    persistNotifications()
    return sendJson(response, 200, { ok: true })
  }

  if (pathname === '/api/support/tickets' && request.method === 'GET') {
    const user = getSessionUser(request)
    if (!user) return sendJson(response, 401, { error: 'Sign in required.' })
    const visibleTickets = sortTicketsNewestFirst(supportTickets.filter((ticket) => canViewSupportTicket(user, ticket))).map((ticket) => supportTicketForUser(user, ticket))
    return sendJson(response, 200, { tickets: visibleTickets })
  }

  if (pathname === '/api/support/tickets' && request.method === 'POST') {
    const user = getSessionUser(request)
    if (!user) return sendJson(response, 401, { error: 'Sign in required.' })
    if (user.role !== 'patient') return sendJson(response, 403, { error: 'Only patients can create support requests.' })
    try {
      const body = await readJson(request)
      const subject = cleanText(body.subject, 100)
      const description = cleanText(body.description, 2000)
      const category = ['device', 'training', 'other'].includes(body.category) ? body.category : null
      if (subject.length < 3 || description.length < 5 || !category) {
        return sendJson(response, 400, { error: 'A subject, issue type, and description are required.' })
      }
      const timestamp = new Date().toISOString()
      const ticket = {
        id: randomUUID(),
        patientId: user.id,
        patientName: user.name,
        category,
        subject,
        description,
        status: 'open',
        sharedWithDeveloper: body.sharedWithDeveloper === true,
        forwardedToDeveloper: false,
        createdAt: timestamp,
        updatedAt: timestamp,
        messages: [],
      }
      supportTickets.unshift(ticket)
      persistSupportTickets()
      notifyUsers(doctorAccounts(), { type: 'support_new_ticket', ticketId: ticket.id, subject: ticket.subject, actorRole: user.role })
      return sendJson(response, 201, { ticket })
    } catch {
      return sendJson(response, 400, { error: 'Invalid support request.' })
    }
  }

  const supportMessageMatch = pathname.match(/^\/api\/support\/tickets\/([^/]+)\/messages$/)
  if (supportMessageMatch && request.method === 'POST') {
    const user = getSessionUser(request)
    if (!user) return sendJson(response, 401, { error: 'Sign in required.' })
    const ticket = supportTickets.find((item) => item.id === supportMessageMatch[1])
    if (!ticket) return sendJson(response, 404, { error: 'Support request not found.' })
    if (!canViewSupportTicket(user, ticket)) return sendJson(response, 403, { error: 'Your account cannot access this conversation.' })
    try {
      const body = await readJson(request)
      const messageText = cleanText(body.text, 2000)
      if (messageText.length < 1) return sendJson(response, 400, { error: 'A reply message is required.' })
      const message = {
        id: randomUUID(),
        authorId: user.id,
        authorName: user.name,
        authorRole: user.role,
        text: messageText,
        createdAt: new Date().toISOString(),
      }
      ticket.messages.push(message)
      ticket.updatedAt = message.createdAt
      persistSupportTickets()
      notifyUsers(notificationRecipientsForTicket(ticket, user.role).filter((recipient) => recipient.id !== user.id), {
        type: 'support_new_reply', ticketId: ticket.id, subject: ticket.subject, actorRole: user.role,
      })
      return sendJson(response, 201, { message, ticket: supportTicketForUser(user, ticket) })
    } catch {
      return sendJson(response, 400, { error: 'Invalid reply.' })
    }
  }

  const supportTicketMatch = pathname.match(/^\/api\/support\/tickets\/([^/]+)$/)
  if (supportTicketMatch && request.method === 'PATCH') {
    const user = getSessionUser(request)
    if (!user) return sendJson(response, 401, { error: 'Sign in required.' })
    const ticket = supportTickets.find((item) => item.id === supportTicketMatch[1])
    if (!ticket) return sendJson(response, 404, { error: 'Support request not found.' })
    if (!canViewSupportTicket(user, ticket)) return sendJson(response, 403, { error: 'Your account cannot access this request.' })
    try {
      const body = await readJson(request)
      const previousForwarded = ticket.forwardedToDeveloper
      const previousStatus = ticket.status
      if (user.role === 'doctor') {
        if (body.forwardedToDeveloper !== undefined) {
          if (typeof body.forwardedToDeveloper !== 'boolean') return sendJson(response, 400, { error: 'Invalid sharing setting.' })
          if (body.forwardedToDeveloper && !ticket.sharedWithDeveloper) {
            return sendJson(response, 403, { error: 'The patient has not consented to share this request with the developer.' })
          }
          ticket.forwardedToDeveloper = body.forwardedToDeveloper
        }
      } else if (user.role !== 'developer' || !ticket.forwardedToDeveloper || !ticket.sharedWithDeveloper) {
        return sendJson(response, 403, { error: 'Only the doctor can manage this request.' })
      }

      if (body.status !== undefined) {
        const permittedStatuses = user.role === 'developer' ? ['in_progress', 'resolved'] : ['open', 'in_progress', 'resolved']
        if (!permittedStatuses.includes(body.status)) return sendJson(response, 400, { error: 'Invalid request status.' })
        ticket.status = body.status
      }
      ticket.updatedAt = new Date().toISOString()
      persistSupportTickets()
      if (!previousForwarded && ticket.forwardedToDeveloper) {
        notifyUsers(developerAccounts(), { type: 'support_forwarded', ticketId: ticket.id, subject: ticket.subject, actorRole: user.role })
      }
      if (previousStatus !== ticket.status) {
        const patient = accountById(ticket.patientId)
        const recipients = [patient]
        if (user.role === 'developer') recipients.push(...doctorAccounts())
        if (ticket.forwardedToDeveloper && ticket.sharedWithDeveloper) recipients.push(...developerAccounts())
        notifyUsers(recipients.filter((recipient) => recipient && recipient.id !== user.id), {
          type: 'support_status', ticketId: ticket.id, subject: ticket.subject, actorRole: user.role,
        })
      }
      return sendJson(response, 200, { ticket: supportTicketForUser(user, ticket) })
    } catch {
      return sendJson(response, 400, { error: 'Invalid support update.' })
    }
  }

  return sendJson(response, 404, { error: 'Not found.' })
})

const BIND_HOST = process.env.AUTH_HOST || '0.0.0.0'
server.listen(PORT, BIND_HOST, () => {
  process.stdout.write(`NEUROGRIP account server listening on ${BIND_HOST}:${PORT}\n`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
