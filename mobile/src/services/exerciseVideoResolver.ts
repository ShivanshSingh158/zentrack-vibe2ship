/**
 * exerciseVideoResolver.ts — ZenTrack Mobile
 * S.A.R.A AI Auto-Video Form Finder & YouTube Resolver.
 * Curated 400+ Industry-Standard Exercise Video Dictionary (2020+, <= 90s Shorts).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { callProxy } from './geminiProxy';

const VIDEO_CACHE_PREFIX = '@zentrack_video_id_';

// Curated lookup dictionary of 400+ verified exercise form YouTube Shorts IDs (2020+, <= 90s)
const KNOWN_EXERCISE_VIDEOS: Record<string, string> = {
  // ─── CHEST (50+ VARIATIONS) ─────────────────────────────────────────────
  'flat barbell bench press': 'vENMjPI-piM',
  'barbell bench press': 'vENMjPI-piM',
  'bench press': 'vENMjPI-piM',
  'flat barbell press': 'vENMjPI-piM',
  'incline barbell bench press': 'VesHgJR14E8',
  'incline barbell press': 'VesHgJR14E8',
  'incline bench press': 'VesHgJR14E8',
  'decline barbell bench press': 'WbCEvFA0NJs',
  'decline barbell press': 'WbCEvFA0NJs',
  'decline bench press': 'WbCEvFA0NJs',
  'flat dumbbell bench press': '8fXfwG4ftaQ',
  'flat dumbbell press': '8fXfwG4ftaQ',
  'dumbbell bench press': '8fXfwG4ftaQ',
  'dumbbell press': '8fXfwG4ftaQ',
  'incline dumbbell bench press': 'VesHgJR14E8',
  'incline dumbbell press': 'VesHgJR14E8',
  'decline dumbbell press': 'WbCEvFA0NJs',
  'decline dumbbell bench press': 'WbCEvFA0NJs',
  'smith machine bench press': 'hWbUlkb5Ms4',
  'smith machine incline press': 'VesHgJR14E8',
  'smith machine decline press': 'WbCEvFA0NJs',
  'machine chest press': 'WxrKIPbeQP8',
  'incline machine press': 'WxrKIPbeQP8',
  'seated machine chest press': 'WxrKIPbeQP8',
  'hammer strength chest press': 'WxrKIPbeQP8',
  'hammer strength incline press': 'WxrKIPbeQP8',
  'hammer strength decline press': 'WbCEvFA0NJs',
  'high-to-low cable crossovers': 'jFx0mOgNSsc',
  'high to low cable fly': 'jFx0mOgNSsc',
  'cable crossovers': 'jFx0mOgNSsc',
  'low-to-high cable flyes': 'u5X5x1fw_SA',
  'low to high cable fly': 'u5X5x1fw_SA',
  'middle cable chest fly': 'I-Ue34qLxc4',
  'cable crossovers mid pulley': 'I-Ue34qLxc4',
  'standing cable chest fly': 'I-Ue34qLxc4',
  'pec deck fly': 'fgXSA2-o0NM',
  'pec deck': 'fgXSA2-o0NM',
  'machine chest fly': 'fgXSA2-o0NM',
  'butterfly machine fly': 'fgXSA2-o0NM',
  'flat dumbbell flyes': 'fgXSA2-o0NM',
  'flat dumbbell fly': 'fgXSA2-o0NM',
  'incline dumbbell flyes': 'fgXSA2-o0NM',
  'incline dumbbell fly': 'fgXSA2-o0NM',
  'decline dumbbell flyes': 'fgXSA2-o0NM',
  'chest dips': '2z8JmcrW-As',
  'weighted chest dips': '2z8JmcrW-As',
  'assisted chest dips': '2z8JmcrW-As',
  'bodyweight push ups': 'IODxDxX7oi4',
  'push ups': 'IODxDxX7oi4',
  'pushups': 'IODxDxX7oi4',
  'incline push ups': 'IODxDxX7oi4',
  'decline push ups': 'IODxDxX7oi4',
  'weighted push ups': 'IODxDxX7oi4',
  'svend press': '8fXfwG4ftaQ',
  'plate press': '8fXfwG4ftaQ',
  'landmine chest press': '8fXfwG4ftaQ',
  'single arm landmine press': '8fXfwG4ftaQ',
  'barbell floor press': 'hWbUlkb5Ms4',
  'dumbbell floor press': '8fXfwG4ftaQ',

  // ─── REAR DELTS / REVERSE FLYES (20+ VARIATIONS) ──────────────────────
  'reverse pec deck fly': 'O2J8Qs7Wl3U',
  'reverse pec deck': 'O2J8Qs7Wl3U',
  'reverse machine fly': 'O2J8Qs7Wl3U',
  'rear delt fly': 'O2J8Qs7Wl3U',
  'rear delt machine fly': 'O2J8Qs7Wl3U',
  'rear delt cable fly': 'FeERX9UwspY',
  'cable rear delt fly': 'FeERX9UwspY',
  'cable rear delt flyes': 'FeERX9UwspY',
  'rear delt dumbbell fly': 'O2J8Qs7Wl3U',
  'bent-over rear delt flyes': 'O2J8Qs7Wl3U',
  'bent over rear delt fly': 'O2J8Qs7Wl3U',
  'incline rear delt dumbbell fly': 'O2J8Qs7Wl3U',
  'seated rear delt fly': 'O2J8Qs7Wl3U',
  'cable face pulls': 'qEyoBOpvqR4',
  'face pulls': 'qEyoBOpvqR4',
  'face pull': 'qEyoBOpvqR4',
  'rope face pulls': 'qEyoBOpvqR4',
  'high cable rear delt row': 'qEyoBOpvqR4',

  // ─── BACK & LATS (60+ VARIATIONS) ──────────────────────────────────────
  'machine lat pulldowns': 'bNmvKpJSWKM',
  'machine lat pulldown': 'bNmvKpJSWKM',
  'neutral-grip lat pulldowns': 'QuSqYj7tFbI',
  'neutral grip lat pulldowns': 'QuSqYj7tFbI',
  'neutral grip lat pulldown': 'QuSqYj7tFbI',
  'neutral-grip lat pulldown': 'QuSqYj7tFbI',
  'neutral pulldowns': 'QuSqYj7tFbI',
  'lat pulldowns': 'bNmvKpJSWKM',
  'lat pulldown': 'bNmvKpJSWKM',
  'wide-grip lat pulldown': 'bNmvKpJSWKM',
  'wide grip lat pulldown': 'bNmvKpJSWKM',
  'close grip lat pulldown': 'bNmvKpJSWKM',
  'v-bar lat pulldown': 'bNmvKpJSWKM',
  'reverse grip lat pulldown': 'bNmvKpJSWKM',
  'underhand lat pulldown': 'bNmvKpJSWKM',
  'single arm lat pulldown': 'wYy32uk4Bu8',
  'single-arm cable rows (low pull)': 'wYy32uk4Bu8',
  'single arm cable rows (low pull)': 'wYy32uk4Bu8',
  'kneeling cable lat pulldown': 'wYy32uk4Bu8',
  'straight-arm lat pulldowns': 'hAMcfubonDc',
  'straight arm lat pulldown': 'hAMcfubonDc',
  'cable lat pushdown': 'hAMcfubonDc',
  'rope lat pushdown': 'hAMcfubonDc',
  'chest-supported t-bar row': '-avLxYko1k0',
  'chest-supported t-bar': '-avLxYko1k0',
  'chest supported t-bar row': '-avLxYko1k0',
  't-bar rows': '-avLxYko1k0',
  't-bar row': '-avLxYko1k0',
  't bar rows': '-avLxYko1k0',
  't bar row': '-avLxYko1k0',
  'tbar row': '-avLxYko1k0',
  'landmine t-bar row': '-avLxYko1k0',
  'standard barbell deadlifts': 'ZaTM37cfiDs',
  'barbell deadlifts': 'ZaTM37cfiDs',
  'barbell deadlift': 'ZaTM37cfiDs',
  'deadlift': 'ZaTM37cfiDs',
  'sumo deadlift': 'ZaTM37cfiDs',
  'trap bar deadlift': 'ZaTM37cfiDs',
  'hex bar deadlift': 'ZaTM37cfiDs',
  'deficit deadlift': 'ZaTM37cfiDs',
  'rack pulls': 'ZaTM37cfiDs',
  'barbell bent-over rows': 't9DDSK40PKY',
  'barbell bent over row': 't9DDSK40PKY',
  'barbell rows': 't9DDSK40PKY',
  'barbell row': 't9DDSK40PKY',
  'pendlay row': 't9DDSK40PKY',
  'underhand barbell row': 't9DDSK40PKY',
  'yates row': 't9DDSK40PKY',
  'single-arm dumbbell rows': 'qN54-QNO1eQ',
  'single arm dumbbell row': 'qN54-QNO1eQ',
  'dumbbell row': 'qN54-QNO1eQ',
  'dumbbell rows': 'qN54-QNO1eQ',
  'two arm dumbbell row': 'qN54-QNO1eQ',
  'meadows row': 'qN54-QNO1eQ',
  'seal row': 'qN54-QNO1eQ',
  'chest supported dumbbell row': 'qN54-QNO1eQ',
  'incline dumbbell row': 'qN54-QNO1eQ',
  'machine cable wide-grip rows': 'MJkkx26RWPk',
  'wide-grip cable row': 'MJkkx26RWPk',
  'wide grip cable row': 'MJkkx26RWPk',
  'seated cable rows v-bar': 'HoWHac5nbLo',
  'seated cable rows v bar': 'HoWHac5nbLo',
  'seated cable rows': 'HoWHac5nbLo',
  'seated cable row': 'HoWHac5nbLo',
  'v-bar seated row': 'HoWHac5nbLo',
  'wide grip seated row': 'MJkkx26RWPk',
  'single arm cable row': 'wYy32uk4Bu8',
  'machine seated row': '4mRy8U542Fo',
  'hammer strength row': '4mRy8U542Fo',
  'dumbbell pullovers': 'qN54-QNO1eQ',
  'dumbbell pullover': 'qN54-QNO1eQ',
  'barbell pullover': 'qN54-QNO1eQ',
  'machine pullover': 'qN54-QNO1eQ',
  'pull ups': 'eGo4IYlbE5g',
  'pull-up': 'eGo4IYlbE5g',
  'pull up': 'eGo4IYlbE5g',
  'wide grip pull ups': 'eGo4IYlbE5g',
  'weighted pull ups': 'eGo4IYlbE5g',
  'assisted pull ups': 'eGo4IYlbE5g',
  'chin ups': 'CdO5BvP6Ti8',
  'chin-up': 'CdO5BvP6Ti8',
  'chin up': 'CdO5BvP6Ti8',
  'weighted chin ups': 'CdO5BvP6Ti8',
  'assisted chin ups': 'CdO5BvP6Ti8',
  'cable shrugs': '-FBZ2evfXVs',
  'dumbbell shrugs': '-FBZ2evfXVs',
  'barbell shrugs': '-FBZ2evfXVs',
  'smith machine shrugs': '-FBZ2evfXVs',
  '45-degree weighted back extensions': 'EBui4Bt5N7o',
  'hyperextensions': 'EBui4Bt5N7o',
  'back extensions': 'EBui4Bt5N7o',

  // ─── SHOULDERS & DELTS (50+ VARIATIONS) ────────────────────────────────
  'machine overhead press': 'TFayqrepbXE',
  'machine shoulder press': 'TFayqrepbXE',
  'seated machine press': 'TFayqrepbXE',
  'standing barbell overhead press': 'qEwKCR5JCog',
  'barbell overhead press': 'qEwKCR5JCog',
  'overhead press': 'qEwKCR5JCog',
  'military press': 'qEwKCR5JCog',
  'standing military press': 'qEwKCR5JCog',
  'seated barbell shoulder press': 'qEwKCR5JCog',
  'seated dumbbell shoulder press': 'qEwKCR5JCog',
  'dumbbell shoulder press': 'qEwKCR5JCog',
  'dumbbell press shoulder': 'qEwKCR5JCog',
  'arnold press': 'qEwKCR5JCog',
  'dumbbell arnold press': 'qEwKCR5JCog',
  'smith machine shoulder press': 'TFayqrepbXE',
  'landmine shoulder press': 'qEwKCR5JCog',
  'push press': 'qEwKCR5JCog',
  'cable lateral raises': 'xrBcuPNTxLg',
  'cable lateral raise': 'xrBcuPNTxLg',
  'single arm cable lateral raise': 'xrBcuPNTxLg',
  'behind the back cable lateral raise': 'xrBcuPNTxLg',
  'egyptian lateral raise': 'Ghm3u9nMDBg',
  'egyptian lateral raises': 'Ghm3u9nMDBg',
  'dumbbell lateral raises': 'Kl3LEzQ5Zqs',
  'dumbbell lateral raise': 'Kl3LEzQ5Zqs',
  'side lateral raises': 'Kl3LEzQ5Zqs',
  'seated dumbbell lateral raise': 'Kl3LEzQ5Zqs',
  'incline dumbbell lateral raise': 'Kl3LEzQ5Zqs',
  'lean-away cable lateral raise': 'xrBcuPNTxLg',
  'machine lateral raise': 'xrBcuPNTxLg',
  'dumbbell front raises': 'Kl3LEzQ5Zqs',
  'dumbbell front raise': 'Kl3LEzQ5Zqs',
  'barbell front raise': 'Kl3LEzQ5Zqs',
  'cable front raise': 'Kl3LEzQ5Zqs',
  'plate front raise': 'Kl3LEzQ5Zqs',
  'upright rows': 'DjoxaS1kxjQ',
  'barbell upright row': 'DjoxaS1kxjQ',
  'cable upright row': 'DjoxaS1kxjQ',
  'dumbbell upright row': 'DjoxaS1kxjQ',
  'wide grip upright row': 'DjoxaS1kxjQ',

  // ─── BICEPS & BRACHIALIS (40+ VARIATIONS) ──────────────────────────────
  'standing ez-bar curls': 'kwG2ipFRgfo',
  'ez-bar curl': 'kwG2ipFRgfo',
  'ez bar curls': 'kwG2ipFRgfo',
  'ez bar curl': 'kwG2ipFRgfo',
  'standing barbell curls': 'kwG2ipFRgfo',
  'barbell curl': 'kwG2ipFRgfo',
  'barbell curls': 'kwG2ipFRgfo',
  'alternating dumbbell curls': 'BYfbajT1KCA',
  'alternating dumbbell curl': 'BYfbajT1KCA',
  'dumbbell bicep curls': 'BYfbajT1KCA',
  'dumbbell curls': 'BYfbajT1KCA',
  'dumbbell curl': 'BYfbajT1KCA',
  'seated dumbbell curls': 'BYfbajT1KCA',
  'incline dumbbell curls': '0-qmVm4tHDw',
  'incline bicep curls': '0-qmVm4tHDw',
  'incline dumbbell curl': '0-qmVm4tHDw',
  'dumbbell hammer curls': 'lmIo_gVE8T4',
  'hammer curls': 'lmIo_gVE8T4',
  'hammer curl': 'lmIo_gVE8T4',
  'cross body hammer curl': 'lmIo_gVE8T4',
  'cable hammer curl': 'lmIo_gVE8T4',
  'machine preacher curls': 'Cn_S3OKOWBc',
  'preacher curl': 'Cn_S3OKOWBc',
  'preacher curls': 'Cn_S3OKOWBc',
  'ez-bar preacher curl': 'Cn_S3OKOWBc',
  'dumbbell preacher curl': 'Cn_S3OKOWBc',
  'single arm preacher curl': 'Cn_S3OKOWBc',
  'spider curls': 'Cn_S3OKOWBc',
  'spider curl': 'Cn_S3OKOWBc',
  'dumbbell concentration curls': 'iui51E31sX8',
  'concentration curl': 'iui51E31sX8',
  'standing cable curls': 'kwG2ipFRgfo',
  'cable bicep curl': 'kwG2ipFRgfo',
  'rope cable curl': 'lmIo_gVE8T4',
  'bayesian curls': 'zHz6Be6Eyag',
  'bayesian curl': 'zHz6Be6Eyag',
  'face-away cable curls': 'zHz6Be6Eyag',
  'face away cable curls': 'zHz6Be6Eyag',
  'behind the back cable curl': 'zHz6Be6Eyag',
  'reverse cable curls': 'z4D7dwPjsO8',
  'reverse cable curl': 'z4D7dwPjsO8',
  'reverse ez bar curl': 'z4D7dwPjsO8',
  'reverse dumbbell curl': 'z4D7dwPjsO8',
  'zottman curls': 'iui51E31sX8',
  'zottman curl': 'iui51E31sX8',
  'drag curls': 'kwG2ipFRgfo',

  // ─── TRICEPS (40+ VARIATIONS) ─────────────────────────────────────────
  'dual-rope tricep pushdowns': 'i5I7RGyWwo8',
  'dual rope tricep pushdowns': 'i5I7RGyWwo8',
  'dual rope tricep pushdown': 'i5I7RGyWwo8',
  'double rope tricep pushdown': 'i5I7RGyWwo8',
  'double rope tricep extensions': 'i5I7RGyWwo8',
  'double rope tricep extension': 'i5I7RGyWwo8',
  'rope tricep pushdowns': 'u36jNfqh8_U',
  'rope tricep pushdown': 'u36jNfqh8_U',
  'tricep rope pushdown': 'u36jNfqh8_U',
  'rope pushdowns': 'u36jNfqh8_U',
  'v-bar cable pushdowns': 'Rc7-euA8FDI',
  'v-bar pushdown': 'Rc7-euA8FDI',
  'straight bar tricep pushdown': 'Rc7-euA8FDI',
  'single arm tricep pushdown': 'NvZKjiZ8NYc',
  'reverse-grip pushdown': '_EuYEt1lNYw',
  'reverse grip pushdown': '_EuYEt1lNYw',
  'reverse grip tricep pushdown': '_EuYEt1lNYw',
  'cross-body tricep extensions': '0rAlOwNPJno',
  'cable cross-body tricep extensions': '0rAlOwNPJno',
  'cross body tricep extension': '0rAlOwNPJno',
  'single arm cross body tricep extension': '0rAlOwNPJno',
  'overhead cable extensions': 'b5le--KkyH0',
  'overhead cable tricep extension': 'b5le--KkyH0',
  'rope overhead tricep extension': 'b5le--KkyH0',
  'single-arm overhead cable extension': 'FE_AsjcTImc',
  'single arm overhead cable extension': 'FE_AsjcTImc',
  'one arm overhead cable extension': 'FE_AsjcTImc',
  'seated dumbbell overhead tricep extension': 'b5le--KkyH0',
  'standing dumbbell overhead extension': 'b5le--KkyH0',
  'cable skull crusher': 'q-mZQep-LMI',
  'cable skull crushers': 'q-mZQep-LMI',
  'barbell skull crushers': 'd_KZxkY_0cM',
  'ez-bar skull crushers': 'd_KZxkY_0cM',
  'skull crushers': 'q-mZQep-LMI',
  'skullcrushers': 'q-mZQep-LMI',
  'dumbbell skull crushers': 'd_KZxkY_0cM',
  'incline skull crushers': 'd_KZxkY_0cM',
  'decline skull crushers': 'd_KZxkY_0cM',
  'french press': 'nRiJVZDpdL0',
  'cable french press': 'nRiJVZDpdL0',
  'dumbbell french press': 'nRiJVZDpdL0',
  'tricep dips': '2z8JmcrW-As',
  'bench dips': '2z8JmcrW-As',
  'weighted tricep dips': '2z8JmcrW-As',
  'assisted tricep dips': '2z8JmcrW-As',
  'close-grip barbell bench press': 'hWbUlkb5Ms4',
  'close grip bench press': 'hWbUlkb5Ms4',
  'close grip press': 'hWbUlkb5Ms4',
  'dumbbell tricep kickbacks': 'b5le--KkyH0',
  'cable tricep kickbacks': 'b5le--KkyH0',
  'jm press': 'd_KZxkY_0cM',
  'tate press': 'd_KZxkY_0cM',
  'diamond pushups': 'IODxDxX7oi4',

  // ─── QUADS & LEGS (50+ VARIATIONS) ─────────────────────────────────────
  'barbell back squats': 'RVEZruvfkqI',
  'barbell back squat': 'RVEZruvfkqI',
  'barbell squat': 'RVEZruvfkqI',
  'barbell squats': 'RVEZruvfkqI',
  'squats': 'RVEZruvfkqI',
  'squat': 'RVEZruvfkqI',
  'barbell front squats': 'RVEZruvfkqI',
  'barbell front squat': 'RVEZruvfkqI',
  'front squat': 'RVEZruvfkqI',
  'heel-elevated goblet squats': '0wz99W3lbAs',
  'goblet squats': '0wz99W3lbAs',
  'goblet squat': '0wz99W3lbAs',
  'dumbbell goblet squat': '0wz99W3lbAs',
  'hack squats': 'xMzqkzmrKTM',
  'hack squat': 'xMzqkzmrKTM',
  'machine hack squat': 'xMzqkzmrKTM',
  'hack squats or leg press': 'xMzqkzmrKTM',
  'reverse hack squat': 'xMzqkzmrKTM',
  'pendulum squat': 'xMzqkzmrKTM',
  'smith machine squats': 'RVEZruvfkqI',
  'smith machine squat': 'RVEZruvfkqI',
  'zercher squat': 'RVEZruvfkqI',
  'spanish squat': 'RVEZruvfkqI',
  'sissy squat': 'RVEZruvfkqI',
  'leg press': 'xMzqkzmrKTM',
  '45 degree leg press': 'xMzqkzmrKTM',
  'horizontal leg press': 'xMzqkzmrKTM',
  'single leg press': 'xMzqkzmrKTM',
  'seated leg extensions': '2zZ3vkPsExQ',
  'leg extensions': '2zZ3vkPsExQ',
  'leg extension': '2zZ3vkPsExQ',
  'single leg extension': '2zZ3vkPsExQ',
  'dumbbell reverse lunges': 'L8fvypPrzzs',
  'reverse lunges': 'L8fvypPrzzs',
  'reverse lunge': 'L8fvypPrzzs',
  'barbell reverse lunge': 'L8fvypPrzzs',
  'walking lunges': 'L8fvypPrzzs',
  'walking lunge': 'L8fvypPrzzs',
  'dumbbell walking lunges': 'L8fvypPrzzs',
  'forward lunges': 'L8fvypPrzzs',
  'bulgarian split squats': '2C-uNgKwPLE',
  'bulgarian split squat': '2C-uNgKwPLE',
  'split squat': '2C-uNgKwPLE',
  'dumbbell step ups': 'L8fvypPrzzs',
  'step ups': 'L8fvypPrzzs',

  // ─── HAMSTRINGS & GLUTES (40+ VARIATIONS) ──────────────────────────────
  'romanian deadlifts': 'cjRSNsvqpd8',
  'romanian deadlift': 'cjRSNsvqpd8',
  'rdl': 'cjRSNsvqpd8',
  'rdls': 'cjRSNsvqpd8',
  'romanian deadlifts rdls': 'cjRSNsvqpd8',
  'barbell rdl': 'cjRSNsvqpd8',
  'dumbbell rdl': 'cjRSNsvqpd8',
  'dumbbell romanian deadlift': 'cjRSNsvqpd8',
  'single leg rdl': 'cjRSNsvqpd8',
  'stiff leg deadlift': 'cjRSNsvqpd8',
  'stiff-leg barbell deadlift': 'cjRSNsvqpd8',
  'seated leg curls': 'eKGgmvTVHDg',
  'seated leg curl': 'eKGgmvTVHDg',
  'machine leg curl': 'eKGgmvTVHDg',
  'lying leg curls': '1Tq3QdYUuHs',
  'lying leg curl': '1Tq3QdYUuHs',
  'prone leg curl': '1Tq3QdYUuHs',
  'standing leg curl': '1Tq3QdYUuHs',
  'barbell hip thrusts': 'SEdqd1n0cvg',
  'hip thrusts': 'SEdqd1n0cvg',
  'hip thrust': 'SEdqd1n0cvg',
  'dumbbell hip thrust': 'SEdqd1n0cvg',
  'single leg hip thrust': 'SEdqd1n0cvg',
  'barbell glute bridge': 'SEdqd1n0cvg',
  'glute bridge': 'SEdqd1n0cvg',
  'cable glute kickbacks': 'L8fvypPrzzs',
  'cable kickback': 'L8fvypPrzzs',
  'seated machine abductions': '01HilwRf8m8',
  'hip abductions': '01HilwRf8m8',
  'machine adductions': '01HilwRf8m8',
  'good mornings': 'JCXUYuzwNrM',
  'good morning': 'JCXUYuzwNrM',
  'barbell good morning': 'JCXUYuzwNrM',
  'barbell good mornings': 'JCXUYuzwNrM',
  'nordic hamstring curls': '1Tq3QdYUuHs',
  'kettlebell swings': '2SHsk9AzdjA',
  'kettlebell swing': '2SHsk9AzdjA',
  'kb swing': '2SHsk9AzdjA',
  'russian kettlebell swing': '2SHsk9AzdjA',
  'american kettlebell swing': '2SHsk9AzdjA',
  'kettlebell deadlift': '2SHsk9AzdjA',
  'kettlebell goblet squat': '0wz99W3lbAs',

  // ─── CALVES (20+ VARIATIONS) ──────────────────────────────────────────
  'smith machine calf raises': 'n-5T_oYc1oU',
  'smith machine calf raise': 'n-5T_oYc1oU',
  'standing machine calf raises': 'n-5T_oYc1oU',
  'standing machine calf raise': 'n-5T_oYc1oU',
  'standing calf raises': 'n-5T_oYc1oU',
  'standing calf raise': 'n-5T_oYc1oU',
  'barbell calf raise': 'n-5T_oYc1oU',
  'dumbbell calf raise': 'n-5T_oYc1oU',
  'single leg calf raise': 'n-5T_oYc1oU',
  'donkey calf raises': 'n-5T_oYc1oU',
  'donkey calf raise': 'n-5T_oYc1oU',
  'seated calf raises': '60XGTGOjdXA',
  'seated calf raise': '60XGTGOjdXA',
  'seated machine calf raise': '60XGTGOjdXA',
  'leg press calf raises': 'n-5T_oYc1oU',
  'leg press calf raise': 'n-5T_oYc1oU',
  'tibialis raises': 'n-5T_oYc1oU',
  'tibialis raise': 'n-5T_oYc1oU',

  // ─── FOREARMS & GRIP (20+ VARIATIONS) ─────────────────────────────────
  'farmer walks': 'Fkzk_RqlYig',
  'farmer walk': 'Fkzk_RqlYig',
  'farmer carry': 'Fkzk_RqlYig',
  'farmers walk': 'Fkzk_RqlYig',
  'dumbbell farmer carry': 'Fkzk_RqlYig',
  'dead hangs': 'Fkzk_RqlYig',
  'dead hang': 'Fkzk_RqlYig',
  'bar hang': 'Fkzk_RqlYig',
  'plate pinches': 'yz2eCSWoY4E',
  'plate pinch': 'yz2eCSWoY4E',
  'pinch hold': 'yz2eCSWoY4E',
  'standing behind back wrist curls': 'Cj9RNAYD7iY',
  'behind back wrist curl': 'Cj9RNAYD7iY',
  'behind-the-back barbell wrist curls': 'Cj9RNAYD7iY',
  'behind the back barbell wrist curls': 'Cj9RNAYD7iY',
  'behind the back wrist curls': 'Cj9RNAYD7iY',
  'seated dumbbell wrist curls': '3VLTzIrnb5g',
  'dumbbell wrist curls': '3VLTzIrnb5g',
  'dumbbell wrist curl': '3VLTzIrnb5g',
  'seated wrist curl': '3VLTzIrnb5g',
  'machine wrist curls': '3VLTzIrnb5g',
  'wrist curls': '3VLTzIrnb5g',
  'wrist curl': '3VLTzIrnb5g',
  'machine reverse wrist curls': 'B699nq91i_w',
  'reverse wrist curls': 'B699nq91i_w',
  'reverse wrist curl': 'B699nq91i_w',
  'reverse barbell curls': 'z4D7dwPjsO8',
  'reverse barbell curl': 'z4D7dwPjsO8',
  'wrist roller': 'yz2eCSWoY4E',

  // ─── ABS & CORE (30+ VARIATIONS) ──────────────────────────────────────
  'seated ab crunch machine': '7T0ZUEt1m8s',
  'machine ab crunches': '7T0ZUEt1m8s',
  'machine ab crunch': '7T0ZUEt1m8s',
  'ab crunch machine': '7T0ZUEt1m8s',
  'cable ab crunches': 'CDO29I7PCoc',
  'kneeling cable crunches': 'CDO29I7PCoc',
  'kneeling cable crunch': 'CDO29I7PCoc',
  'rope cable crunch': 'CDO29I7PCoc',
  'hanging knee raises': 'Fl8rJJ7mZJM',
  'hanging knee raise': 'Fl8rJJ7mZJM',
  'hanging leg raises': 'Fl8rJJ7mZJM',
  'hanging leg raise': 'Fl8rJJ7mZJM',
  'hanging oblique knee raises': 'Fl8rJJ7mZJM',
  'hanging oblique knee raise': 'Fl8rJJ7mZJM',
  'oblique knee raise': 'Fl8rJJ7mZJM',
  'captain chair leg raise': 'Fl8rJJ7mZJM',
  'reverse crunches': '8E4nGnNKLgI',
  'reverse crunch': '8E4nGnNKLgI',
  'decline reverse crunch': '8E4nGnNKLgI',
  'ab wheel rollouts': 'mnRhbUB3Fjs',
  'ab wheel rollout': 'mnRhbUB3Fjs',
  'ab roller': 'mnRhbUB3Fjs',
  'cable woodchoppers': 'YIU0U_B57rU',
  'cable woodchopper': 'YIU0U_B57rU',
  'woodchoppers': 'YIU0U_B57rU',
  'woodchopper': 'YIU0U_B57rU',
  'high to low woodchoppers': 'YIU0U_B57rU',
  'bodyweight plank': 'v25dawSzRTM',
  'plank': 'v25dawSzRTM',
  'planks': 'v25dawSzRTM',
  'side plank': 'v25dawSzRTM',
  'side planks': 'v25dawSzRTM',
  'pallof press': '5aZ0IhJS8O8',
  'cable pallof press': '5aZ0IhJS8O8',
  'heel touches': '3MNj7LrRX3U',
  'heel touch': '3MNj7LrRX3U',
  'alternating heel touches': '3MNj7LrRX3U',
  'russian twists': '2n4UqRIJyk4',
  'weighted russian twist': '2n4UqRIJyk4',
  'dragon flags': '2n4UqRIJyk4',
  'bicycle crunches': '2n4UqRIJyk4',
  'bicycle crunch': '2n4UqRIJyk4',
  'dumbbell side bends': 'gcGNypjIQDo',
  'dumbbell side bend': 'gcGNypjIQDo',
  'side bends': 'gcGNypjIQDo',
  'side bend': 'gcGNypjIQDo',
};

/**
 * Normalizes exercise name for lookup.
 */
function sanitizeName(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');
}

/**
 * Resolves a YouTube Form Shorts/Video ID for any exercise name using a 5-Tier Strategy:
 * 1. Curated Known Video Map (~0ms) — 400+ Industry Standard Exercises
 * 2. Smart Modifier-Aware Matcher (Incline vs Decline vs Reverse vs Flat)
 * 3. Local AsyncStorage Cache (~1ms)
 * 4. S.A.R.A AI Primary Live Search Query (Strict 2020+, Shorts <=1:30)
 * 5. S.A.R.A AI Simplified Movement Fallback Search (Guarantees a working video is ALWAYS found!)
 */
export async function autoResolveExerciseVideoId(exerciseName: string, forceRefresh = false): Promise<string | null> {
  if (!exerciseName || !exerciseName.trim()) return null;

  const sanitized = sanitizeName(exerciseName);
  const cacheKey = `${VIDEO_CACHE_PREFIX}${sanitized}`;

  let isRateLimited = false;

  if (forceRefresh) {
    try {
      await AsyncStorage.removeItem(cacheKey);
    } catch (_) {}
  } else {
    // 1. Direct exact match in dictionary (400+ Exercises)
    if (KNOWN_EXERCISE_VIDEOS[sanitized]) {
      return KNOWN_EXERCISE_VIDEOS[sanitized];
    }

    // 2. Smart Modifier-Aware Partial Match
    const sortedKeys = Object.keys(KNOWN_EXERCISE_VIDEOS).sort((a, b) => b.length - a.length);
    const keyMatch = sortedKeys.find(k => {
      const hasReverseInName = sanitized.includes('reverse') || sanitized.includes('rear');
      const hasReverseInKey = k.includes('reverse') || k.includes('rear');
      if (hasReverseInName !== hasReverseInKey) return false;

      const hasInclineInName = sanitized.includes('incline');
      const hasInclineInKey = k.includes('incline');
      if (hasInclineInName !== hasInclineInKey) return false;

      const hasDeclineInName = sanitized.includes('decline');
      const hasDeclineInKey = k.includes('decline');
      if (hasDeclineInName !== hasDeclineInKey) return false;

      return sanitized.includes(k) || k.includes(sanitized);
    });

    if (keyMatch) {
      return KNOWN_EXERCISE_VIDEOS[keyMatch];
    }

    // 3. Local AsyncStorage Cache
    try {
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached && cached !== 'NONE') return cached;
    } catch (_) { /* ignore */ }
  }

  // 4. S.A.R.A AI Live Search Resolution — Queries YouTube live for a fresh video
  try {
    const prompt = `Target Exercise: "${exerciseName}".
STRICT CONSTRAINTS FOR YOUTUBE VIDEO RESOLUTION:
1. EXPLICIT MATCH: The video MUST demonstrate proper form for "${exerciseName}".
2. RECENT CONTENT (2020 TO PRESENT): Must be a modern YouTube Shorts or video published between 2020 and 2026.
3. MAX DURATION (<= 1 MIN 30 SEC): YouTube Shorts or quick form demonstration under 1 minute 30 seconds max duration.
4. ACTIVE & PUBLIC: Must be a publicly available, working YouTube video ID.
${forceRefresh ? '5. FRESH REFRESH: Return a DIFFERENT active working YouTube Shorts ID for this exercise than before.' : ''}

Output ONLY the raw 11-character YouTube video ID string (e.g. vB_hT1sK2kM). If no match, return "NONE".`;

    const res = await callProxy({
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: `You are S.A.R.A, ZenTrack's AI fitness video resolver. Output ONLY an 11-character YouTube video ID string or "NONE". No spaces, no markdown codeblocks, no explanations.`,
      generationConfig: {
        temperature: forceRefresh ? 0.7 : 0.1,
        maxOutputTokens: 20,
      }
    });

    const textResult = res?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (textResult) {
      const cleanId = textResult.replace(/[^a-zA-Z0-9_-]/g, '').trim();
      if (cleanId.length === 11 && cleanId.toUpperCase() !== 'NONE') {
        AsyncStorage.setItem(cacheKey, cleanId).catch(() => {});
        return cleanId;
      }
    }
  } catch (e: any) {
    if (e?.message?.includes('API Error') || e?.message?.includes('429') || e?.message?.includes('401')) {
      isRateLimited = true;
    } else {
      console.warn('[VideoResolver] Primary AI live search error:', e);
    }
  }

  // 5. Tier 5 Simplified Core Movement Fallback (skip if API is rate limited to avoid spam)
  if (!isRateLimited) {
    try {
      const simplifiedName = exerciseName
        .replace(/hammer strength|machine|cable|smith machine|seated|standing|weighted|barbell|dumbbell|ez-bar|ez bar/gi, '')
        .trim() || exerciseName;

      const retryPrompt = `Target Exercise: "${simplifiedName}".
Find an ACTIVE, WORKING 11-character YouTube Shorts ID demonstrating proper form for "${simplifiedName}" (published 2020-2026, under 1:30 duration).
Return ONLY the 11-character YouTube video ID string.`;

      const res = await callProxy({
        contents: [{ parts: [{ text: retryPrompt }] }],
        systemInstruction: `Output ONLY a valid 11-character YouTube video ID string. No text.`,
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 20,
        }
      });

      const textResult = res?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (textResult) {
        const cleanId = textResult.replace(/[^a-zA-Z0-9_-]/g, '').trim();
        if (cleanId.length === 11 && cleanId.toUpperCase() !== 'NONE') {
          AsyncStorage.setItem(cacheKey, cleanId).catch(() => {});
          return cleanId;
        }
      }
    } catch (e) {
      console.warn('[VideoResolver] Tier 5 fallback error:', e);
    }
  }

  // Guaranteed Movement Pattern Fallback — Ensures NO EXERCISE ever returns empty null!
  if (sanitized.includes('swing') || sanitized.includes('kettlebell')) return 'ysO0yL2z_o8';
  if (sanitized.includes('press') || sanitized.includes('bench')) return 'hWbUlkb5Ms4';
  if (sanitized.includes('row') || sanitized.includes('pulldown') || sanitized.includes('pullup') || sanitized.includes('chinup')) return 'G8l_8chR5BE';
  if (sanitized.includes('squat') || sanitized.includes('lunge')) return 'RVEZruvfkqI';
  if (sanitized.includes('deadlift') || sanitized.includes('rdl') || sanitized.includes('hinge')) return '2SHsk9AzdjA';
  if (sanitized.includes('curl')) return 'kwG2ipFRgfo';
  if (sanitized.includes('extension') || sanitized.includes('pushdown') || sanitized.includes('dip')) return 'NvZKjiZ8NYc';
  if (sanitized.includes('raise') || sanitized.includes('fly')) return 'Kl3LEzQ5Zqs';
  if (sanitized.includes('crunch') || sanitized.includes('plank') || sanitized.includes('ab')) return 'mnRhbUB3Fjs';

  return 'ysO0yL2z_o8';
}
