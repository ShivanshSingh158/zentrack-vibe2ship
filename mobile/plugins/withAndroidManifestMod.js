const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const DRAWABLES = {
  'shortcut_task.xml': `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="512"
    android:viewportHeight="512">
  <path
      android:fillColor="#FFFFFFFF"
      android:pathData="M256,48C141.31,48 48,141.31 48,256s93.31,208 208,208 208,-93.31 208,-208S370.69,48 256,48zM364.25,186.29l-134.4,160a16,16 0,0 1,-12 5.71h-0.41a16,16 0,0 1,-11.71,-5.09l-58,-60a16,16 0,0 1,23.15,-22.06l46.12,47.67 122.84,-146.24a16,16 0,1 1,24.41,20.01z"/>
</vector>`,
  'shortcut_attendance.xml': `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="512"
    android:viewportHeight="512">
  <path
      android:fillColor="#00000000"
      android:strokeColor="#FFFFFFFF"
      android:strokeWidth="32"
      android:strokeLineCap="round"
      android:strokeLineJoin="round"
      android:pathData="M384,48H128c-26.51,0 -48,21.49 -48,48v320c0,26.51 21.49,48 48,48h256c26.51,0 48,-21.49 48,-48V96C432,69.49 410.51,48 384,48z"/>
  <path
      android:fillColor="#00000000"
      android:strokeColor="#FFFFFFFF"
      android:strokeWidth="32"
      android:strokeLineCap="round"
      android:pathData="M208,112h96"/>
  <path
      android:fillColor="#00000000"
      android:strokeColor="#FFFFFFFF"
      android:strokeWidth="32"
      android:strokeLineCap="round"
      android:pathData="M256,224m-40,0a40,40 0,1 0,80 0a40,40 0,1 0,-80 0"/>
  <path
      android:fillColor="#00000000"
      android:strokeColor="#FFFFFFFF"
      android:strokeWidth="32"
      android:strokeLineCap="round"
      android:pathData="M336,368c0,-44.18 -35.82,-80 -80,-80s-80,35.82 -80,80"/>
</vector>`,
  'shortcut_gym.xml': `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
  <path
      android:fillColor="#FFFFFFFF"
      android:pathData="M17.5,7C15.57,7 14,8.57 14,10.5c0,0.24 0.03,0.47 0.07,0.7L11.5,13.77c-0.27,-0.17 -0.6,-0.27 -1,-0.27 -1.93,0 -3.5,1.57 -3.5,3.5s1.57,3.5 3.5,3.5H18c1.66,0 3,-1.34 3,-3 0,-0.65 -0.21,-1.25 -0.56,-1.73 0.35,-0.55 0.56,-1.21 0.56,-1.92 0,-0.62 -0.16,-1.2 -0.44,-1.69 0.28,-0.52 0.44,-1.12 0.44,-1.76C21,8.52 19.43,7 17.5,7zM10.5,15.5c0.83,0 1.5,0.67 1.5,1.5s-0.67,1.5 -1.5,1.5S9,17.83 9,17s0.67,-1.5 1.5,-1.5zM17.5,9c0.77,0 1.4,0.58 1.47,1.33 -0.31,-0.2 -0.68,-0.33 -1.08,-0.33h-1.86c-0.02,-0.16 -0.03,-0.33 -0.03,-0.5 0,-0.28 0.67,-0.5 1.5,-0.5zM17.89,12c0.61,0 1.11,0.5 1.11,1.11 0,0.61 -0.5,1.11 -1.11,1.11h-2.34l-0.78,-0.78 1.44,-1.44h1.68zM18,18.5h-4.11c0.07,-0.47 0.11,-0.97 0.11,-1.5 0,-0.26 -0.03,-0.52 -0.08,-0.78L16,16.22c0.55,0 1,0.45 1,1 0,0.56 -0.45,1 -1,1h-1v0.28H18c0.28,0 0.5,-0.22 0.5,-0.5 0,-0.28 -0.22,-0.5 -0.5,-0.5V17c0.55,0 1,0.45 1,1 0,0.28 -0.22,0.5 -0.5,0.5H18z"/>
</vector>`,
  'shortcut_notes.xml': `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="512"
    android:viewportHeight="512">
  <path
      android:fillColor="#00000000"
      android:strokeColor="#FFFFFFFF"
      android:strokeWidth="32"
      android:strokeLineCap="round"
      android:strokeLineJoin="round"
      android:pathData="M440,432H72c-22.09,0 -40,-17.91 -40,-40V120c0,-22.09 17.91,-40 40,-40h120c15.91,0 30.77,7.87 39.69,21.09L256,136h184c22.09,0 40,17.91 40,40v216C480,414.09 462.09,432 440,432z"/>
  <path
      android:fillColor="#00000000"
      android:strokeColor="#FFFFFFFF"
      android:strokeWidth="32"
      android:strokeLineCap="round"
      android:strokeLineJoin="round"
      android:pathData="M32,192h448"/>
</vector>`,
};

module.exports = function withAndroidManifestMod(config) {
  config = withAndroidManifest(config, async config => {
    let androidManifest = config.modResults.manifest;
    let application = androidManifest.application[0];
    
    if (!androidManifest.$['xmlns:tools']) {
        androidManifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }
    
    if (application.$['tools:replace']) {
      if (!application.$['tools:replace'].includes('android:appComponentFactory')) {
        application.$['tools:replace'] += ',android:appComponentFactory';
      }
    } else {
      application.$['tools:replace'] = 'android:appComponentFactory';
    }
    
    // Provide the value for the attribute we are replacing, otherwise manifest merger fails!
    application.$['android:appComponentFactory'] = 'androidx.core.app.CoreComponentFactory';
    
    return config;
  });

  config = withDangerousMod(config, [
    'android',
    async config => {
      const drawableDir = path.join(config.modRequest.platformProjectRoot, 'app/src/main/res/drawable');
      if (!fs.existsSync(drawableDir)) {
        fs.mkdirSync(drawableDir, { recursive: true });
      }
      for (const [filename, content] of Object.entries(DRAWABLES)) {
        const filePath = path.join(drawableDir, filename);
        fs.writeFileSync(filePath, content, 'utf8');
      }
      return config;
    },
  ]);

  return config;
};
