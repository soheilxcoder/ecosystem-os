/**
 * Localised-name helpers — pods, holdings, seats and statuses all have
 * Persian counterparts in the translation table.
 */
import { useI18n } from './index';
import type { StringKey } from './translations';

export function useNames() {
  const { t } = useI18n();

  return {
    podName: (podId: string): string => t(`pod.${podId}` as StringKey),
    holdingById: (holdingId: string): string => t(`holding.${holdingId}` as StringKey),
    holdingByName: (name: string): string =>
      name === 'Holding Pars' ? t('holding.holding-pars') : t('holding.holding-dena'),
    seat: (seatKey: string): string => t(seatKey as StringKey),
    status: (status: string): string =>
      status === 'active' ? t('status.active') : t('status.trial'),
  };
}
