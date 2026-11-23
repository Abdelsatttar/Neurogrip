import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  Activity, AlertTriangle, ArrowLeft, Battery, CalendarDays, CheckCircle2, ClipboardList,
  Code2, Cpu, Download, FileText, Plus, Printer, Search, ShieldAlert,
  Users, Wifi, WifiOff, Wrench, Clock3, Save, UserRound, Zap,
} from 'lucide-react'

type Language = 'en' | 'ar'
type Role = 'doctor' | 'developer'
type Tab = 'overview' | 'patients' | 'reports' | 'diagnostics' | 'logs'
type Outcome = 'independent' | 'assisted' | 'notYet'
type TrainingAttempt = { id: string; task: string; outcome: Outcome; date: string }
type PatientCase = {
  id: string
  code: string
  deviceType: string
  side: 'left' | 'right'
  progress: number
  lastSession: string
  followUp: string
  notes: string
  attempts: TrainingAttempt[]
}
type DeviceTelemetry = {
  connected: boolean
  emgStatus: 'ready' | 'no-signal' | 'error'
  motorStatus: 'ready' | 'idle' | 'error'
  firmwareVersion: string
  updatedAt: string | null
  errorMessage: string
}
type DiagnosticLog = { id: string; timestamp: string; message: string; level: 'info' | 'warning' | 'error' }

const copy: Record<Language, Record<string, string>> = {
  en: {
    title: 'Specialist Portal', subtitle: 'A dedicated workspace for the clinical and technical team supporting NEUROGRIP users.',
    chooseRole: 'Choose your workspace', chooseRoleDesc: 'Open the view that matches your responsibility. These are separate prototype views, not authenticated accounts yet.',
    doctor: 'Doctor / Clinician', doctorDesc: 'Review patient progress, training history, follow-up dates, and clinical notes.',
    developer: 'Developer / Engineer', developerDesc: 'Review device connectivity, sensor status, battery telemetry, and diagnostic events.',
    openDoctor: 'Open doctor workspace', openDeveloper: 'Open developer workspace', demo: 'Prototype preview', demoWarning: 'Demo environment: sample cases are fictional and are stored only in this browser. Do not enter real patient identifiers or sensitive clinical information. Secure accounts and shared records require a backend.',
    doctorWorkspace: 'Clinical workspace', developerWorkspace: 'Technical workspace', switchRole: 'Switch workspace', signOut: 'Exit portal',
    overview: 'Overview', patients: 'Patients', reports: 'Reports', diagnostics: 'Diagnostics', logs: 'Device logs',
    deviceOverview: 'Device status summary', doctorIntro: 'Review care activity and keep follow-up information organised.', developerIntro: 'Inspect the device bridge and review the latest telemetry received by this browser.',
    activeCases: 'Cases in workspace', followUps: 'Upcoming follow-ups', recordedAttempts: 'Training records', avgProgress: 'Average progress',
    recentCases: 'Recent cases', viewAll: 'View all patients', openCase: 'Open case', searchCases: 'Search by patient code', addCase: 'Add patient case',
    patientCode: 'Patient code', deviceType: 'Prosthesis / device type', limbSide: 'Affected side', left: 'Left', right: 'Right', createCase: 'Create case', cancel: 'Cancel',
    noPatients: 'No cases found', noPatientsDesc: 'Try another code or add a new case to this local prototype.',
    caseDetails: 'Patient case', backToPatients: 'Back to patients', progress: 'Training progress', latestSession: 'Last recorded session', nextFollowUp: 'Next follow-up',
    clinicalNotes: 'Clinical notes', notesHint: 'Add a follow-up note for this demo case…', saveNotes: 'Save case updates', savedLocal: 'Saved in this browser',
    trainingHistory: 'Training history', task: 'Activity', outcome: 'Outcome', date: 'Date', independent: 'Independent', assisted: 'Needed help', notYet: 'Not yet',
    selectCase: 'Select a patient case', reportTitle: 'Progress report', printReport: 'Print / Save PDF', exportCsv: 'Export CSV',
    reportDisclaimer: 'This report summarises locally stored prototype data. It is not a medical record or a validated clinical assessment.',
    localOnly: 'Local preview only', diagnosticsIntro: 'Live values appear only after the device bridge sends a verified diagnostics event.',
    deviceConnection: 'ESP32 connection', battery: 'Hand battery', emgSensor: 'EMG sensor', motor: 'Motor status', firmware: 'Firmware version', lastTelemetry: 'Last telemetry',
    connected: 'Connected', disconnected: 'Disconnected', ready: 'Ready', noSignal: 'No signal', idle: 'Idle', error: 'Error', waiting: 'Waiting for device data',
    demoValue: 'Demo value', liveValue: 'Live device value', bridgeHint: 'Integration contract: dispatch a `neurogrip:diagnostics` event with connected, emgStatus, motorStatus, firmwareVersion, and errorMessage. Battery readings can use the existing `neurogrip:battery` event.',
    eventHistory: 'Event history', noEvents: 'No device events received in this browser yet.', noErrors: 'No error events received.',
    eventNote: 'This page does not send commands to the hand. It only displays telemetry received from an external device bridge.',
    recordAdded: 'Case added to this browser.', noDate: 'Not scheduled', sampleLabel: 'Sample data',
  },
  ar: {
    title: 'بوابة المختصين', subtitle: 'مساحة مخصصة للفريق الطبي والفريق التقني المسؤول عن دعم مستخدمي NEUROGRIP.',
    chooseRole: 'اختار مساحة العمل', chooseRoleDesc: 'افتح الواجهة المناسبة لمسؤوليتك. دي واجهات منفصلة في النموذج الحالي وليست حسابات موثّقة بعد.',
    doctor: 'الدكتور / الأخصائي', doctorDesc: 'راجع تقدم الحالة وسجل التدريب ومواعيد المتابعة والملاحظات الطبية.',
    developer: 'المطوّر / المهندس', developerDesc: 'راجع اتصال الجهاز وحالة الحساسات والبطارية وأحداث التشخيص.',
    openDoctor: 'فتح مساحة الدكتور', openDeveloper: 'فتح مساحة المطوّر', demo: 'معاينة تجريبية',
    demoWarning: 'بيئة تجريبية: الحالات المعروضة افتراضية وتُحفظ داخل هذا المتصفح فقط. لا تدخل بيانات تعريفية حقيقية أو معلومات طبية حساسة. إنشاء حسابات آمنة ومشاركة السجلات يتطلب Backend.',
    doctorWorkspace: 'مساحة المتابعة الطبية', developerWorkspace: 'مساحة المتابعة التقنية', switchRole: 'تغيير مساحة العمل', signOut: 'الخروج من البوابة',
    overview: 'نظرة عامة', patients: 'الحالات', reports: 'التقارير', diagnostics: 'تشخيص الجهاز', logs: 'سجل الجهاز',
    deviceOverview: 'ملخص حالة الجهاز', doctorIntro: 'راجع نشاط المتابعة ونظّم معلومات الزيارات القادمة.', developerIntro: 'افحص جسر الاتصال وراجع آخر بيانات الجهاز التي وصلت لهذا المتصفح.',
    activeCases: 'الحالات في النظام', followUps: 'المتابعات القادمة', recordedAttempts: 'سجلات التدريب', avgProgress: 'متوسط التقدم',
    recentCases: 'أحدث الحالات', viewAll: 'عرض كل الحالات', openCase: 'فتح الملف', searchCases: 'ابحث بكود الحالة', addCase: 'إضافة حالة',
    patientCode: 'كود الحالة', deviceType: 'نوع الطرف / الجهاز', limbSide: 'الجانب', left: 'الأيسر', right: 'الأيمن', createCase: 'إنشاء الحالة', cancel: 'إلغاء',
    noPatients: 'لم يتم العثور على حالات', noPatientsDesc: 'جرّب كودًا آخر أو أضف حالة جديدة إلى النموذج المحلي.',
    caseDetails: 'ملف الحالة', backToPatients: 'العودة للحالات', progress: 'تقدم التدريب', latestSession: 'آخر جلسة مسجلة', nextFollowUp: 'المتابعة القادمة',
    clinicalNotes: 'ملاحظات المتابعة', notesHint: 'اكتب ملاحظة متابعة لهذه الحالة التجريبية…', saveNotes: 'حفظ تحديثات الحالة', savedLocal: 'تم الحفظ على هذا المتصفح',
    trainingHistory: 'سجل التدريب', task: 'النشاط', outcome: 'النتيجة', date: 'التاريخ', independent: 'بدون مساعدة', assisted: 'احتاج مساعدة', notYet: 'لم يتم بعد',
    selectCase: 'اختار ملف حالة', reportTitle: 'تقرير التقدم', printReport: 'طباعة / حفظ PDF', exportCsv: 'تصدير CSV',
    reportDisclaimer: 'هذا التقرير يلخص بيانات النموذج المحفوظة محليًا. ليس ملفًا طبيًا ولا تقييمًا سريريًا معتمدًا.',
    localOnly: 'معاينة محلية فقط', diagnosticsIntro: 'لن تظهر بيانات فعلية إلا بعد أن يرسل جسر الجهاز حدث تشخيص موثوق.',
    deviceConnection: 'اتصال ESP32', battery: 'بطارية اليد', emgSensor: 'حساس EMG', motor: 'حالة الموتور', firmware: 'إصدار البرنامج', lastTelemetry: 'آخر قراءة',
    connected: 'متصل', disconnected: 'غير متصل', ready: 'جاهز', noSignal: 'لا توجد إشارة', idle: 'متوقف / انتظار', error: 'خطأ', waiting: 'في انتظار بيانات الجهاز',
    demoValue: 'قيمة تجريبية', liveValue: 'قراءة فعلية من الجهاز', bridgeHint: 'اتفاق الربط: أرسل حدث `neurogrip:diagnostics` مع connected وemgStatus وmotorStatus وfirmwareVersion وerrorMessage. ويمكن إرسال البطارية بحدث `neurogrip:battery` الموجود بالفعل.',
    eventHistory: 'سجل الأحداث', noEvents: 'لم يتم استقبال أي أحداث من الجهاز في هذا المتصفح حتى الآن.', noErrors: 'لم يتم استقبال أحداث أخطاء.',
    eventNote: 'الصفحة لا ترسل أوامر إلى اليد. هي تعرض فقط بيانات الحالة التي تصل من جسر جهاز خارجي.',
    recordAdded: 'تمت إضافة الحالة إلى هذا المتصفح.', noDate: 'غير محدد', sampleLabel: 'بيانات تجريبية',
  },
}

const demoCases: PatientCase[] = [
  {
    id: 'case-ng-024', code: 'NG-024', deviceType: 'Myoelectric forearm hand', side: 'left', progress: 72,
    lastSession: '2026-11-16', followUp: '2026-11-24', notes: 'Demo note: review comfortable grasp release and skin check at next visit.',
    attempts: [
      { id: 'a-024-1', task: 'Cup practice', outcome: 'independent', date: '2026-11-16' },
      { id: 'a-024-2', task: 'Spoon practice', outcome: 'assisted', date: '2026-11-14' },
      { id: 'a-024-3', task: 'Phone hold', outcome: 'independent', date: '2026-11-12' },
    ],
  },
  {
    id: 'case-ng-018', code: 'NG-018', deviceType: 'Myoelectric hand', side: 'right', progress: 54,
    lastSession: '2026-11-15', followUp: '2026-11-21', notes: 'Demo note: continue short, supervised grasp practice with lightweight objects.',
    attempts: [
      { id: 'a-018-1', task: 'Soft object pickup', outcome: 'assisted', date: '2026-11-15' },
      { id: 'a-018-2', task: 'Cup practice', outcome: 'notYet', date: '2026-11-13' },
    ],
  },
  {
    id: 'case-ng-031', code: 'NG-031', deviceType: 'Myoelectric forearm hand', side: 'left', progress: 88,
    lastSession: '2026-11-17', followUp: '2026-11-28', notes: 'Demo note: discuss progression to the next approved daily activity.',
    attempts: [
      { id: 'a-031-1', task: 'Phone hold', outcome: 'independent', date: '2026-11-17' },
      { id: 'a-031-2', task: 'Cup practice', outcome: 'independent', date: '2026-11-15' },
      { id: 'a-031-3', task: 'Spoon practice', outcome: 'independent', date: '2026-11-12' },
    ],
  },
]

function readCases(userId: string): PatientCase[] {
  try {
    const raw = localStorage.getItem(`neurogrip:${userId}:doctor-cases`)
    if (!raw) return demoCases
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed as PatientCase[] : demoCases
  } catch {
    return demoCases
  }
}

function formatDate(value: string, language: Language, fallback: string): string {
  if (!value) return fallback
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function exportCsv(patient: PatientCase) {
  const rows = [
    ['Patient code', 'Device type', 'Side', 'Progress', 'Activity', 'Outcome', 'Date'],
    ...patient.attempts.map((attempt) => [patient.code, patient.deviceType, patient.side, `${patient.progress}%`, attempt.task, attempt.outcome, attempt.date]),
  ]
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n')
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${patient.code.toLowerCase()}-progress-report.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export default function SpecialistPortal({ role, userId, language, batteryLevel, batterySource }: {
  role: Role
  userId: string
  language: Language
  batteryLevel: number
  batterySource: 'demo' | 'device'
}) {
  const t = (key: string) => copy[language][key] ?? copy.en[key] ?? key
  const [tab, setTab] = useState<Tab>('overview')
  const [cases, setCases] = useState<PatientCase[]>(() => role === 'doctor' ? readCases(userId) : [])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showAddCase, setShowAddCase] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [newDevice, setNewDevice] = useState('Myoelectric hand')
  const [newSide, setNewSide] = useState<'left' | 'right'>('right')
  const [notesDraft, setNotesDraft] = useState('')
  const [followUpDraft, setFollowUpDraft] = useState('')
  const [saved, setSaved] = useState(false)
  const [reportId, setReportId] = useState<string | null>(() => role === 'doctor' ? readCases(userId)[0]?.id ?? null : null)
  const [telemetry, setTelemetry] = useState<DeviceTelemetry>({
    connected: false, emgStatus: 'no-signal', motorStatus: 'idle', firmwareVersion: '—', updatedAt: null, errorMessage: '',
  })
  const [logs, setLogs] = useState<DiagnosticLog[]>([])

  const selectedCase = cases.find((item) => item.id === selectedId) ?? null
  const reportCase = cases.find((item) => item.id === reportId) ?? cases[0] ?? null
  const filteredCases = useMemo(() => cases.filter((item) => item.code.toLowerCase().includes(search.trim().toLowerCase())), [cases, search])
  const totalAttempts = cases.reduce((sum, item) => sum + item.attempts.length, 0)
  const averageProgress = cases.length ? Math.round(cases.reduce((sum, item) => sum + item.progress, 0) / cases.length) : 0
  const now = new Date()
  const upcomingCount = cases.filter((item) => item.followUp && new Date(`${item.followUp}T23:59:59`) >= now).length

  useEffect(() => {
    if (role === 'doctor') localStorage.setItem(`neurogrip:${userId}:doctor-cases`, JSON.stringify(cases))
  }, [cases, role, userId])
  useEffect(() => {
    setNotesDraft(selectedCase?.notes ?? '')
    setFollowUpDraft(selectedCase?.followUp ?? '')
    setSaved(false)
  }, [selectedCase?.id])

  useEffect(() => {
    if (role !== 'developer') return
    const receiveDiagnostics = (event: Event) => {
      const detail = (event as CustomEvent<Partial<DeviceTelemetry>>).detail
      if (!detail || typeof detail !== 'object') return
      const next: DeviceTelemetry = {
        connected: detail.connected === true,
        emgStatus: detail.emgStatus === 'ready' || detail.emgStatus === 'error' ? detail.emgStatus : 'no-signal',
        motorStatus: detail.motorStatus === 'ready' || detail.motorStatus === 'error' ? detail.motorStatus : 'idle',
        firmwareVersion: typeof detail.firmwareVersion === 'string' ? detail.firmwareVersion : '—',
        updatedAt: new Date().toISOString(),
        errorMessage: typeof detail.errorMessage === 'string' ? detail.errorMessage : '',
      }
      setTelemetry(next)
      const level: DiagnosticLog['level'] = next.errorMessage || next.emgStatus === 'error' || next.motorStatus === 'error' ? 'error' : next.connected ? 'info' : 'warning'
      const message = next.errorMessage || `ESP32 ${next.connected ? 'connected' : 'disconnected'} · EMG ${next.emgStatus} · Motor ${next.motorStatus}`
      setLogs((current) => [{ id: `${Date.now()}`, timestamp: new Date().toISOString(), message, level }, ...current].slice(0, 30))
    }
    window.addEventListener('neurogrip:diagnostics', receiveDiagnostics)
    return () => window.removeEventListener('neurogrip:diagnostics', receiveDiagnostics)
  }, [role])

  const saveCase = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const code = newCode.trim().toUpperCase()
    if (!code || cases.some((item) => item.code.toLowerCase() === code.toLowerCase())) return
    const newCase: PatientCase = {
      id: `case-${Date.now()}`, code, deviceType: newDevice.trim() || 'Myoelectric hand', side: newSide,
      progress: 0, lastSession: '', followUp: '', notes: '', attempts: [],
    }
    setCases((current) => [newCase, ...current])
    setSelectedId(newCase.id)
    setReportId(newCase.id)
    setNewCode('')
    setShowAddCase(false)
    setTab('patients')
  }
  const saveUpdates = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedCase) return
    setCases((current) => current.map((item) => item.id === selectedCase.id ? { ...item, notes: notesDraft, followUp: followUpDraft } : item))
    setSaved(true)
  }
  const selectCase = (id: string) => { setSelectedId(id); setTab('patients') }
  const statusLabel = (value: string) => value === 'ready' ? t('ready') : value === 'error' ? t('error') : value === 'no-signal' ? t('noSignal') : t('idle')
  const dateOf = (value: string) => formatDate(value, language, t('noDate'))

  const doctorTabs: Tab[] = ['overview', 'patients', 'reports']
  const developerTabs: Tab[] = ['overview', 'diagnostics', 'logs']
  const tabs = role === 'doctor' ? doctorTabs : developerTabs

  return (
    <section className="specialist-portal">
          <div className="specialist-workspace-heading">
            <div><span className="specialist-eyebrow">NEUROGRIP / {role === 'doctor' ? 'DOCTOR' : 'DEVELOPER'}</span><h1>{t(role === 'doctor' ? 'doctorWorkspace' : 'developerWorkspace')}</h1><p>{t(role === 'doctor' ? 'doctorIntro' : 'developerIntro')}</p></div>
            <div className="specialist-workspace-actions"><span className="specialist-demo-chip"><ShieldAlert size={14} />{t('demo')}</span></div>
          </div>
          <nav className="specialist-tabs" aria-label={t('title')}>
            {tabs.map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item === 'overview' ? <Activity size={16} /> : item === 'patients' ? <Users size={16} /> : item === 'reports' ? <FileText size={16} /> : item === 'diagnostics' ? <Cpu size={16} /> : <ClipboardList size={16} />}{t(item)}</button>)}
          </nav>

          {role === 'doctor' && tab === 'overview' && (
            <>
              <div className="specialist-stats-grid">
                <StatCard icon={<Users size={19} />} label={t('activeCases')} value={cases.length} />
                <StatCard icon={<CalendarDays size={19} />} label={t('followUps')} value={upcomingCount} />
                <StatCard icon={<ClipboardList size={19} />} label={t('recordedAttempts')} value={totalAttempts} />
                <StatCard icon={<Activity size={19} />} label={t('avgProgress')} value={`${averageProgress}%`} />
              </div>
              <section className="specialist-panel">
                <div className="specialist-panel-heading"><div><h2>{t('recentCases')}</h2><p>{t('sampleLabel')}</p></div><button className="specialist-text-button" onClick={() => setTab('patients')}>{t('viewAll')} <ArrowLeft size={14} /></button></div>
                <CaseList cases={cases.slice(0, 4)} onSelect={selectCase} t={t} dateOf={dateOf} />
              </section>
            </>
          )}

          {role === 'doctor' && tab === 'patients' && (
            <>
              {selectedCase ? (
                <section className="specialist-case-detail">
                  <div className="specialist-panel-heading case-detail-heading"><div><button className="specialist-back-button" onClick={() => setSelectedId(null)}><ArrowLeft size={14} />{t('backToPatients')}</button><h2>{t('caseDetails')} · {selectedCase.code}</h2></div><span className="specialist-sample-tag">{t('sampleLabel')}</span></div>
                  <div className="specialist-case-facts"><Fact label={t('deviceType')} value={selectedCase.deviceType} /><Fact label={t('limbSide')} value={t(selectedCase.side)} /><Fact label={t('latestSession')} value={dateOf(selectedCase.lastSession)} /><Fact label={t('nextFollowUp')} value={dateOf(selectedCase.followUp)} /></div>
                  <div className="specialist-progress-block"><div><span>{t('progress')}</span><strong>{selectedCase.progress}%</strong></div><div className="specialist-progress-track"><span style={{ width: `${selectedCase.progress}%` }} /></div></div>
                  <div className="specialist-two-column">
                    <div className="specialist-subpanel"><div className="specialist-panel-heading"><h3>{t('trainingHistory')}</h3><span>{selectedCase.attempts.length}</span></div><AttemptList attempts={selectedCase.attempts} t={t} dateOf={dateOf} /></div>
                    <form className="specialist-subpanel specialist-notes-form" onSubmit={saveUpdates}>
                      <h3>{t('clinicalNotes')}</h3><label>{t('nextFollowUp')}<input type="date" value={followUpDraft} onChange={(event) => setFollowUpDraft(event.target.value)} /></label><label>{t('clinicalNotes')}<textarea rows={5} value={notesDraft} onChange={(event) => setNotesDraft(event.target.value)} placeholder={t('notesHint')} /></label><div className="specialist-form-footer"><button className="specialist-primary-button" type="submit"><Save size={15} />{t('saveNotes')}</button>{saved && <span className="specialist-saved"><CheckCircle2 size={14} />{t('savedLocal')}</span>}</div>
                    </form>
                  </div>
                  <div className="specialist-disclaimer compact-disclaimer"><AlertTriangle size={17} /><p>{t('demoWarning')}</p></div>
                </section>
              ) : (
                <section className="specialist-panel">
                  <div className="specialist-panel-heading"><div><h2>{t('patients')}</h2><p>{cases.length} · {t('sampleLabel')}</p></div><button className="specialist-primary-button" onClick={() => setShowAddCase((value) => !value)}><Plus size={16} />{t('addCase')}</button></div>
                  <div className="specialist-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('searchCases')} /></div>
                  {showAddCase && <form className="specialist-add-form" onSubmit={saveCase}><div className="specialist-form-grid"><label>{t('patientCode')}<input required value={newCode} onChange={(event) => setNewCode(event.target.value)} placeholder="NG-042" /></label><label>{t('deviceType')}<input value={newDevice} onChange={(event) => setNewDevice(event.target.value)} /></label><label>{t('limbSide')}<select value={newSide} onChange={(event) => setNewSide(event.target.value as 'left' | 'right')}><option value="left">{t('left')}</option><option value="right">{t('right')}</option></select></label></div><div className="specialist-form-footer"><button className="specialist-primary-button" type="submit"><Plus size={15} />{t('createCase')}</button><button className="specialist-ghost-button" type="button" onClick={() => setShowAddCase(false)}>{t('cancel')}</button></div></form>}
                  {filteredCases.length ? <CaseList cases={filteredCases} onSelect={selectCase} t={t} dateOf={dateOf} /> : <div className="specialist-empty"><Users size={25} /><strong>{t('noPatients')}</strong><span>{t('noPatientsDesc')}</span></div>}
                </section>
              )}
            </>
          )}

          {role === 'doctor' && tab === 'reports' && (
            <section className="specialist-panel specialist-report-panel">
              <div className="specialist-panel-heading"><div><h2>{t('reportTitle')}</h2><p>{t('reportDisclaimer')}</p></div><span className="specialist-sample-tag">{t('sampleLabel')}</span></div>
              <label className="specialist-report-select">{t('selectCase')}<select value={reportCase?.id ?? ''} onChange={(event) => setReportId(event.target.value)}>{cases.map((item) => <option value={item.id} key={item.id}>{item.code}</option>)}</select></label>
              {reportCase ? <div className="specialist-print-area"><div className="specialist-report-head"><div><span>NEUROGRIP</span><h3>{t('reportTitle')}</h3></div><strong>{reportCase.code}</strong></div><div className="specialist-case-facts"><Fact label={t('deviceType')} value={reportCase.deviceType} /><Fact label={t('limbSide')} value={t(reportCase.side)} /><Fact label={t('progress')} value={`${reportCase.progress}%`} /><Fact label={t('nextFollowUp')} value={dateOf(reportCase.followUp)} /></div><h3 className="specialist-report-subtitle">{t('trainingHistory')}</h3><AttemptList attempts={reportCase.attempts} t={t} dateOf={dateOf} /><div className="specialist-report-notes"><strong>{t('clinicalNotes')}</strong><p>{reportCase.notes || '—'}</p></div></div> : <div className="specialist-empty"><Users size={24} /><span>{t('noPatients')}</span></div>}
              {reportCase && <div className="specialist-form-footer report-actions"><button className="specialist-primary-button" onClick={() => window.print()}><Printer size={15} />{t('printReport')}</button><button className="specialist-ghost-button" onClick={() => exportCsv(reportCase)}><Download size={15} />{t('exportCsv')}</button></div>}
            </section>
          )}

          {role === 'developer' && tab === 'overview' && (
            <>
              <div className="specialist-stats-grid developer-stats">
                <StatCard icon={telemetry.connected ? <Wifi size={19} /> : <WifiOff size={19} />} label={t('deviceConnection')} value={t(telemetry.connected ? 'connected' : 'disconnected')} tone={telemetry.connected ? 'good' : 'muted'} />
                <StatCard icon={<Battery size={19} />} label={t('battery')} value={`${batteryLevel}%`} caption={t(batterySource === 'device' ? 'liveValue' : 'demoValue')} />
                <StatCard icon={<Zap size={19} />} label={t('emgSensor')} value={statusLabel(telemetry.emgStatus)} tone={telemetry.emgStatus === 'ready' ? 'good' : telemetry.emgStatus === 'error' ? 'bad' : 'muted'} />
                <StatCard icon={<Wrench size={19} />} label={t('motor')} value={statusLabel(telemetry.motorStatus)} tone={telemetry.motorStatus === 'ready' ? 'good' : telemetry.motorStatus === 'error' ? 'bad' : 'muted'} />
              </div>
              <div className="specialist-panel"><div className="specialist-panel-heading"><div><h2>{t('deviceOverview')}</h2><p>{t('diagnosticsIntro')}</p></div><span className="specialist-sample-tag">{t('demo')}</span></div><DeviceStatus telemetry={telemetry} t={t} /><div className="specialist-disclaimer"><AlertTriangle size={18} /><p>{t('eventNote')}</p></div></div>
            </>
          )}

          {role === 'developer' && tab === 'diagnostics' && (
            <section className="specialist-panel">
              <div className="specialist-panel-heading"><div><h2>{t('diagnostics')}</h2><p>{t('diagnosticsIntro')}</p></div><span className={`specialist-connection-pill ${telemetry.connected ? 'online' : 'offline'}`}>{telemetry.connected ? <Wifi size={13} /> : <WifiOff size={13} />}{t(telemetry.connected ? 'connected' : 'disconnected')}</span></div>
              <DeviceStatus telemetry={telemetry} t={t} />
              <div className="specialist-bridge-hint"><Code2 size={18} /><div><strong>{t('eventHistory')}</strong><p>{t('bridgeHint')}</p><code>{"window.dispatchEvent(new CustomEvent('neurogrip:diagnostics', { detail: { connected: true, emgStatus: 'ready', motorStatus: 'idle', firmwareVersion: '1.0.0' } }))"}</code></div></div>
              <div className="specialist-disclaimer"><AlertTriangle size={18} /><p>{t('eventNote')}</p></div>
            </section>
          )}

          {role === 'developer' && tab === 'logs' && (
            <section className="specialist-panel"><div className="specialist-panel-heading"><div><h2>{t('eventHistory')}</h2><p>{t('noErrors')}</p></div><span className="specialist-sample-tag">{logs.length}</span></div>
              {logs.length ? <div className="specialist-log-list">{logs.map((log) => <div className="specialist-log-row" key={log.id}><span className={`specialist-log-indicator ${log.level}`} /><div><strong>{log.message}</strong><small>{new Date(log.timestamp).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-GB')}</small></div><span className={`specialist-log-level ${log.level}`}>{log.level}</span></div>)}</div> : <div className="specialist-empty"><Clock3 size={26} /><strong>{t('noEvents')}</strong><span>{t('waiting')}</span></div>}
            </section>
          )}

          <div className="specialist-footer-note"><ShieldAlert size={15} /><span>{t('demoWarning')}</span></div>
    </section>
  )
}

function StatCard({ icon, label, value, caption, tone = 'normal' }: { icon: ReactNode; label: string; value: string | number; caption?: string; tone?: 'normal' | 'good' | 'muted' | 'bad' }) {
  return <article className={`specialist-stat-card ${tone}`}><div className="specialist-stat-icon">{icon}</div><span>{label}</span><strong>{value}</strong>{caption && <small>{caption}</small>}</article>
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="specialist-fact"><span>{label}</span><strong>{value}</strong></div>
}

function CaseList({ cases, onSelect, t, dateOf }: { cases: PatientCase[]; onSelect: (id: string) => void; t: (key: string) => string; dateOf: (value: string) => string }) {
  return <div className="specialist-case-list">{cases.map((item) => <article className="specialist-case-row" key={item.id}><div className="specialist-case-avatar"><UserRound size={19} /></div><div className="specialist-case-copy"><strong>{item.code}</strong><span>{item.deviceType} · {t(item.side)} · {t('latestSession')}: {dateOf(item.lastSession)}</span><div className="specialist-mini-progress"><i><b style={{ width: `${item.progress}%` }} /></i><small>{item.progress}%</small></div></div><button className="specialist-open-case" onClick={() => onSelect(item.id)}>{t('openCase')} <ArrowLeft size={14} /></button></article>)}</div>
}

function AttemptList({ attempts, t, dateOf }: { attempts: TrainingAttempt[]; t: (key: string) => string; dateOf: (value: string) => string }) {
  return attempts.length ? <div className="specialist-attempt-list">{attempts.map((attempt) => <div className="specialist-attempt-row" key={attempt.id}><div><strong>{attempt.task}</strong><small>{dateOf(attempt.date)}</small></div><span className={`specialist-outcome ${attempt.outcome}`}>{t(attempt.outcome)}</span></div>)}</div> : <div className="specialist-empty compact-empty"><ClipboardList size={22} /><span>{t('noEvents')}</span></div>
}

function DeviceStatus({ telemetry, t }: { telemetry: DeviceTelemetry; t: (key: string) => string }) {
  const statusTone = (value: string) => value === 'ready' ? 'good' : value === 'error' ? 'bad' : 'muted'
  return <div className="specialist-device-grid">
    <div className="specialist-device-item"><span><Wifi size={16} />{t('deviceConnection')}</span><strong className={telemetry.connected ? 'good-text' : 'muted-text'}>{t(telemetry.connected ? 'connected' : 'disconnected')}</strong></div>
    <div className="specialist-device-item"><span><Zap size={16} />{t('emgSensor')}</span><strong className={`${statusTone(telemetry.emgStatus)}-text`}>{t(telemetry.emgStatus === 'ready' ? 'ready' : telemetry.emgStatus === 'error' ? 'error' : 'noSignal')}</strong></div>
    <div className="specialist-device-item"><span><Wrench size={16} />{t('motor')}</span><strong className={`${statusTone(telemetry.motorStatus)}-text`}>{t(telemetry.motorStatus === 'ready' ? 'ready' : telemetry.motorStatus === 'error' ? 'error' : 'idle')}</strong></div>
    <div className="specialist-device-item"><span><Cpu size={16} />{t('firmware')}</span><strong>{telemetry.firmwareVersion}</strong></div>
    <div className="specialist-device-item"><span><Clock3 size={16} />{t('lastTelemetry')}</span><strong>{telemetry.updatedAt ? new Date(telemetry.updatedAt).toLocaleString() : t('waiting')}</strong></div>
    {telemetry.errorMessage && <div className="specialist-device-error"><AlertTriangle size={16} />{telemetry.errorMessage}</div>}
  </div>
}
