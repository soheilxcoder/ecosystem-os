/**
 * Bilingual string table for the showcase (English / فارسی).
 *
 * Keys are flat and namespaced by screen. Technical identifiers (table names,
 * file references, rule documents) stay untranslated on purpose — they point
 * at real artefacts.
 */

export interface StringPair {
  en: string;
  fa: string;
}

const S = {
  // ------------------------------------------------------------- shell ----
  'shell.banner': {
    en: 'Static showcase with sample data — the live platform runs on Node.js with a real database.',
    fa: 'نمایش استاتیک با دادهٔ نمونه — نسخهٔ زندهٔ پلتفرم روی Node.js با دیتابیس واقعی اجرا می‌شود.',
  },
  'shell.cycleStatus': {
    en: 'Cycle 3 · Day 62 of 90 · Execution phase',
    fa: 'چرخهٔ ۳ · روز ۶۲ از ۹۰ · فاز اجرا',
  },
  'shell.language': { en: 'Language', fa: 'زبان' },
  'shell.signOut': { en: 'Sign out', fa: 'خروج' },

  // ------------------------------------------------------------- login ----
  'login.tagline': {
    en: 'The operating platform of {org} — pods govern themselves; hubs coordinate.',
    fa: 'پلتفرم عملیاتی {org} — پادها خودشان اداره می‌شوند؛ هاب‌ها هماهنگ می‌کنند.',
  },
  'login.signIn': { en: 'Sign in', fa: 'ورود' },
  'login.pickSeat': {
    en: 'Static showcase — pick a seat to explore the platform the way that role sees it.',
    fa: 'نمایش استاتیک — یک جایگاه را انتخاب کنید تا پلتفرم را از دید همان نقش ببین.',
  },
  'login.email': { en: 'Email', fa: 'ایمیل' },
  'login.enter': { en: 'Enter ←', fa: 'ورود ←' },
  'login.footer': {
    en: 'In the live product, sessions are issued by the platform API and every seat is a time-boxed role assignment — never a permanent property of a profile.',
    fa: 'در نسخهٔ زنده، نشست‌ها توسط API پلتفرم صادر می‌شوند و هر جایگاه یک انتساب نقش زمان‌دار است — نه یک ویژگی دائمی پروفایل.',
  },
  'login.faButton': { en: 'فارسی', fa: 'English' },

  // -------------------------------------------------------------- nav -----
  'nav.dashboard': { en: 'Dashboard', fa: 'داشبورد' },
  'nav.myPod': { en: 'My Pod', fa: 'پاد من' },
  'nav.agreements': { en: 'Agreements (CLOU)', fa: 'توافق‌نامه‌ها (CLOU)' },
  'nav.budget': { en: 'Budget Market', fa: 'بازار بودجه' },
  'nav.calendar': { en: 'Sprint Calendar', fa: 'تقویم اسپرینت' },
  'nav.coaching': { en: 'Coaching', fa: 'کوچینگ' },
  'nav.review': { en: 'Peer Review & Cases', fa: 'داوری همتایان و پرونده‌ها' },
  'nav.archive': { en: 'Archive', fa: 'بایگانی' },
  'nav.hub': { en: 'Hub Console', fa: 'کنسول هاب‌ها' },
  'nav.notifications': { en: 'Notifications', fa: 'اعلان‌ها' },
  'nav.settings': { en: 'Settings', fa: 'تنظیمات' },
  'nav.current': { en: 'current', fa: 'فعلی' },
  'nav.planned': { en: '{label} — planned for phase {phase}', fa: '{label} — برای فاز {phase} برنامه‌ریزی شده' },
  'nav.aria': { en: 'Modules', fa: 'ماژول‌ها' },

  // ---------------------------------------------------------- personas ----
  'role.podLeadAtlas': { en: 'Pod Lead — Pod Atlas', fa: 'سرپرست پاد — پاد اطلس' },
  'role.coach': { en: 'Coach — Atlas, Cinder & Ember', fa: 'کوچ — اطلس، سیندر و امبر' },
  'role.hubArchitecture': { en: 'Architecture Hub', fa: 'هاب معماری' },
  'role.hubStrategic': { en: 'Strategic Interactions Hub', fa: 'هاب تعاملات راهبردی' },
  'role.investor': { en: 'Investor — Holding Pars', fa: 'سرمایه‌گذار — هلدینگ پارس' },

  'seat.Pod Lead': { en: 'Pod Lead', fa: 'سرپرست پاد' },
  'seat.Pod Member': { en: 'Pod Member', fa: 'عضو پاد' },
  'seat.Coach': { en: 'Coach', fa: 'کوچ' },
  'seat.Architecture Hub': { en: 'Architecture Hub', fa: 'هاب معماری' },
  'seat.Strategic Interactions Hub': { en: 'Strategic Interactions Hub', fa: 'هاب تعاملات راهبردی' },
  'seat.Investor': { en: 'Investor', fa: 'سرمایه‌گذار' },

  // ------------------------------------------------------------ org -------
  'org.x': { en: 'Company X', fa: 'شرکت ایکس' },
  'holding.holding-pars': { en: 'Holding Pars', fa: 'هلدینگ پارس' },
  'holding.holding-dena': { en: 'Holding Dena', fa: 'هلدینگ دنا' },
  'pod.pod-atlas': { en: 'Pod Atlas', fa: 'پاد اطلس' },
  'pod.pod-basalt': { en: 'Pod Basalt', fa: 'پاد بازالت' },
  'pod.pod-cinder': { en: 'Pod Cinder', fa: 'پاد سیندر' },
  'pod.pod-dune': { en: 'Pod Dune', fa: 'پاد دون' },
  'pod.pod-ember': { en: 'Pod Ember', fa: 'پاد امبر' },

  'status.active': { en: 'active', fa: 'فعال' },
  'status.trial': { en: 'trial', fa: 'آزمایشی' },
  'signal.green': { en: 'green', fa: 'سبز' },
  'signal.amber': { en: 'amber', fa: 'کهربایی' },
  'signal.red': { en: 'red', fa: 'قرمز' },
  'nav.primary': { en: 'Primary', fa: 'اصلی' },
  'calendar.dayShort': { en: 'Day {day}', fa: 'روز {day}' },
  'phaseShort.execution': { en: 'Execution', fa: 'اجرا' },
  'breakdown.componentFormula': {
    en: '{weight}% weight × {score} raw score',
    fa: '{weight}٪ وزن × {score} امتیاز خام',
  },
  'data.onTimeDeliveries': { en: 'On-time deliveries', fa: 'تحویل‌های به‌موقع' },
  'data.totalDeliveries': { en: 'Total deliveries', fa: 'کل تحویل‌ها' },
  'data.disputedValue': { en: 'Disputed value', fa: 'ارزش مورد اختلاف' },
  'data.reworkRate': { en: 'Rework rate', fa: 'نرخ دوباره‌کاری' },
  'data.reviewsCompleted': { en: 'Reviews completed', fa: 'داوری‌های انجام‌شده' },
  'data.averageMark': { en: 'Average mark', fa: 'میانگین نمره' },
  'data.maxMark': { en: 'Maximum mark', fa: 'حداکثر نمره' },
  'data.escalations': { en: 'Escalations', fa: 'ارجاع‌ها' },
  'data.themesMatched': { en: 'Themes matched', fa: 'محورهای منطبق' },
  'data.themesTotal': { en: 'Themes total', fa: 'کل محورها' },
  'data.pitchAcceptance': { en: 'Pitch acceptance', fa: 'نرخ پذیرش پیچ' },

  // --------------------------------------------------------- dashboard ----
  'dashboard.h1': { en: 'Dashboard', fa: 'داشبورد' },
  'dashboard.heroTitle': {
    en: 'Welcome back, {name} — here is where the ecosystem stands.',
    fa: 'خوش برگشتی {name} — وضعیت اکوسیستم را از اینجا ببین.',
  },
  'dashboard.heroProgress': { en: '{n} days to results', fa: '{n} روز تا اعلام نتایج' },
  'dashboard.signedIn': { en: 'Signed in as {name} · {role}.', fa: 'ورود به‌عنوان {name} · {role}.' },
  'dashboard.activeRoles': { en: 'Active roles', fa: 'نقش‌های فعال' },
  'dashboard.seats': { en: 'seats', fa: 'جایگاه' },
  'dashboard.seat': { en: 'seat', fa: 'جایگاه' },
  'dashboard.rolesHint': {
    en: 'Roles are time-boxed assignments, re-read from the database on every request.',
    fa: 'نقش‌ها انتساب‌های زمان‌دار هستند و در هر درخواست از دیتابیس بازخوانی می‌شوند.',
  },
  'dashboard.provSourceRoles': { en: 'role_assignment (active today)', fa: 'role_assignment (فعال در امروز)' },
  'dashboard.provFormulaRoles': {
    en: 'start_date <= today <= end_date, and revoked_at is null',
    fa: 'start_date <= امروز <= end_date و revoked_at برابر null',
  },
  'dashboard.pods': { en: 'Pods', fa: 'پادها' },
  'dashboard.hubSeatsHint': {
    en: 'Hub seats span the whole organisation rather than one pod.',
    fa: 'جایگاه‌های هاب کل سازمان را پوشش می‌دهند، نه یک پاد را.',
  },
  'dashboard.cycle': { en: 'Cycle', fa: 'چرخه' },
  'dashboard.day62': { en: 'Day 62', fa: 'روز ۶۲' },
  'dashboard.of90': { en: 'of 90', fa: 'از ۹۰' },
  'dashboard.cycleHint': {
    en: 'Execution phase · 28 days left in cycle 3.',
    fa: 'فاز اجرا · ۲۸ روز تا پایان چرخهٔ ۳.',
  },
  'dashboard.yourSeats': { en: 'Your seats', fa: 'جایگاه‌های شما' },
  'dashboard.podsInOrg': { en: 'Pods in your organisation', fa: 'پادهای سازمان شما' },
  'dashboard.members': { en: '{n} members', fa: '{n} عضو' },
  'dashboard.next': { en: 'Where to look next', fa: 'قدم‌های بعدی' },
  'dashboard.nextPrefix': { en: 'The', fa: '' },
  'dashboard.nextMid1': {
    en: 'shows how this cycle’s pool is divided, the',
    fa: 'نشان می‌دهد استخر این چرخه چگونه تقسیم می‌شود؛',
  },
  'dashboard.nextMid2': {
    en: 'shows where the organisation is in time, and the',
    fa: 'جای سازمان در زمان را نشان می‌دهد و',
  },
  'dashboard.nextSuffix': {
    en: 'is where the four hubs coordinate.',
    fa: 'محل هماهنگی چهار هاب است.',
  },
  'dashboard.nextBudget': { en: 'Budget Market', fa: 'بازار بودجه' },
  'dashboard.nextCalendar': { en: 'Sprint Calendar', fa: 'تقویم اسپرینت' },
  'dashboard.nextHub': { en: 'Hub Console', fa: 'کنسول هاب‌ها' },
  'dateRange': { en: '{a} → {b}', fa: '{a} ← {b}' },
  'lang.listSep': { en: ', ', fa: '، ' },

  // --------------------------------------------------- rotation badge -----
  'rotation.none': { en: 'No rotation set', fa: 'هنوز چرخشی تنظیم نشده' },
  'rotation.openEnded': { en: 'Open-ended', fa: 'بدون پایان مشخص' },
  'rotation.ended': { en: 'Rotation ended', fa: 'چرخش پایان یافته' },
  'rotation.endsToday': { en: 'Ends today', fa: 'امروز تمام می‌شود' },
  'rotation.oneDay': { en: '1 day left', fa: '۱ روز مانده' },
  'rotation.daysLeft': { en: '{n} days left', fa: '{n} روز مانده' },

  // ------------------------------------------------------------- budget ---
  'budget.h1': { en: 'Budget Market', fa: 'بازار بودجه' },
  'budget.sub': {
    en: 'Cycle {cycle} · Day {day} of 90 · how the organisation’s allocatable budget is divided between pods, by formula.',
    fa: 'چرخهٔ {cycle} · روز {day} از ۹۰ · بودجهٔ قابل‌تخصیص سازمان چگونه با فرمول بین پادها تقسیم می‌شود.',
  },
  'budget.chip': { en: 'Provisional — locks on Day 89', fa: 'موقت — در روز ۸۹ قفل می‌شود' },
  'budget.intro': {
    en: 'Every number below is computed, not entered: Unit Score feeds the formula, the Survival Budget is the floor, and the 25% ceiling keeps any one pod from absorbing the pool.',
    fa: 'هر عدد زیر محاسبه شده، نه دستی وارد شده: امتیاز واحد ورودی فرمول است، بودجهٔ بقا کف را می‌سازد و سقف ۲۵٪ نمی‌گذارد یک پاد کل استخر را ببلعد.',
  },
  'budget.allocationH2': { en: 'Allocation across the organisation', fa: 'تخصیص در کل سازمان' },
  'budget.allocationSub': {
    en: 'Every pod’s share of the total allocatable budget. Select a segment for its full calculation.',
    fa: 'سهم هر پاد از کل بودجهٔ قابل‌تخصیص. برای دیدن محاسبهٔ کامل، یک قطعه را انتخاب کنید.',
  },
  'budget.pool': { en: 'Total allocatable pool', fa: 'کل استخر قابل‌تخصیص' },
  'budget.poolHint': { en: 'Cycle {n}', fa: 'چرخهٔ {n}' },
  'budget.poolProvFormula': {
    en: 'Set by the Architecture Hub at the start of the cycle',
    fa: 'در آغاز چرخه توسط هاب معماری تعیین می‌شود',
  },
  'budget.cap': { en: 'Ceiling per pod (25%)', fa: 'سقف هر پاد (۲۵٪)' },
  'budget.capHint': {
    en: 'No pod is over the ceiling this cycle; if one were, the excess would be redistributed.',
    fa: 'در این چرخه هیچ پادی از سقف فراتر نرفته؛ اگر می‌رفت، مقدار اضافی بازتوزیع می‌شد.',
  },
  'budget.tableCaption': {
    en: 'Cycle {n} results — provisional until the lock window',
    fa: 'نتایج چرخهٔ {n} — تا پنجرهٔ قفل، موقت',
  },
  'budget.colPod': { en: 'Pod', fa: 'پاد' },
  'budget.colUnitScore': { en: 'Unit Score', fa: 'امتیاز واحد' },
  'budget.colSurvival': { en: 'Survival', fa: 'بودجهٔ بقا' },
  'budget.colFinal': { en: 'Final budget', fa: 'بودجهٔ نهایی' },
  'budget.colShare': { en: 'Share', fa: 'سهم' },
  'budget.capped': { en: 'capped', fa: 'سقف‌خورده' },
  'budget.totalPool': { en: 'Total pool', fa: 'کل استخر' },
  'budget.whyH2': { en: 'Why a market?', fa: 'چرا بازار؟' },
  'budget.whyText1': {
    en: 'No manager allocates money here. The formula does, in the open — so any pod can audit why its budget moved. That audit trail is the',
    fa: 'اینجا هیچ مدیری پول تخصیص نمی‌دهد. فرمول این کار را در ملاءعام انجام می‌دهد — تا هر پادی بتواند حسابرسی کند چرا بودجه‌اش تغییر کرده. این مسیر حسابرسی همان',
  },
  'budget.whyText2': { en: ', step by step.', fa: ' است، قدم‌به‌قدم.' },
  'budget.whyLink': { en: 'full calculation', fa: 'محاسبهٔ کامل' },
  'budget.ariaAllocation': {
    en: 'Allocation of {pool} across {n} pods',
    fa: 'تخصیص {pool} بین {n} پاد',
  },
  'budget.ariaSegment': {
    en: '{pod}: {amount} of the pool ({share}%). Open the full calculation.',
    fa: '{pod}: {amount} از استخر ({share}٪). باز کردن محاسبهٔ کامل.',
  },
  'budget.ariaCappedSuffix': { en: ', capped at the ceiling', fa: '، سقف‌خورده' },
  'budget.emptyAllocation': {
    en: 'No allocation to draw yet — the Architecture Hub sets the pool and runs the calculation for the active cycle.',
    fa: 'هنوز تخصیصی برای نمایش نیست — هاب معماری استخر را تعیین و محاسبهٔ چرخهٔ فعال را اجرا می‌کند.',
  },
  'budget.provisionalNote': {
    en: 'Provisional — these shares move as peer reviews and financial syncs arrive, until the cycle locks on Day 90.',
    fa: 'موقت — این سهم‌ها با رسیدن داوری‌های همتا و همگام‌سازی‌های مالی تغییر می‌کنند، تا قفل شدن چرخه در روز ۹۰.',
  },

  // ----------------------------------------------------- lock checklist ---
  'lock.missing': { en: 'What is missing', fa: 'چه چیزی کم است' },
  'lock.heading': { en: 'Cycle {n} budget', fa: 'بودجهٔ چرخهٔ {n}' },
  'lock.provisional': { en: 'Provisional — live estimate', fa: 'موقت — برآورد زنده' },
  'lock.ready': { en: 'Ready to lock', fa: 'آمادهٔ قفل' },
  'lock.locked': { en: 'Locked', fa: 'قفل‌شده' },
  'lock.row1': { en: 'The automated calculation has run', fa: 'محاسبهٔ خودکار اجرا شده است' },
  'lock.row1Done': {
    en: 'Every pod has a stored Unit Score and allocation',
    fa: 'هر پاد یک امتیاز واحد و تخصیص ذخیره‌شده دارد',
  },
  'lock.row1Pending': {
    en: 'The Architecture Hub sets the total pool and runs the calculation first',
    fa: 'ابتدا هاب معماری کل استخر را تعیین و محاسبه را اجرا می‌کند',
  },
  'lock.row2': {
    en: 'Every component score is measured, not estimated',
    fa: 'همهٔ امتیازهای جزء اندازه‌گیری شده‌اند، نه تخمینی',
  },
  'lock.row2Done': { en: 'No input fell back to the midpoint', fa: 'هیچ ورودی به نقطهٔ میانی برنگشته است' },
  'lock.row2Pending': {
    en: '{n} input(s) still estimated or missing',
    fa: '{n} ورودی هنوز تخمینی یا ناقص است',
  },
  'lock.row3': {
    en: 'Inside the Day 89–90 announcement window',
    fa: 'داخل پنجرهٔ اعلام نتایج روز ۸۹–۹۰',
  },
  'lock.row3In': { en: 'Cycle day {day} · {phase}', fa: 'روز {day} چرخه · {phase}' },
  'lock.row3InPlain': { en: 'In the results phase', fa: 'در فاز نتایج' },
  'lock.row3Out': {
    en: 'Cycle day {day} — results are announced on Days 89–90',
    fa: 'روز {day} چرخه — نتایج در روزهای ۸۹–۹۰ اعلام می‌شوند',
  },
  'lock.reason.peer_reviews_unresolved': { en: 'Peer reviews still open', fa: 'داوری‌های همتا هنوز بازند' },
  'lock.reason.peer_reviews_missing': { en: 'No peer reviews submitted', fa: 'هیچ داوری همتایی ثبت نشده' },
  'lock.reason.financial_sync_missing': { en: 'No financial figures', fa: 'ارقام مالی وجود ندارد' },
  'lock.reason.financial_sync_failed': { en: 'Financial sync failed', fa: 'همگام‌سازی مالی ناموفق بود' },
  'lock.reason.no_pods': { en: 'Nothing to allocate', fa: 'چیزی برای تخصیص نیست' },
  'lock.detail.dune': {
    en: 'The connector returned stale figures two days running.',
    fa: 'کانکتور برای دو روز پیاپی ارقام قدیمی برگرداند.',
  },
  'lock.detail.ember': {
    en: 'One assigned peer review is still a draft.',
    fa: 'یکی از داوری‌های همتای محول‌شده هنوز پیش‌نویس است.',
  },

  // ---------------------------------------------------------- breakdown ---
  'breakdown.h1': { en: '{pod} — full calculation', fa: '{pod} — محاسبهٔ کامل' },
  'breakdown.calculated': { en: 'Cycle {cycle} · calculated {date}', fa: 'چرخهٔ {cycle} · محاسبه‌شده در {date}' },
  'breakdown.heroLabel': { en: 'Unit Budget — provisional estimate', fa: 'بودجهٔ واحد — برآورد موقت' },
  'breakdown.heroSub': {
    en: '{share}% of a {pool} pool · Unit Score {score}',
    fa: '{share}٪ از استخر {pool} · امتیاز واحد {score}',
  },
  'breakdown.delta': {
    en: 'versus cycle {n} ({budget}, Unit Score {score})',
    fa: 'نسبت به چرخهٔ {n} ({budget}، امتیاز واحد {score})',
  },
  'breakdown.componentsH2': {
    en: 'How each component score was derived',
    fa: 'هر امتیاز جزء چگونه به دست آمده',
  },
  'breakdown.rawInputs': { en: '{label} — raw inputs', fa: '{label} — ورودی‌های خام' },
  'breakdown.normalizedVia': { en: '{method}', fa: '{method}' },
  'breakdown.arithmeticH2': { en: 'The weighted sum', fa: 'مجموع وزن‌دار' },
  'breakdown.unitScore': { en: 'Unit Score', fa: 'امتیاز واحد' },
  'breakdown.poolH2': { en: 'From Unit Score to budget', fa: 'از امتیاز واحد تا بودجه' },
  'breakdown.poolTotal': { en: 'Total pool', fa: 'کل استخر' },
  'breakdown.poolReserved': { en: 'Reserved for Survival Budgets', fa: 'ذخیره برای بودجه‌های بقا' },
  'breakdown.poolReservedHint': {
    en: 'Every pod’s floor, before the formula',
    fa: 'کف هر پاد، پیش از اجرای فرمول',
  },
  'breakdown.poolReservedFormula': {
    en: 'one month of each pod’s fixed costs',
    fa: 'معادل یک ماه از هزینه‌های ثابت هر پاد',
  },
  'breakdown.poolDistributable': { en: 'Distributable pool', fa: 'استخر قابل‌توزیع' },
  'breakdown.poolDistributableHint': {
    en: 'What the proportional formula divides',
    fa: 'آنچه فرمول تناسبی تقسیم می‌کند',
  },
  'breakdown.poolDistributableFormula': {
    en: 'total pool − Σ survival budgets',
    fa: 'کل استخر − مجموع بودجه‌های بقا',
  },
  'breakdown.stepCol': { en: 'Step', fa: 'مرحله' },
  'breakdown.amountCol': { en: 'Amount', fa: 'مبلغ' },
  'breakdown.stepShare': { en: 'This pod’s share of all Unit Scores', fa: 'سهم این پاد از مجموع امتیازهای واحد' },
  'breakdown.stepShareNote': {
    en: '{score} ÷ Σ all Unit Scores × {pool}',
    fa: '{score} ÷ مجموع امتیازهای واحد × {pool}',
  },
  'breakdown.stepSurvival': { en: 'Survival Budget added', fa: 'افزودن بودجهٔ بقا' },
  'breakdown.stepSurvivalNote': {
    en: 'Reserved floor — 12 × {monthly}',
    fa: 'کف ذخیره‌شده — ۱۲ × {monthly}',
  },
  'breakdown.stepCap': { en: 'Cap check', fa: 'بررسی سقف' },
  'breakdown.stepCapNote': {
    en: 'Ceiling is {cap} (25% of pool) — not exceeded',
    fa: 'سقف {cap} است (۲۵٪ استخر) — رد نشده',
  },
  'breakdown.final': { en: 'Final budget', fa: 'بودجهٔ نهایی' },
  'breakdown.finalNote': {
    en: 'Survival Budget {survival} + formula share {share}',
    fa: 'بودجهٔ بقا {survival} + سهم فرمول {share}',
  },
  'breakdown.back': { en: 'Back to the cycle', fa: 'بازگشت به چرخه' },
  'breakdown.archive': { en: 'Locked cycles in the archive', fa: 'چرخه‌های قفل‌شده در بایگانی' },
  'breakdown.estimated': { en: 'estimated', fa: 'تخمینی' },
  'breakdown.estimatedTooltip': {
    en: 'This component’s input was missing, so it is shown at the midpoint. It can inform a provisional estimate but blocks the cycle from locking.',
    fa: 'ورودی این جزء موجود نبوده، بنابراین در نقطهٔ میانی نمایش داده می‌شود. می‌تواند مبنای برآورد موقت باشد اما مانع قفل شدن چرخه می‌شود.',
  },

  // breakdown components (per-pod sample)
  'component.financial': { en: 'Financial delivery', fa: 'تحویل مالی' },
  'component.financial.explanation': {
    en: 'Revenue booked on time, minus rework and disputed invoices.',
    fa: 'درآمد ثبت‌شده به‌موقع، منهای دوباره‌کاری و صورتحساب‌های مورد اختلاف.',
  },
  'component.peer_review': { en: 'Peer review quality', fa: 'کیفیت داوری همتایان' },
  'component.peer_review.explanation': {
    en: 'Mean of the peer validators’ marks on this cycle’s outputs.',
    fa: 'میانگین نمرات داوران همتا به خروجی‌های این چرخه.',
  },
  'component.strategic': { en: 'Strategic alignment', fa: 'هم‌راستایی راهبردی' },
  'component.strategic.explanation': {
    en: 'How closely the pod’s pitches tracked the Strategic Hub’s themes.',
    fa: 'میزان هم‌راستایی پیچ‌های پاد با محورهای هاب راهبردی.',
  },
  'norm.peer_reviewed_percentile': { en: 'peer reviewed percentile', fa: 'صدک داوری‌شدهٔ همتایان' },
  'norm.hub_scored': { en: 'hub scored', fa: 'امتیازدهی هاب' },

  // ----------------------------------------------------------- calendar ---
  'calendar.h1': { en: 'Sprint Calendar', fa: 'تقویم اسپرینت' },
  'calendar.sub': {
    en: 'Cycle {cycle} · {start} – {end}. All pods are synchronised to this calendar, which is what makes their scores comparable.',
    fa: 'چرخهٔ {cycle} · {start} – {end}. همهٔ پادها با این تقویم هم‌گام‌اند؛ همین موضوع امتیازهایشان را قابل‌مقایسه می‌کند.',
  },
  'calendar.pauseNote': {
    en: 'Adjusted for 1 pause day — the cycle is extended, day numbering is unchanged.',
    fa: 'با ۱ روز توقف تنظیم شده — چرخه کشیده‌تر می‌شود اما شماره‌گذاری روزها تغییر نمی‌کند.',
  },
  'calendar.phases': { en: 'Phases', fa: 'فازها' },
  'calendar.currentPhase': { en: 'Current phase', fa: 'فاز فعلی' },
  'calendar.daysLeftPhase': { en: 'Days left in this phase', fa: 'روزهای باقی‌ماندهٔ این فاز' },
  'calendar.daysLeftCycle': { en: '{n} days left in the cycle', fa: '{n} روز تا پایان چرخه' },
  'calendar.pauseDays': { en: 'Pause days', fa: 'روزهای توقف' },
  'calendar.milestones': { en: 'Upcoming milestones', fa: 'نقاط عطف پیش رو' },
  'calendar.none': { en: 'No milestones remain in this cycle.', fa: 'نقطهٔ عطفی در این چرخه باقی نمانده است.' },
  'calendar.inDays': { en: 'Day {day} · {date} · in {n} days', fa: 'روز {day} · {date} · {n} روز دیگر' },
  'calendar.today': { en: 'Today', fa: 'امروز' },
  'calendar.scheduled': { en: 'Scheduled', fa: 'زمان‌بندی‌شده' },
  'calendar.pods': { en: 'Pods on this calendar', fa: 'پادهای این تقویم' },
  'calendar.dayOf90': { en: 'Day {day} of 90', fa: 'روز {day} از ۹۰' },
  'calendar.wheelLabel': { en: 'Day {day} of {total}', fa: 'روز {day} از {total}' },
  'calendar.provFormula': {
    en: 'Day boundaries {b1} / {b2} / {b3} / {b4} / {b5}',
    fa: 'مرزهای روز {b1} / {b2} / {b3} / {b4} / {b5}',
  },
  'calendar.complete': { en: 'Complete', fa: 'تمام شد' },

  'phase.lead_rotation': { en: 'Pod Lead rotation + priority setting', fa: 'چرخش سرپرست پاد + تعیین اولویت‌ها' },
  'phase.lead_rotation.summary': {
    en: 'Pods elect their Pod Lead for this cycle and agree the cycle’s priorities.',
    fa: 'پادها سرپرست این چرخهٔ خود را انتخاب می‌کنند و بر اولویت‌های چرخه به توافق می‌رسند.',
  },
  'phase.execution': { en: 'Execution, automated weekly check-ins', fa: 'اجرا، همراه با چک‌این هفتگی خودکار' },
  'phase.execution.summary': {
    en: 'Delivery is running. Each pod logs a weekly check-in; blockers flag the coach.',
    fa: 'تحویل در جریان است. هر پاد هفته‌ای یک چک‌این ثبت می‌کند؛ مسدودی‌ها به کوچ اطلاع داده می‌شود.',
  },
  'phase.pitch': { en: 'Report drafting + final pitch submission', fa: 'نگارش گزارش + ثبت پیچ نهایی' },
  'phase.pitch.summary': {
    en: 'Pod Leads compile the cycle report and submit the final pitch before Day 85.',
    fa: 'سرپرستان پاد گزارش چرخه را تدوین و پیچ نهایی را پیش از روز ۸۵ ثبت می‌کنند.',
  },
  'phase.peer_review': { en: 'Peer review by rotating panel', fa: 'داوری همتایان با پنل چرخشی' },
  'phase.peer_review.summary': {
    en: 'Rotating peer validators score the submitted pitches.',
    fa: 'داوران همتای چرخشی به پیچ‌های ثبت‌شده امتیاز می‌دهند.',
  },
  'phase.results': { en: 'Results announced, budget allocated', fa: 'اعلام نتایج و تخصیص بودجه' },
  'phase.results.summary': {
    en: 'Scores are published, budgets are allocated, and the next cycle begins.',
    fa: 'امتیازها منتشر می‌شوند، بودجه‌ها تخصیص می‌یابند و چرخهٔ بعدی آغاز می‌شود.',
  },

  'milestone.pitches_due': {
    en: 'Pitches submitted to the Review Board',
    fa: 'ثبت پیچ‌ها نزد هیئت داوری',
  },
  'milestone.auto_submit': {
    en: 'Peer reviews auto-submitted (deadline)',
    fa: 'ثبت خودکار داوری‌های همتا (مهلت)',
  },
  'milestone.lock_window_opens': {
    en: 'Budget lock window opens (Day 89)',
    fa: 'باز شدن پنجرهٔ قفل بودجه (روز ۸۹)',
  },

  // --------------------------------------------------------------- pod ----
  'pod.holdingLeadCoach': {
    en: '{holding} · Lead {lead} · Coach {coach}',
    fa: '{holding} · سرپرست: {lead} · کوچ: {coach}',
  },
  'pod.tabOverview': { en: 'Overview', fa: 'نمای کلی' },
  'pod.tabMembers': { en: 'Members', fa: 'اعضا' },
  'pod.tabHistory': { en: 'Pitch History', fa: 'تاریخچهٔ پیچ' },
  'pod.tabCLOU': { en: 'CLOU Agreements', fa: 'توافق‌نامه‌های CLOU' },
  'pod.tabCoaching': { en: 'Coaching', fa: 'کوچینگ' },
  'pod.tabComingLater': {
    en: 'Arrives with its module in a later phase',
    fa: 'همراه با ماژول خودش در فاز بعدی می‌آید',
  },
  'pod.statusLabel': { en: 'Status', fa: 'وضعیت' },
  'pod.activePod': { en: 'Active pod', fa: 'پاد فعال' },
  'pod.entryTrial': { en: 'Entry trial', fa: 'دورهٔ آزمایشی ورود' },
  'pod.membersHint': {
    en: '{n} members, all on time-boxed seats.',
    fa: '{n} عضو، همگی روی جایگاه‌های زمان‌دار.',
  },
  'pod.unitScoreCard': { en: 'Unit Score — cycle 3', fa: 'امتیاز واحد — چرخهٔ ۳' },
  'pod.unitScoreHint': {
    en: 'Financial 40% · peer review 35% · strategic 25%.',
    fa: 'مالی ۴۰٪ · داوری همتایان ۳۵٪ · راهبردی ۲۵٪.',
  },
  'pod.provBudget': { en: 'Provisional budget', fa: 'بودجهٔ موقت' },
  'pod.provBudgetHint': {
    en: '{share}% of the pool, pending the lock window.',
    fa: '{share}٪ از استخر، در انتظار پنجرهٔ قفل.',
  },
  'pod.latestPitch': { en: 'Latest pitch', fa: 'آخرین پیچ' },
  'pod.health': { en: 'Health signal', fa: 'سیگنال سلامت' },
  'pod.healthNote': {
    en: 'The coach reads this signal every week; it informs — never overrides — the formula.',
    fa: 'کوچ هر هفته این سیگنال را می‌خواند؛ این سیگنال به فرمول اطلاع می‌دهد — هرگز جایگزینش نمی‌شود.',
  },
  'pod.seat': { en: '{seat} seat', fa: 'جایگاه {seat}' },
  'pod.since': { en: 'since {m}', fa: 'از {m}' },

  // ------------------------------------------------------------- review ---
  'review.h1': { en: 'Peer review & governance', fa: 'داوری همتایان و حکمرانی' },
  'review.sub': {
    en: 'Three separate processes live here: peer review, conflict resolution, and the two governance tracks. They share a building, not a state machine.',
    fa: 'سه فرایند مجزا اینجا زندگی می‌کنند: داوری همتایان، حل تعارض و دو مسیر حکمرانی. این‌ها یک ساختمان مشترک دارند، نه یک ماشین وضعیت.',
  },
  'review.peerH2': { en: 'Peer review', fa: 'داوری همتایان' },
  'review.peerAssigned': {
    en: '{n} pitch(es) assigned to you this cycle.',
    fa: '{n} پیچ در این چرخه به شما محول شده است.',
  },
  'review.windowClosed': {
    en: 'The review window (Days 86–88) is not open yet — auto-submit on Day 85.',
    fa: 'پنجرهٔ داوری (روزهای ۸۶–۸۸) هنوز باز نشده — ثبت خودکار در روز ۸۵.',
  },
  'review.conflictH2': { en: 'Conflict resolution', fa: 'حل تعارض' },
  'review.conflictAssigned': { en: '{n} open case(s) assigned to you.', fa: '{n} پروندهٔ باز به شما محول شده است.' },
  'review.govH2': { en: 'Governance tracks', fa: 'مسیرهای حکمرانی' },
  'review.govText': {
    en: 'Entry trial and accountability run on their own rails; neither borrows the other’s stages.',
    fa: 'دورهٔ آزمایشی ورود و پاسخ‌گویی روی ریل خودشان حرکت می‌کنند؛ هیچ‌کدام مراحل دیگری را قرض نمی‌گیرد.',
  },
  'review.cinderTrial': {
    en: 'Pod Cinder is in its entry trial — Day 41 of 90.',
    fa: 'پاد سیندر در دورهٔ آزمایشی ورود است — روز ۴۱ از ۹۰.',
  },
  'review.queue': { en: 'Your review queue', fa: 'صف داوری شما' },
  'review.openReview': { en: 'Open review', fa: 'باز کردن داوری' },
  'review.due': { en: '{stage} · due {date}', fa: '{stage} · مهلت: {date}' },
  'review.stageDraft': { en: 'Draft review', fa: 'داوری پیش‌نویس' },
  'review.stageSubmitted': { en: 'Submitted', fa: 'ثبت‌شده' },
  'review.tracks': { en: 'Pods and their tracks', fa: 'پادها و مسیرهایشان' },
  'review.podLink': { en: 'Pod', fa: 'پاد' },
  'review.caseStage': { en: 'Stage 4 — panel', fa: 'مرحلهٔ ۴ — پنل' },

  // ----------------------------------------------------------- coaching ---
  'coaching.h1': { en: 'Coaching', fa: 'کوچینگ' },
  'coaching.sub': {
    en: 'Coaching is guidance with a memory. Each coach keeps structured sessions, and every pod can see who their coach is and when the seat rotates. Private notes stay private — the archive can never hold them.',
    fa: 'کوچینگ راهنماییِ حافظه‌دار است. هر کوچ جلسات ساختاریافته نگه می‌دارد و هر پاد می‌داند کوچش کیست و جایگاه کوچ کی می‌چرخد. یادداشت‌های خصوصی، خصوصی می‌مانند — بایگانی هرگز نمی‌تواند آن‌ها را نگه دارد.',
  },
  'coaching.myCoach': { en: 'My Coach', fa: 'کوچ من' },
  'coaching.myCoachDesc': {
    en: 'Who coaches your pod, how to reach them, when they rotate, and the sessions they have shared with you.',
    fa: 'چه کسی کوچ پاد شماست، چطور در دسترس است، کی می‌چرخد و جلساتی که با شما به اشتراک گذاشته.',
  },
  'coaching.myCoachCta': { en: 'Open my coach', fa: 'باز کردن کوچ من' },
  'coaching.console': { en: 'Coaching Console', fa: 'کنسول کوچینگ' },
  'coaching.consoleDesc': {
    en: 'Your assigned pods, their health signals, the rotation countdown, and the sessions you log.',
    fa: 'پادهای محول‌شده به شما، سیگنال‌های سلامتشان، شمارش معکوس چرخش و جلساتی که ثبت می‌کنید.',
  },
  'coaching.consoleCta': { en: 'Open the console', fa: 'باز کردن کنسول' },
  'coaching.roster': { en: 'Coaching Roster', fa: 'فهرست کوچ‌ها' },
  'coaching.rosterDesc': {
    en: 'The hub view: every coach, their pod load, rotation windows, and coverage gaps.',
    fa: 'نمای هاب: همهٔ کوچ‌ها، بار پادهایشان، پنجره‌های چرخش و شکاف‌های پوشش.',
  },
  'coaching.rosterCta': { en: 'Open the roster', fa: 'باز کردن فهرست' },
  'coaching.coachedPods': { en: 'Coached pods in this showcase', fa: 'پادهای کوچ‌شده در این نمایش' },
  'coaching.coach': { en: 'Coach {name}', fa: 'کوچ: {name}' },

  // ------------------------------------------------------- notifications --
  'notifications.h1': { en: 'Notifications', fa: 'اعلان‌ها' },
  'notifications.unread': { en: '{n} unread', fa: '{n} خوانده‌نشده' },
  'notifications.caughtUp': { en: 'You are all caught up', fa: 'همه‌چیز را دیده‌اید' },
  'notifications.markAll': { en: 'Mark all read', fa: 'خواندن همه' },
  'notifications.tabAll': { en: 'All', fa: 'همه' },
  'notifications.tabAction': { en: 'Needs action ({n})', fa: 'نیازمند اقدام ({n})' },
  'notifications.open': { en: 'Open', fa: 'باز کردن' },
  'notifications.urgent': { en: 'Urgent', fa: 'فوری' },
  'notifications.high': { en: 'High', fa: 'مهم' },
  'notifications.info': { en: 'Info', fa: 'عادی' },
  'notifications.agoHours': { en: '{n}h ago', fa: '{n} ساعت پیش' },
  'notifications.agoDays': { en: '{n}d ago', fa: '{n} روز پیش' },
  'notifications.new': { en: 'New', fa: 'جدید' },
  'notifications.prefsH2': { en: 'How you hear about things', fa: 'چطور باخبر می‌شوید' },
  'notifications.prefsSub': {
    en: 'Choose the channels for each urgency. Urgent items always reach you in-app — that row cannot be turned off.',
    fa: 'برای هر سطح فوریت کانال‌ها را انتخاب کنید. موارد فوری همیشه درون‌برنامه‌ای می‌رسند — این ردیف قابل خاموش شدن نیست.',
  },
  'notifications.colUrgency': { en: 'Urgency', fa: 'فوریت' },
  'notifications.colInApp': { en: 'In-app', fa: 'درون‌برنامه' },
  'notifications.colEmail': { en: 'Email digest', fa: 'خلاصهٔ ایمیلی' },
  'notifications.colPush': { en: 'Push', fa: 'پوش' },
  'notifications.channelAlways': { en: 'always', fa: 'همیشه' },
  'notifications.channelYes': { en: 'yes', fa: 'بله' },
  'notifications.channelOn': { en: 'on', fa: 'روشن' },
  'notifications.channelOff': { en: 'off', fa: 'خاموش' },
  'notifications.channelDaily': { en: 'daily', fa: 'روزانه' },

  'notification.n1.title': {
    en: 'Peer review window closes in 3 days',
    fa: 'پنجرهٔ داوری همتایان ۳ روز دیگر بسته می‌شود',
  },
  'notification.n1.body': {
    en: 'Reviews for cycle 3 auto-submit on Day 85. Two of your assigned reviews are still drafts.',
    fa: 'داوری‌های چرخهٔ ۳ در روز ۸۵ به‌صورت خودکار ثبت می‌شوند. دو داوری محول‌شده به شما هنوز پیش‌نویس‌اند.',
  },
  'notification.n2.title': { en: 'Pod Dune accounting sync failed', fa: 'همگام‌سازی حسابداری پاد دون ناموفق بود' },
  'notification.n2.body': {
    en: 'The connector returned stale figures for the second consecutive day. Dune’s financial component is flagged.',
    fa: 'کانکتور برای دومین روز پیاپی ارقام قدیمی برگرداند. جزء مالی پاد دون پرچم خورده است.',
  },
  'notification.n3.title': { en: 'Coaching session scheduled', fa: 'جلسهٔ کوچینگ زمان‌بندی شد' },
  'notification.n3.body': {
    en: 'Cora Coach scheduled a check-in with Pod Atlas for Thursday.',
    fa: 'کورای کوچ یک چک‌این با پاد اطلس برای پنجشنبه تنظیم کرده است.',
  },
  'notification.n4.title': { en: 'Budget calculation ran', fa: 'محاسبهٔ بودجه اجرا شد' },
  'notification.n4.body': {
    en: 'Cycle 3 budget was computed: pool 1,840,000,000 across 5 pods. Provisional until the lock window.',
    fa: 'بودجهٔ چرخهٔ ۳ محاسبه شد: استخر ۱٬۸۴۰٬۰۰۰٬۰۰۰ بین ۵ پاد. تا پنجرهٔ قفل، موقت است.',
  },
  'notification.n5.title': { en: 'Pitch submitted — Pod Basalt', fa: 'پیچ ثبت شد — پاد بازالت' },
  'notification.n5.body': {
    en: 'Basalt submitted its cycle 3 pitch to the Review Board.',
    fa: 'بازالت پیچ چرخهٔ ۳ خود را نزد هیئت داوری ثبت کرد.',
  },

  // ------------------------------------------------------------ archive ---
  'archive.kicker': { en: 'Module 10', fa: 'ماژول ۱۰' },
  'archive.h1': { en: 'Archive & organizational memory', fa: 'بایگانی و حافظهٔ سازمانی' },
  'archive.sub': {
    en: 'An index of every durable decision, not a copy of it. Results deep-link to the module of origin, and private coaching notes are structurally impossible here — so what you search is always what the org agreed to remember.',
    fa: 'نمایه‌ای از هر تصمیم ماندگار، نه کپی آن. نتایج به ماژول مبدأ لینک عمیق دارند و یادداشت‌های خصوصی کوچینگ ساختاراً اینجا ممکن نیستند — پس آنچه جست‌وجو می‌کنید همیشه همان چیزی است که سازمان توافق کرده به یاد بیاورد.',
  },
  'archive.decisions': { en: 'Decisions', fa: 'تصمیم‌ها' },
  'archive.decisionsDesc': {
    en: 'Search the index of pitches, agreements, budget locks, governance records and lessons. Every result links to its source.',
    fa: 'در نمایهٔ پیچ‌ها، توافق‌نامه‌ها، قفل‌های بودجه، سوابق حکمرانی و درس‌ها جست‌وجو کنید. هر نتیجه به منبعش لینک است.',
  },
  'archive.decisionsCta': { en: 'Search the archive', fa: 'جست‌وجو در بایگانی' },
  'archive.lessons': { en: 'Lessons learned', fa: 'درس‌آموخته‌ها' },
  'archive.lessonsDesc': {
    en: 'What we would do differently, written once and searchable forever. Anyone in the org can add one.',
    fa: 'کارهایی که طور دیگری انجام می‌دادیم؛ یک‌بار نوشته و برای همیشه قابل جست‌وجو. هر کسی در سازمان می‌تواند یکی اضافه کند.',
  },
  'archive.lessonsCta': { en: 'Read & record lessons', fa: 'خواندن و ثبت درس‌ها' },
  'archive.activity': { en: 'Activity', fa: 'فعالیت' },
  'archive.activityDesc': {
    en: 'Everything the archive has recorded, newest first. Optionally scoped to one pod.',
    fa: 'هرچه بایگانی ثبت کرده، از جدیدترین. در صورت نیاز محدود به یک پاد.',
  },
  'archive.activityCta': { en: 'See the activity feed', fa: 'دیدن فید فعالیت' },
  'archive.index': { en: 'Decisions index — sample', fa: 'نمایهٔ تصمیم‌ها — نمونه' },
  'archive.filter': { en: 'Filter by type, pod or date…', fa: 'فیلتر بر اساس نوع، پاد یا تاریخ…' },
  'archive.type.budget_cycle': { en: 'Budget cycle', fa: 'چرخهٔ بودجه' },
  'archive.type.pitch': { en: 'Pitch', fa: 'پیچ' },
  'archive.type.accountability_case': { en: 'Governance case', fa: 'پروندهٔ حکمرانی' },
  'archive.type.rule_change': { en: 'Rule change', fa: 'تغییر قانون' },
  'archive.type.lesson': { en: 'Lesson', fa: 'درس' },

  'archiveEntry.a1.title': { en: 'Cycle 2 budget locked', fa: 'بودجهٔ چرخهٔ ۲ قفل شد' },
  'archiveEntry.a1.summary': {
    en: 'Pool 1,760,000,000 · 5 pods · Atlas 21.9% · locked Day 89',
    fa: 'استخر ۱٬۷۶۰٬۰۰۰٬۰۰۰ · ۵ پاد · اطلس ۲۱٫۹٪ · قفل در روز ۸۹',
  },
  'archiveEntry.a2.title': { en: 'Pod Atlas — cycle 2 pitch', fa: 'پاد اطلس — پیچ چرخهٔ ۲' },
  'archiveEntry.a2.summary': {
    en: 'Kept the payments-reconciliation focus; asked for one additional seat.',
    fa: 'تمرکز بر تطبیق پرداخت‌ها حفظ شد؛ یک جایگاه اضافه درخواست شد.',
  },
  'archiveEntry.a3.title': { en: 'Case AC-004 — escalated', fa: 'پروندهٔ AC-004 — ارجاع شد' },
  'archiveEntry.a3.summary': {
    en: 'Conflict between two Atlas members moved to stage 4; panel constituted.',
    fa: 'تعارض بین دو عضو اطلس به مرحلهٔ ۴ رفت؛ پنل تشکیل شد.',
  },
  'archiveEntry.a4.title': { en: 'Cap fraction confirmed at 25%', fa: 'سهم سقف روی ۲۵٪ تثبیت شد' },
  'archiveEntry.a4.summary': {
    en: 'Architecture rule re-affirmed for cycle 3 after a proposed change was rejected.',
    fa: 'قانون معماری برای چرخهٔ ۳ دوباره تأیید شد، پس از رد یک تغییر پیشنهادی.',
  },
  'archiveEntry.a5.title': {
    en: 'Lesson — onboarding new members mid-cycle',
    fa: 'درس — عضوگیری اعضای جدید در میانهٔ چرخه',
  },
  'archiveEntry.a5.summary': {
    en: 'Basalt recorded what slowed a mid-cycle onboarding and how the checklist changed.',
    fa: 'بازالت ثبت کرد چه چیزی عضوگیری میان‌چرخه را کند کرد و چک‌لیست چگونه تغییر کرد.',
  },

  // --------------------------------------------------------------- hub ----
  'hub.h1': { en: 'Hub Console', fa: 'کنسول هاب‌ها' },
  'hub.sub': {
    en: 'Company X’s four hubs. This console launches, tracks and reports — it never edits a pod’s score, budget or governance outcome.',
    fa: 'چهار هاب شرکت ایکس. این کنسول راه‌اندازی، ردیابی و گزارش می‌کند — هرگز امتیاز، بودجه یا نتیجهٔ حکمرانی یک پاد را ویرایش نمی‌کند.',
  },
  'hub.restricted': {
    en: 'You are viewing the console as {role}. Hub sections below show sample data; in the live product, seats without hub roles see a notice instead.',
    fa: 'شما کنسول را در نقش {role} می‌بینید. بخش‌های هاب در زیر دادهٔ نمونه نشان می‌دهند؛ در نسخهٔ زنده، جایگاه‌های بدون نقش هاب یک اطلاعیه می‌بینند.',
  },
  'hub.arch': { en: 'Architecture Hub', fa: 'هاب معماری' },
  'hub.archDesc': {
    en: 'Rule versioning and the model’s health — what governs, and what is about to change.',
    fa: 'نسخه‌بندی قوانین و سلامت مدل — آنچه حکمرانی می‌کند و آنچه در شرف تغییر است.',
  },
  'hub.rules': { en: '{n} versioned rules', fa: '{n} قانون نسخه‌بندی‌شده' },
  'hub.pending': { en: '{n} pending change(s)', fa: '{n} تغییر در انتظار' },
  'hub.deploy': { en: 'Deployment Hub', fa: 'هاب استقرار' },
  'hub.deployDesc': {
    en: 'The only door new pods come through — and the trial tracker that follows each one to Day 90.',
    fa: 'تنها دری که پادهای جدید از آن وارد می‌شوند — و ردیاب دورهٔ آزمایشی که هرکدام را تا روز ۹۰ دنبال می‌کند.',
  },
  'hub.trial': { en: '1 pod in trial — Cinder, Day 41', fa: '۱ پاد در دورهٔ آزمایشی — سیندر، روز ۴۱' },
  'hub.pilots': { en: '2 pilots running', fa: '۲ پایلوت در حال اجرا' },
  'hub.coaching': { en: 'Coaching Hub', fa: 'هاب کوچینگ' },
  'hub.coachingDesc': {
    en: 'Roster, rotation windows and coverage — every pod coached, no pod over-coached.',
    fa: 'فهرست کوچ‌ها، پنجره‌های چرخش و پوشش — هر پاد کوچ دارد، هیچ پادی بیش‌ازحد کوچ نمی‌شود.',
  },
  'hub.coverage': { en: '2 coaches · 5 pods covered', fa: '۲ کوچ · پوشش ۵ پاد' },
  'hub.rotateSoon': { en: 'Cora rotates in 27 days', fa: 'چرخش کورا ۲۷ روز دیگر' },
  'hub.strategic': { en: 'Strategic Interactions Hub', fa: 'هاب تعاملات راهبردی' },
  'hub.strategicDesc': {
    en: 'Investor-facing reporting and the themes pods align their pitches to.',
    fa: 'گزارش‌دهی رو به سرمایه‌گذار و محورهایی که پادها پیچ‌هایشان را با آن هم‌راستا می‌کنند.',
  },
  'hub.draftReport': { en: '1 draft investor report', fa: '۱ گزارش سرمایه‌گذار پیش‌نویس' },
  'hub.published': { en: 'Q3 report published', fa: 'گزارش سه‌ماههٔ سوم منتشر شد' },
  'hub.notAdmin': { en: 'What this console deliberately is not', fa: 'این کنسول عمداً چه چیزی نیست' },
  'hub.notAdminText': {
    en: 'There is no “admin override” here. A hub can start a trial, publish a report or propose a rule — but it cannot edit a pod’s score, budget or governance outcome. Those change only through their own modules, with an audit trail.',
    fa: 'اینجا هیچ «دسترسی ادمین» وجود ندارد. هاب می‌تواند دورهٔ آزمایشی شروع کند، گزارش منتشر کند یا قانونی پیشنهاد دهد — اما نمی‌تواند امتیاز، بودجه یا نتیجهٔ حکمرانی پادی را ویرایش کند. آن‌ها فقط از طریق ماژول‌های خودشان و با ردپای حسابرسی تغییر می‌کنند.',
  },

  // ----------------------------------------------------------- investor ---
  'investor.h1': { en: 'Investor reporting', fa: 'گزارش‌دهی سرمایه‌گذار' },
  'investor.sub': {
    en: 'Investors see what the Strategic Interactions Hub publishes — never raw coaching notes or draft scores. This is the Q3 report for Holding Pars.',
    fa: 'سرمایه‌گذاران آنچه هاب تعاملات راهبردی منتشر می‌کند را می‌بینند — هرگز یادداشت‌های خام کوچینگ یا امتیازهای پیش‌نویس را نه. این گزارش سه‌ماههٔ سوم هلدینگ پارس است.',
  },
  'investor.pool': { en: 'Cycle 3 pool', fa: 'استخر چرخهٔ ۳' },
  'investor.poolHint': {
    en: 'Set by the Architecture Hub, divided by formula.',
    fa: 'تعیین‌شده توسط هاب معماری، تقسیم‌شده با فرمول.',
  },
  'investor.podsPars': { en: 'Pods in Holding Pars', fa: 'پادهای هلدینگ پارس' },
  'investor.podsParsHint': { en: 'Atlas, Basalt and Cinder.', fa: 'اطلس، بازالت و سیندر.' },
  'investor.avgScore': { en: 'Average Unit Score', fa: 'میانگین امتیاز واحد' },
  'investor.avgScoreHint': {
    en: 'Across the five pods, up from 68.4 in cycle 2.',
    fa: 'در بین پنج پاد؛ بالاتر از ۶۸٫۴ در چرخهٔ ۲.',
  },
  'investor.daysLeft': { en: 'Days of cycle left', fa: 'روزهای باقی‌ماندهٔ چرخه' },
  'investor.daysLeftHint': {
    en: 'Results announced Days 89–90.',
    fa: 'نتایج در روزهای ۸۹–۹۰ اعلام می‌شود.',
  },
  'investor.holdings': { en: 'Your holdings', fa: 'هلدینگ‌های شما' },
  'investor.holdingMeta': {
    en: '{n} pods · {amount} provisional',
    fa: '{n} پاد · {amount} موقت',
  },
  'investor.current': { en: 'Reporting current', fa: 'گزارش‌دهی به‌روز' },
  'investor.reports': { en: 'Published reports', fa: 'گزارش‌های منتشرشده' },
  'investor.q3': { en: 'Q3 2026 — Holding Pars', fa: 'سه‌ماههٔ سوم ۲۰۲۶ — هلدینگ پارس' },
  'investor.q3Meta': { en: 'Published 2026-09-15 · Strategic Hub', fa: 'منتشرشده در ۲۴ شهریور ۱۴۰۵ · هاب راهبردی' },
  'investor.q4': { en: 'Q4 2026 — Holding Pars', fa: 'سه‌ماههٔ چهارم ۲۰۲۶ — هلدینگ پارس' },
  'investor.q4Meta': {
    en: 'In draft · not visible to investors yet',
    fa: 'در حال پیش‌نویس · هنوز برای سرمایه‌گذاران قابل مشاهده نیست',
  },
  'investor.published': { en: 'Published', fa: 'منتشرشده' },
  'investor.draft': { en: 'Draft', fa: 'پیش‌نویس' },
  'investor.footer1': {
    en: 'Full calculation behind these numbers:',
    fa: 'محاسبهٔ کامل پشت این اعداد:',
  },
  'investor.footer2': { en: '.', fa: '.' },

  // --------------------------------------------------------- agreements ---
  'agreements.h1': { en: 'CLOU agreements', fa: 'توافق‌نامه‌های CLOU' },
  'agreements.sub': {
    en: 'Cloud Operating-Level Undertakings — the contracts between pods. Two pods are connected if and only if a live CLOU exists between them.',
    fa: 'تفاهم‌نامه‌های عملیاتی ابری (CLOU) — قراردادهای بین پادها. دو پاد فقط و فقط وقتی به هم متصل‌اند که یک CLOU معتبر بینشان وجود داشته باشد.',
  },
  'agreements.filterPod': { en: 'Pod', fa: 'پاد' },
  'agreements.allPods': { en: 'All pods', fa: 'همهٔ پادها' },
  'agreements.filterStatus': { en: 'Status', fa: 'وضعیت' },
  'agreements.anyStatus': { en: 'Any status', fa: 'هر وضعیتی' },
  'agreements.statusActive': { en: 'Active', fa: 'فعال' },
  'agreements.statusRenegotiating': { en: 'Under renegotiation', fa: 'در حال مذاکرهٔ مجدد' },
  'agreements.statusProposed': { en: 'Awaiting response', fa: 'در انتظار پاسخ' },
  'agreements.apply': { en: 'Apply', fa: 'اعمال' },
  'agreements.list': { en: 'List view', fa: 'نمای فهرست' },
  'agreements.graph': { en: 'Network graph view', fa: 'نمای گراف شبکه' },
  'agreements.colName': { en: 'Agreement name', fa: 'نام توافق‌نامه' },
  'agreements.colPodA': { en: 'Pod A', fa: 'پاد الف' },
  'agreements.colPodB': { en: 'Pod B', fa: 'پاد ب' },
  'agreements.colService': { en: 'Service description', fa: 'شرح خدمت' },
  'agreements.colStatus': { en: 'Status', fa: 'وضعیت' },
  'agreements.colRenewal': { en: 'Renewal date', fa: 'تاریخ تمدید' },
  'agreements.footer': {
    en: 'Dashed lines to the centre are not agreements — they are the platform and budget market, which every pod shares. A direct line between two pods always means a live CLOU.',
    fa: 'خط‌چین‌ها به مرکز توافق‌نامه نیستند — پلتفرم و بازار بودجه‌اند که هر پادی در آن شریک است. خط مستقیم بین دو پاد همیشه یعنی یک CLOU معتبر.',
  },
  'agreements.hubLabel': { en: 'Platform & Budget Market', fa: 'پلتفرم و بازار بودجه' },
  'agreements.hubSub': { en: 'shared by every pod', fa: 'مشترک میان همهٔ پادها' },
  'agreements.legend': {
    en: 'Amber = in force, but under renegotiation.',
    fa: 'کهربایی = معتبر، اما در حال مذاکرهٔ مجدد.',
  },
  'agreements.legendSolid': {
    en: 'Solid arrow = a real CLOU. The arrowhead points from the serving pod to the pod being served.',
    fa: 'فلش توپُر = یک CLOU واقعی. نوک فلش از پاد خدمت‌دهنده به پاد خدمت‌گیرنده اشاره می‌کند.',
  },
  'agreements.legendDotted': {
    en: 'Dotted line = shared infrastructure only. These pods use the same platform and budget market but exchange nothing directly.',
    fa: 'خط‌چین = فقط زیرساخت مشترک. این پادها از یک پلتفرم و بازار بودجه استفاده می‌کنند اما مستقیماً چیزی ردوبدل نمی‌کنند.',
  },
  'agreements.noClou': { en: 'no direct CLOU', fa: 'بدون CLOU مستقیم' },
  'agreements.summary': {
    en: '{pods} pods. {edges} direct agreement(s) in force.',
    fa: '{pods} پاد. {edges} توافق‌نامهٔ مستقیم معتبر.',
  },

  'agreement.ag1': { en: 'Reconciliation data feed', fa: 'خوراک دادهٔ تطبیق' },
  'agreement.ag1.desc': {
    en: 'Basalt streams normalised transaction data to Atlas nightly.',
    fa: 'بازالت هر شب دادهٔ تراکنش‌های نرمال‌شده را به اطلس ارسال می‌کند.',
  },
  'agreement.ag2': { en: 'Shared QA environment', fa: 'محیط تست مشترک' },
  'agreement.ag2.desc': {
    en: 'Cinder maintains the staging cluster both pods deploy into.',
    fa: 'سیندر کلاستر استیجینگی را که هر دو پاد در آن دیپلوی می‌کنند نگهداری می‌کند.',
  },
  'agreement.ag3': { en: 'Incident escalation channel', fa: 'کانال ارجاع رخداد' },
  'agreement.ag3.desc': {
    en: 'Joint on-call rota for payment-rail incidents.',
    fa: 'شیفت آن‌کال مشترک برای رخدادهای مسیر پرداخت.',
  },

  // -------------------------------------------------- pod sample content --
  'member.seatDelivery': { en: 'Delivery', fa: 'تحویل' },
  'member.seatQuality': { en: 'Quality', fa: 'کیفیت' },
  'member.seatClient': { en: 'Client Interface', fa: 'رابط مشتری' },

  'pitch.c3.title': {
    en: 'Extend the reconciliation engine to two new banks',
    fa: 'گسترش موتور تطبیق به دو بانک جدید',
  },
  'pitch.c3.summary': {
    en: 'Keep the core team, add one integration seat. Review Board verdict: accepted with one condition (a clearer test plan).',
    fa: 'حفظ تیم اصلی و افزودن یک جایگاه یکپارچه‌سازی. رأی هیئت داوری: پذیرش با یک شرط (طراحی شفاف‌تر برای تست).',
  },
  'pitch.c2.title': { en: 'Payments reconciliation — phase two', fa: 'تطبیق پرداخت‌ها — فاز دوم' },
  'pitch.c2.summary': {
    en: 'Kept the focus from cycle 1 and asked for one additional seat. Verdict: accepted.',
    fa: 'تمرکز چرخهٔ ۱ حفظ شد و یک جایگاه اضافه درخواست شد. رأی: پذیرفته شد.',
  },
  'pitch.c1.title': { en: 'Stand up the reconciliation pod', fa: 'راه‌اندازی پاد تطبیق' },
  'pitch.c1.summary': {
    en: 'Founding pitch. Verdict: accepted — entry trial granted.',
    fa: 'پیچ تأسیس. رأی: پذیرفته شد — دورهٔ آزمایشی ورود اعطا شد.',
  },
  'pitch.accepted': { en: 'accepted', fa: 'پذیرفته‌شده' },
  'pitch.cycle': { en: 'Cycle {n} · submitted {date}', fa: 'چرخهٔ {n} · ثبت‌شده در {date}' },

  // review queue sample
  'review.queue.dune': { en: 'Seasonal staff-scheduling tool', fa: 'ابزار زمان‌بندی کارکنان فصلی' },
  'review.queue.ember': {
    en: 'Vendor-payment reconciliation, phase 2',
    fa: 'تطبیق پرداخت‌های تأمین‌کنندگان، فاز ۲',
  },
  'review.case.summary': {
    en: 'Conflict between two Atlas members over delivery ownership; panel constituted.',
    fa: 'تعارض بین دو عضو اطلس بر سر مالکیت تحویل؛ پنل تشکیل شد.',
  },

  // provenance chrome
  'provenance.aria': { en: 'Where this number comes from', fa: 'این عدد از کجا می‌آید' },
  'provenance.source': { en: 'Calculated from', fa: 'محاسبه‌شده از' },
  'provenance.updated': { en: 'Last updated', fa: 'آخرین به‌روزرسانی' },
  'provenance.formula': { en: 'Formula', fa: 'فرمول' },
} as const;

export type StringKey = keyof typeof S;

export const STRINGS: Record<StringKey, StringPair> = S;
