/**
 * Localised-name helpers — pods, holdings, seats, statuses, people and
 * archive actors all have Persian counterparts.
 */
import { useI18n } from './index';
import type { StringKey } from './translations';

/** Persian spellings for the sample people (English names pass through). */
const PERSON_FA: Record<string, string> = {
  'Lena Lead': 'لنا لید',
  'Cora Coach': 'کورای کوچ',
  'Ari Architect': 'آری معمار',
  'Sana Strategic': 'سانا راهبردی',
  'Ilyas Investor': 'الیاس سرمایه‌گذار',
  'Ramin Roshan': 'رامین روشن',
  'Vana Nouri': 'وانا نوری',
  'Omid Farahani': 'امید فراهانی',
  'Nima Bashiri': 'نیما بشیری',
  'Darvish Coach': 'درویش کوچ',
  'Mara Voss': 'مارا وس',
  'Kian Tehrani': 'کیان تهرانی',
  'Sasha Reid': 'ساشا رید',
  'Noor Haddad': 'نور حداد',
  'Emil Sørensen': 'امیل سورنسن',
  'Priya Anand': 'پریا آناند',
  'Tomás Reyes': 'توماس ریس',
};

const ACTOR_FA: Record<string, string> = {
  'Architecture Hub': 'هاب معماری',
  'Pod Atlas': 'پاد اطلس',
  'Pod Basalt': 'پاد بازالت',
};

export function useNames() {
  const { t, lang } = useI18n();

  return {
    lang,
    podName: (podId: string): string => t(`pod.${podId}` as StringKey),
    holdingById: (holdingId: string): string => t(`holding.${holdingId}` as StringKey),
    holdingByName: (name: string): string =>
      name === 'Holding Pars' ? t('holding.holding-pars') : t('holding.holding-dena'),
    seat: (seatKey: string): string => t(seatKey as StringKey),
    status: (status: string): string =>
      status === 'active' ? t('status.active') : t('status.trial'),
    signal: (level: 'green' | 'amber' | 'red'): string =>
      t(`signal.${level}` as StringKey),
    /** Person display name — Persian spelling in fa mode. */
    personName: (name: string): string =>
      lang === 'fa' ? PERSON_FA[name] ?? name : name,
    /** Archive actor labels. */
    actor: (actor: string): string =>
      lang === 'fa' ? ACTOR_FA[actor] ?? actor : actor,
  };
}
