import type { ReactElement } from 'react';
import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router';
import { Sidebar } from '@/app/components/shell/Sidebar';
import { TopBar } from '@/app/components/shell/TopBar';
import { PageLoader } from '@/components/PageLoader';
import { NavigationGuardProvider } from '@/router/NavigationGuardContext';
import { shouldHideTopBar } from '@/router/pathMap';
import { AccessButton } from '@/app/components/overlay/AccessButton';

export function AppLayout(): ReactElement {
  const location = useLocation();
  const hideTopBar = shouldHideTopBar(location.pathname);

  return (
    <NavigationGuardProvider>
      <div className="h-screen w-screen flex bg-[var(--surface-base)] overflow-hidden">
        <Sidebar />

        <div className="flex-1 flex flex-col min-w-0">
          {!hideTopBar && <TopBar />}

          <main className={`flex-1 ${location.pathname === '/ai/copilot' ? 'overflow-hidden' : 'overflow-auto'}`}>
            <div className={`${location.pathname === '/ai/copilot' ? 'h-full' : 'min-h-full'} bg-[var(--surface-base)]`}>
              <Suspense fallback={<PageLoader />}>
                <Outlet />
              </Suspense>
            </div>
          </main>
        </div>
      </div>
      <AccessButton />
    </NavigationGuardProvider>
  );
}
