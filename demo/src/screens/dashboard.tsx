/**
 * Dashboard — the organisation at a glance: seats with rotation countdowns,
 * the pod list and the sign-in summary. Fully bilingual.
 */
import Link from '../shims/link';
import { StatusChip, podStatusTone } from '../../../components/ui/StatusChip';
import { computeRotation } from '../../../core/rotation';
import { DataCardI18n, RotationBadgeI18n, rotationLabelI18n } from '../components/primitives';
import { PODS, TODAY, type Persona } from '../data';
import { useI18n } from '../i18n';
import { useNames } from '../i18n/names';

export function DashboardScreen({ persona }: { persona: Persona }) {
  const { t, num, date } = useI18n();
  const names = useNames();

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl text-ink-950">{t('dashboard.h1')}</h1>
        <p className="mt-1 max-w-prose text-sm text-slate-500">
          {t('dashboard.signedIn', { name: names.personName(persona.fullName), role: t(persona.roleKey) })}
        </p>
      </header>

      <section className="panel-hero mb-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-white/70">{t('shell.cycleStatus')}</p>
            <p className="mt-1 font-display text-xl text-white">
              {t('dashboard.heroTitle', { name: names.personName(persona.fullName) })}
            </p>
          </div>
          <div className="w-full max-w-56">
            <div className="flex items-baseline justify-between text-xs text-white/80">
              <span>{t('calendar.dayShort', { day: num(62) })}</span>
              <span>{t('calendar.dayShort', { day: num(90) })}</span>
            </div>
            <div className="hero-progress mt-1 h-2">
              <span style={{ width: '68.9%' }} />
            </div>
            <p className="tabular mt-1 text-end text-2xs text-white/70">
              {t('dashboard.heroProgress', { n: num(28) })}
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <DataCardI18n
            label={t('dashboard.activeRoles')}
            value={num(persona.rotation.length)}
            unit={persona.rotation.length === 1 ? t('dashboard.seat') : t('dashboard.seats')}
            tone="good"
            hint={t('dashboard.rolesHint')}
            provenance={{
              source: t('dashboard.provSourceRoles'),
              updatedAt: date(TODAY),
              formula: t('dashboard.provFormulaRoles'),
              reference: '01-INFORMATION-ARCHITECTURE.md §3',
            }}
          />
        </div>

        <div className="lg:col-span-4">
          <DataCardI18n
            label={t('dashboard.pods')}
            value={num(persona.podIds.length)}
            tone={persona.podIds.length > 0 ? 'active' : 'neutral'}
            hint={
              persona.podIds.length > 0
                ? persona.podIds.map((id) => names.podName(id)).join(t('lang.listSep'))
                : t('dashboard.hubSeatsHint')
            }
          />
        </div>

        <div className="lg:col-span-3">
          <DataCardI18n
            label={t('dashboard.cycle')}
            value={t('dashboard.day62')}
            unit={t('dashboard.of90')}
            tone="active"
            hint={t('dashboard.cycleHint')}
          />
        </div>

        <section className="lg:col-span-7">
          <h2 className="mb-2 text-sm font-medium text-ink-700">{t('dashboard.yourSeats')}</h2>
          <ul className="space-y-2">
            {persona.rotation.map((seat) => {
              const info = computeRotation(seat.start, seat.end, TODAY);
              const seatLabel = names.seat(seat.seatKey);
              return (
                <li
                  key={seat.seatKey}
                  className="flex flex-wrap items-center justify-between gap-2 border border-line-200 bg-white px-3 py-2"
                >
                  <RotationBadgeI18n
                    role={seatLabel}
                    info={info}
                    label={rotationLabelI18n(info, t, num)}
                  />
                  <span className="tabular text-xs text-slate-500">
                    {t('dateRange', { a: date(seat.start), b: date(seat.end) })}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="lg:col-span-5">
          <h2 className="mb-2 text-sm font-medium text-ink-700">{t('dashboard.podsInOrg')}</h2>
          <ul className="space-y-2">
            {PODS.map((pod) => (
              <li
                key={pod.id}
                className="flex items-center justify-between gap-2 border border-line-200 bg-white px-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-ink-950">{names.podName(pod.id)}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {names.holdingByName(pod.holdingName)} ·{' '}
                    {t('dashboard.members', { n: num(pod.memberCount) })}
                  </span>
                </span>
                <StatusChip tone={podStatusTone(pod.status)} label={names.status(pod.status)} />
              </li>
            ))}
          </ul>
        </section>

        <section className="lg:col-span-12">
          <div className="panel panel-dashed p-4">
            <h2 className="text-sm font-medium text-ink-700">{t('dashboard.next')}</h2>
            <p className="mt-1 max-w-prose text-sm text-slate-500">
              {t('dashboard.nextPrefix')}{' '}
              <Link href="/budget" className="text-signal-600 underline">
                {t('dashboard.nextBudget')}
              </Link>{' '}
              {t('dashboard.nextMid1')}{' '}
              <Link href="/calendar" className="text-signal-600 underline">
                {t('dashboard.nextCalendar')}
              </Link>{' '}
              {t('dashboard.nextMid2')}{' '}
              <Link href="/hub" className="text-signal-600 underline">
                {t('dashboard.nextHub')}
              </Link>{' '}
              {t('dashboard.nextSuffix')}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
