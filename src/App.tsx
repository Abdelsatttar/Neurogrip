import { useEffect, useMemo, useState } from 'react'
import type { Dispatch, FormEvent, SetStateAction } from 'react'
import {
  Activity, ArrowRight, ArrowUpRight, Bell, Battery, BatteryCharging, BookOpen, Check, CheckCircle2,
  ChevronDown, ChevronRight, CircleHelp, Globe2, Hand, Home, Info,
  Languages, Menu, Moon, Play, Plus, Settings, ShieldCheck, Sparkles, Sun, UserRound,
  Wifi, WifiOff, GraduationCap, MonitorPlay, Video,
  Zap, BookMarked, Stethoscope, Code2, LockKeyhole, LogOut, MessageCircle,
  Eye, EyeOff, Mail, ArrowLeft,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import SpecialistPortal from './SpecialistPortal'
import SupportCenter from './SupportCenter'

type Language = 'en' | 'ar'
type Page = 'dashboard' | 'howToUse' | 'learning' | 'specialist' | 'support' | 'profile' | 'settings'
type UserRole = 'patient' | 'doctor' | 'developer'
type AuthSession = { userId: string; role: UserRole; name: string; email: string; phone?: string; preferredHand?: 'right' | 'left' }
type AppNotification = { id: string; type: string; ticketId: string | null; subject: string; actorRole: UserRole | ''; createdAt: string; readAt: string | null }
type Profile = { fullName: string; email: string; phone: string; preferredHand: string; language: Language }
type AuthProviders = { google: boolean; passwordReset: boolean }
type BatteryState = { level: number; charging: boolean; source: 'demo' | 'device' }

const dictionary: Record<Language, Record<string, string>> = {
  en: {
    dashboard: 'Dashboard', howToUse: 'How to Use', learning: 'EMG Learning', specialist: 'Specialist Portal', supportCenter: 'Support & Communication', profile: 'My Profile', settings: 'Settings',
    welcome: 'Welcome to NEUROGRIP', subtitle: 'Your smart prosthetic hand companion — here to help you learn, practice, and feel confident.',
    continueGuide: 'Continue your guide', device: 'Device connection', notConnected: 'Not connected',
    batteryTitle: 'Hand battery', batteryDemo: 'Demo reading', batteryLive: 'Live device reading', batteryGood: 'Battery level is healthy', batteryLow: 'Low battery — please recharge', charging: 'Charging', notCharging: 'Not charging', adjustBattery: 'Adjust demo battery level', batteryDemoNotice: 'Demo only: this is a simulated value, not a reading from the prosthetic hand. Live readings need an ESP32 battery sensor connection.', batteryLiveNotice: 'This level is being supplied by the connected device bridge.', batteryDetails: 'Battery details',
    connectHint: 'Connect your hand to unlock device features.', learnHow: 'Learn how', quickLearning: 'Quick learning',
    exploreEssentials: 'Explore the essentials to get started', introEmg: 'Introduction to EMG', introEmgDesc: 'Understand how muscle signals help control your hand.',
    meetHand: 'Meet your hand', meetHandDesc: 'Discover the main parts and what they do.', electrode: 'Electrode placement', electrodeDesc: 'Learn about the three-electrode setup.',
    startPracticing: 'Explore movements', viewAll: 'View all', helpful: 'A little guidance goes a long way',
    helpfulDesc: 'Start with the basics, then move at your own pace. You can revisit any lesson whenever you need it.',
    yourProgress: 'Your learning progress', completed: 'completed', modules: 'learning modules',
    howTitle: 'Learn to use your hand with confidence', howDesc: 'A guided introduction to your prosthetic hand, from understanding EMG to preparing for safe practice.',
    learningPath: 'Your learning path', startHere: 'Start here', markComplete: 'Mark as complete', completedLabel: 'Completed',
    module1: 'Meet your prosthetic hand', module1Desc: 'Get familiar with the hand, its purpose, and the parts you will interact with.',
    module2: 'Understand EMG', module2Desc: 'Learn how forearm muscle activity is captured as a surface EMG signal.',
    module3: 'The three-electrode setup', module3Desc: 'Understand the role of the electrodes and follow the sensor manufacturer’s placement guidance.',
    module4: 'Prepare your device', module4Desc: 'Review the checks to complete before putting on or powering the device.',
    module5: 'Learn the supported movements', module5Desc: 'Explore Open Hand and Fist, the two core classes in the current project direction.',
    module6: 'Safety and troubleshooting', module6Desc: 'Know when to pause, check the fit, and ask your project or clinical support contact for help.',
    readLesson: 'Open lesson', estimate: 'Short learning module', noMedicalAdvice: 'This guide is educational and does not replace instructions from your clinician or the device team.',
    learningTitle: 'Understand the signal behind every movement', learningDesc: 'A simple learning space for the EMG technology used by NEUROGRIP.',
    featuredVideo: 'EMG introduction video', videoIncluded: 'Video included',
    videoFixedHint: 'This video is built into the website and is available whenever you open this lesson.',
    videoMissing: 'The fixed video could not be loaded. Make sure the MP4 file is inside public/assets with the specified filename.',
    practiceTitle: 'Practice everyday activities', practiceDesc: 'Build familiarity with practical tasks, one small step at a time. Choose an activity that is approved for your prosthesis.',
    practiceGuideTitle: 'A simple way to practice', practiceGuideDesc: 'Choose one everyday activity, follow its steps with a light safe object, then record how the attempt went.',
    practiceStepOneTitle: 'Choose an activity', practiceStepOneDesc: 'Start with one task that matters to you and feels manageable.',
    practiceStepTwoTitle: 'Follow the steps', practiceStepTwoDesc: 'Use a stable surface and a light, non-breakable object.',
    practiceStepThreeTitle: 'Record your attempt', practiceStepThreeDesc: 'Choose whether you did it independently, with help, or want to try again later.',
    dailyLifeTitle: 'Small practice for everyday independence', dailyLifeDesc: 'These guided activities are starting points. Your prosthesis may support different tasks depending on its design, fit, and settings.',
    chooseActivity: 'Choose a daily activity', chooseActivityDesc: 'Select a task to see the setup, steps, and a simple way to track your attempt.',
    taskCup: 'Hold a cup', taskCupDesc: 'Practice a steady, comfortable grasp with a light cup.', taskCupGoal: 'Pick up a light empty cup from a stable surface, hold it briefly, then place it down.', taskCupEquipment: 'Use an empty plastic or other unbreakable cup. Keep it away from the edge of the table.', taskCupStep1: 'Place the empty cup on a steady, non-slip surface within easy reach.', taskCupStep2: 'Position the prosthetic hand around the cup using the grip taught by your device team.', taskCupStep3: 'Close the hand only as much as needed, lift the cup slightly, then set it down slowly.',
    taskSpoon: 'Hold a spoon', taskSpoonDesc: 'Get used to holding a light utensil handle.', taskSpoonGoal: 'Practice holding an empty spoon and keeping it steady above the table.', taskSpoonEquipment: 'Start with an empty, lightweight spoon. An approved built-up handle may make it easier.', taskSpoonStep1: 'Place the spoon on the table with its handle pointing toward you.', taskSpoonStep2: 'Use the grip or adaptive utensil setup recommended for your prosthesis.', taskSpoonStep3: 'Lift the spoon just above the table, pause, and return it gently.',
    taskPhone: 'Hold a phone', taskPhoneDesc: 'Practice a light grasp on a familiar everyday object.', taskPhoneGoal: 'Pick up a phone or phone-sized practice object and hold it securely over the table.', taskPhoneEquipment: 'Use a spare phone, a protective case, or a similarly sized lightweight object while learning.', taskPhoneStep1: 'Place the object flat on a clear table, away from the edge.', taskPhoneStep2: 'Approach it slowly and use the hand position recommended for your device.', taskPhoneStep3: 'Lift it only a short distance above the table, hold briefly, then put it down.',
    taskBlock: 'Pick up a soft object', taskBlockDesc: 'Practice grasping a larger, lightweight object.', taskBlockGoal: 'Pick up a soft ball or foam block, hold it briefly, and place it back.', taskBlockEquipment: 'Choose a soft foam block or light ball that cannot break or cause injury.', taskBlockStep1: 'Put the object on a stable table with enough clear space around it.', taskBlockStep2: 'Line up the prosthetic hand with the object and use your approved grasp pattern.', taskBlockStep3: 'Lift the object a little, pause, and place it back without throwing it.',
    activitySafetyTitle: 'Keep practice safe', activitySafetyDesc: 'Only try activities approved for your specific prosthesis and training plan. Begin seated at a clear table with light, unbreakable objects. Stop if you feel pain, skin irritation, or unexpected movement. Ask your prosthetist or occupational therapist before changing settings or trying a new task.',
    attemptTitle: 'How did this attempt go?', attemptDesc: 'Your answer is a personal practice note, not an automatic measurement from the hand.', outcomeIndependent: 'I did it myself', outcomeAssisted: 'I needed some help', outcomeNotYet: 'Not yet', saveAttempt: 'Save this attempt', attemptSaved: 'Attempt saved in this browser.', viewSessions: 'View my practice log',
    movementPracticeTitle: 'Explore hand movement previews', movementPracticeDesc: 'These are illustrative previews of the two movement classes represented in the current prototype.',
    chooseMovement: 'Movement previews', chooseMovementDesc: 'Explore the two movement classes currently represented in the project.',
    selectedMovement: 'Selected movement', movementPreviewTitle: 'Movement preview', whatToNotice: 'What to notice',
    openNotice: 'The fingers are extended and the palm is open.', fistNotice: 'The fingers curl inward to form a closed fist.',
    openHand: 'Open hand', fist: 'Fist', openDesc: 'A relaxed, open-hand position.', fistDesc: 'A controlled closing movement into a fist.',
    planned: 'Future development', pinch: 'Pinch', pointing: 'Pointing', plannedDesc: 'This movement is not confirmed in the current prototype.',
    practiceTip: 'Practice safely', practiceTipDesc: 'Follow the instructions provided with your device. Stop if you feel discomfort or notice unexpected movement.',
    monitorTitle: 'Your device, when connected', monitorDesc: 'This screen is ready for a future ESP32 connection. No device data is being received right now.',
    connectionStatus: 'Connection status', disconnected: 'Disconnected', signalPreview: 'Signal preview', sampleLabel: 'Illustrative signal',
    currentGesture: 'Current gesture', unavailable: 'Unavailable', hardwareNote: 'Live monitoring requires a verified device-to-application connection. The chart below is a visual demo only.',
    sessionsTitle: 'My practice log', sessionsDesc: 'Review the attempts you chose to record during everyday activity practice.',
    noSessions: 'Your practice log is empty', noSessionsDesc: 'When you save an activity attempt, it will appear here so you can look back at your practice.',
    practiceAttempts: 'Recorded attempts', independentAttempts: 'Done independently', activitiesTried: 'Activities tried', activityOptions: 'activities to explore', practiceLogNote: 'These entries are self-reported notes saved in this browser. They are not device telemetry or a clinical assessment.', deleteAttempt: 'Delete this attempt', noAttemptsRecorded: 'No attempts have been recorded yet.', resultIndependent: 'Done independently', resultAssisted: 'Completed with help', resultNotYet: 'Not yet',
    profileTitle: 'Your profile', profileDesc: 'Keep your account details and preferred hand up to date. Core profile details are saved to your NEUROGRIP account.',
    fullName: 'Full name', email: 'Email address', phone: 'Phone number', preferredHand: 'Preferred hand', rightHand: 'Right hand', leftHand: 'Left hand', saveChanges: 'Save changes', saved: 'Account details saved',
    profilePrivacy: 'Your name, phone number, and preferred hand are saved with your account. Do not add clinical records or sensitive medical details to this project prototype.',
    settingsTitle: 'Make NEUROGRIP feel right for you', settingsDesc: 'Adjust language and interface preferences for a more comfortable experience.',
    language: 'Language', english: 'English', arabic: 'العربية', appearance: 'Appearance', lightMode: 'Light mode', darkMode: 'Dark mode', switchToLight: 'Switch to light mode', switchToDark: 'Switch to dark mode', themeHelp: 'Choose the light or dark look for the whole website.', motion: 'Interface motion', motionDesc: 'Use subtle transitions and animated interactions.',
    enabled: 'Enabled', reduced: 'Reduced', accessibility: 'Accessibility', accessibilityDesc: 'The interface respects your device’s reduced-motion preference.',
    help: 'Need help?', helpDesc: 'For device fit, electrode placement, or clinical questions, follow the instructions from your care team and device provider.',
    demo: 'Demo', demoTag: 'Illustrative only', support: 'Support & Communication', back: 'Back to dashboard', next: 'Next lesson',
    supportedCurrent: 'CURRENT DATASET FOCUS', visualPreview: 'This is a visual learning preview. It does not send commands to the physical hand.',
    futureTitle: 'More movements over time', futureDesc: 'Shown as future possibilities, not active prototype features.',
    noSampleSessions: 'No sample sessions have been added.', placeholderName: 'Your name', placeholderEmail: 'Add an email address', defaultAppearance: 'Default appearance', everydayCompanion: 'YOUR EVERYDAY COMPANION', startWithBasics: 'START WITH THE BASICS', buildConfidence: 'BUILD CONFIDENCE', yourPersonalGuide: 'YOUR PERSONAL GUIDE', learnAtOwnPace: 'LEARN AT YOUR OWN PACE', movementOverview: 'MOVEMENT OVERVIEW', personalActivity: 'YOUR PERSONAL ACTIVITY', personalInformation: 'PERSONAL INFORMATION',
    brandLine: 'Your hand. Your control.', independence: 'Supporting greater independence', account: 'Account', preferences: 'Preferences',
    openMenu: 'Open navigation', closeMenu: 'Close navigation', notifications: 'Notifications', noNotifications: 'You’re all caught up.',
    markAllRead: 'Mark all as read', notificationWelcomeTitle: 'Welcome to NEUROGRIP', notificationWelcomeBody: 'Your account is ready.', notificationNewRequestTitle: 'New patient support request', notificationNewRequestBody: 'A patient has submitted a request for review.', notificationNewReplyTitle: 'New reply in a support request', notificationForwardedTitle: 'A support request was assigned to you', notificationForwardedBody: 'A doctor shared a technical request with you.', notificationStatusTitle: 'Support request status updated', notificationReplyFromPatient: 'A patient replied to the conversation.', notificationReplyFromDoctor: 'Your doctor replied to the conversation.', notificationReplyFromDeveloper: 'The developer replied to the conversation.', notificationStatusFromDoctor: 'The doctor updated the request.', notificationStatusFromDeveloper: 'The developer updated the request.', notificationOpen: 'Open conversation', requestSubject: 'Request',
    profileMenu: 'Profile options', languageMenu: 'Change language', mobileNav: 'Navigation', continue: 'Continue',
  },
  ar: {
    dashboard: 'لوحة التحكم', howToUse: 'طريقة الاستخدام', learning: 'تعلم EMG', specialist: 'بوابة المختصين', supportCenter: 'مركز الدعم والتواصل',
    profile: 'ملفي الشخصي', settings: 'الإعدادات',
    welcome: 'أهلاً بك في NEUROGRIP', subtitle: 'رفيقك الذكي لليد الصناعية — يساعدك على التعلم والتدريب واستخدامها بثقة.',
    continueGuide: 'استكمل دليل الاستخدام', device: 'اتصال الجهاز', notConnected: 'غير متصل',
    batteryTitle: 'بطارية اليد', batteryDemo: 'قراءة تجريبية', batteryLive: 'قراءة مباشرة من الجهاز', batteryGood: 'مستوى البطارية جيد', batteryLow: 'البطارية منخفضة — يُرجى إعادة الشحن', charging: 'جارٍ الشحن', notCharging: 'لا يتم الشحن', adjustBattery: 'تعديل نسبة البطارية التجريبية', batteryDemoNotice: 'للعرض التجريبي فقط: هذه نسبة محاكاة وليست قراءة من اليد الصناعية. القراءات الفعلية تحتاج إلى توصيل حساس البطارية بوحدة ESP32.', batteryLiveNotice: 'يتم استقبال هذه النسبة من وحدة الربط المتصلة بالجهاز.', batteryDetails: 'تفاصيل البطارية',
    connectHint: 'وصّل اليد للوصول إلى خصائص الجهاز.', learnHow: 'تعرف على الطريقة', quickLearning: 'تعلم سريع',
    exploreEssentials: 'ابدأ بالأساسيات خطوة بخطوة', introEmg: 'مقدمة عن EMG', introEmgDesc: 'افهم كيف تساعد إشارات العضلات في التحكم باليد.',
    meetHand: 'تعرّف على يدك', meetHandDesc: 'اكتشف الأجزاء الأساسية ووظيفة كل جزء.', electrode: 'أماكن الأقطاب', electrodeDesc: 'تعرّف على إعداد الأقطاب الثلاثة.',
    startPracticing: 'استكشف الحركات', viewAll: 'عرض الكل', helpful: 'خطوة صغيرة تصنع فرقاً',
    helpfulDesc: 'ابدأ بالأساسيات وتقدم بالسرعة المناسبة لك. يمكنك الرجوع لأي درس وقتما تحتاج.',
    yourProgress: 'تقدمك في التعلم', completed: 'مكتمل', modules: 'وحدات تعليمية',
    howTitle: 'تعلّم استخدام يدك بثقة', howDesc: 'دليل مبسط للتعرف على اليد الصناعية، بداية من فهم EMG وحتى الاستعداد للتدريب الآمن.',
    learningPath: 'مسار التعلم', startHere: 'ابدأ من هنا', markComplete: 'تحديد كمكتمل', completedLabel: 'مكتمل',
    module1: 'تعرّف على يدك الصناعية', module1Desc: 'تعرّف على اليد والغرض منها والأجزاء التي ستتعامل معها.',
    module2: 'افهم تقنية EMG', module2Desc: 'تعلم كيف يتحول نشاط عضلات الساعد إلى إشارة كهربائية سطحية.',
    module3: 'إعداد الأقطاب الثلاثة', module3Desc: 'افهم وظيفة الأقطاب واتبع تعليمات الشركة المصنعة لوضع الحساس.',
    module4: 'جهّز الجهاز', module4Desc: 'راجع الخطوات المطلوبة قبل ارتداء الجهاز أو تشغيله.',
    module5: 'تعرّف على الحركات المدعومة', module5Desc: 'استكشف فتح اليد والقبضة، وهما الفئتان الأساسيتان في اتجاه المشروع الحالي.',
    module6: 'السلامة وحل المشكلات', module6Desc: 'اعرف متى تتوقف وتراجع التثبيت وتطلب المساعدة من فريق الجهاز أو المختص.',
    readLesson: 'افتح الدرس', estimate: 'وحدة تعليمية قصيرة', noMedicalAdvice: 'هذا الدليل تعليمي ولا يحل محل تعليمات الطبيب أو فريق الجهاز.',
    learningTitle: 'افهم الإشارة وراء كل حركة', learningDesc: 'مساحة تعليمية مبسطة لتقنية EMG المستخدمة في NEUROGRIP.',
    featuredVideo: 'الفيديو التعريفي بتقنية EMG', videoIncluded: 'فيديو مدمج بالموقع',
    videoFixedHint: 'هذا الفيديو محفوظ داخل الموقع وسيكون متاحًا كلما فتحت هذا الدرس.',
    videoMissing: 'تعذّر تحميل الفيديو الثابت. تأكد من وجود ملف MP4 داخل public/assets بالاسم المحدد.',
    practiceTitle: 'تدرّب على أنشطة الحياة اليومية', practiceDesc: 'اتدرّب على مهام عملية صغيرة خطوة بخطوة. اختار نشاطًا مناسبًا ومعتمدًا لنوع الطرف الصناعي بتاعك.',
    practiceGuideTitle: 'طريقة بسيطة للتدريب', practiceGuideDesc: 'اختار نشاطًا من حياتك اليومية، واتبع خطواته باستخدام غرض خفيف وآمن، وبعدها سجّل نتيجة المحاولة.',
    practiceStepOneTitle: 'اختار نشاطًا', practiceStepOneDesc: 'ابدأ بمهمة مهمة بالنسبة لك وتكون مناسبة لقدرتك.',
    practiceStepTwoTitle: 'اتبع الخطوات', practiceStepTwoDesc: 'استخدم سطحًا ثابتًا وغرضًا خفيفًا غير قابل للكسر.',
    practiceStepThreeTitle: 'سجّل المحاولة', practiceStepThreeDesc: 'اختار هل نفّذت المهمة وحدك، أو بمساعدة، أو لسه محتاج تحاول تاني.',
    dailyLifeTitle: 'تدريب بسيط لاستقلالية أكبر في يومك', dailyLifeDesc: 'الأنشطة دي مجرد بداية للتدريب. المهام المناسبة بتختلف حسب تصميم الطرف الصناعي وملاءمته وإعداداته.',
    chooseActivity: 'اختار نشاط من حياتك اليومية', chooseActivityDesc: 'اختار مهمة عشان تشوف التجهيز والخطوات وتسجّل نتيجة المحاولة.',
    taskCup: 'مسك كوب', taskCupDesc: 'اتدرّب على مسكة ثابتة ومريحة لكوب خفيف.', taskCupGoal: 'ارفع كوبًا خفيفًا وفارغًا من سطح ثابت، وامسكه قليلًا، ثم أعده إلى مكانه.', taskCupEquipment: 'استخدم كوبًا بلاستيكيًا فارغًا أو كوبًا غير قابل للكسر، وخليه بعيدًا عن حافة الترابيزة.', taskCupStep1: 'ضع الكوب الفارغ على سطح ثابت لا ينزلق ويكون في متناولك.', taskCupStep2: 'قرّب اليد الصناعية حول الكوب باستخدام طريقة المسك التي علّمك إياها فريق الجهاز.', taskCupStep3: 'اقفل اليد بالقدر اللازم فقط، وارفع الكوب مسافة بسيطة، ثم ضعه ببطء.',
    taskSpoon: 'مسك معلقة', taskSpoonDesc: 'اتعوّد على مسك مقبض أداة خفيفة.', taskSpoonGoal: 'اتدرّب على مسك معلقة فارغة وتثبيتها فوق الترابيزة.', taskSpoonEquipment: 'ابدأ بمعلقة خفيفة وفارغة. قد يساعد المقبض السميك المخصص إذا كان مناسبًا لجهازك.', taskSpoonStep1: 'ضع المعلقة على الترابيزة واجعل المقبض في اتجاهك.', taskSpoonStep2: 'استخدم طريقة المسك أو الأداة المساعدة التي أوصى بها فريق الجهاز.', taskSpoonStep3: 'ارفع المعلقة قليلًا فوق الترابيزة، وانتظر لحظة، ثم أعدها بهدوء.',
    taskPhone: 'مسك الموبايل', taskPhoneDesc: 'اتدرّب على مسك غرض خفيف بتستخدمه كل يوم.', taskPhoneGoal: 'ارفع موبايلًا أو غرضًا بنفس حجمه وامسكه بأمان فوق الترابيزة.', taskPhoneEquipment: 'استخدم موبايلًا قديمًا أو جراب حماية أو غرضًا خفيفًا بنفس الحجم أثناء التدريب.', taskPhoneStep1: 'ضع الغرض على ترابيزة فاضية وبعيدة عن الحافة.', taskPhoneStep2: 'قرّب اليد ببطء واستخدم وضع المسك المناسب لجهازك.', taskPhoneStep3: 'ارفع الغرض مسافة صغيرة فوق الترابيزة، وامسكه لحظة، ثم ضعه مرة أخرى.',
    taskBlock: 'التقاط غرض لين', taskBlockDesc: 'اتدرّب على مسك غرض أكبر وخفيف.', taskBlockGoal: 'ارفع كرة لينة أو مكعب إسفنج، وامسكه لحظة، ثم أعده لمكانه.', taskBlockEquipment: 'اختار مكعب إسفنج أو كرة خفيفة وطرية لا تسبب إصابة ولا تتكسر.', taskBlockStep1: 'ضع الغرض على ترابيزة ثابتة مع ترك مساحة فاضية حوله.', taskBlockStep2: 'وجّه اليد الصناعية ناحية الغرض واستخدم طريقة المسك المعتمدة لجهازك.', taskBlockStep3: 'ارفع الغرض قليلًا، وانتظر لحظة، ثم ضعه بهدوء من غير ما ترميه.',
    activitySafetyTitle: 'خلّي التدريب آمن', activitySafetyDesc: 'جرّب فقط الأنشطة المسموح بها لنوع الطرف الصناعي وخطة تدريبك. ابدأ وأنت جالس أمام ترابيزة خالية وبأغراض خفيفة وغير قابلة للكسر. توقف لو حسيت بألم أو تهيّج في الجلد أو حركة غير متوقعة. اسأل أخصائي الأطراف الصناعية أو العلاج الوظيفي قبل تغيير الإعدادات أو تجربة نشاط جديد.',
    attemptTitle: 'المحاولة دي كانت عاملة إزاي؟', attemptDesc: 'إجابتك ملاحظة شخصية عن التدريب، مش قياس تلقائي من اليد.', outcomeIndependent: 'نفّذتها لوحدي', outcomeAssisted: 'احتجت مساعدة بسيطة', outcomeNotYet: 'لسه', saveAttempt: 'احفظ نتيجة المحاولة', attemptSaved: 'تم حفظ المحاولة على هذا المتصفح.', viewSessions: 'عرض سجل التدريب',
    movementPracticeTitle: 'استكشف معاينة حركات اليد', movementPracticeDesc: 'دي معاينات توضيحية للحركتين الموجودتين في النموذج الحالي.',
    chooseMovement: 'معاينة الحركات', chooseMovementDesc: 'استكشف الحركتين الموجودتين حاليًا في المشروع.',
    selectedMovement: 'الحركة المختارة', movementPreviewTitle: 'معاينة الحركة', whatToNotice: 'إيه اللي تلاحظه؟',
    openNotice: 'الأصابع مفرودة وراحة اليد مفتوحة.', fistNotice: 'الأصابع بتنثني للداخل لتكوين قبضة مغلقة.',
    openHand: 'فتح اليد', fist: 'قبضة اليد', openDesc: 'وضع اليد مفتوحة ومرتخية.', fistDesc: 'حركة إغلاق اليد لتكوين قبضة.',
    planned: 'ضمن التطوير المستقبلي', pinch: 'مسك دقيق', pointing: 'الإشارة بالسبابة', plannedDesc: 'هذه الحركة غير مؤكدة في النموذج الحالي.',
    practiceTip: 'تدرّب بأمان', practiceTipDesc: 'اتبع التعليمات المرفقة مع الجهاز. توقف عند الشعور بعدم الراحة أو ملاحظة حركة غير متوقعة.',
    monitorTitle: 'تابع جهازك عند الاتصال', monitorDesc: 'هذه الشاشة جاهزة لاتصال ESP32 مستقبلي. لا يتم استقبال بيانات من الجهاز حالياً.',
    connectionStatus: 'حالة الاتصال', disconnected: 'غير متصل', signalPreview: 'معاينة الإشارة', sampleLabel: 'إشارة توضيحية',
    currentGesture: 'الحركة الحالية', unavailable: 'غير متاح', hardwareNote: 'تتطلب المراقبة المباشرة اتصالاً فعلياً تم التحقق منه بين الجهاز والتطبيق. الرسم أدناه للعرض التوضيحي فقط.',
    sessionsTitle: 'سجل تدريبي', sessionsDesc: 'راجع المحاولات التي سجلتها أثناء التدريب على أنشطة الحياة اليومية.',
    noSessions: 'سجل التدريب فارغ', noSessionsDesc: 'لما تحفظ نتيجة نشاط، هتظهر هنا عشان تقدر تراجع محاولاتك السابقة.',
    practiceAttempts: 'عدد المحاولات المسجلة', independentAttempts: 'تمت بدون مساعدة', activitiesTried: 'الأنشطة التي جربتها', activityOptions: 'أنشطة متاحة', practiceLogNote: 'البيانات دي ملاحظات بتسجلها بنفسك وبتتحفظ على المتصفح ده فقط. مش بيانات مباشرة من الجهاز ولا تقييم طبي.', deleteAttempt: 'حذف المحاولة', noAttemptsRecorded: 'لم يتم تسجيل أي محاولات حتى الآن.', resultIndependent: 'تمت بدون مساعدة', resultAssisted: 'تمت بمساعدة', resultNotYet: 'لم تتم بعد',
    profileTitle: 'ملفك الشخصي', profileDesc: 'حدّث بيانات حسابك واليد المفضلة. يتم حفظ بيانات الملف الأساسية مع حسابك على NEUROGRIP.',
    fullName: 'الاسم بالكامل', email: 'البريد الإلكتروني', phone: 'رقم الهاتف', preferredHand: 'اليد المفضلة', rightHand: 'اليد اليمنى', leftHand: 'اليد اليسرى', saveChanges: 'حفظ التغييرات', saved: 'تم حفظ بيانات الحساب',
    profilePrivacy: 'يتم حفظ الاسم ورقم الهاتف واليد المفضلة مع حسابك. لا تضف سجلات سريرية أو معلومات طبية حساسة إلى هذا النموذج التجريبي.',
    settingsTitle: 'اضبط NEUROGRIP كما يناسبك', settingsDesc: 'غيّر اللغة وتفضيلات الواجهة لتجربة أكثر راحة.',
    language: 'اللغة', english: 'English', arabic: 'العربية', appearance: 'المظهر', lightMode: 'الوضع الفاتح', darkMode: 'الوضع الداكن', switchToLight: 'التبديل إلى الوضع الفاتح', switchToDark: 'التبديل إلى الوضع الداكن', themeHelp: 'اختر المظهر الفاتح أو الداكن لتطبيقه على الموقع بالكامل.', motion: 'حركة الواجهة', motionDesc: 'استخدام انتقالات بسيطة وتفاعلات متحركة.',
    enabled: 'مفعّل', reduced: 'مخفّض', accessibility: 'إمكانية الوصول', accessibilityDesc: 'تحترم الواجهة إعداد تقليل الحركة الموجود على جهازك.',
    help: 'هل تحتاج إلى مساعدة؟', helpDesc: 'لأسئلة ملاءمة الجهاز أو وضع الأقطاب أو الأمور الطبية، اتبع تعليمات المختص ومزود الجهاز.',
    demo: 'تجريبي', demoTag: 'توضيحي فقط', support: 'مركز الدعم والتواصل', back: 'العودة للوحة التحكم', next: 'الدرس التالي',
    supportedCurrent: 'محور بيانات المشروع الحالية', visualPreview: 'هذه معاينة تعليمية فقط ولا ترسل أوامر إلى اليد الصناعية الفعلية.',
    futureTitle: 'حركات إضافية مستقبلاً', futureDesc: 'هذه إمكانيات مستقبلية وليست خصائص مفعّلة في النموذج الحالي.',
    noSampleSessions: 'لم تتم إضافة جلسات تجريبية.', placeholderName: 'اسمك', placeholderEmail: 'أضف البريد الإلكتروني', defaultAppearance: 'المظهر الافتراضي', everydayCompanion: 'رفيقك اليومي', startWithBasics: 'ابدأ بالأساسيات', buildConfidence: 'ابنِ ثقتك', yourPersonalGuide: 'دليلك الشخصي', learnAtOwnPace: 'تعلّم بالسرعة المناسبة لك', movementOverview: 'نظرة على الحركة', personalActivity: 'نشاطك الشخصي', personalInformation: 'المعلومات الشخصية',
    brandLine: 'يدك. تحكمك.', independence: 'خطوة نحو استقلالية أكبر', account: 'الحساب', preferences: 'التفضيلات',
    openMenu: 'فتح القائمة', closeMenu: 'إغلاق القائمة', notifications: 'الإشعارات', noNotifications: 'لا توجد إشعارات جديدة.',
    markAllRead: 'تحديد الكل كمقروء', notificationWelcomeTitle: 'أهلًا بك في NEUROGRIP', notificationWelcomeBody: 'تم إنشاء حسابك بنجاح.', notificationNewRequestTitle: 'بلاغ دعم جديد من مريض', notificationNewRequestBody: 'أرسل أحد المرضى بلاغًا جديدًا للمراجعة.', notificationNewReplyTitle: 'رد جديد على بلاغ دعم', notificationForwardedTitle: 'تم تحويل بلاغ دعم إليك', notificationForwardedBody: 'شارك الدكتور معك بلاغًا يحتاج إلى مراجعة تقنية.', notificationStatusTitle: 'تم تحديث حالة بلاغ دعم', notificationReplyFromPatient: 'المريض أضاف ردًا إلى المحادثة.', notificationReplyFromDoctor: 'الدكتور رد على المحادثة.', notificationReplyFromDeveloper: 'المطوّر رد على المحادثة.', notificationStatusFromDoctor: 'قام الدكتور بتحديث حالة البلاغ.', notificationStatusFromDeveloper: 'قام المطوّر بتحديث حالة البلاغ.', notificationOpen: 'فتح المحادثة', requestSubject: 'البلاغ',
    profileMenu: 'خيارات الملف الشخصي', languageMenu: 'تغيير اللغة', mobileNav: 'التنقل', continue: 'متابعة',
  },
}

const navItems: { id: Page; icon: typeof Home; key: string }[] = [
  { id: 'dashboard', icon: Home, key: 'dashboard' },
  { id: 'howToUse', icon: BookOpen, key: 'howToUse' },
  { id: 'learning', icon: MonitorPlay, key: 'learning' },
  { id: 'support', icon: MessageCircle, key: 'supportCenter' },
  { id: 'profile', icon: UserRound, key: 'profile' },
  { id: 'settings', icon: Settings, key: 'settings' },
]

const specialistNavItems: { id: Page; icon: typeof Home; key: string }[] = [
  { id: 'specialist', icon: Stethoscope, key: 'specialist' },
  { id: 'support', icon: MessageCircle, key: 'supportCenter' },
  { id: 'settings', icon: Settings, key: 'settings' },
]

const lessons = [
  { id: 'hand', title: 'module1', desc: 'module1Desc', image: '/assets/prosthetic-hand.png', icon: Hand },
  { id: 'emg', title: 'module2', desc: 'module2Desc', image: '/assets/emg-electrodes.png', icon: Activity },
  { id: 'electrodes', title: 'module3', desc: 'module3Desc', image: '/assets/electrode-placement.png', icon: Zap },
  { id: 'prepare', title: 'module4', desc: 'module4Desc', image: '/assets/prosthetic-hero.png', icon: ShieldCheck },
  { id: 'movements', title: 'module5', desc: 'module5Desc', image: '/assets/hand-practice.png', icon: Hand },
  { id: 'safety', title: 'module6', desc: 'module6Desc', image: '', icon: CircleHelp },
]

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function App() {
  const [session, setSession] = useState<AuthSession | null>(() => {
    return null
  })
  const [loginLanguage, setLoginLanguage] = useState<Language>(() => readStorage<Language>('neurogrip-login-language', 'en'))
  const [loginTheme, setLoginTheme] = useState<'light' | 'dark'>(() => readStorage<'light' | 'dark'>('neurogrip-login-theme', 'light'))
  const [checkingSession, setCheckingSession] = useState(true)
  const [authServiceError, setAuthServiceError] = useState(false)
  const [authProviders, setAuthProviders] = useState<AuthProviders>({ google: false, passwordReset: false })

  useEffect(() => {
    let active = true
    fetch('/api/auth/providers', { cache: 'no-store' })
      .then(async (response) => response.ok ? await response.json() as AuthProviders : null)
      .then((providers) => { if (active && providers) setAuthProviders(providers) })
      .catch(() => { /* Provider availability is checked again when an action is submitted. */ })
    fetch('/api/auth/me')
      .then(async (response) => {
        if (!response.ok) return null
        const user = await response.json() as AuthSession
        const access = await fetch(`/api/${user.role}/workspace`)
        return access.ok ? user : null
      })
      .then((user) => { if (active) setSession(user) })
      .catch(() => { if (active) setAuthServiceError(true) })
      .finally(() => { if (active) setCheckingSession(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    document.documentElement.lang = loginLanguage
    document.documentElement.dir = loginLanguage === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.dataset.theme = loginTheme
    localStorage.setItem('neurogrip-login-language', JSON.stringify(loginLanguage))
    localStorage.setItem('neurogrip-login-theme', JSON.stringify(loginTheme))
  }, [loginLanguage, loginTheme])

  const login = async (role: UserRole, email: string, password: string): Promise<boolean | null> => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, email, password }),
      })
      if (!response.ok) {
        if (response.status >= 500) setAuthServiceError(true)
        return response.status >= 500 ? null : false
      }
      const data = await response.json() as { user: AuthSession }
      const access = await fetch(`/api/${data.user.role}/workspace`)
      if (!access.ok) {
        if (access.status >= 500) setAuthServiceError(true)
        return access.status >= 500 ? null : false
      }
      setSession(data.user)
      setAuthServiceError(false)
      return true
    } catch {
      setAuthServiceError(true)
      return null
    }
  }

  const register = async (details: { role: UserRole; name: string; email: string; password: string; inviteCode: string; phone: string; preferredHand: 'right' | 'left'; acceptTerms: boolean }): Promise<string | null> => {
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(details),
      })
      const data = await response.json() as { user?: AuthSession; code?: string }
      if (!response.ok || !data.user) {
        if (response.status >= 500) setAuthServiceError(true)
        return data.code || 'registration_failed'
      }
      const access = await fetch(`/api/${data.user.role}/workspace`)
      if (!access.ok) {
        if (access.status >= 500) setAuthServiceError(true)
        return access.status >= 500 ? 'service_unavailable' : 'registration_failed'
      }
      setSession(data.user)
      setAuthServiceError(false)
      return null
    } catch {
      setAuthServiceError(true)
      return null
    }
  }

  const requestPasswordReset = async (email: string): Promise<string | null> => {
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
      })
      const data = await response.json() as { code?: string }
      if (!response.ok) return data.code || 'reset_request_failed'
      return null
    } catch {
      setAuthServiceError(true)
      return 'service_error'
    }
  }

  const completePasswordReset = async (token: string, password: string): Promise<string | null> => {
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }),
      })
      const data = await response.json() as { user?: AuthSession; code?: string }
      if (!response.ok || !data.user) return data.code || 'reset_failed'
      setSession(data.user)
      setAuthServiceError(false)
      return null
    } catch {
      setAuthServiceError(true)
      return 'service_error'
    }
  }

  const beginGoogleSignIn = async (acceptTerms: boolean): Promise<string | null> => {
    try {
      const response = await fetch('/api/auth/google/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acceptTerms }),
      })
      const data = await response.json() as { url?: string; code?: string }
      if (!response.ok || !data.url) return data.code || 'google_signin_failed'
      window.location.assign(data.url)
      return null
    } catch {
      setAuthServiceError(true)
      return 'service_error'
    }
  }

  const logout = async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }) } catch { /* the local view still signs out */ }
    setSession(null)
  }

  if (checkingSession) return <div className="auth-loading">NEUROGRIP</div>

  return session ? (
    <WorkspaceApp key={session.userId} session={session} onLogout={logout} fallbackLanguage={loginLanguage} fallbackTheme={loginTheme} />
  ) : (
    <LoginScreen
      language={loginLanguage}
      theme={loginTheme}
      onLanguageChange={setLoginLanguage}
      onThemeChange={setLoginTheme}
      onLogin={login}
      onRegister={register}
      onForgotPassword={requestPasswordReset}
      onResetPassword={completePasswordReset}
      onGoogleSignIn={beginGoogleSignIn}
      providers={authProviders}
      serviceError={authServiceError}
    />
  )
}

function LoginScreen({
  language, theme, onLanguageChange, onThemeChange, onLogin, onRegister,
  onForgotPassword, onResetPassword, onGoogleSignIn, providers, serviceError,
}: {
  language: Language
  theme: 'light' | 'dark'
  onLanguageChange: (language: Language) => void
  onThemeChange: (theme: 'light' | 'dark') => void
  onLogin: (role: UserRole, email: string, password: string) => Promise<boolean | null>
  onRegister: (details: {
    role: UserRole; name: string; email: string; password: string; inviteCode: string;
    phone: string; preferredHand: 'right' | 'left'; acceptTerms: boolean
  }) => Promise<string | null>
  onForgotPassword: (email: string) => Promise<string | null>
  onResetPassword: (token: string, password: string) => Promise<string | null>
  onGoogleSignIn: (acceptTerms: boolean) => Promise<string | null>
  providers: AuthProviders
  serviceError: boolean
}) {
  const isArabic = language === 'ar'
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset'>('login')
  const [role, setRole] = useState<UserRole>('patient')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [preferredHand, setPreferredHand] = useState<'right' | 'left'>('right')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const labels = isArabic ? {
    eyebrow: 'مساحة حسابك الآمنة',
    title: 'مرحبًا بك في NEUROGRIP',
    subtitle: 'حساب واحد يوصّلك لتجربة اليد الصناعية، التعلّم، والمتابعة.',
    patient: 'المريض', patientDesc: 'التعلّم والتدريب ومتابعة اليد',
    doctor: 'الدكتور', doctorDesc: 'الحالات والتقارير والمتابعة',
    developer: 'المطوّر', developerDesc: 'تشخيص الجهاز والحساسات',
    name: 'الاسم بالكامل', email: 'البريد الإلكتروني', phone: 'رقم الهاتف (اختياري)',
    password: 'كلمة المرور', confirmPassword: 'تأكيد كلمة المرور',
    inviteCode: 'كود دعوة الفريق', preferredHand: 'اليد المفضّلة',
    rightHand: 'اليمنى', leftHand: 'اليسرى',
    login: 'تسجيل الدخول', register: 'إنشاء حساب', forgot: 'نسيت كلمة المرور؟',
    switchRegister: 'ليس لديك حساب؟ أنشئ حسابًا جديدًا',
    switchLogin: 'لديك حساب بالفعل؟ سجّل الدخول',
    sendReset: 'إرسال رابط الاستعادة', resetTitle: 'استعادة كلمة المرور',
    resetSubtitle: 'اكتب بريدك الإلكتروني وسنرسل لك رابطًا آمنًا لإعادة تعيين كلمة المرور.',
    newPassword: 'كلمة المرور الجديدة', savePassword: 'حفظ كلمة المرور الجديدة',
    back: 'العودة لتسجيل الدخول', google: 'المتابعة باستخدام Google',
    googleSetup: 'تسجيل Google لم يتم إعداده بعد.',
    googleTeamOnly: 'حسابات الدكتور والمطوّر تستخدم كود الدعوة وتسجيل الدخول بالبريد وكلمة المرور.',
    loading: 'جارٍ التنفيذ...', show: 'إظهار', hide: 'إخفاء',
    language: 'English', themeLight: 'الوضع الفاتح', themeDark: 'الوضع الداكن',
    strength: 'قوة كلمة المرور', weak: 'ضعيفة', medium: 'متوسطة', strong: 'قوية',
    terms: 'أوافق على شروط استخدام NEUROGRIP وإشعار الخصوصية، وأفهم أن المنصة نموذج تخرّج وليست نظامًا طبيًا معتمدًا.',
    inviteHint: 'كود الدعوة يمنح صلاحية إنشاء حساب فريق. لا تشاركه مع أي شخص غير مصرح له.',
    roleNote: 'اختار نوع حسابك للوصول إلى المساحة المناسبة.',
    brandPoints: ['حساب شخصي لكل مستخدم', 'جلسات دخول آمنة', 'مساحات منفصلة حسب الدور'],
    errors: {
      invalid_login: 'بيانات الدخول غير صحيحة لهذا النوع من الحسابات.',
      invalid_name: 'اكتب اسمًا صحيحًا من حرفين على الأقل.',
      invalid_email: 'اكتب بريدًا إلكترونيًا صحيحًا.',
      invalid_phone: 'رقم الهاتف غير صحيح. استخدم أرقامًا دولية أو محلية.',
      weak_password: 'كلمة المرور يجب ألا تقل عن 8 أحرف.',
      email_exists: 'هذا البريد مسجل بالفعل. جرّب تسجيل الدخول.',
      invalid_invite: 'كود الدعوة غير صحيح لهذا الدور.',
      invite_not_configured: 'تسجيل هذا النوع غير مفعّل بعد. تواصل مع مسؤول المشروع.',
      invalid_role: 'نوع الحساب غير صحيح.',
      invalid_registration: 'تعذّر إنشاء الحساب. راجع البيانات وحاول مرة أخرى.',
      registration_failed: 'تعذّر إكمال التسجيل. حاول مرة أخرى.',
      password_mismatch: 'كلمتا المرور غير متطابقتين.',
      terms_required: 'يجب الموافقة على الشروط وإشعار الخصوصية للمتابعة.',
      rate_limited: 'محاولات كثيرة. انتظر دقيقة ثم حاول مرة أخرى.',
      email_not_configured: 'خدمة إرسال البريد لم يتم إعدادها بعد. تواصل مع مسؤول المشروع.',
      email_delivery_failed: 'تعذّر إرسال البريد الآن. حاول مرة أخرى لاحقًا.',
      reset_request_failed: 'تعذّر طلب استعادة كلمة المرور.',
      reset_token_invalid: 'رابط الاستعادة غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا.',
      reset_failed: 'تعذّر تغيير كلمة المرور. اطلب رابط استعادة جديدًا.',
      google_not_configured: 'تسجيل الدخول باستخدام Google يحتاج إلى إعداد من مسؤول المشروع.',
      google_signin_failed: 'تعذّر بدء تسجيل Google.',
      google_cancelled: 'تم إلغاء تسجيل الدخول باستخدام Google.',
      google_state_invalid: 'تعذّر التحقق من جلسة Google. حاول مرة أخرى.',
      google_state_expired: 'انتهت صلاحية محاولة تسجيل Google. ابدأ من جديد.',
      google_exchange_failed: 'تعذّر إكمال الاتصال بحساب Google.',
      google_link_requires_password: 'هذا البريد مسجّل مسبقًا. سجّل الدخول بكلمة المرور أولًا.',
      google_account_conflict: 'حساب Google مرتبط بحساب آخر بالفعل.',
      google_account_unavailable: 'تعذّر فتح الحساب المرتبط بـGoogle.',
      google_failed: 'تعذّر إكمال تسجيل Google. حاول مرة أخرى.',
      service_error: 'خدمة الحسابات غير متاحة حاليًا. حاول مرة أخرى بعد قليل.',
    } as Record<string, string>,
    resetSent: 'لو البريد مسجل لدينا، سيصلك رابط استعادة صالح لمدة 30 دقيقة.',
    resetComplete: 'تم تغيير كلمة المرور. جارٍ تسجيل دخولك...',
    noEmailService: 'استعادة كلمة المرور غير متاحة حتى يتم إعداد خدمة البريد.',
  } : {
    eyebrow: 'YOUR SECURE ACCOUNT SPACE',
    title: 'Welcome to NEUROGRIP',
    subtitle: 'One account for your prosthetic-hand learning, support, and progress.',
    patient: 'Patient', patientDesc: 'Learning, practice, and hand status',
    doctor: 'Doctor', doctorDesc: 'Cases, reports, and follow-up',
    developer: 'Developer', developerDesc: 'Device and sensor diagnostics',
    name: 'Full name', email: 'Email address', phone: 'Phone number (optional)',
    password: 'Password', confirmPassword: 'Confirm password',
    inviteCode: 'Team invitation code', preferredHand: 'Preferred hand',
    rightHand: 'Right', leftHand: 'Left',
    login: 'Sign in', register: 'Create account', forgot: 'Forgot password?',
    switchRegister: 'New to NEUROGRIP? Create an account',
    switchLogin: 'Already have an account? Sign in',
    sendReset: 'Send recovery link', resetTitle: 'Reset your password',
    resetSubtitle: 'Enter your email and we will send a secure, one-time password reset link.',
    newPassword: 'New password', savePassword: 'Save new password',
    back: 'Back to sign in', google: 'Continue with Google',
    googleSetup: 'Google sign-in has not been configured yet.',
    googleTeamOnly: 'Doctor and Developer accounts use an invitation code and email/password sign-in.',
    loading: 'Please wait...', show: 'Show', hide: 'Hide',
    language: 'العربية', themeLight: 'Light', themeDark: 'Dark',
    strength: 'Password strength', weak: 'Weak', medium: 'Medium', strong: 'Strong',
    terms: 'I agree to the NEUROGRIP Terms of Use and Privacy Notice, and understand this is a graduation-project prototype, not a certified medical system.',
    inviteHint: 'The invitation code grants team-account access. Only use a code supplied by the project administrator.',
    roleNote: 'Choose your account type to open the correct workspace.',
    brandPoints: ['A personal account for every user', 'Secure, persistent sign-in sessions', 'Separate workspaces by role'],
    errors: {
      invalid_login: 'The sign-in details do not match this account type.',
      invalid_name: 'Enter a valid name with at least two characters.',
      invalid_email: 'Enter a valid email address.',
      invalid_phone: 'Enter a valid phone number.',
      weak_password: 'Password must be at least 8 characters.',
      email_exists: 'This email is already registered. Try signing in.',
      invalid_invite: 'The invitation code is not valid for this role.',
      invite_not_configured: 'Registration for this role is not configured yet. Contact the project administrator.',
      invalid_role: 'The selected account type is invalid.',
      invalid_registration: 'Could not create the account. Check the details and try again.',
      registration_failed: 'Registration could not be completed. Please try again.',
      password_mismatch: 'The passwords do not match.',
      terms_required: 'Accept the terms and privacy notice to continue.',
      rate_limited: 'Too many attempts. Wait one minute and try again.',
      email_not_configured: 'Password recovery email has not been configured yet. Contact the project administrator.',
      email_delivery_failed: 'We could not send the email right now. Please try again later.',
      reset_request_failed: 'Could not request a password reset.',
      reset_token_invalid: 'This reset link is invalid or expired. Request a new link.',
      reset_failed: 'Could not change the password. Request a new reset link.',
      google_not_configured: 'Google sign-in needs to be configured by the project administrator.',
      google_signin_failed: 'Could not start Google sign-in.',
      google_cancelled: 'Google sign-in was cancelled.',
      google_state_invalid: 'We could not validate the Google sign-in session. Please try again.',
      google_state_expired: 'The Google sign-in request expired. Please start again.',
      google_exchange_failed: 'We could not complete the connection with Google.',
      google_link_requires_password: 'This email already has an account. Sign in with your password first.',
      google_account_conflict: 'This Google account is already linked to a different account.',
      google_account_unavailable: 'We could not open the Google-linked account.',
      google_failed: 'Google sign-in could not be completed. Please try again.',
      service_error: 'The account service is temporarily unavailable. Please try again shortly.',
    } as Record<string, string>,
    resetSent: 'If an account exists for that email, a reset link will arrive shortly. The link is valid for 30 minutes.',
    resetComplete: 'Your password has been updated. Signing you in...',
    noEmailService: 'Password recovery is unavailable until email delivery is configured.',
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const authError = params.get('authError')
    if (authError) setError(authError)
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const token = hashParams.get('reset')
    if (token) {
      setResetToken(token)
      setMode('reset')
      setNotice('')
    }
    if (authError || token || params.has('auth')) {
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [])

  const passwordRules = [
    password.length >= 8,
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^a-zA-Z0-9]/.test(password),
  ]
  const strength = passwordRules.filter(Boolean).length
  const strengthText = strength <= 2 ? labels.weak : strength <= 4 ? labels.medium : labels.strong
  const clearFeedback = () => {
    setError('')
    setNotice('')
  }
  const chooseRole = (nextRole: UserRole) => {
    setRole(nextRole)
    setEmail('')
    setPassword('')
    setConfirmPassword('')
    setInviteCode('')
    clearFeedback()
  }
  const changeMode = (nextMode: 'login' | 'register' | 'forgot' | 'reset') => {
    setMode(nextMode)
    setPassword('')
    setConfirmPassword('')
    setInviteCode('')
    clearFeedback()
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    clearFeedback()
    try {
      if (mode === 'login') {
        const result = await onLogin(role, email, password)
        if (result === false) setError('invalid_login')
        else if (result === null) setError('service_error')
      } else if (mode === 'register') {
        if (password !== confirmPassword) {
          setError('password_mismatch')
          return
        }
        if (!termsAccepted) {
          setError('terms_required')
          return
        }
        const result = await onRegister({
          role, name, email, password, inviteCode, phone, preferredHand, acceptTerms: termsAccepted,
        })
        if (result) setError(result)
      } else if (mode === 'forgot') {
        const result = await onForgotPassword(email)
        if (result) setError(result)
        else setNotice(labels.resetSent)
      } else if (mode === 'reset') {
        if (password !== confirmPassword) {
          setError('password_mismatch')
          return
        }
        const result = await onResetPassword(resetToken, password)
        if (result) setError(result)
        else setNotice(labels.resetComplete)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleGoogleSignIn = async () => {
    clearFeedback()
    if (!termsAccepted) {
      setError('terms_required')
      return
    }
    if (!providers.google) {
      setError('google_not_configured')
      return
    }
    setSubmitting(true)
    const result = await onGoogleSignIn(termsAccepted)
    if (result) setError(result)
    setSubmitting(false)
  }

  const showRoles = mode === 'login' || mode === 'register'
  const showGoogle = showRoles && role === 'patient'
  const currentTitle = mode === 'login'
    ? (isArabic ? 'سجّل الدخول إلى حسابك' : 'Sign in to your account')
    : mode === 'register'
      ? (isArabic ? 'ابدأ حسابك الجديد' : 'Create your NEUROGRIP account')
      : mode === 'forgot' ? labels.resetTitle : (isArabic ? 'اختار كلمة مرور جديدة' : 'Choose a new password')
  const currentSubtitle = mode === 'login'
    ? labels.roleNote
    : mode === 'register'
      ? (isArabic ? 'أدخل بياناتك الأساسية لتجهيز مساحتك الشخصية.' : 'Add a few details to personalize your account.')
      : mode === 'forgot' ? labels.resetSubtitle : (isArabic ? 'استخدم كلمة مرور قوية لم تستخدمها من قبل.' : 'Choose a strong password you have not used before.')

  return (
    <div className={`auth-screen auth-screen--${mode} ${theme === 'dark' ? 'theme-dark' : 'theme-light'}`} dir={isArabic ? 'rtl' : 'ltr'}>
      <div className="auth-toolbar">
        <button type="button" onClick={() => onLanguageChange(isArabic ? 'en' : 'ar')}><Globe2 size={16} />{labels.language === 'English' ? 'English' : 'العربية'}</button>
        <button type="button" onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}{theme === 'dark' ? labels.themeLight : labels.themeDark}</button>
      </div>
      <div className={`auth-layout auth-layout--${mode}`}>
        <section className="auth-brand-panel">
          <div className="auth-brand-mark"><Hand size={34} /><span /></div>
          <div className="auth-brand-name">NEURO<span>GRIP</span></div>
          <span className="auth-eyebrow">{labels.eyebrow}</span>
          <h1>{labels.title}</h1>
          <p>{labels.subtitle}</p>
          <div className="auth-brand-points">
            {labels.brandPoints.map((point) => <div className="auth-brand-point" key={point}><CheckCircle2 size={16} /><span>{point}</span></div>)}
          </div>
          <div className="auth-brand-art"><img src="/assets/prosthetic-hero.png" alt="" /></div>
          <div className="auth-brand-footer"><ShieldCheck size={15} /><span>NEUROGRIP · EMG SMART PROSTHETIC</span></div>
        </section>

        <section className={`auth-card auth-card-${mode} ${mode === 'register' ? 'auth-card-register' : ''}`}>
          <div className="auth-card-heading">
            <span className="auth-lock-icon">{mode === 'forgot' || mode === 'reset' ? <Mail size={19} /> : <LockKeyhole size={19} />}</span>
            <div><span className="auth-card-kicker">NEUROGRIP / ACCOUNT</span><h2>{currentTitle}</h2><p>{currentSubtitle}</p></div>
          </div>

          {showRoles && (
            <div className="auth-role-grid" role="group" aria-label={isArabic ? 'نوع الحساب' : 'Account type'}>
              <button type="button" className={`auth-role-card ${role === 'patient' ? 'selected' : ''}`} onClick={() => chooseRole('patient')} aria-pressed={role === 'patient'}><UserRound size={21} /><strong>{labels.patient}</strong><small>{labels.patientDesc}</small></button>
              <button type="button" className={`auth-role-card ${role === 'doctor' ? 'selected' : ''}`} onClick={() => chooseRole('doctor')} aria-pressed={role === 'doctor'}><Stethoscope size={21} /><strong>{labels.doctor}</strong><small>{labels.doctorDesc}</small></button>
              <button type="button" className={`auth-role-card ${role === 'developer' ? 'selected' : ''}`} onClick={() => chooseRole('developer')} aria-pressed={role === 'developer'}><Code2 size={21} /><strong>{labels.developer}</strong><small>{labels.developerDesc}</small></button>
            </div>
          )}

          {showGoogle && mode === 'login' && (
            <div className="auth-social-primary">
              <label className="auth-terms-row auth-login-terms">
                <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} />
                <span>{labels.terms}</span>
              </label>
              <button type="button" className="auth-google-button auth-google-button-primary" onClick={handleGoogleSignIn} disabled={submitting || !providers.google} title={!providers.google ? labels.googleSetup : ''}>
                <svg className="auth-google-logo" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11c-.5 2.5-1.9 4.6-4.1 6v5h6.6c3.9-3.6 6.1-8.8 6.1-14.7z"/>
                  <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5c-1.8 1.2-4 1.9-6.9 1.9-5.3 0-9.8-3.6-11.4-8.4H5.8v5.2C9.2 39.5 16 44 24 44z"/>
                  <path fill="#FBBC05" d="M12.6 27.6a12 12 0 0 1 0-7.2v-5.2H5.8a20 20 0 0 0 0 17.6l6.8-5.2z"/>
                  <path fill="#EA4335" d="M24 12c3 0 5.7 1 7.8 3.1l5.8-5.8C34.1 5.9 29.5 4 24 4 16 4 9.2 8.5 5.8 15.2l6.8 5.2C14.2 15.6 18.7 12 24 12z"/>
                </svg>
                <span className="auth-google-button-copy"><strong>{labels.google}</strong></span>
              </button>
              <div className="auth-divider auth-email-divider"><span>{isArabic ? 'أو سجّل بالبريد الإلكتروني' : 'OR SIGN IN WITH EMAIL'}</span></div>
            </div>
          )}

          <form className="auth-form" onSubmit={submit}>
            {mode === 'register' && (
              <div className="auth-field-grid">
                <label>{labels.name}<input type="text" autoComplete="name" minLength={2} maxLength={80} required value={name} onChange={(event) => setName(event.target.value)} placeholder={isArabic ? 'مثال: أحمد محمد' : 'e.g. Ahmed Mohamed'} /></label>
                <label>{labels.phone}<input type="tel" autoComplete="tel" maxLength={30} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+20 1xx xxx xxxx" /></label>
              </div>
            )}
            {(mode === 'login' || mode === 'register' || mode === 'forgot') && (
              <label>{labels.email}<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" /></label>
            )}
            {mode === 'register' && (
              <label>{labels.preferredHand}
                <select value={preferredHand} onChange={(event) => setPreferredHand(event.target.value as 'right' | 'left')}>
                  <option value="right">{labels.rightHand}</option><option value="left">{labels.leftHand}</option>
                </select>
              </label>
            )}
            {(mode === 'login' || mode === 'register' || mode === 'reset') && (
              <>
                <label>{mode === 'reset' ? labels.newPassword : labels.password}
                  <div className="auth-password-field">
                    <input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'login' ? undefined : 8} required value={password} onChange={(event) => setPassword(event.target.value)} />
                    <button type="button" aria-label={showPassword ? labels.hide : labels.show} onClick={() => setShowPassword((current) => !current)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                  </div>
                  {mode !== 'login' && password.length > 0 && (
                    <div className="auth-password-strength" aria-live="polite">
                      <div className="auth-strength-bars">{[1, 2, 3, 4, 5].map((step) => <span key={step} className={strength >= step ? `filled level-${strength}` : ''} />)}</div>
                      <small>{labels.strength}: {strengthText}</small>
                    </div>
                  )}
                </label>
                {(mode === 'register' || mode === 'reset') && (
                  <label>{labels.confirmPassword}
                    <input type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
                  </label>
                )}
              </>
            )}
            {mode === 'register' && role !== 'patient' && (
              <label>{labels.inviteCode}<input type="password" autoComplete="off" required value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} /><small className="auth-field-hint">{labels.inviteHint}</small></label>
            )}

            {mode === 'register' && (
              <label className="auth-terms-row">
                <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} />
                <span>{labels.terms}</span>
              </label>
            )}

            {mode === 'login' && (
              <div className="auth-form-meta"><span>{isArabic ? 'محمي بتشفير الجلسات' : 'Protected with secure sessions'}</span><button type="button" onClick={() => changeMode('forgot')}>{labels.forgot}</button></div>
            )}
            {mode === 'forgot' && !providers.passwordReset && <div className="auth-info-note"><Info size={16} /><span>{labels.noEmailService}</span></div>}
            {mode === 'forgot' && providers.passwordReset && <div className="auth-info-note"><Mail size={16} /><span>{isArabic ? 'سنرسل رابطًا صالحًا لمرة واحدة وينتهي بعد 30 دقيقة.' : 'We will send a one-time link that expires after 30 minutes.'}</span></div>}

            {error && <div className="auth-error" role="alert">{labels.errors[error] || error}</div>}
            {serviceError && <div className="auth-error" role="alert">{labels.errors.service_error}</div>}
            {notice && <div className="auth-success-note" role="status"><CheckCircle2 size={17} /><span>{notice}</span></div>}

            <button className="auth-submit" type="submit" disabled={submitting || (mode === 'forgot' && !providers.passwordReset)}>
              {submitting ? labels.loading : mode === 'login' ? labels.login : mode === 'register' ? labels.register : mode === 'forgot' ? labels.sendReset : labels.savePassword}
              {!submitting && <ArrowRight size={17} />}
            </button>
          </form>

          {showGoogle && mode === 'register' && (
            <div className="auth-social-secondary">
              <div className="auth-divider"><span>{isArabic ? 'أو أنشئ حسابك باستخدام' : 'OR CREATE AN ACCOUNT WITH'}</span></div>
              <button type="button" className="auth-google-button" onClick={handleGoogleSignIn} disabled={submitting || !providers.google} title={!providers.google ? labels.googleSetup : ''}>
                <svg className="auth-google-logo" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11c-.5 2.5-1.9 4.6-4.1 6v5h6.6c3.9-3.6 6.1-8.8 6.1-14.7z"/>
                  <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5c-1.8 1.2-4 1.9-6.9 1.9-5.3 0-9.8-3.6-11.4-8.4H5.8v5.2C9.2 39.5 16 44 24 44z"/>
                  <path fill="#FBBC05" d="M12.6 27.6a12 12 0 0 1 0-7.2v-5.2H5.8a20 20 0 0 0 0 17.6l6.8-5.2z"/>
                  <path fill="#EA4335" d="M24 12c3 0 5.7 1 7.8 3.1l5.8-5.8C34.1 5.9 29.5 4 24 4 16 4 9.2 8.5 5.8 15.2l6.8 5.2C14.2 15.6 18.7 12 24 12z"/>
                </svg>
                <span>{labels.google}</span>
              </button>
            </div>
          )}
          {showRoles && role !== 'patient' && <p className="auth-team-note"><ShieldCheck size={15} />{labels.googleTeamOnly}</p>}

          {mode === 'login' && <button type="button" className="auth-mode-toggle" onClick={() => changeMode('register')}>{labels.switchRegister}</button>}
          {mode === 'register' && <button type="button" className="auth-mode-toggle" onClick={() => changeMode('login')}>{labels.switchLogin}</button>}
          {(mode === 'forgot' || mode === 'reset') && <button type="button" className="auth-mode-toggle auth-back-button" onClick={() => changeMode('login')}><ArrowLeft size={15} />{labels.back}</button>}
          {mode === 'forgot' && <p className="auth-reset-footnote">{isArabic ? 'لأمانك، لا نكشف ما إذا كان البريد مسجلًا أم لا.' : 'For your privacy, we never reveal whether an email is registered.'}</p>}
        </section>
      </div>
    </div>
  )
}

function WorkspaceApp({ session, onLogout, fallbackLanguage, fallbackTheme }: {
  session: AuthSession
  onLogout: () => void
  fallbackLanguage: Language
  fallbackTheme: 'light' | 'dark'
}) {
  const accountStorageKey = (key: string) => `neurogrip:${session.userId}:${key}`
  const reduceMotion = useReducedMotion()
  const [language, setLanguage] = useState<Language>(() => readStorage<Language>(accountStorageKey('language'), fallbackLanguage))
  const [theme, setTheme] = useState<'light' | 'dark'>(() => readStorage<'light' | 'dark'>(accountStorageKey('theme'), fallbackTheme))
  const [activePage, setActivePage] = useState<Page>(session.role === 'patient' ? 'dashboard' : 'specialist')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [activeSupportTicketId, setActiveSupportTicketId] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile>(() => {
    const stored = readStorage<Partial<Profile>>(accountStorageKey('profile'), {})
    return {
      fullName: stored.fullName ?? session.name,
      email: stored.email ?? session.email,
      phone: stored.phone ?? session.phone ?? '',
      preferredHand: stored.preferredHand ?? session.preferredHand ?? 'right',
      language: stored.language ?? fallbackLanguage,
    }
  })
  const [completedLessons, setCompletedLessons] = useState<string[]>(() => readStorage<string[]>(accountStorageKey('completed-lessons'), []))
  const [saved, setSaved] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [motionEnabled, setMotionEnabled] = useState(true)
  const [battery, setBattery] = useState<BatteryState>(() => {
    const storedLevel = readStorage<number>(accountStorageKey('battery-level'), 78)
    const storedCharging = readStorage<boolean>(accountStorageKey('battery-charging'), false)
    return { level: Number.isFinite(storedLevel) ? Math.max(0, Math.min(100, Math.round(storedLevel))) : 78, charging: storedCharging === true, source: 'demo' }
  })
  const t = (key: string) => dictionary[language][key] ?? dictionary.en[key] ?? key
  const isArabic = language === 'ar'

  useEffect(() => { localStorage.setItem(accountStorageKey('language'), JSON.stringify(language)); document.documentElement.lang = language; document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr' }, [language, session.userId])
  useEffect(() => { localStorage.setItem(accountStorageKey('theme'), JSON.stringify(theme)); document.documentElement.dataset.theme = theme }, [theme, session.userId])
  useEffect(() => { localStorage.setItem(accountStorageKey('profile'), JSON.stringify(profile)) }, [profile, session.userId])
  useEffect(() => { setProfile((current) => current.language === language ? current : { ...current, language }) }, [language])
  useEffect(() => { localStorage.setItem(accountStorageKey('completed-lessons'), JSON.stringify(completedLessons)) }, [completedLessons, session.userId])
  useEffect(() => {
    if (battery.source === 'demo') {
      localStorage.setItem(accountStorageKey('battery-level'), JSON.stringify(battery.level))
      localStorage.setItem(accountStorageKey('battery-charging'), JSON.stringify(battery.charging))
    }
  }, [battery, session.userId])
  useEffect(() => {
    let active = true
    const refreshNotifications = async () => {
      try {
        const response = await fetch('/api/notifications', { cache: 'no-store' })
        if (!response.ok) return
        const data = await response.json() as { notifications: AppNotification[] }
        if (active) setNotifications(data.notifications || [])
      } catch {
        // Keep the workspace usable if the local notification service is temporarily unavailable.
      }
    }
    void refreshNotifications()
    const timer = window.setInterval(() => { void refreshNotifications() }, 7000)
    return () => { active = false; window.clearInterval(timer) }
  }, [session.userId])

  useEffect(() => {
    // Device bridge contract: dispatch "neurogrip:battery" with { level, charging } when ESP32 telemetry is available.
    const receiveBatteryReading = (event: Event) => {
      const detail = (event as CustomEvent<{ level?: unknown; charging?: unknown }>).detail
      if (!detail || typeof detail.level !== 'number' || !Number.isFinite(detail.level)) return
      setBattery({
        level: Math.max(0, Math.min(100, Math.round(detail.level))),
        charging: detail.charging === true,
        source: 'device',
      })
    }
    window.addEventListener('neurogrip:battery', receiveBatteryReading)
    return () => window.removeEventListener('neurogrip:battery', receiveBatteryReading)
  }, [])

  const progress = Math.round((completedLessons.length / lessons.length) * 100)
  const pageTitle = t(activePage)
  const motionOff = Boolean(reduceMotion) || !motionEnabled
  const transition = motionOff ? { duration: 0 } : { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const }
  const initials = useMemo(() => profile.fullName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join(''), [profile.fullName])

  const saveProfile = async () => {
    setProfileError('')
    setSaved(false)
    try {
      const response = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: profile.fullName, phone: profile.phone, preferredHand: profile.preferredHand }),
      })
      if (!response.ok) {
        setProfileError(language === 'ar' ? 'تعذّر حفظ بيانات الحساب. راجع الاسم ورقم الهاتف وحاول مرة أخرى.' : 'Could not save your account details. Check your name and phone number, then try again.')
        return
      }
      const data = await response.json() as { user?: AuthSession }
      if (data.user) {
        setProfile((current) => ({
          ...current, fullName: data.user!.name, phone: data.user!.phone || '',
          preferredHand: data.user!.preferredHand || 'right',
        }))
      }
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2600)
    } catch {
      setProfileError(language === 'ar' ? 'تعذّر الاتصال بخدمة الحسابات.' : 'Could not reach the account service.')
    }
  }

  const goTo = (page: Page) => {
    if (session.role === 'patient' && page === 'specialist') return
    if (session.role !== 'patient' && page !== 'specialist' && page !== 'settings' && page !== 'support') return
    setActivePage(page)
    setMobileOpen(false)
    setNotificationsOpen(false)
    window.scrollTo({ top: 0, behavior: motionOff ? 'auto' : 'smooth' })
  }
  const markNotificationRead = async (notification: AppNotification) => {
    if (!notification.readAt) {
      const readAt = new Date().toISOString()
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, readAt } : item))
      try { await fetch(`/api/notifications/${notification.id}/read`, { method: 'POST' }) } catch { /* next refresh will sync the state */ }
    }
    if (notification.ticketId) {
      setActiveSupportTicketId(notification.ticketId)
      goTo('support')
    }
  }
  const markAllNotificationsRead = async () => {
    const readAt = new Date().toISOString()
    setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt || readAt })))
    try { await fetch('/api/notifications/read-all', { method: 'POST' }) } catch { /* next refresh will sync the state */ }
  }
  const notificationTitle = (notification: AppNotification) => {
    if (notification.type === 'welcome') return t('notificationWelcomeTitle')
    if (notification.type === 'support_new_ticket') return t('notificationNewRequestTitle')
    if (notification.type === 'support_new_reply') return t('notificationNewReplyTitle')
    if (notification.type === 'support_forwarded') return t('notificationForwardedTitle')
    return t('notificationStatusTitle')
  }
  const notificationDescription = (notification: AppNotification) => {
    if (notification.type === 'welcome') return t('notificationWelcomeBody')
    if (notification.type === 'support_new_reply') return t(notification.actorRole === 'patient' ? 'notificationReplyFromPatient' : notification.actorRole === 'developer' ? 'notificationReplyFromDeveloper' : 'notificationReplyFromDoctor')
    if (notification.type === 'support_status') return t(notification.actorRole === 'developer' ? 'notificationStatusFromDeveloper' : 'notificationStatusFromDoctor')
    if (notification.type === 'support_forwarded') return t('notificationForwardedBody')
    if (notification.type === 'support_new_ticket') return t('notificationNewRequestBody')
    return t('notificationNewRequestBody')
  }
  const notificationTime = (value: string) => new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  const unreadNotifications = notifications.filter((notification) => !notification.readAt).length
  const toggleNotifications = () => {
    setNotificationsOpen((current) => !current)
    if (!notificationsOpen) {
      fetch('/api/notifications', { cache: 'no-store' }).then(async (response) => {
        if (response.ok) {
          const data = await response.json() as { notifications: AppNotification[] }
          setNotifications(data.notifications || [])
        }
      }).catch(() => undefined)
    }
  }
  const toggleLesson = (id: string) => setCompletedLessons((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const visibleNavItems = session.role === 'patient' ? navItems : specialistNavItems


  return (
    <div className={`app-shell ${isArabic ? 'rtl' : 'ltr'} ${theme === 'dark' ? 'theme-dark' : 'theme-light'} ${motionOff ? 'reduce-motion' : ''}`} dir={isArabic ? 'rtl' : 'ltr'}>
      <AnimatePresence>
        {mobileOpen && <motion.button className="mobile-scrim" aria-label={t('closeMenu')} onClick={() => setMobileOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />}
      </AnimatePresence>
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-block">
          <div className="brand-symbol"><Hand size={31} strokeWidth={1.7} /><span className="brand-orbit" /></div>
          <div className="brand-name">NEURO<span>GRIP</span></div>
          <div className="brand-tagline">{t('brandLine')}</div>
        </div>
        <div className="nav-label">{t('mobileNav')}</div>
        <nav className="side-nav" aria-label={t('mobileNav')}>
          {visibleNavItems.map(({ id, icon: Icon, key }) => (
            <button key={id} className={`nav-item ${activePage === id ? 'active' : ''}`} onClick={() => goTo(id)}>
              <Icon size={19} strokeWidth={1.8} /><span>{t(key)}</span>
              {activePage === id && <motion.i layoutId="nav-indicator" className="nav-indicator" />}
            </button>
          ))}
        </nav>
        {session.role === 'patient' ? (
          <div className="sidebar-bottom">
            <div className="sidebar-art"><img src="/assets/hand-practice.png" alt="" /></div>
            <p>{t('independence')}</p>
            <div className="sidebar-wave" />
          </div>
        ) : (
          <div className="sidebar-bottom specialist-sidebar-bottom">
            <span>{session.role === 'doctor' ? (language === 'ar' ? 'مساحة المتابعة الطبية' : 'CLINICAL WORKSPACE') : (language === 'ar' ? 'مساحة المتابعة التقنية' : 'TECHNICAL WORKSPACE')}</span>
            <p>{session.role === 'doctor' ? (language === 'ar' ? 'متابعة الحالات والتقارير' : 'Patient cases and reports') : (language === 'ar' ? 'تشخيص الجهاز والحساسات' : 'Device and sensor diagnostics')}</p>
            <div className="sidebar-wave" />
          </div>
        )}
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-start">
            <button className="icon-button mobile-menu-button" aria-label={t('openMenu')} onClick={() => setMobileOpen(true)}><Menu size={20} /></button>
            <div className="breadcrumb"><span>NEUROGRIP</span><ChevronRight size={14} /><strong>{pageTitle}</strong></div>
          </div>
          <div className="topbar-actions">
            <button
              className="theme-toggle-button"
              onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')}
              aria-label={t(theme === 'dark' ? 'switchToLight' : 'switchToDark')}
              title={t(theme === 'dark' ? 'switchToLight' : 'switchToDark')}
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
              <span>{theme === 'dark' ? t('lightMode') : t('darkMode')}</span>
            </button>
            <button className="language-button" onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')} aria-label={t('languageMenu')}>
              <Globe2 size={17} /><span>{language === 'en' ? 'English' : 'العربية'}</span><ChevronDown size={14} />
            </button>
            <div className="notification-wrap">
              <button className={`icon-button ${notificationsOpen ? 'selected' : ''}`} aria-label={t('notifications')} aria-expanded={notificationsOpen} onClick={toggleNotifications}>
                <Bell size={19} />
                {unreadNotifications > 0 && <span className="notification-count">{unreadNotifications > 9 ? '9+' : unreadNotifications}</span>}
              </button>
              <AnimatePresence>
                {notificationsOpen && <motion.div className="notification-popover" initial={{ opacity: 0, y: 8, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }} transition={transition}>
                  <div className="notification-popover-heading"><div className="popover-title">{t('notifications')}</div>{unreadNotifications > 0 && <button type="button" className="mark-read-button" onClick={() => void markAllNotificationsRead()}>{t('markAllRead')}</button>}</div>
                  {notifications.length ? <div className="notification-list">{notifications.slice(0, 25).map((notification) => (
                    <button type="button" key={notification.id} className={`notification-item ${notification.readAt ? '' : 'unread'}`} onClick={() => void markNotificationRead(notification)}>
                      <span className="notification-item-icon">{notification.type === 'welcome' ? <CheckCircle2 size={17} /> : <MessageCircle size={17} />}</span>
                      <span className="notification-item-content"><strong>{notificationTitle(notification)}</strong><small>{notificationDescription(notification)}{notification.subject ? ` · ${notification.subject}` : ''}</small><time>{notificationTime(notification.createdAt)}</time></span>
                      {!notification.readAt && <i className="notification-unread-dot" />}
                    </button>
                  ))}</div> : <div className="empty-notification"><CheckCircle2 size={23} /><span>{t('noNotifications')}</span></div>}
                </motion.div>}
              </AnimatePresence>
            </div>
            {session.role === 'patient' && <button className="avatar-button" onClick={() => goTo('profile')} aria-label={t('profileMenu')}>
              <span>{initials || <UserRound size={18} />}</span><ChevronDown size={13} />
            </button>}
            <span className="session-role-chip">{session.role === 'patient' ? (language === 'ar' ? 'المريض' : 'Patient') : session.role === 'doctor' ? (language === 'ar' ? 'الدكتور' : 'Doctor') : (language === 'ar' ? 'المطوّر' : 'Developer')}</span>
            <button className="logout-button" onClick={onLogout} aria-label={language === 'ar' ? 'تسجيل الخروج' : 'Sign out'} title={language === 'ar' ? 'تسجيل الخروج' : 'Sign out'}><LogOut size={17} /><span>{language === 'ar' ? 'خروج' : 'Sign out'}</span></button>
          </div>
        </header>

        <div className="page-wrap">
          <AnimatePresence mode="wait">
            <motion.div key={activePage} className="page-content" initial={{ opacity: 0, y: motionOff ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: motionOff ? 0 : -8 }} transition={transition}>
              {activePage === 'dashboard' && <Dashboard t={t} goTo={goTo} progress={progress} completedCount={completedLessons.length} battery={battery} onBatteryLevelChange={(level) => setBattery((current) => ({ ...current, level, source: 'demo' }))} onChargingChange={(charging) => setBattery((current) => ({ ...current, charging, source: 'demo' }))} />}
              {activePage === 'howToUse' && <HowToUse t={t} completed={completedLessons} toggleLesson={toggleLesson} progress={progress} />}
              {activePage === 'learning' && <LearningCenter t={t} />}
              {activePage === 'specialist' && session.role !== 'patient' && <SpecialistPortal role={session.role} userId={session.userId} language={language} batteryLevel={battery.level} batterySource={battery.source} />}
              {activePage === 'support' && <SupportCenter role={session.role} userId={session.userId} language={language} initialTicketId={activeSupportTicketId} />}
              {activePage === 'profile' && <ProfilePage t={t} profile={profile} setProfile={setProfile} saved={saved} error={profileError} onSave={saveProfile} />}
              {activePage === 'settings' && <SettingsPage t={t} language={language} setLanguage={setLanguage} theme={theme} setTheme={setTheme} motionEnabled={motionEnabled} setMotionEnabled={setMotionEnabled} />}
            </motion.div>
          </AnimatePresence>
          <footer className="page-footer"><span>© {new Date().getFullYear()} NEUROGRIP</span><span>{t('brandLine')}</span><button onClick={() => goTo('support')}>{t('support')} <ArrowUpRight size={13} /></button></footer>
        </div>
      </main>
    </div>
  )
}

function PageHeading({ eyebrow, title, desc, t }: { eyebrow?: string; title: string; desc: string; t: (key: string) => string }) {
  void t
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow ?? 'NEUROGRIP / USER SPACE'}</div><h1>{title}</h1><p>{desc}</p></div><div className="heading-mark"><Sparkles size={21} /></div></div>
}

function Dashboard({ t, goTo, progress, completedCount, battery, onBatteryLevelChange, onChargingChange }: { t: (key: string) => string; goTo: (page: Page) => void; progress: number; completedCount: number; battery: BatteryState; onBatteryLevelChange: (level: number) => void; onChargingChange: (charging: boolean) => void }) {
  const quickCards = [
    { image: '/assets/emg-electrodes.png', title: 'introEmg', desc: 'introEmgDesc', page: 'learning' as Page, icon: Play },
    { image: '/assets/prosthetic-hand.png', title: 'meetHand', desc: 'meetHandDesc', page: 'howToUse' as Page, icon: Hand },
    { image: '/assets/electrode-placement.png', title: 'electrode', desc: 'electrodeDesc', page: 'howToUse' as Page, icon: Zap },
  ]
  return (
    <>
      <section className="dashboard-hero-grid">
        <motion.div className="welcome-hero" whileHover={{ y: -2 }} transition={{ duration: .22 }}>
          <div className="hero-copy"><span className="hero-kicker"><Sparkles size={14} /> {t('everydayCompanion')}</span><h1>{t('welcome')}<span>.</span></h1><p>{t('subtitle')}</p><button className="primary-button" onClick={() => goTo('howToUse')}><Play size={16} fill="currentColor" />{t('continueGuide')}<ArrowRight size={16} /></button></div>
          <img src="/assets/prosthetic-hero.png" alt="Modern robotic prosthetic hand" className="hero-hand" />
          <div className="hero-glow" />
        </motion.div>
        <motion.div className="device-card" whileHover={{ y: -2 }} transition={{ duration: .22 }}>
          <div className="device-icon"><Wifi size={25} /></div><div className="device-copy"><span className="card-eyebrow">{t('device')}</span><strong className="status-pill offline"><WifiOff size={13} />{t('notConnected')}</strong></div>
          <p>{t('connectHint')}</p><button className="outline-button" onClick={() => goTo('howToUse')}><BookOpen size={16} />{t('learnHow')}</button><div className="device-wave" />
        </motion.div>
        <BatteryFeature t={t} battery={battery} onBatteryLevelChange={onBatteryLevelChange} onChargingChange={onChargingChange} compact />
      </section>

      <section className="section-block">
        <div className="section-heading"><div><span className="section-kicker">{t('startWithBasics')}</span><h2>{t('quickLearning')}</h2></div><button className="text-link" onClick={() => goTo('learning')}>{t('exploreEssentials')}<ArrowRight size={15} /></button></div>
        <div className="quick-grid">
          {quickCards.map((card, index) => {
            const Icon = card.icon
            return <motion.button key={card.title} className="quick-card" onClick={() => goTo(card.page)} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .07, duration: .35 }} whileHover={{ y: -4 }} whileTap={{ scale: .99 }}>
              <div className="quick-image"><img src={card.image} alt="" /><span className="quick-icon"><Icon size={16} /></span></div><div className="quick-copy"><h3>{t(card.title)}</h3><p>{t(card.desc)}</p><span className="round-arrow"><ArrowRight size={15} /></span></div>
            </motion.button>
          })}
        </div>
      </section>


      <section className="progress-strip">
        <div className="progress-icon"><GraduationCap size={23} /></div><div className="progress-copy"><h3>{t('yourProgress')}</h3><p>{completedCount} / 6 {t('modules')} {t('completed')}</p></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><strong>{progress}%</strong><button className="text-link" onClick={() => goTo('howToUse')}>{t('continue')}<ArrowRight size={15} /></button>
      </section>
    </>
  )
}

function HowToUse({ t, completed, toggleLesson, progress }: { t: (key: string) => string; completed: string[]; toggleLesson: (id: string) => void; progress: number }) {
  return <>
    <PageHeading title={t('howTitle')} desc={t('howDesc')} t={t} />
    <div className="learning-overview"><div className="overview-left"><div className="overview-icon"><BookMarked size={21} /></div><div><span className="section-kicker">{t('yourPersonalGuide')}</span><h2>{t('learningPath')}</h2><p>{t('helpfulDesc')}</p></div></div><div className="overview-progress"><strong>{progress}%</strong><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><small>{completed.length} / 6 {t('completed')}</small></div></div>
    <div className="lesson-list">
      {lessons.map((lesson, index) => {
        const done = completed.includes(lesson.id)
        const Icon = lesson.icon
        return <motion.article className={`lesson-card ${done ? 'lesson-done' : ''}`} key={lesson.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .045 }}>
          <div className="lesson-number">{done ? <Check size={18} /> : String(index + 1).padStart(2, '0')}</div>
          <div className="lesson-image">{lesson.image ? <img src={lesson.image} alt="" /> : <Icon size={28} />}</div>
          <div className="lesson-copy"><div className="lesson-meta"><span>{t('estimate')}</span>{done && <span className="completed-badge"><CheckCircle2 size={12} />{t('completedLabel')}</span>}</div><h3>{t(lesson.title)}</h3><p>{t(lesson.desc)}</p></div>
          <button className={done ? 'complete-button done' : 'complete-button'} onClick={() => toggleLesson(lesson.id)}>{done ? <><Check size={15} />{t('completedLabel')}</> : <><Plus size={15} />{t('markComplete')}</>}</button>
        </motion.article>
      })}
    </div>
    <div className="notice-card"><Info size={19} /><p>{t('noMedicalAdvice')}</p></div>
  </>
}

function LearningCenter({ t }: { t: (key: string) => string }) {
  const [videoUnavailable, setVideoUnavailable] = useState(false)
  const emgVideoSrc = '/assets/WhatsApp%20Video%202026-10-27%20at%204.00.39%20AM.mp4'

  return <>
    <PageHeading title={t('learningTitle')} desc={t('learningDesc')} t={t} />
    <section className="featured-video-card">
      <div className="featured-video-heading"><div><span className="section-kicker">{t('learnAtOwnPace')}</span><h2>{t('featuredVideo')}</h2></div><span className="soft-tag"><Video size={14} /> {t('videoIncluded')}</span></div>
      <div className="video-stage">
        {videoUnavailable ? (
          <div className="video-unavailable"><Video size={28} /><p>{t('videoMissing')}</p></div>
        ) : (
          <video
            src={emgVideoSrc}
            controls
            playsInline
            preload="metadata"
            className="uploaded-video"
            aria-label={t('featuredVideo')}
            onError={() => setVideoUnavailable(true)}
            onLoadedData={() => setVideoUnavailable(false)}
          />
        )}
      </div>
      <div className="fixed-video-note"><Info size={15} /><span>{t('videoFixedHint')}</span></div>
    </section>
  </>
}


function BatteryFeature({ t, battery, onBatteryLevelChange, onChargingChange, compact = false }: {
  t: (key: string) => string
  battery: BatteryState
  onBatteryLevelChange: (level: number) => void
  onChargingChange: (charging: boolean) => void
  compact?: boolean
}) {
  const isLow = battery.level <= 20
  const BatteryIcon = battery.charging ? BatteryCharging : Battery
  return (
    <section className={`battery-card ${compact ? 'compact' : 'full'} ${isLow ? 'low' : ''}`} aria-label={t('batteryTitle')}>
      <div className="battery-card-head">
        <div className="battery-title-wrap">
          <div className="battery-icon"><BatteryIcon size={21} /></div>
          <div className="battery-title-copy"><strong>{t('batteryTitle')}</strong><span>{battery.source === 'device' ? t('batteryLive') : t('batteryDemo')}</span></div>
        </div>
        <strong className="battery-percent">{battery.level}%</strong>
      </div>
      <div className="battery-track" role="progressbar" aria-label={t('batteryTitle')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={battery.level}>
        <span className="battery-fill" style={{ width: `${battery.level}%` }} />
      </div>
      <div className="battery-card-meta">
        <span className={`battery-status ${isLow ? 'warning' : 'healthy'}`}>{isLow ? t('batteryLow') : battery.charging ? t('charging') : t('batteryGood')}</span>
        {battery.source === 'demo' && <span className="battery-demo-label">{t('demoTag')}</span>}
      </div>
      {!compact && <>
        {battery.source === 'demo' && <div className="battery-controls">
          <label className="battery-range-label" htmlFor="battery-demo-level"><span>{t('adjustBattery')}</span><output>{battery.level}%</output></label>
          <input id="battery-demo-level" className="battery-range" type="range" min="0" max="100" step="1" value={battery.level} onChange={(event) => onBatteryLevelChange(Number(event.target.value))} />
          <label className="battery-charge-toggle"><input type="checkbox" checked={battery.charging} onChange={(event) => onChargingChange(event.target.checked)} /> <span>{t('charging')}</span></label>
        </div>}
        <p className="battery-note"><Info size={15} />{t(battery.source === 'device' ? 'batteryLiveNotice' : 'batteryDemoNotice')}</p>
      </>}
    </section>
  )
}

function ProfilePage({ t, profile, setProfile, saved, error, onSave }: {
  t: (key: string) => string
  profile: Profile
  setProfile: Dispatch<SetStateAction<Profile>>
  saved: boolean
  error: string
  onSave: () => void
}) {
  return <>
    <PageHeading title={t('profileTitle')} desc={t('profileDesc')} t={t} />
    <div className="profile-layout">
      <section className="profile-card">
        <div className="profile-card-heading">
          <div className="profile-avatar-large">{profile.fullName.trim() ? profile.fullName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') : <UserRound size={30} />}</div>
          <div><span className="section-kicker">{t('personalInformation')}</span><h2>{profile.fullName || t('placeholderName')}</h2><p>{profile.email || t('placeholderEmail')}</p></div>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); onSave() }} className="profile-form">
          <label>{t('fullName')}<input required minLength={2} maxLength={80} value={profile.fullName} onChange={(event) => setProfile((current) => ({ ...current, fullName: event.target.value }))} placeholder={t('fullName')} /></label>
          <label>{t('email')}<input type="email" value={profile.email} disabled readOnly title={t('email')} /></label>
          <label>{t('phone')}<input type="tel" maxLength={30} value={profile.phone} onChange={(event) => setProfile((current) => ({ ...current, phone: event.target.value }))} placeholder="+20 1xx xxx xxxx" /></label>
          <label>{t('preferredHand')}<select value={profile.preferredHand} onChange={(event) => setProfile((current) => ({ ...current, preferredHand: event.target.value }))}><option value="right">{t('rightHand')}</option><option value="left">{t('leftHand')}</option></select></label>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <div className="profile-form-footer"><button className="primary-button" type="submit"><Check size={16} />{t('saveChanges')}</button>{saved && <span className="saved-message"><CheckCircle2 size={15} />{t('saved')}</span>}</div>
        </form>
      </section>
      <aside className="profile-side-note"><div className="note-icon"><ShieldCheck size={22} /></div><h3>{t('account')}</h3><p>{t('profilePrivacy')}</p><div className="profile-note-line"><span>{t('language')}</span><strong>{profile.language === 'ar' ? t('arabic') : t('english')}</strong></div></aside>
    </div>
  </>
}

function SettingsPage({ t, language, setLanguage, theme, setTheme, motionEnabled, setMotionEnabled }: { t: (key: string) => string; language: Language; setLanguage: (value: Language) => void; theme: 'light' | 'dark'; setTheme: (value: 'light' | 'dark') => void; motionEnabled: boolean; setMotionEnabled: (value: boolean) => void }) {
  return <>
    <PageHeading title={t('settingsTitle')} desc={t('settingsDesc')} t={t} />
    <div className="settings-groups"><section className="settings-card"><div className="settings-card-heading"><div className="settings-icon"><Languages size={20} /></div><div><h2>{t('language')}</h2><p>Choose the language used across the interface.</p></div></div><div className="setting-options"><button className={language === 'en' ? 'setting-option selected' : 'setting-option'} onClick={() => setLanguage('en')}><span className="language-flag">EN</span><span>English</span>{language === 'en' && <CheckCircle2 size={17} />}</button><button className={language === 'ar' ? 'setting-option selected' : 'setting-option'} onClick={() => setLanguage('ar')}><span className="language-flag arabic-flag">ع</span><span>العربية</span>{language === 'ar' && <CheckCircle2 size={17} />}</button></div></section>
      <section className="settings-card"><div className="settings-card-heading"><div className="settings-icon"><Sun size={20} /></div><div><h2>{t('appearance')}</h2><p>{t('themeHelp')}</p></div></div><div className="setting-options theme-options"><button className={theme === 'light' ? 'setting-option theme-option selected' : 'setting-option theme-option'} onClick={() => setTheme('light')} aria-pressed={theme === 'light'}><span className="theme-preview light-preview"><Sun size={17} /></span><span>{t('lightMode')}</span>{theme === 'light' && <CheckCircle2 size={17} />}</button><button className={theme === 'dark' ? 'setting-option theme-option selected' : 'setting-option theme-option'} onClick={() => setTheme('dark')} aria-pressed={theme === 'dark'}><span className="theme-preview dark-preview"><Moon size={17} /></span><span>{t('darkMode')}</span>{theme === 'dark' && <CheckCircle2 size={17} />}</button></div></section>
      <section className="settings-card"><div className="settings-card-heading"><div className="settings-icon"><Sparkles size={20} /></div><div><h2>{t('motion')}</h2><p>{t('motionDesc')}</p></div></div><button className={`toggle-row ${motionEnabled ? 'toggle-on' : ''}`} onClick={() => setMotionEnabled(!motionEnabled)}><span><strong>{t('motion')}</strong><small>{t('accessibilityDesc')}</small></span><i className="toggle-switch"><b /></i></button></section>
      <section className="settings-card help-settings"><div className="settings-card-heading"><div className="settings-icon"><CircleHelp size={20} /></div><div><h2>{t('help')}</h2><p>{t('helpDesc')}</p></div></div></section>
    </div>
  </>
}

export default App
