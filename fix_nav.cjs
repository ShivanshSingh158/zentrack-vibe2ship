const fs = require('fs');
let code = fs.readFileSync('mobile/src/navigation/AppNavigator.tsx', 'utf8');

// 1. Imports
code = code.replace(
  "import * as Updates from 'expo-updates';\r\nimport { auth } from '../services/firebase';",
  "import * as Updates from 'expo-updates';\nimport * as SplashScreen from 'expo-splash-screen';\nimport { Image } from 'react-native';\nimport { auth } from '../services/firebase';"
);

code = code.replace(
  "import { cacheAwareLazy, startPrefetching } from '../utils/ModulePrefetcher';",
  "import { cacheAwareLazy, startPrefetching, preloadNow } from '../utils/ModulePrefetcher';"
);

code = code.replace(
  "import ErrorBoundary from '../components/ErrorBoundary';\r\n\r\n// --- Critical screens",
  "import ErrorBoundary from '../components/ErrorBoundary';\nimport { useTabBarBadges } from '../hooks/useTabBarBadges';\n\n// --- Critical screens"
);

code = code.replace(
  "import GymStack from './GymStack';\r\nimport SaraScreen from '../screens/SaraScreen';\r\nimport NotificationsSettingsScreen from '../screens/NotificationsSettingsScreen';",
  "import GymStack from './GymStack';\nimport NotificationsSettingsScreen from '../screens/NotificationsSettingsScreen';\nimport XPConstellationScreen from '../screens/XPConstellationScreen';"
);

code = code.replace(
  "const WellbeingDashboardScreen  = cacheAwareLazy('WellbeingDashboardScreen', () => import('../screens/WellbeingDashboardScreen'));\r\n\r\n// --- Navigators",
  "const WellbeingDashboardScreen  = cacheAwareLazy('WellbeingDashboardScreen', () => import('../screens/WellbeingDashboardScreen'));\n// SaraScreen is heavy (63KB) — lazy-loaded so it never blocks startup parse\nconst SaraScreen               = cacheAwareLazy('SaraScreen',               () => import('../screens/SaraScreen'));\n\n// --- Navigators"
);

// 2. Remove SplashLoader entirely
const splashStart = code.indexOf('// --- SplashLoader ------------------------------------------------------------');
const splashEnd = code.indexOf('// --- Nested screen header ----------------------------------------------------');
if (splashStart !== -1 && splashEnd !== -1) {
  code = code.substring(0, splashStart) + code.substring(splashEnd);
}

// 3. Update MainTabNavigator
code = code.replace(
  "  // Background-prefetch lazy (non-sync-imported) screens after interactions settle.\r\n  // Pinned screens that are sync-imported don't need prefetching.\r\n  useEffect(() => { startPrefetching(pinnedModules); }, [pinnedModules]);\r\n\r\n  const renderTabBar = useCallback((props: any) => <TelegramTabBar {...props} />, []);",
  "  // Background-prefetch lazy screens once on mount (after first render).\n  // We read pinnedModules via ref so the effect never re-fires on re-renders,\n  // keeping startup ultra-lean. Pinned screens are prioritised in the queue.\n  const pinnedModulesRef = useRef(pinnedModules);\n  pinnedModulesRef.current = pinnedModules;\n  useEffect(() => { startPrefetching(pinnedModulesRef.current); }, []);\n\n  const badges = useTabBarBadges();\n\n  const renderTabBar = useCallback((props: any) => <TelegramTabBar {...props} badges={badges} />, [badges]);"
);

code = code.replace(
  "              tabBarItemStyle: { paddingVertical: 10 },\r\n            }}\r\n          />",
  "              tabBarItemStyle: { paddingVertical: 10 },\n              lazy: false,\n            }}\n          />"
);

// 4. Add XPConstellation to NestedScreens
code = code.replace(
  "        <Stack.Screen name=\"WellbeingDashboard\"    component={withErrorBoundary(WellbeingDashboardScreen,    'Wellbeing')}     options={{ headerShown: false }} />\r\n      </Stack.Navigator>",
  "        <Stack.Screen name=\"WellbeingDashboard\"    component={withErrorBoundary(WellbeingDashboardScreen,    'Wellbeing')}     options={{ headerShown: false }} />\n        <Stack.Screen name=\"XPConstellation\"       component={withErrorBoundary(XPConstellationScreen,       'XPConstellation')} options={{ headerShown: false }} />\n      </Stack.Navigator>"
);

// 5. Update RootNavigatorWithSara
code = code.replace(
  "  const MainTabsScreen = useCallback(\r\n    () => <MainTabNavigator initialTab={initialTab} />,\r\n    // eslint-disable-next-line react-hooks/exhaustive-deps\r\n    []\r\n  );\r\n\r\n  const [showSara, setShowSara] = useState(SARA_VISIBLE_ROUTES.has(initialTab));",
  "  const MainTabsScreen = useCallback(\n    () => <MainTabNavigator initialTab={initialTab} />,\n    // eslint-disable-next-line react-hooks/exhaustive-deps\n    []\n  );\n\n  // Pre-warm SaraScreen 2.5s after login so first tap opens instantly.\n  // Not at startup (keeps cold start fast) — loaded silently in background.\n  useEffect(() => {\n    const timer = setTimeout(() => preloadNow('SaraScreen'), 2500);\n    return () => clearTimeout(timer);\n  }, []);\n\n  const [showSara, setShowSara] = useState(SARA_VISIBLE_ROUTES.has(initialTab));"
);

code = code.replace(
  "          onPress={() => { feedback.commit(); setSaraVisible(true); }}\r\n          haptic=\"heavy\"\r\n        >\r\n          <Ionicons name=\"planet\" size={26} color={colors.accentPrimary} />",
  "          onPress={() => setSaraVisible(true)}\n          haptic=\"none\"\n        >\n          <Image source={require('../../assets/images/sara-idle.png')} style={{ width: 40, height: 40, opacity: 1 }} resizeMode=\"contain\" />"
);

code = code.replace(
  "      <SaraScreen isGlobalModal={true} visible={saraVisible} onClose={() => setSaraVisible(false)} />\r\n    </View>",
  "      {/* Only mount SaraScreen when actually opened — prevents 63KB of hooks running at startup */}\n      {saraVisible && (\n        <SaraScreen isGlobalModal={true} visible={saraVisible} onClose={() => setSaraVisible(false)} />\n      )}\n    </View>"
);

// 6. AppNavigator optimistic boot
code = code.replace(
  "  const firstAuthAt = useRef<number>(0);\r\n  const hasResolved = useRef(false);\r\n\r\n  useEffect(() => {\r\n    const boot = async () => {\r\n      try {\r\n        const [[, savedTab], [, onboardedVal]] =\r\n          await AsyncStorage.multiGet([NAV_ROUTE_KEY, ONBOARDING_KEY]);\r\n        // Cold boot: always Home (WhatsApp/Instagram standard).\r\n        setInitialTab('Home');\r\n        if (onboardedVal) setOnboarded(onboardedVal === 'true');\r\n      } catch {",
  "  const firstAuthAt = useRef<number>(0);\n  const hasResolved = useRef(false);\n\n  const [wasLoggedIn, setWasLoggedIn] = useState(false);\n\n  useEffect(() => {\n    const boot = async () => {\n      try {\n        const [[, savedTab], [, onboardedVal], [, optimisticUserStr]] =\n          await AsyncStorage.multiGet([NAV_ROUTE_KEY, ONBOARDING_KEY, '@zentrack_optimistic_user']);\n        \n        // Cold boot: always Home (WhatsApp/Instagram standard).\n        setInitialTab('Home');\n        if (onboardedVal) setOnboarded(onboardedVal === 'true');\n        \n        // WhatsApp-style Optimistic Boot: If we have a cached user profile, boot instantly!\n        if (optimisticUserStr) {\n          try {\n            const optimisticUser = JSON.parse(optimisticUserStr);\n            setUser(optimisticUser as User);\n            setAppReady(true);\n            hasResolved.current = true; // Mark as resolved so Firebase background check doesn't double-boot\n          } catch {}\n        }\n      } catch {"
);

code = code.replace(
  "    // Firebase auth listener -- one subscription, lives forever\r\n    const unsubAuth = onAuthStateChanged(auth, async (usr) => {\r\n      if (!hasResolved.current) {\r\n        hasResolved.current = true;\r\n        firstAuthAt.current = Date.now();\r\n        setUser(usr);\r\n        if (usr) {\r\n          const val = await AsyncStorage.getItem(ONBOARDING_KEY).catch(() => null);\r\n          setOnboarded(val === 'true');\r\n        }\r\n        await bootPromise;\r\n        setAppReady(true);\r\n        return;\r\n      }\r\n\r\n      if (!usr) {\r\n        // Null within 3s of first resolution = token refresh, NOT logout\r\n        if (Date.now() - firstAuthAt.current < 3000) return;\r\n        setUser(null);\r\n      } else {\r\n        setUser(usr);\r\n      }\r\n    });",
  "    // Firebase auth listener -- one subscription, lives forever\n    const unsubAuth = onAuthStateChanged(auth, async (usr) => {\n      await bootPromise;\n\n      const saveOptimisticUser = (u: User | null) => {\n        if (u) {\n          AsyncStorage.setItem('@zentrack_optimistic_user', JSON.stringify({\n            uid: u.uid,\n            email: u.email,\n            displayName: u.displayName,\n          })).catch(() => {});\n        } else {\n          AsyncStorage.removeItem('@zentrack_optimistic_user').catch(() => {});\n        }\n      };\n\n      if (!hasResolved.current) {\n        // We only hit this block if we did NOT have an optimistic user (i.e. fresh install or logged out)\n        await auth.authStateReady();\n        const realUser = auth.currentUser;\n\n        hasResolved.current = true;\n        firstAuthAt.current = Date.now();\n        setUser(realUser);\n        setAppReady(true);\n        saveOptimisticUser(realUser);\n        return;\n      }\n\n      // Background Validation: We booted optimistically, now Firebase is checking the real token\n      if (!usr) {\n        // Null within 3s of first resolution = token refresh, NOT logout\n        if (Date.now() - firstAuthAt.current < 3000) return;\n        setUser(null);\n        saveOptimisticUser(null);\n      } else {\n        setUser(usr);\n        saveOptimisticUser(usr);\n      }\n    });"
);

code = code.replace(
  "  return (\r\n    <View style={{ flex: 1, backgroundColor: '#080510' }}>\r\n      <NavigationContainer\r\n        ref={navigationRef}\r\n        theme={ZEN_DARK_THEME}\r\n        onStateChange={onNavStateChange}\r\n      >\r\n        {user ? (",
  "  // CRITICAL: Do not mount the navigation tree until we know the user's auth state.\n  // Otherwise, React Native renders the LandingScreen in the background, and if the \n  // native splash screen hides a millisecond too early, the user sees it flash.\n  if (!appReady) {\n    return <View style={{ flex: 1, backgroundColor: '#080510' }} />;\n  }\n\n  return (\n    <View style={{ flex: 1, backgroundColor: '#080510' }}>\n      <NavigationContainer\n        ref={navigationRef}\n        theme={ZEN_DARK_THEME}\n        onStateChange={onNavStateChange}\n        onReady={() => {\n          // Hide splash ONLY after React Native has fully painted the final tree!\n          SplashScreen.hideAsync();\n        }}\n      >\n        {user ? ("
);

code = code.replace(
  "      </NavigationContainer>\r\n\r\n      {/* Splash overlay -- sits ABOVE NavigationContainer.\r\n          SplashLoader self-destructs after its 350ms fade-out completes.\r\n          The native view beneath stays warm -- no grey flash ever. */}\r\n      <SplashLoader ready={appReady} />\r\n    </View>",
  "      </NavigationContainer>\n    </View>"
);

code = code.replace(
  "    width:            48,\r\n    height:           48,\r\n    borderRadius:     24,\r\n    borderWidth:      1,\r\n    borderColor:      'rgba(165,153,255,0.4)',\r\n    alignItems:       'center',\r\n    justifyContent:   'center',\r\n    overflow:         'hidden',\r\n    backgroundColor:  'rgba(165,153,255,0.1)',\r\n    shadowColor:      '#a599ff',\r\n    shadowOffset:     { width: 0, height: 4 },\r\n    shadowOpacity:    0.3,\r\n    shadowRadius:     8,\r\n    elevation:        8,",
  "    width:            48,\n    height:           48,\n    borderRadius:     24,\n    alignItems:       'center',\n    justifyContent:   'center',\n    overflow:         'hidden',\n    shadowColor:      '#a599ff',\n    shadowOffset:     { width: 0, height: 4 },\n    shadowOpacity:    0.3,\n    shadowRadius:     8,\n    elevation:        5,"
);

fs.writeFileSync('mobile/src/navigation/AppNavigator.tsx', code);
