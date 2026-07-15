const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withAndroidManifestMod(config) {
  return withAndroidManifest(config, async config => {
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
};
