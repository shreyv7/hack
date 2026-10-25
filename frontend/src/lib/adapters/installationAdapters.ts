import { getCmpScriptUrl, getPublicApiBaseUrl } from '@/lib/integrationUrls';

export interface InstallationAdapter {
  id: string;
  label: string;
  generateSnippet(
    propertyId: string,
    apiKeyPrefix: string,
    blockerMode: string,
    language: string,
    bannerId: string
  ): string;
  getGuideTip(): string;
}

export class HTMLAdapter implements InstallationAdapter {
  id = 'html';
  label = 'HTML / CDN';
  generateSnippet(
    propertyId: string,
    apiKeyPrefix: string,
    blockerMode: string,
    language: string,
    bannerId: string
  ): string {
    const cmpUrl = getCmpScriptUrl();
    const apiUrl = getPublicApiBaseUrl();
    return `<script
  src="${cmpUrl}"
  data-property-id="${propertyId}"
  data-api-key="${apiKeyPrefix}"
  data-api-url="${apiUrl}"
  data-language="${language}"
  data-blocker-mode="${blockerMode}"
  ${bannerId && bannerId !== 'null' ? `data-banner-id="${bannerId}"` : ''}
  async
></script>`;
  }
  getGuideTip(): string {
    return 'Insert this script tag as early as possible in your HTML <head>, ideally before loading any third-party script like Google Tag Manager or Facebook Pixels.';
  }
}

export class ReactAdapter implements InstallationAdapter {
  id = 'react';
  label = 'React';
  generateSnippet(
    propertyId: string,
    apiKeyPrefix: string,
    blockerMode: string,
    language: string,
    bannerId: string
  ): string {
    return `// Install NPM package
npm install @vajra/react

// In your application root file (e.g. index.js / App.js):
import React from 'react';
import { VajraProvider } from '@vajra/react';
import MainLayout from './MainLayout';

function App() {
  return (
    <VajraProvider
      propertyId="${propertyId}"
      apiKey="${apiKeyPrefix}"
      options={{
        blockerMode: "${blockerMode}",
        language: "${language}",
        bannerId: ${bannerId && bannerId !== 'null' ? `'${bannerId}'` : 'undefined'}
      }}
    >
      <MainLayout />
    </VajraProvider>
  );
}`;
  }
  getGuideTip(): string {
    return 'Wrap your main App root component inside VajraProvider. It automatically hooks into context state and controls tracker blockages.';
  }
}

export class NextJSAdapter implements InstallationAdapter {
  id = 'nextjs';
  label = 'Next.js';
  generateSnippet(
    propertyId: string,
    apiKeyPrefix: string,
    blockerMode: string,
    language: string,
    bannerId: string
  ): string {
    const cmpUrl = getCmpScriptUrl();
    const apiUrl = getPublicApiBaseUrl();
    return `// pages/_document.js or app/layout.tsx
import Script from 'next/script';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* Load Vajra compliance script */}
        <Script
          src="${cmpUrl}"
          strategy="afterInteractive"
          data-property-id="${propertyId}"
          data-api-key="${apiKeyPrefix}"
          data-api-url="${apiUrl}"
          data-language="${language}"
          data-blocker-mode="${blockerMode}"
          ${bannerId && bannerId !== 'null' ? `data-banner-id="${bannerId}"` : ''}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}`;
  }
  getGuideTip(): string {
    return 'Use next/script afterInteractive strategy. Vajra handles scripts executed by GTM dynamically on hydration.';
  }
}

export class AngularAdapter implements InstallationAdapter {
  id = 'angular';
  label = 'Angular';
  generateSnippet(
    propertyId: string,
    apiKeyPrefix: string,
    blockerMode: string,
    language: string,
    bannerId: string
  ): string {
    const cmpUrl = getCmpScriptUrl();
    const apiUrl = getPublicApiBaseUrl();
    return `// 1. Create a script file: src/assets/vajra.js
(function() {
  var s = document.createElement('script');
  s.async = true;
  s.src = "${cmpUrl}";
  s.setAttribute('data-property-id', '${propertyId}');
  s.setAttribute('data-api-key', '${apiKeyPrefix}');
  s.setAttribute('data-api-url', '${apiUrl}');
  s.setAttribute('data-language', '${language}');
  s.setAttribute('data-blocker-mode', '${blockerMode}');
  ${bannerId && bannerId !== 'null' ? `s.setAttribute('data-banner-id', '${bannerId}');` : ''}
  document.head.appendChild(s);
})();

// 2. Include in angular.json "scripts" bundle:
// "scripts": ["src/assets/vajra.js"]`;
  }
  getGuideTip(): string {
    return 'Loading via angular.json scripts array guarantees the blocker initiates prior to the main zone.js and angular bundles.';
  }
}

export class VueAdapter implements InstallationAdapter {
  id = 'vue';
  label = 'Vue';
  generateSnippet(
    propertyId: string,
    apiKeyPrefix: string,
    blockerMode: string,
    language: string,
    bannerId: string
  ): string {
    const cmpUrl = getCmpScriptUrl();
    const apiUrl = getPublicApiBaseUrl();
    return `// main.js or main.ts
import { createApp } from 'vue'
import App from './App.vue'

// Programmatic initialization
const script = document.createElement('script')
script.src = '${cmpUrl}'
script.async = true
script.dataset.propertyId = '${propertyId}'
script.dataset.apiKey = '${apiKeyPrefix}'
script.dataset.apiUrl = '${apiUrl}'
script.dataset.language = '${language}'
script.dataset.blockerMode = '${blockerMode}'
${bannerId && bannerId !== 'null' ? `script.dataset.bannerId = '${bannerId}'` : ''}
document.head.appendChild(script)

const app = createApp(App)
app.mount('#app')`;
  }
  getGuideTip(): string {
    return ' Vue.js integrations load prior to mounting the application instance to prevent scripts inside index.html from escaping consent controls.';
  }
}

export class GTMAdapter implements InstallationAdapter {
  id = 'gtm';
  label = 'Google Tag Manager';
  generateSnippet(
    _propertyId: string,
    _apiKeyPrefix: string,
    _blockerMode: string,
    _language: string,
    _bannerId: string
  ): string {
    return `<!-- 1. Place this custom HTML snippet BEFORE GTM container initialization -->
<script>
  window.VajraDataLayer = window.VajraDataLayer || [];
  window.Vajra = {
    hasConsent: function(purp) {
      // Local mock check before GTM initialization completes
      return localStorage.getItem('zs_consent_' + purp) === 'true';
    }
  };
</script>

<!-- 2. GTM Consent Mode settings are synced automatically once cmp.js loads. -->`;
  }
  getGuideTip(): string {
    return 'Hook Vajra into GTM Consent Mode v2 mappings. Map Google ad_storage and analytics_storage to matching purpose IDs.';
  }
}

export class WordPressAdapter implements InstallationAdapter {
  id = 'wordpress';
  label = 'WordPress';
  generateSnippet(
    propertyId: string,
    apiKeyPrefix: string,
    blockerMode: string,
    language: string,
    bannerId: string
  ): string {
    const cmpUrl = getCmpScriptUrl();
    const apiUrl = getPublicApiBaseUrl();
    return `// Add this to your child theme's functions.php file:
function enqueue_vajra_cmp() {
    wp_enqueue_script(
        'vajra-cmp',
        '${cmpUrl}',
        array(),
        null,
        false
    );
    wp_script_add_data('vajra-cmp', 'data-property-id', '${propertyId}');
    wp_script_add_data('vajra-cmp', 'data-api-key', '${apiKeyPrefix}');
    wp_script_add_data('vajra-cmp', 'data-api-url', '${apiUrl}');
    wp_script_add_data('vajra-cmp', 'data-language', '${language}');
    wp_script_add_data('vajra-cmp', 'data-blocker-mode', '${blockerMode}');
    ${bannerId && bannerId !== 'null' ? `wp_script_add_data('vajra-cmp', 'data-banner-id', '${bannerId}');` : ''}
}
add_action('wp_enqueue_scripts', 'enqueue_vajra_cmp', 1);`;
  }
  getGuideTip(): string {
    return 'Enqueue script at priority 1 to make it the absolute first resource enqueued on the front end page.';
  }
}

export class IOSSwiftAdapter implements InstallationAdapter {
  id = 'ios';
  label = 'iOS (Swift)';
  generateSnippet(
    propertyId: string,
    apiKeyPrefix: string,
    blockerMode: string,
    language: string,
    _bannerId: string
  ): string {
    return `// 1. Add dependency in your Podfile:
pod 'VajraCMP', '~> 4.2'

// 2. Initialize in AppDelegate.swift:
import UIKit
import VajraCMP

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        // Initialize Headless SDK
        Vajra.initialize(
            propertyId: "${propertyId}",
            apiKey: "${apiKeyPrefix}",
            options: VajraOptions(
                blockerMode: .${blockerMode},
                language: "${language}"
            )
        )
        return true
    }
}

// 3. Query consent state inside views or view controllers:
if Vajra.shared.hasConsent(for: "analytics") {
    // Safe to initialize tracking trackers or SDKs
    GoogleAnalytics.initialize()
}`;
  }
  getGuideTip(): string {
    return 'Initialize the SDK immediately in didFinishLaunchingWithOptions to fetch published configuration layouts from the public CDN API.';
  }
}

export class AndroidKotlinAdapter implements InstallationAdapter {
  id = 'android';
  label = 'Android (Kotlin)';
  generateSnippet(
    propertyId: string,
    apiKeyPrefix: string,
    blockerMode: string,
    language: string,
    _bannerId: string
  ): string {
    return `// 1. Add to build.gradle dependencies:
implementation("in.vajra:sdk:4.2.1")

// 2. Initialize in MainApplication.kt:
package com.company.app

import android.app.Application
import in.vajra.sdk.Vajra
import in.vajra.sdk.VajraOptions

class MainApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        
        Vajra.initialize(
            context = this,
            propertyId = "${propertyId}",
            apiKey = "${apiKeyPrefix}",
            options = VajraOptions(
                blockerMode = "${blockerMode}",
                language = "${language}"
            )
        )
    }
}

// 3. Check opt-in dynamically:
if (Vajra.hasConsent("analytics")) {
    FirebaseAnalytics.getInstance(context).setAnalyticsCollectionEnabled(true)
}`;
  }
  getGuideTip(): string {
    return 'Loading the Vajra Android library inside Application.onCreate guarantees no background services load trackers before consent resolution.';
  }
}

export class FlutterAdapter implements InstallationAdapter {
  id = 'flutter';
  label = 'Flutter';
  generateSnippet(
    propertyId: string,
    apiKeyPrefix: string,
    blockerMode: string,
    language: string,
    _bannerId: string
  ): string {
    return `# 1. Add dependency in pubspec.yaml:
dependencies:
  vajra_cmp: ^4.1.8

# 2. Initialize in main.dart:
import 'package:flutter/material.dart';
import 'package:vajra_cmp/vajra_cmp.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  await Vajra.initialize(
    propertyId: "${propertyId}",
    apiKey: "${apiKeyPrefix}",
    options: VajraOptions(
      blockerMode: "${blockerMode}",
      language: "${language}"
    )
  );
  
  runApp(const MyApp());
}

// 3. Check consent before initializing third-party services:
if (await Vajra.hasConsent("analytics")) {
  // Initialize third-party plugins
}`;
  }
  getGuideTip(): string {
    return 'Ensure WidgetsFlutterBinding.ensureInitialized() is triggered before starting Vajra initialization.';
  }
}

export class ReactNativeAdapter implements InstallationAdapter {
  id = 'react-native';
  label = 'React Native';
  generateSnippet(
    propertyId: string,
    apiKeyPrefix: string,
    blockerMode: string,
    language: string,
    _bannerId: string
  ): string {
    return `// 1. Install NPM module:
npm install @vajra/react-native

// 2. Import and initialize at application root (e.g. index.js):
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { Vajra } from '@vajra/react-native';

Vajra.initialize("${propertyId}", "${apiKeyPrefix}", {
  blockerMode: "${blockerMode}",
  language: "${language}"
});

AppRegistry.registerComponent(appName, () => App);

// 3. Check consent states:
const consented = await Vajra.hasConsent("analytics");
if (consented) {
  // Launch tracking SDKs
}`;
  }
  getGuideTip(): string {
    return 'For Android, ensure the compileSdkVersion is at least 33 in android/build.gradle.';
  }
}

export const INSTALLATION_ADAPTERS: Record<string, InstallationAdapter> = {
  html: new HTMLAdapter(),
  react: new ReactAdapter(),
  nextjs: new NextJSAdapter(),
  angular: new AngularAdapter(),
  vue: new VueAdapter(),
  gtm: new GTMAdapter(),
  wordpress: new WordPressAdapter(),
  ios: new IOSSwiftAdapter(),
  android: new AndroidKotlinAdapter(),
  flutter: new FlutterAdapter(),
  'react-native': new ReactNativeAdapter(),
};
