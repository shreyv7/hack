/**
 * useAccessModal
 *
 * Lightweight state hook for triggering the AccessRestrictedModal imperatively
 * from within page components (e.g., GovernanceDashboardPage inline permission
 * checks that previously used notify()).
 *
 * Usage:
 *   const { modalProps, open, isOpen } = useAccessModal();
 *   // inside a handler:
 *   open({ featureName: 'Dashboard Sharing', allowedRoles: ['admin', 'superadmin'] });
 *   // in JSX:
 *   {isOpen && <AccessRestrictedModal {...modalProps} onDismiss={close} />}
 */
import { useState, useCallback } from 'react';
import type { UserRole } from '@/types/auth';

interface ModalConfig {
  featureName: string;
  allowedRoles: UserRole[];
}

interface UseAccessModalReturn {
  isOpen: boolean;
  modalProps: ModalConfig;
  open: (config: ModalConfig) => void;
  close: () => void;
}

const DEFAULT_CONFIG: ModalConfig = { featureName: '', allowedRoles: [] };

export function useAccessModal(): UseAccessModalReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<ModalConfig>(DEFAULT_CONFIG);

  const open = useCallback((newConfig: ModalConfig) => {
    setConfig(newConfig);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  return { isOpen, modalProps: config, open, close };
}
