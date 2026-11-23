import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  AlertCircle, Info, CheckCircle2, Clock3, Forward, LifeBuoy, MessageCircle,
  MessageSquare, Plus, RefreshCw, Send, ShieldCheck, UserRound, Wrench,
} from 'lucide-react'

type Role = 'patient' | 'doctor' | 'developer'
type Language = 'en' | 'ar'
type Status = 'open' | 'in_progress' | 'resolved'
type Category = 'device' | 'training' | 'other'
type SupportMessage = {
  id: string
  authorId: string
  authorName: string
  authorRole: Role
  text: string
  createdAt: string
}
type SupportTicket = {
  id: string
  patientId: string
  patientName: string
  category: Category
  subject: string
  description: string
  status: Status
  sharedWithDeveloper: boolean
  forwardedToDeveloper: boolean
  createdAt: string
  updatedAt: string
  messages: SupportMessage[]
}

const text = {
  en: {
    title: 'Support & Communication', subtitle: 'Keep the patient, doctor, and device developer in one conversation about each issue.',
    patient: 'Patient', myRequest: 'My request', doctor: 'Doctor', developer: 'Developer', requests: 'Requests', newTicket: 'Report a problem', noTickets: 'No support requests yet', noTicketsHint: 'Create a request when you need help with the hand, its use, or training.', noAssigned: 'No technical issues assigned', noAssignedHint: 'The doctor can forward a device issue here after the patient agrees to share it.', noRequests: 'No patient requests yet', noRequestsHint: 'Patient requests will appear here when they are submitted.',
    subject: 'Subject', category: 'Issue type', device: 'Device or connection', training: 'Using or training with the hand', other: 'Other question', description: 'Describe the problem', descriptionHint: 'What happened? When did it start? Include any message shown by the device.', consent: 'I agree that the doctor may share this request and its conversation with the device developer if needed.', create: 'Send request', cancel: 'Cancel', sending: 'Sending…', loading: 'Loading support requests…', refresh: 'Refresh', error: 'Could not load support requests. Check that the local server is running and try again.', createError: 'Could not create the request. Please try again.', replyError: 'Could not send your reply. Please try again.', reply: 'Write a reply', replyHint: 'Add a message to this conversation…', send: 'Send reply', details: 'Issue details', conversation: 'Conversation', noReplies: 'No replies yet. Add the first message below.', created: 'Created', updated: 'Last activity', status: 'Status', open: 'Pending', in_progress: 'In progress', resolved: 'Resolved', deviceOnly: 'Technical details shared with developer', private: 'Visible to patient and doctor only', forward: 'Forward to developer', forwarded: 'Forwarded to developer', withdraw: 'Return to doctor', consentNeeded: 'The patient has not agreed to share this request with the developer.', startWork: 'Start working', markResolved: 'Mark resolved', reopen: 'Reopen', assignedByDoctor: 'Assigned by doctor', patientPrivacy: 'Your request is visible to you and the doctor. The developer only receives it if you give permission and the doctor forwards it.', doctorPrivacy: 'Share only what is needed to troubleshoot the device. The developer will be able to read this request and its conversation. Do not add unnecessary medical or personal information.', developerPrivacy: 'You only see requests that the doctor forwards after the patient has agreed to share the technical details.', patientName: 'Patient', rolePatient: 'Patient', roleDoctor: 'Doctor', roleDeveloper: 'Developer', you: 'You', ticketCount: 'requests', emptySelection: 'Choose a request to view its details and conversation.', categoryLabel: 'Category', demoNote: 'Local demo: requests are stored by the app server on this computer. This is not a secure shared clinical messaging service for real patient data.', reportTitle: 'Support request', people: 'Participants', waiting: 'Waiting for a reply', developerForwarded: 'The developer can now see and respond to this request.', doctorOnly: 'This conversation is currently limited to the patient and doctor.', statusChanged: 'Request status updated.', forwardedChanged: 'Sharing updated.',
  },
  ar: {
    title: 'مركز الدعم والتواصل', subtitle: 'مساحة واحدة تجمع المريض والدكتور ومطوّر الجهاز لمتابعة كل مشكلة.',
    patient: 'المريض', myRequest: 'بلاغي', doctor: 'الدكتور', developer: 'المطوّر', requests: 'البلاغات', newTicket: 'إبلاغ عن مشكلة', noTickets: 'لا توجد بلاغات حتى الآن', noTicketsHint: 'أنشئ بلاغًا عندما تحتاج مساعدة بخصوص اليد أو استخدامها أو التدريب.', noAssigned: 'لا توجد أعطال محوّلة للمطوّر', noAssignedHint: 'يستطيع الدكتور تحويل المشكلة التقنية هنا بعد موافقة المريض على مشاركة تفاصيلها.', noRequests: 'لا توجد طلبات من المرضى حتى الآن', noRequestsHint: 'ستظهر طلبات المرضى هنا بعد إرسالها.',
    subject: 'عنوان المشكلة', category: 'نوع المشكلة', device: 'الجهاز أو الاتصال', training: 'استخدام اليد أو التدريب', other: 'استفسار آخر', description: 'اشرح المشكلة', descriptionHint: 'ماذا حدث؟ ومتى بدأت المشكلة؟ اكتب أي رسالة ظهرت من الجهاز.', consent: 'أوافق على أن يشارك الدكتور هذا البلاغ ومحتوى المحادثة مع مطوّر الجهاز عند الحاجة.', create: 'إرسال البلاغ', cancel: 'إلغاء', sending: 'جارٍ الإرسال…', loading: 'جارٍ تحميل بلاغات الدعم…', refresh: 'تحديث', error: 'تعذّر تحميل البلاغات. تأكد من تشغيل الخادم المحلي ثم حاول مرة أخرى.', createError: 'تعذّر إنشاء البلاغ. حاول مرة أخرى.', replyError: 'تعذّر إرسال الرد. حاول مرة أخرى.', reply: 'اكتب ردًا', replyHint: 'أضف رسالة إلى المحادثة…', send: 'إرسال الرد', details: 'تفاصيل المشكلة', conversation: 'المحادثة', noReplies: 'لا توجد ردود بعد. اكتب أول رسالة بالأسفل.', created: 'تاريخ البلاغ', updated: 'آخر نشاط', status: 'الحالة', open: 'قيد الانتظار', in_progress: 'جارٍ العمل عليها', resolved: 'تم الحل', deviceOnly: 'تمت مشاركة التفاصيل التقنية مع المطوّر', private: 'مرئي للمريض والدكتور فقط', forward: 'تحويل للمطوّر', forwarded: 'تم التحويل للمطوّر', withdraw: 'إعادة للدكتور', consentNeeded: 'المريض لم يوافق على مشاركة هذا البلاغ مع المطوّر.', startWork: 'بدء العمل', markResolved: 'تحديد كمحلول', reopen: 'إعادة فتح البلاغ', assignedByDoctor: 'تم التحويل بواسطة الدكتور', patientName: 'المريض', rolePatient: 'المريض', roleDoctor: 'الدكتور', roleDeveloper: 'المطوّر', you: 'أنت', ticketCount: 'بلاغات', emptySelection: 'اختار بلاغًا لعرض تفاصيله والمحادثة الخاصة به.', categoryLabel: 'التصنيف', demoNote: 'نسخة محلية تجريبية: تُحفظ البلاغات على خادم التطبيق في هذا الكمبيوتر. هذه ليست خدمة مراسلة سريرية مشتركة وآمنة لاستخدام بيانات مرضى حقيقية.', reportTitle: 'بلاغ دعم', people: 'المشاركون', waiting: 'في انتظار الرد', developerForwarded: 'أصبح بإمكان المطوّر رؤية هذا البلاغ والرد عليه.', doctorOnly: 'هذه المحادثة متاحة حاليًا للمريض والدكتور فقط.', patientPrivacy: 'البلاغ مرئي لك وللدكتور. لن يرى المطوّر البلاغ إلا إذا وافقت وقرر الدكتور تحويله.', doctorPrivacy: 'شارك فقط ما يلزم لإصلاح الجهاز؛ سيتمكن المطوّر من قراءة البلاغ والمحادثة. تجنّب إضافة معلومات طبية أو شخصية غير ضرورية.', developerPrivacy: 'تظهر لك فقط البلاغات التي حوّلها الدكتور بعد موافقة المريض على مشاركة تفاصيلها.', statusChanged: 'تم تحديث حالة البلاغ.', forwardedChanged: 'تم تحديث صلاحية المشاركة.',
  },
}

function formatDate(value: string, language: Language) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

type RoleCopy = Pick<typeof text.en, 'rolePatient' | 'roleDoctor' | 'roleDeveloper'>

function roleName(role: Role, copy: RoleCopy) {
  return role === 'patient' ? copy.rolePatient : role === 'doctor' ? copy.roleDoctor : copy.roleDeveloper
}

export default function SupportCenter({ role, userId, language, initialTicketId }: { role: Role; userId: string; language: Language; initialTicketId?: string | null }) {
  const copy = language === 'ar' ? text.ar : text.en
  const isArabic = language === 'ar'
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const lastAppliedInitialTicketId = useRef<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState<Category>('device')
  const [description, setDescription] = useState('')
  const [consent, setConsent] = useState(false)
  const [reply, setReply] = useState('')

  const loadTickets = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const response = await fetch('/api/support/tickets', { cache: 'no-store' })
      if (!response.ok) throw new Error('load')
      const data = await response.json() as { tickets: SupportTicket[] }
      setTickets(data.tickets)
      setSelectedId((current) => current && data.tickets.some((ticket) => ticket.id === current) ? current : data.tickets[0]?.id ?? null)
      setError('')
    } catch {
      setError(copy.error)
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [copy.error])

  useEffect(() => {
    void loadTickets()
    const timer = window.setInterval(() => { void loadTickets(true) }, 7000)
    return () => window.clearInterval(timer)
  }, [loadTickets])

  useEffect(() => {
    if (initialTicketId && initialTicketId !== lastAppliedInitialTicketId.current && tickets.some((ticket) => ticket.id === initialTicketId)) {
      lastAppliedInitialTicketId.current = initialTicketId
      setSelectedId(initialTicketId)
    }
  }, [initialTicketId, tickets])

  const selectedTicket = useMemo(() => tickets.find((ticket) => ticket.id === selectedId) ?? null, [tickets, selectedId])
  const counts = useMemo(() => ({
    open: tickets.filter((ticket) => ticket.status === 'open').length,
    inProgress: tickets.filter((ticket) => ticket.status === 'in_progress').length,
    resolved: tickets.filter((ticket) => ticket.status === 'resolved').length,
  }), [tickets])

  const createTicket = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/support/tickets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, category, description, sharedWithDeveloper: consent }),
      })
      const data = await response.json() as { ticket?: SupportTicket; error?: string }
      if (!response.ok || !data.ticket) throw new Error('create')
      setSubject(''); setDescription(''); setCategory('device'); setConsent(false); setShowForm(false)
      await loadTickets(true)
      setSelectedId(data.ticket.id)
    } catch {
      setError(copy.createError)
    } finally {
      setBusy(false)
    }
  }

  const sendReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedTicket || !reply.trim()) return
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/support/tickets/${selectedTicket.id}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: reply }),
      })
      if (!response.ok) throw new Error('reply')
      setReply('')
      await loadTickets(true)
    } catch {
      setError(copy.replyError)
    } finally {
      setBusy(false)
    }
  }

  const updateTicket = async (payload: { status?: Status; forwardedToDeveloper?: boolean }) => {
    if (!selectedTicket) return
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/support/tickets/${selectedTicket.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error('update')
      await loadTickets(true)
    } catch {
      setError(copy.error)
    } finally {
      setBusy(false)
    }
  }

  const categoryLabel = (value: Category) => value === 'device' ? copy.device : value === 'training' ? copy.training : copy.other
  const statusLabel = (value: Status) => copy[value]
  const openLabel = role === 'patient' ? copy.noTickets : role === 'doctor' ? copy.noRequests : copy.noAssigned

  return (
    <section className="support-center" dir={isArabic ? 'rtl' : 'ltr'}>
      <div className="support-heading">
        <div className="support-heading-icon"><LifeBuoy size={23} /></div>
        <div className="support-heading-copy">
          <span>NEUROGRIP / SUPPORT</span>
          <h1>{copy.title}</h1>
          <p>{copy.subtitle}</p>
        </div>
        <button className="support-refresh" type="button" onClick={() => void loadTickets()} disabled={loading}><RefreshCw size={16} />{copy.refresh}</button>
      </div>

      <div className="support-summary-grid">
        <div className="support-summary-card"><span>{copy.open}</span><strong>{counts.open}</strong></div>
        <div className="support-summary-card"><span>{copy.in_progress}</span><strong>{counts.inProgress}</strong></div>
        <div className="support-summary-card"><span>{copy.resolved}</span><strong>{counts.resolved}</strong></div>
      </div>

      <div className="support-layout">
        <aside className="support-list-panel">
          <div className="support-list-heading">
            <div><h2>{copy.requests}</h2><span>{tickets.length} {copy.ticketCount}</span></div>
            {role === 'patient' && <button className="support-new-button" type="button" onClick={() => setShowForm((value) => !value)}><Plus size={15} />{copy.newTicket}</button>}
          </div>

          {showForm && role === 'patient' && (
            <form className="support-create-form" onSubmit={createTicket}>
              <label>{copy.subject}<input required maxLength={100} value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
              <label>{copy.category}<select value={category} onChange={(event) => setCategory(event.target.value as Category)}><option value="device">{copy.device}</option><option value="training">{copy.training}</option><option value="other">{copy.other}</option></select></label>
              <label>{copy.description}<textarea required minLength={5} maxLength={2000} rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={copy.descriptionHint} /></label>
              <label className="support-consent-row"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>{copy.consent}</span></label>
              <div className="support-form-actions"><button className="support-primary-button" type="submit" disabled={busy}><Send size={15} />{busy ? copy.sending : copy.create}</button><button className="support-secondary-button" type="button" onClick={() => setShowForm(false)}>{copy.cancel}</button></div>
            </form>
          )}

          {loading ? <div className="support-empty"><RefreshCw size={23} className="support-spin" /><span>{copy.loading}</span></div> : tickets.length ? (
            <div className="support-ticket-list">
              {tickets.map((ticket) => (
                <button type="button" key={ticket.id} className={`support-ticket-item ${selectedId === ticket.id ? 'selected' : ''}`} onClick={() => setSelectedId(ticket.id)}>
                  <span className="support-ticket-item-top"><strong>{ticket.subject}</strong><span className={`support-status status-${ticket.status}`}>{statusLabel(ticket.status)}</span></span>
                  <span className="support-ticket-meta">{role === 'patient' ? copy.myRequest : ticket.patientName} · {categoryLabel(ticket.category)}</span>
                  <span className="support-ticket-foot"><small>{formatDate(ticket.updatedAt, language)}</small>{ticket.forwardedToDeveloper && <span className="support-forwarded-dot"><Forward size={12} /> {copy.forwarded}</span>}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="support-empty"><MessageSquare size={25} /><strong>{openLabel}</strong><span>{role === 'patient' ? copy.noTicketsHint : role === 'doctor' ? copy.noRequestsHint : copy.noAssignedHint}</span></div>
          )}
        </aside>

        <div className="support-detail-panel">
          {selectedTicket ? (
            <>
              <div className="support-detail-heading">
                <div><span className="support-eyebrow">{copy.reportTitle} · {selectedTicket.id.slice(0, 8).toUpperCase()}</span><h2>{selectedTicket.subject}</h2><p>{role === 'patient' ? copy.patient : selectedTicket.patientName} · {categoryLabel(selectedTicket.category)}</p></div>
                <span className={`support-status support-status-large status-${selectedTicket.status}`}>{statusLabel(selectedTicket.status)}</span>
              </div>
              <div className="support-issue-card">
                <div className="support-issue-title"><AlertCircle size={17} /><strong>{copy.details}</strong></div>
                <p>{selectedTicket.description}</p>
                <div className="support-issue-dates"><span>{copy.created}: {formatDate(selectedTicket.createdAt, language)}</span><span>{copy.updated}: {formatDate(selectedTicket.updatedAt, language)}</span></div>
              </div>

              {role === 'doctor' && (
                <div className="support-doctor-actions">
                  <div><strong>{copy.people}</strong><p>{selectedTicket.sharedWithDeveloper ? copy.deviceOnly : copy.private}</p></div>
                  <div className="support-action-buttons">
                    {selectedTicket.status === 'open' && <button type="button" className="support-secondary-button" disabled={busy} onClick={() => void updateTicket({ status: 'in_progress' })}><Clock3 size={14} />{copy.startWork}</button>}
                    {selectedTicket.status !== 'resolved' && <button type="button" className="support-primary-button" disabled={busy} onClick={() => void updateTicket({ status: 'resolved' })}><CheckCircle2 size={14} />{copy.markResolved}</button>}
                    {selectedTicket.status === 'resolved' && <button type="button" className="support-secondary-button" disabled={busy} onClick={() => void updateTicket({ status: 'open' })}>{copy.reopen}</button>}
                    {selectedTicket.sharedWithDeveloper && !selectedTicket.forwardedToDeveloper && <button type="button" className="support-forward-button" disabled={busy} onClick={() => void updateTicket({ forwardedToDeveloper: true, status: 'in_progress' })}><Forward size={14} />{copy.forward}</button>}
                    {selectedTicket.forwardedToDeveloper && <button type="button" className="support-secondary-button" disabled={busy} onClick={() => void updateTicket({ forwardedToDeveloper: false })}>{copy.withdraw}</button>}
                  </div>
                  {!selectedTicket.sharedWithDeveloper && <small className="support-consent-warning"><ShieldCheck size={14} />{copy.consentNeeded}</small>}
                </div>
              )}

              {role === 'developer' && (
                <div className="support-developer-note"><Wrench size={17} /><span>{copy.assignedByDoctor}. {copy.developerForwarded}</span>
                  <div className="support-action-buttons">{selectedTicket.status !== 'resolved' && <button type="button" className="support-primary-button" disabled={busy} onClick={() => void updateTicket({ status: 'resolved' })}><CheckCircle2 size={14} />{copy.markResolved}</button>}{selectedTicket.status === 'resolved' && <button type="button" className="support-secondary-button" disabled={busy} onClick={() => void updateTicket({ status: 'in_progress' })}>{copy.reopen}</button>}</div>
                </div>
              )}

              <div className="support-conversation-heading"><h3><MessageCircle size={17} />{copy.conversation}</h3><span><UserRound size={13} />{copy.patient} · {copy.doctor}{selectedTicket.forwardedToDeveloper ? ` · ${copy.developer}` : ''}</span></div>
              <div className="support-message-list">
                {selectedTicket.messages.length ? selectedTicket.messages.map((message) => (
                  <article key={message.id} className={`support-message ${message.authorId === userId ? 'own' : ''}`}>
                    <div className="support-message-author"><strong>{message.authorId === userId ? copy.you : message.authorName}</strong><span>{roleName(message.authorRole, copy)}</span><time>{formatDate(message.createdAt, language)}</time></div>
                    <p>{message.text}</p>
                  </article>
                )) : <div className="support-no-replies"><MessageSquare size={21} /><span>{copy.noReplies}</span></div>}
              </div>
              <form className="support-reply-form" onSubmit={sendReply}>
                <textarea rows={2} value={reply} onChange={(event) => setReply(event.target.value)} placeholder={copy.replyHint} maxLength={2000} required />
                <button className="support-primary-button" type="submit" disabled={busy || !reply.trim()}><Send size={15} />{copy.send}</button>
              </form>
              {selectedTicket.forwardedToDeveloper && role === 'patient' && <div className="support-privacy-note"><Wrench size={15} />{copy.developerForwarded}</div>}
              {!selectedTicket.forwardedToDeveloper && role === 'patient' && <div className="support-privacy-note"><ShieldCheck size={15} />{copy.doctorOnly}</div>}
            </>
          ) : (
            <div className="support-empty support-detail-empty"><MessageCircle size={32} /><strong>{tickets.length ? copy.emptySelection : openLabel}</strong><span>{tickets.length ? copy.emptySelection : role === 'patient' ? copy.noTicketsHint : role === 'doctor' ? copy.noRequestsHint : copy.noAssignedHint}</span></div>
          )}
        </div>
      </div>

      {error && <div className="support-error" role="alert"><AlertCircle size={16} />{error}</div>}
      <div className="support-privacy-footer"><ShieldCheck size={16} /><span>{role === 'patient' ? copy.patientPrivacy : role === 'doctor' ? copy.doctorPrivacy : copy.developerPrivacy}</span></div>
      <div className="support-demo-disclaimer"><InfoIcon />{copy.demoNote}</div>
    </section>
  )
}

function InfoIcon() {
  return <Info size={14} />
}
