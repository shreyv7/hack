import { useCallback, useEffect, useState } from 'react';
import { notify } from '@/app/utils/notify';
import {
  DEFAULT_NEW_PROVIDER,
  defaultProviderNameForChannel,
  type NewProviderForm,
} from '@/app/components/notice-delivery/ProviderCredentialFields';
import {
  noticeDeliveryApi,
  type DpNotificationAutoConfig,
  type NoticeDeliveryProvider,
} from '@/lib/api/noticeDelivery';

export function useNoticeDeliveryProviders(orgIdParam?: string, enabled = true) {
  const [providers, setProviders] = useState<NoticeDeliveryProvider[]>([]);
  const [autoConfig, setAutoConfig] = useState<DpNotificationAutoConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newProvider, setNewProvider] = useState<NewProviderForm>(DEFAULT_NEW_PROVIDER);
  const [testingProviderId, setTestingProviderId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { success: boolean; message: string }>>(
    {},
  );

  const reload = useCallback(async () => {
    if (!enabled) {
      setProviders([]);
      setAutoConfig(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [providerList, config] = await Promise.all([
        noticeDeliveryApi.fetchProviders(orgIdParam),
        noticeDeliveryApi.fetchDpNotificationConfig(orgIdParam),
      ]);
      setProviders(providerList);
      setAutoConfig(config);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load provider adapters');
      setProviders([]);
      setAutoConfig(null);
    } finally {
      setLoading(false);
    }
  }, [enabled, orgIdParam]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const createProvider = useCallback(
    async (event?: { preventDefault: () => void }) => {
      event?.preventDefault();
      if (!newProvider.provider_name) return;
      try {
        await noticeDeliveryApi.createProvider(newProvider, orgIdParam);
        notify('Provider adapter saved.');
        setNewProvider(DEFAULT_NEW_PROVIDER);
        await reload();
      } catch (err) {
        notify(err instanceof Error ? err.message : 'Failed to save provider adapter');
      }
    },
    [newProvider, orgIdParam, reload],
  );

  const toggleProvider = useCallback(
    async (provider: NoticeDeliveryProvider) => {
      try {
        await noticeDeliveryApi.updateProvider(provider.id, { is_active: !provider.is_active });
        notify('Provider status updated.');
        await reload();
      } catch (err) {
        notify(err instanceof Error ? err.message : 'Failed to update provider');
      }
    },
    [reload],
  );

  const testProvider = useCallback(async (providerId: string) => {
    setTestingProviderId(providerId);
    try {
      const res = await noticeDeliveryApi.testProvider(providerId);
      setTestResult((prev) => ({
        ...prev,
        [providerId]: { success: res.success, message: res.message },
      }));
      notify(res.success ? 'Connection test succeeded!' : `Connection test failed: ${res.message}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Request failed';
      setTestResult((prev) => ({
        ...prev,
        [providerId]: { success: false, message },
      }));
      notify('Connection test failed.');
    } finally {
      setTestingProviderId(null);
    }
  }, []);

  const setChannel = useCallback((channel: string) => {
    setNewProvider({
      channel,
      provider_name: defaultProviderNameForChannel(channel),
      is_active: true,
      config: {},
    });
  }, []);

  return {
    providers,
    autoConfig,
    loading,
    error,
    newProvider,
    setNewProvider,
    setChannel,
    createProvider,
    toggleProvider,
    testProvider,
    testingProviderId,
    testResult,
    reload,
  };
}
